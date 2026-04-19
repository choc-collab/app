import { describe, it, expect } from "vitest";
import {
  scoreProductSimilarity,
  getProductFillingCategories,
  rankSimilarProducts,
} from "./productSimilarity";
import type { ProductFilling, Filling } from "@/types";

// ---------------------------------------------------------------------------
// scoreProductSimilarity
// ---------------------------------------------------------------------------

describe("scoreProductSimilarity", () => {
  it("returns 0 when both products have no categories", () => {
    expect(scoreProductSimilarity([], [])).toBe(0);
  });

  it("returns 0 when there is no category overlap", () => {
    const score = scoreProductSimilarity(
      ["Ganaches (Emulsions)"],
      ["Caramels & Syrups (Sugar-Based)"],
    );
    expect(score).toBe(0);
  });

  it("returns 0.8 for identical single-category products with no type info", () => {
    // Jaccard = 1.0, no type bonus → 0.8 * 1 = 0.8
    const score = scoreProductSimilarity(
      ["Ganaches (Emulsions)"],
      ["Ganaches (Emulsions)"],
    );
    expect(score).toBeCloseTo(0.8);
  });

  it("returns 1.0 for identical categories + identical product type", () => {
    const score = scoreProductSimilarity(
      ["Ganaches (Emulsions)"],
      ["Ganaches (Emulsions)"],
      "moulded",
      "moulded",
    );
    expect(score).toBeCloseTo(1.0);
  });

  it("applies the same-type bonus only when types match", () => {
    const withBonus = scoreProductSimilarity(
      ["Ganaches (Emulsions)"],
      ["Ganaches (Emulsions)"],
      "moulded",
      "moulded",
    );
    const withoutBonus = scoreProductSimilarity(
      ["Ganaches (Emulsions)"],
      ["Ganaches (Emulsions)"],
      "moulded",
      "truffle",
    );
    expect(withBonus).toBeGreaterThan(withoutBonus);
    expect(withBonus - withoutBonus).toBeCloseTo(0.2);
  });

  it("computes partial Jaccard for partial category overlap", () => {
    // A = {Ganache, Fruit}, B = {Ganache, Caramel} → intersection=1, union=3 → 1/3
    const score = scoreProductSimilarity(
      ["Ganaches (Emulsions)", "Fruit-Based (Pectins & Acids)"],
      ["Ganaches (Emulsions)", "Caramels & Syrups (Sugar-Based)"],
    );
    // 0.8 * (1/3) ≈ 0.267
    expect(score).toBeCloseTo(0.8 / 3);
  });

  it("handles duplicate categories by treating them as a set", () => {
    // Product A has two ganache fillings — should be treated as {Ganache}
    const withDuplicates = scoreProductSimilarity(
      ["Ganaches (Emulsions)", "Ganaches (Emulsions)"],
      ["Ganaches (Emulsions)"],
    );
    const withoutDuplicates = scoreProductSimilarity(
      ["Ganaches (Emulsions)"],
      ["Ganaches (Emulsions)"],
    );
    expect(withDuplicates).toBeCloseTo(withoutDuplicates);
  });

  it("caps the result at 1.0 even if both factors are high", () => {
    const score = scoreProductSimilarity(
      ["Ganaches (Emulsions)"],
      ["Ganaches (Emulsions)"],
      "moulded",
      "moulded",
    );
    expect(score).toBeLessThanOrEqual(1.0);
  });

  it("returns 0 when one product has no categories", () => {
    expect(scoreProductSimilarity([], ["Ganaches (Emulsions)"])).toBe(0);
    expect(scoreProductSimilarity(["Ganaches (Emulsions)"], [])).toBe(0);
  });

  it("type bonus has no effect when categories have zero overlap", () => {
    const score = scoreProductSimilarity(
      ["Ganaches (Emulsions)"],
      ["Caramels & Syrups (Sugar-Based)"],
      "moulded",
      "moulded",
    );
    // Jaccard = 0, type bonus = 0.2 → min(1, 0 + 0.2) = 0.2
    expect(score).toBeCloseTo(0.2);
  });
});

// ---------------------------------------------------------------------------
// getProductFillingCategories
// ---------------------------------------------------------------------------

