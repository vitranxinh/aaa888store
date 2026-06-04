import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireApiSession, resolveActorUserId } from "@/lib/auth";
import { recalculateCustomerReceivableDebt } from "@/lib/debt-service";
import { nextCode } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";
import { orderPaymentSchema } from "@/lib/validations";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const actorUserId = await resolveActorUserId(session);
    const body = await request.json();
    const parsed = orderPaymentSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu thanh toán không hợp lệ" }, { status: 400 });
    }

    const order = await prisma.order.findUnique({ where: { id: params.id } });
    if (!order) {
      return NextResponse.json({ error: "Không tìm thấy hóa đơn" }, { status: 404 });
    }
    if (session.branchId && order.branchId !== session.branchId) {
      return NextResponse.json({ error: "Không tìm thấy hóa đơn" }, { status: 404 });
    }
    if (session.role !== "ADMIN" && order.createdById !== actorUserId) {
      return NextResponse.json({ error: "Bạn chỉ được thu tiền hóa đơn do mình tạo" }, { status: 403 });
    }

    const oldDebt = Math.max(Number(order.debtAmount) - Number(order.grandTotal) + Number(order.paidAmount), 0);
    const totalPayable = oldDebt + Number(order.grandTotal);
    const nextPaid = Math.min(Number(order.paidAmount) + parsed.data.amount, totalPayable);
    const nextDebt = Math.max(totalPayable - nextPaid, 0);
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
          createdById: actorUserId,
          note: parsed.data.note ?? `Thu tiền hóa đơn ${order.code}`
        }
      });

      await recalculateCustomerReceivableDebt(tx, order.customerId);

      return result;
    });

    revalidateTag("customers-page");
    revalidatePath("/orders");
    revalidatePath(`/orders/${params.id}`);
    revalidatePath("/customers");
    revalidatePath(`/customers/${order.customerId}`);

    return NextResponse.json({ ok: true, order: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể thanh toán" }, { status: 500 });
  }
}
