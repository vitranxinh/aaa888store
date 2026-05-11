import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: "postgresql://neondb_owner:npg_L2T3FDhUQqkP@ep-summer-pond-aop106lt.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"
    }
  }
});

async function main() {
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

  console.log({
    products: counts[0],
    orders: counts[1],
    orderItems: counts[2],
    purchaseOrders: counts[3],
    purchaseOrderItems: counts[4],
    inventory: counts[5],
    productBatches: counts[6],
    inventoryTransactions: counts[7],
    cashTransactions: counts[8],
  });
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
