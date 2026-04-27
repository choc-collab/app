import { describe, it, expect } from "vitest";
import { calculateFillingAmounts, calculateStandaloneFillingAmounts, consolidateSharedFillings, expandNestedFillings, topoSortFillingsChildrenFirst, generateSteps, scheduleColorSteps, generateBatchSummary, computeEffectiveShelfLife, getMouldSlots, getTotalCavities, formatMouldList, hasAlternativeMouldSetup, FILL_FACTOR, DENSITY_G_PER_ML } from "./production";
import type { ColorTask, FillingAmount, ConsolidatedFilling, IngredientRef, StandaloneFillingAmount } from "./production";
import type { PlanProduct, PlanFilling, ProductFilling, Filling, FillingIngredient, FillingComponent, Mould, Product, DecorationMaterial } from "@/types";

// ─── Fixtures ──────────────────────────────────────────────────────────────

const mould: Mould = { id: "1", name: "Rect 15", cavityWeightG: 10, numberOfCavities: 15 };

function makePlanProduct(overrides: Partial<PlanProduct> = {}): PlanProduct {
  return { id: "1", planId: "1", productId: "1", mouldId: "1", quantity: 1, sortOrder: 0, ...overrides };
}

function makeProductFilling(overrides: Partial<ProductFilling> = {}): ProductFilling {
  return { id: "1", productId: "1", fillingId: "1", sortOrder: 0, fillPercentage: 100, ...overrides };
}

function makeFilling(overrides: Partial<Filling> = {}): Filling {
  return {
    id: "1", name: "Dark ganache", category: "Emulsions & Creams", subcategory: "Classic Ganache",
    source: "", description: "", allergens: [], instructions: "", ...overrides,
  };
}

function makeFillingIngredient(overrides: Partial<FillingIngredient> = {}): FillingIngredient {
  return { id: "1", fillingId: "1", ingredientId: "1", amount: 100, unit: "g", sortOrder: 0, ...overrides };
}

// ─── calculateFillingAmounts ─────────────────────────────────────────────────

describe("calculateFillingAmounts", () => {
  it("returns empty array when no plan products", () => {
    const result = calculateFillingAmounts([], new Map(), new Map(), new Map(), new Map(), new Map());
    expect(result).toEqual([]);
  });

  it("skips plan product with no matching mould", () => {
    const pb = makePlanProduct({ mouldId: "99" });
    const result = calculateFillingAmounts(
      [pb],
      new Map([["1", "Product A"]]),
      new Map([["1", [makeProductFilling()]]]),
      new Map([["1", [makeFillingIngredient()]]]),
      new Map([["1", makeFilling()]]),
      new Map([["1", mould]]), // mouldId "99" not in map
    );
    expect(result).toEqual([]);
  });

  it("calculates fill-scaled weight for a single ganache filling at 100%", () => {
    // fillWeight = 10 ml × 15 cavities × 1 mould × 0.63 × 1.2 density = 113.4 g
    const expectedFillWeight = mould.cavityWeightG * mould.numberOfCavities * 1 * FILL_FACTOR * DENSITY_G_PER_ML;
    const expectedWeight = Math.round(expectedFillWeight * 1.0);

    const result = calculateFillingAmounts(
      [makePlanProduct()],
      new Map([["1", "Product A"]]),
      new Map([["1", [makeProductFilling({ fillPercentage: 100 })]]]),
      new Map([["1", [makeFillingIngredient({ amount: 200 })]]]),
      new Map([["1", makeFilling()]]),
      new Map([["1", mould]]),
    );

    expect(result).toHaveLength(1);
    expect(result[0].weightG).toBe(expectedWeight);
    expect(result[0].fillingName).toBe("Dark ganache");
    expect(result[0].productName).toBe("Product A");
  });

  it("splits fill volume between two fillings by fillPercentage", () => {
    const filling1 = makeFilling({ id: "1", name: "Ganache" });
    const filling2 = makeFilling({ id: "2", name: "Caramel", category: "Caramels & Sweets", subcategory: "Liquid Caramel" });
    const bl1 = makeProductFilling({ id: "1", fillingId: "1", fillPercentage: 60 });
    const bl2 = makeProductFilling({ id: "2", fillingId: "2", fillPercentage: 40 });
    const li1 = makeFillingIngredient({ id: "1", fillingId: "1", amount: 100 });
    const li2 = makeFillingIngredient({ id: "2", fillingId: "2", amount: 100 });

    const fillWeight = mould.cavityWeightG * mould.numberOfCavities * 1 * FILL_FACTOR * DENSITY_G_PER_ML;

    const result = calculateFillingAmounts(
      [makePlanProduct()],
      new Map([["1", "Product A"]]),
      new Map([["1", [bl1, bl2]]]),
      new Map([["1", [li1]], ["2", [li2]]]),
      new Map([["1", filling1], ["2", filling2]]),
      new Map([["1", mould]]),
    );

    expect(result).toHaveLength(2);
    const w1 = result.find((r) => r.fillingId === "1")!.weightG;
    const w2 = result.find((r) => r.fillingId === "2")!.weightG;
    expect(w1).toBe(Math.round(fillWeight * 0.6));
    expect(w2).toBe(Math.round(fillWeight * 0.4));
  });

  it("uses multiplier for shelf-stable (Fruit-Based) filling, not fill volume", () => {
    const filling = makeFilling({ category: "Fruit-Based (Pectins & Acids)", name: "Raspberry gel" });
    const bl = makeProductFilling({ fillPercentage: 100 });
    const li = makeFillingIngredient({ amount: 200 }); // product weight = 200g

    const result = calculateFillingAmounts(
      [makePlanProduct()],
      new Map([["1", "Product A"]]),
      new Map([["1", [bl]]]),
      new Map([["1", [li]]]),
      new Map([["1", filling]]),
      new Map([["1", mould]]),
      { "1": 2 }, // multiplier = 2×
    );

    expect(result).toHaveLength(1);
    // 200g × 2 = 400g
    expect(result[0].weightG).toBe(400);
  });

  it("marks a shelf-stable filling as from previous batch and skips the scaled recipe when multiplier is 0 (stock covers all)", () => {
    const filling = makeFilling({ category: "Fruit-Based (Pectins & Acids)", name: "Raspberry gel" });
    const bl = makeProductFilling({ fillPercentage: 100 });
    const li = makeFillingIngredient({ amount: 200 });

    const result = calculateFillingAmounts(
      [makePlanProduct()],
      new Map([["1", "Product A"]]),
      new Map([["1", [bl]]]),
      new Map([["1", [li]]]),
      new Map([["1", filling]]),
      new Map([["1", mould]]),
      { "1": 0 }, // multiplier = 0 → no fresh batch
      { "1": { madeAt: "2026-04-01" } },
    );

    expect(result).toHaveLength(1);
    expect(result[0].isFromPreviousBatch).toBe(true);
    expect(result[0].previousBatchMadeAt).toBe("2026-04-01");
    // Scaled recipe must be empty so the scaled products page doesn't render it,
    // and generateSteps emits "Use from previous batch" (not "Make filling").
    expect(result[0].scaledIngredients).toEqual([]);
  });

  it("treats a non-zero multiplier with a prevBatch as fresh top-up (shortfall) — keeps scaled recipe", () => {
    const filling = makeFilling({ category: "Fruit-Based (Pectins & Acids)", name: "Raspberry gel" });
    const li = makeFillingIngredient({ amount: 200 }); // base = 200g

    const result = calculateFillingAmounts(
      [makePlanProduct()],
      new Map([["1", "Product A"]]),
      new Map([["1", [makeProductFilling()]]]),
      new Map([["1", [li]]]),
      new Map([["1", filling]]),
      new Map([["1", mould]]),
      { "1": 0.5 }, // only 100g fresh needed on top of stock
      { "1": { madeAt: "2026-04-01" } },
    );

    expect(result).toHaveLength(1);
    expect(result[0].isFromPreviousBatch).toBeUndefined();
    expect(result[0].weightG).toBe(100); // 200g × 0.5
    expect(result[0].scaledIngredients).toHaveLength(1);
  });

  it("respects custom shelfStableCategoryNames param (fill-scales a category that the legacy constant marks shelf-stable)", () => {
    // Without this param, "Fruit-Based" defaults to shelf-stable. We pass an empty set
    // → it should now be treated as fill-scaled (multiplier ignored, weight derived from fill volume).
    const filling = makeFilling({ category: "Fruit-Based (Pectins & Acids)" });
    const li = makeFillingIngredient({ amount: 200 });
    const customMould = { ...mould, cavityWeightG: 10, numberOfCavities: 24 };

    const result = calculateFillingAmounts(
      [makePlanProduct({ quantity: 1 })],
      new Map([["1", "Product A"]]),
      new Map([["1", [makeProductFilling({ fillPercentage: 100 })]]]),
      new Map([["1", [li]]]),
      new Map([["1", filling]]),
      new Map([["1", customMould]]),
      { "1": 5 }, // multiplier (would yield 1000g if shelf-stable; should be ignored)
      {},
      new Map(),
      new Set(), // explicitly: no categories are shelf-stable
    );

    expect(result).toHaveLength(1);
    // Fill-scaled: 10ml × 24 cavities × 1 mould × (1 - 0.37) × 1.2 g/ml ≈ 181g
    expect(result[0].weightG).toBeLessThan(300);
    expect(result[0].weightG).toBeGreaterThan(100);
  });

  it("respects custom shelfStableCategoryNames param (multiplier-scales a custom category not in the legacy constant)", () => {
    // A user-defined category called "My Custom Filling" — not in SHELF_STABLE_CATEGORIES.
    // With the live set marking it shelf-stable, multiplier-based scaling should kick in.
    const filling = makeFilling({ category: "My Custom Filling" });
    const li = makeFillingIngredient({ amount: 250 });

    const result = calculateFillingAmounts(
      [makePlanProduct()],
      new Map([["1", "Product A"]]),
      new Map([["1", [makeProductFilling({ fillPercentage: 100 })]]]),
      new Map([["1", [li]]]),
      new Map([["1", filling]]),
      new Map([["1", mould]]),
      { "1": 3 },
      {},
      new Map(),
      new Set(["My Custom Filling"]),
    );

    expect(result).toHaveLength(1);
    expect(result[0].weightG).toBe(750); // 250g × 3
  });

  it("scales ingredients proportionally to required weight", () => {
    // Product has 2 ingredients totalling 100g. Required batch = 200g → each ×2.
    const li1 = makeFillingIngredient({ id: "1", ingredientId: "1", amount: 70 });
    const li2 = makeFillingIngredient({ id: "2", ingredientId: "2", amount: 30 });
    const filling = makeFilling({ category: "Fruit-Based (Pectins & Acids)" });

    const result = calculateFillingAmounts(
      [makePlanProduct()],
      new Map([["1", "Product A"]]),
      new Map([["1", [makeProductFilling()]]]),
      new Map([["1", [li1, li2]]]),
      new Map([["1", filling]]),
      new Map([["1", mould]]),
      { "1": 2 }, // 100g × 2 = 200g
    );

    const scaled = result[0].scaledIngredients;
    expect(scaled.find((s) => s.ingredientId === "1")?.amount).toBeCloseTo(140);
    expect(scaled.find((s) => s.ingredientId === "2")?.amount).toBeCloseTo(60);
  });

  it("returns zero-scaled ingredients when filling has no ingredients", () => {
    const result = calculateFillingAmounts(
      [makePlanProduct()],
      new Map([["1", "Product A"]]),
      new Map([["1", [makeProductFilling()]]]),
      new Map([["1", []]]), // no ingredients
      new Map([["1", makeFilling()]]),
      new Map([["1", mould]]),
    );
    expect(result).toHaveLength(1);
    expect(result[0].scaledIngredients).toEqual([]);
    expect(result[0].weightG).toBeGreaterThan(0); // fill volume still calculated
  });

  it("produces separate FillingAmount entries when two plan products share a filling", () => {
    const pb1 = makePlanProduct({ id: "1", productId: "1" });
    const pb2 = makePlanProduct({ id: "2", productId: "2" });
    // Both products use the same fillingId = "1"
    const filling = makeFilling({ id: "1" });
    const li = makeFillingIngredient({ fillingId: "1" });

    const result = calculateFillingAmounts(
      [pb1, pb2],
      new Map([["1", "Product A"], ["2", "Product B"]]),
      new Map([["1", [makeProductFilling({ productId: "1", fillingId: "1" })]], ["2", [makeProductFilling({ productId: "2", fillingId: "1" })]]]),
      new Map([["1", [li]]]),
      new Map([["1", filling]]),
      new Map([["1", mould]]),
    );

    expect(result).toHaveLength(2);
    expect(result[0].planProductId).toBe("1");
    expect(result[1].planProductId).toBe("2");
  });

  it("scales across multiple moulds (quantity > 1)", () => {
    // quantity = 3 moulds → 3× the fill volume
    const singleResult = calculateFillingAmounts(
      [makePlanProduct({ quantity: 1 })],
      new Map([["1", "Product A"]]),
      new Map([["1", [makeProductFilling()]]]),
      new Map([["1", [makeFillingIngredient({ amount: 100 })]]]),
      new Map([["1", makeFilling()]]),
      new Map([["1", mould]]),
    );
    const tripleResult = calculateFillingAmounts(
      [makePlanProduct({ quantity: 3 })],
      new Map([["1", "Product A"]]),
      new Map([["1", [makeProductFilling()]]]),
      new Map([["1", [makeFillingIngredient({ amount: 100 })]]]),
      new Map([["1", makeFilling()]]),
      new Map([["1", mould]]),
    );

    // Each batch is independently rounded, so triple may differ by ±1g from singleResult × 3
    const fillWeight = mould.cavityWeightG * mould.numberOfCavities * FILL_FACTOR * DENSITY_G_PER_ML;
    expect(tripleResult[0].weightG).toBe(Math.round(fillWeight * 3));
    expect(tripleResult[0].weightG).toBeGreaterThan(singleResult[0].weightG * 2);
  });

  it("scales raw ingredients up to hit the cavity weight when measuredYieldG is set (fill-scaled)", () => {
    // Cavity weight target ≈ 113.4 g. Recipe: 200 g raw → 150 g cooked (25% loss).
    // scaleFactor = 113.4 / 150 ≈ 0.756, so raw ingredient scales to 200 × 0.756 ≈ 151.2.
    const filling = makeFilling({ measuredYieldG: 150 });
    const result = calculateFillingAmounts(
      [makePlanProduct()],
      new Map([["1", "Product A"]]),
      new Map([["1", [makeProductFilling({ fillPercentage: 100 })]]]),
      new Map([["1", [makeFillingIngredient({ amount: 200 })]]]),
      new Map([["1", filling]]),
      new Map([["1", mould]]),
    );
    const expectedFillWeight = mould.cavityWeightG * mould.numberOfCavities * FILL_FACTOR * DENSITY_G_PER_ML;
    expect(result[0].weightG).toBe(Math.round(expectedFillWeight));
    // Ingredient scaled from raw 200 g up to produce `weightG` of cooked filling
    const expectedAmount = Math.round(200 * (Math.round(expectedFillWeight) / 150) * 10) / 10;
    expect(result[0].scaledIngredients[0].amount).toBe(expectedAmount);
  });

  it("uses measuredYieldG for the shelf-stable weight label so it reflects cooked yield × multiplier", () => {
    // Pâte de fruit recipe: 300 g raw → 200 g cooked. Multiplier = 2× gives 400 g cooked, not 600 g raw.
    const filling = makeFilling({
      category: "Fruit-Based (Pectins & Acids)",
      name: "Raspberry gel",
      measuredYieldG: 200,
    });
    const bl = makeProductFilling({ fillPercentage: 100 });
    const li = makeFillingIngredient({ amount: 300 });

    const result = calculateFillingAmounts(
      [makePlanProduct()],
      new Map([["1", "Product A"]]),
      new Map([["1", [bl]]]),
      new Map([["1", [li]]]),
      new Map([["1", filling]]),
      new Map([["1", mould]]),
      { "1": 2 },
    );

    expect(result[0].weightG).toBe(400); // 200 g cooked × 2, not 300 g raw × 2
    // Raw ingredient still scales by 2× (the "× base recipe" multiplier the user set)
    expect(result[0].scaledIngredients[0].amount).toBe(600);
  });
});

