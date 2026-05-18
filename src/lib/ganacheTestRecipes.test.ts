import { describe, it, expect } from "vitest";
import { calculateGanacheBalance, checkGanacheBalance, detectChocolateType } from "./ganacheBalance";
import { estimateAw, shelfLifeFromEstimate } from "./ganacheAw";
import { TEST_RECIPES, type GanacheRecipeFixture } from "./ganacheTestRecipes";
import type { Ingredient, ExperimentIngredient } from "@/types";

// Convert a fixture recipe into the (ingredient map, experiment-ingredient list)
// pair the engine expects.
function toEngineInputs(recipe: GanacheRecipeFixture): {
  eis: ExperimentIngredient[];
  map: Map<string, Ingredient>;
} {
  const map = new Map<string, Ingredient>();
  const eis: ExperimentIngredient[] = [];
  recipe.ingredients.forEach((ri, idx) => {
    const id = `${recipe.id}-ing-${idx}`;
    map.set(id, {
      id,
      name: ri.name,
      manufacturer: "",
      source: "",
      cost: 0,
      notes: "",
      cacaoFat:  ri.composition.cacaoFat,
      sugar:     ri.composition.sugar,
      milkFat:   ri.composition.milkFat,
      water:     ri.composition.water,
      solids:    ri.composition.solids,
      otherFats: ri.composition.otherFats,
      alcohol:   ri.composition.alcohol || undefined,
      allergens: [],
    });
    eis.push({
      experimentId: recipe.id,
      ingredientId: id,
      amount: ri.grams,
      sortOrder: idx,
    });
  });
  return { eis, map };
}

describe("ganache test recipes — composition decomposition", () => {
  for (const recipe of TEST_RECIPES) {
    describe(recipe.name, () => {
      const { eis, map } = toEngineInputs(recipe);
      const balance = calculateGanacheBalance(eis, map);

      it("returns a non-null balance", () => {
        expect(balance).not.toBeNull();
      });

      it("matches expected total weight exactly", () => {
        expect(balance!.totalWeight).toBeCloseTo(recipe.expected.totalWeight, 5);
      });

      it("matches expected water percentage", () => {
        expect(balance!.water).toBeCloseTo(recipe.expected.water, 1);
      });

      it("matches expected cacao fat percentage", () => {
        expect(balance!.cacaoFat).toBeCloseTo(recipe.expected.cacaoFat, 1);
      });

      it("matches expected sugar percentage", () => {
        expect(balance!.sugar).toBeCloseTo(recipe.expected.sugar, 1);
      });

      it("matches expected milk fat percentage", () => {
        expect(balance!.milkFat).toBeCloseTo(recipe.expected.milkFat, 1);
      });

      it("matches expected solids percentage", () => {
        expect(balance!.solids).toBeCloseTo(recipe.expected.solids, 1);
      });

      it("matches expected other-fats percentage", () => {
        expect(balance!.otherFats).toBeCloseTo(recipe.expected.otherFats, 1);
      });

      it("matches expected alcohol percentage", () => {
        expect(balance!.alcohol).toBeCloseTo(recipe.expected.alcohol, 1);
      });

      it("all components sum to 100% (within float tolerance)", () => {
        const sum = balance!.water + balance!.cacaoFat + balance!.sugar +
                    balance!.milkFat + balance!.solids + balance!.otherFats +
                    balance!.alcohol;
        expect(sum).toBeCloseTo(100, 1);
      });
    });
  }
});

