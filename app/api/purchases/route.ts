import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiSession } from "@/lib/auth";
import { recalculatePurchasePaymentStateForPurchase, recalculateSupplierPayableDebtForSupplier } from "@/lib/debt-service";
import { nextCode } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";
import { runTransactionWithRetry } from "@/lib/transaction-retry";
import { purchaseSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = await request.json();
    const parsed = purchaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu phiếu nhập không hợp lệ" }, { status: 400 });
    }

    const normalizedItems = parsed.data.items.map((item, index) => ({
      ...item,
      batchNumber: item.batchNumber?.trim() || `AUTO-${Date.now()}-${index + 1}`
    }));

    const totalAmount = normalizedItems.reduce((sum, item) => sum + item.quantity * item.importPrice, 0);
    const paidAmount = parsed.data.paidAmount;
    const debtAmount = Math.max(totalAmount - paidAmount, 0);
    const status = debtAmount > 0 ? "PARTIAL" : "COMPLETED";
    const purchaseCode = await nextCode("PN", "purchaseOrder");
    const paymentCode = paidAmount > 0 ? await nextCode("PC", "cashTransaction") : null;
    const quantityByProduct = new Map<string, number>();

    for (const item of normalizedItems) {
      quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) ?? 0) + item.quantity);
    }

    const purchase = await runTransactionWithRetry(async (tx) => {
      const created = await tx.purchaseOrder.create({
        data: {
          code: purchaseCode,
          branchId: parsed.data.branchId,
          supplierId: parsed.data.supplierId,
          createdById: session.id,
          status,
          totalAmount: new Prisma.Decimal(totalAmount),
          paidAmount: new Prisma.Decimal(paidAmount),
          debtAmount: new Prisma.Decimal(debtAmount),
          note: parsed.data.note,
          items: {
            create: normalizedItems.map((item) => ({
              productId: item.productId,
              quantity: item.quantity,
              importPrice: new Prisma.Decimal(item.importPrice),
              total: new Prisma.Decimal(item.quantity * item.importPrice),
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : null
            }))
          }
        },
        include: { items: true }
      });

      const existingInventories = await tx.inventory.findMany({
        where: {
          branchId: created.branchId,
          variantId: null,
          productId: { in: created.items.map((item) => item.productId) }
        },
        select: { id: true, productId: true }
      });
      const inventoryIdByProduct = new Map(
        existingInventories
          .filter((inventory): inventory is { id: string; productId: string } => Boolean(inventory.productId))
          .map((inventory) => [inventory.productId, inventory.id])
      );

      await Promise.all(
        Array.from(quantityByProduct.entries()).map(async ([productId, quantity]) => {
          const inventoryId = inventoryIdByProduct.get(productId);

          if (inventoryId) {
            await tx.inventory.update({
              where: { id: inventoryId },
              data: {
                quantity: { increment: quantity }
              }
            });
          } else {
            await tx.inventory.create({
              data: {
                branchId: created.branchId,
                productId,
                quantity
              }
            });
          }
        })
      );

      await Promise.all(
        created.items.map((item) =>
          Promise.all([
            tx.productBatch.create({
              data: {
                branchId: created.branchId,
                productId: item.productId,
                batchNumber: item.batchNumber,
                expiryDate: item.expiryDate,
                quantity: item.quantity,
                importPrice: item.importPrice,
                purchaseItemId: item.id
              }
            }),
            tx.inventoryTransaction.create({
              data: {
                branchId: created.branchId,
                productId: item.productId,
                type: "IMPORT",
                quantity: item.quantity,
                referenceCode: created.code,
                createdById: session.id,
                note: item.batchNumber ? `Nhập lô ${item.batchNumber}` : "Nhập hàng"
              }
            })
          ])
        )
      );

      if (paidAmount > 0) {
        await tx.cashTransaction.create({
          data: {
            code: paymentCode!,
            branchId: created.branchId,
            type: "PAYMENT",
            amount: new Prisma.Decimal(paidAmount),
            purchaseOrderId: created.id,
            supplierId: created.supplierId,
            createdById: session.id,
            note: parsed.data.note ?? `Chi tiền phiếu nhập ${created.code}`
          }
        });
      }

      return created;
    }, { maxWait: 10000, timeout: 30000 });

    await recalculatePurchasePaymentStateForPurchase(purchase.id);
    await recalculateSupplierPayableDebtForSupplier(purchase.supplierId);

    return NextResponse.json({ ok: true, purchase });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tạo phiếu nhập" }, { status: 500 });
  }
}
