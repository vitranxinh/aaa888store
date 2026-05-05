import { NextResponse } from "next/server";

export const preferredRegion = 'sin1';
import { Prisma } from "@prisma/client";
import { requireApiSession, resolveActorUserId } from "@/lib/auth";
import { createOrderFromPayload } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";
import { posCheckoutSchema } from "@/lib/validations";

function isBusinessValidationError(message: string) {
  return /không tìm thấy|không đủ|không hợp lệ|giỏ hàng|tồn kho|khách hàng|sản phẩm/i.test(message);
}

function apiErrorResponse(error: unknown, startedAt: number) {
  const message = error instanceof Error ? error.message : String(error || "");

  if (message === "UNAUTHORIZED") {
    return NextResponse.json({ error: "Bạn cần đăng nhập" }, { status: 401 });
  }

  if (message === "FORBIDDEN") {
    return NextResponse.json({ error: "Bạn không có quyền thao tác" }, { status: 403 });
  }

  if (isBusinessValidationError(message)) {
    return NextResponse.json({ error: message }, { status: 400 });
  }

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2003") {
      return NextResponse.json({ error: "Dữ liệu hóa đơn tham chiếu không hợp lệ" }, { status: 400 });
    }

    if (error.code === "P2002") {
      return NextResponse.json({ error: "Mã hóa đơn bị trùng, vui lòng thử lại" }, { status: 409 });
    }
  }

  console.error("[CreateOrderError]", {
    totalMs: Date.now() - startedAt,
    message,
    code: error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined,
    stack: error instanceof Error ? error.stack : String(error)
  });

  return NextResponse.json(
    {
      error: /prisma|transaction|timed out|already closed|write conflict|deadlock/i.test(message)
        ? "Tạo hóa đơn đang chậm hơn bình thường, vui lòng thử lại."
        : message || "Không thể tạo hóa đơn"
    },
    { status: 500 }
  );
}

export async function POST(request: Request) {
  const startedAt = Date.now();

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

    const { order } = await createOrderFromPayload({
      ...parsed.data,
      createdById: session.id, // Dùng trực tiếp ID từ session, không cần gọi DB nữa
      branchId: parsed.data.branchId || session.branchId || ""
    });

    const totalMs = Date.now() - startedAt;
    if (totalMs > 1000) {
      console.info("[perf][orders-route][slow-create]", {
        totalMs,
        orderId: order.id
      });
    }

    return NextResponse.json({ ok: true, order });
  } catch (error) {
    return apiErrorResponse(error, startedAt);
  }
}
