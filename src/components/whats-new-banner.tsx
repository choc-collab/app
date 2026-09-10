"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { setLastSeenVersion, useLastSeenVersion, recalculateAllProductCosts } from "@/lib/hooks";
import { APP_VERSION, CHANGELOG_URL, COST_CORRECTION_VERSION, ORDERS_RELEASE_VERSION, PANTRY_AUTOSAVE_VERSION, LOG_RELEASE_VERSION, crossesVersion, decideBanner } from "@/lib/version";

/**
 * Detect "has the user authored any real content yet" as a proxy for
 * "this is not a truly fresh install". Ingredients + moulds are excluded
 * because the seed loader populates them on first boot.
 */
function useHasUserData(): boolean | undefined {
  return useLiveQuery(async () => {
    const [products, fillings, plans] = await Promise.all([
      db.products.count(),
      db.fillings.count(),
      db.productionPlans.count(),
    ]);
    return products + fillings + plans > 0;
  }, []);
}

const changelogLink = (
  <a
    href={CHANGELOG_URL}
    target="_blank"
    rel="noreferrer"
    className="underline underline-offset-2 decoration-primary-foreground/50 hover:decoration-primary-foreground"
  >
    Read the changelog
  </a>
);

export function WhatsNewBanner() {
  const lastSeenVersion = useLastSeenVersion();
  const hasUserData = useHasUserData();
  const [dismissed, setDismissed] = useState(false);
  const [recalcState, setRecalcState] = useState<"idle" | "running" | "done">("idle");
  const [recalcCount, setRecalcCount] = useState(0);

  const decision = decideBanner({
    currentVersion: APP_VERSION,
    lastSeenVersion,
    hasUserData,
  });

  useEffect(() => {
    if (decision.kind === "fresh-install") {
      void setLastSeenVersion(APP_VERSION);
    }
  }, [decision.kind]);

  if (decision.kind !== "show" || dismissed) return null;

  // Only prompt the one-time cost recalculation when this upgrade actually
  // crosses the release that shipped the filling/shell weight correction.
  // Unrelated future upgrades fall back to the generic changelog message.
  const showCorrection = crossesVersion(decision.from, decision.to, COST_CORRECTION_VERSION);
  const showOrders = crossesVersion(decision.from, decision.to, ORDERS_RELEASE_VERSION);
  const showPantryAutosave = crossesVersion(decision.from, decision.to, PANTRY_AUTOSAVE_VERSION);
  const showLog = crossesVersion(decision.from, decision.to, LOG_RELEASE_VERSION);

  async function dismiss() {
    setDismissed(true);
    await setLastSeenVersion(APP_VERSION);
  }

  async function runRecalc() {
    setRecalcState("running");
    try {
      const n = await recalculateAllProductCosts();
      setRecalcCount(n);
      setRecalcState("done");
    } catch {
      setRecalcState("idle");
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="whats-new-banner"
      className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-2.5 text-xs flex items-start gap-3"
    >
      <div className="flex-1 leading-relaxed">
        <strong className="font-semibold">What&rsquo;s new in v{decision.to}:</strong>{" "}
        {showCorrection && (
          <>
            we fixed a bug that overstated filling &amp; shell weights, so your product
            costs have changed.{" "}
            {recalcState === "done" ? (
              <span data-testid="whats-new-recalc-done">
                Recalculated {recalcCount} product{recalcCount === 1 ? "" : "s"}.{" "}
              </span>
            ) : (
              <>
                <button
                  type="button"
                  onClick={runRecalc}
                  disabled={recalcState === "running"}
                  data-testid="whats-new-recalc"
                  className="font-semibold underline underline-offset-2 decoration-primary-foreground/50 hover:decoration-primary-foreground disabled:opacity-60"
                >
                  {recalcState === "running" ? "Recalculating…" : "Recalculate all costs now"}
                </button>
                .{" "}
              </>
            )}
          </>
        )}
        {showOrders && (
          <>
            meet <Link href="/orders" className="font-semibold underline underline-offset-2 decoration-primary-foreground/50 hover:decoration-primary-foreground">Orders</Link>{" "}
            — capture corporate orders and events on a calendar, keep customers with their
            order history, and link orders to the production batches that fulfil them.{" "}
          </>
        )}
        {showPantryAutosave && (
          <>
            the Pantry saves as you type — the Edit pencil and Save button are gone from every
            detail page, so you change a value and it&rsquo;s stored. Costs, weights, allergens
            and what-uses-what moved to a panel on the right.{" "}
          </>
        )}
        {showLog && (
          <>
            meet the <Link href="/log" className="font-semibold underline underline-offset-2 decoration-primary-foreground/50 hover:decoration-primary-foreground">Log</Link>{" "}
            — a daily journal that already knows what you made, sold and captured each day
            (moulds coloured, boxes sold, orders added) and takes your own notes and workshop
            conditions alongside, as a list or a calendar.{" "}
          </>
        )}
        {changelogLink} for everything that&rsquo;s changed since{" "}
        {decision.from ? `v${decision.from}` : "your last visit"}.
      </div>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss what's new banner"
        className="shrink-0 p-1 -m-1 rounded hover:bg-primary-foreground/10 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
