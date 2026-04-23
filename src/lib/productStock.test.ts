import { describe, it, expect } from "vitest";
import { aggregateProductStock, getProductStockFromBatches } from "./productStock";

describe("aggregateProductStock", () => {
  it("sums currentStock across batches for the same product", () => {
    const result = aggregateProductStock([
      { productId: "p1", currentStock: 10 },
      { productId: "p1", currentStock: 5 },
      { productId: "p2", currentStock: 7 },
    ]);
    expect(result.get("p1")).toBe(15);
    expect(result.get("p2")).toBe(7);
  });

  it("falls back to actualYield when currentStock is missing", () => {
    const result = aggregateProductStock([
      { productId: "p1", actualYield: 20 },
    ]);
    expect(result.get("p1")).toBe(20);
  });

  it("prefers currentStock over actualYield", () => {
    const result = aggregateProductStock([
      { productId: "p1", currentStock: 8, actualYield: 20 },
    ]);
    expect(result.get("p1")).toBe(8);
  });

  it("skips batches marked gone", () => {
    const result = aggregateProductStock([
      { productId: "p1", currentStock: 10, stockStatus: "gone" },
      { productId: "p1", currentStock: 5 },
    ]);
    expect(result.get("p1")).toBe(5);
  });

  it("omits products with zero pieces", () => {
    const result = aggregateProductStock([
      { productId: "p1", currentStock: 0 },
      { productId: "p2", actualYield: 0 },
    ]);
    expect(result.has("p1")).toBe(false);
    expect(result.has("p2")).toBe(false);
  });

  it("does not count frozen pieces (frozenQty is on a separate axis)", () => {
    // Frozen pieces are stored in frozenQty and are NOT added to currentStock.
    // This test pins the contract: aggregate reads only currentStock/actualYield.
    const result = aggregateProductStock([
      { productId: "p1", currentStock: 4, frozenQty: 10 },
    ]);
    expect(result.get("p1")).toBe(4);
  });

  it("ignores negative stock defensively", () => {
    const result = aggregateProductStock([
      { productId: "p1", currentStock: -3 },
    ]);
    expect(result.has("p1")).toBe(false);
  });
});

describe("getProductStockFromBatches", () => {
  it("returns the total for one product", () => {
    expect(
      getProductStockFromBatches("p1", [
        { productId: "p1", currentStock: 10 },
        { productId: "p2", currentStock: 5 },
      ]),
    ).toBe(10);
  });

  it("returns 0 for products with no matching batches", () => {
    expect(getProductStockFromBatches("missing", [
      { productId: "p1", currentStock: 10 },
    ])).toBe(0);
  });
});