// ─── consolidateSharedFillings ──────────────────────────────────────────────

describe("consolidateSharedFillings", () => {
  it("returns empty array for empty input", () => {
    expect(consolidateSharedFillings([])).toEqual([]);
  });

  it("returns a single non-shared filling unchanged", () => {
    const la: FillingAmount = {
      fillingId: "L1", fillingName: "Dark ganache", planProductId: "PB1",
      productName: "Product A", weightG: 100,
      scaledIngredients: [{ ingredientId: "I1", amount: 60, unit: "g" }, { ingredientId: "I2", amount: 40, unit: "g" }],
    };
    const result = consolidateSharedFillings([la]);
    expect(result).toHaveLength(1);
    expect(result[0].shared).toBe(false);
    expect(result[0].totalWeightG).toBe(100);
    expect(result[0].usedBy).toHaveLength(1);
    expect(result[0].scaledIngredients).toEqual(la.scaledIngredients);
  });

  it("consolidates a shared filling across two products", () => {
    const la1: FillingAmount = {
      fillingId: "L1", fillingName: "Dark ganache", planProductId: "PB1",
      productName: "Product A", weightG: 300,
      scaledIngredients: [{ ingredientId: "I1", amount: 180, unit: "g" }, { ingredientId: "I2", amount: 120, unit: "g" }],
    };
    const la2: FillingAmount = {
      fillingId: "L1", fillingName: "Dark ganache", planProductId: "PB2",
      productName: "Product B", weightG: 150,
      scaledIngredients: [{ ingredientId: "I1", amount: 90, unit: "g" }, { ingredientId: "I2", amount: 60, unit: "g" }],
    };
    const result = consolidateSharedFillings([la1, la2]);
    expect(result).toHaveLength(1);
    const cl = result[0];
    expect(cl.shared).toBe(true);
    expect(cl.totalWeightG).toBe(450);
    expect(cl.usedBy).toHaveLength(2);
    expect(cl.usedBy[0]).toEqual({ planProductId: "PB1", productName: "Product A", weightG: 300 });
    expect(cl.usedBy[1]).toEqual({ planProductId: "PB2", productName: "Product B", weightG: 150 });
    expect(cl.scaledIngredients).toEqual([
      { ingredientId: "I1", amount: 270, unit: "g" },
      { ingredientId: "I2", amount: 180, unit: "g" },
    ]);
  });

  it("keeps non-shared fillings separate", () => {
    const la1: FillingAmount = {
      fillingId: "L1", fillingName: "Dark ganache", planProductId: "PB1",
      productName: "Product A", weightG: 300, scaledIngredients: [],
    };
    const la2: FillingAmount = {
      fillingId: "L2", fillingName: "Praline", planProductId: "PB2",
      productName: "Product B", weightG: 200, scaledIngredients: [],
    };
    const result = consolidateSharedFillings([la1, la2]);
    expect(result).toHaveLength(2);
    expect(result[0].shared).toBe(false);
    expect(result[1].shared).toBe(false);
  });

  it("handles mix of shared and non-shared fillings", () => {
    const amounts: FillingAmount[] = [
      { fillingId: "L1", fillingName: "Dark ganache", planProductId: "PB1", productName: "A", weightG: 200, scaledIngredients: [] },
      { fillingId: "L2", fillingName: "Praline", planProductId: "PB1", productName: "A", weightG: 100, scaledIngredients: [] },
      { fillingId: "L1", fillingName: "Dark ganache", planProductId: "PB2", productName: "B", weightG: 150, scaledIngredients: [] },
      { fillingId: "L3", fillingName: "Fruit gel", planProductId: "PB2", productName: "B", weightG: 180, scaledIngredients: [] },
    ];
    const result = consolidateSharedFillings(amounts);
    expect(result).toHaveLength(3);
    const shared = result.find((c) => c.fillingId === "L1")!;
    expect(shared.shared).toBe(true);
    expect(shared.totalWeightG).toBe(350);
    expect(result.find((c) => c.fillingId === "L2")!.shared).toBe(false);
    expect(result.find((c) => c.fillingId === "L3")!.shared).toBe(false);
  });

  it("preserves previous-batch flag", () => {
    const la: FillingAmount = {
      fillingId: "L1", fillingName: "Praline", planProductId: "PB1",
      productName: "A", weightG: 200, scaledIngredients: [],
      isFromPreviousBatch: true, previousBatchMadeAt: "2025-01-01",
    };
    const result = consolidateSharedFillings([la]);
    expect(result[0].isFromPreviousBatch).toBe(true);
    expect(result[0].previousBatchMadeAt).toBe("2025-01-01");
  });

  it("handles zero-weight fillings", () => {
    const la: FillingAmount = {
      fillingId: "L1", fillingName: "Empty", planProductId: "PB1",
      productName: "A", weightG: 0, scaledIngredients: [],
    };
    const result = consolidateSharedFillings([la]);
    expect(result).toHaveLength(1);
    expect(result[0].totalWeightG).toBe(0);
    expect(result[0].shared).toBe(false);
  });

  it("rounds totalWeightG to nearest integer", () => {
    const la1: FillingAmount = {
      fillingId: "L1", fillingName: "Ganache", planProductId: "PB1",
      productName: "A", weightG: 100.4, scaledIngredients: [],
    };
    const la2: FillingAmount = {
      fillingId: "L1", fillingName: "Ganache", planProductId: "PB2",
      productName: "B", weightG: 50.3, scaledIngredients: [],
    };
    const result = consolidateSharedFillings([la1, la2]);
    expect(result[0].totalWeightG).toBe(151); // rounded from 150.7
  });

  it("merges duplicate ingredient IDs within consolidated filling", () => {
    const la1: FillingAmount = {
      fillingId: "L1", fillingName: "Ganache", planProductId: "PB1",
      productName: "A", weightG: 100,
      scaledIngredients: [
        { ingredientId: "I1", amount: 60.5, unit: "g" },
        { ingredientId: "I2", amount: 40, unit: "g" },
      ],
    };
    const la2: FillingAmount = {
      fillingId: "L1", fillingName: "Ganache", planProductId: "PB2",
      productName: "B", weightG: 50,
      scaledIngredients: [
        { ingredientId: "I1", amount: 30.3, unit: "g" },
        { ingredientId: "I2", amount: 20, unit: "g" },
      ],
    };
    const result = consolidateSharedFillings([la1, la2]);
    expect(result[0].scaledIngredients).toEqual([
      { ingredientId: "I1", amount: 90.8, unit: "g" },
      { ingredientId: "I2", amount: 60, unit: "g" },
    ]);
  });

  it("preserves insertion order of fillings", () => {
    const amounts: FillingAmount[] = [
      { fillingId: "L3", fillingName: "Third", planProductId: "PB1", productName: "A", weightG: 10, scaledIngredients: [] },
      { fillingId: "L1", fillingName: "First", planProductId: "PB1", productName: "A", weightG: 20, scaledIngredients: [] },
      { fillingId: "L2", fillingName: "Second", planProductId: "PB1", productName: "A", weightG: 30, scaledIngredients: [] },
    ];
    const result = consolidateSharedFillings(amounts);
    expect(result.map((c) => c.fillingId)).toEqual(["L3", "L1", "L2"]);
  });
});

