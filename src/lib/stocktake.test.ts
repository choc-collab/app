import { describe, it, expect } from "vitest";
import { planStocktake, isStocktakeEmpty, type StocktakeRowInput } from "./stocktake";

/** One product, one batch holding all of its stock. */
function row(
  productId: string,
  currentTotal: number,
  entered: number | null,
  productName = productId,
): StocktakeRowInput {
  return {
    productId,
    productName,
    currentTotal,
    entered,
    batches: [{ id: `${productId}-b1`, currentStock: currentTotal, fifoOrder: 1, batchNumber: `B-${productId}` }],
  };
}

describe("planStocktake", () => {
  it("classifies a lowered count as changed", () => {
    const plan = planStocktake([row("p1", 20, 12)]);
    expect(plan.changed).toEqual([{ productId: "p1", productName: "p1", from: 20, to: 12 }]);
    expect(plan.confirmed).toEqual([]);
    expect(plan.netDelta).toBe(-8);
  });

  it("classifies an unchanged count as confirmed, not changed", () => {
    const plan = planStocktake([row("p1", 20, 20)]);
    expect(plan.changed).toEqual([]);
    expect(plan.confirmed).toEqual([{ productId: "p1", productName: "p1", total: 20 }]);
    // Confirmed rows still count as counted — this is what clears the reminder.
    expect(plan.countedProductIds).toEqual(["p1"]);
    expect(plan.netDelta).toBe(0);
  });

  it("treats a blank entry as skipped and leaves it out of countedProductIds", () => {
    const plan = planStocktake([row("p1", 20, null)]);
    expect(plan.skipped).toEqual([{ productId: "p1", productName: "p1" }]);
    expect(plan.countedProductIds).toEqual([]);
    expect(plan.changed).toEqual([]);
    expect(plan.confirmed).toEqual([]);
  });

  it("skips negative and non-finite entries rather than saving them", () => {
    const plan = planStocktake([row("p1", 20, -5), row("p2", 8, NaN)]);
    expect(plan.skipped.map((s) => s.productId)).toEqual(["p1", "p2"]);
    expect(plan.countedProductIds).toEqual([]);
  });

  it("rounds fractional entries", () => {
    const plan = planStocktake([row("p1", 20, 12.4)]);
    expect(plan.changed[0].to).toBe(12);
  });

  it("counts an entry that rounds back to the current total as confirmed", () => {
    const plan = planStocktake([row("p1", 20, 20.2)]);
    expect(plan.changed).toEqual([]);
    expect(plan.confirmed).toEqual([{ productId: "p1", productName: "p1", total: 20 }]);
  });

  it("names batches that reconciliation would empty", () => {
    const plan = planStocktake([
      {
        productId: "p1",
        productName: "Hazelnut",
        currentTotal: 18,
        entered: 6,
        batches: [
          { id: "old", currentStock: 8, fifoOrder: 1, batchNumber: "B-001" },
          { id: "mid", currentStock: 4, fifoOrder: 2, batchNumber: "B-002" },
          { id: "new", currentStock: 6, fifoOrder: 3, batchNumber: "B-003" },
        ],
      },
    ]);
    // FIFO removes 12: all of B-001 (8) and all of B-002 (4).
    expect(plan.goneBatches).toEqual([
      { productId: "p1", productName: "Hazelnut", batchNumber: "B-001" },
      { productId: "p1", productName: "Hazelnut", batchNumber: "B-002" },
    ]);
  });

  it("reports no gone batches when the count only trims the oldest batch", () => {
    const plan = planStocktake([
      {
        productId: "p1",
        productName: "Hazelnut",
        currentTotal: 18,
        entered: 15,
        batches: [
          { id: "old", currentStock: 8, fifoOrder: 1, batchNumber: "B-001" },
          { id: "new", currentStock: 10, fifoOrder: 2, batchNumber: "B-002" },
        ],
      },
    ]);
    expect(plan.goneBatches).toEqual([]);
  });

  it("reports no gone batches when counting stock up", () => {
    const plan = planStocktake([row("p1", 5, 12)]);
    expect(plan.goneBatches).toEqual([]);
    expect(plan.netDelta).toBe(7);
  });

  it("flags every batch when a product is counted down to zero", () => {
    const plan = planStocktake([
      {
        productId: "p1",
        productName: "Hazelnut",
        currentTotal: 12,
        entered: 0,
        batches: [
          { id: "a", currentStock: 5, fifoOrder: 1, batchNumber: "B-001" },
          { id: "b", currentStock: 7, fifoOrder: 2, batchNumber: "B-002" },
        ],
      },
    ]);
    expect(plan.goneBatches.map((g) => g.batchNumber)).toEqual(["B-001", "B-002"]);
  });

  it("aggregates a mixed stocktake", () => {
    const plan = planStocktake([
      row("p1", 20, 12),   // changed, -8
      row("p2", 8, 8),     // confirmed
      row("p3", 4, null),  // skipped
      row("p4", 3, 9),     // changed, +6
    ]);
    expect(plan.changed.map((c) => c.productId)).toEqual(["p1", "p4"]);
    expect(plan.confirmed.map((c) => c.productId)).toEqual(["p2"]);
    expect(plan.skipped.map((s) => s.productId)).toEqual(["p3"]);
    expect(plan.countedProductIds).toEqual(["p1", "p2", "p4"]);
    expect(plan.netDelta).toBe(-2);
  });

  it("returns an empty plan for no rows", () => {
    const plan = planStocktake([]);
    expect(isStocktakeEmpty(plan)).toBe(true);
  });
});

describe("isStocktakeEmpty", () => {
  it("is true when every row was skipped", () => {
    expect(isStocktakeEmpty(planStocktake([row("p1", 5, null), row("p2", 3, null)]))).toBe(true);
  });

  it("is false when a row was merely confirmed", () => {
    expect(isStocktakeEmpty(planStocktake([row("p1", 5, 5)]))).toBe(false);
  });
});
