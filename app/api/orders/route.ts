import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { createOrderFromPayload } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";
import { posCheckoutSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = await request.json();
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

    let branchId = typeof body?.branchId === "string" ? body.branchId.trim() : "";

    if (!branchId) {
      branchId =
        session.branchId ??
        (await prisma.branch.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
          select: { id: true }
        }))?.id ??
        "";
    }

    const parsed = posCheckoutSchema.safeParse({
      ...body,
      branchId
    });

    if (!parsed.success) {
      const flattened = parsed.error.flatten();
      const firstFieldError = Object.values(flattened.fieldErrors).flat()[0];
      const message = flattened.formErrors[0] ?? firstFieldError ?? "Dữ liệu hóa đơn không hợp lệ";
      return NextResponse.json({ error: message, details: flattened.fieldErrors }, { status: 400 });
    }

    const order = await createOrderFromPayload({
      ...parsed.data,
      createdById: actor.id
    });
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tạo hóa đơn" }, { status: 500 });
  }
}
