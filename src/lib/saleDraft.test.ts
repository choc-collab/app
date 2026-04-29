import { describe, it, expect } from "vitest";
import {
  initSaleDraft,
  saleDraftReducer,
  countUses,
  usedCounts,
  filledCount,
  maxPrepareQuantity,
  DEFAULT_CATEGORY,
  type SaleDraft,
} from "./saleDraft";

const BIG = 100;

describe("initSaleDraft", () => {
  it("creates an empty box with the first cavity active", () => {
    const d = initSaleDraft(4);
    expect(d.capacity).toBe(4);
    expect(d.cells).toEqual([null, null, null, null]);
    expect(d.activeCellIndex).toBe(0);
    expect(d.query).toBe("");
    expect(d.category).toBe(DEFAULT_CATEGORY);
    expect(d.note).toBe("");
    expect(d.quantity).toBe(1);
  });

  it("handles zero capacity (no active marker)", () => {
    const d = initSaleDraft(0);
    expect(d.cells).toEqual([]);
    expect(d.activeCellIndex).toBeNull();
  });

  it("floors non-integer capacity", () => {
    expect(initSaleDraft(3.9).capacity).toBe(3);
  });
});

describe("selectCell", () => {
  it("moves the active marker to the tapped index", () => {
    const d = saleDraftReducer(initSaleDraft(4), { type: "selectCell", index: 2 });
    expect(d.activeCellIndex).toBe(2);
  });

  it("ignores out-of-range indices", () => {
    const start = initSaleDraft(4);
    expect(saleDraftReducer(start, { type: "selectCell", index: -1 })).toBe(start);
    expect(saleDraftReducer(start, { type: "selectCell", index: 99 })).toBe(start);
  });
});

describe("placeBonbon", () => {
  it("places the product in the active cell and advances", () => {
    let d = initSaleDraft(4);
    d = saleDraftReducer(d, { type: "placeBonbon", productId: "p1", stockAvailable: 10 });
    expect(d.cells).toEqual(["p1", null, null, null]);
    expect(d.activeCellIndex).toBe(1);
  });

  it("advances past already-filled cells", () => {
    let d = initSaleDraft(4);
    d = { ...d, cells: ["p1", null, "p2", null], activeCellIndex: 1 };
    d = saleDraftReducer(d, { type: "placeBonbon", productId: "p3", stockAvailable: 10 });
    expect(d.cells).toEqual(["p1", "p3", "p2", null]);
    expect(d.activeCellIndex).toBe(3);
  });

  it("wraps to the first empty cell when there is none after the active one", () => {
    let d = initSaleDraft(4);
    d = { ...d, cells: [null, null, null, null], activeCellIndex: 3 };
    d = saleDraftReducer(d, { type: "placeBonbon", productId: "p1", stockAvailable: 10 });
    expect(d.cells).toEqual([null, null, null, "p1"]);
    expect(d.activeCellIndex).toBe(0);
  });

  it("clears the active marker when placing the last bonbon", () => {
    let d = initSaleDraft(2);
    d = saleDraftReducer(d, { type: "placeBonbon", productId: "p1", stockAvailable: 5 });
    d = saleDraftReducer(d, { type: "placeBonbon", productId: "p2", stockAvailable: 5 });
    expect(d.cells).toEqual(["p1", "p2"]);
    expect(d.activeCellIndex).toBeNull();
  });

  it("is a no-op when nothing is active", () => {
    const start = { ...initSaleDraft(2), activeCellIndex: null };
    const next = saleDraftReducer(start, { type: "placeBonbon", productId: "p1", stockAvailable: 5 });
    expect(next).toEqual(start);
  });

  it("is a no-op when stock is exhausted (already placed ≥ stock)", () => {
    let d = initSaleDraft(3);
    // stockAvailable is 2 — we can place 2, the 3rd is a no-op.
    d = saleDraftReducer(d, { type: "placeBonbon", productId: "p1", stockAvailable: 2 });
    d = saleDraftReducer(d, { type: "placeBonbon", productId: "p1", stockAvailable: 2 });
    const before = d;
    d = saleDraftReducer(d, { type: "placeBonbon", productId: "p1", stockAvailable: 2 });
    expect(d).toEqual(before);
  });

  it("is a no-op when stockAvailable is 0", () => {
    const start = initSaleDraft(3);
    const next = saleDraftReducer(start, { type: "placeBonbon", productId: "p1", stockAvailable: 0 });
    expect(next).toEqual(start);
  });

  it("overwrites a previously-filled active cell (user re-selected a filled cell then placed)", () => {
    let d = initSaleDraft(3);
    d = saleDraftReducer(d, { type: "placeBonbon", productId: "p1", stockAvailable: BIG });
    d = saleDraftReducer(d, { type: "selectCell", index: 0 });
    d = saleDraftReducer(d, { type: "placeBonbon", productId: "p2", stockAvailable: BIG });
    expect(d.cells[0]).toBe("p2");
  });
});

