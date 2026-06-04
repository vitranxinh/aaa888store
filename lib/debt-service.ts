import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function recalculateCustomerReceivableDebt(tx: Prisma.TransactionClient, customerId: string) {
  const [customer, orderAggregate, standaloneReceiptAggregate, customerPaymentAggregate] = await Promise.all([
    tx.customer.findUnique({
      where: { id: customerId },
      select: { openingDebt: true }
    }),
    tx.order.aggregate({
      where: {
        customerId,
        status: { in: ["COMPLETED", "PARTIAL"] }
      },
      _sum: { grandTotal: true, paidAmount: true }
    }),
    tx.cashTransaction.aggregate({
      where: {
        customerId,
        type: "RECEIPT",
        orderId: null
      },
      _sum: { amount: true }
    }),
    tx.cashTransaction.aggregate({
      where: {
        customerId,
        type: "PAYMENT"
      },
      _sum: { amount: true }
    })
  ]);

  if (!customer) return;

  const openingDebt = Number(customer.openingDebt ?? 0);
  const orderTotal = Number(orderAggregate._sum.grandTotal ?? 0);
  const orderPaid = Number(orderAggregate._sum.paidAmount ?? 0);
  const standaloneReceipt = Number(standaloneReceiptAggregate._sum.amount ?? 0);
  const customerPayment = Number(customerPaymentAggregate._sum.amount ?? 0);

  await tx.customer.update({
    where: { id: customerId },
    data: {
      receivableDebt: openingDebt + orderTotal - orderPaid + customerPayment - standaloneReceipt
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

  const oldDebt = Math.max(Number(order.debtAmount) - Number(order.grandTotal) + Number(order.paidAmount), 0);
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