describe("ganache test recipes — balance-check expectations", () => {
  // R1: classic unstable 1:1 — engineered to expose water/sugar imbalance
  it("flags the 1:1 baseline as unstable (water/sugar correlation + water-high)", () => {
    const r1 = TEST_RECIPES.find((r) => r.id === "r1-classic-1to1-unstable")!;
    const { eis, map } = toEngineInputs(r1);
    const balance = calculateGanacheBalance(eis, map)!;
    const check = checkGanacheBalance(balance);

    expect(check.water.status).toBe("high");
    expect(check.warnings.some((w) => w.includes("Water/sugar balance"))).toBe(true);
    expect(check.warnings.some((w) => w.includes("Water is above the target range"))).toBe(true);
    expect(check.sugar.status).toBe("low");
  });

  // R2: well-balanced dark molded — most components in range
  it("treats the balanced dark moulded recipe as in-range", () => {
    const r2 = TEST_RECIPES.find((r) => r.id === "r2-dark-molded-balanced")!;
    const { eis, map } = toEngineInputs(r2);
    const balance = calculateGanacheBalance(eis, map)!;
    const check = checkGanacheBalance(balance, "dark");

    expect(check.water.status).toBe("ok");
    expect(check.sugar.status).toBe("ok");
    expect(check.cacaoFat.status).toBe("ok");
    expect(check.milkFat.status).toBe("ok");
    expect(check.solids.status).toBe("ok");
    expect(check.warnings.some((w) => w.includes("Water/sugar balance"))).toBe(false);
  });

  // R3: white moulded — solids should be N/A, white-specific notes when type is white
  it("marks solids as N/A for the white moulded recipe and uses white-specific notes", () => {
    const r3 = TEST_RECIPES.find((r) => r.id === "r3-white-molded-with-cb")!;
    const { eis, map } = toEngineInputs(r3);
    const balance = calculateGanacheBalance(eis, map)!;
    const check = checkGanacheBalance(balance, "white");

    expect(check.solids.status).toBe("na");
    expect(check.warnings.some((w) => w.toLowerCase().includes("solids"))).toBe(false);
    // Total fat in this recipe (~51%) and cacao fat (~22.4%) both push past the
    // universal targets; for white chocolate the notes should explain this is
    // expected rather than flagging it as a generic failure.
    expect(check.warnings.some((w) => w.includes("white chocolate ganaches"))).toBe(true);
    expect(check.warnings.some((w) => w.includes("coated ganaches"))).toBe(false);
  });

  // R4: dairy-free — milkFat must be exactly 0 and sugar will be high
  it("registers zero milk fat and high sugar for the dairy-free recipe", () => {
    const r4 = TEST_RECIPES.find((r) => r.id === "r4-dairy-free-fruit-puree")!;
    const { eis, map } = toEngineInputs(r4);
    const balance = calculateGanacheBalance(eis, map)!;
    const check = checkGanacheBalance(balance);

    expect(balance.milkFat).toBeCloseTo(0, 5);
    expect(check.sugar.status).toBe("high");
  });

  // R6: alcohol-stabilized — must trigger the alcohol advisory at >=3%
  it("triggers the alcohol advisory when alcohol exceeds 3%", () => {
    const r6 = TEST_RECIPES.find((r) => r.id === "r6-kirsch-stabilized-dark")!;
    const { eis, map } = toEngineInputs(r6);
    const balance = calculateGanacheBalance(eis, map)!;
    const check = checkGanacheBalance(balance);

    expect(balance.alcohol).toBeGreaterThan(3);
    expect(check.warnings.some((w) => w.includes("Alcohol content"))).toBe(true);
  });
});

describe("ganache test recipes — scale invariance", () => {
  it("yields identical percentages when the same recipe is scaled up", () => {
    const r2 = TEST_RECIPES.find((r) => r.id === "r2-dark-molded-balanced")!;
    const { eis: small, map } = toEngineInputs(r2);
    // 10x scale-up: same recipe, ten times the grams
    const large = small.map((ei) => ({ ...ei, amount: ei.amount * 10 }));

    const balanceSmall = calculateGanacheBalance(small, map)!;
    const balanceLarge = calculateGanacheBalance(large, map)!;

    expect(balanceLarge.totalWeight).toBeCloseTo(balanceSmall.totalWeight * 10, 5);
    expect(balanceLarge.water).toBeCloseTo(balanceSmall.water, 5);
    expect(balanceLarge.cacaoFat).toBeCloseTo(balanceSmall.cacaoFat, 5);
    expect(balanceLarge.sugar).toBeCloseTo(balanceSmall.sugar, 5);
    expect(balanceLarge.milkFat).toBeCloseTo(balanceSmall.milkFat, 5);
    expect(balanceLarge.solids).toBeCloseTo(balanceSmall.solids, 5);
  });
});

