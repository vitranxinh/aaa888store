export function calculateInvoiceDebtBreakdown(input: {
  grandTotal: number;
  paidAmount: number;
  debtAmount: number;
  oldDebtAmount?: number | null;
}) {
  const grandTotal = Math.max(Number(input.grandTotal) || 0, 0);
  const paidAmount = Math.max(Number(input.paidAmount) || 0, 0);
  const debtAmount = Math.max(Number(input.debtAmount) || 0, 0);
  const oldDebt = Math.max(Number(input.oldDebtAmount ?? 0) || 0, 0);
  const totalPayable = oldDebt + grandTotal;

  return {
    oldDebt,
    invoiceTotal: grandTotal,
    totalPayable,
    remainingDebt: debtAmount
  };
}
