import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiSession } from "@/lib/auth";
import { recalculatePurchasePaymentStateForPurchase, recalculateSupplierPayableDebtForSupplier } from "@/lib/debt-service";
import { nextCode } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";
import { purchasePermissionErrorResponse, requirePurchaseManager } from "@/lib/purchase-permissions";
import { runTransactionWithRetry } from "@/lib/transaction-retry";
import { purchaseSchema } from "@/lib/validations";

async function resolvePurchaseSupplierId(explicitSupplierId?: string) {
  if (explicitSupplierId) return explicitSupplierId;

  const fallbackSupplier = await prisma.supplier.findFirst({
    select: { id: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
  });

  return fallbackSupplier?.id ?? null;
}

type PurchaseStockDelta = {
  branchId: string;
  productId: string;
  quantityDelta: number;
};

function purchaseStockKey(branchId: string, productId: string) {
  return `${branchId}::${productId}`;
}

function addPurchaseStockDelta(
  deltas: Map<string, PurchaseStockDelta>,
  branchId: string,
  productId: string,
  quantityDelta: number
) {
  const key = purchaseStockKey(branchId, productId);
  const existing = deltas.get(key);
  deltas.set(key, {
    branchId,
    productId,
    quantityDelta: (existing?.quantityDelta ?? 0) + quantityDelta
  });
}

async function assertPurchaseChangeKeepsInventoryNonNegative(
  tx: Prisma.TransactionClient,
  deltas: Map<string, PurchaseStockDelta>,
  action: "sửa" | "xóa"
) {
  const negativeDeltas = Array.from(deltas.values()).filter((delta) => delta.quantityDelta < 0);
  if (negativeDeltas.length === 0) return;

  const productIds = Array.from(new Set(negativeDeltas.map((delta) => delta.productId)));
  const branchIds = Array.from(new Set(negativeDeltas.map((delta) => delta.branchId)));
  const [inventories, products] = await Promise.all([
    tx.inventory.findMany({
      where: {
        branchId: { in: branchIds },
        productId: { in: productIds },
        variantId: null
      },
      select: { branchId: true, productId: true, quantity: true }
    }),
    tx.product.findMany({
      where: { id: { in: productIds } },
      select: { id: true, name: true }
    })
  ]);

  const inventoryByKey = new Map(
    inventories.reduce<Array<[string, number]>>((entries, inventory) => {
      if (!inventory.productId) return entries;
      const key = purchaseStockKey(inventory.branchId, inventory.productId);
      const existing = entries.find(([entryKey]) => entryKey === key);
      if (existing) existing[1] += inventory.quantity;
      else entries.push([key, inventory.quantity]);
      return entries;
    }, [])
  );
  const productNameById = new Map(products.map((product) => [product.id, product.name]));
  const insufficientItems = negativeDeltas
    .map((delta) => {
      const currentQuantity = inventoryByKey.get(purchaseStockKey(delta.branchId, delta.productId)) ?? 0;
      const nextQuantity = currentQuantity + delta.quantityDelta;
      return {
        productName: productNameById.get(delta.productId) ?? delta.productId,
        currentQuantity,
        nextQuantity,
        decreaseQuantity: Math.abs(delta.quantityDelta)
      };
    })
    .filter((item) => item.nextQuantity < 0);

  if (insufficientItems.length === 0) return;

  const detail = insufficientItems
    .map(
      (item) =>
        `${item.productName} hiện còn ${item.currentQuantity}, cần trừ ${item.decreaseQuantity}, sẽ còn ${item.nextQuantity}`
    )
    .join("; ");
  throw new Error(`Không thể ${action} phiếu nhập vì sẽ làm âm hàng: ${detail}.`);
}

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
  const quantityByProduct = new Map<string, number>();
  for (const item of purchase.items) {
    quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) ?? 0) + item.quantity);
  }

  const existingInventories = await tx.inventory.findMany({
    where: {
      branchId: purchase.branchId,
      variantId: null,
      productId: { in: Array.from(quantityByProduct.keys()) }
    },
    select: { id: true, productId: true, quantity: true },
    orderBy: { updatedAt: "desc" }
  });
  const inventoryRowsByProduct = new Map<string, Array<{ id: string; quantity: number }>>();
  for (const inventory of existingInventories) {
    if (!inventory.productId) continue;
    const rows = inventoryRowsByProduct.get(inventory.productId) ?? [];
    rows.push({ id: inventory.id, quantity: inventory.quantity });
    inventoryRowsByProduct.set(inventory.productId, rows);
  }

  for (const [productId, quantity] of quantityByProduct.entries()) {
    const rows = inventoryRowsByProduct.get(productId) ?? [];
    const firstRow = rows[0];

    if (direction === "increment") {
      if (firstRow) {
        await tx.inventory.update({
          where: { id: firstRow.id },
          data: { quantity: { increment: quantity } }
        });
        continue;
      }

      await tx.inventory.create({
        data: {
          branchId: purchase.branchId,
          productId,
          variantId: null,
          quantity
        }
      });
      continue;
    }

    let remaining = quantity;
    for (const row of rows) {
      if (remaining <= 0) break;
      if (row.quantity <= 0) continue;
      const used = Math.min(row.quantity, remaining);
      const result = await tx.inventory.updateMany({
        where: {
          id: row.id,
          quantity: { gte: used }
        },
        data: { quantity: { decrement: used } }
      });
      if (result.count !== 1) {
        throw new Error(`Tồn kho vừa thay đổi, không thể trừ ${quantity} sản phẩm ${productId}.`);
      }
      remaining -= used;
    }

    if (remaining > 0) {
      throw new Error(`Không thể trừ tồn kho vì sản phẩm ${productId} không đủ tồn.`);
    }
  }

  if (direction === "increment") {
    for (const item of purchase.items) {
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
    requirePurchaseManager(session);
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
    const supplierId = (await resolvePurchaseSupplierId(parsed.data.supplierId)) ?? existing.supplierId;

    const totalAmount = normalizedItems.reduce((sum, item) => sum + item.quantity * item.importPrice, 0);
    const paidAmount = parsed.data.paidAmount;
    const debtAmount = Math.max(totalAmount - paidAmount, 0);
    const status = debtAmount > 0 ? "PARTIAL" : "COMPLETED";
    const paymentCode = paidAmount > 0 ? await nextCode("PC", "cashTransaction") : null;

    const purchase = await runTransactionWithRetry(async (tx) => {
      const inventoryDeltas = new Map<string, PurchaseStockDelta>();
      for (const item of existing.items) {
        addPurchaseStockDelta(inventoryDeltas, existing.branchId, item.productId, -item.quantity);
      }
      for (const item of normalizedItems) {
        addPurchaseStockDelta(inventoryDeltas, parsed.data.branchId, item.productId, item.quantity);
      }
      await assertPurchaseChangeKeepsInventoryNonNegative(tx, inventoryDeltas, "sửa");

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
          supplierId,
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
            supplierId,
            createdById: session.id,
            note: parsed.data.note ?? `Chi tiền phiếu nhập ${existing.code}`
          }
        });
      }

      return updated;
    }, { maxWait: 10000, timeout: 30000 });

    await recalculatePurchasePaymentStateForPurchase(existing.id);
    if (existing.supplierId !== supplierId) {
      await recalculateSupplierPayableDebtForSupplier(existing.supplierId);
    }

    return NextResponse.json({ ok: true, purchase });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const permissionError = purchasePermissionErrorResponse(message);
    if (permissionError) {
      return NextResponse.json(permissionError, { status: 403 });
    }

    return NextResponse.json(
      {
        error: /prisma|transaction|timed out|already closed/i.test(message)
          ? "Cập nhật phiếu nhập đang chậm hơn bình thường, vui lòng thử lại."
          : message || "Không thể cập nhật phiếu nhập"
      },
      { status: message.startsWith("Không thể sửa phiếu nhập vì sẽ làm âm hàng") ? 400 : 500 }
    );
  }
}

