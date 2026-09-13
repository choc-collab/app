// Roll-up of every ingredient a production plan's fillings consume, for the
// "Ingredient checklist" a chocolatier walks the pantry with before starting.
//
// Deliberately takes the *already-scaled* filling amounts the plan detail page
// computes (`consolidateSharedFillings` for moulded-product fillings,
// `calculateStandaloneFillingAmounts` for standalone filling batches) rather
// than recipes: all the hard parts — cook-loss via `measuredYieldG`,
// shelf-stable batch multipliers, percentage-vs-grams fill modes, nested
// filling expansion — are already resolved there, and reproducing any of it
// here would be a second implementation free to drift.
//
// Shell/coating chocolate is out of scope by design: this answers "what do I
// need to make the fillings", which is the shopping decision.

import type { ConsolidatedFilling, StandaloneFillingAmount, ScaledIngredient } from "@/lib/production";
import type { Ingredient } from "@/types";

/** One filling's contribution to an ingredient's total — the "why" behind a row. */
export interface ChecklistUse {
  fillingName: string;
  amount: number;
}

export interface ChecklistRow {
  ingredientId: string;
  name: string;
  category?: string;
  /** Summed across every filling in the plan that uses this ingredient. */
  amount: number;
  /** Recipe unit, almost always "g" — see `groupKey` for why it's part of the key. */
  unit: string;
  /** Which fillings drove the total, largest contribution first. */
  usedBy: ChecklistUse[];
}

/** Ingredient amounts are stored per recipe row with their own unit (the
 *  filling editor writes "g" for everything, but the field is free-form and
 *  CSV import can carry others). Summing across units would produce a
 *  confidently wrong number, so the unit is part of the identity: an
 *  ingredient recorded in two units yields two rows rather than one lie. */
const groupKey = (ingredientId: string, unit: string) => `${ingredientId}::${unit}`;

interface Accumulator {
  ingredientId: string;
  unit: string;
  amount: number;
  usedBy: Map<string, number>;
}

function addContribution(
  acc: Map<string, Accumulator>,
  fillingName: string,
  scaled: readonly ScaledIngredient[],
) {
  for (const si of scaled) {
    if (!si.ingredientId || !(si.amount > 0)) continue;
    const key = groupKey(si.ingredientId, si.unit);
    let entry = acc.get(key);
    if (!entry) {
      entry = { ingredientId: si.ingredientId, unit: si.unit, amount: 0, usedBy: new Map() };
      acc.set(key, entry);
    }
    entry.amount += si.amount;
    entry.usedBy.set(fillingName, (entry.usedBy.get(fillingName) ?? 0) + si.amount);
  }
}

/** Round to one decimal — the same precision `calculateFillingAmounts` keeps
 *  per row, applied once at the end so a long sum doesn't accumulate error. */
const round1 = (n: number) => Math.round(n * 10) / 10;

/**
 * Every ingredient the plan's fillings need, one row each, summed across the
 * fillings that use it.
 *
 * `consolidated` should already have previous-batch fillings filtered out (they
 * consume nothing — the filling is coming from a tub already in the fridge) and
 * nested fillings expanded into their own entries. That is exactly what the
 * plan detail page's `consolidatedFillings` memo hands over. Host fillings list
 * only true ingredients in `scaledIngredients` — a nested child contributes via
 * its own expanded entry — so summing across every entry double-counts nothing.
 */
export function buildIngredientChecklist(
  consolidated: readonly ConsolidatedFilling[],
  standalone: readonly StandaloneFillingAmount[],
  ingredientsById: ReadonlyMap<string, Pick<Ingredient, "name" | "category">>,
): ChecklistRow[] {
  const acc = new Map<string, Accumulator>();

  for (const cf of consolidated) {
    if (cf.isFromPreviousBatch) continue;
    addContribution(acc, cf.fillingName, cf.scaledIngredients);
  }
  for (const sa of standalone) {
    addContribution(acc, sa.fillingName, sa.scaledIngredients);
  }

  const rows: ChecklistRow[] = [];
  for (const entry of acc.values()) {
    // An ingredient deleted since the plan was made still has to appear — its
    // weight is real and hiding the row would quietly understate the shop.
    const ing = ingredientsById.get(entry.ingredientId);
    rows.push({
      ingredientId: entry.ingredientId,
      name: ing?.name ?? "Unknown ingredient",
      category: ing?.category,
      amount: round1(entry.amount),
      unit: entry.unit,
      usedBy: [...entry.usedBy]
        .map(([fillingName, amount]) => ({ fillingName, amount: round1(amount) }))
        .sort((a, b) => b.amount - a.amount || a.fillingName.localeCompare(b.fillingName)),
    });
  }

  // Grouped by category so the list reads in the order the pantry is arranged;
  // uncategorised ingredients sink to the bottom rather than heading the list.
  return rows.sort((a, b) => {
    if ((a.category ?? "") !== (b.category ?? "")) {
      if (!a.category) return 1;
      if (!b.category) return -1;
      return a.category.localeCompare(b.category);
    }
    return a.name.localeCompare(b.name) || a.unit.localeCompare(b.unit);
  });
}

/** Display form for a checklist amount: grams roll up to kg once they pass a
 *  kilo, because "1.4 kg cream" is what you buy and "1400 g cream" isn't. */
export function formatChecklistAmount(amount: number, unit: string): string {
  if (unit === "g" && amount >= 1000) {
    const kg = Math.round(amount / 100) / 10;
    return `${kg} kg`;
  }
  // Trailing ".0" reads as false precision on a shopping list.
  const shown = Number.isInteger(amount) ? String(amount) : String(round1(amount));
  return `${shown} ${unit}`;
}

/** Rows grouped into their category sections, preserving `buildIngredientChecklist`'s
 *  ordering. Uncategorised rows land under a trailing "Other" heading. */
export function groupChecklistByCategory(
  rows: readonly ChecklistRow[],
): Array<{ category: string; rows: ChecklistRow[] }> {
  const groups: Array<{ category: string; rows: ChecklistRow[] }> = [];
  for (const row of rows) {
    const category = row.category || "Other";
    const last = groups[groups.length - 1];
    if (last && last.category === category) last.rows.push(row);
    else groups.push({ category, rows: [row] });
  }
  return groups;
}
