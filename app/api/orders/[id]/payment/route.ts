import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiSession } from "@/lib/auth";
import { nextCode } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";
import { orderPaymentSchema } from "@/lib/validations";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = await request.json();
    const parsed = orderPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu thanh toán không hợp lệ" }, { status: 400 });
    }

    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) {
      return NextResponse.json({ error: "Không tìm thấy hóa đơn" }, { status: 404 });
    }

    const nextPaid = Math.min(Number(order.paidAmount) + parsed.data.amount, Number(order.grandTotal));
    const nextDebt = Math.max(Number(order.grandTotal) - nextPaid, 0);
    const nextStatus = nextDebt > 0 ? "PARTIAL" : "COMPLETED";

    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.order.update({
        where: { id: params.id },
        data: {
          paidAmount: new Prisma.Decimal(nextPaid),
          debtAmount: new Prisma.Decimal(nextDebt),
          paymentMethod: parsed.data.paymentMethod,
          status: nextStatus
        }
      });

      await tx.cashTransaction.create({
        data: {
          code: await nextCode("PT", "cashTransaction"),
          branchId: order.branchId,
          type: "RECEIPT",
          amount: new Prisma.Decimal(parsed.data.amount),
          orderId: order.id,
          customerId: order.customerId,
          createdById: session.id,
          note: parsed.data.note ?? `Thu tiền hóa đơn ${order.code}`
        }
      });

      await tx.customer.update({
        where: { id: order.customerId },
        data: { receivableDebt: new Prisma.Decimal(Math.max(Number(order.debtAmount) - parsed.data.amount, 0)) }
      });

      return result;
    });

    return NextResponse.json({ ok: true, order: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể thanh toán" }, { status: 500 });
  }
}
