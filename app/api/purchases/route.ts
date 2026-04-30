import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiSession } from "@/lib/auth";
import { nextCode } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";
import { purchaseSchema } from "@/lib/validations";

export async function POST(request: Request) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = await request.json();
    const parsed = purchaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu phiếu nhập không hợp lệ" }, { status: 400 });
    }

    const totalAmount = parsed.data.items.reduce((sum, item) => sum + item.quantity * item.importPrice, 0);
    const paidAmount = parsed.data.paidAmount;
    const debtAmount = Math.max(totalAmount - paidAmount, 0);
    const status = debtAmount > 0 ? "PARTIAL" : "COMPLETED";

    const purchase = await prisma.$transaction(async (tx) => {
      const created = await tx.purchaseOrder.create({
        data: {
          code: await nextCode("PN", "purchaseOrder"),
          branchId: parsed.data.branchId,
          supplierId: parsed.data.supplierId,
          createdById: session.id,
          status,
          totalAmount: new Prisma.Decimal(totalAmount),
          paidAmount: new Prisma.Decimal(paidAmount),
          debtAmount: new Prisma.Decimal(debtAmount),
          note: parsed.data.note,
          items: {
            create: parsed.data.items.map((item) => ({
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
        await tx.inventory.updateMany({
          where: { branchId: created.branchId, productId: item.productId },
          data: { quantity: { increment: item.quantity } }
        });

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
            createdById: session.id,
            note: `Nhập lô ${item.batchNumber}`
          }
        });
      }

      await tx.supplier.update({
        where: { id: created.supplierId },
        data: { payableDebt: { increment: debtAmount } }
      });

      if (paidAmount > 0) {
        await tx.cashTransaction.create({
          data: {
            code: await nextCode("PC", "cashTransaction"),
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
    });

    return NextResponse.json({ ok: true, purchase });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Không thể tạo phiếu nhập" }, { status: 500 });
  }
}
