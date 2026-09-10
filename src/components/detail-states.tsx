"use client";

import Link from "next/link";

/**
 * Loading and not-found states shared by every pantry detail page.
 *
 * These exist as a pair because `useLiveQuery` returns `undefined` both while a
 * read is pending and when the row genuinely isn't there — so a page cannot tell
 * the two apart from the live query alone. Each page runs a one-shot
 * `db.<table>.get(id)` alongside its live query and resolves a
 * `"loading" | "found" | "not-found"` status from that; these components render
 * the first and last of those. See `fillings/[id]/page.tsx` for the mechanism.
 */

/** Grey blocks in the real page silhouette, so the layout doesn't jump when the
 *  record lands. `sidebar={0}` renders a single-column page. */
export function DetailSkeleton({
  cards = 3,
  sidebar = 3,
  tabs = false,
  label = "Loading",
}: {
  /** Number of card outlines in the main column. */
  cards?: number;
  /** Number of card outlines in the sidebar; 0 for single-column pages. */
  sidebar?: number;
  /** Render a tab-strip placeholder above the cards. */
  tabs?: boolean;
  /** Announced to screen readers, e.g. "Loading packaging". */
  label?: string;
}) {
  // Varied heights read as a page rather than a stack of identical bars.
  const cardHeights = ["h-40", "h-24", "h-24", "h-32", "h-20", "h-28"];
  const sidebarHeights = ["h-32", "h-24", "h-28", "h-20", "h-24", "h-32"];

  return (
    <div className="px-4 pt-6 pb-8 animate-pulse" aria-busy="true" aria-label={label}>
      <div className="h-4 w-16 bg-muted rounded mb-4" />
      <div className="h-7 w-48 bg-muted rounded mb-2" />
      <div className="h-4 w-64 bg-muted rounded mb-6" />
      {tabs && (
        <div className="flex gap-3 border-b border-border mb-4 pb-2">
          <div className="h-4 w-16 bg-muted rounded" />
          <div className="h-4 w-20 bg-muted rounded" />
          <div className="h-4 w-14 bg-muted rounded" />
        </div>
      )}
      <div
        className={
          sidebar > 0
            ? "grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start"
            : ""
        }
      >
        <div className="space-y-4">
          {Array.from({ length: cards }, (_, i) => (
            <div key={i} className={`${cardHeights[i % cardHeights.length]} bg-muted rounded-lg`} />
          ))}
        </div>
        {sidebar > 0 && (
          <div className="space-y-4">
            {Array.from({ length: sidebar }, (_, i) => (
              <div key={i} className={`${sidebarHeights[i % sidebarHeights.length]} bg-muted rounded-lg`} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Shown when the one-shot `get(id)` came back empty — the record was deleted, or
 *  the URL is wrong. Deliberately distinct from the skeleton so a missing record
 *  never reads as a page that is still loading. */
export function DetailNotFound({
  entity,
  backHref,
  backLabel,
}: {
  /** Lower-case singular, e.g. "packaging", "ingredient". */
  entity: string;
  /** Where the list for this entity lives, e.g. "/packaging". */
  backHref: string;
  /** Title-case plural for the link, e.g. "Packaging", "Ingredients". */
  backLabel: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[50vh] px-4 text-center gap-1.5">
      <p className="text-sm font-medium">This {entity} doesn&rsquo;t exist.</p>
      <p className="text-sm text-muted-foreground">It may have been deleted.</p>
      <Link href={backHref} className="text-sm text-primary underline underline-offset-2 mt-2">
        Back to {backLabel}
      </Link>
    </div>
  );
}