export async function DELETE(_: Request, { params }: { params: { id: string } }) {
  try {
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    requirePurchaseManager(session);

    const existing = await prisma.purchaseOrder.findUnique({
      where: { id: params.id },
      include: { items: true }
    });

    if (!existing) {
      return NextResponse.json({ error: "Không tìm thấy phiếu nhập" }, { status: 404 });
    }

    await runTransactionWithRetry(async (tx) => {
      const inventoryDeltas = new Map<string, PurchaseStockDelta>();
      for (const item of existing.items) {
        addPurchaseStockDelta(inventoryDeltas, existing.branchId, item.productId, -item.quantity);
      }
      await assertPurchaseChangeKeepsInventoryNonNegative(tx, inventoryDeltas, "xóa");

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

      await tx.purchaseOrder.delete({
        where: { id: existing.id }
      });
    }, { maxWait: 10000, timeout: 30000 });

    await recalculateSupplierPayableDebtForSupplier(existing.supplierId);

    return NextResponse.json({ ok: true, code: existing.code });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const permissionError = purchasePermissionErrorResponse(message);
    if (permissionError) {
      return NextResponse.json(permissionError, { status: 403 });
    }

    return NextResponse.json(
      {
        error: /prisma|transaction|timed out|already closed/i.test(message)
          ? "Xóa phiếu nhập đang chậm hơn bình thường, vui lòng thử lại."
          : message || "Không thể xóa phiếu nhập"
      },
      { status: message.startsWith("Không thể xóa phiếu nhập vì sẽ làm âm hàng") ? 400 : 500 }
    );
  }
}
