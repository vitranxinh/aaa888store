import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { Prisma } from "@prisma/client";
import { requireApiSession } from "@/lib/auth";
import { recalculateCustomerReceivableDebtForCustomer, recalculateOrderPaymentStateForOrder } from "@/lib/debt-service";
import { nextCode } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";
import { cashTransactionSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = await request.json();
    const parsed = cashTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu thu chi không hợp lệ" }, { status: 400 });
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
            orderId: undefined,
            supplierId: undefined,
            purchaseOrderId: undefined
          };

    if (!normalizedPayload.customerId) {
      return NextResponse.json({ error: "Vui lòng chọn khách hàng cho phiếu thu/chi" }, { status: 400 });
    }

    const code = await nextCode(payload.type === "RECEIPT" ? "PT" : "PC", "cashTransaction");

    const transaction = await prisma.$transaction(async (tx) => {
      return tx.cashTransaction.create({
        data: {
          code,
          branchId: normalizedPayload.branchId,
          type: normalizedPayload.type,
          amount: new Prisma.Decimal(normalizedPayload.amount),
          note: normalizedPayload.note,
          customerId: normalizedPayload.customerId || null,
          supplierId: normalizedPayload.supplierId || null,
          orderId: normalizedPayload.orderId || null,
          purchaseOrderId: normalizedPayload.purchaseOrderId || null,
          createdById: session.id
        }
      });
    });

    if (normalizedPayload.type === "RECEIPT" && normalizedPayload.orderId) {
      await recalculateOrderPaymentStateForOrder(normalizedPayload.orderId);
    }

    if (normalizedPayload.customerId) {
      await recalculateCustomerReceivableDebtForCustomer(normalizedPayload.customerId);
    }

    revalidateTag("customers-page");
    revalidatePath("/customers");
    revalidatePath("/cashflow");
    if (normalizedPayload.customerId) revalidatePath(`/customers/${normalizedPayload.customerId}`);

    return NextResponse.json({ ok: true, transaction });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tạo phiếu thu/chi" }, { status: 500 });
  }
}
