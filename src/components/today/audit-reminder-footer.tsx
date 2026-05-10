"use client";

import Link from "next/link";
import { useProductsList } from "@/lib/hooks";
import { ClipboardList } from "lucide-react";

const RECOMMENDED_AUDIT_INTERVAL_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Foots the dashboard with a nudge to recount stock when the most recent
 *  per-product manual count is older than the recommended interval. Silent
 *  when no products have ever been counted (nothing to compare against) and
 *  when the most recent count is fresh.
 *
 *  "Most recent" is the max `stockCountedAt` across all non-archived products
 *  — this is the dashboard-wide recency signal, not per-product. The Stock
 *  page is where you act on it. */
export function AuditReminderFooter() {
  const products = useProductsList();
  const counts = products
    .map((p) => p.stockCountedAt)
    .filter((t): t is number => typeof t === "number" && Number.isFinite(t));
  if (counts.length === 0) return null;

  const mostRecent = Math.max(...counts);
  const daysAgo = Math.floor((Date.now() - mostRecent) / DAY_MS);
  if (daysAgo < RECOMMENDED_AUDIT_INTERVAL_DAYS) return null;

  return (
    <Link
      href="/stock"
      className="flex items-center gap-3 rounded-lg border border-dashed border-border bg-card px-4 py-3 text-sm hover:bg-muted transition-colors"
    >
      <ClipboardList className="w-4 h-4 shrink-0 text-muted-foreground" />
      <span className="flex-1">
        <span className="mono-label text-muted-foreground">Audit reminder</span>
        <span className="block mt-0.5">
          Last counted {daysAgo} days ago — recommended every {RECOMMENDED_AUDIT_INTERVAL_DAYS} days
        </span>
      </span>
      <span className="text-xs text-muted-foreground">Recount →</span>
    </Link>
  );
}
