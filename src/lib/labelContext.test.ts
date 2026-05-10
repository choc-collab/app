import { describe, it, expect } from "vitest";
import { buildProductionBatchContext, type ProductionBatchContextInput } from "./labelContext";
import type {
  FillingComponent,
  FillingIngredient,
  Ingredient,
  LabelSource,
  Mould,
  PlanProduct,
  Product,
  ProductFilling,
  ProductionPlan,
} from "@/types";

const SOURCE: Extract<LabelSource, { kind: "production-batch" }> = {
  kind: "production-batch",
  planId: "p1",
  planProductId: "pp1",
};

function makeIngredient(overrides: Partial<Ingredient>): Ingredient {
  return {
    id: "i1",
    name: "Sugar",
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

const MOULD: Mould = { id: "m1", name: "Test", cavityWeightG: 10, numberOfCavities: 24 };

function baseInput(overrides: Partial<ProductionBatchContextInput> = {}): ProductionBatchContextInput {
  const sugar = makeIngredient({ id: "sugar", name: "Sugar" });
  const cocoa = makeIngredient({ id: "cocoa", name: "Cocoa butter" });
  const milk = makeIngredient({ id: "milk", name: "Milk", allergens: ["milk"] });

  const fillingIngredients: FillingIngredient[] = [
    { id: "fi1", fillingId: "f1", ingredientId: "sugar", amount: 60, unit: "g", sortOrder: 0 },
    { id: "fi2", fillingId: "f1", ingredientId: "cocoa", amount: 30, unit: "g", sortOrder: 1 },
    { id: "fi3", fillingId: "f1", ingredientId: "milk",  amount: 10, unit: "g", sortOrder: 2 },
  ];

  const productFillings: ProductFilling[] = [
    { id: "pf1", productId: "prod1", fillingId: "f1", sortOrder: 0, fillPercentage: 100 },
  ];

  const product: Product = {
    id: "prod1",
    name: "Yuzu domes",
    defaultMouldId: "m1",
    shellPercentage: 0,                       // no shell by default — tests can override
    shelfLifeWeeks: "4",
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const plan: ProductionPlan = {
    id: "p1",
    batchNumber: "20260423-001",
    name: "April batch",
    status: "done",
    completedAt: new Date("2026-04-23T10:00:00Z"),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const planProduct: PlanProduct = {
    id: "pp1",
    planId: "p1",
    productId: "prod1",
    mouldId: "m1",
    quantity: 5,
    sortOrder: 0,
  };

  return {
    source: SOURCE,
    plan,
    planProduct,
    product,
    mould: MOULD,
    productFillings,
    fillingIngredientsMap: new Map([["f1", fillingIngredients]]),
    fillingComponentsMap: new Map<string, FillingComponent[]>(),
    ingredientMap: new Map([
      ["sugar", sugar],
      ["cocoa", cocoa],
      ["milk", milk],
    ]),
    shellIngredient: null,
    facilityMayContain: [],
    ...overrides,
  };
}

describe("buildProductionBatchContext", () => {
  it("returns the product name, batch number, and production date verbatim", () => {
    const ctx = buildProductionBatchContext(baseInput());
    expect(ctx.name).toBe("Yuzu domes");
    expect(ctx.batchNumber).toBe("20260423-001");
    expect(ctx.producedAt).toEqual(new Date("2026-04-23T10:00:00Z"));
    expect(ctx.source).toEqual(SOURCE);
  });

  it("orders ingredients by mass per cavity, descending", () => {
    const ctx = buildProductionBatchContext(baseInput());
    expect(ctx.ingredients.map((i) => i.name)).toEqual(["Sugar", "Cocoa butter", "Milk"]);
    // Sugar (60g of 100g filling) is the largest contribution; milk (10g) the smallest.
    expect(ctx.ingredients[0].amountG).toBeGreaterThan(ctx.ingredients[1].amountG);
    expect(ctx.ingredients[1].amountG).toBeGreaterThan(ctx.ingredients[2].amountG);
  });

  it("aggregates allergens across the ingredient list and sorts them", () => {
    const eggIng = makeIngredient({ id: "egg", name: "Egg yolk", allergens: ["egg"] });
    const milkIng = makeIngredient({ id: "milk", name: "Milk", allergens: ["milk"] });
    const fi: FillingIngredient[] = [
      { id: "a", fillingId: "f1", ingredientId: "milk", amount: 50, unit: "g", sortOrder: 0 },
      { id: "b", fillingId: "f1", ingredientId: "egg",  amount: 50, unit: "g", sortOrder: 1 },
    ];
    const ctx = buildProductionBatchContext(baseInput({
      fillingIngredientsMap: new Map([["f1", fi]]),
      ingredientMap: new Map([["milk", milkIng], ["egg", eggIng]]),
    }));
    expect(ctx.allergens).toEqual(["egg", "milk"]);
  });

  it("copies facility may-contain advisories onto the context", () => {
    const ctx = buildProductionBatchContext(baseInput({
      facilityMayContain: ["soy", "peanut"],
    }));
    expect(ctx.mayContain).toEqual(["soy", "peanut"]);
  });

  it("computes best-before from completedAt + shelfLifeWeeks", () => {
    const ctx = buildProductionBatchContext(baseInput());
    // 2026-04-23 + 4 weeks = 2026-05-21
    expect(ctx.bestBefore).toEqual(new Date("2026-05-21T10:00:00Z"));
  });

  it("returns null best-before when shelfLifeWeeks is missing or non-numeric", () => {
    const input = baseInput();
    const ctx = buildProductionBatchContext({
      ...input,
      product: { ...input.product, shelfLifeWeeks: undefined },
    });
    expect(ctx.bestBefore).toBeNull();
  });

  it("uses shellIngredient.commercialName for origin, falling back to name", () => {
    const guanaja = makeIngredient({ id: "guanaja", name: "Dark 70%", commercialName: "Guanaja 70%" });
    const ctx = buildProductionBatchContext(baseInput({
      shellIngredient: guanaja,
      product: { ...baseInput().product, shellPercentage: 30, shellIngredientId: "guanaja" },
    }));
    expect(ctx.origin).toBe("Guanaja 70%");

    const noCommercial = makeIngredient({ id: "x", name: "Dark 70%" });
    const ctx2 = buildProductionBatchContext(baseInput({
      shellIngredient: noCommercial,
      product: { ...baseInput().product, shellPercentage: 30, shellIngredientId: "x" },
    }));
    expect(ctx2.origin).toBe("Dark 70%");
  });

  it("includes the shell as a synthetic ingredient row when shellIngredient + shellPercentage are set", () => {
    const dark = makeIngredient({ id: "dark", name: "Dark chocolate", allergens: ["milk"] });
    const ctx = buildProductionBatchContext(baseInput({
      shellIngredient: dark,
      product: {
        ...baseInput().product,
        shellPercentage: 50,
        shellIngredientId: "dark",
      },
      ingredientMap: new Map(baseInput().ingredientMap).set("dark", dark),
    }));
    const names = ctx.ingredients.map((i) => i.name);
    expect(names).toContain("Dark chocolate");
    // Shell allergens flow through to the aggregated allergens list.
    expect(ctx.allergens).toContain("milk");
  });

  it("warns and produces zero per-cavity weight when no mould is supplied", () => {
    const ctx = buildProductionBatchContext(baseInput({ mould: null }));
    expect(ctx.perCavityWeightG).toBe(0);
    expect(ctx.ingredients).toHaveLength(0);
    expect(ctx.warnings.some((w) => w.toLowerCase().includes("mould"))).toBe(true);
  });

  it("uses planProduct.actualYield as the totalCavityCount when set", () => {
    const input = baseInput();
    const ctx = buildProductionBatchContext({
      ...input,
      planProduct: { ...input.planProduct, actualYield: 87 },
    });
    expect(ctx.totalCavityCount).toBe(87);
  });

  it("falls back to quantity × numberOfCavities when actualYield is unset", () => {
    // baseInput has quantity = 5 and numberOfCavities = 24 → 120 pieces.
    const ctx = buildProductionBatchContext(baseInput());
    expect(ctx.totalCavityCount).toBe(5 * 24);
  });
});
