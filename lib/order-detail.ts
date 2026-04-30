import { prisma } from "@/lib/prisma";

export async function getOrderDetail(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    include: {
      branch: true,
      customer: true,
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true
        }
      },
      cashTxns: {
        orderBy: { createdAt: "asc" }
      },
      items: {
        include: {
          product: {
            select: {
              id: true,
              sku: true,
              name: true,
              imageUrl: true
            }
          }
        },
        orderBy: { id: "asc" }
      }
    }
  });
}
