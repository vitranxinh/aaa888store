import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  try {
    const counts = await Promise.all([
      prisma.product.count(),
      prisma.order.count(),
      prisma.orderItem.count(),
      prisma.purchaseOrder.count(),
      prisma.purchaseOrderItem.count(),
      prisma.inventory.count(),
      prisma.productBatch.count(),
      prisma.inventoryTransaction.count(),
      prisma.cashTransaction.count(),
    ]);

    console.log(JSON.stringify({
      products: counts[0],
      orders: counts[1],
      orderItems: counts[2],
      purchaseOrders: counts[3],
      purchaseOrderItems: counts[4],
      inventory: counts[5],
      productBatches: counts[6],
      inventoryTransactions: counts[7],
      cashTransactions: counts[8],
    }, null, 2));
  } catch (err) {
    console.error(err);
  } finally {
    await prisma.$disconnect();
  }
}

main();
