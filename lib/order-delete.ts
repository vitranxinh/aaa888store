import { Prisma } from "@prisma/client";
import { recalculateCustomerReceivableDebt } from "@/lib/debt-service";
import { prisma } from "@/lib/prisma";

export async function deleteOrderById(orderId: string) {
  const order = await prisma.order.findUnique({
    where: { id: orderId },
    include: { items: true }
  });

  if (!order) {
    throw new Error("Không tìm thấy hóa đơn");
  }

  await prisma.$transaction(async (tx) => {
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

    await tx.order.delete({
      where: { id: order.id }
    });

    await recalculateCustomerReceivableDebt(tx, order.customerId);
  });

  return order;
}
