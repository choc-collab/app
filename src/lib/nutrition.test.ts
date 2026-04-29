import { describe, it, expect } from "vitest";
import {
  kcalToKj,
  kjToKcal,
  KJ_PER_KCAL,
  sodiumMgToSaltG,
  saltGToSodiumMg,
  fillDerivedNutrition,
  aggregateNutrition,
  scaleToServing,
  formatNutrientValue,
  percentDailyValue,
  hasNutritionData,
  getMissingMandatoryNutrients,
  getNutrientsByMarket,
  getNutritionPanelTitle,
  calculateProductNutrition,
  resolveCoatingIngredient,
  type NutritionData,
  type IngredientNutritionEntry,
} from "./nutrition";
import type { Mould, Ingredient, ProductFilling, FillingIngredient, FillingComponent, CoatingChocolateMapping } from "@/types";

// ---------------------------------------------------------------------------
// Energy conversion
// ---------------------------------------------------------------------------

describe("kcalToKj", () => {
  it("converts 100 kcal to 418 kJ", () => {
    expect(kcalToKj(100)).toBe(418);
  });

  it("converts 0 kcal to 0 kJ", () => {
    expect(kcalToKj(0)).toBe(0);
  });

  it("rounds to nearest integer", () => {
    // 250 × 4.184 = 1046
    expect(kcalToKj(250)).toBe(1046);
  });
});

describe("kjToKcal", () => {
  it("converts 418 kJ to 100 kcal", () => {
    expect(kjToKcal(418)).toBe(100);
  });

  it("converts 0 kJ to 0 kcal", () => {
    expect(kjToKcal(0)).toBe(0);
  });

  it("rounds to nearest integer", () => {
    expect(kjToKcal(1046)).toBe(250);
  });
});

describe("KJ_PER_KCAL", () => {
  it("is 4.184", () => {
    expect(KJ_PER_KCAL).toBe(4.184);
  });
});

// ---------------------------------------------------------------------------
// Salt / Sodium conversion
// ---------------------------------------------------------------------------

describe("sodiumMgToSaltG", () => {
  it("converts 400mg sodium to 1g salt", () => {
    expect(sodiumMgToSaltG(400)).toBe(1);
  });

  it("converts 0 to 0", () => {
    expect(sodiumMgToSaltG(0)).toBe(0);
  });
});

describe("saltGToSodiumMg", () => {
  it("converts 1g salt to 400mg sodium", () => {
    expect(saltGToSodiumMg(1)).toBe(400);
  });

  it("converts 2.5g salt to 1000mg sodium", () => {
    expect(saltGToSodiumMg(2.5)).toBe(1000);
  });
});

// ---------------------------------------------------------------------------
// fillDerivedNutrition
// ---------------------------------------------------------------------------

