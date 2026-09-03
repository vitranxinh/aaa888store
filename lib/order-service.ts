import { randomUUID } from "crypto";
import { CashTxnType, OrderStatus, PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calculateCartTotals } from "@/lib/pos";
import { recalculateCustomerReceivableDebt } from "@/lib/debt-service";
import { runTransactionWithRetry } from "@/lib/transaction-retry";

type OrderPayload = {
  branchId: string;
  customerId: string;
  createdById: string;
  invoiceDate?: string;
  paymentMethod: PaymentMethod;
  paidAmount: number;
  orderDiscount: number;
  otherCharge: number;
  oldDebt?: number;
  note?: string;
  clientRequestId?: string;
  status: "DRAFT" | "COMPLETED" | "PARTIAL" | "CANCELLED";
  items: Array<{ productId: string; quantity: number; unitPrice: number; discountValue: number }>;
};

type PerfSteps = Record<string, number>;

export type CreateOrderTiming = {
  requestReceivedMs?: number;
  validationMs?: number;
  loadItemsMs?: number;
  deriveStateMs?: number;
  codeGenMs?: number;
  transactionWaitMs?: number;
  transactionMs?: number;
  createOrderMs?: number;
  createOrderItemsMs?: number;
  inventoryValidationMs?: number;
  inventoryUpdateMs?: number;
  customerDebtUpdateMs?: number;
  cashTransactionMs?: number;
  cashAndDebtUpdateMs?: number;
  batchFetchMs?: number;
  batchPersistMs?: number;
  batchAllocationMs?: number;
  revalidateRedirectMs?: number;
  totalMs?: number;
};

async function measureStep<T>(steps: PerfSteps, key: string, task: () => Promise<T>) {
  const startedAt = Date.now();
  const result = await task();
  steps[key] = Date.now() - startedAt;
  return result;
}

let codeSequenceTableAvailable: boolean | undefined;

