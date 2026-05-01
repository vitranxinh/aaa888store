import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiSession } from "@/lib/auth";
import {
  recalculateCustomerReceivableDebtForCustomer,
  recalculateOrderPaymentStateForOrder,
  recalculatePurchasePaymentStateForPurchase,
  recalculateSupplierPayableDebtForSupplier
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
      return tx.cashTransaction.update({
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

    await Promise.all([
      ...Array.from(orderIds).map((orderId) => recalculateOrderPaymentStateForOrder(orderId)),
      ...Array.from(purchaseIds).map((purchaseId) => recalculatePurchasePaymentStateForPurchase(purchaseId)),
      ...Array.from(customerIds).map((customerId) => recalculateCustomerReceivableDebtForCustomer(customerId)),
      ...Array.from(supplierIds).map((supplierId) => recalculateSupplierPayableDebtForSupplier(supplierId))
    ]);

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
      existing.purchaseOrderId ? recalculatePurchasePaymentStateForPurchase(existing.purchaseOrderId) : Promise.resolve(),
      existing.customerId ? recalculateCustomerReceivableDebtForCustomer(existing.customerId) : Promise.resolve(),
      existing.supplierId ? recalculateSupplierPayableDebtForSupplier(existing.supplierId) : Promise.resolve()
    ]);

    return NextResponse.json({ ok: true, code: existing.code });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể xóa phiếu thu/chi" },
      { status: 500 }
    );
  }
}
