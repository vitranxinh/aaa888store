import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { recalculateCustomerReceivableDebt } from "@/lib/debt-service";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = (await request.json()) as { status?: "CANCELLED" };
    if (!body.status || body.status !== "CANCELLED") {
      return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 400 });
    }

    const order = await prisma.order.findUnique({
      where: { id: params.id },
      include: { items: true }
    });

    if (!order) {
      return NextResponse.json({ error: "Không tìm thấy đơn hàng" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: params.id },
        data: {
          status: body.status,
          debtAmount: 0
        }
      });

      await recalculateCustomerReceivableDebt(tx, order.customerId);
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
