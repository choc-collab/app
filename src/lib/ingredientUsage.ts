import type { Filling, FillingIngredient } from "@/types";

/**
 * How many distinct fillings use each ingredient, keyed by ingredient id.
 * Ingredients absent from the map are used by nothing.
 *
 * "Uses" is deliberately the same rule `checkIngredientBeforeDelete` guards on:
 * a filling counts unless it has been superseded by a newer version, so the
 * number shown in the list agrees with the warning you get when you actually
 * try to delete the ingredient. Archived fillings still count — archiving hides
 * a filling from pickers but keeps its recipe, so the ingredient is not free to
 * delete.
 */
export function countFillingsPerIngredient(
  fillingIngredients: FillingIngredient[],
  fillings: Filling[],
): Map<string, number> {
  const current = new Set<string>();
  for (const filling of fillings) {
    if (filling.id && !filling.supersededAt) current.add(filling.id);
  }

  // A filling can list the same ingredient on more than one row; that is still
  // one filling using it, so collect ids rather than counting rows.
  const fillingIdsByIngredient = new Map<string, Set<string>>();
  for (const row of fillingIngredients) {
    if (!current.has(row.fillingId)) continue;
    const seen = fillingIdsByIngredient.get(row.ingredientId);
    if (seen) seen.add(row.fillingId);
    else fillingIdsByIngredient.set(row.ingredientId, new Set([row.fillingId]));
  }

  return new Map([...fillingIdsByIngredient].map(([id, ids]) => [id, ids.size]));
}
