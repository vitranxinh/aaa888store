import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiSession, resolveActorUserId } from "@/lib/auth";
import { recalculateSupplierPayableDebt } from "@/lib/debt-service";
import { nextCode } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";
import { purchaseSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const actorUserId = await resolveActorUserId(session);
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

    const purchase = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({
        data: {
          code: await nextCode("PN", "purchaseOrder"),
          branchId: parsed.data.branchId,
          supplierId: parsed.data.supplierId,
          createdById: actorUserId,
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

      for (const item of created.items) {
        const existingInventory = await tx.inventory.findFirst({
          where: {
            branchId: created.branchId,
            productId: item.productId,
            variantId: null
          },
          select: { id: true }
        });

        if (existingInventory) {
          await tx.inventory.update({
            where: { id: existingInventory.id },
            data: {
              quantity: { increment: item.quantity }
            }
          });
        } else {
          await tx.inventory.create({
            data: {
              branchId: created.branchId,
              productId: item.productId,
              quantity: item.quantity
            }
          });
        }

        await tx.productBatch.create({
          data: {
            branchId: created.branchId,
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
            branchId: created.branchId,
            productId: item.productId,
            type: "IMPORT",
            quantity: item.quantity,
            referenceCode: created.code,
            createdById: actorUserId,
            note: item.batchNumber ? `Nhập lô ${item.batchNumber}` : "Nhập hàng"
          }
        });
      }

      await recalculateSupplierPayableDebt(tx, created.supplierId);

      if (paidAmount > 0) {
        await tx.cashTransaction.create({
          data: {
            code: await nextCode("PC", "cashTransaction"),
            branchId: created.branchId,
            type: "PAYMENT",
            amount: new Prisma.Decimal(paidAmount),
            purchaseOrderId: created.id,
            supplierId: created.supplierId,
            createdById: actorUserId,
            note: parsed.data.note ?? `Chi tiền phiếu nhập ${created.code}`
          }
        });
      }

      return created;
    });

    return NextResponse.json({ ok: true, purchase });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tạo phiếu nhập" }, { status: 500 });
  }
}
