export type CartLine = {
  productId: string;
  name: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  costPrice: number;
  discountValue: number;
};

export function calculateCartTotals(lines: CartLine[], orderDiscount = 0) {
  const subtotal = lines.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
  const itemDiscountTotal = lines.reduce((sum, item) => sum + item.discountValue, 0);
  const gross = subtotal - itemDiscountTotal - orderDiscount;
  const grandTotal = Math.max(gross, 0);
  const profitEstimate = lines.reduce(
    (sum, item) => sum + (item.unitPrice - item.costPrice) * item.quantity - item.discountValue,
    0
  ) - orderDiscount;

  return {
    subtotal,
    itemDiscountTotal,
    orderDiscount,
    grandTotal,
    profitEstimate
  };
}

export function buildOrderCode(lastOrderCount: number) {
  return `DH${String(lastOrderCount + 1).padStart(6, "0")}`;
}
