import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function recalculateCustomerReceivableDebt(tx: Prisma.TransactionClient, customerId: string) {
  const [customer, orders, standaloneCashTransactions] = await Promise.all([
    tx.customer.findUnique({
      where: { id: customerId },
      select: { openingDebt: true }
    }),
    tx.order.findMany({
      where: {
        customerId,
        status: { in: ["COMPLETED", "PARTIAL"] }
      },
      select: {
        id: true,
        createdAt: true,
        grandTotal: true,
        paidAmount: true,
        oldDebtAmount: true
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    }),
    tx.cashTransaction.findMany({
      where: {
        customerId,
        orderId: null,
        type: { in: ["RECEIPT", "PAYMENT"] }
      },
      select: {
        id: true,
        createdAt: true,
        type: true,
        amount: true
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    })
  ]);

  if (!customer) return;

  const events = [
    ...orders.map((order) => ({
      kind: "ORDER" as const,
      id: order.id,
      createdAt: order.createdAt,
      grandTotal: Number(order.grandTotal ?? 0),
      paidAmount: Number(order.paidAmount ?? 0),
      oldDebtAmount: Number(order.oldDebtAmount ?? 0)
    })),
    ...standaloneCashTransactions.map((txn) => ({
      kind: "CASH" as const,
      id: txn.id,
      createdAt: txn.createdAt,
      type: txn.type,
      amount: Number(txn.amount ?? 0)
    }))
  ].sort((a, b) => {
    const timeDelta = a.createdAt.getTime() - b.createdAt.getTime();
    return timeDelta !== 0 ? timeDelta : a.id.localeCompare(b.id);
  });

  let receivableDebt = Number(customer.openingDebt ?? 0);
  for (const event of events) {
    if (event.kind === "ORDER") {
      if (event.oldDebtAmount > 0) {
        receivableDebt = Math.max(receivableDebt, event.oldDebtAmount);
      }
      receivableDebt += event.grandTotal - event.paidAmount;
      continue;
    }

    if (event.type === "RECEIPT") {
      receivableDebt -= event.amount;
    } else if (event.type === "PAYMENT") {
      receivableDebt += event.amount;
    }
  }

  await tx.customer.update({
    where: { id: customerId },
    data: {
      receivableDebt
    }
  });
}

export async function recalculateCustomerReceivableDebtForCustomer(customerId: string) {
  return prisma.$transaction((tx) => recalculateCustomerReceivableDebt(tx, customerId));
}

export async function recalculateSupplierPayableDebt(tx: Prisma.TransactionClient, supplierId: string) {
  const [supplier, purchaseAggregate, standalonePaymentAggregate] = await Promise.all([
    tx.supplier.findUnique({
      where: { id: supplierId },
      select: { openingDebt: true }
    }),
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

  if (!supplier) return;

  const openingDebt = Number(supplier.openingDebt ?? 0);
  const purchaseDebt = Number(purchaseAggregate._sum.debtAmount ?? 0);
  const standalonePayment = Number(standalonePaymentAggregate._sum.amount ?? 0);

  await tx.supplier.update({
    where: { id: supplierId },
    data: {
      payableDebt: Math.max(openingDebt + purchaseDebt - standalonePayment, 0)
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
      paidAmount: true,
      debtAmount: true,
      oldDebtAmount: true,
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

  const oldDebt = Math.max(Number(order.oldDebtAmount ?? 0), 0);
  const totalPayable = oldDebt + Number(order.grandTotal);
  const paidAmount = Math.min(Number(aggregate._sum.amount ?? 0), totalPayable);
  const debtAmount = Math.max(totalPayable - paidAmount, 0);
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

export async function recalculateOrderPaymentStateForOrder(orderId: string) {
  return prisma.$transaction((tx) => recalculateOrderPaymentState(tx, orderId));
}

export async function recalculatePurchasePaymentStateForPurchase(purchaseOrderId: string) {
  return prisma.$transaction((tx) => recalculatePurchasePaymentState(tx, purchaseOrderId));
}
