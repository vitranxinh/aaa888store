import { CashTxnType, OrderStatus, PaymentMethod, Prisma } from "@prisma/client";
import { recalculateCustomerReceivableDebtForCustomer } from "@/lib/debt-service";
import { prisma } from "@/lib/prisma";
import { calculateCartTotals } from "@/lib/pos";
import { runTransactionWithRetry } from "@/lib/transaction-retry";

type OrderPayload = {
  branchId: string;
  customerId: string;
  createdById: string;
  paymentMethod: PaymentMethod;
  paidAmount: number;
  orderDiscount: number;
  otherCharge: number;
  note?: string;
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
  if (codeSequenceTableAvailable !== undefined) {
    return codeSequenceTableAvailable;
  }

  try {
    const result = await prisma.$queryRaw<Array<{ exists: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'CodeSequence'
      ) AS "exists"
    `;
    codeSequenceTableAvailable = result[0]?.exists === true;
  } catch {
    codeSequenceTableAvailable = false;
  }

  return codeSequenceTableAvailable;
}

async function loadOrderPayloadItems(items: OrderPayload["items"]) {
  const productIds = Array.from(new Set(items.map((item: { productId: string }) => item.productId)));
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } },
    select: {
      id: true,
      name: true,
      sku: true,
      costPrice: true
    }
  });
  
  type ProductType = { id: string; name: string; sku: string; costPrice: Prisma.Decimal };
  const productMap = new Map<string, ProductType>(
    products.map((product: ProductType) => [product.id, product])
  );

  return items.map((item: OrderPayload["items"][number]) => {
    const product = productMap.get(item.productId);
    if (!product) throw new Error(`Không tìm thấy sản phẩm ${item.productId}`);
    return { ...item, product: product as ProductType };
  });
}

function aggregateQuantityByProduct(items: Array<{ product: { id: string }; quantity: number }>) {
  const quantityByProduct = new Map<string, number>();

  for (const item of items) {
    quantityByProduct.set(item.product.id, (quantityByProduct.get(item.product.id) ?? 0) + item.quantity);
  }

  return quantityByProduct;
}

function calculateOrderDerivedState(items: Awaited<ReturnType<typeof loadOrderPayloadItems>>, payload: OrderPayload) {
  const totals = calculateCartTotals(
    items.map((item) => ({
      productId: item.product.id,
      name: item.product.name,
      sku: item.product.sku,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      costPrice: Number(item.product.costPrice),
      discountValue: item.discountValue
    })),
    payload.orderDiscount
  );

  const grandTotal = Math.max(Number(totals.grandTotal) + payload.otherCharge, 0);
  const paidAmount = Number(payload.paidAmount);
  const debtAmount = Math.max(grandTotal - paidAmount, 0);
  const finalStatus: OrderStatus = payload.status === "DRAFT" ? "DRAFT" : debtAmount > 0 ? "PARTIAL" : "COMPLETED";

  return {
    totals,
    grandTotal,
    paidAmount,
    debtAmount,
    finalStatus
  };
}

async function ensureInventorySufficientFast(
  tx: Prisma.TransactionClient,
  branchId: string,
  items: Awaited<ReturnType<typeof loadOrderPayloadItems>>
) {
  const quantityByProduct = aggregateQuantityByProduct(items);
  const productIds = Array.from(quantityByProduct.keys());
  const inventories = await tx.inventory.findMany({
    where: {
      branchId,
      productId: { in: productIds }
    },
    select: {
      productId: true,
      quantity: true
    }
  });

  const inventoryMap = new Map(
    inventories.map((inventory: { productId: string | null; quantity: number }) => [
      inventory.productId,
      inventory.quantity
    ])
  );
  const productNameById = new Map(items.map((item) => [item.product.id, item.product.name]));

  for (const [productId, requiredQuantity] of quantityByProduct.entries()) {
    const quantity = inventoryMap.get(productId) ?? 0;
    if (quantity < requiredQuantity) {
      throw new Error(`Tồn kho không đủ cho ${productNameById.get(productId) ?? productId}`);
    }
  }

  return inventories;
}

async function applyInventoryQuantityChanges(
  tx: Prisma.TransactionClient,
  branchId: string,
  quantityByProduct: Map<string, number>,
  direction: "increment" | "decrement",
  existingInventories?: Array<{ productId: string | null }>
) {
  const productIds = Array.from(quantityByProduct.keys());
  if (productIds.length === 0) return;

  const existingProductIds = new Set(
    (
      existingInventories ||
      (await tx.inventory.findMany({
        where: {
          branchId,
          variantId: null,
          productId: { in: productIds }
        },
        select: { productId: true }
      }))
    )
      .map((inventory: { productId: string | null }) => inventory.productId)
      .filter((productId: string | null): productId is string => Boolean(productId))
  );
  const missingProductIds = productIds.filter((productId: string) => !existingProductIds.has(productId));

  if (missingProductIds.length > 0) {
    await tx.inventory.createMany({
      data: missingProductIds.map((productId: string) => ({
        branchId,
        productId,
        quantity: 0
      })),
      skipDuplicates: true
    });
  }

  const caseClauses = Prisma.join(
    productIds.map((productId: string) => Prisma.sql`WHEN ${productId} THEN ${quantityByProduct.get(productId) ?? 0}`),
    " "
  );
  const directionSql = direction === "increment" ? Prisma.sql`+` : Prisma.sql`-`;

  await tx.$executeRaw`
    UPDATE "Inventory"
    SET "quantity" = "quantity" ${directionSql} (CASE "productId" ${caseClauses} ELSE 0 END)
    WHERE "branchId" = ${branchId}
      AND "variantId" IS NULL
      AND "productId" IN (${Prisma.join(productIds)})
  `;
}

async function revertOrderEffects(tx: Prisma.TransactionClient, order: {
  id: string;
  code: string;
  branchId: string;
  customerId: string;
  status: OrderStatus;
  grandTotal: Prisma.Decimal;
  items: Array<{ productId: string; quantity: number }>;
}) {
  const customer = await tx.customer.findUnique({
    where: { id: order.customerId },
    select: { totalSpend: true, loyaltyPoints: true }
  });

  const saleTransactions = await tx.inventoryTransaction.findMany({
    where: {
      referenceCode: order.code,
      type: "SALE"
    },
    select: {
      id: true,
      batchId: true,
      quantity: true
    }
  });

  if (order.status !== "DRAFT") {
    for (const item of order.items) {
      await tx.inventory.updateMany({
        where: { branchId: order.branchId, productId: item.productId },
        data: { quantity: { increment: item.quantity } }
      });
    }

    for (const txn of saleTransactions) {
      if (txn.batchId) {
        await tx.productBatch.update({
          where: { id: txn.batchId },
          data: { quantity: { increment: Math.abs(txn.quantity as number) } }
        });
      }
    }

    if (customer) {
      await tx.customer.update({
        where: { id: order.customerId },
        data: {
          totalSpend: new Prisma.Decimal(Math.max(Number(customer.totalSpend) - Number(order.grandTotal), 0)),
          loyaltyPoints: Math.max(customer.loyaltyPoints - Math.floor(Number(order.grandTotal) / 100000), 0)
        }
      });
    }
  }

  await tx.inventoryTransaction.deleteMany({
    where: {
      referenceCode: order.code,
      type: "SALE"
    }
  });

  await tx.cashTransaction.deleteMany({
    where: { orderId: order.id }
  });
}

async function applyOrderEffects(
  tx: Prisma.TransactionClient,
  order: { id: string; code: string },
  payload: OrderPayload,
  items: Awaited<ReturnType<typeof loadOrderPayloadItems>>,
  derived: ReturnType<typeof calculateOrderDerivedState>,
  receiptCode?: string | null,
  steps?: PerfSteps
) {
  if (derived.finalStatus === "DRAFT") {
    return;
  }

  const inventories = await measureStep(steps ?? {}, "inventoryValidationMs", () =>
    ensureInventorySufficientFast(tx, payload.branchId, items)
  );

  const quantityByProduct = aggregateQuantityByProduct(items);
  await measureStep(steps ?? {}, "inventoryUpdateMs", () =>
    applyInventoryQuantityChanges(tx, payload.branchId, quantityByProduct, "decrement", inventories)
  );

  await measureStep(steps ?? {}, "cashAndDebtUpdateMs", async () => {
    if (derived.paidAmount > 0) {
      await measureStep(steps ?? {}, "cashTransactionMs", () =>
        tx.cashTransaction.create({
          data: {
            code: receiptCode ?? "",
            branchId: payload.branchId,
            type: CashTxnType.RECEIPT,
            amount: new Prisma.Decimal(derived.paidAmount),
            customerId: payload.customerId,
            orderId: order.id,
            createdById: payload.createdById,
            note: payload.note ?? `Thu tiền cho hóa đơn ${order.code}`
          }
        }).then(() => undefined)
      );
    }

    await measureStep(steps ?? {}, "customerDebtUpdateMs", () =>
      tx.customer.update({
        where: { id: payload.customerId },
        data: {
          totalSpend: { increment: derived.grandTotal },
          loyaltyPoints: { increment: Math.floor(derived.grandTotal / 100000) },
          receivableDebt: { increment: derived.debtAmount }
        }
      }).then(() => undefined)
    );
  });
}

async function allocateOrderBatchesFEFO(
  branchId: string,
  items: Awaited<ReturnType<typeof loadOrderPayloadItems>>,
  referenceCode: string,
  createdById: string,
  tx: Prisma.TransactionClient,
  steps?: PerfSteps
) {
  const quantityByProduct = aggregateQuantityByProduct(items);
  const productIds = Array.from(quantityByProduct.keys());
  if (productIds.length === 0) return;

  type BatchResult = { id: string; productId: string; batchNumber: string; quantity: number };
  const batches = await measureStep(steps ?? {}, "batchFetchMs", () =>
    tx.productBatch.findMany({
      where: { branchId, productId: { in: productIds }, quantity: { gt: 0 } },
      orderBy: [{ productId: "asc" }, { expiryDate: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        productId: true,
        batchNumber: true,
        quantity: true
      }
    }) as Promise<BatchResult[]>
  );

  const batchesByProduct = new Map<string, BatchResult[]>();
  for (const batch of batches as BatchResult[]) {
    const productBatches = batchesByProduct.get(batch.productId) ?? [];
    productBatches.push(batch);
    batchesByProduct.set(batch.productId, productBatches);
  }

  const batchUpdates: Array<{ id: string; quantity: number }> = [];
  const inventoryTransactions: Prisma.InventoryTransactionCreateManyInput[] = [];

  for (const [productId, requestedQuantity] of quantityByProduct.entries()) {
    let remaining = requestedQuantity;
    const productBatches = batchesByProduct.get(productId) ?? [];

    for (const batch of productBatches) {
      if (remaining <= 0) break;
      const used = Math.min(batch.quantity, remaining);
      remaining -= used;
      batchUpdates.push({ id: batch.id, quantity: used });
      inventoryTransactions.push({
        branchId,
        productId,
        batchId: batch.id,
        type: "SALE",
        quantity: -used,
        referenceCode,
        createdById,
        note: `Xuất theo lô ${batch.batchNumber}`
      });
    }

    if (remaining > 0) {
      inventoryTransactions.push({
        branchId,
        productId,
        type: "SALE",
        quantity: -remaining,
        referenceCode,
        createdById,
        note: "Xuất phần tồn kho chưa gắn lô"
      });
    }
  }

  await measureStep(steps ?? {}, "batchPersistMs", async () => {
    const persistTasks: Array<Promise<unknown>> = [];

    if (batchUpdates.length > 0) {
      const batchUpdateCaseClauses = Prisma.join(
        batchUpdates.map((batch) => Prisma.sql`WHEN ${batch.id} THEN ${batch.quantity}`),
        " "
      );

      persistTasks.push(tx.$executeRaw`
        UPDATE "ProductBatch"
        SET "quantity" = "quantity" - (CASE "id" ${batchUpdateCaseClauses} ELSE 0 END)
        WHERE "id" IN (${Prisma.join(batchUpdates.map((batch: { id: string }) => batch.id))})
      `);
    }

    if (inventoryTransactions.length > 0) {
      persistTasks.push(tx.inventoryTransaction.createMany({ data: inventoryTransactions }));
    }

    await Promise.all(persistTasks);
  });
}

export async function allocateBatchesFEFO(branchId: string, productId: string, quantity: number, referenceCode: string, createdById: string) {
  const batches = await prisma.productBatch.findMany({
    where: { branchId, productId, quantity: { gt: 0 } },
    orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }]
  });

  if (batches.length === 0) {
    await prisma.inventoryTransaction.create({
      data: {
        branchId,
        productId,
        type: "SALE",
        quantity: -quantity,
        referenceCode,
        createdById,
        note: "Xuất từ tồn kho chưa gắn lô"
      }
    });
    return;
  }

  let remaining = quantity;
  for (const batch of batches) {
    if (remaining <= 0) break;
    const used = Math.min(batch.quantity, remaining);
    remaining -= used;

    await prisma.productBatch.update({
      where: { id: batch.id },
      data: { quantity: { decrement: used } }
    });

    await prisma.inventoryTransaction.create({
      data: {
        branchId,
        productId,
        batchId: batch.id,
        type: "SALE",
        quantity: -used,
        referenceCode,
        createdById,
        note: `Xuất theo lô ${batch.batchNumber}`
      }
    });
  }

  if (remaining > 0) {
    await prisma.inventoryTransaction.create({
      data: {
        branchId,
        productId,
        type: "SALE",
        quantity: -remaining,
        referenceCode,
        createdById,
        note: "Xuất phần tồn kho chưa gắn lô"
      }
    });
  }
}

export async function createOrderFromPayload(payload: OrderPayload): Promise<{ order: { id: string; code: string }; timing: CreateOrderTiming }> {
  const steps: PerfSteps = {};
  const totalStartedAt = Date.now();
  
  // 1. Chuẩn bị dữ liệu và tạo mã số BÊN NGOÀI transaction (Tối ưu cho Neon/Serverless)
  const [items, useCodeSequence] = await Promise.all([
    measureStep(steps, "loadItemsMs", () => loadOrderPayloadItems(payload.items)),
    measureStep(steps, "codeSequenceCheckMs", () => isCodeSequenceTableAvailable())
  ]);
  
  const derived = calculateOrderDerivedState(items, payload);
  
  const [code, receiptCode] = await measureStep(steps, "codeGenMs", () =>
    Promise.all([
      nextCode("DH", "order", undefined, { useSequence: useCodeSequence }),
      derived.paidAmount > 0
        ? nextCode("PT", "cashTransaction", undefined, { useSequence: useCodeSequence })
        : Promise.resolve(null)
    ])
  );

  const transactionQueuedAt = Date.now();
  let transactionStartedAt = 0;
  
  const { order, transactionSteps } = (await measureStep(steps, "transactionMs", () =>
    runTransactionWithRetry(async (tx: Prisma.TransactionClient) => {
      transactionStartedAt = Date.now();
      const tSteps: PerfSteps = {};

      // 2. Sử dụng NESTED CREATE để gộp tạo Đơn hàng và Items thành 1 query duy nhất
      const created = await measureStep(tSteps, "createOrderMs", () =>
        tx.order.create({
          data: {
            code,
            branchId: payload.branchId,
            customerId: payload.customerId,
            createdById: payload.createdById,
            status: derived.finalStatus,
            subtotal: new Prisma.Decimal(derived.totals.subtotal),
            discountTotal: new Prisma.Decimal(derived.totals.itemDiscountTotal + payload.orderDiscount),
            otherCharge: new Prisma.Decimal(payload.otherCharge),
            grandTotal: new Prisma.Decimal(derived.grandTotal),
            profitEstimate: new Prisma.Decimal(derived.totals.profitEstimate),
            paymentMethod: payload.paymentMethod,
            paidAmount: new Prisma.Decimal(derived.paidAmount),
            debtAmount: new Prisma.Decimal(derived.debtAmount),
            note: payload.note,
            items: {
              create: items.map((item) => ({
                productId: item.product.id,
                quantity: item.quantity,
                unitPrice: new Prisma.Decimal(item.unitPrice),
                costPrice: item.product.costPrice,
                discountValue: new Prisma.Decimal(item.discountValue),
                total: new Prisma.Decimal(item.unitPrice * item.quantity - item.discountValue)
              }))
            }
          },
          select: { id: true, code: true }
        })
      );

      // 3. Thực thi các tác vụ hậu cần song song bên trong transaction
      await measureStep(tSteps, "applyEffectsMs", async () => {
        if (derived.finalStatus === "DRAFT") return;
        const inventories = await ensureInventorySufficientFast(tx, payload.branchId, items);
        
        const asyncTasks: Promise<any>[] = [
          applyInventoryQuantityChanges(tx, payload.branchId, aggregateQuantityByProduct(items), "decrement", inventories),
          tx.customer.update({
            where: { id: payload.customerId },
            data: {
              totalSpend: { increment: derived.grandTotal },
              loyaltyPoints: { increment: Math.floor(derived.grandTotal / 100000) },
              receivableDebt: { increment: derived.debtAmount }
            }
          }),
          allocateOrderBatchesFEFO(payload.branchId, items, code, payload.createdById, tx, tSteps)
        ];

        if (derived.paidAmount > 0) {
          asyncTasks.push(tx.cashTransaction.create({
            data: {
              code: receiptCode ?? "",
              branchId: payload.branchId,
              type: CashTxnType.RECEIPT,
              amount: new Prisma.Decimal(derived.paidAmount),
              customerId: payload.customerId,
              orderId: created.id,
              createdById: payload.createdById,
              note: payload.note ?? `Thu tiền cho hóa đơn ${code}`
            }
          }));
        }

        await Promise.all(asyncTasks);
      });
      
      tSteps.transactionTotalMs = Date.now() - transactionStartedAt;
      return { order: created, transactionSteps: tSteps };
    }, { maxWait: 10000, timeout: 30000 }))) as { order: { id: string; code: string }; transactionSteps: PerfSteps };

  steps.transactionWaitMs = transactionStartedAt > 0 ? transactionStartedAt - transactionQueuedAt : 0;
  Object.assign(steps, transactionSteps);
  steps.totalMs = Date.now() - totalStartedAt;

  if (steps.totalMs > 1000) {
    console.info("[perf][create-order][slow]", { code, itemCount: items.length, ...steps });
  }

  return {
    order,
    timing: {
      loadItemsMs: steps.loadItemsMs,
      deriveStateMs: steps.deriveStateMs,
      codeGenMs: steps.codeGenMs,
      transactionWaitMs: steps.transactionWaitMs,
      transactionMs: steps.transactionMs,
      createOrderMs: steps.createOrderMs,
      createOrderItemsMs: steps.createOrderItemsMs,
      inventoryValidationMs: steps.inventoryValidationMs,
      inventoryUpdateMs: steps.inventoryUpdateMs,
      customerDebtUpdateMs: steps.customerDebtUpdateMs,
      cashTransactionMs: steps.cashTransactionMs,
      cashAndDebtUpdateMs: steps.cashAndDebtUpdateMs,
      batchFetchMs: steps.batchFetchMs,
      batchPersistMs: steps.batchPersistMs,
      batchAllocationMs: steps.batchAllocationMs,
      totalMs: steps.totalMs
    }
  };
}

function nextOrderRevisionCode(currentCode: string) {
  const match = currentCode.match(/^(.*?)(?:\.(\d+))?$/);
  const baseCode = match?.[1] || currentCode;
  const currentRevision = Number(match?.[2] || 0);
  return `${baseCode}.${currentRevision + 1}`;
}

export async function updateOrderFromPayload(orderId: string, payload: OrderPayload) {
  const existing = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true }
  });

  if (!existing) {
    throw new Error("Không tìm thấy hóa đơn");
  }

  const items = await loadOrderPayloadItems(payload.items);
  const derived = calculateOrderDerivedState(items, payload);
  const nextCodeVersion = nextOrderRevisionCode(existing.code);
  const receiptCode = derived.paidAmount > 0 ? await nextCode("PT", "cashTransaction") : null;

  const order = await runTransactionWithRetry(async (tx) => {
    await revertOrderEffects(tx, existing);

    const updated = await tx.order.update({
      where: { id: orderId },
      data: {
        code: nextCodeVersion,
        branchId: payload.branchId,
        customerId: payload.customerId,
        createdById: payload.createdById,
        status: derived.finalStatus,
        subtotal: new Prisma.Decimal(derived.totals.subtotal),
        discountTotal: new Prisma.Decimal(derived.totals.itemDiscountTotal + payload.orderDiscount),
        otherCharge: new Prisma.Decimal(payload.otherCharge),
        grandTotal: new Prisma.Decimal(derived.grandTotal),
        profitEstimate: new Prisma.Decimal(derived.totals.profitEstimate),
        paymentMethod: payload.paymentMethod,
        paidAmount: new Prisma.Decimal(derived.paidAmount),
        debtAmount: new Prisma.Decimal(derived.debtAmount),
        note: payload.note,
        items: {
          deleteMany: {},
          create: items.map((item) => ({
            productId: item.product.id,
            quantity: item.quantity,
            unitPrice: new Prisma.Decimal(item.unitPrice),
            costPrice: item.product.costPrice,
            discountValue: new Prisma.Decimal(item.discountValue),
            total: new Prisma.Decimal(item.unitPrice * item.quantity - item.discountValue)
          }))
        }
      }
    });

    await applyOrderEffects(tx, updated, payload, items, derived, receiptCode);

    return updated;
  }, { maxWait: 10000, timeout: 30000 });

  await recalculateCustomerReceivableDebtForCustomer(existing.customerId);
  if (payload.customerId !== existing.customerId) {
    await recalculateCustomerReceivableDebtForCustomer(payload.customerId);
  }

  if (derived.finalStatus !== "DRAFT") {
    await Promise.all(
      Array.from(aggregateQuantityByProduct(items).entries()).map(([productId, quantity]) =>
        allocateBatchesFEFO(payload.branchId, productId, quantity, nextCodeVersion, payload.createdById)
      )
    );
  }

  return order;
}

type CodeModel = "order" | "purchaseOrder" | "cashTransaction" | "supplier" | "customer";

async function readNextCodeNumberFromExistingCodes(
  prefix: string,
  model: CodeModel,
  client: Prisma.TransactionClient | typeof prisma
) {
  let row: { code: string } | null = null;

  switch (model) {
    case "order":
      row = await client.order.findFirst({
        where: { code: { startsWith: prefix } },
        select: { code: true },
        orderBy: { code: "desc" }
      });
      break;
    case "purchaseOrder":
      row = await client.purchaseOrder.findFirst({
        where: { code: { startsWith: prefix } },
        select: { code: true },
        orderBy: { code: "desc" }
      });
      break;
    case "cashTransaction":
      row = await client.cashTransaction.findFirst({
        where: { code: { startsWith: prefix } },
        select: { code: true },
        orderBy: { code: "desc" }
      });
      break;
    case "supplier":
      row = await client.supplier.findFirst({
        where: { code: { startsWith: prefix } },
        select: { code: true },
        orderBy: { code: "desc" }
      });
      break;
    case "customer":
      row = await client.customer.findFirst({
        where: { code: { startsWith: prefix } },
        select: { code: true },
        orderBy: { code: "desc" }
      });
      break;
  }

  return row ? Number(row.code.slice(prefix.length)) + 1 || 1 : 1;
}

function shouldUseLegacyCodeLookup(error: unknown) {
  const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
  return code === "P2021" || code === "P2022";
}

export async function nextCode(
  prefix: string,
  model: CodeModel,
  tx?: Prisma.TransactionClient,
  options: { useSequence?: boolean } = {}
) {
  const client = tx || prisma;
  const useSequence = options.useSequence ?? codeSequenceTableAvailable ?? !tx;

  if (!useSequence) {
    const nextValue = await readNextCodeNumberFromExistingCodes(prefix, model, client);
    return `${prefix}${String(nextValue).padStart(6, "0")}`;
  }

  const sequenceId = `${model}:${prefix}`;

  try {
    // Tối ưu: Update trực tiếp, nếu lỗi (không tồn tại) mới xử lý tạo mới
    const sequence = await client.codeSequence.update({
      where: { id: sequenceId },
      data: { value: { increment: 1 } },
      select: { value: true }
    });
    return `${prefix}${String(sequence.value).padStart(6, "0")}`;
  } catch (error) {
    if (shouldUseLegacyCodeLookup(error)) {
      codeSequenceTableAvailable = false;
      const nextValue = await readNextCodeNumberFromExistingCodes(prefix, model, client);
      return `${prefix}${String(nextValue).padStart(6, "0")}`;
    }
    
    // Nếu không tồn tại row trong CodeSequence, dùng upsert
    const nextValue = await readNextCodeNumberFromExistingCodes(prefix, model, client);
    const sequence = await client.codeSequence.upsert({
      where: { id: sequenceId },
      create: {
        id: sequenceId,
        prefix,
        model,
        value: nextValue
      },
      update: { value: { increment: 1 } },
      select: { value: true }
    });
    return `${prefix}${String(sequence.value).padStart(6, "0")}`;
  }
}