// ─── generateSteps ─────────────────────────────────────────────────────────

describe("generateSteps", () => {
  it("returns empty array when no plan products", () => {
    const steps = generateSteps([], new Map(), new Map(), [], new Map(), new Map());
    expect(steps).toEqual([]);
  });

  it("generates colour, shell, filling, fill, and cap steps in order", () => {
    const pb = makePlanProduct();
    const bl = makeProductFilling();
    const filling = makeFilling();
    const fillingAmount: FillingAmount = {
      fillingId: "1", fillingName: "Dark ganache", planProductId: "1",
      productName: "Product A", weightG: 100, scaledIngredients: [],
    };

    const steps = generateSteps(
      [pb],
      new Map([["1", "Product A"]]),
      new Map([["1", [bl]]]),
      [fillingAmount],
      new Map([["1", filling]]),
      new Map([["1", mould]]),
    );

    const keys = steps.map((s) => s.key);
    expect(keys).toContain("color-1");
    expect(keys).toContain("shell-1");
    expect(keys).toContain("filling-1");
    expect(keys).toContain("fill-1");
    expect(keys).toContain("cap-1");

    // Ordering: colour → shell → filling → fill → cap → unmould
    const colorIdx = keys.indexOf("color-1");
    const shellIdx = keys.indexOf("shell-1");
    const fillingIdx = keys.indexOf("filling-1");
    const fillIdx = keys.indexOf("fill-1");
    const capIdx = keys.indexOf("cap-1");

    expect(colorIdx).toBeLessThan(shellIdx);
    expect(shellIdx).toBeLessThan(fillingIdx);
    expect(fillingIdx).toBeLessThan(fillIdx);
    expect(fillIdx).toBeLessThan(capIdx);
  });

  it("generates one colour/shell/cap step per planProduct", () => {
    const pb1 = makePlanProduct({ id: "1", productId: "1", mouldId: "1" });
    const pb2 = makePlanProduct({ id: "2", productId: "2", mouldId: "1" }); // same mould

    const steps = generateSteps(
      [pb1, pb2],
      new Map([["1", "Product A"], ["2", "Product B"]]),
      new Map([["1", []], ["2", []]]),
      [],
      new Map(),
      new Map([["1", mould]]),
    );

    const colorSteps = steps.filter((s) => s.key.startsWith("color-"));
    const shellSteps = steps.filter((s) => s.key.startsWith("shell-"));
    const capSteps = steps.filter((s) => s.key.startsWith("cap-"));

    // All step types are now per planProduct, so 2 products → 2 steps each
    expect(colorSteps).toHaveLength(2);
    expect(shellSteps).toHaveLength(2);
    expect(capSteps).toHaveLength(2);
  });

  it("skips fill and cap steps when product shell is 100% (solid bar)", () => {
    const pb = makePlanProduct();
    const solidBar: Product = {
      id: "1", name: "Solid Bar", createdAt: new Date(), updatedAt: new Date(),
      coating: "dark", shellPercentage: 100,
    };

    const steps = generateSteps(
      [pb],
      new Map([["1", "Solid Bar"]]),
      new Map([["1", []]]),
      [],
      new Map(),
      new Map([["1", mould]]),
      new Map([["1", solidBar]]),
    );

    const keys = steps.map((s) => s.key);
    expect(keys).toContain("color-1");
    expect(keys).toContain("shell-1");
    expect(keys).toContain("unmould-1");
    expect(keys).not.toContain("fill-1");
    expect(keys).not.toContain("cap-1");
  });

  it("sorts shell and cap steps by coating so same-coating moulds are adjacent", () => {
    const pb1 = makePlanProduct({ id: "1", productId: "1", sortOrder: 0 });
    const pb2 = makePlanProduct({ id: "2", productId: "2", sortOrder: 1 });
    const pb3 = makePlanProduct({ id: "3", productId: "3", sortOrder: 2 });

    const darkProduct: Product = { id: "1", name: "Dark", createdAt: new Date(), updatedAt: new Date(), coating: "dark" };
    const milkProduct: Product = { id: "2", name: "Milk", createdAt: new Date(), updatedAt: new Date(), coating: "milk" };
    const darkProduct2: Product = { id: "3", name: "Dark 2", createdAt: new Date(), updatedAt: new Date(), coating: "dark" };

    const steps = generateSteps(
      [pb1, pb2, pb3],
      new Map([["1", "Dark"], ["2", "Milk"], ["3", "Dark 2"]]),
      new Map([["1", []], ["2", []], ["3", []]]),
      [],
      new Map(),
      new Map([["1", mould]]),
      new Map([["1", darkProduct], ["2", milkProduct], ["3", darkProduct2]]),
    );

    const shellSteps = steps.filter((s) => s.key.startsWith("shell-"));
    const coatings = shellSteps.map((s) => s.coating);
    // Both dark steps should be grouped together (before or after milk)
    expect(coatings).toEqual(["dark", "dark", "milk"]);
  });

  it("assigns correct groups to steps", () => {
    const pb = makePlanProduct();
    const bl = makeProductFilling();
    const filling = makeFilling();

    const steps = generateSteps(
      [pb],
      new Map([["1", "Product A"]]),
      new Map([["1", [bl]]]),
      [{ fillingId: "1", fillingName: "Dark ganache", planProductId: "1", productName: "Product A", weightG: 100, scaledIngredients: [] }],
      new Map([["1", filling]]),
      new Map([["1", mould]]),
    );

    const byKey = Object.fromEntries(steps.map((s) => [s.key, s.group]));
    expect(byKey["color-1"]).toBe("colour");
    expect(byKey["shell-1"]).toBe("shell");
    expect(byKey["filling-1"]).toBe("filling");
    expect(byKey["fill-1"]).toBe("fill");
    expect(byKey["cap-1"]).toBe("cap");
  });

  it("excludes transfer sheet steps from colour tab and modifies cap label", () => {
    const pb = makePlanProduct();
    const product: Product = {
      id: "1", name: "Product A", createdAt: new Date(), updatedAt: new Date(),
      shellDesign: [{ technique: "Brushing", materialIds: ["mat1"], notes: "" }],
    };
    const transferSheet: DecorationMaterial = {
      id: "mat1", name: "Gold Leaf Transfer", type: "transfer_sheet",
    };
    const materialsMap = new Map<string, DecorationMaterial>([["mat1", transferSheet]]);

    const steps = generateSteps(
      [pb],
      new Map([["1", "Product A"]]),
      new Map([["1", []]]),
      [],
      new Map(),
      new Map([["1", mould]]),
      new Map([["1", product]]),
      {},
      materialsMap,
    );

    // No colour step — transfer sheet has no colour phase
    expect(steps.filter((s) => s.group === "colour")).toHaveLength(0);
    // Cap step label includes transfer sheet name
    const capStep = steps.find((s) => s.key === "cap-1")!;
    expect(capStep.label).toContain("Gold Leaf Transfer");
    expect(capStep.label).toContain("Cap using transfer sheet");
    expect(capStep.subgroup).toBeUndefined();
  });

  it("places after_cap steps in cap group with subgroup after_cap", () => {
    const pb = makePlanProduct();
    const product: Product = {
      id: "1", name: "Product A", createdAt: new Date(), updatedAt: new Date(),
      shellDesign: [
        { technique: "Airbrushing", materialIds: ["mat1"], applyAt: "on_mould" },
        { technique: "Brushing", materialIds: [], applyAt: "after_cap", notes: "Dust with lustre" },
      ],
    };

    const steps = generateSteps(
      [pb],
      new Map([["1", "Product A"]]),
      new Map([["1", []]]),
      [],
      new Map(),
      new Map([["1", mould]]),
      new Map([["1", product]]),
    );

    // on_mould step appears in colour tab
    const colourSteps = steps.filter((s) => s.group === "colour");
    expect(colourSteps).toHaveLength(1);
    expect(colourSteps[0].key).toBe("color-1-0");

    // after_cap step appears in cap group with subgroup
    const afterCapStep = steps.find((s) => s.key === "cap-after-1-1")!;
    expect(afterCapStep).toBeDefined();
    expect(afterCapStep.group).toBe("cap");
    expect(afterCapStep.subgroup).toBe("after_cap");
    expect(afterCapStep.label).toBe("Brushing: Product A");
    expect(afterCapStep.detail).toBe("Dust with lustre");

    // Regular cap step is still present and not affected
    const capStep = steps.find((s) => s.key === "cap-1")!;
    expect(capStep.label).toBe("Cap: Product A");
    expect(capStep.subgroup).toBeUndefined();
  });

  it("emits no colour step when all design steps are after_cap", () => {
    const pb = makePlanProduct();
    const product: Product = {
      id: "1", name: "Product A", createdAt: new Date(), updatedAt: new Date(),
      shellDesign: [{ technique: "Stamping", materialIds: [], applyAt: "after_cap" }],
    };

    const steps = generateSteps(
      [pb],
      new Map([["1", "Product A"]]),
      new Map([["1", []]]),
      [],
      new Map(),
      new Map([["1", mould]]),
      new Map([["1", product]]),
    );

    expect(steps.filter((s) => s.group === "colour")).toHaveLength(0);
    expect(steps.filter((s) => s.subgroup === "after_cap")).toHaveLength(1);
  });

  it("after_cap steps sort after regular cap steps within the same coating group", () => {
    const pb = makePlanProduct();
    const product: Product = {
      id: "1", name: "Product A", createdAt: new Date(), updatedAt: new Date(),
      coating: "dark",
      shellDesign: [{ technique: "Brushing", materialIds: [], applyAt: "after_cap" }],
    };

    const steps = generateSteps(
      [pb],
      new Map([["1", "Product A"]]),
      new Map([["1", []]]),
      [],
      new Map(),
      new Map([["1", mould]]),
      new Map([["1", product]]),
    );

    const capGroup = steps.filter((s) => s.group === "cap");
    // Regular cap first, then after_cap
    expect(capGroup[0].key).toBe("cap-1");
    expect(capGroup[1].key).toBe("cap-after-1-0");
    expect(capGroup[1].subgroup).toBe("after_cap");
  });

  it("consolidates shared fillings into a single filling step", () => {
    const pb1 = makePlanProduct({ id: "PB1", productId: "R1" });
    const pb2 = makePlanProduct({ id: "PB2", productId: "R2" });
    const sharedFilling = makeFilling({ id: "L1", name: "Dark ganache" });
    const uniqueFilling = makeFilling({ id: "L2", name: "Praline", category: "Pralines & Giandujas (Nut-Based)" });

    const fillingAmounts: FillingAmount[] = [
      { fillingId: "L1", fillingName: "Dark ganache", planProductId: "PB1", productName: "Product A", weightG: 300, scaledIngredients: [] },
      { fillingId: "L2", fillingName: "Praline", planProductId: "PB1", productName: "Product A", weightG: 100, scaledIngredients: [] },
      { fillingId: "L1", fillingName: "Dark ganache", planProductId: "PB2", productName: "Product B", weightG: 150, scaledIngredients: [] },
    ];

    const steps = generateSteps(
      [pb1, pb2],
      new Map([["R1", "Product A"], ["R2", "Product B"]]),
      new Map([
        ["R1", [makeProductFilling({ productId: "R1", fillingId: "L1" }), makeProductFilling({ id: "2", productId: "R1", fillingId: "L2", sortOrder: 1 })]],
        ["R2", [makeProductFilling({ productId: "R2", fillingId: "L1" })]],
      ]),
      fillingAmounts,
      new Map([["L1", sharedFilling], ["L2", uniqueFilling]]),
      new Map([["1", mould]]),
    );

    const fillingSteps = steps.filter((s) => s.group === "filling");
    // Should be 2 steps: one consolidated "Make Dark ganache" + one "Make Praline"
    expect(fillingSteps).toHaveLength(2);
    expect(fillingSteps[0].key).toBe("filling-L1");
    expect(fillingSteps[0].label).toBe("Make Dark ganache");
    expect(fillingSteps[0].detail).toContain("450g needed");
    expect(fillingSteps[0].detail).toContain("Product A (300g)");
    expect(fillingSteps[0].detail).toContain("Product B (150g)");
    expect(fillingSteps[1].key).toBe("filling-L2");
    expect(fillingSteps[1].label).toBe("Make Praline");
    expect(fillingSteps[1].detail).toBe("100g needed");

    // Fill steps remain per-product
    const fillSteps = steps.filter((s) => s.group === "fill");
    expect(fillSteps).toHaveLength(2);
    expect(fillSteps[0].key).toBe("fill-PB1");
    expect(fillSteps[1].key).toBe("fill-PB2");
  });
});

