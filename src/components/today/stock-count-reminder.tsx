"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import type { StockAuditStatus } from "@/lib/stockAudit";

/** Dashboard nudge to run a stocktake when nobody has counted anything for
 *  longer than the recommended interval (a week).
 *
 *  Deliberately workshop-wide rather than per-product: a stocktake is one
 *  activity, and per-product nagging would fire constantly for bonbons that
 *  sit untouched. Stays silent when nothing is in stock, and when the stock
 *  on hand is younger than the interval and has never been counted — a batch
 *  made yesterday doesn't need recounting.
 *
 *  The whole card links to `/stock/count`, so the reminder and the place to
 *  act on it are one tap apart.
 *
 *  Takes the signal as a prop rather than calling the hook itself: the Today
 *  header also needs it for its "N things need attention" line, and the
 *  underlying live query is not free. */
export function StockCountReminder({ audit }: { audit: StockAuditStatus | undefined }) {
  if (!audit?.due) return null;

  const headline =
    audit.reason === "never-counted"
      ? `${audit.trackedProducts === 1 ? "1 product has" : `${audit.trackedProducts} products have`} never been counted`
      : `Last counted ${audit.daysAgo} days ago`;

  const detail =
    audit.reason === "never-counted"
      ? `Oldest stock is ${audit.daysAgo} days old — a count sets your baseline`
      : audit.neverCountedProducts > 0
        ? `${audit.trackedProducts} products in stock, ${audit.neverCountedProducts} never counted`
        : `${audit.trackedProducts} ${audit.trackedProducts === 1 ? "product" : "products"} in stock · recommended every ${audit.intervalDays} days`;

  return (
    <Link
      href="/stock/count"
      className="flex items-center gap-3 rounded-lg border border-status-warn-edge bg-status-warn-bg px-4 py-3 text-sm transition-shadow hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
    >
      <ClipboardList aria-hidden="true" className="w-4 h-4 shrink-0 text-status-warn" />
      <span className="flex-1 min-w-0">
        <span className="mono-label text-status-warn">Time for a stocktake</span>
        <span className="block mt-0.5 font-medium">{headline}</span>
        <span className="block text-xs text-muted-foreground mt-0.5">{detail}</span>
      </span>
      <span className="shrink-0 inline-flex items-center rounded-full border border-status-warn-edge bg-card px-3 py-1 text-xs font-medium">
        Count stock →
      </span>
    </Link>
  );
}
