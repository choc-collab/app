/**
 * Pure planning for a stocktake — counting every product in one pass instead
 * of opening each one from the stock list.
 *
 * The screen at `/stock/count` collects one number per product and hands the
 * rows here. This module answers "what would saving do?" without touching
 * IndexedDB, so the UI can show an honest summary (and the destructive-change
 * warning) before anything is written, and so the whole rule set is testable
 * from Vitest.
 *
 * Conventions:
 *   - A blank entry means "I didn't count this one" — the row is skipped
 *     entirely and its `stockCountedAt` is left alone. Clearing a field is the
 *     skip affordance; there is no separate toggle.
 *   - An entry equal to the recorded total is a *confirmation*: nothing to
 *     rewrite, but the product is still stamped as counted, so a stocktake
 *     where nothing moved still clears the dashboard reminder.
 *   - Reconciliation itself is delegated to `reconcileStockCount`, the same
 *     FIFO distribution the single-product flow uses.
 */

import { reconcileStockCount, type StockBatchInput } from "./stockCount";

export interface StocktakeBatch extends StockBatchInput {
  /** Human-readable batch label, used when warning that a batch empties out. */
  batchNumber: string;
}

export interface StocktakeRowInput {
  productId: string;
  productName: string;
  /** Pieces currently recorded across this product's in-stock batches. */
  currentTotal: number;
  /** What the user typed. `null` for a blank field ("not counted"). */
  entered: number | null;
  batches: readonly StocktakeBatch[];
}

export interface StocktakeChange {
  productId: string;
  productName: string;
  from: number;
  to: number;
}

export interface StocktakeConfirmation {
  productId: string;
  productName: string;
  total: number;
}

export interface StocktakeGoneBatch {
  productId: string;
  productName: string;
  batchNumber: string;
}

export interface StocktakePlan {
  /** Rows whose total moved — these get reconciled across batches. */
  changed: StocktakeChange[];
  /** Rows counted and found unchanged — stamped only, never rewritten. */
  confirmed: StocktakeConfirmation[];
  /** Rows left blank (or given an unusable value) — untouched by the save. */
  skipped: { productId: string; productName: string }[];
  /** Batches that reconciliation would empty, and so mark "gone". */
  goneBatches: StocktakeGoneBatch[];
  /** Every product the save stamps as counted: changed + confirmed. */
  countedProductIds: string[];
  /** Net piece movement across the changed rows (negative = stock went down). */
  netDelta: number;
}

/** True when `entered` is something we can actually save. */
function isUsableEntry(entered: number | null): entered is number {
  return entered !== null && Number.isFinite(entered) && entered >= 0;
}

/** Derive the full effect of saving a stocktake, without saving it. */
export function planStocktake(rows: readonly StocktakeRowInput[]): StocktakePlan {
  const plan: StocktakePlan = {
    changed: [],
    confirmed: [],
    skipped: [],
    goneBatches: [],
    countedProductIds: [],
    netDelta: 0,
  };

  for (const row of rows) {
    const { productId, productName, currentTotal } = row;

    if (!isUsableEntry(row.entered)) {
      plan.skipped.push({ productId, productName });
      continue;
    }

    const entered = Math.round(row.entered);
    plan.countedProductIds.push(productId);

    if (entered === currentTotal) {
      plan.confirmed.push({ productId, productName, total: entered });
      continue;
    }

    plan.changed.push({ productId, productName, from: currentTotal, to: entered });
    plan.netDelta += entered - currentTotal;

    // Dry-run the same reconciliation the write path will perform, so the
    // confirmation step can name every batch that is about to be zeroed.
    const deltas = reconcileStockCount(row.batches, entered);
    const zeroed = new Set(deltas.filter((d) => d.nextStock <= 0).map((d) => d.id));
    for (const batch of row.batches) {
      if (zeroed.has(batch.id)) {
        plan.goneBatches.push({ productId, productName, batchNumber: batch.batchNumber });
      }
    }
  }

  return plan;
}

/** Whether saving this plan would do anything at all. */
export function isStocktakeEmpty(plan: StocktakePlan): boolean {
  return plan.countedProductIds.length === 0;
}
