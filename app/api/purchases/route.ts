import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { requireApiSession } from "@/lib/auth";
import { nextCode } from "@/lib/order-service";
import { prisma } from "@/lib/prisma";
import { runTransactionWithRetry } from "@/lib/transaction-retry";
import { purchaseSchema } from "@/lib/validations";

type PerfSteps = Record<string, number>;

async function measureStep<T>(steps: PerfSteps, key: string, task: () => Promise<T>) {
  const startedAt = Date.now();
  const result = await task();
  steps[key] = Date.now() - startedAt;
  return result;
}

function logPerfSummary(label: string, summary: Array<[string, number | undefined]>) {
  console.info(
    `${label} timing:\n${summary
      .map(([key, value]) => `- ${key}: ${Math.round(value ?? 0)} ms`)
      .join("\n")}`
  );
}

async function resolvePurchaseSupplierId(explicitSupplierId?: string) {
  if (explicitSupplierId) return explicitSupplierId;

  const fallbackSupplier = await prisma.supplier.findFirst({
    select: { id: true },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
  });

  if (!fallbackSupplier) {
    throw new Error("Chưa có nguồn nhập mặc định để tạo phiếu nhập");
  }

  return fallbackSupplier.id;
}

async function applyInventoryQuantityChanges(
  tx: Prisma.TransactionClient,
  branchId: string,
  quantityByProduct: Map<string, number>
) {
  const productIds = Array.from(quantityByProduct.keys());
  if (productIds.length === 0) return;

  const existingInventories = await tx.inventory.findMany({
    where: {
      branchId,
      variantId: null,
      productId: { in: productIds }
    },
    select: { productId: true }
  });
  const existingProductIds = new Set(
    existingInventories
      .map((inventory) => inventory.productId)
      .filter((productId): productId is string => Boolean(productId))
  );
  const missingProductIds = productIds.filter((productId) => !existingProductIds.has(productId));

  if (missingProductIds.length > 0) {
    await Promise.all(
      missingProductIds.map((productId) =>
        tx.inventory.create({
          data: {
            branchId,
            productId,
            quantity: 0
          }
        })
      )
    );
  }

  const caseClauses = Prisma.join(
    productIds.map((productId) => Prisma.sql`WHEN ${productId} THEN ${quantityByProduct.get(productId) ?? 0}`),
    " "
  );

  await tx.$executeRaw`
    UPDATE "Inventory"
    SET "quantity" = "quantity" + (CASE "productId" ${caseClauses} ELSE 0 END)
    WHERE "branchId" = ${branchId}
      AND "variantId" IS NULL
      AND "productId" IN (${Prisma.join(productIds)})
  `;
}

