import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { createOrderFromPayload } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";
import { posCheckoutSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = await request.json();

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
      createdById: session.id
    });
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tạo hóa đơn" }, { status: 500 });
  }
}
