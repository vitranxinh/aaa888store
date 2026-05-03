import { NextResponse } from "next/server";
import { requireApiSession } from "@/lib/auth";
import { createOrderFromPayload } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";
import { posCheckoutSchema } from "@/lib/validations";

export async function POST(request: Request) {
  const startedAt = Date.now();
  try {
    console.info("[CreateOrderTiming] request received", { at: new Date(startedAt).toISOString() });
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
    console.info("[CreateOrderTiming] validation", { ms: validationMs, requestBodyMs });

    if (!parsed.success) {
      const flattened = parsed.error.flatten();
      const firstFieldError = Object.values(flattened.fieldErrors).flat()[0];
      const message = flattened.formErrors[0] ?? firstFieldError ?? "Dữ liệu hóa đơn không hợp lệ";
      return NextResponse.json({ error: message, details: flattened.fieldErrors }, { status: 400 });
    }

    const createOrderStartedAt = Date.now();
    const { order, timing } = await createOrderFromPayload({
      ...parsed.data,
      createdById: session.id
    });
    const revalidateRedirectStartedAt = Date.now();
    const revalidateRedirectMs = Date.now() - revalidateRedirectStartedAt;
    console.info("[perf][orders-route][create]", {
      requestBodyMs,
      validationMs,
      createOrderMs: Date.now() - createOrderStartedAt,
      revalidateRedirectMs,
      totalMs: Date.now() - startedAt,
      orderId: order.id
    });
    console.info("[CreateOrderTiming] transaction wait/start", { ms: timing.transactionWaitMs ?? 0 });
    console.info("[CreateOrderTiming] create order/invoice", { ms: timing.createOrderMs ?? 0 });
    console.info("[CreateOrderTiming] create order items", { ms: timing.createOrderItemsMs ?? 0 });
    console.info("[CreateOrderTiming] inventory update", {
      validationMs: timing.inventoryValidationMs ?? 0,
      updateMs: timing.inventoryUpdateMs ?? 0,
      batchFetchMs: timing.batchFetchMs ?? 0,
      batchPersistMs: timing.batchPersistMs ?? 0,
      batchAllocationMs: timing.batchAllocationMs ?? 0
    });
    console.info("[CreateOrderTiming] customer debt update", { ms: timing.customerDebtUpdateMs ?? 0 });
    console.info("[CreateOrderTiming] cashTransaction create", { ms: timing.cashTransactionMs ?? 0 });
    console.info("[CreateOrderTiming] transaction total", { ms: timing.transactionMs ?? 0 });
    console.info("[CreateOrderTiming] revalidatePath/router refresh", { ms: revalidateRedirectMs });
    console.info("[CreateOrderTiming] total request duration", { ms: Date.now() - startedAt, orderId: order.id });
    console.info(
      `[CreateOrderTiming] summary:\n- validation: ${Math.round(validationMs)} ms\n- transaction wait/start: ${Math.round(
        timing.transactionWaitMs ?? 0
      )} ms\n- create invoice: ${Math.round(timing.createOrderMs ?? 0)} ms\n- create items: ${Math.round(
        timing.createOrderItemsMs ?? 0
      )} ms\n- inventory update: ${Math.round(
        (timing.inventoryValidationMs ?? 0) +
          (timing.inventoryUpdateMs ?? 0) +
          (timing.batchAllocationMs ?? 0)
      )} ms\n- debt update: ${Math.round(timing.customerDebtUpdateMs ?? 0)} ms\n- cash transaction: ${Math.round(
        timing.cashTransactionMs ?? 0
      )} ms\n- transaction total: ${Math.round(timing.transactionMs ?? 0)} ms\n- revalidate/redirect: ${Math.round(
        revalidateRedirectMs
      )} ms\n- total: ${Math.round(Date.now() - startedAt)} ms`
    );
    return NextResponse.json({ ok: true, order });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    console.error("[CreateOrderError]", {
      totalMs: Date.now() - startedAt,
      message,
      stack: error instanceof Error ? error.stack : String(error)
    });
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