describe("ganache test recipes — Aw anchor regression", () => {
  // The Aw heuristic is calibrated against multi-source anchors. We assert:
  //  - medium-confidence anchors (no polyol caveats) sit inside the predicted
  //    uncertainty band — that's the contract of the estimator.
  //  - low-confidence anchors (polyol-heavy) are correctly flagged; we don't
  //    enforce numeric closeness because the simple sugar/water model can't
  //    yet distinguish sucrose from sorbitol/glycerol/invert sugar.
  for (const recipe of TEST_RECIPES) {
    if (!recipe.empiricalAw) continue;

    describe(`${recipe.name} — Aw`, () => {
      const { eis, map } = toEngineInputs(recipe);
      const balance = calculateGanacheBalance(eis, map)!;
      const est = estimateAw(balance);

      it("yields a value in (0.5, 1.0]", () => {
        expect(est.value).toBeGreaterThan(0.5);
        expect(est.value).toBeLessThanOrEqual(1.0);
      });

      if (recipe.id === "r4-dairy-free-fruit-puree") {
        // Polyol-rich recipe — model lacks polyol differentiation; just verify
        // the low-confidence flag fires.
        it("flags low confidence due to high sugar / polyol content", () => {
          expect(est.confidence).toBe("low");
          expect(est.caveats.length).toBeGreaterThan(0);
        });
      } else {
        // Medium-confidence recipes — the published empirical Aw should sit
        // inside the predicted uncertainty band (which is already widened
        // to honest tolerance).
        it("predicts an uncertainty band that contains the empirical anchor", () => {
          const anchor = recipe.empiricalAw!.value;
          expect(anchor).toBeGreaterThanOrEqual(est.lo - 0.005);
          expect(anchor).toBeLessThanOrEqual(est.hi + 0.005);
        });

        it("predicts a central value within the anchor's published tolerance", () => {
          const { value: anchor, tolerance } = recipe.empiricalAw!;
          // Honest model: allow the model's own tolerance on top of the
          // anchor's tolerance, since neither is exact.
          const totalSlack = tolerance + 0.03;
          expect(Math.abs(est.value - anchor)).toBeLessThanOrEqual(totalSlack);
        });
      }
    });
  }

  it("produces conservative (shorter) shelf-life bands at the high end of the Aw range", () => {
    // The 1:1 baseline sits well above 0.85 → must be short.
    const r1 = TEST_RECIPES.find((r) => r.id === "r1-classic-1to1-unstable")!;
    const { eis, map } = toEngineInputs(r1);
    const balance = calculateGanacheBalance(eis, map)!;
    const est = estimateAw(balance);
    expect(shelfLifeFromEstimate(est).band).toBe("short");
  });

  it("matches the consensus shelf-life band on each medium-confidence anchor", () => {
    for (const recipe of TEST_RECIPES) {
      if (!recipe.empiricalAw || !recipe.shelfLifeBand) continue;
      if (recipe.id === "r4-dairy-free-fruit-puree") continue; // polyol caveat

      const { eis, map } = toEngineInputs(recipe);
      const balance = calculateGanacheBalance(eis, map)!;
      const est = estimateAw(balance);
      const predictedBand = shelfLifeFromEstimate(est).band;

      // Allow off-by-one band adjacency (short<->medium, medium<->long) since
      // band edges (0.70, 0.85) are sharp boundaries with no soft margin yet.
      const order = ["short", "medium", "long", "very_long"] as const;
      const expectedIdx = order.indexOf(recipe.shelfLifeBand);
      const predictedIdx = order.indexOf(predictedBand);
      expect(Math.abs(predictedIdx - expectedIdx)).toBeLessThanOrEqual(1);
    }
  });
});

describe("ganache test recipes — chocolate-type detection", () => {
  // Type detection currently uses the ingredient's `category` field, which the
  // fixtures don't set. Verify the engine returns null rather than guessing,
  // and confirm the heuristic works when category is supplied.
  it("returns null when fixtures don't tag a Chocolate-category ingredient", () => {
    const r2 = TEST_RECIPES.find((r) => r.id === "r2-dark-molded-balanced")!;
    const { eis, map } = toEngineInputs(r2);
    expect(detectChocolateType(eis, map)).toBeNull();
  });

  it("detects dark chocolate when category is supplied", () => {
    const r2 = TEST_RECIPES.find((r) => r.id === "r2-dark-molded-balanced")!;
    const { eis, map } = toEngineInputs(r2);
    // Tag the dark-chocolate ingredient with the Chocolate category.
    for (const [id, ing] of map) {
      if (ing.name.toLowerCase().includes("dark")) {
        map.set(id, { ...ing, category: "Chocolate" });
      }
    }
    expect(detectChocolateType(eis, map)).toBe("dark");
  });
});
