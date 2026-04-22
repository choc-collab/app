"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { setLastSeenVersion, useLastSeenVersion } from "@/lib/hooks";
import { APP_VERSION, CHANGELOG_URL, decideBanner } from "@/lib/version";

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

export function WhatsNewBanner() {
  const lastSeenVersion = useLastSeenVersion();
  const hasUserData = useHasUserData();
  const [dismissed, setDismissed] = useState(false);

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

  async function dismiss() {
    setDismissed(true);
    await setLastSeenVersion(APP_VERSION);
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
        <a
          href={CHANGELOG_URL}
          target="_blank"
          rel="noreferrer"
          className="underline underline-offset-2 decoration-primary-foreground/50 hover:decoration-primary-foreground"
        >
          Read the changelog
        </a>{" "}
        for everything that&rsquo;s changed since{" "}
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
