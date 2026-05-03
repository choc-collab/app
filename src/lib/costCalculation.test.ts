import { describe, it, expect } from "vitest";
import {
  calculateShellWeightG,
  calculateCapWeightG,
  calculateFillingWeightPerCavityG,
  calculateProductCost,
  deriveShellPercentageFromFractions,
  fillFractionToGrams,
  gramsToFillFraction,
  resolveCurrentCoatingCostPerGram,
  resolveCoatingCostAtDate,
  serializeBreakdown,
  deserializeBreakdown,
  buildIngredientCostMap,
  enrichBreakdownLabels,
  formatCost,
  costDelta,
  SHELL_FACTOR,
  CAP_FACTOR,
} from "./costCalculation";
import { FILL_FACTOR, DENSITY_G_PER_ML } from "./production";
import type { Mould, ProductFilling, FillingIngredient, Filling, CoatingChocolateMapping, Ingredient, BreakdownEntry } from "@/types";

const mockMould: Mould = {
  id: "1",
  name: "Test Mould",
  cavityWeightG: 10,
  numberOfCavities: 20,
};

// --- Weight calculations ---

describe("calculateShellWeightG", () => {
  it("computes shell weight from cavity weight using default shell percentage (37%)", () => {
    const weight = calculateShellWeightG(mockMould);
    // Default shellPercentage = 37 → 10 * 0.37 = 3.7
    expect(weight).toBeCloseTo(10 * 0.37);
  });

  it("uses a custom shellPercentage", () => {
    expect(calculateShellWeightG(mockMould, 50)).toBeCloseTo(10 * 0.50);
    expect(calculateShellWeightG(mockMould, 0)).toBe(0);
    expect(calculateShellWeightG(mockMould, 100)).toBeCloseTo(10);
  });
});

describe("calculateCapWeightG", () => {
  it("computes cap weight from cavity weight (legacy constant)", () => {
    const weight = calculateCapWeightG(mockMould);
    expect(weight).toBeCloseTo(10 * CAP_FACTOR);
  });
});

describe("calculateFillingWeightPerCavityG", () => {
  it("scales by fill percentage using default shell percentage (37%)", () => {
    // Default shellPercentage = 37 → fillFactor = 0.63
    const full = calculateFillingWeightPerCavityG(mockMould, 100);
    expect(full).toBeCloseTo(10 * 0.63 * DENSITY_G_PER_ML);

    const half = calculateFillingWeightPerCavityG(mockMould, 50);
    expect(half).toBeCloseTo(full / 2);
  });

  it("uses a custom shellPercentage", () => {
    // shellPercentage = 50 → fillFactor = 0.50
    const result = calculateFillingWeightPerCavityG(mockMould, 100, 50);
    expect(result).toBeCloseTo(10 * 0.50 * DENSITY_G_PER_ML);
  });

  it("returns 0 for 0% fill percentage", () => {
    expect(calculateFillingWeightPerCavityG(mockMould, 0)).toBe(0);
  });

  it("returns 0 when shellPercentage is 100 (no room for filling)", () => {
    const result = calculateFillingWeightPerCavityG(mockMould, 100, 100);
    expect(result).toBe(0);
  });
});

// --- calculateProductCost ---

