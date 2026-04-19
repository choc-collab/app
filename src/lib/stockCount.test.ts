import { describe, it, expect } from "vitest";
import { reconcileStockCount } from "./stockCount";

describe("reconcileStockCount", () => {
  const batches = [
    { id: "a", currentStock: 20, fifoOrder: 1 }, // oldest
    { id: "b", currentStock: 30, fifoOrder: 2 },
    { id: "c", currentStock: 10, fifoOrder: 3 }, // newest
  ];

  it("returns no deltas when total already matches", () => {
    expect(reconcileStockCount(batches, 60)).toEqual([]);
  });

  it("deducts FIFO from the oldest batch", () => {
    // 60 → 50: remove 10 from oldest
    expect(reconcileStockCount(batches, 50)).toEqual([{ id: "a", nextStock: 10 }]);
  });

  it("spills across batches when the oldest is emptied", () => {
    // 60 → 25: zero out a (-20), then b (-15)
    expect(reconcileStockCount(batches, 25)).toEqual([
      { id: "a", nextStock: 0 },
      { id: "b", nextStock: 15 },
    ]);
  });

  it("zeroes everything when newTotal is 0", () => {
    expect(reconcileStockCount(batches, 0)).toEqual([
      { id: "a", nextStock: 0 },
      { id: "b", nextStock: 0 },
      { id: "c", nextStock: 0 },
    ]);
  });

  it("adds overflow to the newest batch only", () => {
    // 60 → 75: +15 on c
    expect(reconcileStockCount(batches, 75)).toEqual([{ id: "c", nextStock: 25 }]);
  });

  it("ignores fifoOrder in the input array — sorts internally", () => {
    const unsorted = [
      { id: "c", currentStock: 10, fifoOrder: 3 },
      { id: "a", currentStock: 20, fifoOrder: 1 },
      { id: "b", currentStock: 30, fifoOrder: 2 },
    ];
    expect(reconcileStockCount(unsorted, 50)).toEqual([{ id: "a", nextStock: 10 }]);
  });

  it("rounds fractional counts", () => {
    expect(reconcileStockCount(batches, 49.6)).toEqual([{ id: "a", nextStock: 10 }]);
  });

  it("returns empty for negative or NaN inputs", () => {
    expect(reconcileStockCount(batches, -1)).toEqual([]);
    expect(reconcileStockCount(batches, NaN)).toEqual([]);
  });

  it("handles an empty batch list", () => {
    expect(reconcileStockCount([], 10)).toEqual([]);
    expect(reconcileStockCount([], 0)).toEqual([]);
  });

  it("treats negative currentStock as zero", () => {
    const weird = [{ id: "x", currentStock: -5, fifoOrder: 1 }];
    // currentTotal treated as 0 → adding 10 lands on newest (only) batch
    expect(reconcileStockCount(weird, 10)).toEqual([{ id: "x", nextStock: 10 }]);
  });
});
