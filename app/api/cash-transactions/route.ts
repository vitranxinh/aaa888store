import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiSession } from "@/lib/auth";
import { nextCode } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";
import { cashTransactionSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = await request.json();
    const parsed = cashTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu thu chi không hợp lệ" }, { status: 400 });
    }

    const payload = parsed.data;
    const code = await nextCode(payload.type === "RECEIPT" ? "PT" : "PC", "cashTransaction");

    const transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.cashTransaction.create({
        data: {
          code,
          branchId: payload.branchId,
          type: payload.type,
          amount: new Prisma.Decimal(payload.amount),
          note: payload.note,
          customerId: payload.customerId || null,
          supplierId: payload.supplierId || null,
          orderId: payload.orderId || null,
          purchaseOrderId: payload.purchaseOrderId || null,
          createdById: session.id
        }
      });

      if (payload.type === "RECEIPT" && payload.orderId) {
        const order = await tx.order.findUnique({ where: { id: payload.orderId } });
        if (order) {
          const paid = Math.min(Number(order.paidAmount) + payload.amount, Number(order.grandTotal));
          const debt = Math.max(Number(order.grandTotal) - paid, 0);
          await tx.order.update({
            where: { id: order.id },
            data: {
              paidAmount: new Prisma.Decimal(paid),
              debtAmount: new Prisma.Decimal(debt),
              status: debt > 0 ? "PARTIAL" : "COMPLETED"
            }
          });
          if (order.customerId) {
            await tx.customer.update({
              where: { id: order.customerId },
              data: { receivableDebt: new Prisma.Decimal(Math.max(Number(order.debtAmount) - payload.amount, 0)) }
            });
          }
        }
      }

      if (payload.type === "PAYMENT" && payload.purchaseOrderId) {
        const purchase = await tx.purchaseOrder.findUnique({ where: { id: payload.purchaseOrderId } });
        if (purchase) {
          const paid = Math.min(Number(purchase.paidAmount) + payload.amount, Number(purchase.totalAmount));
          const debt = Math.max(Number(purchase.totalAmount) - paid, 0);
          await tx.purchaseOrder.update({
            where: { id: purchase.id },
            data: {
              paidAmount: new Prisma.Decimal(paid),
              debtAmount: new Prisma.Decimal(debt),
              status: debt > 0 ? "PARTIAL" : "COMPLETED"
            }
          });
          if (purchase.supplierId) {
            await tx.supplier.update({
              where: { id: purchase.supplierId },
              data: { payableDebt: new Prisma.Decimal(Math.max(Number(purchase.debtAmount) - payload.amount, 0)) }
            });
          }
        }
      }

      return created;
    });

    return NextResponse.json({ ok: true, transaction });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tạo phiếu thu/chi" }, { status: 500 });
  }
}