// ─── scheduleColorSteps ───────────────────────────────────────────────────

function makeColorTask(overrides: Partial<ColorTask> = {}): ColorTask {
  return {
    planProductId: "1",
    mouldId: "1",
    stepIndex: 0,
    technique: "Splattering / Speckling",
    colors: ["black"],
    mouldName: "Rect 15",
    productName: "Product A",
    ...overrides,
  };
}

describe("scheduleColorSteps", () => {
  it("returns empty array for empty input", () => {
    expect(scheduleColorSteps([])).toEqual([]);
  });

  it("returns single task unchanged", () => {
    const task = makeColorTask();
    const result = scheduleColorSteps([task]);
    expect(result).toEqual([task]);
  });

  it("batches two products with the same color together", () => {
    const t1 = makeColorTask({ planProductId: "1", colors: ["black"] });
    const t2 = makeColorTask({ planProductId: "2", colors: ["black"] });
    const result = scheduleColorSteps([t1, t2]);
    // Both should be batched together (same color, no switch)
    expect(result).toHaveLength(2);
    expect(result.every((t) => t.colors.includes("black"))).toBe(true);
  });

  it("minimizes switches in the gold/black example", () => {
    // B1: step0 = black speckles
    // B2: step0 = gold speckles, step1 = black airbrush
    const b1s0 = makeColorTask({ planProductId: "1", stepIndex: 0, colors: ["black"], productName: "B1" });
    const b2s0 = makeColorTask({ planProductId: "2", stepIndex: 0, colors: ["gold"], productName: "B2" });
    const b2s1 = makeColorTask({ planProductId: "2", stepIndex: 1, colors: ["black"], technique: "Airbrushing", productName: "B2" });

    const result = scheduleColorSteps([b1s0, b2s0, b2s1]);

    // Optimal: gold first (rare), then all black
    expect(result).toHaveLength(3);
    // Gold should come first
    expect(result[0].colors).toContain("gold");
    // Then both black tasks
    expect(result[1].colors).toContain("black");
    expect(result[2].colors).toContain("black");
    // B2 step order respected: step0 before step1
    const b2Steps = result.filter((t) => t.planProductId === "2");
    expect(b2Steps[0].stepIndex).toBeLessThan(b2Steps[1].stepIndex);
  });

  it("handles tasks with no colors (wildcards)", () => {
    const wild = makeColorTask({ planProductId: "1", colors: [], technique: "" });
    const colored = makeColorTask({ planProductId: "2", colors: ["red"] });
    const result = scheduleColorSteps([wild, colored]);
    expect(result).toHaveLength(2);
  });

  it("respects dependency chain within a product (3 steps)", () => {
    const s0 = makeColorTask({ planProductId: "1", stepIndex: 0, colors: ["red"] });
    const s1 = makeColorTask({ planProductId: "1", stepIndex: 1, colors: ["blue"] });
    const s2 = makeColorTask({ planProductId: "1", stepIndex: 2, colors: ["red"] });
    const result = scheduleColorSteps([s0, s1, s2]);
    expect(result).toHaveLength(3);
    // Must maintain order: 0 before 1 before 2
    expect(result[0].stepIndex).toBe(0);
    expect(result[1].stepIndex).toBe(1);
    expect(result[2].stepIndex).toBe(2);
  });

  it("handles multi-color step matching current color", () => {
    const t1 = makeColorTask({ planProductId: "1", stepIndex: 0, colors: ["red"] });
    const t2 = makeColorTask({ planProductId: "2", stepIndex: 0, colors: ["red", "gold"] });
    const result = scheduleColorSteps([t1, t2]);
    expect(result).toHaveLength(2);
    // Both match "red", should be batched
  });

  it("schedules multi-color steps before single-color steps sharing a color", () => {
    // B1: orange only. B2: orange + gold (same step).
    // Expected: B2 first (uses both colors while active), then B1.
    const b1 = makeColorTask({ planProductId: "1", stepIndex: 0, colors: ["orange"], productName: "B1" });
    const b2 = makeColorTask({ planProductId: "2", stepIndex: 0, colors: ["orange", "gold"], productName: "B2" });

    const result = scheduleColorSteps([b1, b2]);

    expect(result).toHaveLength(2);
    expect(result[0].planProductId).toBe("2"); // multi-color first
    expect(result[1].planProductId).toBe("1"); // single-color after
  });
});

// ─── generateSteps with shell design scheduling ──────────────────────────

