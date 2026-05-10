import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function deleteOrderById(orderId: string) {
  const startedAt = Date.now();
  console.info("[CancelOrderTiming]", {
    phase: "cancel-request-received",
    orderId
  });

  const orderLookupStartedAt = Date.now();
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      code: true,
      branchId: true,
      customerId: true,
      status: true,
      grandTotal: true,
      debtAmount: true,
      items: {
        select: {
          productId: true,
          quantity: true
        }
      }
    }
  });

  console.info("[CancelOrderTiming]", {
    phase: "order-lookup",
    durationMs: Date.now() - orderLookupStartedAt,
    orderId
  });

  if (!order) {
    throw new Error("Không tìm thấy hóa đơn");
  }

  if (order.status === "CANCELLED") {
    console.info("[CancelOrderTiming]", {
      phase: "already-cancelled",
      durationMs: Date.now() - startedAt,
      orderId,
      code: order.code
    });

    return {
      ...order,
      mode: "already_cancelled" as const
    };
  }

  await prisma.$transaction(
    async (tx) => {
      const transactionStartedAt = Date.now();
      console.info("[CancelOrderTiming]", {
        phase: "transaction-start",
        orderId
      });

      const quantityByProduct = new Map<string, number>();
      for (const item of order.items) {
        quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) ?? 0) + item.quantity);
      }

      const lookupStartedAt = Date.now();
      const [customer, saleTransactions] = await Promise.all([
        tx.customer.findUnique({
          where: { id: order.customerId },
          select: { totalSpend: true, loyaltyPoints: true, receivableDebt: true }
        }),
        tx.inventoryTransaction.findMany({
          where: {
            referenceCode: order.code,
            type: "SALE"
          },
          select: {
            batchId: true,
            quantity: true
          }
        })
      ]);
      console.info("[CancelOrderTiming]", {
        phase: "lookup-related-data",
        durationMs: Date.now() - lookupStartedAt,
        saleTxnCount: saleTransactions.length
      });

      if (order.status !== "DRAFT") {
        const inventoryRestoreStartedAt = Date.now();
        const productIds = Array.from(quantityByProduct.keys());
        if (productIds.length > 0) {
          const inventoryCaseClauses = Prisma.join(
            productIds.map((productId) => Prisma.sql`WHEN ${productId} THEN ${quantityByProduct.get(productId) ?? 0}`),
            " "
          );

          await tx.$executeRaw`
            UPDATE "Inventory"
            SET "quantity" = "quantity" + (CASE "productId" ${inventoryCaseClauses} ELSE 0 END)
            WHERE "branchId" = ${order.branchId}
              AND "variantId" IS NULL
              AND "productId" IN (${Prisma.join(productIds)});
          `;
        }
        console.info("[CancelOrderTiming]", {
          phase: "inventory-restore",
          durationMs: Date.now() - inventoryRestoreStartedAt,
          productCount: productIds.length
        });

        const batchRestoreStartedAt = Date.now();
        const quantityByBatch = new Map<string, number>();
        for (const txn of saleTransactions) {
          if (!txn.batchId) continue;
          quantityByBatch.set(txn.batchId, (quantityByBatch.get(txn.batchId) ?? 0) + Math.abs(txn.quantity));
        }

        const batchIds = Array.from(quantityByBatch.keys());
        if (batchIds.length > 0) {
          const batchCaseClauses = Prisma.join(
            batchIds.map((batchId) => Prisma.sql`WHEN ${batchId} THEN ${quantityByBatch.get(batchId) ?? 0}`),
            " "
          );

          await tx.$executeRaw`
            UPDATE "ProductBatch"
            SET "quantity" = "quantity" + (CASE "id" ${batchCaseClauses} ELSE 0 END)
            WHERE "id" IN (${Prisma.join(batchIds)});
          `;
        }
        console.info("[CancelOrderTiming]", {
          phase: "batch-restore",
          durationMs: Date.now() - batchRestoreStartedAt,
          batchCount: batchIds.length
        });
      }

      if (customer) {
        const customerUpdateStartedAt = Date.now();
        await tx.customer.update({
          where: { id: order.customerId },
          data: {
            totalSpend: new Prisma.Decimal(Math.max(Number(customer.totalSpend) - Number(order.grandTotal), 0)),
            loyaltyPoints: Math.max(customer.loyaltyPoints - Math.floor(Number(order.grandTotal) / 100000), 0),
            receivableDebt: new Prisma.Decimal(Number(customer.receivableDebt) - Number(order.debtAmount))
          }
        });
        console.info("[CancelOrderTiming]", {
          phase: "customer-debt-update",
          durationMs: Date.now() - customerUpdateStartedAt
        });
      }

      const paymentReversalStartedAt = Date.now();
      await tx.cashTransaction.deleteMany({
        where: { orderId: order.id }
      });
      console.info("[CancelOrderTiming]", {
        phase: "payment-reversal",
        durationMs: Date.now() - paymentReversalStartedAt
      });

      const orderStatusStartedAt = Date.now();
      await Promise.all([
        tx.inventoryTransaction.deleteMany({
          where: {
            referenceCode: order.code,
            type: "SALE"
          }
        }),
        tx.orderDeleteRequest.deleteMany({
          where: { orderId: order.id }
        }),
        tx.order.update({
          where: { id: order.id },
          data: {
            status: "CANCELLED",
            debtAmount: 0
          }
        })
      ]);
      console.info("[CancelOrderTiming]", {
        phase: "order-status-update",
        durationMs: Date.now() - orderStatusStartedAt
      });

      console.info("[CancelOrderTiming]", {
        phase: "transaction-total",
        durationMs: Date.now() - transactionStartedAt,
        orderId
      });
    },
    {
      maxWait: 10_000,
      timeout: 15_000
    }
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
