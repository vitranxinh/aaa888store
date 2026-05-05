export async function createOrderFromPayload(payload: OrderPayload): Promise<{ order: { id: string; code: string }; timing: CreateOrderTiming }> {
  console.time("create-order-total");
  const steps: PerfSteps = {};
  const totalStartedAt = Date.now();
  
  const [items, useCodeSequence] = await Promise.all([
    measureStep(steps, "loadItemsMs", () => loadOrderPayloadItems(payload.items)),
    measureStep(steps, "codeSequenceCheckMs", () => isCodeSequenceTableAvailable())
  ]);
  
  const derived = calculateOrderDerivedState(items, payload);
  
  const [code, receiptCode] = await measureStep(steps, "codeGenMs", () =>
    Promise.all([
      nextCode("DH", "order", undefined, { useSequence: useCodeSequence }),
      derived.paidAmount > 0
        ? nextCode("PT", "cashTransaction", undefined, { useSequence: useCodeSequence })
        : Promise.resolve(null)
    ])
  );

  const transactionQueuedAt = Date.now();
  let transactionStartedAt = 0;
  
  const { order, transactionSteps } = (await measureStep(steps, "transactionMs", () =>
    runTransactionWithRetry(async (tx: Prisma.TransactionClient) => {
      transactionStartedAt = Date.now();
      const tSteps: PerfSteps = {};
      const quantityByProduct = aggregateQuantityByProduct(items);
      const productIds = Array.from(quantityByProduct.keys());

      // 1. Tạo ID trước để tránh lỗi Foreign Key khi chạy song song
      const idResult = await tx.$queryRaw<any[]>`SELECT gen_random_uuid()::text as id`;
      const orderId = idResult[0].id;

      // 2. BƯỚC 1: SONG SONG HÓA TOÀN BỘ FETCH & CREATE CHÍNH
      const [created, inventories, batches] = await Promise.all([
        tx.order.create({
          data: {
            id: orderId,
            code,
            branchId: payload.branchId,
            customerId: payload.customerId,
            createdById: payload.createdById,
            status: derived.finalStatus,
            subtotal: new Prisma.Decimal(derived.totals.subtotal),
            discountTotal: new Prisma.Decimal(derived.totals.itemDiscountTotal + payload.orderDiscount),
            otherCharge: new Prisma.Decimal(payload.otherCharge),
            grandTotal: new Prisma.Decimal(derived.grandTotal),
            profitEstimate: new Prisma.Decimal(derived.totals.profitEstimate),
            paymentMethod: payload.paymentMethod,
            paidAmount: new Prisma.Decimal(derived.paidAmount),
            debtAmount: new Prisma.Decimal(derived.debtAmount),
            note: payload.note,
            items: {
              create: items.map((item) => ({
                productId: item.product.id,
                quantity: item.quantity,
                unitPrice: new Prisma.Decimal(item.unitPrice),
                costPrice: item.product.costPrice,
                discountValue: new Prisma.Decimal(item.discountValue),
                total: new Prisma.Decimal(item.unitPrice * item.quantity - item.discountValue)
              }))
            }
          },
          select: { id: true, code: true }
        }),
        tx.inventory.findMany({
          where: { branchId: payload.branchId, productId: { in: productIds }, variantId: null },
          select: { productId: true, quantity: true }
        }),
        tx.productBatch.findMany({
          where: { branchId: payload.branchId, productId: { in: productIds }, quantity: { gt: 0 } },
          orderBy: [{ productId: "asc" }, { expiryDate: "asc" }, { createdAt: "asc" }],
          select: { id: true, productId: true, batchNumber: true, quantity: true }
        }),
        tx.customer.update({
          where: { id: payload.customerId },
          data: {
            totalSpend: { increment: derived.grandTotal },
            loyaltyPoints: { increment: Math.floor(derived.grandTotal / 100000) },
            receivableDebt: { increment: derived.debtAmount }
          }
        }),
        derived.paidAmount > 0 ? tx.cashTransaction.create({
          data: {
            code: receiptCode ?? "",
            branchId: payload.branchId,
            type: CashTxnType.RECEIPT,
            amount: new Prisma.Decimal(derived.paidAmount),
            customerId: payload.customerId,
            orderId: orderId, // Đã có ID thật từ bước trước
            createdById: payload.createdById,
            note: payload.note ?? `Thu tiền cho hóa đơn ${code}`
          }
        }) : Promise.resolve(null)
      ]);

      // 3. BƯỚC 2: SONG SONG HÓA CẬP NHẬT KHO & LÔ HÀNG
      if (derived.finalStatus !== "DRAFT") {
        const invMap = new Map(inventories.map(i => [i.productId, i.quantity]));
        for (const [pid, reqQty] of quantityByProduct.entries()) {
          if ((invMap.get(pid) ?? 0) < reqQty) {
            throw new Error(`Sản phẩm ${items.find(it => it.product.id === pid)?.product.name} không đủ tồn kho`);
          }
        }

        const batchUpdates: any[] = [];
        const invTxns: any[] = [];
        const batchesByProduct = new Map<string, any[]>();
        for (const b of batches) {
          const arr = batchesByProduct.get(b.productId) ?? [];
          arr.push(b);
          batchesByProduct.set(b.productId, arr);
        }

        for (const [productId, requestedQuantity] of quantityByProduct.entries()) {
          let remaining = requestedQuantity;
          const pBatches = batchesByProduct.get(productId) ?? [];
          for (const batch of pBatches) {
            if (remaining <= 0) break;
            const used = Math.min(batch.quantity, remaining);
            remaining -= used;
            batchUpdates.push({ id: batch.id, quantity: used });
            invTxns.push({
              branchId: payload.branchId, productId, batchId: batch.id, type: "SALE",
              quantity: -used, referenceCode: code, createdById: payload.createdById,
              note: `Xuất theo lô ${batch.batchNumber}`
            });
          }
          if (remaining > 0) {
            invTxns.push({
              branchId: payload.branchId, productId, type: "SALE",
              quantity: -remaining, referenceCode: code, createdById: payload.createdById,
              note: "Xuất phần tồn kho chưa gắn lô"
            });
          }
        }

        const writeTasks: Promise<any>[] = [
          tx.$executeRaw`
            UPDATE "Inventory" 
            SET "quantity" = "quantity" - (CASE "productId" ${Prisma.join(Array.from(quantityByProduct.entries()).map(([id, qty]) => Prisma.sql`WHEN ${id} THEN ${qty}`), " ")} ELSE 0 END)
            WHERE "branchId" = ${payload.branchId} AND "variantId" IS NULL AND "productId" IN (${Prisma.join(productIds)})
          `,
          tx.inventoryTransaction.createMany({ data: invTxns })
        ];

        if (batchUpdates.length > 0) {
          writeTasks.push(tx.$executeRaw`
            UPDATE "ProductBatch"
            SET "quantity" = "quantity" - (CASE "id" ${Prisma.join(batchUpdates.map(b => Prisma.sql`WHEN ${b.id} THEN ${b.quantity}`), " ")} ELSE 0 END)
            WHERE "id" IN (${Prisma.join(batchUpdates.map(b => b.id))})
          `);
        }

        await measureStep(tSteps, "applyEffectsMs", () => Promise.all(writeTasks));
      }

      tSteps.transactionTotalMs = Date.now() - transactionStartedAt;
      return { order: created, transactionSteps: tSteps };
    }, { maxWait: 10000, timeout: 30000 }))) as { order: { id: string; code: string }; transactionSteps: PerfSteps };

  steps.transactionWaitMs = transactionStartedAt > 0 ? transactionStartedAt - transactionQueuedAt : 0;
  Object.assign(steps, transactionSteps);
  steps.totalMs = Date.now() - totalStartedAt;

  console.info("[perf][create-order]", { 
    code, 
    itemCount: items.length, 
    total: `${steps.totalMs}ms`,
    db: `${steps.transactionMs}ms`,
    steps 
  });
  console.timeEnd("create-order-total");

  return {
    order,
    timing: {
      loadItemsMs: steps.loadItemsMs,
      deriveStateMs: steps.deriveStateMs,
      codeGenMs: steps.codeGenMs,
      transactionWaitMs: steps.transactionWaitMs,
      transactionMs: steps.transactionMs,
      createOrderMs: steps.createOrderMs,
      createOrderItemsMs: steps.createOrderItemsMs,
      inventoryValidationMs: steps.inventoryValidationMs,
      inventoryUpdateMs: steps.inventoryUpdateMs,
      customerDebtUpdateMs: steps.customerDebtUpdateMs,
      cashTransactionMs: steps.cashTransactionMs,
      cashAndDebtUpdateMs: steps.cashAndDebtUpdateMs,
      batchFetchMs: steps.batchFetchMs,
      batchPersistMs: steps.batchPersistMs,
      batchAllocationMs: steps.batchAllocationMs,
      totalMs: steps.totalMs
    }
  };
}
