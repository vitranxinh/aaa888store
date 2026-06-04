import { Prisma } from "@prisma/client";
import { recalculateCustomerReceivableDebt } from "@/lib/debt-service";
import { prisma } from "@/lib/prisma";

export async function deleteOrderById(orderId: string) {
  const startedAt = Date.now();
  console.info("[CancelOrderTiming]", {
    phase: "cancel-request-received",
    orderId
  });

  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      code: true,
      branchId: true,
      customerId: true,
      status: true,
      grandTotal: true,
      paidAmount: true,
      debtAmount: true,
      items: {
        select: {
          productId: true,
          quantity: true
        }
      }
    }
  });

  if (!order) {
    throw new Error("Không tìm thấy hóa đơn");
  }

  if (order.status === "CANCELLED") {
    return {
      ...order,
      mode: "already_cancelled" as const
    };
  }

  const quantityByProduct = new Map<string, number>();
  for (const item of order.items) {
    quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) ?? 0) + item.quantity);
  }

  await prisma.$transaction(
    async (tx) => {
      const transactionStartedAt = Date.now();

      const [customer, saleTransactions] = await Promise.all([
        tx.customer.findUnique({
          where: { id: order.customerId },
          select: { totalSpend: true, loyaltyPoints: true, receivableDebt: true }
        }),
        tx.inventoryTransaction.findMany({
          where: { referenceCode: order.code, type: "SALE" },
          select: { batchId: true, quantity: true }
        })
      ]);

      const tasks: Promise<any>[] = [];

      // 1. Khôi phục tồn kho tổng quát
      const productIds = Array.from(quantityByProduct.keys());
      if (order.status !== "DRAFT" && productIds.length > 0) {
        const inventoryCaseClauses = Prisma.join(
          productIds.map((productId) => Prisma.sql`WHEN ${productId} THEN ${quantityByProduct.get(productId) ?? 0}`),
          " "
        );
        tasks.push(tx.$executeRaw`
          UPDATE "Inventory"
          SET "quantity" = "quantity" + (CASE "productId" ${inventoryCaseClauses} ELSE 0 END)
          WHERE "branchId" = ${order.branchId} AND "variantId" IS NULL AND "productId" IN (${Prisma.join(productIds)});
        `);
      }

      // 2. Khôi phục tồn kho theo lô
      const quantityByBatch = new Map<string, number>();
      for (const txn of saleTransactions) {
        if (txn.batchId) {
          quantityByBatch.set(txn.batchId, (quantityByBatch.get(txn.batchId) ?? 0) + Math.abs(txn.quantity));
        }
      }
      const batchIds = Array.from(quantityByBatch.keys());
      if (order.status !== "DRAFT" && batchIds.length > 0) {
        const batchCaseClauses = Prisma.join(
          batchIds.map((batchId) => Prisma.sql`WHEN ${batchId} THEN ${quantityByBatch.get(batchId) ?? 0}`),
          " "
        );
        tasks.push(tx.$executeRaw`
          UPDATE "ProductBatch"
          SET "quantity" = "quantity" + (CASE "id" ${batchCaseClauses} ELSE 0 END)
          WHERE "id" IN (${Prisma.join(batchIds)});
        `);
      }

      // 3. Gỡ phần doanh số; công nợ sẽ được tính lại sau khi trạng thái hóa đơn đã đổi.
      if (customer) {
        tasks.push(tx.customer.update({
          where: { id: order.customerId },
          data: {
            totalSpend: new Prisma.Decimal(Math.max(Number(customer.totalSpend) - Number(order.grandTotal), 0)),
            loyaltyPoints: Math.max(customer.loyaltyPoints - Math.floor(Number(order.grandTotal) / 100000), 0)
          }
        }));
      }

      // 4. Xóa dữ liệu và cập nhật trạng thái
      tasks.push(
        tx.cashTransaction.deleteMany({ where: { orderId: order.id } }),
        tx.inventoryTransaction.deleteMany({ where: { referenceCode: order.code, type: "SALE" } }),
        tx.orderDeleteRequest.deleteMany({ where: { orderId: order.id } }),
        tx.order.update({
          where: { id: order.id },
          data: { status: "CANCELLED", debtAmount: 0 }
        })
      );

      await Promise.all(tasks);
      await recalculateCustomerReceivableDebt(tx, order.customerId);

      console.info("[CancelOrderTiming]", {
        phase: "transaction-total",
        durationMs: Date.now() - transactionStartedAt,
        orderId
      });
    },
    { maxWait: 10000, timeout: 20000 }
  );

  console.info("[CancelOrderTiming]", {
    phase: "full-request",
    durationMs: Date.now() - startedAt,
    orderId,
    code: order.code
  });

  return {
    ...order,
    mode: "cancelled" as const
  };
}
