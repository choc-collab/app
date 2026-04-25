import { describe, it, expect } from "vitest";
import { derivePackagingGrid } from "./cavityGrid";

describe("derivePackagingGrid", () => {
  describe("explicit rows and cols", () => {
    it("trusts explicit values even when they disagree with capacity", () => {
      // Operator override wins — capacity may be stale metadata.
      expect(derivePackagingGrid({ capacity: 12, rows: 2, cols: 4 })).toEqual({ rows: 2, cols: 4 });
    });

    it("uses explicit values when consistent with capacity", () => {
      expect(derivePackagingGrid({ capacity: 16, rows: 4, cols: 4 })).toEqual({ rows: 4, cols: 4 });
    });
  });

  describe("one dimension set", () => {
    it("derives cols from rows when rows divides capacity", () => {
      expect(derivePackagingGrid({ capacity: 12, rows: 3 })).toEqual({ rows: 3, cols: 4 });
    });

    it("derives rows from cols when cols divides capacity", () => {
      expect(derivePackagingGrid({ capacity: 12, cols: 4 })).toEqual({ rows: 3, cols: 4 });
    });

    it("falls back to near-square when rows does not divide capacity", () => {
      // rows=5 doesn't divide 12; ignore and use the default.
      expect(derivePackagingGrid({ capacity: 12, rows: 5 })).toEqual({ rows: 3, cols: 4 });
    });
  });

  describe("near-square factorisation", () => {
    it("factors perfect squares to a square grid", () => {
      expect(derivePackagingGrid({ capacity: 9 })).toEqual({ rows: 3, cols: 3 });
      expect(derivePackagingGrid({ capacity: 16 })).toEqual({ rows: 4, cols: 4 });
    });

    it("prefers near-square over wide for composites", () => {
      expect(derivePackagingGrid({ capacity: 12 })).toEqual({ rows: 3, cols: 4 });
      expect(derivePackagingGrid({ capacity: 24 })).toEqual({ rows: 4, cols: 6 });
    });

    it("degrades to a single row for prime capacities", () => {
      expect(derivePackagingGrid({ capacity: 7 })).toEqual({ rows: 1, cols: 7 });
      expect(derivePackagingGrid({ capacity: 5 })).toEqual({ rows: 1, cols: 5 });
    });
  });

  describe("edge cases", () => {
    it("returns 0x0 for zero capacity", () => {
      expect(derivePackagingGrid({ capacity: 0 })).toEqual({ rows: 0, cols: 0 });
    });

    it("handles capacity 1", () => {
      expect(derivePackagingGrid({ capacity: 1 })).toEqual({ rows: 1, cols: 1 });
    });

    it("ignores non-positive rows/cols", () => {
      expect(derivePackagingGrid({ capacity: 12, rows: 0, cols: -3 })).toEqual({ rows: 3, cols: 4 });
    });

    it("floors fractional capacity", () => {
      expect(derivePackagingGrid({ capacity: 12.9 })).toEqual({ rows: 3, cols: 4 });
    });
  });
});
