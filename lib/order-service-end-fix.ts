      tSteps.transactionTotalMs = Date.now() - transactionStartedAt;
      return { order: created, transactionSteps: tSteps };
    }, { maxWait: 10000, timeout: 30000 }))) as { order: { id: string; code: string }; transactionSteps: PerfSteps };

  steps.transactionWaitMs = transactionStartedAt > 0 ? transactionStartedAt - transactionQueuedAt : 0;
  Object.assign(steps, transactionSteps);
  steps.totalMs = Date.now() - totalStartedAt;

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
