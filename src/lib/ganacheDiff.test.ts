import { describe, it, expect } from "vitest";
import {
  diffExperimentIngredients,
  summariseIngredientDiff,
  compositionShift,
} from "./ganacheDiff";
import type { Ingredient, ExperimentIngredient } from "@/types";
import type { GanacheBalance } from "./ganacheBalance";

function ing(id: string, name: string): Ingredient {
  return {
    id, name,
    manufacturer: "", source: "", cost: 0, notes: "",
    cacaoFat: 0, sugar: 0, milkFat: 0, water: 0, solids: 0, otherFats: 0,
    allergens: [],
  };
}
function ei(experimentId: string, ingredientId: string, amount: number, sortOrder = 0): ExperimentIngredient {
  return { experimentId, ingredientId, amount, sortOrder };
}
function mapOf(ings: Ingredient[]): Map<string, Ingredient> {
  return new Map(ings.map((i) => [i.id!, i]));
}

describe("diffExperimentIngredients", () => {
  const cream = ing("cream", "Cream 35%");
  const dark  = ing("dark",  "Dark chocolate 65%");
  const butter = ing("butter", "Butter 82%");
  const sorbitol = ing("sorbitol", "Sorbitol powder");
  const m = mapOf([cream, dark, butter, sorbitol]);

  it("returns an empty array for two empty lists", () => {
    expect(diffExperimentIngredients([], [], m)).toEqual([]);
  });

  it("flags every ingredient as unchanged when grams match exactly", () => {
    const a = [ei("a", "cream", 100, 0), ei("a", "dark", 200, 1)];
    const b = [ei("b", "cream", 100, 0), ei("b", "dark", 200, 1)];
    const rows = diffExperimentIngredients(a, b, m);
    expect(rows.every((r) => r.status === "unchanged")).toBe(true);
    expect(rows.map((r) => r.delta)).toEqual([0, 0]);
  });

  it("flags ingredients that appear only in B as added", () => {
    const a = [ei("a", "cream", 100, 0)];
    const b = [ei("b", "cream", 100, 0), ei("b", "sorbitol", 15, 1)];
    const rows = diffExperimentIngredients(a, b, m);
    const sorb = rows.find((r) => r.ingredientId === "sorbitol")!;
    expect(sorb.status).toBe("added");
    expect(sorb.amountA).toBe(0);
    expect(sorb.amountB).toBe(15);
    expect(sorb.delta).toBe(15);
  });

  it("flags ingredients that appear only in A as removed", () => {
    const a = [ei("a", "cream", 100, 0), ei("a", "butter", 50, 1)];
    const b = [ei("b", "cream", 100, 0)];
    const rows = diffExperimentIngredients(a, b, m);
    const but = rows.find((r) => r.ingredientId === "butter")!;
    expect(but.status).toBe("removed");
    expect(but.amountA).toBe(50);
    expect(but.amountB).toBe(0);
    expect(but.delta).toBe(-50);
  });

  it("classifies amount drift as increased or decreased", () => {
    const a = [ei("a", "cream", 150, 0), ei("a", "dark", 220, 1)];
    const b = [ei("b", "cream", 100, 0), ei("b", "dark", 280, 1)];
    const rows = diffExperimentIngredients(a, b, m);
    expect(rows.find((r) => r.ingredientId === "cream")!.status).toBe("decreased");
    expect(rows.find((r) => r.ingredientId === "dark")!.status).toBe("increased");
  });

  it("treats sub-epsilon drift as unchanged (avoids float-rounding noise)", () => {
    const a = [ei("a", "cream", 100.0, 0)];
    const b = [ei("b", "cream", 100.0005, 0)];
    expect(diffExperimentIngredients(a, b, m)[0].status).toBe("unchanged");
  });

  it("computes pctA and pctB against each side's own total", () => {
    const a = [ei("a", "cream", 100, 0), ei("a", "dark", 100, 1)]; // 50/50
    const b = [ei("b", "cream",  50, 0), ei("b", "dark", 150, 1)]; // 25/75
    const rows = diffExperimentIngredients(a, b, m);
    const dRow = rows.find((r) => r.ingredientId === "dark")!;
    expect(dRow.pctA).toBeCloseTo(50, 5);
    expect(dRow.pctB).toBeCloseTo(75, 5);
  });

  it("returns pct = 0 for the missing side rather than NaN", () => {
    const a = [ei("a", "cream", 100, 0)];
    const b = [ei("b", "cream", 100, 0), ei("b", "sorbitol", 25, 1)];
    const sorb = diffExperimentIngredients(a, b, m).find((r) => r.ingredientId === "sorbitol")!;
    expect(sorb.pctA).toBe(0);
    expect(sorb.pctB).toBeGreaterThan(0);
  });

  it("orders rows by B's sortOrder first, then A's, then name", () => {
    const a = [ei("a", "butter", 60, 5), ei("a", "cream", 100, 0)];
    const b = [ei("b", "cream", 100, 0), ei("b", "dark", 200, 1), ei("b", "sorbitol", 10, 2)];
    const rows = diffExperimentIngredients(a, b, m);
    // cream(0), dark(1), sorbitol(2) come from B; butter(5) only in A
    expect(rows.map((r) => r.ingredientId)).toEqual(["cream", "dark", "sorbitol", "butter"]);
  });

  it("falls back to '(unknown ingredient)' when the map is missing an entry", () => {
    const a: ExperimentIngredient[] = [];
    const b: ExperimentIngredient[] = [ei("b", "ghost", 5, 0)];
    const rows = diffExperimentIngredients(a, b, new Map());
    expect(rows[0].name).toBe("(unknown ingredient)");
  });
});

