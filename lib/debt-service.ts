import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function recalculateCustomerReceivableDebt(tx: Prisma.TransactionClient, customerId: string) {
  const [orderAggregate, standaloneReceiptAggregate] = await Promise.all([
    tx.order.aggregate({
      where: {
        customerId,
        status: { in: ["COMPLETED", "PARTIAL"] }
      },
      _sum: { debtAmount: true }
    }),
    tx.cashTransaction.aggregate({
      where: {
        customerId,
        type: "RECEIPT",
        orderId: null
      },
      _sum: { amount: true }
    })
  ]);

  const orderDebt = Number(orderAggregate._sum.debtAmount ?? 0);
  const standaloneReceipt = Number(standaloneReceiptAggregate._sum.amount ?? 0);

  await tx.customer.update({
    where: { id: customerId },
    data: {
      receivableDebt: Math.max(orderDebt - standaloneReceipt, 0)
    }
  });
}

export async function recalculateCustomerReceivableDebtForCustomer(customerId: string) {
  return prisma.$transaction((tx) => recalculateCustomerReceivableDebt(tx, customerId));
}

export async function recalculateSupplierPayableDebt(tx: Prisma.TransactionClient, supplierId: string) {
  const [purchaseAggregate, standalonePaymentAggregate] = await Promise.all([
    tx.purchaseOrder.aggregate({
      where: {
        supplierId,
        status: { in: ["COMPLETED", "PARTIAL"] }
      },
      _sum: { debtAmount: true }
    }),
    tx.cashTransaction.aggregate({
      where: {
        supplierId,
        type: "PAYMENT",
        purchaseOrderId: null
      },
      _sum: { amount: true }
    })
  ]);

  const purchaseDebt = Number(purchaseAggregate._sum.debtAmount ?? 0);
  const standalonePayment = Number(standalonePaymentAggregate._sum.amount ?? 0);

  await tx.supplier.update({
    where: { id: supplierId },
    data: {
      payableDebt: Math.max(purchaseDebt - standalonePayment, 0)
    }
  });
}

export async function recalculateSupplierPayableDebtForSupplier(supplierId: string) {
  return prisma.$transaction((tx) => recalculateSupplierPayableDebt(tx, supplierId));
}

export async function recalculateOrderPaymentState(tx: Prisma.TransactionClient, orderId: string) {
  const order = await tx.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      status: true,
      grandTotal: true,
      customerId: true
    }
  });

  if (!order) return;

  const aggregate = await tx.cashTransaction.aggregate({
    where: {
      orderId,
      type: "RECEIPT"
    },
    _sum: { amount: true }
  });

  const paidAmount = Math.min(Number(aggregate._sum.amount ?? 0), Number(order.grandTotal));
  const debtAmount = Math.max(Number(order.grandTotal) - paidAmount, 0);
  const nextStatus =
    order.status === "DRAFT" || order.status === "CANCELLED"
      ? order.status
      : debtAmount > 0
        ? "PARTIAL"
        : "COMPLETED";

  await tx.order.update({
    where: { id: orderId },
    data: {
      paidAmount,
      debtAmount,
      status: nextStatus
    }
  });

  await recalculateCustomerReceivableDebt(tx, order.customerId);
}

export async function recalculatePurchasePaymentState(tx: Prisma.TransactionClient, purchaseOrderId: string) {
  const purchase = await tx.purchaseOrder.findUnique({
    where: { id: purchaseOrderId },
    select: {
      id: true,
      status: true,
      totalAmount: true,
      supplierId: true
    }
  });

  if (!purchase) return;

  const aggregate = await tx.cashTransaction.aggregate({
    where: {
      purchaseOrderId,
      type: "PAYMENT"
    },
    _sum: { amount: true }
  });

  const paidAmount = Math.min(Number(aggregate._sum.amount ?? 0), Number(purchase.totalAmount));
  const debtAmount = Math.max(Number(purchase.totalAmount) - paidAmount, 0);
  const nextStatus =
    purchase.status === "DRAFT" || purchase.status === "CANCELLED"
      ? purchase.status
      : debtAmount > 0
        ? "PARTIAL"
        : "COMPLETED";

  await tx.purchaseOrder.update({
    where: { id: purchaseOrderId },
    data: {
      paidAmount,
      debtAmount,
      status: nextStatus
    }
  });

  await recalculateSupplierPayableDebt(tx, purchase.supplierId);
}
