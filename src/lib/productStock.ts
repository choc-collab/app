/**
 * Available stock per product, derived from completed production plans.
 *
 * Mirrors the aggregation already used by `useProductStockTotals` in
 * `hooks.ts` — extracted here as a pure function so the Shop feature can
 * call it from Vitest (and from server/prep code paths) without a React
 * runtime. The rule set:
 *
 *   - Only batches from completed plans count (the caller filters that —
 *     this function receives only "done"-plan rows).
 *   - Batches marked `stockStatus: "gone"` are ignored.
 *   - Pieces = `currentStock ?? actualYield ?? 0`.
 *   - Frozen pieces (`frozenQty`) are intentionally NOT counted — they're
 *     in the freezer and unavailable until defrosted.
 */

import { db } from "./db";

export interface ProductStockBatchInput {
  productId: string;
  currentStock?: number;
  actualYield?: number;
  stockStatus?: "low" | "gone";
  frozenQty?: number;
}

/** Total available pieces across the given batches, grouped by productId. */
export function aggregateProductStock(
  batches: readonly ProductStockBatchInput[],
): Map<string, number> {
  const result = new Map<string, number>();
  for (const b of batches) {
    if (b.stockStatus === "gone") continue;
    const pieces = b.currentStock ?? b.actualYield ?? 0;
    if (pieces <= 0) continue;
    result.set(b.productId, (result.get(b.productId) ?? 0) + pieces);
  }
  return result;
}

/** Available pieces for one product. Returns 0 when no matching batches exist. */
export function getProductStockFromBatches(
  productId: string,
  batches: readonly ProductStockBatchInput[],
): number {
  return aggregateProductStock(batches).get(productId) ?? 0;
}

/** DB-aware variant: reads completed plans and returns a productId → pieces map.
 *  Used by Shop surfaces that render stock without going through React's live
 *  query machinery. For live-reactive displays, prefer the existing
 *  `useProductStockTotals` hook in `hooks.ts`. */
export async function getAllProductStock(): Promise<Map<string, number>> {
  const donePlans = await db.productionPlans.where("status").equals("done").toArray();
  if (donePlans.length === 0) return new Map();
  const planIds = donePlans.map((p) => p.id!);
  const batches = await db.planProducts.where("planId").anyOf(planIds).toArray();
  return aggregateProductStock(batches);
}
