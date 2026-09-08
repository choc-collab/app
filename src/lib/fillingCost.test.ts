import { describe, it, expect } from "vitest";
import { computeFillingRecipeCost } from "./fillingCost";
import type { FillingIngredient, Ingredient } from "@/types";

function ing(id: string, overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    id,
    name: id,
    manufacturer: "",
    source: "",
    cost: 0,
    notes: "",
    cacaoFat: 0,
    sugar: 0,
    milkFat: 0,
    water: 0,
    solids: 0,
    otherFats: 0,
    allergens: [],
    ...overrides,
  };
}

function row(ingredientId: string, amount: number, unit: string = "g"): FillingIngredient {
  return { id: `row-${ingredientId}`, fillingId: "f1", ingredientId, amount, unit };
}

describe("computeFillingRecipeCost", () => {
  it("returns null for an empty composition", () => {
    expect(computeFillingRecipeCost([], new Map())).toBeNull();
  });

  it("sums grams × cost-per-gram across rows", () => {
    const map = new Map([
      ["cream", ing("cream", { purchaseCost: 2, purchaseQty: 1000, purchaseUnit: "g" })],
      ["choc", ing("choc", { purchaseCost: 10, purchaseQty: 1000, purchaseUnit: "g" })],
    ]);
    const result = computeFillingRecipeCost([row("cream", 500), row("choc", 500)], map);
    expect(result).not.toBeNull();
    // (500/1000)*2 + (500/1000)*10 = 1 + 5 = 6
    expect(result!.totalCost).toBeCloseTo(6, 5);
    expect(result!.missingIngredientNames).toEqual([]);
  });

  it("flags ingredients with no pricing data instead of throwing", () => {
    const map = new Map([["mystery", ing("mystery")]]); // no purchaseCost set
    const result = computeFillingRecipeCost([row("mystery", 100)], map);
    expect(result!.totalCost).toBe(0);
    expect(result!.missingIngredientNames).toEqual(["mystery"]);
  });

  it("converts kg/L rows to grams before costing", () => {
    const map = new Map([["cream", ing("cream", { purchaseCost: 2, purchaseQty: 1000, purchaseUnit: "g" })]]);
    const result = computeFillingRecipeCost([row("cream", 0.5, "kg")], map);
    // 0.5kg = 500g; 500 * (2/1000) = 1
    expect(result!.totalCost).toBeCloseTo(1, 5);
  });

  it("treats pricingIrrelevant ingredients as zero cost, not missing", () => {
    const map = new Map([["salt", ing("salt", { pricingIrrelevant: true })]]);
    const result = computeFillingRecipeCost([row("salt", 5)], map);
    expect(result!.totalCost).toBe(0);
    expect(result!.missingIngredientNames).toEqual([]);
  });

  it("skips rows whose ingredient can't be found in the map", () => {
    const result = computeFillingRecipeCost([row("ghost", 100)], new Map());
    expect(result!.totalCost).toBe(0);
    expect(result!.missingIngredientNames).toEqual([]);
  });
});
