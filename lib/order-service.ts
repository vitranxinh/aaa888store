import { CashTxnType, OrderStatus, PaymentMethod, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { buildOrderCode, calculateCartTotals } from "@/lib/pos";

export async function allocateBatchesFEFO(branchId: string, productId: string, quantity: number, referenceCode: string, createdById: string) {
  const batches = await prisma.productBatch.findMany({
    where: { branchId, productId, quantity: { gt: 0 } },
    orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }]
  });

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
    throw new Error("Không đủ tồn theo lô để xuất bán.");
  }
}

export async function createOrderFromPayload(payload: {
  branchId: string;
  customerId: string;
  createdById: string;
  paymentMethod: PaymentMethod;
  paidAmount: number;
  orderDiscount: number;
  note?: string;
  status: "DRAFT" | "COMPLETED" | "PARTIAL" | "CANCELLED";
  items: Array<{ productId: string; quantity: number; unitPrice: number; discountValue: number }>;
}) {
  const items = await Promise.all(
    payload.items.map(async (item) => {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (!product) throw new Error(`Không tìm thấy sản phẩm ${item.productId}`);
      return { ...item, product };
    })
  );

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

  const count = await prisma.order.count();
  const code = buildOrderCode(count);
  const paidAmount = payload.paidAmount;
  const debtAmount = Math.max(totals.grandTotal - paidAmount, 0);
  const finalStatus = payload.status === "DRAFT" ? "DRAFT" : debtAmount > 0 ? "PARTIAL" : "COMPLETED";

  const order = await prisma.$transaction(async (tx) => {
    const created = await tx.order.create({
      data: {
        code,
        branchId: payload.branchId,
        customerId: payload.customerId,
        createdById: payload.createdById,
        status: finalStatus,
        subtotal: new Prisma.Decimal(totals.subtotal),
        discountTotal: new Prisma.Decimal(totals.itemDiscountTotal + payload.orderDiscount),
        grandTotal: new Prisma.Decimal(totals.grandTotal),
        profitEstimate: new Prisma.Decimal(totals.profitEstimate),
        paymentMethod: payload.paymentMethod,
        paidAmount: new Prisma.Decimal(paidAmount),
        debtAmount: new Prisma.Decimal(debtAmount),
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

    if (finalStatus !== "DRAFT") {
      for (const item of items) {
        await tx.inventory.updateMany({
          where: { branchId: payload.branchId, productId: item.product.id },
          data: { quantity: { decrement: item.quantity } }
        });
      }

      if (paidAmount > 0) {
        await tx.cashTransaction.create({
          data: {
            code: await nextCode("PT", "cashTransaction"),
            branchId: payload.branchId,
            type: CashTxnType.RECEIPT,
            amount: new Prisma.Decimal(paidAmount),
            customerId: payload.customerId,
            orderId: created.id,
            createdById: payload.createdById,
            note: payload.note ?? `Thu tiền cho hóa đơn ${code}`
          }
        });
      }

      await tx.customer.update({
        where: { id: payload.customerId },
        data: {
          totalSpend: { increment: totals.grandTotal },
          receivableDebt: { increment: debtAmount },
          loyaltyPoints: { increment: Math.floor(totals.grandTotal / 100000) }
        }
      });
    }

    return created;
  });

  if (finalStatus !== "DRAFT") {
    for (const item of items) {
      await allocateBatchesFEFO(payload.branchId, item.product.id, item.quantity, code, payload.createdById);
    }
  }

  return order;
}

export async function nextCode(prefix: string, model: "order" | "purchaseOrder" | "cashTransaction" | "supplier" | "customer") {
  let rows: Array<{ code: string }> = [];
  switch (model) {
    case "order":
      rows = await prisma.order.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } });
      break;
    case "purchaseOrder":
      rows = await prisma.purchaseOrder.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } });
      break;
    case "cashTransaction":
      rows = await prisma.cashTransaction.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } });
      break;
    case "supplier":
      rows = await prisma.supplier.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } });
      break;
    case "customer":
      rows = await prisma.customer.findMany({ where: { code: { startsWith: prefix } }, select: { code: true } });
      break;
  }
  let max = 0;
  for (const row of rows) {
    const num = Number(row.code.slice(prefix.length));
    if (!Number.isNaN(num)) max = Math.max(max, num);
  }
  return `${prefix}${String(max + 1).padStart(6, "0")}`;
}
