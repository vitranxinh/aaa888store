import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { createOrderFromPayload } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";
import { posCheckoutSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = await request.json();
    const parsed = posCheckoutSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten().formErrors[0] ?? "Dữ liệu không hợp lệ" }, { status: 400 });
    }

    const actor =
      (await prisma.user.findUnique({
        where: { email: session.email },
        select: { id: true }
      })) ??
      (await prisma.user.findFirst({
        where: { isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true }
      }));

    if (!actor) {
      return NextResponse.json({ error: "Chưa có người dùng hợp lệ trong hệ thống để tạo hóa đơn" }, { status: 500 });
    }

    const { order } = await createOrderFromPayload({
      ...parsed.data,
      createdById: actor.id
    });

    return NextResponse.json({ ok: true, order });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Bạn cần đăng nhập" }, { status: 401 });
    }
    if (error instanceof Error && error.message === "FORBIDDEN") {
      return NextResponse.json({ error: "Bạn không có quyền thao tác" }, { status: 403 });
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tạo đơn hàng" }, { status: 500 });
  }
}
