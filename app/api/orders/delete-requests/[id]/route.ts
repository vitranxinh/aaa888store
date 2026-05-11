import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { requireApiSession, resolveActorUserId } from "@/lib/auth";
import { deleteOrderById } from "@/lib/order-delete";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const startedAt = Date.now();
  try {
    const session = await requireApiSession(["ADMIN"]);
    const actorUserId = await resolveActorUserId(session);
    const body = await request.json();
    const action = String(body?.action ?? "");

    const deleteRequest = await prisma.orderDeleteRequest.findUnique({
      where: { id: params.id },
      include: {
        order: {
          select: {
            id: true,
            code: true
          }
        },
        requestedBy: {
          select: { name: true }
        }
      }
    });

    if (!deleteRequest || deleteRequest.status !== "PENDING") {
      return NextResponse.json({ error: "Không tìm thấy yêu cầu xóa hợp lệ" }, { status: 404 });
    }

    if (action === "approve") {
      const deletedOrder = await deleteOrderById(deleteRequest.orderId);
      console.info("[CancelOrderTiming]", {
        phase: "approve-delete-request",
        deleteRequestId: deleteRequest.id,
        orderId: deleteRequest.orderId,
        totalDurationMs: Date.now() - startedAt
      });
      revalidateTag("orders-page-data");
      revalidateTag("orders-pending-delete-requests");
      return NextResponse.json({
        ok: true,
        mode: "approved",
        code: deletedOrder.code
      });
    }

    if (action === "reject") {
      await prisma.orderDeleteRequest.update({
        where: { id: deleteRequest.id },
        data: {
          status: "REJECTED",
          reviewedById: actorUserId,
          reviewedAt: new Date()
        }
      });

      revalidateTag("orders-pending-delete-requests");
      return NextResponse.json({
        ok: true,
        mode: "rejected",
        code: deleteRequest.order.code
      });
    }

    return NextResponse.json({ error: "Hành động không hợp lệ" }, { status: 400 });
  } catch (error) {
    console.error("[CancelOrderError]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể xử lý yêu cầu xóa" },
      { status: 500 }
    );
  }
}
