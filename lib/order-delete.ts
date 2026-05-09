import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function deleteOrderById(orderId: string) {
  const startedAt = Date.now();
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

  if (!order) {
    throw new Error("Không tìm thấy hóa đơn");
  }

  console.info("[DeleteOrderTiming]", {
    phase: "request-received",
    orderId,
    itemCount: order.items.length
  });

  await prisma.$transaction(async (tx) => {
    const transactionStartedAt = Date.now();
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
    console.info("[DeleteOrderTiming]", {
      phase: "lookups",
      durationMs: Date.now() - lookupStartedAt,
      saleTxnCount: saleTransactions.length
    });

    if (order.status !== "DRAFT") {
      const inventoryUpdateStartedAt = Date.now();
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
      console.info("[DeleteOrderTiming]", {
        phase: "inventory-restore",
        durationMs: Date.now() - inventoryUpdateStartedAt,
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
      console.info("[DeleteOrderTiming]", {
        phase: "batch-restore",
        durationMs: Date.now() - batchRestoreStartedAt,
        batchCount: batchIds.length
      });

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
        console.info("[DeleteOrderTiming]", {
          phase: "customer-update",
          durationMs: Date.now() - customerUpdateStartedAt
        });
      }
    }

    const deleteStartedAt = Date.now();
    await Promise.all([
      tx.inventoryTransaction.deleteMany({
        where: {
          referenceCode: order.code,
          type: "SALE"
        }
      }),
      tx.cashTransaction.deleteMany({
        where: { orderId: order.id }
      }),
      tx.order.delete({
        where: { id: order.id }
      })
    ]);
    console.info("[DeleteOrderTiming]", {
      phase: "delete-records",
      durationMs: Date.now() - deleteStartedAt
    });

    console.info("[DeleteOrderTiming]", {
      phase: "transaction-total",
      durationMs: Date.now() - transactionStartedAt
    });
  });

  console.info("[DeleteOrderTiming]", {
    phase: "full-request",
    durationMs: Date.now() - startedAt,
    orderId,
    code: order.code
  });

  return order;
}