describe("generateSteps with shellDesign", () => {
  it("generates optimized color steps when products have shellDesign", () => {
    const pb1 = makePlanProduct({ id: "1", productId: "1", mouldId: "1" });
    const pb2 = makePlanProduct({ id: "2", productId: "2", mouldId: "2" });

    const product1: Product = {
      id: "1", name: "B1", createdAt: new Date(), updatedAt: new Date(),
      shellDesign: [{ technique: "Splattering / Speckling", materialIds: ["black"] }],
    };
    const product2: Product = {
      id: "2", name: "B2", createdAt: new Date(), updatedAt: new Date(),
      shellDesign: [
        { technique: "Splattering / Speckling", materialIds: ["gold"] },
        { technique: "Airbrushing", materialIds: ["black"] },
      ],
    };

    const mould2: Mould = { id: "2", name: "Round 24", cavityWeightG: 8, numberOfCavities: 24 };

    const steps = generateSteps(
      [pb1, pb2],
      new Map([["1", "B1"], ["2", "B2"]]),
      new Map([["1", []], ["2", []]]),
      [],
      new Map(),
      new Map([["1", mould], ["2", mould2]]),
      new Map([["1", product1], ["2", product2]]),
    );

    const colorSteps = steps.filter((s) => s.key.startsWith("color-"));
    expect(colorSteps).toHaveLength(3);

    // Gold should come before black steps (optimal scheduling)
    const goldIdx = colorSteps.findIndex((s) => s.colors?.includes("gold"));
    const blackIdxs = colorSteps
      .map((s, i) => s.colors?.includes("black") ? i : -1)
      .filter((i) => i >= 0);
    for (const bi of blackIdxs) {
      expect(goldIdx).toBeLessThan(bi);
    }

    // Color steps should have colors array set
    expect(colorSteps.every((s) => s.colors && s.colors.length > 0)).toBe(true);
  });

  it("uses planProductId in color step keys", () => {
    const pb = makePlanProduct({ id: "42", productId: "1", mouldId: "1" });
    const product: Product = {
      id: "1", name: "B1", createdAt: new Date(), updatedAt: new Date(),
      shellDesign: [{ technique: "Airbrushing", materialIds: ["red"] }],
    };

    const steps = generateSteps(
      [pb],
      new Map([["1", "B1"]]),
      new Map([["1", []]]),
      [],
      new Map(),
      new Map([["1", mould]]),
      new Map([["1", product]]),
    );

    const colorStep = steps.find((s) => s.key.startsWith("color-"));
    expect(colorStep?.key).toBe("color-42-0");
  });

  it("generates an unmould step per planProduct with planProductId and totalProducts", () => {
    const pb = makePlanProduct({ id: "1", quantity: 2 });
    const steps = generateSteps(
      [pb],
      new Map([["1", "Product A"]]),
      new Map([["1", []]]),
      [],
      new Map(),
      new Map([["1", mould]]),
    );
    const unmould = steps.filter((s) => s.key.startsWith("unmould-"));
    expect(unmould).toHaveLength(1);
    expect(unmould[0].group).toBe("unmould");
    expect(unmould[0].planProductId).toBe("1");
    expect(unmould[0].totalProducts).toBe(30); // 2 moulds × 15 cavities
    expect(unmould[0].detail).toContain("30 products");
  });

  it("falls back to legacy key when no shellDesign", () => {
    const pb = makePlanProduct({ id: "1", productId: "1", mouldId: "1" });
    const product: Product = {
      id: "1", name: "B1", createdAt: new Date(), updatedAt: new Date(),
    };

    const steps = generateSteps(
      [pb],
      new Map([["1", "B1"]]),
      new Map([["1", []]]),
      [],
      new Map(),
      new Map([["1", mould]]),
      new Map([["1", product]]),
    );

    const colorStep = steps.find((s) => s.key.startsWith("color-"));
    expect(colorStep?.key).toBe("color-1"); // legacy mouldId format
  });
});

// ─── generateBatchSummary ──────────────────────────────────────────────────

function makeBatchSummaryParams(overrides: Partial<Parameters<typeof generateBatchSummary>[0]> = {}) {
  return {
    batchNumber: "20260322-001",
    planName: "Spring batch",
    completedAt: new Date("2026-03-22T14:00:00Z"),
    planProducts: [],
    productNames: new Map<string, string>(),
    moulds: new Map<string, Mould>(),
    fillingAmounts: [] as FillingAmount[],
    ingredients: [] as IngredientRef[],
    ...overrides,
  };
}

describe("generateBatchSummary", () => {
  it("includes batch number and plan name in output", () => {
    const result = generateBatchSummary(makeBatchSummaryParams());
    expect(result).toContain("20260322-001");
    expect(result).toContain("Spring batch");
  });

  it("omits batch number line when batchNumber is undefined", () => {
    const result = generateBatchSummary(makeBatchSummaryParams({ batchNumber: undefined }));
    expect(result).not.toContain("Batch number:");
    expect(result).toContain("Spring batch");
  });

  it("includes the completed date", () => {
    const result = generateBatchSummary(makeBatchSummaryParams());
    // en-GB locale: "22 March 2026"
    expect(result).toContain("22 March 2026");
  });

  it("shows product name, piece count, and mould count", () => {
    const pb: PlanProduct = { id: "1", planId: "1", productId: "1", mouldId: "1", quantity: 2, sortOrder: 0 };
    const result = generateBatchSummary(makeBatchSummaryParams({
      planProducts: [pb],
      productNames: new Map([["1", "Dark Truffle"]]),
      moulds: new Map([["1", mould]]), // 15 cavities × 2 = 30 pcs
    }));
    expect(result).toContain("Dark Truffle");
    expect(result).toContain("30 pcs");
    expect(result).toContain("2 moulds");
  });

  it("shows total piece count", () => {
    const pb1: PlanProduct = { id: "1", planId: "1", productId: "1", mouldId: "1", quantity: 1, sortOrder: 0 };
    const pb2: PlanProduct = { id: "2", planId: "1", productId: "2", mouldId: "1", quantity: 1, sortOrder: 1 };
    const result = generateBatchSummary(makeBatchSummaryParams({
      planProducts: [pb1, pb2],
      productNames: new Map([["1", "A"], ["2", "B"]]),
      moulds: new Map([["1", mould]]), // 15 cavities each → 30 total
    }));
    expect(result).toContain("30 pcs"); // grand total
  });

  it("lists ingredients with scaled amounts", () => {
    const la: FillingAmount = {
      fillingId: "1", fillingName: "Ganache", planProductId: "1", productName: "A",
      weightG: 100,
      scaledIngredients: [
        { ingredientId: "1", amount: 70, unit: "g" },
        { ingredientId: "2", amount: 30, unit: "g" },
      ],
    };
    const ings: IngredientRef[] = [
      { id: "1", name: "Dark chocolate", manufacturer: "Valrhona" },
      { id: "2", name: "Cream" },
    ];
    const result = generateBatchSummary(makeBatchSummaryParams({ fillingAmounts: [la], ingredients: ings }));
    expect(result).toContain("INGREDIENTS USED");
    expect(result).toContain("Dark chocolate (Valrhona)");
    expect(result).toContain("70g");
    expect(result).toContain("Cream");
    expect(result).toContain("30g");
  });

  it("aggregates the same ingredient across multiple fillings", () => {
    const la1: FillingAmount = {
      fillingId: "1", fillingName: "Ganache", planProductId: "1", productName: "A",
      weightG: 100,
      scaledIngredients: [{ ingredientId: "1", amount: 50, unit: "g" }],
    };
    const la2: FillingAmount = {
      fillingId: "2", fillingName: "Caramel", planProductId: "1", productName: "A",
      weightG: 80,
      scaledIngredients: [{ ingredientId: "1", amount: 30, unit: "g" }],
    };
    const ings: IngredientRef[] = [{ id: "1", name: "Cream" }];
    const result = generateBatchSummary(makeBatchSummaryParams({ fillingAmounts: [la1, la2], ingredients: ings }));
    // 50 + 30 = 80g total cream
    expect(result).toContain("80g");
    // Should appear only once
    const matches = result.match(/Cream/g);
    expect(matches).toHaveLength(1);
  });

  it("omits ingredients section when there are no filling amounts", () => {
    const result = generateBatchSummary(makeBatchSummaryParams({ fillingAmounts: [] }));
    expect(result).not.toContain("INGREDIENTS USED");
  });

  it("uses ingredient id fallback when name is unknown", () => {
    const la: FillingAmount = {
      fillingId: "1", fillingName: "Ganache", planProductId: "1", productName: "A",
      weightG: 100,
      scaledIngredients: [{ ingredientId: "99", amount: 100, unit: "g" }],
    };
    const result = generateBatchSummary(makeBatchSummaryParams({ fillingAmounts: [la], ingredients: [] }));
    expect(result).toContain("Ingredient #99");
  });

  it("includes previous batch filling section when previousBatches provided", () => {
    const result = generateBatchSummary(makeBatchSummaryParams({
      previousBatches: {
        "filling-1": { madeAt: "2026-01-01", shelfLifeWeeks: 8, fillingName: "Hazelnut Praline" },
      },
    }));
    expect(result).toContain("FILLINGS FROM PREVIOUS BATCH");
    expect(result).toContain("Hazelnut Praline");
  });

  it("shows 'actual of planned' format when actualYield differs from planned", () => {
    const pb: PlanProduct = { id: "1", planId: "1", productId: "1", mouldId: "1", quantity: 2, sortOrder: 0, actualYield: 25 };
    const result = generateBatchSummary(makeBatchSummaryParams({
      planProducts: [pb],
      productNames: new Map([["1", "Dark Truffle"]]),
      moulds: new Map([["1", mould]]), // 15 cavities × 2 = 30 planned
    }));
    expect(result).toContain("25 of 30 pcs");
    expect(result).not.toContain("Total:");
  });

  it("shows yield percentage and To stock / Planned lines when yield differs", () => {
    const pb1: PlanProduct = { id: "1", planId: "1", productId: "1", mouldId: "1", quantity: 1, sortOrder: 0, actualYield: 14 };
    const pb2: PlanProduct = { id: "2", planId: "1", productId: "2", mouldId: "1", quantity: 1, sortOrder: 1, actualYield: 13 };
    const result = generateBatchSummary(makeBatchSummaryParams({
      planProducts: [pb1, pb2],
      productNames: new Map([["1", "A"], ["2", "B"]]),
      moulds: new Map([["1", mould]]), // 15 cavities each → 30 planned, 27 actual
    }));
    expect(result).toContain("To stock:");
    expect(result).toContain("27 pcs");
    expect(result).toContain("Planned:");
    expect(result).toContain("30 pcs");
    expect(result).toContain("Yield:");
    expect(result).toContain("90.0%");
  });

  it("shows plain Total when actualYield matches planned", () => {
    const pb: PlanProduct = { id: "1", planId: "1", productId: "1", mouldId: "1", quantity: 2, sortOrder: 0 };
    const result = generateBatchSummary(makeBatchSummaryParams({
      planProducts: [pb],
      productNames: new Map([["1", "Standard Product"]]),
      moulds: new Map([["1", mould]]), // 15 cavities × 2 = 30
    }));
    expect(result).toContain("Total:");
    expect(result).toContain("30 pcs");
    expect(result).not.toContain("Yield:");
    expect(result).not.toContain("To stock:");
  });

  it("shows plain Total when actualYield equals planned explicitly", () => {
    const pb: PlanProduct = { id: "1", planId: "1", productId: "1", mouldId: "1", quantity: 1, sortOrder: 0, actualYield: 15 };
    const result = generateBatchSummary(makeBatchSummaryParams({
      planProducts: [pb],
      productNames: new Map([["1", "Full Yield"]]),
      moulds: new Map([["1", mould]]),
    }));
    expect(result).toContain("Total:");
    expect(result).toContain("15 pcs");
    expect(result).not.toContain("Yield:");
  });
});

// ─── computeEffectiveShelfLife ────────────────────────────────────────────

