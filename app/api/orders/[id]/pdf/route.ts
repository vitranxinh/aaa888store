import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireApiSession, resolveActorUserId } from "@/lib/auth";
import { generateAndStoreInvoicePdf } from "@/lib/invoice-pdf";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const actorUserId = await resolveActorUserId(session);
    const order = await prisma.order.findUnique({
      where: { id: params.id },
      select: { id: true, branchId: true, code: true, createdById: true }
    });

    if (!order || (session.branchId && order.branchId !== session.branchId)) {
      return NextResponse.json({ error: "Không tìm thấy hóa đơn" }, { status: 404 });
    }
    if (session.role !== "ADMIN" && order.createdById !== actorUserId) {
      return NextResponse.json({ error: "Bạn chỉ được tạo PDF hóa đơn do mình tạo" }, { status: 403 });
    }

    const pdf = await generateAndStoreInvoicePdf(order.id);
    revalidatePath("/orders");
    revalidatePath(`/orders/${order.id}`);
    revalidatePath(`/invoice/${order.id}`);

    return NextResponse.json({ ok: true, code: order.code, pdf });
  } catch (error) {
    console.error("[InvoicePdfError]", {
      orderId: params.id,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined
    });

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Không thể tạo PDF hóa đơn"
      },
      { status: 500 }
    );
  }
}
