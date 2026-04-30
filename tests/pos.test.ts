import { describe, expect, it } from "vitest";
import { buildOrderCode, calculateCartTotals } from "@/lib/pos";

describe("calculateCartTotals", () => {
  it("calculates subtotal, discount and profit correctly", () => {
    const result = calculateCartTotals(
      [
        {
          productId: "p1",
          name: "A",
          sku: "A1",
          quantity: 2,
          unitPrice: 100000,
          costPrice: 60000,
          discountValue: 10000
        },
        {
          productId: "p2",
          name: "B",
          sku: "B1",
          quantity: 1,
          unitPrice: 50000,
          costPrice: 30000,
          discountValue: 0
        }
      ],
      5000
    );

    expect(result.subtotal).toBe(250000);
    expect(result.itemDiscountTotal).toBe(10000);
    expect(result.grandTotal).toBe(235000);
    expect(result.profitEstimate).toBe(75000);
  });
});

describe("buildOrderCode", () => {
  it("increments order code with zero padding", () => {
    expect(buildOrderCode(0)).toBe("DH000001");
    expect(buildOrderCode(24)).toBe("DH000025");
  });
});
