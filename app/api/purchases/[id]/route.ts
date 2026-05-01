import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiSession } from "@/lib/auth";
import { recalculatePurchasePaymentStateForPurchase, recalculateSupplierPayableDebtForSupplier } from "@/lib/debt-service";
import { nextCode } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";
import { purchaseSchema } from "@/lib/validations";

async function applyPurchaseInventory(
  tx: Prisma.TransactionClient,
  purchase: {
    code: string;
    branchId: string;
    items: Array<{
      id: string;
      productId: string;
      quantity: number;
      batchNumber: string;
      expiryDate: Date | null;
      importPrice: Prisma.Decimal;
    }>;
  },
  createdById: string,
  direction: "increment" | "decrement"
) {
  const existingInventories = await tx.inventory.findMany({
    where: {
      branchId: purchase.branchId,
      variantId: null,
      productId: { in: purchase.items.map((item) => item.productId) }
    },
    select: { id: true, productId: true }
  });
  const inventoryIdByProduct = new Map(
    existingInventories
      .filter((inventory): inventory is { id: string; productId: string } => Boolean(inventory.productId))
      .map((inventory) => [inventory.productId, inventory.id])
  );

  for (const item of purchase.items) {
    const inventoryId = inventoryIdByProduct.get(item.productId);

    if (inventoryId) {
      await tx.inventory.update({
        where: { id: inventoryId },
        data: {
          quantity: direction === "increment" ? { increment: item.quantity } : { decrement: item.quantity }
        }
      });
    } else {
      await tx.inventory.create({
        data: {
          branchId: purchase.branchId,
          productId: item.productId,
          quantity: direction === "increment" ? item.quantity : -item.quantity
        }
      });
    }

    if (direction === "increment") {
      await tx.productBatch.create({
        data: {
          branchId: purchase.branchId,
          productId: item.productId,
          batchNumber: item.batchNumber,
          expiryDate: item.expiryDate,
          quantity: item.quantity,
          importPrice: item.importPrice,
          purchaseItemId: item.id
        }
      });

        await tx.inventoryTransaction.create({
          data: {
            branchId: purchase.branchId,
            productId: item.productId,
            type: "IMPORT",
            quantity: item.quantity,
            referenceCode: purchase.code,
            createdById,
            note: item.batchNumber ? `Nhập lô ${item.batchNumber}` : "Nhập hàng"
          }
        });
      }
  }
}

export async function PUT(request: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = await request.json();
    const parsed = purchaseSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu phiếu nhập không hợp lệ" }, { status: 400 });
    }

    const existing = await prisma.purchaseOrder.findUnique({
      where: { id: params.id },
      include: { items: true, cashTxns: true }
    });

    if (!existing) {
      return NextResponse.json({ error: "Không tìm thấy phiếu nhập" }, { status: 404 });
    }

    const normalizedItems = parsed.data.items.map((item, index) => ({
      ...item,
      batchNumber: item.batchNumber?.trim() || `${existing.code}-AUTO-${index + 1}`
    }));

    const totalAmount = normalizedItems.reduce((sum, item) => sum + item.quantity * item.importPrice, 0);
    const paidAmount = parsed.data.paidAmount;
    const debtAmount = Math.max(totalAmount - paidAmount, 0);
    const status = debtAmount > 0 ? "PARTIAL" : "COMPLETED";
    const paymentCode = paidAmount > 0 ? await nextCode("PC", "cashTransaction") : null;

    const purchase = await prisma.$transaction(async (tx) => {
      await applyPurchaseInventory(
        tx,
        {
          code: existing.code,
          branchId: existing.branchId,
          items: existing.items.map((item) => ({
            id: item.id,
            productId: item.productId,
            quantity: item.quantity,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            importPrice: item.importPrice
          }))
        },
        session.id,
        "decrement"
      );

      await tx.inventoryTransaction.deleteMany({
        where: {
          referenceCode: existing.code,
          type: "IMPORT"
        }
      });

      await tx.productBatch.deleteMany({
        where: {
          purchaseItemId: { in: existing.items.map((item) => item.id) }
        }
      });

      await tx.cashTransaction.deleteMany({
        where: { purchaseOrderId: existing.id }
      });

      await tx.purchaseOrderItem.deleteMany({
        where: { purchaseOrderId: existing.id }
      });

      const updated = await tx.purchaseOrder.update({
        where: { id: existing.id },
        data: {
          branchId: parsed.data.branchId,
          supplierId: parsed.data.supplierId,
          createdById: session.id,
          status,
          totalAmount,
          paidAmount,
          debtAmount,
          note: parsed.data.note
        }
      });

      const createdItems = [];
      for (const item of normalizedItems) {
        const createdItem = await tx.purchaseOrderItem.create({
          data: {
            purchaseOrderId: existing.id,
            productId: item.productId,
            quantity: item.quantity,
            importPrice: new Prisma.Decimal(item.importPrice),
            total: new Prisma.Decimal(item.quantity * item.importPrice),
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate ? new Date(item.expiryDate) : null
          }
        });
        createdItems.push(createdItem);
      }

      await applyPurchaseInventory(
        tx,
        {
          code: existing.code,
          branchId: parsed.data.branchId,
          items: createdItems.map((item) => ({
            id: item.id,
            productId: item.productId,
            quantity: item.quantity,
            batchNumber: item.batchNumber,
            expiryDate: item.expiryDate,
            importPrice: item.importPrice
          }))
        },
        session.id,
        "increment"
      );

      if (paidAmount > 0) {
        await tx.cashTransaction.create({
          data: {
            code: paymentCode!,
            branchId: parsed.data.branchId,
            type: "PAYMENT",
            amount: new Prisma.Decimal(paidAmount),
            purchaseOrderId: existing.id,
            supplierId: parsed.data.supplierId,
            createdById: session.id,
            note: parsed.data.note ?? `Chi tiền phiếu nhập ${existing.code}`
          }
        });
      }

      return updated;
    }, { maxWait: 10000, timeout: 30000 });

    await recalculatePurchasePaymentStateForPurchase(existing.id);
    await recalculateSupplierPayableDebtForSupplier(parsed.data.supplierId);
    if (existing.supplierId !== parsed.data.supplierId) {
      await recalculateSupplierPayableDebtForSupplier(existing.supplierId);
    }

    return NextResponse.json({ ok: true, purchase });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể cập nhật phiếu nhập" },
      { status: 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);

    const existing = await prisma.purchaseOrder.findUnique({
      where: { id: params.id },
      include: { items: true }
    });

    if (!existing) {
      return NextResponse.json({ error: "Không tìm thấy phiếu nhập" }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      for (const item of existing.items) {
        await tx.inventory.updateMany({
          where: {
            branchId: existing.branchId,
            productId: item.productId
          },
          data: {
            quantity: { decrement: item.quantity }
          }
        });
      }

      await tx.inventoryTransaction.deleteMany({
        where: {
          referenceCode: existing.code,
          type: "IMPORT"
        }
      });

      await tx.productBatch.deleteMany({
        where: {
          purchaseItemId: { in: existing.items.map((item) => item.id) }
        }
      });

      await tx.cashTransaction.deleteMany({
        where: { purchaseOrderId: existing.id }
      });

      await tx.purchaseOrder.delete({
        where: { id: existing.id }
      });
    }, { maxWait: 10000, timeout: 30000 });

    await recalculateSupplierPayableDebtForSupplier(existing.supplierId);

    return NextResponse.json({ ok: true, code: existing.code });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Không thể xóa phiếu nhập" },
      { status: 500 }
    );
  }
}
