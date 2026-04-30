import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiSession, resolveActorUserId } from "@/lib/auth";
import {
  recalculateCustomerReceivableDebt,
  recalculateOrderPaymentState,
  recalculatePurchasePaymentState,
  recalculateSupplierPayableDebt
} from "@/lib/debt-service";
import { nextCode } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";
import { cashTransactionSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const actorUserId = await resolveActorUserId(session);
    const body = await request.json();
    const parsed = cashTransactionSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu thu chi không hợp lệ" }, { status: 400 });
    }

    const payload = parsed.data;
    const code = await nextCode(payload.type === "RECEIPT" ? "PT" : "PC", "cashTransaction");

    const transaction = await prisma.$transaction(async (tx) => {
      const created = await tx.cashTransaction.create({
        data: {
          code,
          branchId: payload.branchId,
          type: payload.type,
          amount: new Prisma.Decimal(payload.amount),
          note: payload.note,
          customerId: payload.customerId || null,
          supplierId: payload.supplierId || null,
          orderId: payload.orderId || null,
          purchaseOrderId: payload.purchaseOrderId || null,
          createdById: actorUserId
        }
      });

      if (payload.type === "RECEIPT" && payload.orderId) {
        await recalculateOrderPaymentState(tx, payload.orderId);
      }

      if (payload.customerId) {
        await recalculateCustomerReceivableDebt(tx, payload.customerId);
      }

      if (payload.type === "PAYMENT" && payload.purchaseOrderId) {
        await recalculatePurchasePaymentState(tx, payload.purchaseOrderId);
      }

      if (payload.supplierId) {
        await recalculateSupplierPayableDebt(tx, payload.supplierId);
      }

      return created;
    });

    return NextResponse.json({ ok: true, transaction });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tạo phiếu thu/chi" }, { status: 500 });
  }
}