async function isCodeSequenceTableAvailable() {
  if (codeSequenceTableAvailable !== undefined) return codeSequenceTableAvailable;
  try {
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name = 'CodeSequence') AS "exists"
    `;
    codeSequenceTableAvailable = result[0]?.exists === true;
  } catch {
    codeSequenceTableAvailable = false;
  }
  return codeSequenceTableAvailable;
}

async function loadOrderPayloadItems(items: OrderPayload["items"]) {
  const productIds = Array.from(new Set(items.map(item => item.productId)));
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true, sku: true, costPrice: true, status: true }
  });
  const productMap = new Map(products.map(p => [p.id, p]));
  return items.map(item => {
    const product = productMap.get(item.productId);
    if (!product) throw new Error(`Không tìm thấy sản phẩm ${item.productId}`);
    if (product.status !== "ACTIVE") throw new Error(`Sản phẩm ${product.name} đã ẩn khỏi danh sách bán`);
    return { ...item, product };
  });
}

function parseVietnamDateTimeLocal(value?: string | null) {
  if (!value) return null;
  const trimmed = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(trimmed);
  if (!match) {
    const date = new Date(trimmed);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  const [, year, month, day, hour, minute, second = "0"] = match;
  const vietnamOffsetHours = 7;
  const date = new Date(Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour) - vietnamOffsetHours,
    Number(minute),
    Number(second)
  ));
  return Number.isNaN(date.getTime()) ? null : date;
}

function aggregateQuantityByProduct(items: Array<{ product: { id: string }; quantity: number }>) {
  const map = new Map<string, number>();
  for (const item of items) map.set(item.product.id, (map.get(item.product.id) ?? 0) + item.quantity);
  return map;
}

function assertEnoughInventory(
  items: Awaited<ReturnType<typeof loadOrderPayloadItems>>,
  inventories: Array<{ productId: string | null; quantity: number }>,
  derived: ReturnType<typeof calculateOrderDerivedState>
) {
  if (derived.finalStatus === "DRAFT") return;

  const requestedByProduct = aggregateQuantityByProduct(items);
  const availableByProduct = new Map<string, number>();
  for (const inventory of inventories) {
    if (!inventory.productId) continue;
    availableByProduct.set(inventory.productId, (availableByProduct.get(inventory.productId) ?? 0) + inventory.quantity);
  }

  const productNames = new Map(items.map((item) => [item.product.id, item.product.name]));
  const insufficientItems = Array.from(requestedByProduct.entries()).filter(([productId, requested]) => {
    const available = availableByProduct.get(productId) ?? 0;
    return available < requested;
  });

  if (insufficientItems.length === 0) return;

  const message = insufficientItems
    .map(([productId, requested]) => {
      const available = availableByProduct.get(productId) ?? 0;
      return `${productNames.get(productId) ?? productId} còn ${available}, cần ${requested}`;
    })
    .join("; ");

  throw new Error(`Không đủ tồn kho để bán: ${message}`);
}

async function assertInventoryTotalsNonNegative(
  tx: Prisma.TransactionClient,
  branchId: string,
  productIds: string[],
  productNameById: Map<string, string>
) {
  if (productIds.length === 0) return;

  const rows = await tx.inventory.findMany({
    where: {
      branchId,
      productId: { in: productIds },
      variantId: null
    },
    select: { productId: true, quantity: true }
  });
  const quantityByProduct = new Map<string, number>();
  for (const row of rows) {
    if (!row.productId) continue;
    quantityByProduct.set(row.productId, (quantityByProduct.get(row.productId) ?? 0) + row.quantity);
  }

  const negatives = productIds
    .map((productId) => ({ productId, quantity: quantityByProduct.get(productId) ?? 0 }))
    .filter((item) => item.quantity < 0);

  if (negatives.length > 0) {
    const detail = negatives
      .map((item) => `${productNameById.get(item.productId) ?? item.productId} còn ${item.quantity}`)
      .join("; ");
    throw new Error(`Tồn kho không được âm: ${detail}`);
  }
}

function calculateOrderDerivedState(items: Awaited<ReturnType<typeof loadOrderPayloadItems>>, payload: OrderPayload) {
  const totals = calculateCartTotals(
    items.map(item => ({
      productId: item.product.id, name: item.product.name, sku: item.product.sku,
      quantity: item.quantity, unitPrice: item.unitPrice, costPrice: Number(item.product.costPrice),
      discountValue: item.discountValue
    })),
    payload.orderDiscount
  );
  const grandTotal = Math.max(Number(totals.grandTotal) + payload.otherCharge, 0);
  const oldDebt = Number(payload.oldDebt ?? 0);
  const totalPayable = oldDebt + grandTotal;
  const paidAmount = Math.min(Math.max(Number(payload.paidAmount), 0), totalPayable);
  const debtAmount = Math.max(totalPayable - paidAmount, 0);
  const finalStatus: OrderStatus = payload.status === "DRAFT" ? "DRAFT" : debtAmount > 0 ? "PARTIAL" : "COMPLETED";
  return { totals, grandTotal, oldDebt, totalPayable, paidAmount, debtAmount, finalStatus };
}

async function revertOrderEffects(tx: Prisma.TransactionClient, order: {
  id: string; code: string; branchId: string; customerId: string; status: OrderStatus;
  grandTotal: Prisma.Decimal; paidAmount: Prisma.Decimal; debtAmount: Prisma.Decimal; items: Array<{ productId: string; quantity: number }>;
}) {
  if (order.status === "DRAFT") return;
  const saleTransactions = await tx.inventoryTransaction.findMany({
    where: { referenceCode: order.code, type: "SALE" },
    select: { id: true, batchId: true, productId: true, quantity: true }
  });
  const productIds = Array.from(new Set(order.items.map(i => i.productId)));
  const quantityByProduct = new Map<string, number>();
  order.items.forEach(i => quantityByProduct.set(i.productId, (quantityByProduct.get(i.productId) || 0) + i.quantity));
  const batchUpdates = saleTransactions.filter(t => t.batchId).map(t => ({ id: t.batchId!, quantity: Math.abs(Number(t.quantity)) }));
  const tasks: Promise<any>[] = [
    tx.$executeRaw`
      UPDATE "Inventory" SET "quantity" = "quantity" + (CASE "productId" ${Prisma.join(productIds.map(id => Prisma.sql`WHEN ${id} THEN ${quantityByProduct.get(id) || 0}`), " ")} ELSE 0 END)
      WHERE "branchId" = ${order.branchId} AND "variantId" IS NULL AND "productId" IN (${Prisma.join(productIds)})
    `,
    tx.customer.update({
      where: { id: order.customerId },
      data: {
        totalSpend: { decrement: order.grandTotal },
        loyaltyPoints: { decrement: Math.floor(Number(order.grandTotal) / 100000) }
      }
    }),
    tx.inventoryTransaction.deleteMany({ where: { referenceCode: order.code, type: "SALE" } }),
    tx.cashTransaction.deleteMany({ where: { orderId: order.id } })
  ];
  if (batchUpdates.length > 0) {
    tasks.push(tx.$executeRaw`
      UPDATE "ProductBatch" SET "quantity" = "quantity" + (CASE "id" ${Prisma.join(batchUpdates.map(b => Prisma.sql`WHEN ${b.id} THEN ${b.quantity}`), " ")} ELSE 0 END)
      WHERE "id" IN (${Prisma.join(batchUpdates.map(b => b.id))})
    `);
  }
  await Promise.all(tasks);
  await recalculateCustomerReceivableDebt(tx, order.customerId);
}

async function applyOrderEffects(
  tx: Prisma.TransactionClient,
  order: { id: string; code: string; branchId: string; createdById: string },
  payload: OrderPayload,
  items: Awaited<ReturnType<typeof loadOrderPayloadItems>>,
  derived: ReturnType<typeof calculateOrderDerivedState>,
  inventories: any[],
  batches: any[],
  receiptCode?: string | null
) {
  if (derived.finalStatus === "DRAFT") return;
  const quantityByProduct = aggregateQuantityByProduct(items);
  const productIds = Array.from(quantityByProduct.keys());
  const productNameById = new Map(items.map((item) => [item.product.id, item.product.name]));
  const inventoryRows = await tx.inventory.findMany({
    where: {
      branchId: order.branchId,
      productId: { in: productIds },
      variantId: null,
      quantity: { gt: 0 }
    },
    select: { id: true, productId: true, quantity: true },
    orderBy: { updatedAt: "desc" }
  });
  const inventoryRowsByProduct = new Map<string, Array<{ id: string; quantity: number }>>();
  for (const row of inventoryRows) {
    if (!row.productId) continue;
    const rows = inventoryRowsByProduct.get(row.productId) ?? [];
    rows.push({ id: row.id, quantity: row.quantity });
    inventoryRowsByProduct.set(row.productId, rows);
  }
  const inventoryRowUpdates: Array<{ id: string; productId: string; quantity: number }> = [];
  for (const [productId, requestedQuantity] of quantityByProduct.entries()) {
    let remaining = requestedQuantity;
    for (const row of inventoryRowsByProduct.get(productId) ?? []) {
      if (remaining <= 0) break;
      const used = Math.min(row.quantity, remaining);
      remaining -= used;
      inventoryRowUpdates.push({ id: row.id, productId, quantity: used });
    }

    if (remaining > 0) {
      const available = requestedQuantity - remaining;
      throw new Error(`Không đủ tồn kho để bán: ${productNameById.get(productId) ?? productId} còn ${available}, cần ${requestedQuantity}`);
    }
  }
  const batchUpdates: any[] = [];
  const invTxns: any[] = [];
  const batchesByProduct = new Map<string, any[]>();
  for (const b of batches) {
    const arr = batchesByProduct.get(b.productId) ?? [];
    arr.push(b);
    batchesByProduct.set(b.productId, arr);
  }
  for (const [productId, requestedQuantity] of quantityByProduct.entries()) {
    let remaining = requestedQuantity;
    const pBatches = batchesByProduct.get(productId) ?? [];
    for (const batch of pBatches) {
      if (remaining <= 0) break;
      const used = Math.min(batch.quantity, remaining);
      remaining -= used;
      batchUpdates.push({ id: batch.id, quantity: used });
      invTxns.push({
        branchId: order.branchId, productId, batchId: batch.id, type: "SALE",
        quantity: -used, referenceCode: order.code, createdById: order.createdById,
        note: `Xuất theo lô ${batch.batchNumber}`
      });
    }
    if (remaining > 0) {
      invTxns.push({
        branchId: order.branchId, productId, type: "SALE", quantity: -remaining,
        referenceCode: order.code, createdById: order.createdById, note: "Xuất phần tồn kho chưa gắn lô"
      });
    }
  }
  for (const update of inventoryRowUpdates) {
    const result = await tx.inventory.updateMany({
      where: {
        id: update.id,
        quantity: { gte: update.quantity }
      },
      data: {
        quantity: { decrement: update.quantity }
      }
    });

    if (result.count !== 1) {
      throw new Error(`Không đủ tồn kho để bán: ${productNameById.get(update.productId) ?? update.productId} vừa thay đổi tồn kho, vui lòng thử lại`);
    }
  }

  const writeTasks: Promise<any>[] = [
    tx.inventoryTransaction.createMany({ data: invTxns }),
    tx.customer.update({
      where: { id: payload.customerId },
      data: {
        totalSpend: { increment: derived.grandTotal },
        loyaltyPoints: { increment: Math.floor(derived.grandTotal / 100000) }
      }
    })
  ];
  if (batchUpdates.length > 0) {
    for (const batchUpdate of batchUpdates) {
      const result = await tx.productBatch.updateMany({
        where: {
          id: batchUpdate.id,
          quantity: { gte: batchUpdate.quantity }
        },
        data: {
          quantity: { decrement: batchUpdate.quantity }
        }
      });
      if (result.count !== 1) {
        throw new Error("Tồn lô vừa thay đổi, vui lòng thử lại.");
      }
    }
  }
  if (derived.paidAmount > 0) {
    const invoiceCreatedAt = parseVietnamDateTimeLocal(payload.invoiceDate);
    writeTasks.push(tx.cashTransaction.create({
      data: {
        code: receiptCode ?? "", branchId: order.branchId, type: CashTxnType.RECEIPT,
        amount: new Prisma.Decimal(derived.paidAmount), customerId: payload.customerId,
        orderId: order.id, createdById: order.createdById,
        note: payload.note ?? `Thu tiền cho hóa đơn ${order.code}`,
        ...(invoiceCreatedAt ? { createdAt: invoiceCreatedAt } : {})
      }
    }));
  }
  await Promise.all(writeTasks);
  await assertInventoryTotalsNonNegative(tx, order.branchId, productIds, productNameById);
  await recalculateCustomerReceivableDebt(tx, payload.customerId);
}

function nextOrderRevisionCode(currentCode: string) {
  const match = currentCode.match(/^(.*?)(?:\.(\d+))?$/);
  const baseCode = match?.[1] || currentCode;
  const currentRevision = Number(match?.[2] || 0);
  return `${baseCode}.${currentRevision + 1}`;
}

export async function updateOrderFromPayload(orderId: string, payload: OrderPayload) {
  const existing = await prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  if (!existing) throw new Error("Không tìm thấy hóa đơn");
  const payloadWithInvoiceDate: OrderPayload = {
    ...payload,
    invoiceDate: payload.invoiceDate || existing.createdAt.toISOString()
  };
  const [items, useCodeSequence] = await Promise.all([loadOrderPayloadItems(payload.items), isCodeSequenceTableAvailable()]);
  const derived = calculateOrderDerivedState(items, payload);
  const nextCodeVersion = nextOrderRevisionCode(existing.code);
  const receiptCode = derived.paidAmount > 0 ? await nextCode("PT", "cashTransaction", undefined, { useSequence: useCodeSequence }) : null;
  const quantityByProduct = aggregateQuantityByProduct(items);
  const productIds = Array.from(quantityByProduct.keys());

  return runTransactionWithRetry(async (tx) => {
    await revertOrderEffects(tx, existing as any);
    const [inventories, batches] = await Promise.all([
      tx.inventory.findMany({ where: { branchId: payload.branchId, productId: { in: productIds }, variantId: null }, select: { productId: true, quantity: true } }),
      tx.productBatch.findMany({ where: { branchId: payload.branchId, productId: { in: productIds }, quantity: { gt: 0 } }, orderBy: [{ productId: "asc" }, { expiryDate: "asc" }, { createdAt: "asc" }], select: { id: true, productId: true, batchNumber: true, quantity: true } })
    ]);
    assertEnoughInventory(items, inventories, derived);
    await tx.order.update({
      where: { id: orderId },
      data: {
        code: nextCodeVersion, branchId: payload.branchId, customerId: payload.customerId, createdById: payload.createdById,
        status: derived.finalStatus, subtotal: new Prisma.Decimal(derived.totals.subtotal),
        discountTotal: new Prisma.Decimal(derived.totals.itemDiscountTotal + payload.orderDiscount),
        otherCharge: new Prisma.Decimal(payload.otherCharge), grandTotal: new Prisma.Decimal(derived.grandTotal),
        oldDebtAmount: new Prisma.Decimal(derived.oldDebt),
        profitEstimate: new Prisma.Decimal(derived.totals.profitEstimate), paymentMethod: payload.paymentMethod,
        paidAmount: new Prisma.Decimal(derived.paidAmount), debtAmount: new Prisma.Decimal(derived.debtAmount),
        note: payload.note,
        items: {
          deleteMany: {},
          create: items.map(item => ({
            productId: item.product.id, quantity: item.quantity, unitPrice: new Prisma.Decimal(item.unitPrice),
            costPrice: item.product.costPrice, discountValue: new Prisma.Decimal(item.discountValue),
            total: new Prisma.Decimal(item.unitPrice * item.quantity - item.discountValue)
          }))
        }
      }
    });
    await applyOrderEffects(tx, { id: orderId, code: nextCodeVersion, branchId: payload.branchId, createdById: payload.createdById }, payloadWithInvoiceDate, items, derived, inventories, batches, receiptCode);
    return { id: orderId, code: nextCodeVersion };
  }, { maxWait: 20000, timeout: 60000 });
}

function isClientRequestUniqueConflict(error: unknown) {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === "P2002" &&
    Array.isArray(error.meta?.target) &&
    error.meta.target.includes("clientRequestId")
  );
}

export async function createOrderFromPayload(payload: OrderPayload): Promise<{ order: { id: string; code: string }; timing: CreateOrderTiming; duplicate?: boolean }> {
  const steps: PerfSteps = {};
  const totalStartedAt = Date.now();
  const clientRequestId = payload.clientRequestId?.trim() || null;
  if (clientRequestId) {
    const existingOrder = await prisma.order.findFirst({
      where: { clientRequestId },
      select: { id: true, code: true }
    });
    if (existingOrder) {
      return { order: existingOrder, timing: { totalMs: Date.now() - totalStartedAt }, duplicate: true };
    }
  }
  const [items, activeCustomer] = await Promise.all([
    measureStep(steps, "loadItemsMs", () => loadOrderPayloadItems(payload.items)),
    prisma.customer.findFirst({
      where: { id: payload.customerId, isActive: true },
      select: { id: true, receivableDebt: true }
    })
  ]);
  if (!activeCustomer) {
    throw new Error("Khách hàng đã ẩn khỏi danh sách bán, không thể tạo hóa đơn mới.");
  }
  const derived = calculateOrderDerivedState(items, payload);
  const invoiceCreatedAt = parseVietnamDateTimeLocal(payload.invoiceDate);
  const transactionQueuedAt = Date.now();
  let transactionStartedAt = 0;
  try {
    const { order, transactionSteps } = (await measureStep(steps, "transactionMs", () =>
      runTransactionWithRetry(async (tx: Prisma.TransactionClient) => {
        transactionStartedAt = Date.now();
        const tSteps: PerfSteps = {};
        const quantityByProduct = aggregateQuantityByProduct(items);
        const productIds = Array.from(quantityByProduct.keys());
        const orderId = randomUUID();

        const [inventories, batches] = await Promise.all([
          tx.inventory.findMany({ where: { branchId: payload.branchId, productId: { in: productIds }, variantId: null }, select: { productId: true, quantity: true } }),
          tx.productBatch.findMany({ where: { branchId: payload.branchId, productId: { in: productIds }, quantity: { gt: 0 } }, orderBy: [{ productId: "asc" }, { expiryDate: "asc" }, { createdAt: "asc" }], select: { id: true, productId: true, batchNumber: true, quantity: true } })
        ]);
        assertEnoughInventory(items, inventories, derived);

        const [realCode, realReceiptCode] = await Promise.all([
          nextCode("DH", "order", tx),
          derived.paidAmount > 0 ? nextCode("PT", "cashTransaction", tx) : Promise.resolve(null)
        ]);

        await tx.order.create({
          data: {
            id: orderId, code: realCode, branchId: payload.branchId, customerId: payload.customerId,
            ...(clientRequestId ? { clientRequestId } : {}),
            createdById: payload.createdById, status: derived.finalStatus,
            ...(invoiceCreatedAt ? { createdAt: invoiceCreatedAt } : {}),
            subtotal: new Prisma.Decimal(derived.totals.subtotal),
            discountTotal: new Prisma.Decimal(derived.totals.itemDiscountTotal + payload.orderDiscount),
            otherCharge: new Prisma.Decimal(payload.otherCharge), grandTotal: new Prisma.Decimal(derived.grandTotal),
            oldDebtAmount: new Prisma.Decimal(derived.oldDebt),
            profitEstimate: new Prisma.Decimal(derived.totals.profitEstimate), paymentMethod: payload.paymentMethod,
            paidAmount: new Prisma.Decimal(derived.paidAmount), debtAmount: new Prisma.Decimal(derived.debtAmount),
            note: payload.note,
            items: {
              create: items.map(item => ({
                productId: item.product.id, quantity: item.quantity, unitPrice: new Prisma.Decimal(item.unitPrice),
                costPrice: item.product.costPrice, discountValue: new Prisma.Decimal(item.discountValue),
                total: new Prisma.Decimal(item.unitPrice * item.quantity - item.discountValue)
              }))
            }
          }
        });
        await applyOrderEffects(tx, { id: orderId, code: realCode, branchId: payload.branchId, createdById: payload.createdById }, payload, items, derived, inventories, batches, realReceiptCode);

        tSteps.transactionTotalMs = Date.now() - transactionStartedAt;
        return { order: { id: orderId, code: realCode }, transactionSteps: tSteps };
      }, { maxWait: 20000, timeout: 60000 }))) as { order: { id: string; code: string }; transactionSteps: PerfSteps };
    steps.transactionWaitMs = transactionStartedAt > 0 ? transactionStartedAt - transactionQueuedAt : 0;
    Object.assign(steps, transactionSteps);
    steps.totalMs = Date.now() - totalStartedAt;
    console.info("[perf][create-order]", { code: order.code, itemCount: items.length, total: `${steps.totalMs}ms`, db: `${steps.transactionMs}ms`, steps });
    return { order, timing: steps };
  } catch (error) {
    if (clientRequestId && isClientRequestUniqueConflict(error)) {
      const existingOrder = await prisma.order.findFirst({
        where: { clientRequestId },
        select: { id: true, code: true }
      });
      if (existingOrder) {
        return { order: existingOrder, timing: { ...steps, totalMs: Date.now() - totalStartedAt }, duplicate: true };
      }
    }
    throw error;
  }
}

type CodeModel = "order" | "purchaseOrder" | "cashTransaction" | "supplier" | "customer";
async function readNextCodeNumberFromExistingCodes(prefix: string, model: CodeModel, client: Prisma.TransactionClient | typeof prisma) {
  let row: { code: string } | null = null;
  const where = { code: { startsWith: prefix } };
  const select = { code: true };
  const orderBy = { code: "desc" as const };
  if (model === "order") row = await client.order.findFirst({ where, select, orderBy });
  else if (model === "purchaseOrder") row = await client.purchaseOrder.findFirst({ where, select, orderBy });
  else if (model === "cashTransaction") row = await client.cashTransaction.findFirst({ where, select, orderBy });
  else if (model === "supplier") row = await client.supplier.findFirst({ where, select, orderBy });
  else if (model === "customer") row = await client.customer.findFirst({ where, select, orderBy });
  return row ? (Number(row.code.slice(prefix.length)) || 0) + 1 : 1;
}

export async function nextCode(prefix: string, model: CodeModel, tx?: Prisma.TransactionClient, options: { useSequence?: boolean } = {}) {
  const client = tx || prisma;
  const useSequence = options.useSequence ?? true;
  if (!useSequence) {
    const nextValue = await readNextCodeNumberFromExistingCodes(prefix, model, client);
    return `${prefix}${String(nextValue).padStart(6, "0")}`;
  }
  const sequenceId = `${model}:${prefix}`;
  try {
    const sequence = await client.codeSequence.update({ where: { id: sequenceId }, data: { value: { increment: 1 } }, select: { value: true } });
    return `${prefix}${String(sequence.value).padStart(6, "0")}`;
  } catch {
    try {
      const nextValue = await readNextCodeNumberFromExistingCodes(prefix, model, client);
      const sequence = await client.codeSequence.upsert({
        where: { id: sequenceId },
        create: { id: sequenceId, prefix, model, value: nextValue },
        update: { value: { increment: 1 } },
        select: { value: true }
      });
      return `${prefix}${String(sequence.value).padStart(6, "0")}`;
    } catch {
      const nextValue = await readNextCodeNumberFromExistingCodes(prefix, model, client);
      return `${prefix}${String(nextValue).padStart(6, "0")}`;
    }
  }
}
