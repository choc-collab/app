import { describe, it, expect } from "vitest";
import {
  computeCommitStockDeltas,
  computeRestoreStockDeltas,
  tallyCells,
  type SaleStockBatch,
} from "./saleStock";

// Helper: one batch row
function batch(
  id: string,
  productId: string,
  currentStock: number,
  fifoOrder: number,
  extra: Partial<SaleStockBatch> = {},
): SaleStockBatch {
  return { id, productId, currentStock, fifoOrder, ...extra };
}

describe("tallyCells", () => {
  it("tallies filled cells by product id", () => {
    const m = tallyCells(["p1", "p2", "p1", null, "p3", "p1"]);
    expect(m.get("p1")).toBe(3);
    expect(m.get("p2")).toBe(1);
    expect(m.get("p3")).toBe(1);
  });

  it("ignores nulls", () => {
    const m = tallyCells([null, null, null]);
    expect(m.size).toBe(0);
  });
});

describe("computeCommitStockDeltas", () => {
  it("deducts from the oldest batch first (FIFO)", () => {
    const batches = [
      batch("b-old", "p1", 10, 1),  // oldest
      batch("b-new", "p1", 5, 2),
    ];
    const used = new Map([["p1", 3]]);
    const deltas = computeCommitStockDeltas(batches, used);
    expect(deltas).toEqual([{ id: "b-old", nextStock: 7 }]);
  });

  it("spills to the newer batch when the oldest is exhausted", () => {
    const batches = [
      batch("b-old", "p1", 4, 1),
      batch("b-new", "p1", 10, 2),
    ];
    const used = new Map([["p1", 7]]);
    const deltas = computeCommitStockDeltas(batches, used);
    // oldest drops to 0, newer drops by 3 (7 − 4).
    expect(deltas).toEqual([
      { id: "b-old", nextStock: 0 },
      { id: "b-new", nextStock: 7 },
    ]);
  });

  it("handles multiple products independently", () => {
    const batches = [
      batch("b1", "p1", 5, 1),
      batch("b2", "p2", 8, 1),
    ];
    const used = new Map([
      ["p1", 2],
      ["p2", 3],
    ]);
    const deltas = computeCommitStockDeltas(batches, used);
    expect(deltas).toContainEqual({ id: "b1", nextStock: 3 });
    expect(deltas).toContainEqual({ id: "b2", nextStock: 5 });
  });

  it("skips batches marked gone", () => {
    const batches = [
      batch("b-gone", "p1", 10, 1, { stockStatus: "gone" }),
      batch("b-live", "p1", 5, 2),
    ];
    const used = new Map([["p1", 2]]);
    const deltas = computeCommitStockDeltas(batches, used);
    // Deduction hits b-live because b-gone is ignored.
    expect(deltas).toEqual([{ id: "b-live", nextStock: 3 }]);
  });

  it("falls back to actualYield when currentStock is absent", () => {
    const batches = [
      batch("b1", "p1", 0, 1, { currentStock: undefined, actualYield: 20 }),
    ];
    const used = new Map([["p1", 5]]);
    const deltas = computeCommitStockDeltas(batches, used);
    expect(deltas).toEqual([{ id: "b1", nextStock: 15 }]);
  });

  it("clamps to zero rather than going negative", () => {
    const batches = [batch("b1", "p1", 2, 1)];
    const used = new Map([["p1", 10]]);  // more than we have
    const deltas = computeCommitStockDeltas(batches, used);
    expect(deltas).toEqual([{ id: "b1", nextStock: 0 }]);
  });

  it("returns no deltas for unknown products", () => {
    const batches = [batch("b1", "p1", 10, 1)];
    const used = new Map([["p-missing", 3]]);
    expect(computeCommitStockDeltas(batches, used)).toEqual([]);
  });

  it("returns no deltas when used count is 0", () => {
    const batches = [batch("b1", "p1", 10, 1)];
    const used = new Map([["p1", 0]]);
    expect(computeCommitStockDeltas(batches, used)).toEqual([]);
  });
});

describe("computeRestoreStockDeltas", () => {
  it("adds restored pieces to the newest batch", () => {
    const batches = [
      batch("b-old", "p1", 3, 1),
      batch("b-new", "p1", 1, 2),  // newest by fifoOrder
    ];
    const restore = new Map([["p1", 5]]);
    const deltas = computeRestoreStockDeltas(batches, restore);
    expect(deltas).toEqual([{ id: "b-new", nextStock: 6 }]);
  });

  it("restores multiple products", () => {
    const batches = [
      batch("b1", "p1", 2, 1),
      batch("b2", "p2", 0, 1),
    ];
    const restore = new Map([
      ["p1", 3],
      ["p2", 4],
    ]);
    const deltas = computeRestoreStockDeltas(batches, restore);
    expect(deltas).toContainEqual({ id: "b1", nextStock: 5 });
    expect(deltas).toContainEqual({ id: "b2", nextStock: 4 });
  });

  it("drops restores with no eligible batch (orphaned product)", () => {
    const batches: SaleStockBatch[] = [];
    const restore = new Map([["p1", 2]]);
    // Nothing to restore to — no-op, don't crash.
    expect(computeRestoreStockDeltas(batches, restore)).toEqual([]);
  });
});

describe("commit then restore cancels out", () => {
  // Regression check: voiding a prepared sale must leave stock at its
  // pre-prep total (though FIFO means the specific batch distribution can
  // differ — the round-trip in our model deducts from oldest and restores
  // to newest, which can shift inventory toward fresher batches).
  it("preserves the grand total", () => {
    const batches = [
      batch("b-old", "p1", 10, 1),
      batch("b-new", "p1", 5, 2),
    ];
    const used = new Map([["p1", 6]]);

    const commitDeltas = computeCommitStockDeltas(batches, used);
    const afterCommit = applyDeltas(batches, commitDeltas);

    const restoreDeltas = computeRestoreStockDeltas(afterCommit, used);
    const afterRestore = applyDeltas(afterCommit, restoreDeltas);

    const startTotal = batches.reduce((s, b) => s + (b.currentStock ?? 0), 0);
    const endTotal = afterRestore.reduce((s, b) => s + (b.currentStock ?? 0), 0);
    expect(endTotal).toBe(startTotal);
  });
});

function applyDeltas(
  batches: readonly SaleStockBatch[],
  deltas: readonly { id: string; nextStock: number }[],
): SaleStockBatch[] {
  const byId = new Map(deltas.map((d) => [d.id, d.nextStock]));
  return batches.map((b) =>
    byId.has(b.id) ? { ...b, currentStock: byId.get(b.id)! } : b,
  );
}
