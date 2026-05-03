"use client";

import { useEffect, useState } from "react";
import { useTodaySignals, useCurrencySymbol } from "@/lib/hooks";
import { StatTile } from "@/components/today/stat-tile";
import { QuickAddMenu } from "@/components/today/quick-add-menu";
import { AuditReminderFooter } from "@/components/today/audit-reminder-footer";
import { ToMakeList } from "@/components/today/to-make-list";
import { SellQuickGrid } from "@/components/today/sell-quick-grid";

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

  const expiringPreview = signals.expiring[0];
  const expiringDetail = expiringPreview
    ? expiringDetailLine(expiringPreview.productName, expiringPreview.daysLeft)
    : undefined;

  const lowStockPreview = signals.lowStockProducts[0];
  const lowStockDetail = lowStockPreview
    ? `Low: ${lowStockPreview.productName} · ${lowStockPreview.pieces} of ${lowStockPreview.threshold}`
    : undefined;

  const totalNeedsAttention =
    signals.pendingShoppingCount +
    signals.expiring.length +
    signals.inProgressBatches +
    signals.lowStockProducts.length;

  const attentionPart = totalNeedsAttention > 0
    ? `${totalNeedsAttention} thing${totalNeedsAttention !== 1 ? "s" : ""} need${totalNeedsAttention === 1 ? "s" : ""} attention`
    : "Nothing pressing right now";
  const description = dateStr ? `${dateStr} · ${attentionPart}` : attentionPart;

  return (
    <div className="pb-24 sm:pb-8">
      <div className="flex items-start justify-between gap-3 px-4 pt-8 pb-4">
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-display tracking-tight">Today</h1>
          <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{description}</p>
        </div>
        <QuickAddMenu />
      </div>

      <div className="px-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Shopping list"
          value={signals.pendingShoppingCount}
          sub={signals.pendingShoppingCount === 1 ? "item to order" : "items to order"}
          href="/shopping"
          cta="Review cart"
          dark={signals.pendingShoppingCount > 0}
          empty={signals.pendingShoppingCount === 0}
        />
        <StatTile
          label="Expiring ≤ 7d"
          value={signals.expiring.length}
          sub={expiringSubLine(signals.expiring.length)}
          detail={expiringDetail}
          href="/stock"
          cta="Use these"
          empty={signals.expiring.length === 0}
        />
        <StatTile
          label="In progress"
          value={signals.inProgressBatches}
          sub={signals.inProgressBatches === 1 ? "batch" : "batches"}
          href="/production"
          cta="Open board"
          empty={signals.inProgressBatches === 0}
        />
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

function expiringSubLine(count: number): string {
  if (count === 0) return "All fresh";
  return count === 1 ? "batch" : "batches";
}

function expiringDetailLine(productName: string, daysLeft: number): string {
  if (daysLeft < 0) return `${productName} · expired`;
  if (daysLeft === 0) return `${productName} · today`;
  return `${productName} · ${daysLeft}d left`;
}

function formatRevenue(value: number): string {
  if (value === 0) return "0";
  if (value < 1000) return value.toFixed(value < 10 ? 2 : 0);
  return `${(value / 1000).toFixed(1)}k`;
}