describe("fillDerivedNutrition", () => {
  it("fills kJ from kcal when kJ is missing", () => {
    const result = fillDerivedNutrition({ energyKcal: 100 });
    expect(result.energyKj).toBe(418);
    expect(result.energyKcal).toBe(100);
  });

  it("fills kcal from kJ when kcal is missing", () => {
    const result = fillDerivedNutrition({ energyKj: 418 });
    expect(result.energyKcal).toBe(100);
    expect(result.energyKj).toBe(418);
  });

  it("does not overwrite if both energy values present", () => {
    const result = fillDerivedNutrition({ energyKj: 500, energyKcal: 120 });
    expect(result.energyKj).toBe(500);
    expect(result.energyKcal).toBe(120);
  });

  it("fills salt from sodium when salt is missing", () => {
    const result = fillDerivedNutrition({ sodium: 400 });
    expect(result.salt).toBe(1);
  });

  it("fills sodium from salt when sodium is missing", () => {
    const result = fillDerivedNutrition({ salt: 1 });
    expect(result.sodium).toBe(400);
  });

  it("does not overwrite if both salt/sodium present", () => {
    const result = fillDerivedNutrition({ salt: 2, sodium: 800 });
    expect(result.salt).toBe(2);
    expect(result.sodium).toBe(800);
  });

  it("does not mutate input", () => {
    const input: NutritionData = { energyKcal: 100 };
    fillDerivedNutrition(input);
    expect(input.energyKj).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// aggregateNutrition
// ---------------------------------------------------------------------------

describe("aggregateNutrition", () => {
  it("returns empty for no entries", () => {
    const { per100g, totalWeightG } = aggregateNutrition([]);
    expect(totalWeightG).toBe(0);
    expect(Object.keys(per100g).length).toBe(0);
  });

  it("returns the same per-100g values for a single ingredient", () => {
    const entries: IngredientNutritionEntry[] = [
      { amountG: 200, nutrition: { energyKcal: 500, fat: 30, protein: 10 } },
    ];
    const { per100g, totalWeightG } = aggregateNutrition(entries);
    expect(totalWeightG).toBe(200);
    expect(per100g.energyKcal).toBe(500);
    expect(per100g.fat).toBe(30);
    expect(per100g.protein).toBe(10);
  });

  it("correctly aggregates two equal-weight ingredients", () => {
    const entries: IngredientNutritionEntry[] = [
      { amountG: 100, nutrition: { fat: 20 } },
      { amountG: 100, nutrition: { fat: 40 } },
    ];
    const { per100g, totalWeightG } = aggregateNutrition(entries);
    expect(totalWeightG).toBe(200);
    // Weighted average of 20 and 40 = 30
    expect(per100g.fat).toBe(30);
  });

  it("correctly aggregates two unequal-weight ingredients", () => {
    const entries: IngredientNutritionEntry[] = [
      { amountG: 300, nutrition: { protein: 10 } }, // contributes 30g protein
      { amountG: 100, nutrition: { protein: 50 } }, // contributes 50g protein
    ];
    const { per100g, totalWeightG } = aggregateNutrition(entries);
    expect(totalWeightG).toBe(400);
    // Total protein = (10/100)*300 + (50/100)*100 = 30 + 50 = 80
    // Per 100g of 400g mixture = (80/400)*100 = 20
    expect(per100g.protein).toBe(20);
  });

  it("ignores ingredients without data for a given nutrient", () => {
    const entries: IngredientNutritionEntry[] = [
      { amountG: 100, nutrition: { fat: 20, protein: 10 } },
      { amountG: 100, nutrition: { fat: 40 } }, // no protein data
    ];
    const { per100g } = aggregateNutrition(entries);
    expect(per100g.fat).toBe(30);
    // protein: only first ingredient has data, so only that one contributes
    // (10/100)*100 = 10g total protein in 200g mix → (10/200)*100 = 5 per 100g
    expect(per100g.protein).toBe(5);
  });

  it("auto-fills derived fields (kJ from kcal)", () => {
    const entries: IngredientNutritionEntry[] = [
      { amountG: 100, nutrition: { energyKcal: 400 } },
    ];
    const { per100g } = aggregateNutrition(entries);
    expect(per100g.energyKcal).toBe(400);
    // fillDerivedNutrition should have filled kJ
    expect(per100g.energyKj).toBe(kcalToKj(400));
  });
});

// ---------------------------------------------------------------------------
// scaleToServing
// ---------------------------------------------------------------------------

describe("scaleToServing", () => {
  it("scales per-100g values to a 30g serving", () => {
    const per100g: NutritionData = { energyKcal: 500, fat: 30 };
    const result = scaleToServing(per100g, 30);
    expect(result.energyKcal).toBe(150); // 500 * 30/100
    expect(result.fat).toBe(9); // 30 * 30/100
  });

  it("handles 100g serving (identity)", () => {
    const per100g: NutritionData = { protein: 12.5 };
    const result = scaleToServing(per100g, 100);
    expect(result.protein).toBe(12.5);
  });

  it("returns empty for empty input", () => {
    const result = scaleToServing({}, 30);
    expect(Object.keys(result).length).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// formatNutrientValue
// ---------------------------------------------------------------------------

describe("formatNutrientValue", () => {
  it("returns – for undefined", () => {
    expect(formatNutrientValue(undefined, "g")).toBe("–");
  });

  it("formats grams with 1 decimal", () => {
    expect(formatNutrientValue(12.34, "g")).toBe("12.3 g");
  });

  it("formats energy as integer", () => {
    expect(formatNutrientValue(418.6, "kJ")).toBe("419 kJ");
    expect(formatNutrientValue(100, "kcal")).toBe("100 kcal");
  });

  it("formats mg with 1 decimal", () => {
    expect(formatNutrientValue(45.67, "mg")).toBe("45.7 mg");
  });

  it("formats mcg with 1 decimal", () => {
    expect(formatNutrientValue(2.5, "mcg")).toBe("2.5 mcg");
  });
});

// ---------------------------------------------------------------------------
// percentDailyValue
// ---------------------------------------------------------------------------

describe("percentDailyValue", () => {
  it("calculates correct %DV", () => {
    expect(percentDailyValue(20, 78)).toBe(26); // 20/78 = 25.6 → 26
  });

  it("returns undefined for undefined value", () => {
    expect(percentDailyValue(undefined, 78)).toBeUndefined();
  });

  it("returns undefined for undefined dailyValue", () => {
    expect(percentDailyValue(20, undefined)).toBeUndefined();
  });

  it("returns undefined for zero dailyValue", () => {
    expect(percentDailyValue(20, 0)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// hasNutritionData
// ---------------------------------------------------------------------------

describe("hasNutritionData", () => {
  it("returns false for undefined", () => {
    expect(hasNutritionData(undefined)).toBe(false);
  });

  it("returns false for empty object", () => {
    expect(hasNutritionData({})).toBe(false);
  });

  it("returns false for all zeros", () => {
    expect(hasNutritionData({ fat: 0, protein: 0 })).toBe(false);
  });

  it("returns true when any value > 0", () => {
    expect(hasNutritionData({ fat: 0, protein: 5 })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// getMissingMandatoryNutrients
// ---------------------------------------------------------------------------

describe("getMissingMandatoryNutrients", () => {
  it("returns all mandatory for undefined nutrition", () => {
    const missing = getMissingMandatoryNutrients(undefined, "EU");
    const euMandatory = getNutrientsByMarket("EU").filter(n => n.mandatory);
    expect(missing.length).toBe(euMandatory.length);
  });

  it("returns empty when all mandatory filled (EU)", () => {
    const nutrition: NutritionData = {
      energyKj: 100, energyKcal: 24, fat: 1, saturatedFat: 0.5,
      carbohydrate: 3, sugars: 2, protein: 1, salt: 0.1,
    };
    const missing = getMissingMandatoryNutrients(nutrition, "EU");
    expect(missing.length).toBe(0);
  });

  it("treats explicit 0 as provided, not missing", () => {
    const nutrition: NutritionData = {
      energyKj: 100, energyKcal: 24, fat: 0, saturatedFat: 0,
      carbohydrate: 3, sugars: 2, protein: 1, salt: 0,
    };
    const missing = getMissingMandatoryNutrients(nutrition, "EU");
    expect(missing.length).toBe(0);
  });

  it("flags missing US-specific nutrients", () => {
    // Provide only EU fields — US needs trans fat, cholesterol, etc.
    const nutrition: NutritionData = {
      energyKcal: 100, fat: 5, saturatedFat: 2,
      carbohydrate: 10, sugars: 8, protein: 2, sodium: 50,
    };
    const missing = getMissingMandatoryNutrients(nutrition, "US");
    const missingKeys = missing.map(m => m.key);
    expect(missingKeys).toContain("transFat");
    expect(missingKeys).toContain("cholesterolMg");
    expect(missingKeys).toContain("addedSugars");
    expect(missingKeys).toContain("fibre");
    expect(missingKeys).toContain("vitaminDMcg");
    expect(missingKeys).toContain("calciumMg");
    expect(missingKeys).toContain("ironMg");
    expect(missingKeys).toContain("potassiumMg");
  });
});

// ---------------------------------------------------------------------------
// getNutrientsByMarket / getNutritionPanelTitle
// ---------------------------------------------------------------------------

describe("getNutrientsByMarket", () => {
  it("returns the same list for EU and UK", () => {
    expect(getNutrientsByMarket("EU")).toEqual(getNutrientsByMarket("UK"));
  });

  it("US includes trans fat and cholesterol", () => {
    const us = getNutrientsByMarket("US");
    expect(us.some(n => n.key === "transFat")).toBe(true);
    expect(us.some(n => n.key === "cholesterolMg")).toBe(true);
  });

  it("AU uses kJ (mandatory) plus kcal (voluntary) and sodium (not salt)", () => {
    const au = getNutrientsByMarket("AU");
    const kj = au.find(n => n.key === "energyKj");
    const kcal = au.find(n => n.key === "energyKcal");
    expect(kj?.mandatory).toBe(true);
    // kcal is shown for international readability but isn't required by FSANZ
    expect(kcal?.mandatory).toBe(false);
    expect(au.some(n => n.key === "sodium")).toBe(true);
    expect(au.some(n => n.key === "salt")).toBe(false);
  });

  it("EU uses both kJ and kcal, and salt (not sodium)", () => {
    const eu = getNutrientsByMarket("EU");
    expect(eu.some(n => n.key === "energyKj")).toBe(true);
    expect(eu.some(n => n.key === "energyKcal")).toBe(true);
    expect(eu.some(n => n.key === "salt")).toBe(true);
    expect(eu.some(n => n.key === "sodium")).toBe(false);
  });

  it("US uses kcal only (not kJ)", () => {
    const us = getNutrientsByMarket("US");
    expect(us.some(n => n.key === "energyKcal")).toBe(true);
    expect(us.some(n => n.key === "energyKj")).toBe(false);
  });
});

describe("getNutritionPanelTitle", () => {
  it("EU/UK = Nutrition Declaration", () => {
    expect(getNutritionPanelTitle("EU")).toBe("Nutrition Declaration");
    expect(getNutritionPanelTitle("UK")).toBe("Nutrition Declaration");
  });

  it("US = Nutrition Facts", () => {
    expect(getNutritionPanelTitle("US")).toBe("Nutrition Facts");
  });

  it("AU = Nutrition Information Panel", () => {
    expect(getNutritionPanelTitle("AU")).toBe("Nutrition Information Panel");
  });
});

// ---------------------------------------------------------------------------
// calculateProductNutrition
// ---------------------------------------------------------------------------

const testMould: Mould = {
  id: "m1",
  name: "Test Mould",
  cavityWeightG: 10,
  numberOfCavities: 24,
};

// Shell = 10 * 0.30 = 3g, Cap = 10 * 0.07 = 0.7g, Fill = 10 * 0.63 * 1.2 = 7.56g

const makeIngredient = (id: string, name: string, nutrition: NutritionData): Ingredient => ({
  id, name, manufacturer: "", source: "", cost: 0, notes: "",
  cacaoFat: 0, sugar: 0, milkFat: 0, water: 0, solids: 0, otherFats: 0,
  allergens: [],
  nutrition,
});

describe("calculateProductNutrition", () => {
  it("returns warnings when no mould is set", () => {
    const result = calculateProductNutrition({
      mould: null,
      productFillings: [],
      fillingIngredientsMap: new Map(),
      ingredientMap: new Map(),
      shellIngredient: null,
    });
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.productWeightG).toBe(0);
  });

  it("includes shell + cap from coating chocolate", () => {
    const coatingIng = makeIngredient("coat1", "Dark Choc", { energyKcal: 500, fat: 30 });
    const result = calculateProductNutrition({
      mould: testMould,
      productFillings: [],
      fillingIngredientsMap: new Map(),
      ingredientMap: new Map(),
      shellIngredient: coatingIng,
    });
    // Shell 3g + Cap 0.7g = 3.7g of chocolate
    expect(result.productWeightG).toBeCloseTo(3.7, 1);
    // per 100g should equal the chocolate's own nutrition (only one ingredient)
    expect(result.per100g.energyKcal).toBe(500);
    expect(result.per100g.fat).toBe(30);
    // per product: 500 kcal/100g × 3.7g = 18.5 kcal
    expect(result.perProduct.energyKcal).toBe(19); // rounded
  });

  it("combines coating + fill fillings with correct weights", () => {
    const coatingIng = makeIngredient("coat1", "Dark Choc", { fat: 30, protein: 8 });
    const fillIng = makeIngredient("ing1", "Cream", { fat: 35, protein: 2 });

    const productFillings: ProductFilling[] = [
      { id: "rl1", productId: "r1", fillingId: "l1", sortOrder: 0, fillPercentage: 100 },
    ];
    const fillingIngredientsMap = new Map<string, FillingIngredient[]>([
      ["l1", [{ id: "li1", fillingId: "l1", ingredientId: "ing1", amount: 200, unit: "g" }]],
    ]);
    const ingredientMap = new Map([["ing1", fillIng]]);

    const result = calculateProductNutrition({
      mould: testMould,
      productFillings,
      fillingIngredientsMap,
      ingredientMap,
      shellIngredient: coatingIng,
    });

    // Fill weight = 10 * 0.63 * 1.2 = 7.56g
    // Total = 3.7 (coating) + 7.56 (fill) = 11.26g
    expect(result.productWeightG).toBeCloseTo(11.26, 1);

    // Fat: coating contributes 3.7g × 30/100 = 1.11g fat
    //      fill contributes 7.56g × 35/100 = 2.646g fat
    //      total fat = 3.756g in 11.26g → per 100g = 33.4g
    expect(result.per100g.fat).toBeCloseTo(33.4, 0);
  });

  it("splits fill weight across fillings by fillPercentage", () => {
    const ing1 = makeIngredient("ing1", "A", { protein: 20 });
    const ing2 = makeIngredient("ing2", "B", { protein: 40 });

    const productFillings: ProductFilling[] = [
      { id: "rl1", productId: "r1", fillingId: "l1", sortOrder: 0, fillPercentage: 60 },
      { id: "rl2", productId: "r1", fillingId: "l2", sortOrder: 1, fillPercentage: 40 },
    ];
    const fillingIngredientsMap = new Map<string, FillingIngredient[]>([
      ["l1", [{ id: "li1", fillingId: "l1", ingredientId: "ing1", amount: 100, unit: "g" }]],
      ["l2", [{ id: "li2", fillingId: "l2", ingredientId: "ing2", amount: 100, unit: "g" }]],
    ]);
    const ingredientMap = new Map([["ing1", ing1], ["ing2", ing2]]);

    const result = calculateProductNutrition({
      mould: testMould,
      productFillings,
      fillingIngredientsMap,
      ingredientMap,
      shellIngredient: null, // no coating
    });

    // Fill = 7.56g total
    // Filling 1: 7.56 * 60% = 4.536g of ing1 (protein 20/100g)
    // Filling 2: 7.56 * 40% = 3.024g of ing2 (protein 40/100g)
    // protein: 4.536*0.20 + 3.024*0.40 = 0.9072 + 1.2096 = 2.1168g
    // per 100g of 7.56g: (2.1168 / 7.56) * 100 = 28.0g
    expect(result.per100g.protein).toBeCloseTo(28.0, 0);
    expect(result.productWeightG).toBeCloseTo(7.56, 1);
  });

  it("tracks ingredient coverage correctly", () => {
    const withData = makeIngredient("ing1", "A", { fat: 10 });
    const noData = makeIngredient("ing2", "B", {}); // no nutrition

    const productFillings: ProductFilling[] = [
      { id: "rl1", productId: "r1", fillingId: "l1", sortOrder: 0, fillPercentage: 100 },
    ];
    const fillingIngredientsMap = new Map<string, FillingIngredient[]>([
      ["l1", [
        { id: "li1", fillingId: "l1", ingredientId: "ing1", amount: 100, unit: "g" },
        { id: "li2", fillingId: "l1", ingredientId: "ing2", amount: 100, unit: "g" },
      ]],
    ]);
    const ingredientMap = new Map([["ing1", withData], ["ing2", noData]]);

    const result = calculateProductNutrition({
      mould: testMould,
      productFillings,
      fillingIngredientsMap,
      ingredientMap,
      shellIngredient: null,
    });

    expect(result.ingredientsTotal).toBe(2);
    expect(result.ingredientsWithData).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// resolveCoatingIngredient
// ---------------------------------------------------------------------------

describe("resolveCoatingIngredient", () => {
  const chocA = makeIngredient("chocA", "Old Choc", { fat: 30 });
  const chocB = makeIngredient("chocB", "New Choc", { fat: 35 });
  const ingredientMap = new Map([["chocA", chocA], ["chocB", chocB]]);

  it("returns null when no coating name", () => {
    expect(resolveCoatingIngredient(undefined, [], ingredientMap)).toBeNull();
  });

  it("returns null when no mappings match", () => {
    expect(resolveCoatingIngredient("dark", [], ingredientMap)).toBeNull();
  });

  it("returns the most recent mapping", () => {
    const mappings: CoatingChocolateMapping[] = [
      { id: "m1", coatingName: "dark", ingredientId: "chocA", effectiveFrom: new Date("2025-01-01") },
      { id: "m2", coatingName: "dark", ingredientId: "chocB", effectiveFrom: new Date("2026-01-01") },
    ];
    const result = resolveCoatingIngredient("dark", mappings, ingredientMap);
    expect(result?.id).toBe("chocB");
  });

  it("ignores future mappings", () => {
    const mappings: CoatingChocolateMapping[] = [
      { id: "m1", coatingName: "dark", ingredientId: "chocA", effectiveFrom: new Date("2025-01-01") },
      { id: "m2", coatingName: "dark", ingredientId: "chocB", effectiveFrom: new Date("2099-01-01") },
    ];
    const result = resolveCoatingIngredient("dark", mappings, ingredientMap);
    expect(result?.id).toBe("chocA");
  });
});

// ---------------------------------------------------------------------------
// Nested-filling nutrition (Phase 2 contract)
// ---------------------------------------------------------------------------
//
// The nutrition engine has to walk through nested fillings and weight each
// leaf ingredient by the host's portion of the child. The contract here:
// nesting a filling that contributes 50% of the parent's mass should produce
// nutrition rolled-up at exactly 50% from each side.

describe("calculateProductNutrition — nested fillings", () => {
  // Two leaf ingredients with very different nutrition so it's easy to read
  // out the per-g weighting in the result.
  const cream = makeIngredient("cream", "Cream", { fat: 35, protein: 2 });
  const sugar = makeIngredient("sugar", "Sugar", { fat: 0, sugars: 100 });

  const productFillings: ProductFilling[] = [
    { id: "pf-1", productId: "p-1", fillingId: "host", sortOrder: 0, fillPercentage: 100 },
  ];

  it("flattens a nested filling into the host's nutrition", () => {
    // Inner: 100g cream → totals 100g; nutrition is 35g fat per 100g.
    // Host: 100g of inner (no own ingredients) → flattened: 100g cream.
    const fillingIngredientsMap = new Map<string, FillingIngredient[]>([
      ["inner", [{ id: "li-1", fillingId: "inner", ingredientId: "cream", amount: 100, unit: "g" }]],
    ]);
    const fillingComponentsMap = new Map<string, FillingComponent[]>([
      ["host", [{ id: "fc-1", fillingId: "host", childFillingId: "inner", amount: 100, unit: "g" }]],
    ]);
    const ingredientMap = new Map([["cream", cream]]);

    const result = calculateProductNutrition({
      mould: testMould,
      productFillings,
      fillingIngredientsMap,
      fillingComponentsMap,
      ingredientMap,
      shellIngredient: null,
      shellPercentage: 0,
    });

    // Without nesting support the result would be empty (host has no own
    // ingredients). With it, the cream's nutrition flows through.
    expect(result.per100g.fat).toBeCloseTo(35);
    expect(result.per100g.protein).toBeCloseTo(2);
  });

  it("weights leaf nutrition by the host's portion of the nested filling", () => {
    // Inner: 50g cream + 50g sugar → 100g total.
    //   Cream contributes 35g fat / 100g → 17.5g fat per inner-100g.
    //   Sugar contributes 0 fat → 0g.
    //   Inner per-100g: fat = 17.5g.
    //
    // Host: 100g of inner only. So host per-100g should match inner per-100g.
    const fillingIngredientsMap = new Map<string, FillingIngredient[]>([
      ["inner", [
        { id: "li-1", fillingId: "inner", ingredientId: "cream", amount: 50, unit: "g" },
        { id: "li-2", fillingId: "inner", ingredientId: "sugar", amount: 50, unit: "g" },
      ]],
    ]);
    const fillingComponentsMap = new Map<string, FillingComponent[]>([
      ["host", [{ id: "fc-1", fillingId: "host", childFillingId: "inner", amount: 100, unit: "g" }]],
    ]);
    const ingredientMap = new Map([["cream", cream], ["sugar", sugar]]);

    const result = calculateProductNutrition({
      mould: testMould,
      productFillings,
      fillingIngredientsMap,
      fillingComponentsMap,
      ingredientMap,
      shellIngredient: null,
      shellPercentage: 0,
    });

    // 50/50 split → fat is 17.5g per 100g of host.
    expect(result.per100g.fat).toBeCloseTo(17.5, 1);
    // Sugars field of 100g/100g, halved → 50g.
    expect(result.per100g.sugars).toBeCloseTo(50, 1);
  });

  it("keeps the legacy behaviour when fillingComponentsMap is omitted", () => {
    // No components map → host has no own ingredients → no contribution.
    const fillingIngredientsMap = new Map<string, FillingIngredient[]>([
      ["inner", [{ id: "li-1", fillingId: "inner", ingredientId: "cream", amount: 100, unit: "g" }]],
    ]);
    const ingredientMap = new Map([["cream", cream]]);

    const result = calculateProductNutrition({
      mould: testMould,
      productFillings,
      fillingIngredientsMap,
      // no fillingComponentsMap
      ingredientMap,
      shellIngredient: null,
      shellPercentage: 0,
    });

    expect(result.per100g.fat ?? 0).toBe(0);
    expect(result.ingredientsTotal).toBe(0);
  });
});
