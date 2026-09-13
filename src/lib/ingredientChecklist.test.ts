import { describe, it, expect } from "vitest";
import {
  buildIngredientChecklist, formatChecklistAmount, groupChecklistByCategory,
  type ChecklistRow,
} from "./ingredientChecklist";
import type { ConsolidatedFilling, StandaloneFillingAmount, ScaledIngredient } from "./production";
import type { Ingredient } from "@/types";

const g = (ingredientId: string, amount: number, unit = "g"): ScaledIngredient => ({
  ingredientId, amount, unit,
});

function consolidated(overrides: Partial<ConsolidatedFilling>): ConsolidatedFilling {
  return {
    fillingId: "f1",
    fillingName: "Dark caramel",
    totalWeightG: 500,
    scaledIngredients: [],
    scaledNestedFillings: [],
    usedBy: [],
    shared: false,
    ...overrides,
  };
}

function standalone(overrides: Partial<StandaloneFillingAmount>): StandaloneFillingAmount {
  return {
    planFillingId: "pf1",
    fillingId: "f9",
    fillingName: "Praliné",
    targetGrams: 300,
    multiplier: 1.5,
    scaledIngredients: [],
    scaledNestedFillings: [],
    ...overrides,
  };
}

const ingredients = new Map<string, Pick<Ingredient, "name" | "category">>([
  ["butter", { name: "Butter, unsalted", category: "Fats" }],
  ["cream", { name: "Cream 35%", category: "Dairy" }],
  ["glucose", { name: "Glucose syrup", category: "Sugars" }],
  ["salt", { name: "Sea salt" }], // deliberately uncategorised
]);

describe("buildIngredientChecklist", () => {
  it("sums one ingredient across every filling that uses it", () => {
    const rows = buildIngredientChecklist(
      [
        consolidated({ fillingId: "f1", fillingName: "Caramel", scaledIngredients: [g("butter", 200)] }),
        consolidated({ fillingId: "f2", fillingName: "Ganache", scaledIngredients: [g("butter", 300)] }),
      ],
      [],
      ingredients,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ ingredientId: "butter", name: "Butter, unsalted", amount: 500 });
  });

  it("records which fillings drove the total, biggest contribution first", () => {
    const rows = buildIngredientChecklist(
      [
        consolidated({ fillingId: "f1", fillingName: "Caramel", scaledIngredients: [g("cream", 120)] }),
        consolidated({ fillingId: "f2", fillingName: "Ganache", scaledIngredients: [g("cream", 400)] }),
      ],
      [],
      ingredients,
    );
    expect(rows[0].usedBy).toEqual([
      { fillingName: "Ganache", amount: 400 },
      { fillingName: "Caramel", amount: 120 },
    ]);
  });

  it("includes standalone filling batches alongside the moulded-product fillings", () => {
    const rows = buildIngredientChecklist(
      [consolidated({ scaledIngredients: [g("butter", 100)] })],
      [standalone({ fillingName: "Praliné", scaledIngredients: [g("butter", 50)] })],
      ingredients,
    );
    expect(rows[0].amount).toBe(150);
    expect(rows[0].usedBy.map((u) => u.fillingName).sort()).toEqual(["Dark caramel", "Praliné"]);
  });

  it("ignores fillings sourced from a previous batch — nothing to buy for those", () => {
    const rows = buildIngredientChecklist(
      [
        consolidated({ fillingId: "f1", scaledIngredients: [g("butter", 200)] }),
        consolidated({
          fillingId: "f2",
          fillingName: "Leftover caramel",
          isFromPreviousBatch: true,
          // Defensive: real rows carry no ingredients, but a stray one must not
          // inflate the shop either.
          scaledIngredients: [g("butter", 999)],
        }),
      ],
      [],
      ingredients,
    );
    expect(rows[0].amount).toBe(200);
  });

  it("keeps an ingredient that has since been deleted, rather than dropping its weight", () => {
    const rows = buildIngredientChecklist(
      [consolidated({ scaledIngredients: [g("ghost", 75)] })],
      [],
      ingredients,
    );
    expect(rows).toEqual([
      expect.objectContaining({ ingredientId: "ghost", name: "Unknown ingredient", amount: 75 }),
    ]);
  });

  it("never sums across different units — an ingredient in two units gets two rows", () => {
    const rows = buildIngredientChecklist(
      [
        consolidated({ fillingId: "f1", fillingName: "Caramel", scaledIngredients: [g("salt", 5)] }),
        consolidated({ fillingId: "f2", fillingName: "Ganache", scaledIngredients: [g("salt", 2, "tsp")] }),
      ],
      [],
      ingredients,
    );
    expect(rows.map((r) => [r.amount, r.unit])).toEqual([[5, "g"], [2, "tsp"]]);
  });

  it("skips zero and negative amounts", () => {
    const rows = buildIngredientChecklist(
      [consolidated({ scaledIngredients: [g("butter", 0), g("cream", -5), g("glucose", 10)] })],
      [],
      ingredients,
    );
    expect(rows.map((r) => r.ingredientId)).toEqual(["glucose"]);
  });

  it("sorts by category then name, with uncategorised ingredients last", () => {
    const rows = buildIngredientChecklist(
      [consolidated({
        scaledIngredients: [g("salt", 5), g("glucose", 300), g("butter", 200), g("cream", 100)],
      })],
      [],
      ingredients,
    );
    expect(rows.map((r) => r.name)).toEqual([
      "Cream 35%",        // Dairy
      "Butter, unsalted", // Fats
      "Glucose syrup",    // Sugars
      "Sea salt",         // uncategorised — last
    ]);
  });

  it("rounds the summed total once, not per contribution", () => {
    const rows = buildIngredientChecklist(
      [consolidated({ scaledIngredients: [g("butter", 0.05), g("butter", 0.05)] })],
      [],
      ingredients,
    );
    expect(rows[0].amount).toBe(0.1);
  });

  it("returns nothing for a plan with no fillings yet", () => {
    expect(buildIngredientChecklist([], [], ingredients)).toEqual([]);
  });
});

describe("formatChecklistAmount", () => {
  it("keeps grams below a kilo", () => {
    expect(formatChecklistAmount(300, "g")).toBe("300 g");
    expect(formatChecklistAmount(999.4, "g")).toBe("999.4 g");
  });

  it("rolls grams up to kg at a kilo — that's how you buy it", () => {
    expect(formatChecklistAmount(1000, "g")).toBe("1 kg");
    expect(formatChecklistAmount(1420, "g")).toBe("1.4 kg");
  });

  it("leaves other units alone", () => {
    expect(formatChecklistAmount(2, "tsp")).toBe("2 tsp");
    expect(formatChecklistAmount(1500, "ml")).toBe("1500 ml");
  });

  it("drops a trailing .0 — false precision on a shopping list", () => {
    expect(formatChecklistAmount(12.0, "g")).toBe("12 g");
  });
});

describe("groupChecklistByCategory", () => {
  const row = (name: string, category?: string): ChecklistRow => ({
    ingredientId: name, name, category, amount: 1, unit: "g", usedBy: [],
  });

  it("groups consecutive rows and labels uncategorised ones 'Other'", () => {
    expect(groupChecklistByCategory([
      row("Cream", "Dairy"), row("Milk", "Dairy"), row("Butter", "Fats"), row("Salt"),
    ]).map((group) => [group.category, group.rows.length])).toEqual([
      ["Dairy", 2], ["Fats", 1], ["Other", 1],
    ]);
  });

  it("handles an empty list", () => {
    expect(groupChecklistByCategory([])).toEqual([]);
  });
});