describe("getProductFillingCategories", () => {
  const makeFilling = (id: string, category: string): Filling =>
    ({
      id,
      name: "Test Filling",
      category,
      source: "",
      description: "",
      allergens: [],
      instructions: "",
    }) as Filling;

  const makeRL = (fillingId: string): ProductFilling =>
    ({ id: "rl-1", productId: "rec-1", fillingId, sortOrder: 0, fillPercentage: 100 }) as ProductFilling;

  it("returns categories for known fillings", () => {
    const fillingsMap = new Map([
      ["l1", makeFilling("l1", "Ganaches (Emulsions)")],
      ["l2", makeFilling("l2", "Fruit-Based (Pectins & Acids)")],
    ]);
    const result = getProductFillingCategories([makeRL("l1"), makeRL("l2")], fillingsMap);
    expect(result).toEqual(["Ganaches (Emulsions)", "Fruit-Based (Pectins & Acids)"]);
  });

  it("filters out fillings not found in the map", () => {
    const fillingsMap = new Map([["l1", makeFilling("l1", "Ganaches (Emulsions)")]]);
    const result = getProductFillingCategories([makeRL("l1"), makeRL("l-missing")], fillingsMap);
    expect(result).toEqual(["Ganaches (Emulsions)"]);
  });

  it("returns empty array when no fillings", () => {
    expect(getProductFillingCategories([], new Map())).toEqual([]);
  });

  it("returns duplicate categories when multiple fillings share one", () => {
    const fillingsMap = new Map([
      ["l1", makeFilling("l1", "Ganaches (Emulsions)")],
      ["l2", makeFilling("l2", "Ganaches (Emulsions)")],
    ]);
    const result = getProductFillingCategories([makeRL("l1"), makeRL("l2")], fillingsMap);
    expect(result).toEqual(["Ganaches (Emulsions)", "Ganaches (Emulsions)"]);
  });
});

// ---------------------------------------------------------------------------
// rankSimilarProducts
// ---------------------------------------------------------------------------

describe("rankSimilarProducts", () => {
  it("returns empty array when no candidates", () => {
    expect(rankSimilarProducts(["Ganaches (Emulsions)"], "moulded", [])).toEqual([]);
  });

  it("excludes candidates with zero similarity", () => {
    const result = rankSimilarProducts(
      ["Ganaches (Emulsions)"],
      undefined,
      [{ productId: "r1", categories: ["Caramels & Syrups (Sugar-Based)"], productType: "truffle" }],
    );
    // No category overlap, no type match → score = 0 → excluded
    expect(result).toHaveLength(0);
  });

  it("sorts candidates by score descending", () => {
    const result = rankSimilarProducts(
      ["Ganaches (Emulsions)", "Fruit-Based (Pectins & Acids)"],
      "moulded",
      [
        // Partial match
        { productId: "r1", categories: ["Ganaches (Emulsions)"], productType: "truffle" },
        // Full category match + type match
        { productId: "r2", categories: ["Ganaches (Emulsions)", "Fruit-Based (Pectins & Acids)"], productType: "moulded" },
        // Full category match, no type
        { productId: "r3", categories: ["Ganaches (Emulsions)", "Fruit-Based (Pectins & Acids)"], productType: "truffle" },
      ],
    );
    expect(result[0].productId).toBe("r2"); // highest: full categories + same type
    expect(result[1].productId).toBe("r3"); // second: full categories, different type
    expect(result[2].productId).toBe("r1"); // lowest: partial categories
  });

  it("populates sharedCategories with deduplicated overlapping categories", () => {
    const result = rankSimilarProducts(
      ["Ganaches (Emulsions)", "Fruit-Based (Pectins & Acids)"],
      undefined,
      [
        {
          productId: "r1",
          categories: ["Ganaches (Emulsions)", "Ganaches (Emulsions)", "Fruit-Based (Pectins & Acids)"],
        },
      ],
    );
    expect(result).toHaveLength(1);
    // sharedCategories should be deduplicated
    expect(result[0].sharedCategories.sort()).toEqual(
      ["Fruit-Based (Pectins & Acids)", "Ganaches (Emulsions)"].sort(),
    );
  });

  it("includes only categories from the candidate that also appear in focus", () => {
    const result = rankSimilarProducts(
      ["Ganaches (Emulsions)"],
      undefined,
      [
        {
          productId: "r1",
          categories: ["Ganaches (Emulsions)", "Caramels & Syrups (Sugar-Based)"],
        },
      ],
    );
    expect(result[0].sharedCategories).toEqual(["Ganaches (Emulsions)"]);
  });
});
