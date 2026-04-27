/**
 * Cycle detection for nested fillings (filling-in-filling).
 *
 * A filling can list other fillings as components, but the resulting graph
 * must stay acyclic: aggregating cost / allergens / nutrition is a recursive
 * walk, and a cycle would loop forever. We reject any save that would close
 * a loop — self-reference, two-hop, or N-hop.
 *
 * The check is pure (no DB access), so callers fetch the relevant component
 * rows once and pass them in. That lets the same code run inside a Dexie
 * transaction (where extra reads would deadlock) and in unit tests.
 */

import type { FillingComponent, FillingIngredient } from "@/types";

/** Adjacency list from host fillingId → child fillingIds it directly contains. */
export type FillingChildMap = Map<string, string[]>;

/** Build the adjacency map from a flat list of FillingComponent rows. */
export function buildChildMap(rows: ReadonlyArray<FillingComponent>): FillingChildMap {
  const map: FillingChildMap = new Map();
  for (const r of rows) {
    const arr = map.get(r.fillingId);
    if (arr) arr.push(r.childFillingId);
    else map.set(r.fillingId, [r.childFillingId]);
  }
  return map;
}

/**
 * Returns true if adding `candidateChildId` as a component of `hostId` would
 * introduce a cycle in the filling-component graph.
 *
 * Caller passes the *current* component graph (BEFORE the new edge would be
 * inserted). The function asks whether `hostId` is reachable from
 * `candidateChildId` — if it is, adding host → candidate would close a loop.
 *
 * Rejects:
 *  - self-reference: hostId === candidateChildId
 *  - 2-hop: candidate → host
 *  - N-hop: candidate → … → host
 */
export function wouldCreateCycle(
  childMap: FillingChildMap,
  hostId: string,
  candidateChildId: string,
): boolean {
  if (hostId === candidateChildId) return true;
  // DFS from the candidate. If we ever reach `hostId`, the new edge would close
  // a cycle. `visited` keeps the walk linear in the size of the reachable set,
  // and also defends against any pre-existing cycle in the data.
  const visited = new Set<string>();
  const stack = [candidateChildId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (cur === hostId) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const children = childMap.get(cur);
    if (children) for (const c of children) stack.push(c);
  }
  return false;
}

/**
 * Flatten a host filling into a list of `{ ingredientId, amount }` rows by
 * recursively expanding nested-filling components.
 *
 * Math: when `host` includes 50 g of `child`, and `child`'s components sum
 * to 1000 g, every ingredient inside `child` contributes `50/1000` of its
 * own amount to the host's flattened list. The same rule applies to
 * grandchildren, so a 3-level tree scales by the product of the per-level
 * fractions. If a child's components sum to 0 g (no rows yet), the child
 * contributes nothing — there's no sensible weighting to apply, and a
 * silent zero is safer than a divide-by-zero.
 *
 * The walk carries a `seen` set so a malformed graph (a pre-save cycle in
 * the data) terminates instead of recursing forever. Cycles are rejected at
 * save time too, but the runtime guard keeps every reader honest.
 *
 * Returns one row per (host-walk path, ingredientId) — the same ingredient
 * appearing in two different children comes back as two rows. Callers that
 * want per-ingredient totals can roll up by `ingredientId`.
 */
export function flattenFillingToIngredients(
  hostId: string,
  fillingIngredientsByFilling: ReadonlyMap<string, ReadonlyArray<FillingIngredient>>,
  fillingComponentsByFilling: ReadonlyMap<string, ReadonlyArray<FillingComponent>>,
): Array<{ ingredientId: string; amount: number }> {
  const out: Array<{ ingredientId: string; amount: number }> = [];

  function totalGrams(fillingId: string, seen: Set<string>): number {
    if (seen.has(fillingId)) return 0;
    let g = 0;
    for (const li of fillingIngredientsByFilling.get(fillingId) ?? []) g += li.amount;
    for (const c of fillingComponentsByFilling.get(fillingId) ?? []) g += c.amount;
    return g;
  }

  function visit(fillingId: string, scale: number, seen: Set<string>): void {
    if (scale === 0) return;
    if (seen.has(fillingId)) return;
    const next = new Set(seen);
    next.add(fillingId);

    for (const li of fillingIngredientsByFilling.get(fillingId) ?? []) {
      out.push({ ingredientId: li.ingredientId, amount: li.amount * scale });
    }
    for (const c of fillingComponentsByFilling.get(fillingId) ?? []) {
      const childTotal = totalGrams(c.childFillingId, next);
      if (childTotal <= 0) continue;
      const childScale = (c.amount / childTotal) * scale;
      visit(c.childFillingId, childScale, next);
    }
  }

  visit(hostId, 1, new Set<string>());
  return out;
}

/**
 * Sum the `amount` field for each `ingredientId` across a flattened result.
 * Useful when callers want one row per ingredient (cost rollups), since the
 * flattener returns one row per (path, ingredientId) — duplicates fall out of
 * a child appearing in two branches.
 */
export function rollUpAmounts(
  rows: ReadonlyArray<{ ingredientId: string; amount: number }>,
): Array<{ ingredientId: string; amount: number }> {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.ingredientId, (m.get(r.ingredientId) ?? 0) + r.amount);
  return Array.from(m, ([ingredientId, amount]) => ({ ingredientId, amount }));
}

/**
 * Recursively collect every leaf ingredient id reachable from `hostId` via
 * fillingIngredients + fillingComponents. Used by the allergen aggregation —
 * cost / nutrition use `flattenFillingToIngredients` instead because they
 * also need the scaled amounts.
 */
export function reachableIngredientIds(
  hostId: string,
  fillingIngredientsByFilling: ReadonlyMap<string, ReadonlyArray<FillingIngredient>>,
  fillingComponentsByFilling: ReadonlyMap<string, ReadonlyArray<FillingComponent>>,
): Set<string> {
  const out = new Set<string>();
  const seen = new Set<string>();
  function visit(fillingId: string) {
    if (seen.has(fillingId)) return;
    seen.add(fillingId);
    for (const li of fillingIngredientsByFilling.get(fillingId) ?? []) out.add(li.ingredientId);
    for (const c of fillingComponentsByFilling.get(fillingId) ?? []) visit(c.childFillingId);
  }
  visit(hostId);
  return out;
}

/**
 * Build the reverse adjacency: childFillingId → [hostFillingIds] that
 * directly nest it. Used by the ancestor-walk cascade — when `child` gains
 * a new allergen, every direct/indirect host needs its cached
 * `Filling.allergens` recomputed.
 */
export type FillingParentMap = Map<string, string[]>;

export function buildParentMap(rows: ReadonlyArray<FillingComponent>): FillingParentMap {
  const map: FillingParentMap = new Map();
  for (const r of rows) {
    const arr = map.get(r.childFillingId);
    if (arr) arr.push(r.fillingId);
    else map.set(r.childFillingId, [r.fillingId]);
  }
  return map;
}

/**
 * Returns the set of host fillings that transitively nest `leafFillingId`,
 * including `leafFillingId` itself. Caller passes the full component graph
 * once and asks for ancestors — same shape as the cycle-check helpers.
 */
export function ancestorFillingIds(
  parentMap: FillingParentMap,
  leafFillingId: string,
): Set<string> {
  const out = new Set<string>();
  const stack = [leafFillingId];
  while (stack.length > 0) {
    const cur = stack.pop()!;
    if (out.has(cur)) continue;
    out.add(cur);
    const parents = parentMap.get(cur);
    if (parents) for (const p of parents) stack.push(p);
  }
  return out;
}
