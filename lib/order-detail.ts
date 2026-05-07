import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

export async function getOrderDetail(orderId: string) {
  return prisma.order.findUnique({
    where: { id: orderId },
    select: {
      id: true,
      code: true,
      branchId: true,
      customerId: true,
      createdById: true,
      status: true,
      subtotal: true,
      discountTotal: true,
      otherCharge: true,
      grandTotal: true,
      profitEstimate: true,
      paymentMethod: true,
      paidAmount: true,
      debtAmount: true,
      note: true,
      createdAt: true,
      updatedAt: true,
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

export async function getOrderPdfMetadata(orderId: string) {
  try {
    const rows = await prisma.$queryRaw<
      Array<{
        pdfUrl: string | null;
        pdfFileName: string | null;
        pdfSize: number | null;
        pdfGeneratedAt: Date | null;
      }>
    >(Prisma.sql`
      SELECT
        "pdfUrl",
        "pdfFileName",
        "pdfSize",
        "pdfGeneratedAt"
      FROM "Order"
      WHERE "id" = ${orderId}
      LIMIT 1
    `);

    return (
      rows[0] ?? {
        pdfUrl: null,
        pdfFileName: null,
        pdfSize: null,
        pdfGeneratedAt: null
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/pdfUrl|pdfFileName|pdfSize|pdfGeneratedAt|column .* does not exist/i.test(message)) {
      console.warn("[InvoicePdfMetadataFallback]", {
        orderId,
        message
      });
      return {
        pdfUrl: null,
        pdfFileName: null,
        pdfSize: null,
        pdfGeneratedAt: null
      };
    }
    throw error;
  }
}
