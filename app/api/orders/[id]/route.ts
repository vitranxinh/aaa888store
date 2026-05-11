import { NextResponse } from "next/server";
import { requireApiSession, resolveActorUserId } from "@/lib/auth";
import { revalidateTag } from "next/cache";
import { deleteOrderById } from "@/lib/order-delete";
import { updateOrderFromPayload } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";
import { posCheckoutSchema } from "@/lib/validations";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const actorUserId = await resolveActorUserId(session);
    const body = await request.json();
    const parsed = posCheckoutSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu hóa đơn không hợp lệ" }, { status: 400 });
    }

    const updated = await updateOrderFromPayload(params.id, {
      ...parsed.data,
      createdById: actorUserId
    });

    return NextResponse.json({ ok: true, order: updated });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể cập nhật hóa đơn" },
      { status: 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  const startedAt = Date.now();
  try {
    console.info("[CancelOrderTiming]", {
      phase: "api-request-received",
      orderId: params.id
    });
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const actorUserId = await resolveActorUserId(session);
    console.info("[CancelOrderTiming]", {
      phase: "authorization",
      orderId: params.id,
      role: session.role,
      durationMs: Date.now() - startedAt
    });
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: {
        id: true,
        code: true,
        branchId: true,
        deleteRequest: {
          select: { id: true, status: true }
        }
      }
    });

    if (!order) {
      return NextResponse.json({ error: "Không tìm thấy hóa đơn" }, { status: 404 });
    }

    if (session.role === "ADMIN") {
      const cancelledOrder = await deleteOrderById(params.id);
      console.info("[CancelOrderTiming]", {
        phase: "api-response",
        orderId: params.id,
        mode: cancelledOrder.mode,
        totalDurationMs: Date.now() - startedAt
      });
      revalidateTag("orders-page-data");
      revalidateTag("orders-pending-delete-requests");
      
      return NextResponse.json({ ok: true, code: cancelledOrder.code, mode: "cancelled", alreadyCancelled: cancelledOrder.mode === "already_cancelled" });
    }

    await prisma.orderDeleteRequest.upsert({
      where: { orderId: order.id },
      update: {
        requestedById: actorUserId,
        reviewedById: null,
        reviewedAt: null,
        status: "PENDING"
      },
      create: {
        orderId: order.id,
        requestedById: actorUserId,
        status: "PENDING"
      }
    });

    console.info("[CancelOrderTiming]", {
      phase: "request-delete-created",
      orderId: params.id,
      totalDurationMs: Date.now() - startedAt
    });
    return NextResponse.json({ ok: true, code: order.code, mode: "requested" });
  } catch (error) {
    console.error("[CancelOrderError]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể xóa hóa đơn" },
      { status: 500 }
    );
  }
}
