/**
 * Group prepared sales by "same content" so the Shop landing doesn't render
 * 40 near-identical rows when a morning batch was prepped via the quantity
 * stepper.
 *
 * Grouping key:
 *   collectionId | packagingId | cells (order-sensitive) | customerNote
 *
 * Rationale for including the note: a box reserved "for Marie" should stay
 * visually distinct from an otherwise-identical walk-in box. Boxes with the
 * same note (including the empty-note case) collapse.
 *
 * Group ordering: groups sort by the *latest* preparedAt in the group
 * (desc), so the most recently touched batch sits on top. Inside a group,
 * sales sort by preparedAt ascending — oldest first — so callers that
 * "sell N" take the oldest N (FIFO from the display counter's POV).
 *
 * Pure: no React, no DB.
 */

import type { Sale } from "@/types";

export interface SaleGroup {
  /** Stable key derived from the grouping tuple. */
  key: string;
  /** Sales in the group, oldest first. */
  sales: Sale[];
  /** Representative — the oldest sale. Use for cavity preview / note / price
   *  / collection label rendering (every field that's shared by the group). */
  representative: Sale;
  count: number;
  earliestPreparedAt: Date;
  latestPreparedAt: Date;
}

export function groupPreparedSales(sales: readonly Sale[]): SaleGroup[] {
  const byKey = new Map<string, Sale[]>();
  for (const sale of sales) {
    const key = groupKey(sale);
    const bucket = byKey.get(key);
    if (bucket) bucket.push(sale);
    else byKey.set(key, [sale]);
  }

  const groups: SaleGroup[] = [];
  for (const [key, bucket] of byKey) {
    bucket.sort((a, b) => toMs(a.preparedAt) - toMs(b.preparedAt));
    groups.push({
      key,
      sales: bucket,
      representative: bucket[0],
      count: bucket.length,
      earliestPreparedAt: new Date(toMs(bucket[0].preparedAt)),
      latestPreparedAt: new Date(toMs(bucket[bucket.length - 1].preparedAt)),
    });
  }

  // Sort groups by the most recently prepared member, desc. Matches the
  // existing "prepared rows newest-on-top" behaviour users already know.
  groups.sort((a, b) => b.latestPreparedAt.getTime() - a.latestPreparedAt.getTime());
  return groups;
}

/** Return the `n` oldest sale ids in a group — what "Sell N" targets. */
export function firstNSaleIds(group: SaleGroup, n: number): string[] {
  const capped = Math.max(0, Math.min(Math.floor(n || 0), group.sales.length));
  const ids: string[] = [];
  for (let i = 0; i < capped; i++) {
    const id = group.sales[i].id;
    if (id) ids.push(id);
  }
  return ids;
}

function groupKey(sale: Sale): string {
  // Cells are order-sensitive — "bonbon A in cavity 0, B in cavity 1" is a
  // visually different box from "B in 0, A in 1", even though the multiset
  // matches. We match the visual precisely.
  const cells = JSON.stringify(sale.cells);
  const note = sale.customerNote ?? "";
  return `${sale.collectionId}|${sale.packagingId}|${cells}|${note}`;
}

function toMs(d: Date | string | undefined): number {
  if (!d) return 0;
  const t = typeof d === "string" ? new Date(d).getTime() : d.getTime();
  return Number.isFinite(t) ? t : 0;
}
