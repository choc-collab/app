import { describe, it, expect } from "vitest";
import {
  latestPackagingUnitCost,
  averageProductCost,
  calculateBoxCost,
  calculateBoxPricing,
  marginHealth,
  formatPrice,
  formatMarginPercent,
  marginDelta,
} from "./collectionPricing";
import type { PackagingOrder } from "@/types";

// --- latestPackagingUnitCost ---

describe("latestPackagingUnitCost", () => {
  it("returns null for empty orders", () => {
    expect(latestPackagingUnitCost([])).toBeNull();
  });

  it("returns the price from the most recent order", () => {
    const orders: PackagingOrder[] = [
      { packagingId: "p1", quantity: 100, pricePerUnit: 1.50, orderedAt: new Date("2026-01-15") },
      { packagingId: "p1", quantity: 200, pricePerUnit: 1.80, orderedAt: new Date("2026-03-01") },
      { packagingId: "p1", quantity: 50, pricePerUnit: 1.60, orderedAt: new Date("2026-02-10") },
    ];
    expect(latestPackagingUnitCost(orders)).toBe(1.80);
  });

  it("handles a single order", () => {
    const orders: PackagingOrder[] = [
      { packagingId: "p1", quantity: 100, pricePerUnit: 2.25, orderedAt: new Date("2026-01-01") },
    ];
    expect(latestPackagingUnitCost(orders)).toBe(2.25);
  });
});

// --- averageProductCost ---

describe("averageProductCost", () => {
  it("returns null for empty list", () => {
    expect(averageProductCost([])).toBeNull();
  });

  it("returns correct stats for a single entry", () => {
    const result = averageProductCost([{ productId: "r1", costPerProduct: 0.85 }]);
    expect(result).toEqual({ avg: 0.85, min: 0.85, max: 0.85, count: 1 });
  });

  it("calculates avg, min, max for multiple entries", () => {
    const costs = [
      { productId: "r1", costPerProduct: 0.60 },
      { productId: "r2", costPerProduct: 1.20 },
      { productId: "r3", costPerProduct: 0.90 },
    ];
    const result = averageProductCost(costs)!;
    expect(result.count).toBe(3);
    expect(result.min).toBe(0.60);
    expect(result.max).toBe(1.20);
    expect(result.avg).toBeCloseTo(0.90, 10);
  });
});

// --- calculateBoxCost ---

describe("calculateBoxCost", () => {
  it("multiplies avg cost by capacity and adds packaging cost", () => {
    // 9 products at €0.90 avg + €1.80 box = €9.90
    expect(calculateBoxCost(0.90, 9, 1.80)).toBeCloseTo(9.90, 10);
  });

  it("works with zero packaging cost", () => {
    expect(calculateBoxCost(1.00, 4, 0)).toBeCloseTo(4.00, 10);
  });

  it("works with zero product cost", () => {
    expect(calculateBoxCost(0, 9, 2.00)).toBeCloseTo(2.00, 10);
  });
});

// --- calculateBoxPricing ---

describe("calculateBoxPricing", () => {
  it("computes full pricing breakdown", () => {
    // 4 products at €0.80 avg + €1.50 box = €4.70 cost, sell for €12
    const result = calculateBoxPricing(0.80, 4, 1.50, 12.00);
    expect(result.productCost).toBeCloseTo(3.20, 10);
    expect(result.packagingUnitCost).toBe(1.50);
    expect(result.totalCost).toBeCloseTo(4.70, 10);
    expect(result.sellPrice).toBe(12.00);
    expect(result.marginAbsolute).toBeCloseTo(7.30, 10);
    expect(result.marginPercent).toBeCloseTo(60.833, 1);
  });

  it("handles negative margin", () => {
    const result = calculateBoxPricing(2.00, 9, 3.00, 15.00);
    // cost = 18 + 3 = 21, sell = 15 → margin = -6
    expect(result.marginAbsolute).toBeCloseTo(-6.00, 10);
    expect(result.marginPercent).toBeCloseTo(-40.0, 1);
  });

  it("handles zero sell price", () => {
    const result = calculateBoxPricing(1.00, 4, 1.00, 0);
    expect(result.marginPercent).toBe(0);
    expect(result.marginAbsolute).toBeCloseTo(-5.00, 10);
  });
});

// --- marginHealth ---

describe("marginHealth", () => {
  it("returns 'healthy' for margins >= 40%", () => {
    expect(marginHealth(40)).toBe("healthy");
    expect(marginHealth(65)).toBe("healthy");
    expect(marginHealth(100)).toBe("healthy");
  });

  it("returns 'thin' for margins >= 0% but < 40%", () => {
    expect(marginHealth(0)).toBe("thin");
    expect(marginHealth(20)).toBe("thin");
    expect(marginHealth(39.9)).toBe("thin");
  });

  it("returns 'negative' for margins < 0%", () => {
    expect(marginHealth(-1)).toBe("negative");
    expect(marginHealth(-50)).toBe("negative");
  });
});

// --- formatPrice ---

describe("formatPrice", () => {
  it("formats with euro sign and 2 decimals", () => {
    expect(formatPrice(12.5)).toBe("€12.50");
    expect(formatPrice(0)).toBe("€0.00");
    expect(formatPrice(199.999)).toBe("€200.00");
  });

  it("uses custom currency symbol", () => {
    expect(formatPrice(12.5, "$")).toBe("$12.50");
    expect(formatPrice(24.95, "CA$")).toBe("CA$24.95");
    expect(formatPrice(9.99, "£")).toBe("£9.99");
    expect(formatPrice(15, "CHF")).toBe("CHF15.00");
  });
});

// --- formatMarginPercent ---

describe("formatMarginPercent", () => {
  it("adds + sign for positive values", () => {
    expect(formatMarginPercent(60.8)).toBe("+60.8%");
  });

  it("shows negative sign for negative values", () => {
    expect(formatMarginPercent(-12.3)).toBe("-12.3%");
  });

  it("adds + sign for zero", () => {
    expect(formatMarginPercent(0)).toBe("+0.0%");
  });
});

// --- marginDelta ---

describe("marginDelta", () => {
  it("computes a positive delta when margin improved", () => {
    const result = marginDelta(55.0, 50.0);
    expect(result.value).toBeCloseTo(5.0, 10);
    expect(result.label).toBe("+5.0pp");
    expect(result.improved).toBe(true);
  });

  it("computes a negative delta when margin worsened", () => {
    const result = marginDelta(40.0, 45.5);
    expect(result.value).toBeCloseTo(-5.5, 10);
    expect(result.label).toBe("-5.5pp");
    expect(result.improved).toBe(false);
  });

  it("handles zero delta", () => {
    const result = marginDelta(60.0, 60.0);
    expect(result.value).toBe(0);
    expect(result.label).toBe("+0.0pp");
    expect(result.improved).toBe(false);
  });
});
