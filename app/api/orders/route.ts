import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { createOrderFromPayload } from "@/lib/order-service";
import { posCheckoutSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = await request.json();
    const parsed = posCheckoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu hóa đơn không hợp lệ" }, { status: 400 });
    }
    const order = await createOrderFromPayload({
      ...parsed.data,
      createdById: session.id
    });
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tạo hóa đơn" }, { status: 500 });
  }
}
