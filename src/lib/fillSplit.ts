/**
 * Fill-percentage split maths for a product's fillings.
 *
 * The split is **one logical field rendered as N rows**, not N independent
 * fields: the percentages describe how one cavity's fill volume is divided, so
 * they only mean anything relative to each other. Editing one row therefore has
 * to rebalance the rest and write the whole split at once — committing rows
 * independently lets two edits race and leaves totals that don't add to 100.
 *
 * Pure functions, no Dexie — the DB wrapper lives in `hooks.ts`.
 */

export interface FillSplitRow {
  id: string;
  fillPercentage: number;
}

/**
 * Recompute the whole split after one row is set to `nextPercentage`.
 *
 * The remaining share is distributed across the other rows in proportion to
 * what they currently hold, so a 50/30/20 split edited to 60 becomes 60/24/16
 * rather than 60/20/20 — the untouched rows keep their relative weighting.
 * When the other rows are all at zero there is no ratio to preserve, so the
 * remainder is spread evenly instead.
 *
 * Results are whole numbers summing to exactly 100 (or to `nextPercentage`
 * alone when it is the only row), with any rounding remainder pushed onto the
 * last adjusted row.
 */
export function normaliseFillSplit(
  rows: FillSplitRow[],
  changedId: string,
  nextPercentage: number,
): Record<string, number> {
  const result: Record<string, number> = {};
  if (rows.length === 0) return result;

  const clamped = Math.max(0, Math.min(100, Math.round(nextPercentage)));

  const others = rows.filter((r) => r.id !== changedId);
  if (others.length === 0) {
    // A sole filling always takes the entire fill volume; an edit to it is
    // meaningless on its own terms.
    result[changedId] = 100;
    return result;
  }

  result[changedId] = clamped;
  const remaining = 100 - clamped;

  const otherTotal = others.reduce((sum, r) => sum + (r.fillPercentage || 0), 0);

  let allocated = 0;
  others.forEach((row, i) => {
    const isLast = i === others.length - 1;
    if (isLast) {
      // Absorb the rounding remainder here so the split totals exactly 100.
      result[row.id] = Math.max(0, remaining - allocated);
      return;
    }
    const share = otherTotal > 0
      ? (row.fillPercentage || 0) / otherTotal
      : 1 / others.length;
    const value = Math.round(remaining * share);
    result[row.id] = value;
    allocated += value;
  });

  return result;
}

/** Total of a split — used to surface "N% of fill" read-outs. */
export function fillSplitTotal(rows: FillSplitRow[]): number {
  return rows.reduce((sum, r) => sum + (r.fillPercentage || 0), 0);
}
