"use client";

import { useEffect, useState } from "react";
import { useTodaySignals, useCurrencySymbol } from "@/lib/hooks";
import { StatTile } from "@/components/today/stat-tile";
import { UniversalSearch } from "@/components/today/universal-search";
import { AuditReminderFooter } from "@/components/today/audit-reminder-footer";
import { ToMakeList } from "@/components/today/to-make-list";
import { SellQuickGrid } from "@/components/today/sell-quick-grid";
import { InProgressTile } from "@/components/today/in-progress-tile";
import { ExperimentsBrewingTile } from "@/components/today/experiments-brewing-tile";

/** Locale-dependent date string deferred to client mount so server and
 *  client agree on the initial HTML (avoids a hydration mismatch warning). */
function useLocalDateString() {
  const [s, setS] = useState("");
  useEffect(() => {
    setS(new Date().toLocaleDateString(undefined, {
      weekday: "short", day: "numeric", month: "short",
    }));
  }, []);
  return s;
}

export default function TodayPage() {
  const signals = useTodaySignals();
  const currency = useCurrencySymbol();
  const dateStr = useLocalDateString();

  const lowStockPreview = signals.lowStockProducts[0];
  const lowStockDetail = lowStockPreview
    ? `Low: ${lowStockPreview.productName} · ${lowStockPreview.pieces} of ${lowStockPreview.threshold}`
    : undefined;

  const totalNeedsAttention =
    signals.pendingShoppingCount +
    signals.inProgressBatches +
    signals.lowStockProducts.length;

  const attentionPart = totalNeedsAttention > 0
    ? `${totalNeedsAttention} thing${totalNeedsAttention !== 1 ? "s" : ""} need${totalNeedsAttention === 1 ? "s" : ""} attention`
    : "Nothing pressing right now";
  const description = dateStr ? `${dateStr} · ${attentionPart}` : attentionPart;

  return (
    <div className="pb-24 sm:pb-8">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 px-4 pt-8 pb-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-display tracking-tight">Today</h1>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{description}</p>
        </div>
        <UniversalSearch />
      </div>

      <div className="px-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Shopping list"
          value={signals.pendingShoppingCount}
          sub={signals.pendingShoppingCount === 1 ? "item to order" : "items to order"}
          href="/shopping"
          cta="Review cart"
          empty={signals.pendingShoppingCount === 0}
        />
        <InProgressTile />
        <ExperimentsBrewingTile />
        <StatTile
          label="Week sales"
          value={`${currency}${formatRevenue(signals.weekRevenue)}`}
          sub={`${signals.weekBoxesSold} ${signals.weekBoxesSold === 1 ? "box" : "boxes"}`}
          detail={lowStockDetail}
          href="/shop"
          cta="See breakdown"
          empty={signals.weekBoxesSold === 0}
        />
      </div>

      <div className="px-4 mt-6 grid grid-cols-1 lg:grid-cols-2 gap-3">
        <ToMakeList />
        <SellQuickGrid />
      </div>

      <div className="px-4 mt-6">
        <AuditReminderFooter />
      </div>
    </div>
  );
}

function formatRevenue(value: number): string {
  if (value === 0) return "0";
  if (value < 1000) return value.toFixed(value < 10 ? 2 : 0);
  return `${(value / 1000).toFixed(1)}k`;
}
