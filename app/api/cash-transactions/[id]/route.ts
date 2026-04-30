import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiSession } from "@/lib/auth";
import {
  recalculateCustomerReceivableDebt,
  recalculateOrderPaymentState,
  recalculatePurchasePaymentState,
  recalculateSupplierPayableDebt
} from "@/lib/debt-service";
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

    const transaction = await prisma.$transaction(async (tx) => {
      const updated = await tx.cashTransaction.update({
        where: { id: params.id },
        data: {
          branchId: payload.branchId,
          type: payload.type,
          amount: new Prisma.Decimal(payload.amount),
          note: payload.note,
          customerId: payload.customerId || null,
          supplierId: payload.supplierId || null,
          orderId: payload.orderId || null,
          purchaseOrderId: payload.purchaseOrderId || null
        }
      });

      const orderIds = new Set<string>();
      const purchaseIds = new Set<string>();
      const customerIds = new Set<string>();
      const supplierIds = new Set<string>();

      if (existing.orderId) orderIds.add(existing.orderId);
      if (payload.orderId) orderIds.add(payload.orderId);
      if (existing.purchaseOrderId) purchaseIds.add(existing.purchaseOrderId);
      if (payload.purchaseOrderId) purchaseIds.add(payload.purchaseOrderId);
      if (existing.customerId) customerIds.add(existing.customerId);
      if (payload.customerId) customerIds.add(payload.customerId);
      if (existing.supplierId) supplierIds.add(existing.supplierId);
      if (payload.supplierId) supplierIds.add(payload.supplierId);

      for (const orderId of orderIds) {
        await recalculateOrderPaymentState(tx, orderId);
      }

      for (const purchaseId of purchaseIds) {
        await recalculatePurchasePaymentState(tx, purchaseId);
      }

      for (const customerId of customerIds) {
        await recalculateCustomerReceivableDebt(tx, customerId);
      }

      for (const supplierId of supplierIds) {
        await recalculateSupplierPayableDebt(tx, supplierId);
      }

      return updated;
    });

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

      if (existing.orderId) {
        await recalculateOrderPaymentState(tx, existing.orderId);
      }

      if (existing.purchaseOrderId) {
        await recalculatePurchasePaymentState(tx, existing.purchaseOrderId);
      }

      if (existing.customerId) {
        await recalculateCustomerReceivableDebt(tx, existing.customerId);
      }

      if (existing.supplierId) {
        await recalculateSupplierPayableDebt(tx, existing.supplierId);
      }
    });

    return NextResponse.json({ ok: true, code: existing.code });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể xóa phiếu thu/chi" },
      { status: 500 }
    );
  }
}
