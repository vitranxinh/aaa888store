import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { createOrderFromPayload } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";
import { posCheckoutSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const startedAt = Date.now();
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const bodyStartedAt = Date.now();
    const body = await request.json();
    const requestBodyMs = Date.now() - bodyStartedAt;

    let branchId = typeof body?.branchId === "string" ? body.branchId.trim() : "";

    if (!branchId) {
      const branchLookupStartedAt = Date.now();
      branchId =
        session.branchId ??
        (await prisma.branch.findFirst({
          where: { isActive: true },
          orderBy: { createdAt: "asc" },
          select: { id: true }
        }))?.id ??
        "";
      console.info("[perf][orders-route][branch-lookup]", {
        branchId,
        ms: Date.now() - branchLookupStartedAt
      });
    }

    const validationStartedAt = Date.now();
    const parsed = posCheckoutSchema.safeParse({
      ...body,
      branchId
    });
    const validationMs = Date.now() - validationStartedAt;

    if (!parsed.success) {
      const flattened = parsed.error.flatten();
      const firstFieldError = Object.values(flattened.fieldErrors).flat()[0];
      const message = flattened.formErrors[0] ?? firstFieldError ?? "Dữ liệu hóa đơn không hợp lệ";
      return NextResponse.json({ error: message, details: flattened.fieldErrors }, { status: 400 });
    }

    const createOrderStartedAt = Date.now();
    const order = await createOrderFromPayload({
      ...parsed.data,
      createdById: session.id
    });
    const revalidateRedirectMs = 0;
    console.info("[perf][orders-route][create]", {
      requestBodyMs,
      validationMs,
      createOrderMs: Date.now() - createOrderStartedAt,
      revalidateRedirectMs,
      totalMs: Date.now() - startedAt,
      orderId: order.id
    });
    console.info(
      `CreateInvoice timing:\n- validation: ${Math.round(validationMs)} ms\n- transaction wait/start: 0 ms\n- create invoice: 0 ms\n- create items: 0 ms\n- inventory update: 0 ms\n- debt update: 0 ms\n- cash transaction: 0 ms\n- transaction total: ${Math.round(Date.now() - createOrderStartedAt)} ms\n- revalidate/redirect: ${Math.round(revalidateRedirectMs)} ms\n- total: ${Math.round(Date.now() - startedAt)} ms`
    );
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error: /prisma|transaction|timed out|already closed/i.test(message)
          ? "Tạo hóa đơn đang chậm hơn bình thường, vui lòng thử lại."
          : message || "Không thể tạo hóa đơn"
      },
      { status: 500 }
    );
  }
}
