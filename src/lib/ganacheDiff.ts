/**
 * Diff helpers for comparing two versions of a ganache experiment.
 *
 * Two computations:
 *   - `diffExperimentIngredients` — row-by-row ingredient changes (added,
 *     removed, increased, decreased, unchanged).
 *   - `compositionShift` — per-component % shift between two balance readouts.
 *
 * Both are pure functions, framework-free.
 */

import type { ExperimentIngredient, Ingredient } from "@/types";
import type { GanacheBalance } from "./ganacheBalance";

export type IngredientChangeStatus =
  | "added"      // present only in B
  | "removed"    // present only in A
  | "increased"  // present in both, grams up in B
  | "decreased"  // present in both, grams down in B
  | "unchanged"; // identical grams

export interface IngredientDiffRow {
  ingredientId: string;
  name: string;
  amountA: number;   // 0 when absent in A
  amountB: number;   // 0 when absent in B
  delta: number;     // amountB - amountA
  pctA: number;      // ingredient's share of total batch A (0 when absent)
  pctB: number;      // ingredient's share of total batch B (0 when absent)
  status: IngredientChangeStatus;
  sortOrder: number; // hint for stable rendering
}

const EPS = 0.001;

/**
 * Diff two ingredient lists into a flat row set covering every ingredient
 * that appears in either side. Rows are sorted by:
 *   1. sortOrder from B (so the active version drives the visual order)
 *   2. sortOrder from A for ingredients only in A
 *   3. name as a final tie-breaker
 */
export function diffExperimentIngredients(
  a: ExperimentIngredient[],
  b: ExperimentIngredient[],
  ingredientMap: Map<string, Ingredient>,
): IngredientDiffRow[] {
  const totalA = a.reduce((sum, ei) => sum + ei.amount, 0);
  const totalB = b.reduce((sum, ei) => sum + ei.amount, 0);
  const byIdA = new Map(a.map((ei) => [ei.ingredientId, ei] as const));
  const byIdB = new Map(b.map((ei) => [ei.ingredientId, ei] as const));

  const allIds = new Set<string>([...byIdA.keys(), ...byIdB.keys()]);
  const rows: IngredientDiffRow[] = [];

  for (const id of allIds) {
    const eiA = byIdA.get(id);
    const eiB = byIdB.get(id);
    const amountA = eiA?.amount ?? 0;
    const amountB = eiB?.amount ?? 0;
    const delta = amountB - amountA;

    let status: IngredientChangeStatus;
    if (amountA <= EPS && amountB > EPS)       status = "added";
    else if (amountA > EPS && amountB <= EPS)  status = "removed";
    else if (Math.abs(delta) < EPS)            status = "unchanged";
    else if (delta > 0)                        status = "increased";
    else                                        status = "decreased";

    const ing = ingredientMap.get(id);
    rows.push({
      ingredientId: id,
      name: ing?.name ?? "(unknown ingredient)",
      amountA,
      amountB,
      delta,
      pctA: totalA > 0 ? (amountA / totalA) * 100 : 0,
      pctB: totalB > 0 ? (amountB / totalB) * 100 : 0,
      status,
      // Prefer B's sortOrder so the diff reads in the order the latest
      // version is laid out. Fall back to A's, then a large constant to
      // push name-only matches to the end.
      sortOrder: eiB?.sortOrder ?? eiA?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    });
  }

  return rows.sort((x, y) =>
    x.sortOrder !== y.sortOrder ? x.sortOrder - y.sortOrder : x.name.localeCompare(y.name)
  );
}

/** Aggregate summary of an ingredient diff — useful for headline copy. */
export interface IngredientDiffSummary {
  addedCount: number;
  removedCount: number;
  changedCount: number;
  unchangedCount: number;
  netGramsDelta: number;
}

export function summariseIngredientDiff(rows: IngredientDiffRow[]): IngredientDiffSummary {
  let added = 0, removed = 0, changed = 0, unchanged = 0, net = 0;
  for (const r of rows) {
    if (r.status === "added")     added++;
    if (r.status === "removed")   removed++;
    if (r.status === "increased" || r.status === "decreased") changed++;
    if (r.status === "unchanged") unchanged++;
    net += r.delta;
  }
  return { addedCount: added, removedCount: removed, changedCount: changed, unchangedCount: unchanged, netGramsDelta: net };
}

// ─────────────────────────────────────────────────────────────────────────
// Composition shift
// ─────────────────────────────────────────────────────────────────────────

export type ComponentKey =
  | "water" | "sugar" | "cacaoFat" | "milkFat" | "otherFats" | "solids" | "alcohol";

export interface ComponentShift {
  a: number;
  b: number;
  /** percentage points (not relative) — `b - a` */
  delta: number;
}

export type CompositionShift = Record<ComponentKey, ComponentShift>;

export function compositionShift(
  a: GanacheBalance | null,
  b: GanacheBalance | null,
): CompositionShift | null {
  if (!a || !b) return null;
  const shift = (k: ComponentKey): ComponentShift => ({
    a: a[k] as number,
    b: b[k] as number,
    delta: (b[k] as number) - (a[k] as number),
  });
  return {
    water:     shift("water"),
    sugar:     shift("sugar"),
    cacaoFat:  shift("cacaoFat"),
    milkFat:   shift("milkFat"),
    otherFats: shift("otherFats"),
    solids:    shift("solids"),
    alcohol:   shift("alcohol"),
  };
}
