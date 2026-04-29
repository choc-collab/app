/**
 * Pure stock-reconciliation helpers for Shop sales.
 *
 * When a sale is "prepared", its cells' bonbons come out of stock. When a
 * prepared sale is voided, those bonbons go back in. Both directions reuse
 * the FIFO reducer in `stockCount.ts`:
 *
 *   - commit: decrement oldest batch first
 *   - restore: add to newest batch
 *
 * Each function returns the per-batch `{id, nextStock}` deltas to apply. The
 * caller persists them in a Dexie transaction.
 *
 * No React, no DB. `fifoOrder` on each batch is a caller-supplied sort key
 * (we pass `plan.completedAt.getTime()` from the Shop save helper).
 */

import { reconcileStockCount, type StockBatchDelta } from "./stockCount";

export interface SaleStockBatch {
  id: string;
  productId: string;
  currentStock?: number;
  actualYield?: number;
  stockStatus?: "low" | "gone";
  fifoOrder: number;
}

/** Decrement stock for a box commit: subtract each product's cell count from
 *  its batches FIFO. `usedByProduct` may include products missing from
 *  `batches` — those are simply ignored (no stock to touch). */
export function computeCommitStockDeltas(
  batches: readonly SaleStockBatch[],
  usedByProduct: ReadonlyMap<string, number>,
): StockBatchDelta[] {
  const deltas: StockBatchDelta[] = [];

  for (const [productId, used] of usedByProduct) {
    if (used <= 0) continue;
    const eligible = batches.filter(
      (b) => b.productId === productId && b.stockStatus !== "gone",
    );
    if (eligible.length === 0) continue;

    const currentTotal = eligible.reduce(
      (s, b) => s + Math.max(0, b.currentStock ?? b.actualYield ?? 0),
      0,
    );
    const nextTotal = Math.max(0, currentTotal - used);

    const productDeltas = reconcileStockCount(
      eligible.map((b) => ({
        id: b.id,
        currentStock: b.currentStock ?? b.actualYield ?? 0,
        fifoOrder: b.fifoOrder,
      })),
      nextTotal,
    );
    deltas.push(...productDeltas);
  }

  return deltas;
}

/** Restore stock for a void: add each product's cell count back to its
 *  newest batch. Symmetric to `computeCommitStockDeltas`. */
export function computeRestoreStockDeltas(
  batches: readonly SaleStockBatch[],
  restoreByProduct: ReadonlyMap<string, number>,
): StockBatchDelta[] {
  const deltas: StockBatchDelta[] = [];

  for (const [productId, restore] of restoreByProduct) {
    if (restore <= 0) continue;
    const eligible = batches.filter(
      (b) => b.productId === productId && b.stockStatus !== "gone",
    );
    if (eligible.length === 0) continue;

    const currentTotal = eligible.reduce(
      (s, b) => s + Math.max(0, b.currentStock ?? b.actualYield ?? 0),
      0,
    );
    const nextTotal = currentTotal + restore;

    const productDeltas = reconcileStockCount(
      eligible.map((b) => ({
        id: b.id,
        currentStock: b.currentStock ?? b.actualYield ?? 0,
        fifoOrder: b.fifoOrder,
      })),
      nextTotal,
    );
    deltas.push(...productDeltas);
  }

  return deltas;
}

/** Tally cell occurrences by productId. Null cells are ignored. */
export function tallyCells(cells: readonly (string | null)[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const c of cells) {
    if (!c) continue;
    m.set(c, (m.get(c) ?? 0) + 1);
  }
  return m;
}