describe("clearCell", () => {
  it("empties the cell and selects it", () => {
    let d = initSaleDraft(3);
    d = saleDraftReducer(d, { type: "placeBonbon", productId: "p1", stockAvailable: BIG });
    d = saleDraftReducer(d, { type: "placeBonbon", productId: "p2", stockAvailable: BIG });
    // cells = ["p1","p2",null], active=2. Now clear index 0.
    d = saleDraftReducer(d, { type: "clearCell", index: 0 });
    expect(d.cells).toEqual([null, "p2", null]);
    expect(d.activeCellIndex).toBe(0);
  });

  it("is a safe no-op on an already-empty cell — just selects it", () => {
    const start = initSaleDraft(3);
    const next = saleDraftReducer(start, { type: "clearCell", index: 2 });
    expect(next.cells).toEqual([null, null, null]);
    expect(next.activeCellIndex).toBe(2);
  });

  it("ignores out-of-range indices", () => {
    const start = initSaleDraft(3);
    expect(saleDraftReducer(start, { type: "clearCell", index: 10 })).toBe(start);
  });
});

describe("setQuery / setCategory", () => {
  it("updates the palette search string", () => {
    const d = saleDraftReducer(initSaleDraft(4), { type: "setQuery", query: "praline" });
    expect(d.query).toBe("praline");
  });

  it("updates the category filter", () => {
    const d = saleDraftReducer(initSaleDraft(4), { type: "setCategory", category: "Ganache" });
    expect(d.category).toBe("Ganache");
  });
});

describe("setNote / setQuantity", () => {
  it("stores a free-text note", () => {
    const d = saleDraftReducer(initSaleDraft(4), { type: "setNote", note: "For Marie, 3pm pickup" });
    expect(d.note).toBe("For Marie, 3pm pickup");
  });

  it("updates the quantity", () => {
    const d = saleDraftReducer(initSaleDraft(4), { type: "setQuantity", quantity: 5 });
    expect(d.quantity).toBe(5);
  });

  it("clamps quantity to at least 1", () => {
    expect(saleDraftReducer(initSaleDraft(4), { type: "setQuantity", quantity: 0 }).quantity).toBe(1);
    expect(saleDraftReducer(initSaleDraft(4), { type: "setQuantity", quantity: -3 }).quantity).toBe(1);
  });

  it("floors fractional quantities", () => {
    const d = saleDraftReducer(initSaleDraft(4), { type: "setQuantity", quantity: 3.7 });
    expect(d.quantity).toBe(3);
  });
});

describe("maxPrepareQuantity", () => {
  it("returns 0 for an empty box", () => {
    const stock = new Map([["p1", 100]]);
    expect(maxPrepareQuantity([null, null, null, null], stock)).toBe(0);
  });

  it("returns floor(stock / used) for a single-product box", () => {
    // 2 cells of p1, 10 in stock → can prep 5 identical boxes.
    expect(maxPrepareQuantity(["p1", "p1", null, null], new Map([["p1", 10]]))).toBe(5);
  });

  it("takes the minimum across all products used", () => {
    // p1: 2 cells, stock 10 → max 5. p2: 1 cell, stock 2 → max 2. Cap = 2.
    const cells = ["p1", "p1", "p2", null];
    const stock = new Map([
      ["p1", 10],
      ["p2", 2],
    ]);
    expect(maxPrepareQuantity(cells, stock)).toBe(2);
  });

  it("treats missing products as out of stock", () => {
    expect(maxPrepareQuantity(["p1", null, null, null], new Map())).toBe(0);
  });

  it("returns 0 when any product is below its per-box need", () => {
    // 3 cells of p1 but only 2 in stock → can't even prep one.
    expect(maxPrepareQuantity(["p1", "p1", "p1", null], new Map([["p1", 2]]))).toBe(0);
  });
});

describe("reset", () => {
  it("returns a fresh draft at the given capacity", () => {
    let d = initSaleDraft(4);
    d = saleDraftReducer(d, { type: "placeBonbon", productId: "p1", stockAvailable: BIG });
    d = saleDraftReducer(d, { type: "reset", capacity: 9 });
    expect(d).toEqual(initSaleDraft(9));
  });
});

describe("helpers", () => {
  it("countUses tallies a single product", () => {
    expect(countUses(["p1", "p2", "p1", null], "p1")).toBe(2);
  });

  it("usedCounts tallies all products", () => {
    const m = usedCounts(["p1", "p2", "p1", null, "p3"]);
    expect(m.get("p1")).toBe(2);
    expect(m.get("p2")).toBe(1);
    expect(m.get("p3")).toBe(1);
    expect(m.size).toBe(3);
  });

  it("filledCount counts non-null cells", () => {
    expect(filledCount(["p1", null, "p2", null])).toBe(2);
  });
});

describe("end-to-end scenario: fill a 4-box", () => {
  it("ends with all cavities filled and active marker cleared", () => {
    let d: SaleDraft = initSaleDraft(4);
    d = saleDraftReducer(d, { type: "placeBonbon", productId: "p1", stockAvailable: BIG });
    d = saleDraftReducer(d, { type: "placeBonbon", productId: "p2", stockAvailable: BIG });
    d = saleDraftReducer(d, { type: "placeBonbon", productId: "p1", stockAvailable: BIG });
    d = saleDraftReducer(d, { type: "placeBonbon", productId: "p3", stockAvailable: BIG });
    expect(d.cells).toEqual(["p1", "p2", "p1", "p3"]);
    expect(d.activeCellIndex).toBeNull();
    expect(filledCount(d.cells)).toBe(4);
  });
});
