import type { FillingIngredient, Ingredient } from "@/types";
import { costPerGram } from "@/types";

export interface FillingRecipeCost {
  totalCost: number;
  missingIngredientNames: string[];
}

function toGrams(amount: number, unit: string): number | null {
  if (unit === "g" || unit === "ml") return amount;
  if (unit === "kg" || unit === "L") return amount * 1000;
  return null;
}

/** Sums each direct ingredient row's grams × cost-per-gram. Returns null for
 *  an empty composition. Only covers the filling's own ingredient rows —
 *  callers should treat a filling that nests other fillings as un-costable
 *  for now (nested-filling cost rollup isn't implemented yet) rather than
 *  passing its rows here and showing a partial, misleading total. */
export function computeFillingRecipeCost(
  items: FillingIngredient[],
  ingredientMap: Map<string, Ingredient>,
): FillingRecipeCost | null {
  if (items.length === 0) return null;

  let totalCost = 0;
  const missingIngredientNames: string[] = [];

  for (const item of items) {
    const ingredient = ingredientMap.get(item.ingredientId);
    if (!ingredient) continue;
    const grams = toGrams(item.amount, item.unit);
    if (grams == null) continue;
    const cpg = costPerGram(ingredient);
    if (cpg == null) {
      missingIngredientNames.push(ingredient.name);
      continue;
    }
    totalCost += grams * cpg;
  }

  return { totalCost, missingIngredientNames };
}
