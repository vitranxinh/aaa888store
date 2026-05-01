import { CashTxnType, OrderStatus, PaymentMethod, Prisma } from "@prisma/client";
import { recalculateCustomerReceivableDebtForCustomer } from "@/lib/debt-service";
import { prisma } from "@/lib/prisma";
import { calculateCartTotals } from "@/lib/pos";

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

async function loadOrderPayloadItems(items: OrderPayload["items"]) {
  const productIds = Array.from(new Set(items.map((item) => item.productId)));
  const products = await prisma.product.findMany({
    where: { id: { in: productIds } }
  });
  const productMap = new Map(products.map((product) => [product.id, product]));

  return items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) throw new Error(`Không tìm thấy sản phẩm ${item.productId}`);
    return { ...item, product };
  });
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

  const grandTotal = Math.max(totals.grandTotal + payload.otherCharge, 0);
  const paidAmount = payload.paidAmount;
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

async function ensureInventorySufficient(tx: Prisma.TransactionClient, branchId: string, items: Awaited<ReturnType<typeof loadOrderPayloadItems>>) {
  const productIds = items.map((item) => item.product.id);
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

  const inventoryMap = new Map(inventories.map((inventory) => [inventory.productId, inventory.quantity]));

  for (const item of items) {
    const quantity = inventoryMap.get(item.product.id) ?? 0;
    if (quantity < item.quantity) {
      throw new Error(`Tồn kho không đủ cho ${item.product.name}`);
    }
  }
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
          data: { quantity: { increment: Math.abs(txn.quantity) } }
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
  receiptCode?: string | null
) {
  if (derived.finalStatus === "DRAFT") {
    return;
  }

  await ensureInventorySufficient(tx, payload.branchId, items);

  await Promise.all(
    items.map((item) =>
      tx.inventory.updateMany({
        where: { branchId: payload.branchId, productId: item.product.id },
        data: { quantity: { decrement: item.quantity } }
      })
    )
  );

  await Promise.all([
    derived.paidAmount > 0
      ? tx.cashTransaction.create({
          data: {
            code: receiptCode ?? (await nextCode("PT", "cashTransaction")),
            branchId: payload.branchId,
            type: CashTxnType.RECEIPT,
            amount: new Prisma.Decimal(derived.paidAmount),
            customerId: payload.customerId,
            orderId: order.id,
            createdById: payload.createdById,
            note: payload.note ?? `Thu tiền cho hóa đơn ${order.code}`
          }
        })
      : Promise.resolve(),
    tx.customer.update({
      where: { id: payload.customerId },
      data: {
        totalSpend: { increment: derived.grandTotal },
        loyaltyPoints: { increment: Math.floor(derived.grandTotal / 100000) }
      }
    })
  ]);
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

export async function createOrderFromPayload(payload: OrderPayload) {
  const items = await loadOrderPayloadItems(payload.items);
  const derived = calculateOrderDerivedState(items, payload);
  const code = await nextCode("DH", "order");
  const receiptCode = derived.paidAmount > 0 ? await nextCode("PT", "cashTransaction") : null;

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
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
      }
    });

    await applyOrderEffects(tx, created, payload, items, derived, receiptCode);

    return created;
  }, { maxWait: 10000, timeout: 30000 });

  if (derived.finalStatus !== "DRAFT") {
    await recalculateCustomerReceivableDebtForCustomer(payload.customerId);
    for (const item of items) {
      await allocateBatchesFEFO(payload.branchId, item.product.id, item.quantity, code, payload.createdById);
    }
  }

  return order;
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

  const order = await prisma.$transaction(async (tx) => {
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
    for (const item of items) {
      await allocateBatchesFEFO(payload.branchId, item.product.id, item.quantity, nextCodeVersion, payload.createdById);
    }
  }

  return order;
}

export async function nextCode(prefix: string, model: "order" | "purchaseOrder" | "cashTransaction" | "supplier" | "customer") {
  let row: { code: string } | null = null;
  switch (model) {
    case "order":
      row = await prisma.order.findFirst({ where: { code: { startsWith: prefix } }, select: { code: true }, orderBy: { code: "desc" } });
      break;
    case "purchaseOrder":
      row = await prisma.purchaseOrder.findFirst({ where: { code: { startsWith: prefix } }, select: { code: true }, orderBy: { code: "desc" } });
      break;
    case "cashTransaction":
      row = await prisma.cashTransaction.findFirst({ where: { code: { startsWith: prefix } }, select: { code: true }, orderBy: { code: "desc" } });
      break;
    case "supplier":
      row = await prisma.supplier.findFirst({ where: { code: { startsWith: prefix } }, select: { code: true }, orderBy: { code: "desc" } });
      break;
    case "customer":
      row = await prisma.customer.findFirst({ where: { code: { startsWith: prefix } }, select: { code: true }, orderBy: { code: "desc" } });
      break;
  }
  const max = row ? Number(row.code.slice(prefix.length)) || 0 : 0;
  return `${prefix}${String(max + 1).padStart(6, "0")}`;
}
