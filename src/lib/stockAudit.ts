/**
 * Pure derivation for the dashboard "time to count your stock" reminder.
 *
 * The signal is workshop-wide rather than per-product: a stocktake is one
 * activity, so what matters is how long it has been since *any* product was
 * counted. Per-product nagging would fire constantly in a workshop where some
 * bonbons sit untouched for months.
 *
 * Nothing has ever been counted is still a reason to remind — but only once
 * the stock itself is older than the interval, so a batch made this morning
 * doesn't immediately ask to be recounted.
 */

export const STOCK_COUNT_INTERVAL_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface StockAuditProduct {
  productId: string;
  /** Timestamp (ms) of this product's most recent manual count, if any. */
  stockCountedAt?: number;
}

export interface ComputeStockAuditInput {
  now: number;
  /** Products that currently carry available (non-frozen) stock. */
  products: readonly StockAuditProduct[];
  /** Earliest completion date (ms) among in-stock batches. Used as the
   *  reference point when nothing has ever been counted. */
  oldestStockAt?: number;
  /** Days of silence before the reminder fires. Defaults to a week. */
  intervalDays?: number;
}

export interface StockAuditStatus {
  /** Whether the dashboard should show the reminder. */
  due: boolean;
  /** Why it fired — `null` when it didn't. */
  reason: "never-counted" | "stale" | null;
  /** Most recent count across products holding stock; `null` if never counted. */
  lastCountedAt: number | null;
  /** Whole days since the reference point; `null` when there's nothing to measure. */
  daysAgo: number | null;
  intervalDays: number;
  /** How many products currently hold stock. */
  trackedProducts: number;
  /** Of those, how many have never been counted. */
  neverCountedProducts: number;
}

export function computeStockAudit(input: ComputeStockAuditInput): StockAuditStatus {
  const { now, products, oldestStockAt } = input;
  const intervalDays = input.intervalDays ?? STOCK_COUNT_INTERVAL_DAYS;

  const counted = products
    .map((p) => p.stockCountedAt)
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t));

  const base: StockAuditStatus = {
    due: false,
    reason: null,
    lastCountedAt: counted.length > 0 ? Math.max(...counted) : null,
    daysAgo: null,
    intervalDays,
    trackedProducts: products.length,
    neverCountedProducts: products.filter(
      (p) => !(typeof p.stockCountedAt === "number" && Number.isFinite(p.stockCountedAt)),
    ).length,
  };

  // Nothing in stock — nothing to count, so stay quiet.
  if (products.length === 0) return base;

  // Fall back to the age of the stock itself when no count has ever happened.
  const reference = base.lastCountedAt ?? (
    typeof oldestStockAt === "number" && Number.isFinite(oldestStockAt) ? oldestStockAt : null
  );
  if (reference === null) return base;

  const daysAgo = Math.floor((now - reference) / DAY_MS);
  if (daysAgo < intervalDays) return { ...base, daysAgo };

  return {
    ...base,
    due: true,
    reason: base.lastCountedAt === null ? "never-counted" : "stale",
    daysAgo,
  };
}
