import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { deleteOrderById } from "@/lib/order-delete";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = (await request.json()) as { status?: "CANCELLED" };
    if (!body.status || body.status !== "CANCELLED") {
      return NextResponse.json({ error: "Trạng thái không hợp lệ" }, { status: 400 });
    }

    const cancelledOrder = await deleteOrderById(params.id);
    return NextResponse.json({ ok: true, code: cancelledOrder.code, mode: "cancelled", alreadyCancelled: cancelledOrder.mode === "already_cancelled" });
  } catch {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
}
