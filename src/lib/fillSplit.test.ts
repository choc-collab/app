import { describe, it, expect } from "vitest";
import { normaliseFillSplit, fillSplitTotal, type FillSplitRow } from "./fillSplit";

const rows = (...pairs: [string, number][]): FillSplitRow[] =>
  pairs.map(([id, fillPercentage]) => ({ id, fillPercentage }));

describe("normaliseFillSplit", () => {
  it("returns an empty split for no rows", () => {
    expect(normaliseFillSplit([], "a", 50)).toEqual({});
  });

  it("forces a sole filling to 100%, whatever was typed", () => {
    // One filling always occupies the whole fill volume — a lower number would
    // silently leave part of the cavity unaccounted for.
    expect(normaliseFillSplit(rows(["a", 100]), "a", 40)).toEqual({ a: 100 });
  });

  it("rebalances the other row so two fillings still total 100", () => {
    expect(normaliseFillSplit(rows(["a", 50], ["b", 50]), "a", 70)).toEqual({ a: 70, b: 30 });
  });

  it("preserves the relative weighting of untouched rows", () => {
    // 30:20 is 60:40 of the remainder, so 40 splits as 24:16 — not 20:20.
    expect(normaliseFillSplit(rows(["a", 50], ["b", 30], ["c", 20]), "a", 60))
      .toEqual({ a: 60, b: 24, c: 16 });
  });

  it("spreads evenly when the other rows have no weighting to preserve", () => {
    expect(normaliseFillSplit(rows(["a", 100], ["b", 0], ["c", 0]), "a", 40))
      .toEqual({ a: 40, b: 30, c: 30 });
  });

  it("always totals exactly 100, absorbing rounding on the last row", () => {
    // 100/3 does not divide evenly; the split must still add up.
    const split = normaliseFillSplit(rows(["a", 34], ["b", 33], ["c", 33]), "a", 33);
    expect(Object.values(split).reduce((s, v) => s + v, 0)).toBe(100);
  });

  it("clamps out-of-range input rather than propagating it", () => {
    expect(normaliseFillSplit(rows(["a", 50], ["b", 50]), "a", 150)).toEqual({ a: 100, b: 0 });
    expect(normaliseFillSplit(rows(["a", 50], ["b", 50]), "a", -20)).toEqual({ a: 0, b: 100 });
  });

  it("rounds fractional input to a whole percentage", () => {
    expect(normaliseFillSplit(rows(["a", 50], ["b", 50]), "a", 66.6)).toEqual({ a: 67, b: 33 });
  });

  it("gives the whole volume to the others when a row is zeroed", () => {
    expect(normaliseFillSplit(rows(["a", 50], ["b", 25], ["c", 25]), "a", 0))
      .toEqual({ a: 0, b: 50, c: 50 });
  });
});

describe("fillSplitTotal", () => {
  it("sums the split", () => {
    expect(fillSplitTotal(rows(["a", 60], ["b", 40]))).toBe(100);
  });

  it("reports a drifted total rather than hiding it", () => {
    // Legacy records were written row-by-row and can be off 100; the read-out
    // has to show the truth so the user can see it needs fixing.
    expect(fillSplitTotal(rows(["a", 60], ["b", 30]))).toBe(90);
  });

  it("treats a missing percentage as zero", () => {
    expect(fillSplitTotal([{ id: "a", fillPercentage: undefined as unknown as number }])).toBe(0);
  });
});