describe("calculateProductCost", () => {
  const filling1: Filling = { id: "10", name: "Dark Ganache", category: "Ganaches (Emulsions)", source: "", description: "", allergens: [], instructions: "" };
  const productFilling: ProductFilling = { id: "1", productId: "1", fillingId: "10", sortOrder: 0, fillPercentage: 100 };
  const li1: FillingIngredient = { id: "1", fillingId: "10", ingredientId: "100", amount: 60, unit: "g", sortOrder: 0 };
  const li2: FillingIngredient = { id: "2", fillingId: "10", ingredientId: "101", amount: 40, unit: "g", sortOrder: 1 };

  const fillingIngredientsMap = new Map([["10", [li1, li2]]]);
  const fillingsMap = new Map([["10", filling1]]);
  const ingredientCostMap = new Map<string, number | null>([["100", 0.02], ["101", 0.01]]);

  it("calculates total cost correctly for one filling with coating", () => {
    const result = calculateProductCost({
      mould: mockMould,
      productFillings: [productFilling],
      fillingIngredientsMap,
      fillingsMap,
      ingredientCostMap,
      shellChocolateCostPerGram: 0.018,
      shellChocolateLabel: "dark",
    });

    expect(result.warnings).toHaveLength(0);
    expect(result.breakdown.length).toBeGreaterThan(0);

    // Verify shell entry exists (shell + cap are now combined into a single "shell" entry)
    const shellEntry = result.breakdown.find((e) => e.kind === "shell");
    expect(shellEntry).toBeDefined();

    // Verify filling ingredient entries
    const fillingEntries = result.breakdown.filter((e) => e.kind === "filling_ingredient");
    expect(fillingEntries).toHaveLength(2);

    // Verify total
    const expected = result.breakdown.reduce((s, e) => s + e.subtotal, 0);
    expect(result.costPerProduct).toBeCloseTo(expected);
  });

  it("returns 0 cost with warning when no mould provided", () => {
    const result = calculateProductCost({
      mould: null,
      productFillings: [productFilling],
      fillingIngredientsMap,
      fillingsMap,
      ingredientCostMap,
      shellChocolateCostPerGram: 0.018,
    });

    expect(result.costPerProduct).toBe(0);
    expect(result.breakdown).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it("warns and skips shell when no shell chocolate provided", () => {
    const result = calculateProductCost({
      mould: mockMould,
      productFillings: [productFilling],
      fillingIngredientsMap,
      fillingsMap,
      ingredientCostMap,
      shellChocolateCostPerGram: null,
    });

    const shellEntries = result.breakdown.filter((e) => e.kind === "shell");
    expect(shellEntries).toHaveLength(0);
    expect(result.warnings.some((w) => w.includes("shell"))).toBe(true);
  });

  it("warns and skips ingredient with no cost data", () => {
    const costMapMissingOne = new Map<string, number | null>([["100", 0.02], ["101", null]]);
    const result = calculateProductCost({
      mould: mockMould,
      productFillings: [productFilling],
      fillingIngredientsMap,
      fillingsMap,
      ingredientCostMap: costMapMissingOne,
      shellChocolateCostPerGram: 0.018,
    });

    expect(result.warnings.some((w) => w.includes("101"))).toBe(true); // ingredientId "101" appears in warning
    const fillingEntries = result.breakdown.filter((e) => e.kind === "filling_ingredient");
    expect(fillingEntries).toHaveLength(1); // only ingredient 100 contributed
  });

  it("proportions ingredient costs correctly by weight fraction", () => {
    const result = calculateProductCost({
      mould: mockMould,
      productFillings: [productFilling],
      fillingIngredientsMap,
      fillingsMap,
      ingredientCostMap,
      shellChocolateCostPerGram: null,
    });

    const fillingEntries = result.breakdown.filter((e) => e.kind === "filling_ingredient");
    const totalFillingWeight = fillingEntries.reduce((s, e) => s + e.grams, 0);
    const fillingWeight = calculateFillingWeightPerCavityG(mockMould, 100);
    expect(totalFillingWeight).toBeCloseTo(fillingWeight, 1);

    // ingredient 100: 60% of total, ingredient 101: 40%
    const e1 = fillingEntries.find((e) => e.ingredientId === "100");
    const e2 = fillingEntries.find((e) => e.ingredientId === "101");
    expect(e1!.grams / totalFillingWeight).toBeCloseTo(0.6, 2);
    expect(e2!.grams / totalFillingWeight).toBeCloseTo(0.4, 2);
  });
});

// --- resolveCoatingCostAtDate ---

describe("resolveCoatingCostAtDate", () => {
  const now = new Date("2026-03-23T12:00:00Z");
  const past1 = new Date("2026-01-01T00:00:00Z");
  const past2 = new Date("2026-02-15T00:00:00Z");
  const future = new Date("2026-06-01T00:00:00Z");

  const mappings: CoatingChocolateMapping[] = [
    { id: "1", coatingName: "dark", ingredientId: "200", effectiveFrom: past1 },
    { id: "2", coatingName: "dark", ingredientId: "201", effectiveFrom: past2 },
    { id: "3", coatingName: "dark", ingredientId: "202", effectiveFrom: future },
    { id: "4", coatingName: "milk", ingredientId: "205", effectiveFrom: past1 },
  ];
  const costMap = new Map<string, number | null>([["200", 0.015], ["201", 0.020], ["202", 0.025], ["205", 0.018]]);

  it("returns the most recent mapping on or before the query date", () => {
    const result = resolveCoatingCostAtDate("dark", mappings, costMap, now);
    expect(result.ingredientId).toBe("201"); // past2 is more recent than past1, but before now
    expect(result.costPerGram).toBeCloseTo(0.020);
  });

  it("ignores future-dated mappings", () => {
    // future mapping should not be picked for now
    const result = resolveCoatingCostAtDate("dark", mappings, costMap, now);
    expect(result.ingredientId).not.toBe("202");
  });

  it("returns null for unknown coating", () => {
    const result = resolveCoatingCostAtDate("white", mappings, costMap, now);
    expect(result.costPerGram).toBeNull();
    expect(result.ingredientId).toBeNull();
  });

  it("returns null when coatingName is undefined", () => {
    const result = resolveCoatingCostAtDate(undefined, mappings, costMap, now);
    expect(result.costPerGram).toBeNull();
  });

  it("can resolve an earlier date (historical lookup)", () => {
    // At past1, only the first entry should be active
    const earlyDate = new Date("2026-01-10T00:00:00Z");
    const result = resolveCoatingCostAtDate("dark", mappings, costMap, earlyDate);
    expect(result.ingredientId).toBe("200");
  });
});

describe("resolveCurrentCoatingCostPerGram", () => {
  it("picks the most recent mapping as of today", () => {
    const past = new Date("2025-01-01T00:00:00Z");
    const mappings: CoatingChocolateMapping[] = [
      { id: "1", coatingName: "dark", ingredientId: "300", effectiveFrom: past },
    ];
    const costMap = new Map<string, number | null>([["300", 0.022]]);
    const result = resolveCurrentCoatingCostPerGram("dark", mappings, costMap);
    expect(result.ingredientId).toBe("300");
    expect(result.costPerGram).toBeCloseTo(0.022);
  });
});

// --- buildIngredientCostMap ---

describe("buildIngredientCostMap", () => {
  it("derives costPerGram from purchase fields", () => {
    const ingredients: Ingredient[] = [
      { id: "1", name: "Cream", manufacturer: "", source: "", cost: 0, notes: "", allergens: [], cacaoFat: 0, sugar: 0, milkFat: 0, water: 0, solids: 0, otherFats: 0, purchaseCost: 5, purchaseQty: 1, gramsPerUnit: 1000 },
      { id: "2", name: "Butter", manufacturer: "", source: "", cost: 0, notes: "", allergens: [], cacaoFat: 0, sugar: 0, milkFat: 0, water: 0, solids: 0, otherFats: 0 },
    ];
    const map = buildIngredientCostMap(ingredients);
    expect(map.get("1")).toBeCloseTo(0.005); // 5 / (1 * 1000)
    expect(map.get("2")).toBeNull(); // no purchase data
  });
});

// --- enrichBreakdownLabels ---

describe("enrichBreakdownLabels", () => {
  const filling: Filling = { id: "10", name: "Dark Ganache", category: "Ganaches (Emulsions)", source: "", description: "", allergens: [], instructions: "" };
  const ingredient: Ingredient = { id: "100", name: "Heavy Cream", manufacturer: "", source: "", cost: 0, notes: "", allergens: [], cacaoFat: 0, sugar: 0, milkFat: 0, water: 0, solids: 0, otherFats: 0 };

  const fillingEntry: BreakdownEntry = {
    label: "filling #10 — ingredient #100",
    grams: 5,
    costPerGram: 0.01,
    subtotal: 0.05,
    kind: "filling_ingredient",
    ingredientId: "100",
    fillingId: "10",
  };

  it("replaces IDs with names when both are found", () => {
    const result = enrichBreakdownLabels(
      [fillingEntry],
      new Map([["100", ingredient]]),
      new Map([["10", filling]]),
    );
    expect(result[0].label).toBe("Dark Ganache — Heavy Cream");
  });

  it("falls back to filling name when ingredient not found", () => {
    const result = enrichBreakdownLabels(
      [fillingEntry],
      new Map(),
      new Map([["10", filling]]),
    );
    expect(result[0].label).toBe("Dark Ganache — ingredient #100");
  });

  it("falls back to ingredient name when filling not found", () => {
    const result = enrichBreakdownLabels(
      [fillingEntry],
      new Map([["100", ingredient]]),
      new Map(),
    );
    expect(result[0].label).toBe("filling #10 — Heavy Cream");
  });

  it("leaves entry unchanged when neither ingredient nor filling is found", () => {
    const result = enrichBreakdownLabels([fillingEntry], new Map(), new Map());
    expect(result[0].label).toBe(fillingEntry.label);
  });

  it("does not modify non-filling_ingredient entries", () => {
    const shellEntry: BreakdownEntry = { label: "Shell (dark)", grams: 3.6, costPerGram: 0.018, subtotal: 0.065, kind: "shell" };
    const result = enrichBreakdownLabels([shellEntry], new Map([["100", ingredient]]), new Map([["10", filling]]));
    expect(result[0].label).toBe("Shell (dark)");
  });

  it("handles entries with undefined ingredientId or fillingId", () => {
    const noIds: BreakdownEntry = { label: "orphan", grams: 1, costPerGram: 0.01, subtotal: 0.01, kind: "filling_ingredient" };
    const result = enrichBreakdownLabels([noIds], new Map([["100", ingredient]]), new Map([["10", filling]]));
    expect(result[0].label).toBe("orphan");
  });
});

// --- formatCost ---

describe("formatCost", () => {
  it("formats a positive cost with 3 decimal places and € prefix", () => {
    expect(formatCost(0.125)).toBe("€0.125");
  });

  it("formats zero", () => {
    expect(formatCost(0)).toBe("€0.000");
  });

  it("formats a negative cost", () => {
    expect(formatCost(-0.05)).toBe("€-0.050");
  });

  it("rounds to 3 decimal places", () => {
    expect(formatCost(0.12345)).toBe("€0.123");
    expect(formatCost(0.12355)).toBe("€0.124");
  });

  it("formats larger values", () => {
    expect(formatCost(1.5)).toBe("€1.500");
  });

  it("uses custom currency symbol", () => {
    expect(formatCost(0.125, "$")).toBe("$0.125");
    expect(formatCost(1.5, "CA$")).toBe("CA$1.500");
    expect(formatCost(0, "£")).toBe("£0.000");
  });
});

// --- costDelta ---

describe("costDelta", () => {
  it("returns positive delta with + prefix label", () => {
    const result = costDelta(0.15, 0.10);
    expect(result.value).toBeCloseTo(0.05);
    expect(result.label).toBe("+€0.050");
    expect(result.positive).toBe(true);
  });

  it("returns negative delta without + prefix", () => {
    const result = costDelta(0.08, 0.10);
    expect(result.value).toBeCloseTo(-0.02);
    expect(result.label).toBe("€-0.020");
    expect(result.positive).toBe(false);
  });

  it("returns zero delta as positive", () => {
    const result = costDelta(0.10, 0.10);
    expect(result.value).toBeCloseTo(0);
    expect(result.label).toBe("+€0.000");
    expect(result.positive).toBe(true);
  });

  it("uses custom currency symbol", () => {
    const result = costDelta(0.15, 0.10, "$");
    expect(result.label).toBe("+$0.050");
  });
});

// --- Serialization ---

describe("serializeBreakdown / deserializeBreakdown", () => {
  it("round-trips correctly", () => {
    const entries = [
      { label: "Test", grams: 5, costPerGram: 0.01, subtotal: 0.05, kind: "shell" as const },
    ];
    const json = serializeBreakdown(entries);
    const parsed = deserializeBreakdown(json);
    expect(parsed).toEqual(entries);
  });

  it("returns empty array for invalid JSON", () => {
    expect(deserializeBreakdown("not json{{")).toEqual([]);
  });
});

// --- deriveShellPercentageFromFractions ---

describe("deriveShellPercentageFromFractions", () => {
  it("returns 100 when there are no fillings", () => {
    expect(deriveShellPercentageFromFractions(0)).toBe(100);
  });

  it("returns 0 when fillings fill the entire cavity volume", () => {
    expect(deriveShellPercentageFromFractions(1)).toBe(0);
  });

  it("returns 0 when fillings exceed the cavity volume", () => {
    expect(deriveShellPercentageFromFractions(1.5)).toBe(0);
  });

  it("computes correct percentage for partial fill", () => {
    // half the cavity is filled → 50% shell
    expect(deriveShellPercentageFromFractions(0.5)).toBeCloseTo(50);
  });
});

// --- fillFractionToGrams / gramsToFillFraction round-trip ---

describe("fill fraction conversion", () => {
  it("converts grams to fraction and back", () => {
    // 10g cavity (≈10ml), 6g filling at density 1.2 → 5ml → 50% of cavity
    const fraction = gramsToFillFraction(6, 10);
    expect(fraction).toBeCloseTo(0.5);
    expect(fillFractionToGrams(fraction, 10)).toBeCloseTo(6);
  });

  it("rescales grams when the cavity weight changes", () => {
    // The same recipe (50% of cavity) should yield more grams in a larger cavity
    const fraction = gramsToFillFraction(6, 10); // 0.5 against 10g cavity
    expect(fillFractionToGrams(fraction, 15)).toBeCloseTo(9); // 50% of 15g cavity = 9g
  });

  it("returns 0 for zero cavity weight", () => {
    expect(gramsToFillFraction(5, 0)).toBe(0);
  });
});

// --- calculateProductCost in grams mode ---

describe("calculateProductCost (grams mode)", () => {
  const filling1: Filling = { id: "10", name: "Dark Ganache", category: "Ganaches (Emulsions)", source: "", description: "", allergens: [], instructions: "" };
  const li1: FillingIngredient = { id: "1", fillingId: "10", ingredientId: "100", amount: 60, unit: "g", sortOrder: 0 };
  const li2: FillingIngredient = { id: "2", fillingId: "10", ingredientId: "101", amount: 40, unit: "g", sortOrder: 1 };

  const fillingIngredientsMap = new Map([["10", [li1, li2]]]);
  const fillingsMap = new Map([["10", filling1]]);
  const ingredientCostMap = new Map<string, number | null>([["100", 0.02], ["101", 0.01]]);

  it("scales fillFraction to grams using the supplied mould's cavity weight", () => {
    // 0.5 fraction × 10g cavity × 1.2 density = 6g of filling per cavity
    const productFilling: ProductFilling = {
      id: "1", productId: "1", fillingId: "10", sortOrder: 0,
      fillPercentage: 100, // Would give a different result in percentage mode
      fillFraction: 0.5,
    };

    const result = calculateProductCost({
      mould: mockMould,
      productFillings: [productFilling],
      fillingIngredientsMap,
      fillingsMap,
      ingredientCostMap,
      shellChocolateCostPerGram: 0.018,
      shellChocolateLabel: "dark",
      shellPercentage: 50, // Derived shell % (doesn't affect fill weight in grams mode)
      fillMode: "grams",
    });

    // The filling entries should use 6g total, proportioned 60:40
    const fillingEntries = result.breakdown.filter((e) => e.kind === "filling_ingredient");
    expect(fillingEntries).toHaveLength(2);
    const totalFillingGrams = fillingEntries.reduce((s, e) => s + e.grams, 0);
    expect(totalFillingGrams).toBeCloseTo(6, 1);
  });

  it("rescales fill grams when costing against a larger mould", () => {
    // Same fraction (0.5), but a 15g cavity → 0.5 × 15 × 1.2 = 9g of filling
    const productFilling: ProductFilling = {
      id: "1", productId: "1", fillingId: "10", sortOrder: 0,
      fillPercentage: 100,
      fillFraction: 0.5,
    };
    const biggerMould: Mould = { ...mockMould, cavityWeightG: 15 };

    const result = calculateProductCost({
      mould: biggerMould,
      productFillings: [productFilling],
      fillingIngredientsMap,
      fillingsMap,
      ingredientCostMap,
      shellChocolateCostPerGram: 0.018,
      fillMode: "grams",
    });

    const totalFillingGrams = result.breakdown
      .filter((e) => e.kind === "filling_ingredient")
      .reduce((s, e) => s + e.grams, 0);
    expect(totalFillingGrams).toBeCloseTo(9, 1);
  });

  it("falls back to percentage mode when fillFraction is not set", () => {
    const productFilling: ProductFilling = {
      id: "1", productId: "1", fillingId: "10", sortOrder: 0,
      fillPercentage: 100,
      // no fillFraction — should fall back to percentage calculation
    };

    const gramsResult = calculateProductCost({
      mould: mockMould,
      productFillings: [productFilling],
      fillingIngredientsMap,
      fillingsMap,
      ingredientCostMap,
      shellChocolateCostPerGram: 0.018,
      fillMode: "grams",
    });

    const pctResult = calculateProductCost({
      mould: mockMould,
      productFillings: [productFilling],
      fillingIngredientsMap,
      fillingsMap,
      ingredientCostMap,
      shellChocolateCostPerGram: 0.018,
      fillMode: "percentage",
    });

    // Should produce the same result since fillFraction is undefined
    expect(gramsResult.costPerProduct).toBeCloseTo(pctResult.costPerProduct);
  });
});

// --- Nested-filling cost recalc (Phase 2 contract) ---
//
// These tests pin the recalc behaviour: editing a nested filling's
// ingredients (or its amount) flows through to the host's cost. We compare
// two calls to `calculateProductCost` — one with the original nested data,
// one with edited nested data — and assert the per-product cost changes
// proportionally.
describe("calculateProductCost — nested fillings", () => {
  // Reuse mockMould (cavity 10g, 20 cavities) at default 37% shell.
  const outerFilling: Filling = { id: "outer", name: "Outer", category: "", source: "", description: "", allergens: [], instructions: "" };
  const innerFilling: Filling = { id: "inner", name: "Inner", category: "", source: "", description: "", allergens: [], instructions: "" };
  const productFilling: ProductFilling = { id: "pf-1", productId: "p-1", fillingId: "outer", sortOrder: 0, fillPercentage: 100 };
  const fillingsMap = new Map<string, Filling>([
    ["outer", outerFilling],
    ["inner", innerFilling],
  ]);
  const ingredientCostMap = new Map<string, number | null>([
    ["sugar", 0.001], // €0.001/g
    ["butter", 0.01], // €0.01/g
  ]);

  function buildMaps(innerSugarG: number) {
    // Inner filling: `innerSugarG` of sugar + 100g butter → fillingTotal varies.
    // Outer filling: 100g of inner (one nested component, no own ingredients).
    const fillingIngredientsMap = new Map([
      ["inner", [
        { id: "li-1", fillingId: "inner", ingredientId: "sugar", amount: innerSugarG, unit: "g", sortOrder: 0 },
        { id: "li-2", fillingId: "inner", ingredientId: "butter", amount: 100, unit: "g", sortOrder: 1 },
      ] as FillingIngredient[]],
    ]);
    const fillingComponentsMap = new Map([
      ["outer", [
        { id: "fc-1", fillingId: "outer", childFillingId: "inner", amount: 100, unit: "g", sortOrder: 0 },
      ]],
    ]);
    return { fillingIngredientsMap, fillingComponentsMap };
  }

  it("flows nested ingredient prices into the host product's cost", () => {
    const { fillingIngredientsMap, fillingComponentsMap } = buildMaps(50);
    const result = calculateProductCost({
      mould: mockMould,
      productFillings: [productFilling],
      fillingIngredientsMap,
      fillingsMap,
      ingredientCostMap,
      shellChocolateCostPerGram: 0,
      shellPercentage: 0,
      fillingComponentsMap,
    });

    // Both leaf ingredients should appear in the breakdown — proves the
    // flattener walked through the nested filling.
    const ingredientIds = result.breakdown
      .filter((e) => e.kind === "filling_ingredient")
      .map((e) => e.ingredientId);
    expect(ingredientIds).toContain("sugar");
    expect(ingredientIds).toContain("butter");
  });

  it("recalculates when the nested filling's ingredient amount changes", () => {
    // Same total ingredients, but with twice as much sugar — cost goes up.
    const before = buildMaps(50);
    const after = buildMaps(150); // 3× sugar, butter unchanged

    const common = {
      mould: mockMould,
      productFillings: [productFilling],
      fillingsMap,
      ingredientCostMap,
      shellChocolateCostPerGram: 0,
      shellPercentage: 0,
    };

    const r1 = calculateProductCost({ ...common, ...before });
    const r2 = calculateProductCost({ ...common, ...after });

    // Both runs should produce a positive cost (mould has fillable volume).
    expect(r1.costPerProduct).toBeGreaterThan(0);
    expect(r2.costPerProduct).toBeGreaterThan(0);

    // Flipping more of the filling toward the cheap ingredient (sugar at €0.001/g
    // vs butter at €0.01/g) lowers the per-g cost — so r2 < r1.
    expect(r2.costPerProduct).toBeLessThan(r1.costPerProduct);
  });

  it("falls back to ingredient-only walk when fillingComponentsMap is omitted", () => {
    // With no components map, the host has no own ingredients → 0 cost.
    const { fillingIngredientsMap } = buildMaps(50);
    const result = calculateProductCost({
      mould: mockMould,
      productFillings: [productFilling],
      fillingIngredientsMap,
      fillingsMap,
      ingredientCostMap,
      shellChocolateCostPerGram: 0,
      shellPercentage: 0,
      // no fillingComponentsMap
    });
    const fillingEntries = result.breakdown.filter((e) => e.kind === "filling_ingredient");
    expect(fillingEntries).toHaveLength(0);
  });
});
