/**
 * Pure FIFO reconciliation for product stock counts.
 *
 * When a chocolatier manually counts their shelf stock (e.g. Monday morning),
 * they report a single total — but stock is tracked per batch so we can preserve
 * sell-before dates. This function distributes the user's total across batches:
 *
 *   - If the new total is lower: deduct from the oldest batch first (FIFO by
 *     sell-before / made date), since old stock should go first.
 *   - If the new total is higher: add the delta to the newest batch (assume
 *     any previously-uncounted pieces are fresh).
 *   - Zeroing a batch is fine — the stock page will hide it from the active
 *     list and the user can manually mark it "gone".
 *
 * No React, no IndexedDB — all inputs are plain data.
 */

export interface StockBatchInput {
  id: string;
  /** Current pieces in this batch (pre-reconciliation). Falls back to actualYield upstream. */
  currentStock: number;
  /** Sort key for FIFO order — typically sellBefore timestamp, falling back to madeAt. */
  fifoOrder: number;
}

export interface StockBatchDelta {
  id: string;
  /** The new currentStock value to persist for this batch. */
  nextStock: number;
}

/**
 * Given a list of in-stock batches and a new total piece count, return the
 * per-batch delta list. Only batches whose stock actually changes are returned.
 *
 * @param batches in-stock batches for a single product
 * @param newTotal the total piece count reported by the user (must be ≥ 0)
 */
export function reconcileStockCount(
  batches: readonly StockBatchInput[],
  newTotal: number,
): StockBatchDelta[] {
  if (newTotal < 0 || !Number.isFinite(newTotal)) return [];
  const target = Math.round(newTotal);

  const sorted = [...batches].sort((a, b) => a.fifoOrder - b.fifoOrder);
  const currentTotal = sorted.reduce((s, b) => s + Math.max(0, b.currentStock), 0);

  if (target === currentTotal) return [];

  const next = new Map<string, number>();
  for (const b of sorted) next.set(b.id, Math.max(0, b.currentStock));

  if (target < currentTotal) {
    // Deduct FIFO (oldest first)
    let toRemove = currentTotal - target;
    for (const b of sorted) {
      if (toRemove <= 0) break;
      const have = next.get(b.id)!;
      const take = Math.min(have, toRemove);
      next.set(b.id, have - take);
      toRemove -= take;
    }
  } else {
    // Add to the newest batch (last in FIFO order)
    const newest = sorted[sorted.length - 1];
    if (!newest) return [];
    const add = target - currentTotal;
    next.set(newest.id, next.get(newest.id)! + add);
  }

  const result: StockBatchDelta[] = [];
  for (const b of sorted) {
    const ns = next.get(b.id)!;
    if (ns !== Math.max(0, b.currentStock)) result.push({ id: b.id, nextStock: ns });
  }
  return result;
}

/**
 * FIFO sort key used when reconciling a manual count across one product's
 * batches: the batch's sell-by (completion date + shelf life), falling back
 * to the completion date itself when no shelf life is recorded.
 *
 * Freeze/defrost adjustments are deliberately ignored — a manual count only
 * ever reflects what is on the shelf, and fully-frozen batches are filtered
 * out before they reach the reconciler.
 *
 * Both the write path (`updateProductStockCount` / `applyStocktake`) and the
 * dry-runs that warn about batches going to zero must order batches the same
 * way, or the warning would name a different batch than the one that is
 * actually emptied — hence one shared helper.
 */
export function stockCountFifoOrder(
  completedAtMs: number,
  shelfLifeWeeks: string | number | undefined,
): number {
  if (!completedAtMs || !Number.isFinite(completedAtMs)) return 0;
  const weeks = typeof shelfLifeWeeks === "string" ? parseFloat(shelfLifeWeeks) : shelfLifeWeeks;
  if (weeks == null || !Number.isFinite(weeks) || weeks <= 0) return completedAtMs;
  return completedAtMs + Math.round((weeks - 1) * 7) * 24 * 60 * 60 * 1000;
}