export async function POST(request: Request) {
  try {
    const steps: PerfSteps = {};
    const totalStartedAt = Date.now();
    const session = await requireApiSession(["ADMIN", "MANAGER", "CASHIER"]);
    const body = await measureStep(steps, "requestBodyMs", () => request.json());
    const parsed = purchaseSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Dữ liệu phiếu nhập không hợp lệ" }, { status: 400 });
    }

    const normalizedItems = parsed.data.items.map((item, index) => ({
      ...item,
      batchNumber: item.batchNumber?.trim() || `AUTO-${Date.now()}-${index + 1}`
    }));
    const supplierId = await measureStep(steps, "supplierResolveMs", () =>
      resolvePurchaseSupplierId(parsed.data.supplierId)
    );

    const totalAmount = normalizedItems.reduce((sum, item) => sum + item.quantity * item.importPrice, 0);
    const paidAmount = parsed.data.paidAmount;
    const debtAmount = Math.max(totalAmount - paidAmount, 0);
    const status = debtAmount > 0 ? "PARTIAL" : "COMPLETED";
    steps.validationMs = Date.now() - totalStartedAt - (steps.requestBodyMs ?? 0);
    const [purchaseCode, paymentCode] = await measureStep(steps, "codeGenMs", () =>
      Promise.all([
        nextCode("PN", "purchaseOrder"),
        paidAmount > 0 ? nextCode("PC", "cashTransaction") : Promise.resolve(null)
      ])
    );
    const quantityByProduct = new Map<string, number>();

    for (const item of normalizedItems) {
      quantityByProduct.set(item.productId, (quantityByProduct.get(item.productId) ?? 0) + item.quantity);
    }

    const transactionQueuedAt = Date.now();
    let transactionStartedAt = 0;
    const purchase = await measureStep(steps, "transactionMs", () =>
      runTransactionWithRetry(async (tx) => {
        transactionStartedAt = Date.now();
        const transactionSteps: PerfSteps = {};
        const created = await measureStep(transactionSteps, "createPurchaseMs", () =>
          tx.purchaseOrder.create({
            data: {
              code: purchaseCode,
              branchId: parsed.data.branchId,
              supplierId,
              createdById: session.id,
              status,
              totalAmount: new Prisma.Decimal(totalAmount),
              paidAmount: new Prisma.Decimal(paidAmount),
              debtAmount: new Prisma.Decimal(debtAmount),
              note: parsed.data.note
            },
            select: {
              id: true,
              code: true,
              branchId: true,
              supplierId: true,
              totalAmount: true,
              paidAmount: true,
              debtAmount: true,
              note: true,
              status: true
            }
          })
        );

        const createdItems = await measureStep(transactionSteps, "createPurchaseItemsMs", () =>
          tx.purchaseOrderItem.createManyAndReturn({
            data: normalizedItems.map((item) => ({
              purchaseOrderId: created.id,
              productId: item.productId,
              quantity: item.quantity,
              importPrice: new Prisma.Decimal(item.importPrice),
              total: new Prisma.Decimal(item.quantity * item.importPrice),
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : null
            })),
            select: {
              id: true,
              productId: true,
              quantity: true,
              batchNumber: true,
              expiryDate: true,
              importPrice: true
            }
          })
        );

        await measureStep(transactionSteps, "inventoryUpdateMs", () =>
          applyInventoryQuantityChanges(tx, created.branchId, quantityByProduct)
        );

        await measureStep(transactionSteps, "productBatchCreateMs", () =>
          tx.productBatch.createMany({
            data: createdItems.map((item) => ({
              branchId: created.branchId,
              productId: item.productId,
              batchNumber: item.batchNumber,
              expiryDate: item.expiryDate,
              quantity: item.quantity,
              importPrice: item.importPrice,
              purchaseItemId: item.id
            }))
          }).then(() => undefined)
        );
        await measureStep(transactionSteps, "inventoryTxnCreateMs", () =>
          tx.inventoryTransaction.createMany({
            data: createdItems.map((item) => ({
              branchId: created.branchId,
              productId: item.productId,
              type: "IMPORT",
              quantity: item.quantity,
              referenceCode: created.code,
              createdById: session.id,
              note: item.batchNumber ? `Nhập lô ${item.batchNumber}` : "Nhập hàng"
            }))
          }).then(() => undefined)
        );

        await measureStep(transactionSteps, "cashAndDebtUpdateMs", () =>
          Promise.all([
            measureStep(transactionSteps, "cashTransactionMs", () =>
              paidAmount > 0
                ? tx.cashTransaction.create({
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
                  }).then(() => undefined)
                : Promise.resolve()
            ),
            measureStep(transactionSteps, "supplierDebtUpdateMs", () =>
              tx.supplier.update({
                where: { id: created.supplierId },
                data: {
                  payableDebt: { increment: debtAmount }
                }
              }).then(() => undefined)
            )
          ]).then(() => undefined)
        );
        transactionSteps.transactionTotalMs = Date.now() - transactionStartedAt;

        console.info("[perf][create-purchase][transaction]", {
          code: created.code,
          itemCount: normalizedItems.length,
          ...transactionSteps
        });
        logPerfSummary("CreatePurchase transaction", [
          ["create order", transactionSteps.createPurchaseMs],
          ["create items", transactionSteps.createPurchaseItemsMs],
          ["inventory update", transactionSteps.inventoryUpdateMs],
          ["product batches", transactionSteps.productBatchCreateMs],
          ["inventory transactions", transactionSteps.inventoryTxnCreateMs],
          ["supplier debt update", transactionSteps.supplierDebtUpdateMs],
          ["cash transaction", transactionSteps.cashTransactionMs],
          ["transaction total", transactionSteps.transactionTotalMs]
        ]);

        return created;
      }, { maxWait: 10000, timeout: 15000 })
    );
    steps.transactionWaitMs = transactionStartedAt > 0 ? transactionStartedAt - transactionQueuedAt : 0;
    steps.revalidateRedirectMs = 0;

    console.info("[perf][create-purchase]", {
      code: purchase.code,
      itemCount: normalizedItems.length,
      supplierId,
      ...steps,
      totalMs: Date.now() - totalStartedAt
    });
    logPerfSummary("CreatePurchase", [
      ["validation", steps.validationMs],
      ["transaction wait/start", steps.transactionWaitMs],
      ["create order", undefined],
      ["create items", undefined],
      ["inventory update", undefined],
      ["debt update", undefined],
      ["cash transaction", undefined],
      ["transaction total", steps.transactionMs],
      ["revalidate/redirect", steps.revalidateRedirectMs],
      ["total", Date.now() - totalStartedAt]
    ]);

    return NextResponse.json({ ok: true, purchase });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    return NextResponse.json(
      {
        error: /prisma|transaction|timed out|already closed/i.test(message)
          ? "Tạo phiếu nhập đang chậm hơn bình thường, vui lòng thử lại."
          : message || "Không thể tạo phiếu nhập"
      },
      { status: 500 }
    );
  }
}