describe("summariseIngredientDiff", () => {
  const cream = ing("cream", "Cream 35%");
  const dark = ing("dark", "Dark chocolate 65%");
  const sorbitol = ing("sorbitol", "Sorbitol");
  const butter = ing("butter", "Butter 82%");
  const m = mapOf([cream, dark, sorbitol, butter]);

  it("counts each status bucket and sums grams", () => {
    const a = [ei("a", "cream", 150, 0), ei("a", "dark", 220, 1), ei("a", "butter", 80, 2)];
    const b = [ei("b", "cream", 100, 0), ei("b", "dark", 280, 1), ei("b", "sorbitol", 15, 2)];
    const s = summariseIngredientDiff(diffExperimentIngredients(a, b, m));
    expect(s.addedCount).toBe(1);     // sorbitol
    expect(s.removedCount).toBe(1);   // butter
    expect(s.changedCount).toBe(2);   // cream, dark
    expect(s.unchangedCount).toBe(0);
    // (100-150) + (280-220) + (0-80) + (15-0) = -50 + 60 - 80 + 15 = -55
    expect(s.netGramsDelta).toBe(-55);
  });
});

describe("compositionShift", () => {
  function bal(over: Partial<GanacheBalance>): GanacheBalance {
    return {
      totalWeight: 500,
      water: 22, sugar: 32, cacaoFat: 17, milkFat: 17, otherFats: 0, solids: 10, alcohol: 0,
      ...over,
    };
  }

  it("returns null when either balance is null", () => {
    expect(compositionShift(null, bal({}))).toBeNull();
    expect(compositionShift(bal({}), null)).toBeNull();
    expect(compositionShift(null, null)).toBeNull();
  });

  it("computes b minus a for every component", () => {
    const a = bal({ water: 24.7, sugar: 26.6, cacaoFat: 14.7, milkFat: 18.8, solids: 8.4 });
    const b = bal({ water: 21.0, sugar: 31.7, cacaoFat: 18.4, milkFat: 14.6, solids: 10.7 });
    const s = compositionShift(a, b)!;
    expect(s.water.delta).toBeCloseTo(-3.7, 4);
    expect(s.sugar.delta).toBeCloseTo(+5.1, 4);
    expect(s.cacaoFat.delta).toBeCloseTo(+3.7, 4);
    expect(s.milkFat.delta).toBeCloseTo(-4.2, 4);
    expect(s.solids.delta).toBeCloseTo(+2.3, 4);
    expect(s.otherFats.delta).toBe(0);
    expect(s.alcohol.delta).toBe(0);
  });

  it("preserves a and b on the returned shift", () => {
    const a = bal({ water: 20 });
    const b = bal({ water: 25 });
    const s = compositionShift(a, b)!;
    expect(s.water.a).toBe(20);
    expect(s.water.b).toBe(25);
  });
});