describe("computeEffectiveShelfLife", () => {
  it("returns null when product has no shelf life", () => {
    const { effectiveWeeks } = computeEffectiveShelfLife(undefined, [], {}, new Date());
    expect(effectiveWeeks).toBeNull();
  });

  it("returns product shelf life when no previous batch fillings", () => {
    const { effectiveWeeks, limitedByFillingId } = computeEffectiveShelfLife("4", ["filling-1"], {}, new Date());
    expect(effectiveWeeks).toBe(4);
    expect(limitedByFillingId).toBeNull();
  });

  it("reduces shelf life when previous batch filling is older than product shelf life allows", () => {
    // Filling made 2 weeks ago, has 3-week shelf life → 1 week remaining
    // Product shelf life is 3 weeks → effective should be ~1 week
    const twoWeeksAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { effectiveWeeks, limitedByFillingId } = computeEffectiveShelfLife(
      "3",
      ["filling-1"],
      { "filling-1": { madeAt: twoWeeksAgo, shelfLifeWeeks: 3, fillingName: "Praline" } },
      new Date(),
    );
    expect(effectiveWeeks).toBeGreaterThanOrEqual(0.9);
    expect(effectiveWeeks).toBeLessThanOrEqual(1.1);
    expect(limitedByFillingId).toBe("filling-1");
  });

  it("does not reduce shelf life when previous batch filling has plenty of life left", () => {
    // Filling made 1 week ago, has 12-week shelf life → 11 weeks remaining
    // Product shelf life is 4 weeks → effective stays at 4 weeks
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { effectiveWeeks, limitedByFillingId } = computeEffectiveShelfLife(
      "4",
      ["filling-1"],
      { "filling-1": { madeAt: oneWeekAgo, shelfLifeWeeks: 12 } },
      new Date(),
    );
    expect(effectiveWeeks).toBe(4);
    expect(limitedByFillingId).toBeNull();
  });

  it("clamps to 0 when filling has expired", () => {
    // Filling made 4 weeks ago, has 3-week shelf life → already expired
    const fourWeeksAgo = new Date(Date.now() - 28 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const { effectiveWeeks } = computeEffectiveShelfLife(
      "6",
      ["filling-1"],
      { "filling-1": { madeAt: fourWeeksAgo, shelfLifeWeeks: 3 } },
      new Date(),
    );
    expect(effectiveWeeks).toBe(0);
  });
});

// ─── Alternative mould setup ──────────────────────────────────────────────

const mouldB: Mould = { id: "2", name: "Heart 24", cavityWeightG: 8, numberOfCavities: 24 };

describe("getMouldSlots", () => {
  it("returns a single primary slot for a default plan product", () => {
    const slots = getMouldSlots(makePlanProduct({ quantity: 2 }), new Map([["1", mould]]));
    expect(slots).toHaveLength(1);
    expect(slots[0].slotId).toBe("primary");
    expect(slots[0].cavityCount).toBe(30); // 15 × 2
    expect(slots[0].physicalMouldCount).toBe(2);
    expect(slots[0].isPartial).toBe(false);
    expect(slots[0].label).toBe("2× Rect 15");
  });

  it("returns a partial-cavity primary slot when partialCavities is set", () => {
    const slots = getMouldSlots(
      makePlanProduct({ quantity: 2, partialCavities: 8 }),
      new Map([["1", mould]]),
    );
    expect(slots).toHaveLength(1);
    expect(slots[0].cavityCount).toBe(8); // overrides quantity × numberOfCavities
    expect(slots[0].physicalMouldCount).toBe(1); // partial uses 1 physical mould
    expect(slots[0].isPartial).toBe(true);
    expect(slots[0].label).toBe("8 cavities of Rect 15");
  });

  it("includes every additional mould in order", () => {
    const slots = getMouldSlots(
      makePlanProduct({
        quantity: 1,
        additionalMoulds: [
          { mouldId: "2", quantity: 1 },
          { mouldId: "2", quantity: 1, partialCavities: 12 },
        ],
      }),
      new Map([["1", mould], ["2", mouldB]]),
    );
    expect(slots).toHaveLength(3);
    expect(slots.map((s) => s.slotId)).toEqual(["primary", "add-0", "add-1"]);
    expect(slots[1].cavityCount).toBe(24); // full Heart 24
    expect(slots[2].cavityCount).toBe(12); // partial
    expect(slots[2].label).toBe("12 cavities of Heart 24");
  });

  it("silently drops slots whose mould is missing from the map", () => {
    const slots = getMouldSlots(
      makePlanProduct({ additionalMoulds: [{ mouldId: "99", quantity: 1 }] }),
      new Map([["1", mould]]),
    );
    expect(slots).toHaveLength(1);
    expect(slots[0].slotId).toBe("primary");
  });
});

describe("getTotalCavities", () => {
  it("sums cavities across primary and additional moulds", () => {
    const total = getTotalCavities(
      makePlanProduct({
        quantity: 2,
        additionalMoulds: [{ mouldId: "2", quantity: 1 }],
      }),
      new Map([["1", mould], ["2", mouldB]]),
    );
    expect(total).toBe(30 + 24); // 15×2 + 24×1
  });

  it("respects partial cavities on both primary and additional slots", () => {
    const total = getTotalCavities(
      makePlanProduct({
        quantity: 2,
        partialCavities: 10,
        additionalMoulds: [{ mouldId: "2", quantity: 1, partialCavities: 6 }],
      }),
      new Map([["1", mould], ["2", mouldB]]),
    );
    expect(total).toBe(16);
  });
});

describe("formatMouldList", () => {
  it("joins slot labels with ' + '", () => {
    const pp = makePlanProduct({
      quantity: 2,
      additionalMoulds: [{ mouldId: "2", quantity: 1, partialCavities: 12 }],
    });
    expect(formatMouldList(pp, new Map([["1", mould], ["2", mouldB]])))
      .toBe("2× Rect 15 + 12 cavities of Heart 24");
  });
});

describe("hasAlternativeMouldSetup", () => {
  it("is false for the default single-full-mould path", () => {
    expect(hasAlternativeMouldSetup(makePlanProduct())).toBe(false);
  });
  it("is true when partialCavities is set", () => {
    expect(hasAlternativeMouldSetup(makePlanProduct({ partialCavities: 5 }))).toBe(true);
  });
  it("is true when additionalMoulds is non-empty", () => {
    expect(hasAlternativeMouldSetup(makePlanProduct({ additionalMoulds: [{ mouldId: "2", quantity: 1 }] }))).toBe(true);
  });
});

describe("calculateFillingAmounts with alternative mould setup", () => {
  it("sums fill volume across primary and additional moulds", () => {
    const baseMouldOnly = calculateFillingAmounts(
      [makePlanProduct({ quantity: 1 })],
      new Map([["1", "A"]]),
      new Map([["1", [makeProductFilling()]]]),
      new Map([["1", [makeFillingIngredient({ amount: 100 })]]]),
      new Map([["1", makeFilling()]]),
      new Map([["1", mould]]),
    );

    const withAdditional = calculateFillingAmounts(
      [makePlanProduct({ quantity: 1, additionalMoulds: [{ mouldId: "2", quantity: 1 }] })],
      new Map([["1", "A"]]),
      new Map([["1", [makeProductFilling()]]]),
      new Map([["1", [makeFillingIngredient({ amount: 100 })]]]),
      new Map([["1", makeFilling()]]),
      new Map([["1", mould], ["2", mouldB]]),
    );

    // Adding a second mould must strictly increase the fill weight.
    expect(withAdditional[0].weightG).toBeGreaterThan(baseMouldOnly[0].weightG);
    // Exact check: 15×10 + 24×8 = 342 ml; × 0.63 × 1.2 ≈ 258.55g
    const expected = Math.round((15 * 10 + 24 * 8) * FILL_FACTOR * DENSITY_G_PER_ML);
    expect(withAdditional[0].weightG).toBe(expected);
  });

  it("uses partialCavities to scale the primary mould's fill volume", () => {
    const result = calculateFillingAmounts(
      [makePlanProduct({ quantity: 1, partialCavities: 5 })],
      new Map([["1", "A"]]),
      new Map([["1", [makeProductFilling()]]]),
      new Map([["1", [makeFillingIngredient({ amount: 100 })]]]),
      new Map([["1", makeFilling()]]),
      new Map([["1", mould]]),
    );
    // 5 cavities × 10g × 0.63 × 1.2 = 37.8 → 38g
    const expected = Math.round(5 * 10 * FILL_FACTOR * DENSITY_G_PER_ML);
    expect(result[0].weightG).toBe(expected);
  });

  it("scales grams-mode fillings by each slot's cavity volume", () => {
    // Product with fillMode "grams" stores fillFraction (0–1 of cavity volume).
    // Fraction 0.5 against the 10g/cavity reference mould = 6g/cavity originally,
    // but production rescales to each planned mould's actual cavity weight so the
    // fill-to-shell ratio is preserved.
    const product: Product = {
      id: "1", name: "Gram product", createdAt: new Date(), updatedAt: new Date(),
      fillMode: "grams", shellPercentage: 40,
    };
    const result = calculateFillingAmounts(
      [makePlanProduct({ quantity: 1, additionalMoulds: [{ mouldId: "2", quantity: 1 }] })],
      new Map([["1", "Gram product"]]),
      new Map([["1", [makeProductFilling({ fillFraction: 0.5 })]]]),
      new Map([["1", [makeFillingIngredient({ amount: 100 })]]]),
      new Map([["1", makeFilling()]]),
      new Map([["1", mould], ["2", mouldB]]),
      {},
      {},
      new Map([["1", product]]),
    );
    // mould (15 cavities × 10g) × 0.5 × 1.2 + mouldB (24 cavities × 8g) × 0.5 × 1.2
    // = 90 + 115.2 = 205.2 → rounded 205
    const expected = Math.round((15 * 10 + 24 * 8) * 0.5 * DENSITY_G_PER_ML);
    expect(result[0].weightG).toBe(expected);
  });

  it("rescales grams-mode fillings when produced on a different mould than the reference", () => {
    // Recipe authored against the 10g-cavity reference (e.g. user typed 6g per cavity,
    // stored as 0.5). Producing on the 8g-cavity mouldB instead should yield 4.8g per cavity.
    const product: Product = {
      id: "1", name: "Gram product", createdAt: new Date(), updatedAt: new Date(),
      fillMode: "grams", shellPercentage: 40,
    };
    const result = calculateFillingAmounts(
      [makePlanProduct({ quantity: 1, mouldId: "2" })], // produce on mouldB only
      new Map([["1", "Gram product"]]),
      new Map([["1", [makeProductFilling({ fillFraction: 0.5 })]]]),
      new Map([["1", [makeFillingIngredient({ amount: 100 })]]]),
      new Map([["1", makeFilling()]]),
      new Map([["1", mould], ["2", mouldB]]),
      {},
      {},
      new Map([["1", product]]),
    );
    // 24 cavities × 8g × 0.5 × 1.2 = 115.2 → rounded 115
    const expected = Math.round(24 * 8 * 0.5 * DENSITY_G_PER_ML);
    expect(result[0].weightG).toBe(expected);
  });
});

describe("generateSteps with alternative mould setup", () => {
  const twoSlotPb = (): PlanProduct =>
    makePlanProduct({ id: "99", productId: "1", additionalMoulds: [{ mouldId: "2", quantity: 1 }] });

  it("emits one shell/fill/cap step per slot and keys them with slotId", () => {
    const steps = generateSteps(
      [twoSlotPb()],
      new Map([["1", "Product A"]]),
      new Map([["1", [makeProductFilling()]]]),
      [],
      new Map([["1", makeFilling()]]),
      new Map([["1", mould], ["2", mouldB]]),
    );

    const shell = steps.filter((s) => s.group === "shell");
    const fill = steps.filter((s) => s.group === "fill");
    const cap = steps.filter((s) => s.group === "cap");

    expect(shell.map((s) => s.key)).toEqual(["shell-99-primary", "shell-99-add-0"]);
    expect(fill.map((s) => s.key)).toEqual(["fill-99-primary", "fill-99-add-0"]);
    expect(cap.map((s) => s.key)).toEqual(["cap-99-primary", "cap-99-add-0"]);
    // Mould name appears in the label so the user can tell slots apart on the checklist
    expect(shell[0].label).toContain("Rect 15");
    expect(shell[1].label).toContain("Heart 24");
  });

  it("keeps legacy single-key format when only the primary mould is used", () => {
    const steps = generateSteps(
      [makePlanProduct({ id: "7" })],
      new Map([["1", "A"]]),
      new Map([["1", [makeProductFilling()]]]),
      [],
      new Map([["1", makeFilling()]]),
      new Map([["1", mould]]),
    );
    expect(steps.some((s) => s.key === "shell-7")).toBe(true);
    expect(steps.some((s) => s.key.startsWith("shell-7-"))).toBe(false);
  });

  it("emits a single unmould step per plan product that aggregates all slots", () => {
    const steps = generateSteps(
      [twoSlotPb()],
      new Map([["1", "Product A"]]),
      new Map([["1", []]]),
      [],
      new Map(),
      new Map([["1", mould], ["2", mouldB]]),
    );
    const unmould = steps.filter((s) => s.group === "unmould");
    expect(unmould).toHaveLength(1);
    expect(unmould[0].key).toBe("unmould-99");
    expect(unmould[0].totalProducts).toBe(15 + 24);
    expect(unmould[0].detail).toContain("1× Rect 15");
    expect(unmould[0].detail).toContain("1× Heart 24");
  });
});

describe("generateBatchSummary with alternative mould setup", () => {
  it("lists every mould used for a product on a single line", () => {
    const pb: PlanProduct = makePlanProduct({
      quantity: 2,
      additionalMoulds: [{ mouldId: "2", quantity: 1, partialCavities: 12 }],
    });
    const result = generateBatchSummary({
      batchNumber: "B",
      planName: "P",
      completedAt: new Date("2026-04-20T12:00:00Z"),
      planProducts: [pb],
      productNames: new Map([["1", "Truffle"]]),
      moulds: new Map([["1", mould], ["2", mouldB]]),
      fillingAmounts: [],
      ingredients: [],
    });
    // Single row per product, mould list is "2× Rect 15 + 12 cavities of Heart 24"
    expect(result).toContain("Truffle");
    expect(result).toContain("2× Rect 15 + 12 cavities of Heart 24");
    // Total cavities = 15×2 + 12 = 42
    expect(result).toContain("42 pcs");
  });
});

// ─── Standalone fillings (PlanFilling-driven) ──────────────────────────────

function makePlanFilling(overrides: Partial<PlanFilling> = {}): PlanFilling {
  return { id: "pf1", planId: "plan1", fillingId: "1", targetGrams: 500, sortOrder: 0, ...overrides };
}

describe("calculateStandaloneFillingAmounts", () => {
  it("returns an empty array when no PlanFillings are given", () => {
    const result = calculateStandaloneFillingAmounts([], new Map(), new Map());
    expect(result).toEqual([]);
  });

  it("scales ingredients by targetGrams / baseRecipeTotal", () => {
    // Recipe base = 100g sugar + 50g cream = 150g total. Target = 450g → ×3.
    const pf = makePlanFilling({ targetGrams: 450 });
    const filling = makeFilling({ id: "1", name: "Caramel" });
    const sugar: FillingIngredient = { id: "s", fillingId: "1", ingredientId: "sugar", amount: 100, unit: "g", sortOrder: 0 };
    const cream: FillingIngredient = { id: "c", fillingId: "1", ingredientId: "cream", amount: 50, unit: "g", sortOrder: 1 };

    const [out] = calculateStandaloneFillingAmounts(
      [pf],
      new Map([["1", filling]]),
      new Map([["1", [sugar, cream]]]),
    );

    expect(out.fillingName).toBe("Caramel");
    expect(out.targetGrams).toBe(450);
    expect(out.multiplier).toBe(3);
    expect(out.scaledIngredients).toHaveLength(2);
    expect(out.scaledIngredients[0]).toMatchObject({ ingredientId: "sugar", amount: 300, unit: "g" });
    expect(out.scaledIngredients[1]).toMatchObject({ ingredientId: "cream", amount: 150, unit: "g" });
  });

  it("handles zero-ingredient recipes without dividing by zero", () => {
    const pf = makePlanFilling({ targetGrams: 200 });
    const filling = makeFilling();
    const [out] = calculateStandaloneFillingAmounts([pf], new Map([["1", filling]]), new Map([["1", []]]));
    expect(out.multiplier).toBe(0);
    expect(out.scaledIngredients).toEqual([]);
  });

  it("skips PlanFillings whose fillingId is unknown", () => {
    const pf = makePlanFilling({ fillingId: "missing" });
    const result = calculateStandaloneFillingAmounts([pf], new Map(), new Map());
    expect(result).toEqual([]);
  });

  it("preserves per-ingredient note and unit", () => {
    const pf = makePlanFilling({ targetGrams: 100 });
    const filling = makeFilling();
    const li = makeFillingIngredient({ amount: 100, unit: "ml", note: "room temp" });
    const [out] = calculateStandaloneFillingAmounts([pf], new Map([["1", filling]]), new Map([["1", [li]]]));
    expect(out.scaledIngredients[0]).toMatchObject({ unit: "ml", note: "room temp", amount: 100 });
  });

  it("scales by measuredYieldG when set, accounting for cook-loss", () => {
    // Raw sum = 688 g, cooked yield = 503 g (26.9% loss). Target = 600 g cooked
    // → multiplier = 600 / 503 ≈ 1.193 (not 600/688 = 0.872).
    const pf = makePlanFilling({ targetGrams: 600 });
    const filling = makeFilling({ id: "1", name: "Caramel", measuredYieldG: 503 });
    const sugar: FillingIngredient = { id: "s", fillingId: "1", ingredientId: "sugar", amount: 400, unit: "g", sortOrder: 0 };
    const cream: FillingIngredient = { id: "c", fillingId: "1", ingredientId: "cream", amount: 288, unit: "g", sortOrder: 1 };

    const [out] = calculateStandaloneFillingAmounts(
      [pf],
      new Map([["1", filling]]),
      new Map([["1", [sugar, cream]]]),
    );

    expect(out.multiplier).toBe(1.19); // 600/503 ≈ 1.1928, rounded to 2dp for display
    // Raw ingredients scale by full-precision multiplier (1.1928…), each rounded to 1dp:
    //   400 × 1.1928 = 477.13 → 477.1
    //   288 × 1.1928 = 343.53 → 343.5
    expect(out.scaledIngredients[0].amount).toBe(477.1);
    expect(out.scaledIngredients[1].amount).toBe(343.5);
  });

  it("falls back to raw ingredient total when measuredYieldG is undefined", () => {
    // Pure ganache — no cook-loss. target = raw sum → multiplier = 1.
    const pf = makePlanFilling({ targetGrams: 150 });
    const filling = makeFilling({ id: "1" }); // no measuredYieldG
    const li = makeFillingIngredient({ amount: 150 });
    const [out] = calculateStandaloneFillingAmounts([pf], new Map([["1", filling]]), new Map([["1", [li]]]));
    expect(out.multiplier).toBe(1);
    expect(out.scaledIngredients[0].amount).toBe(150);
  });
});

describe("generateSteps with standalone fillings (fillings-only and hybrid plans)", () => {
  const filling = makeFilling({ id: "1", name: "Caramel" });
  const sf: StandaloneFillingAmount = {
    planFillingId: "pf1",
    fillingId: "1",
    fillingName: "Caramel",
    targetGrams: 500,
    multiplier: 2,
    scaledIngredients: [],
    scaledNestedFillings: [],
  };

  it("emits no product-phase steps for a pure fillings-only plan", () => {
    const steps = generateSteps(
      [], new Map(), new Map(), [], new Map([["1", filling]]), new Map(),
      new Map(), {}, new Map(),
      [sf],
    );
    expect(steps).toHaveLength(1);
    expect(steps[0].group).toBe("filling");
    expect(steps[0].key).toBe("planfilling-pf1");
    // None of these product-only phases should appear
    for (const group of ["colour", "shell", "fill", "cap", "unmould"] as const) {
      expect(steps.find((s) => s.group === group)).toBeUndefined();
    }
  });

  it("keyed distinctly from product-driven filling consolidation (no collision in hybrid plans)", () => {
    // Hybrid plan: one product that uses Caramel AND a standalone Caramel batch.
    const pb = makePlanProduct();
    const pf = makeProductFilling({ fillingId: "1", fillPercentage: 100 });
    const li = makeFillingIngredient({ fillingId: "1", amount: 100 });
    const fillingAmounts = calculateFillingAmounts(
      [pb],
      new Map([["1", "Product A"]]),
      new Map([["1", [pf]]]),
      new Map([["1", [li]]]),
      new Map([["1", filling]]),
      new Map([["1", mould]]),
    );
    const steps = generateSteps(
      [pb],
      new Map([["1", "Product A"]]),
      new Map([["1", [pf]]]),
      fillingAmounts,
      new Map([["1", filling]]),
      new Map([["1", mould]]),
      new Map(),
      {},
      new Map(),
      [sf],
    );
    const fillingSteps = steps.filter((s) => s.group === "filling");
    // One product-driven + one standalone — distinct keys
    const keys = fillingSteps.map((s) => s.key).sort();
    expect(keys).toEqual(["filling-1", "planfilling-pf1"]);
  });

  it("includes targetGrams and planFillingId on the standalone step", () => {
    const steps = generateSteps(
      [], new Map(), new Map(), [], new Map([["1", filling]]), new Map(),
      new Map(), {}, new Map(), [sf],
    );
    expect(steps[0]).toMatchObject({
      key: "planfilling-pf1",
      planFillingId: "pf1",
      targetGrams: 500,
      group: "filling",
    });
    expect(steps[0].detail).toContain("500g");
    expect(steps[0].detail).toContain("×2 base");
  });
});

describe("generateBatchSummary for fillings-only and hybrid plans", () => {
  const filling = makeFilling({ id: "1", name: "Caramel" });
  const ings: IngredientRef[] = [{ id: "sugar", name: "Sugar" }];
  const sf: StandaloneFillingAmount = {
    planFillingId: "pf1",
    fillingId: "1",
    fillingName: "Caramel",
    targetGrams: 500,
    multiplier: 2,
    scaledIngredients: [{ ingredientId: "sugar", amount: 200, unit: "g" }],
    scaledNestedFillings: [],
  };

  it("skips PRODUCTS PRODUCED when no planProducts and emits FILLING BATCHES section", () => {
    const out = generateBatchSummary({
      batchNumber: "B1",
      planName: "Filling day",
      completedAt: new Date("2026-04-21T10:00:00Z"),
      planProducts: [],
      productNames: new Map(),
      moulds: new Map(),
      fillingAmounts: [],
      ingredients: ings,
      standaloneFillings: [sf],
    });
    expect(out).not.toContain("PRODUCTS PRODUCED");
    expect(out).toContain("FILLING BATCHES");
    expect(out).toContain("Caramel");
    expect(out).toContain("500g");
    expect(out).toContain("Total yield:");
  });

  it("still includes PRODUCTS PRODUCED for hybrid plans (both sections visible)", () => {
    const pb = makePlanProduct();
    const out = generateBatchSummary({
      batchNumber: "B2",
      planName: "Hybrid",
      completedAt: new Date("2026-04-21T10:00:00Z"),
      planProducts: [pb],
      productNames: new Map([["1", "Truffle"]]),
      moulds: new Map([["1", mould]]),
      fillingAmounts: [],
      ingredients: ings,
      standaloneFillings: [sf],
    });
    expect(out).toContain("PRODUCTS PRODUCED");
    expect(out).toContain("Truffle");
    expect(out).toContain("FILLING BATCHES");
    expect(out).toContain("Caramel");
  });

  it("aggregates standalone filling ingredients into INGREDIENTS USED", () => {
    const out = generateBatchSummary({
      batchNumber: "B3",
      planName: "P",
      completedAt: new Date("2026-04-21T10:00:00Z"),
      planProducts: [],
      productNames: new Map(),
      moulds: new Map(),
      fillingAmounts: [],
      ingredients: ings,
      standaloneFillings: [sf],
    });
    expect(out).toContain("INGREDIENTS USED");
    expect(out).toContain("Sugar");
    expect(out).toContain("200g");
  });

  it("is unchanged when no standaloneFillings are passed (backward-compat)", () => {
    const pb = makePlanProduct();
    const out = generateBatchSummary({
      batchNumber: "B4",
      planName: "Legacy",
      completedAt: new Date("2026-04-21T10:00:00Z"),
      planProducts: [pb],
      productNames: new Map([["1", "Truffle"]]),
      moulds: new Map([["1", mould]]),
      fillingAmounts: [],
      ingredients: [],
    });
    expect(out).toContain("PRODUCTS PRODUCED");
    expect(out).not.toContain("FILLING BATCHES");
  });
});

// ─── Phase 3: nested-filling expansion + topo sort ──────────────────────────

describe("expandNestedFillings", () => {
  function liG(fillingId: string, ingredientId: string, amount: number, sortOrder = 0): FillingIngredient {
    return { fillingId, ingredientId, amount, unit: "g", sortOrder };
  }
  function comp(fillingId: string, childFillingId: string, amount: number, sortOrder = 0): FillingComponent {
    return { fillingId, childFillingId, amount, unit: "g", sortOrder };
  }
  function indexBy<T extends { fillingId: string }>(rows: T[]): Map<string, T[]> {
    const m = new Map<string, T[]>();
    for (const r of rows) {
      const arr = m.get(r.fillingId);
      if (arr) arr.push(r);
      else m.set(r.fillingId, [r]);
    }
    return m;
  }

  it("returns empty when no host has nested components", () => {
    const hostAmounts: FillingAmount[] = [
      { fillingId: "A", fillingName: "A", planProductId: "pb-1", productName: "Truffle", weightG: 200, scaledIngredients: [] },
    ];
    const out = expandNestedFillings(hostAmounts, new Map(), indexBy([liG("A", "x", 100)]), new Map([["A", makeFilling({ id: "A", name: "A" })]]));
    expect(out).toEqual([]);
  });

  it("scales a one-level nested batch by host's portion of the recipe", () => {
    // Host A recipe: 50g of B + 50g of own ingredient → total 100g
    // Plan calls for 200g of A → so the B batch should be 100g (50/100 × 200)
    const fillingsMap = new Map([
      ["A", makeFilling({ id: "A", name: "A" })],
      ["B", makeFilling({ id: "B", name: "B" })],
    ]);
    const components = indexBy([comp("A", "B", 50)]);
    const lis = indexBy([liG("A", "own", 50), liG("B", "leaf", 100)]);
    const hostAmounts: FillingAmount[] = [
      { fillingId: "A", fillingName: "A", planProductId: "pb-1", productName: "Truffle", weightG: 200, scaledIngredients: [] },
    ];
    const out = expandNestedFillings(hostAmounts, components, lis, fillingsMap);
    expect(out).toHaveLength(1);
    expect(out[0].fillingId).toBe("B");
    expect(out[0].weightG).toBe(100);
    // B inherits planProductId/productName so consolidation merges across hosts.
    expect(out[0].planProductId).toBe("pb-1");
    expect(out[0].productName).toBe("Truffle");
    // B's ingredients are scaled to its batch weight (100g) — leaf is 100% of B.
    expect(out[0].scaledIngredients).toHaveLength(1);
    expect(out[0].scaledIngredients[0].ingredientId).toBe("leaf");
    expect(out[0].scaledIngredients[0].amount).toBeCloseTo(100, 1);
  });

  it("composes scales through a 3-level chain (A → B → C)", () => {
    // A recipe = 100g of B (only). B recipe = 50g of C + 50g of own. C recipe = 100g of leaf.
    // Plan calls for 200g of A → B batch = 200g; C batch = (50/100) × 200 = 100g.
    const fillingsMap = new Map([
      ["A", makeFilling({ id: "A", name: "A" })],
      ["B", makeFilling({ id: "B", name: "B" })],
      ["C", makeFilling({ id: "C", name: "C" })],
    ]);
    const components = indexBy([comp("A", "B", 100), comp("B", "C", 50)]);
    const lis = indexBy([liG("B", "own", 50), liG("C", "leaf", 100)]);
    const hostAmounts: FillingAmount[] = [
      { fillingId: "A", fillingName: "A", planProductId: "pb-1", productName: "Truffle", weightG: 200, scaledIngredients: [] },
    ];
    const out = expandNestedFillings(hostAmounts, components, lis, fillingsMap);
    const byId = new Map(out.map((fa) => [fa.fillingId, fa]));
    expect(byId.get("B")?.weightG).toBe(200);
    expect(byId.get("C")?.weightG).toBe(100);
  });

  it("survives a malformed cycle in the data", () => {
    const fillingsMap = new Map([
      ["A", makeFilling({ id: "A", name: "A" })],
      ["B", makeFilling({ id: "B", name: "B" })],
    ]);
    // Pre-existing cycle: A → B → A. Should terminate, not loop.
    const components = indexBy([comp("A", "B", 50), comp("B", "A", 50)]);
    const lis = indexBy<FillingIngredient>([]);
    const hostAmounts: FillingAmount[] = [
      { fillingId: "A", fillingName: "A", planProductId: "pb-1", productName: "Truffle", weightG: 100, scaledIngredients: [] },
    ];
    const out = expandNestedFillings(hostAmounts, components, lis, fillingsMap);
    // Just check the call returned and produced finite numbers.
    for (const fa of out) expect(Number.isFinite(fa.weightG)).toBe(true);
  });
});

describe("topoSortFillingsChildrenFirst", () => {
  function consolidatedRow(id: string): ConsolidatedFilling {
    return {
      fillingId: id,
      fillingName: id,
      totalWeightG: 100,
      scaledIngredients: [],
      scaledNestedFillings: [],
      usedBy: [{ planProductId: "pb-1", productName: "Truffle", weightG: 100 }],
      shared: false,
    };
  }
  function comp(fillingId: string, childFillingId: string): FillingComponent {
    return { fillingId, childFillingId, amount: 50, unit: "g", sortOrder: 0 };
  }
  function indexComp(rows: FillingComponent[]): Map<string, FillingComponent[]> {
    const m = new Map<string, FillingComponent[]>();
    for (const r of rows) {
      const arr = m.get(r.fillingId);
      if (arr) arr.push(r);
      else m.set(r.fillingId, [r]);
    }
    return m;
  }

  it("places children before hosts (A → B becomes B then A)", () => {
    const fillings = [consolidatedRow("A"), consolidatedRow("B")];
    const components = indexComp([comp("A", "B")]);
    const sorted = topoSortFillingsChildrenFirst(fillings, components);
    expect(sorted.map((cf) => cf.fillingId)).toEqual(["B", "A"]);
  });

  it("orders a 3-level chain children-first (A → B → C becomes C, B, A)", () => {
    const fillings = [consolidatedRow("A"), consolidatedRow("B"), consolidatedRow("C")];
    const components = indexComp([comp("A", "B"), comp("B", "C")]);
    const sorted = topoSortFillingsChildrenFirst(fillings, components);
    expect(sorted.map((cf) => cf.fillingId)).toEqual(["C", "B", "A"]);
  });

  it("keeps unrelated fillings in their original order", () => {
    const fillings = [consolidatedRow("X"), consolidatedRow("Y"), consolidatedRow("Z")];
    const sorted = topoSortFillingsChildrenFirst(fillings, new Map());
    expect(sorted.map((cf) => cf.fillingId)).toEqual(["X", "Y", "Z"]);
  });

  it("survives a malformed cycle in the data", () => {
    const fillings = [consolidatedRow("A"), consolidatedRow("B")];
    const components = indexComp([comp("A", "B"), comp("B", "A")]);
    // Should terminate; both fillings present in the output.
    const sorted = topoSortFillingsChildrenFirst(fillings, components);
    expect(sorted).toHaveLength(2);
    expect(new Set(sorted.map((cf) => cf.fillingId))).toEqual(new Set(["A", "B"]));
  });
});
