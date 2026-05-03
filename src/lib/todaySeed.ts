/**
 * Hand-off between the /today "To make" list and the /production/new
 * wizard. The dashboard writes a list of selected product ids to
 * sessionStorage; the wizard reads them on mount, pre-fills its
 * `selectedIds` set, and clears the key so a refresh doesn't replay.
 *
 * sessionStorage (not localStorage) is intentional: the seed should not
 * survive across browser sessions. If the user closes the tab between
 * picking and configuring, the choice is discarded.
 */

export const SEED_FROM_TODAY_LIST_KEY = "seedFromTodayList";

/** Write a list of product ids that should be pre-selected in the next
 *  visit to /production/new. Silent no-op when storage is unavailable
 *  (private mode, server-side, etc.). */
export function writeSeedFromTodayList(productIds: readonly string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(
      SEED_FROM_TODAY_LIST_KEY,
      JSON.stringify(Array.from(productIds)),
    );
  } catch {
    // Storage quota or disabled — silently skip; the user simply enters the
    // wizard with no pre-selection.
  }
}

/** Read and consume the seeded ids. Returns an empty array when nothing
 *  is queued. The key is cleared on read so a wizard refresh starts
 *  empty. */
export function consumeSeedFromTodayList(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.sessionStorage.getItem(SEED_FROM_TODAY_LIST_KEY);
    if (!raw) return [];
    window.sessionStorage.removeItem(SEED_FROM_TODAY_LIST_KEY);
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === "string" && x.length > 0);
  } catch {
    return [];
  }
}

/** Compose a list of products with stock info into the row shape the
 *  ToMakeList renders. Pure derivation — used in tests and at runtime. */
export interface ToMakeRow {
  productId: string;
  name: string;
  pieces: number;
  threshold: number | undefined;
  /** "out" — zero pieces and a threshold is set (or stock has been zeroed
   *  out post-production); "low" — non-zero but below threshold; "healthy" —
   *  at or above threshold OR no threshold set. */
  status: "out" | "low" | "healthy";
}

export interface BuildRowsInput {
  products: ReadonlyArray<{ id?: string; name: string; lowStockThreshold?: number; archived?: boolean }>;
  stockByProduct: ReadonlyMap<string, number>;
}

/** Sort: most-urgent first. Within a status bucket, alphabetical by name. */
const STATUS_ORDER: Record<ToMakeRow["status"], number> = { out: 0, low: 1, healthy: 2 };

export function buildToMakeRows(input: BuildRowsInput): ToMakeRow[] {
  const rows: ToMakeRow[] = [];
  for (const p of input.products) {
    if (!p.id || p.archived) continue;
    const pieces = input.stockByProduct.get(p.id) ?? 0;
    const threshold = p.lowStockThreshold;
    let status: ToMakeRow["status"];
    if (threshold == null) {
      status = "healthy"; // no threshold — never flagged
    } else if (pieces <= 0) {
      status = "out";
    } else if (pieces < threshold) {
      status = "low";
    } else {
      status = "healthy";
    }
    rows.push({ productId: p.id, name: p.name, pieces, threshold, status });
  }
  rows.sort((a, b) => {
    const s = STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
    if (s !== 0) return s;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
  return rows;
}
