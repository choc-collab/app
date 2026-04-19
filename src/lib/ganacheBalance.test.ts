import { describe, it, expect } from "vitest";
import { calculateGanacheBalance, checkGanacheBalance, detectChocolateType } from "./ganacheBalance";
import type { Ingredient, ExperimentIngredient } from "@/types";

// Helpers to build test fixtures
function makeIngredient(id: number, overrides: Partial<Ingredient>): Ingredient {
  return {
    id: String(id),
    name: `Ingredient ${id}`,
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

function makeEI(experimentId: number, ingredientId: number, amount: number, sortOrder = 0): ExperimentIngredient {
  return { experimentId: String(experimentId), ingredientId: String(ingredientId), amount, sortOrder };
}

function makeMap(ingredients: Ingredient[]): Map<string, Ingredient> {
  return new Map(ingredients.map((i) => [i.id!, i]));
}

// Real-world-ish compositions
const darkChoc65: Ingredient = makeIngredient(1, {
  name: "Dark Chocolate 65%",
  cacaoFat: 42, sugar: 34, solids: 24, water: 0, milkFat: 0, otherFats: 0,
});

const cream35: Ingredient = makeIngredient(2, {
  name: "Cream 35%",
  milkFat: 35, water: 65, cacaoFat: 0, sugar: 0, solids: 0, otherFats: 0,
});

const butter82: Ingredient = makeIngredient(3, {
  name: "Butter 82%",
  milkFat: 82, water: 18, cacaoFat: 0, sugar: 0, solids: 0, otherFats: 0,
});

const glucose: Ingredient = makeIngredient(4, {
  name: "Glucose DE43",
  sugar: 80, water: 20, cacaoFat: 0, milkFat: 0, solids: 0, otherFats: 0,
});

const invertSugar: Ingredient = makeIngredient(5, {
  name: "Invert Sugar",
  sugar: 82, water: 18, cacaoFat: 0, milkFat: 0, solids: 0, otherFats: 0,
});

const whiteChoc: Ingredient = makeIngredient(6, {
  name: "White Chocolate",
  cacaoFat: 30, sugar: 50, milkFat: 20, water: 0, solids: 0, otherFats: 0,
});

const cocoaButter: Ingredient = makeIngredient(7, {
  name: "Cocoa Butter",
  cacaoFat: 100, sugar: 0, milkFat: 0, water: 0, solids: 0, otherFats: 0,
});

describe("calculateGanacheBalance", () => {
  it("returns null for empty ingredient list", () => {
    expect(calculateGanacheBalance([], new Map())).toBeNull();
  });

  it("returns null when all amounts are zero", () => {
    const eis = [makeEI(1, 1, 0)];
    const map = makeMap([darkChoc65]);
    expect(calculateGanacheBalance(eis, map)).toBeNull();
  });

  it("skips ingredients missing from the map", () => {
    const eis = [makeEI(1, 99, 100)]; // ingredientId 99 not in map
    expect(calculateGanacheBalance(eis, new Map())).toBeNull();
  });

  it("calculates correct percentages for a simple 1:1 dark ganache", () => {
    // 100g dark choc 65% + 100g cream 35% = 200g total (classic unstable ganache)
    const eis = [makeEI(1, 1, 100), makeEI(1, 2, 100)];
    const map = makeMap([darkChoc65, cream35]);
    const balance = calculateGanacheBalance(eis, map)!;

    expect(balance).not.toBeNull();
    expect(balance.totalWeight).toBe(200);
    // dark choc contributes 42g cacaoFat, cream 0 → 42/200 = 21%
    expect(balance.cacaoFat).toBeCloseTo(21, 1);
    // dark choc contributes 34g sugar, cream 0 → 17%
    expect(balance.sugar).toBeCloseTo(17, 1);
    // cream contributes 65g water → 32.5%
    expect(balance.water).toBeCloseTo(32.5, 1);
    // cream contributes 35g milkFat → 17.5%
    expect(balance.milkFat).toBeCloseTo(17.5, 1);
    // dark choc contributes 24g solids → 12%
    expect(balance.solids).toBeCloseTo(12, 1);
  });

  it("tracks milkFat and otherFats independently", () => {
    const coconutOil = makeIngredient(10, { name: "Coconut Oil", otherFats: 100 });
    const eis = [makeEI(1, 3, 100), makeEI(1, 10, 50)]; // 100g butter + 50g coconut oil
    const map = makeMap([butter82, coconutOil]);
    const balance = calculateGanacheBalance(eis, map)!;

    // milkFat: 82g / 150g = 54.67%, otherFats: 50g / 150g = 33.33%
    expect(balance.milkFat).toBeCloseTo(54.67, 1);
    expect(balance.otherFats).toBeCloseTo(33.33, 1);
  });

  it("tracks alcohol from ingredients with alcohol content", () => {
    // 100g kirsch (45% alcohol) + 200g dark choc
    const kirsch = makeIngredient(8, { name: "Kirsch", alcohol: 45, water: 55 });
    const eis = [makeEI(1, 8, 100), makeEI(1, 1, 200)];
    const map = makeMap([kirsch, darkChoc65]);
    const balance = calculateGanacheBalance(eis, map)!;

    // kirsch contributes 45g alcohol out of 300g total = 15%
    expect(balance.alcohol).toBeCloseTo(15, 1);
  });

  it("returns 0 alcohol when no ingredients have alcohol set", () => {
    const eis = [makeEI(1, 1, 100), makeEI(1, 2, 100)];
    const map = makeMap([darkChoc65, cream35]);
    const balance = calculateGanacheBalance(eis, map)!;
    expect(balance.alcohol).toBe(0);
  });

  it("handles a well-balanced dark moulded ganache", () => {
    // Approx: cream 140, glucose 70, invert 55, dark 65% 240, butter 100
    // Rough expected: water ~22%, sugar ~30%, cacaoFat ~17%, milkFat ~22%, solids ~10%
    const eis = [
      makeEI(1, 2, 140),
      makeEI(1, 4, 70),
      makeEI(1, 5, 55),
      makeEI(1, 1, 240),
      makeEI(1, 3, 100),
    ];
    const map = makeMap([darkChoc65, cream35, butter82, glucose, invertSugar]);
    const balance = calculateGanacheBalance(eis, map)!;

    expect(balance.totalWeight).toBe(605);
    expect(balance.water).toBeGreaterThan(15);
    expect(balance.water).toBeLessThan(30);
    expect(balance.sugar).toBeGreaterThan(20);
    expect(balance.cacaoFat).toBeGreaterThan(10);
  });
});

describe("checkGanacheBalance", () => {
  // Helper: build a balance directly with sensible universal-range defaults
  function makeBalance(overrides: Partial<ReturnType<typeof import("./ganacheBalance").calculateGanacheBalance> & object>): Parameters<typeof checkGanacheBalance>[0] {
    return {
      totalWeight: 500,
      sugar: 32,
      cacaoFat: 17,
      milkFat: 17,
      otherFats: 0,
      solids: 8,
      water: 20,
      alcohol: 0,
      ...overrides,
    } as Parameters<typeof checkGanacheBalance>[0];
  }

  it("returns all ok with zero notes for a well-balanced ganache", () => {
    // All values inside universal ranges; water/sugar ratio ok (32 >= 20+10=30)
    const balance = makeBalance({ sugar: 32, cacaoFat: 17, milkFat: 17, solids: 8, water: 20 });
    const check = checkGanacheBalance(balance);
    expect(check.sugar.status).toBe("ok");
    expect(check.cacaoFat.status).toBe("ok");
    expect(check.water.status).toBe("ok");
    expect(check.milkFat.status).toBe("ok");
    expect(check.warnings).toHaveLength(0);
  });

  it("flags water above target range", () => {
    const balance = makeBalance({ water: 25, sugar: 35 }); // sugar high enough to avoid correlation
    const check = checkGanacheBalance(balance);
    expect(check.water.status).toBe("high");
    expect(check.warnings.some((w) => w.includes("Water is above the target range"))).toBe(true);
  });

  it("flags water/sugar correlation when sugar is too low for the water level", () => {
    // water=21, sugar=28 → 28 < 21+10=31 → correlation fires
    const balance = makeBalance({ water: 21, sugar: 28 });
    const check = checkGanacheBalance(balance);
    expect(check.warnings.some((w) => w.includes("Water/sugar balance"))).toBe(true);
  });

  it("does not fire water/sugar correlation when sugar is sufficient", () => {
    // water=21, sugar=32 → 32 >= 31 → no correlation warning
    const balance = makeBalance({ water: 21, sugar: 32 });
    const check = checkGanacheBalance(balance);
    expect(check.warnings.some((w) => w.includes("Water/sugar balance"))).toBe(false);
  });

  it("flags cocoa butter below target range", () => {
    const balance = makeBalance({ cacaoFat: 10 });
    const check = checkGanacheBalance(balance);
    expect(check.cacaoFat.status).toBe("low");
    expect(check.warnings.some((w) => w.includes("Cocoa butter is below the target range"))).toBe(true);
  });

  it("flags cocoa butter above target range with context about coated/white use", () => {
    const balance = makeBalance({ cacaoFat: 30 });
    const check = checkGanacheBalance(balance);
    expect(check.cacaoFat.status).toBe("high");
    expect(check.warnings.some((w) => w.includes("coated ganaches"))).toBe(true);
  });

  it("marks solids as na when 0% — expected for white chocolate", () => {
    const balance = makeBalance({ solids: 0, cacaoFat: 18, water: 20, sugar: 32, milkFat: 17 });
    const check = checkGanacheBalance(balance);
    expect(check.solids.status).toBe("na");
    // N/A means no solids warning
    expect(check.warnings.some((w) => w.toLowerCase().includes("solids"))).toBe(false);
  });

  it("flags solids below range when non-zero but low", () => {
    const balance = makeBalance({ solids: 1, cacaoFat: 18, water: 20, sugar: 32, milkFat: 17 });
    const check = checkGanacheBalance(balance);
    expect(check.solids.status).toBe("low");
  });

  it("flags milk fat above target range", () => {
    const balance = makeBalance({ milkFat: 25 });
    const check = checkGanacheBalance(balance);
    expect(check.milkFat.status).toBe("high");
    expect(check.warnings.some((w) => w.includes("Milk fat is above the target range"))).toBe(true);
  });

  it("warns when total fat is below 25%", () => {
    // cacaoFat=10 (below range), milkFat=10 (below range), otherFats=0 → total=20%
    const balance = makeBalance({ cacaoFat: 10, milkFat: 10, otherFats: 0, water: 20, sugar: 32 });
    const check = checkGanacheBalance(balance);
    expect(check.warnings.some((w) => w.includes("Total fat is below 25%"))).toBe(true);
  });

  it("warns when total fat exceeds 40%", () => {
    // cacaoFat=23 (at max), milkFat=18, otherFats=5 → total=46%
    const balance = makeBalance({ cacaoFat: 23, milkFat: 18, otherFats: 5, water: 20, sugar: 32 });
    const check = checkGanacheBalance(balance);
    expect(check.warnings.some((w) => w.includes("Total fat exceeds 40%"))).toBe(true);
  });

  it("does not warn about total fat when within 25–40% range", () => {
    // total fat = 17+17+0 = 34%
    const balance = makeBalance({ cacaoFat: 17, milkFat: 17, otherFats: 0 });
    const check = checkGanacheBalance(balance);
    expect(check.warnings.some((w) => w.includes("Total fat"))).toBe(false);
  });

  it("uses universal water range — 20% water is ok", () => {
    // Under the old milk-moulded type-specific range (17–19%), 20% was flagged.
    // Under universal ranges (19–22%) it is fine.
    const balance = makeBalance({ water: 20, sugar: 32, cacaoFat: 17, milkFat: 17, solids: 5 });
    const check = checkGanacheBalance(balance);
    expect(check.water.status).toBe("ok");
  });

  it("shows white-specific cacaoFat-high note (not generic) for white chocolate", () => {
    // 24% CB is above the 15–23% universal range, but expected for white chocolate.
    const balance = makeBalance({ cacaoFat: 24, solids: 0, milkFat: 17, water: 20, sugar: 32 });
    const check = checkGanacheBalance(balance, "white");
    expect(check.cacaoFat.status).toBe("high"); // bar still shows amber
    expect(check.warnings.some((w) => w.includes("white chocolate ganaches this is expected"))).toBe(true);
    // Should NOT show the generic "coated ganaches" message
    expect(check.warnings.some((w) => w.includes("coated ganaches"))).toBe(false);
  });

  it("shows milk-specific cacaoFat-high note for milk chocolate", () => {
    const balance = makeBalance({ cacaoFat: 25, milkFat: 17, water: 20, sugar: 32 });
    const check = checkGanacheBalance(balance, "milk");
    expect(check.cacaoFat.status).toBe("high");
    expect(check.warnings.some((w) => w.includes("milk chocolate ganaches slightly higher CB"))).toBe(true);
    expect(check.warnings.some((w) => w.includes("coated ganaches"))).toBe(false);
  });

  it("shows generic cacaoFat-high note for dark chocolate", () => {
    const balance = makeBalance({ cacaoFat: 25, milkFat: 0, water: 20, sugar: 32 });
    const check = checkGanacheBalance(balance, "dark");
    expect(check.warnings.some((w) => w.includes("coated ganaches"))).toBe(true);
  });

  it("shows white-specific totalFat-high note for white chocolate", () => {
    // 30% CB + 18% milkFat + 0% other = 48% total — above 40% but expected for white.
    const balance = makeBalance({ cacaoFat: 30, milkFat: 18, otherFats: 0, water: 17, sugar: 32, solids: 0 });
    const check = checkGanacheBalance(balance, "white");
    expect(check.warnings.some((w) => w.includes("white chocolate ganaches this is normal"))).toBe(true);
    expect(check.warnings.some((w) => w.includes("Total fat exceeds 40%"))).toBe(false);
  });

  it("shows milk-specific totalFat-high note for milk chocolate", () => {
    const balance = makeBalance({ cacaoFat: 25, milkFat: 18, otherFats: 0, water: 20, sugar: 32 });
    const check = checkGanacheBalance(balance, "milk");
    expect(check.warnings.some((w) => w.includes("milk chocolate ganaches with lower cocoa solids"))).toBe(true);
    expect(check.warnings.some((w) => w.includes("Total fat exceeds 40%"))).toBe(false);
  });

  it("shows generic totalFat-high note for dark chocolate", () => {
    const balance = makeBalance({ cacaoFat: 23, milkFat: 18, otherFats: 5, water: 20, sugar: 32 });
    const check = checkGanacheBalance(balance, "dark");
    expect(check.warnings.some((w) => w.includes("Total fat exceeds 40%"))).toBe(true);
  });

  it("returns alcohol value in check result", () => {
    const balance = makeBalance({ alcohol: 4.5 });
    const check = checkGanacheBalance(balance);
    expect(check.alcohol).toBeCloseTo(4.5);
  });

  it("adds alcohol advisory when alcohol >= 3%", () => {
    const balance = makeBalance({ alcohol: 5 });
    const check = checkGanacheBalance(balance);
    expect(check.warnings.some((w) => w.includes("Alcohol content"))).toBe(true);
  });

  it("does not add alcohol advisory when alcohol < 3%", () => {
    const balance = makeBalance({ alcohol: 1 });
    const check = checkGanacheBalance(balance);
    expect(check.warnings.some((w) => w.includes("Alcohol content"))).toBe(false);
  });
});

describe("detectChocolateType", () => {
  const whiteChocIng = makeIngredient(20, {
    name: "White Chocolate Couverture",
    category: "Chocolate",
    cacaoFat: 30, sugar: 50, milkFat: 20, water: 0, solids: 0, otherFats: 0,
  });
  const milkChocIng = makeIngredient(21, {
    name: "Milk Chocolate 38%",
    category: "Chocolate",
    cacaoFat: 22, sugar: 45, milkFat: 15, water: 0, solids: 16, otherFats: 0,
  });
  const darkChocIng = makeIngredient(22, {
    name: "Dark Chocolate 70%",
    category: "Chocolate",
    cacaoFat: 42, sugar: 28, milkFat: 0, water: 0, solids: 30, otherFats: 0,
  });

  it("returns null when no ingredients are present", () => {
    expect(detectChocolateType([], new Map())).toBeNull();
  });

  it("returns null when no Chocolate-category ingredients are present", () => {
    const eis = [makeEI(1, 2, 100)]; // cream, category not "Chocolate"
    const map = makeMap([cream35]);
    expect(detectChocolateType(eis, map)).toBeNull();
  });

  it("detects white chocolate by name", () => {
    const eis = [makeEI(1, 20, 200), makeEI(1, 2, 100)];
    const map = makeMap([whiteChocIng, cream35]);
    expect(detectChocolateType(eis, map)).toBe("white");
  });

  it("detects milk chocolate by name", () => {
    const eis = [makeEI(1, 21, 200), makeEI(1, 2, 100)];
    const map = makeMap([milkChocIng, cream35]);
    expect(detectChocolateType(eis, map)).toBe("milk");
  });

  it("detects dark chocolate by name", () => {
    const eis = [makeEI(1, 22, 200), makeEI(1, 2, 100)];
    const map = makeMap([darkChocIng, cream35]);
    expect(detectChocolateType(eis, map)).toBe("dark");
  });

  it("falls back to composition for white: no solids, has cacaoFat and milkFat", () => {
    const unnamed = makeIngredient(30, {
      name: "Couverture",
      category: "Chocolate",
      cacaoFat: 30, sugar: 50, milkFat: 20, water: 0, solids: 0, otherFats: 0,
    });
    const eis = [makeEI(1, 30, 150)];
    expect(detectChocolateType(eis, makeMap([unnamed]))).toBe("white");
  });

  it("falls back to composition for milk: has solids and milkFat >= 5", () => {
    const unnamed = makeIngredient(31, {
      name: "Couverture",
      category: "Chocolate",
      cacaoFat: 22, sugar: 45, milkFat: 15, water: 0, solids: 10, otherFats: 0,
    });
    const eis = [makeEI(1, 31, 150)];
    expect(detectChocolateType(eis, makeMap([unnamed]))).toBe("milk");
  });

  it("falls back to composition for dark: has solids, little milkFat", () => {
    const unnamed = makeIngredient(32, {
      name: "Couverture",
      category: "Chocolate",
      cacaoFat: 42, sugar: 28, milkFat: 0, water: 0, solids: 30, otherFats: 0,
    });
    const eis = [makeEI(1, 32, 150)];
    expect(detectChocolateType(eis, makeMap([unnamed]))).toBe("dark");
  });

  it("picks the dominant type by weight when multiple chocolates are used", () => {
    // 300g white vs 100g dark → white dominates
    const eis = [makeEI(1, 20, 300), makeEI(1, 22, 100)];
    const map = makeMap([whiteChocIng, darkChocIng]);
    expect(detectChocolateType(eis, map)).toBe("white");
  });
});
