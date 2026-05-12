import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireApiSession } from "@/lib/auth";
import { recalculateCustomerReceivableDebtForCustomer, recalculateOrderPaymentStateForOrder } from "@/lib/debt-service";
import { prisma } from "@/lib/prisma";
import { cashTransactionSchema } from "@/lib/validations";

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = await request.json();
    const parsed = cashTransactionSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu thu chi không hợp lệ" }, { status: 400 });
    }

    const existing = await prisma.cashTransaction.findUnique({
      where: { id: params.id }
    });

    if (!existing) {
      return NextResponse.json({ error: "Không tìm thấy phiếu thu/chi" }, { status: 404 });
    }

    const payload = parsed.data;
    const normalizedPayload =
      payload.type === "RECEIPT"
        ? {
            ...payload,
            supplierId: undefined,
            purchaseOrderId: undefined
          }
        : {
            ...payload,
            customerId: undefined,
            orderId: undefined,
            supplierId: undefined,
            purchaseOrderId: undefined
          };

    const transaction = await prisma.$transaction(async (tx) => {
      return tx.cashTransaction.update({
        where: { id: params.id },
        data: {
          branchId: normalizedPayload.branchId,
          type: normalizedPayload.type,
          amount: new Prisma.Decimal(normalizedPayload.amount),
          note: normalizedPayload.note,
          customerId: normalizedPayload.customerId || null,
          supplierId: normalizedPayload.supplierId || null,
          orderId: normalizedPayload.orderId || null,
          purchaseOrderId: normalizedPayload.purchaseOrderId || null
        }
      });
    });

    const orderIds = new Set<string>();
    const customerIds = new Set<string>();

    if (existing.orderId) orderIds.add(existing.orderId);
    if (normalizedPayload.orderId) orderIds.add(normalizedPayload.orderId);
    if (existing.customerId) customerIds.add(existing.customerId);
    if (normalizedPayload.customerId) customerIds.add(normalizedPayload.customerId);

    await Promise.all([
      ...Array.from(orderIds).map((orderId) => recalculateOrderPaymentStateForOrder(orderId)),
      ...Array.from(customerIds).map((customerId) => recalculateCustomerReceivableDebtForCustomer(customerId))
    ]);

    revalidateTag("customers-page");
    revalidatePath("/customers");
    revalidatePath("/cashflow");
    for (const customerId of customerIds) revalidatePath(`/customers/${customerId}`);

    return NextResponse.json({ ok: true, transaction });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể cập nhật phiếu thu/chi" },
      { status: 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);

    const existing = await prisma.cashTransaction.findUnique({
      where: { id: params.id }
    });

    if (!existing) {
      return NextResponse.json({ error: "Không tìm thấy phiếu thu/chi" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.cashTransaction.delete({
        where: { id: params.id }
      });
    });

    await Promise.all([
      existing.orderId ? recalculateOrderPaymentStateForOrder(existing.orderId) : Promise.resolve(),
      existing.customerId ? recalculateCustomerReceivableDebtForCustomer(existing.customerId) : Promise.resolve()
    ]);

    revalidateTag("customers-page");
    revalidatePath("/customers");
    revalidatePath("/cashflow");
    if (existing.customerId) revalidatePath(`/customers/${existing.customerId}`);

    return NextResponse.json({ ok: true, code: existing.code });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể xóa phiếu thu/chi" },
      { status: 500 }
    );
  }
}
