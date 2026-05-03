"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { CavityPreview } from "@/components/shop/cavity-preview";
import {
  useAllSales,
  useCollections,
  useCurrencySymbol,
  usePackagingList,
  useProductCategoryMap,
  useShopProducts,
} from "@/lib/hooks";
import type { Packaging, Sale } from "@/types";

// ---------------------------------------------------------------------------
// Time windows — matches the Stats page so the two dashboards feel like
// siblings. A chocolatier who knows the "7 days / 30 days / 3 months …"
// pills from the production dashboard finds the same toolkit here.
// ---------------------------------------------------------------------------

type TimePreset = "7d" | "30d" | "3m" | "6m" | "12m" | "all" | "custom";
type Granularity = "month" | "week";
type Tooltip = { x: number; y: number; lines: string[] };

interface TrendWindow {
  recentFrom: Date;
  recentTo: Date;
  previousFrom: Date;
  previousTo: Date;
  description: string;
}

const TIME_PRESETS: { value: TimePreset; label: string; defaultGranularity: Granularity }[] = [
  { value: "7d",    label: "7 days",    defaultGranularity: "week" },
  { value: "30d",   label: "30 days",   defaultGranularity: "week" },
  { value: "3m",    label: "3 months",  defaultGranularity: "month" },
  { value: "6m",    label: "6 months",  defaultGranularity: "month" },
  { value: "12m",   label: "12 months", defaultGranularity: "month" },
  { value: "all",   label: "All time",  defaultGranularity: "month" },
  { value: "custom",label: "Custom…",   defaultGranularity: "month" },
];

// Stable palette re-used by both the chart and the collection leaderboard so
// the viewer can read across them without decoding a legend twice.
const COLLECTION_COLORS = [
  "#78350f", "#c2410c", "#b45309", "#15803d", "#1d4ed8",
  "#7c3aed", "#be123c", "#0f766e", "#a16207", "#9f1239",
];

function computeTrendWindow(preset: TimePreset, customStart: string, customEnd: string): TrendWindow {
  const now = new Date();
  if (preset === "7d") {
    const recentFrom = new Date(now.getTime() - 6 * 86400000);
    recentFrom.setHours(0, 0, 0, 0);
    const previousTo = new Date(recentFrom.getTime() - 1);
    const previousFrom = new Date(previousTo.getTime() - 6 * 86400000);
    previousFrom.setHours(0, 0, 0, 0);
    return { recentFrom, recentTo: now, previousFrom, previousTo, description: "vs previous 7 days" };
  }
  if (preset === "30d") {
    const recentFrom = new Date(now.getTime() - 29 * 86400000);
    recentFrom.setHours(0, 0, 0, 0);
    const previousTo = new Date(recentFrom.getTime() - 1);
    const previousFrom = new Date(previousTo.getTime() - 29 * 86400000);
    previousFrom.setHours(0, 0, 0, 0);
    return { recentFrom, recentTo: now, previousFrom, previousTo, description: "vs previous 30 days" };
  }
  if (preset === "3m") {
    const recentFrom = new Date(now.getFullYear(), now.getMonth() - 3, 1);
    const previousFrom = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const previousTo = new Date(recentFrom.getTime() - 1);
    return { recentFrom, recentTo: now, previousFrom, previousTo, description: "vs previous 3 months" };
  }
  if (preset === "6m") {
    const recentFrom = new Date(now.getFullYear(), now.getMonth() - 6, 1);
    const previousFrom = new Date(now.getFullYear(), now.getMonth() - 12, 1);
    const previousTo = new Date(recentFrom.getTime() - 1);
    return { recentFrom, recentTo: now, previousFrom, previousTo, description: "vs previous 6 months" };
  }
  if (preset === "custom" && customStart && customEnd) {
    const recentFrom = new Date(customStart);
    const recentTo = new Date(customEnd + "T23:59:59.999");
    const duration = recentTo.getTime() - recentFrom.getTime();
    const previousTo = new Date(recentFrom.getTime() - 1);
    const previousFrom = new Date(previousTo.getTime() - duration);
    const days = Math.round(duration / 86400000);
    return { recentFrom, recentTo, previousFrom, previousTo, description: `vs previous ${days} days` };
  }
  const recentFrom = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const previousFrom = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const previousTo = new Date(recentFrom.getTime() - 1);
  return { recentFrom, recentTo: now, previousFrom, previousTo, description: "vs previous 6 months" };
}

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date.getTime());
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekKey(date: Date): string {
  return getWeekStart(date).toISOString().slice(0, 10);
}

function getPeriodKey(date: Date, granularity: Granularity): string {
  return granularity === "month" ? getMonthKey(date) : getWeekKey(date);
}

function generateChartPeriods(from: Date, to: Date, granularity: Granularity): { key: string; label: string }[] {
  const periods: { key: string; label: string }[] = [];
  const spanMultipleYears = from.getFullYear() !== to.getFullYear();
  if (granularity === "month") {
    const cur = new Date(from.getFullYear(), from.getMonth(), 1);
    const end = new Date(to.getFullYear(), to.getMonth(), 1);
    while (cur <= end) {
      periods.push({
        key: getMonthKey(cur),
        label: cur.toLocaleString("default", {
          month: "short",
          ...(spanMultipleYears ? { year: "2-digit" } : {}),
        }),
      });
      cur.setMonth(cur.getMonth() + 1);
    }
  } else {
    const cur = getWeekStart(from);
    while (cur <= to) {
      periods.push({
        key: cur.toISOString().slice(0, 10),
        label: cur.toLocaleString("default", { month: "short", day: "numeric" }),
      });
      cur.setDate(cur.getDate() + 7);
    }
  }
  return periods;
}

type Trend = { label: string; className: string };
function getTrend(recent: number, previous: number): Trend {
  if (recent === 0 && previous === 0) return { label: "—", className: "text-muted-foreground" };
  if (recent === 0 && previous > 0) return { label: "Dormant", className: "text-status-alert font-medium" };
  if (recent > 0 && previous === 0) return { label: "New", className: "text-emerald-600 font-medium" };
  const ratio = recent / previous;
  if (ratio >= 1.3) return { label: "↑ Rising", className: "text-emerald-600 font-medium" };
  if (ratio <= 0.7) return { label: "↓ Easing", className: "text-status-warn font-medium" };
  return { label: "→ Steady", className: "text-muted-foreground" };
}

function countFilled(cells: readonly (string | null)[]): number {
  let n = 0;
  for (const c of cells) if (c) n++;
  return n;
}

function formatMoney(n: number, sym: string): string {
  return `${sym}${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatShortMoney(n: number, sym: string): string {
  if (Math.abs(n) >= 1000) return `${sym}${(n / 1000).toFixed(1)}k`;
  return `${sym}${Math.round(n)}`;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function ShopInsightsPage() {
  const sales = useAllSales();
  const collections = useCollections();
  const packagings = usePackagingList(true);
  const { products: shopProducts, viewById: productInfoById } = useShopProducts();
  const productCategoryMap = useProductCategoryMap();
  const sym = useCurrencySymbol();

  // Identify which product IDs are bars. We treat "bar" as a reserved category
  // name — same convention the production wizard uses when deciding whether
  // to emit a Package step. Everything else is counted as a bonbon.
  const barProductIds = useMemo(() => {
    const ids = new Set<string>();
    for (const p of shopProducts) {
      if (!p.id) continue;
      const cat = p.productCategoryId ? productCategoryMap.get(p.productCategoryId) : undefined;
      if (cat?.name?.toLowerCase() === "bar") ids.add(p.id);
    }
    return ids;
  }, [shopProducts, productCategoryMap]);

  const isBar = (productId: string | null | undefined): boolean =>
    !!productId && barProductIds.has(productId);

  const [timePreset, setTimePreset] = useState<TimePreset>("3m");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [collectionFilter, setCollectionFilter] = useState<string>("");
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  function handlePresetChange(preset: TimePreset) {
    setTimePreset(preset);
    if (preset !== "custom") {
      const p = TIME_PRESETS.find((t) => t.value === preset);
      if (p) setGranularity(p.defaultGranularity);
    }
  }

  const collectionMap = useMemo(() => new Map(collections.map((c) => [c.id!, c])), [collections]);
  const packagingMap = useMemo(() => new Map(packagings.map((p) => [p.id!, p])), [packagings]);
  const productMap = useMemo(() => new Map(shopProducts.map((p) => [p.id!, p])), [shopProducts]);

  const soldSales = useMemo(
    () => sales.filter((s): s is Sale & { soldAt: Date } => s.status === "sold" && !!s.soldAt),
    [sales],
  );

  const timeBounds = useMemo((): { from: Date; to: Date } => {
    const now = new Date();
    if (timePreset === "custom") {
      const from = customStart ? new Date(customStart) : new Date(0);
      const to = customEnd ? new Date(customEnd + "T23:59:59.999") : now;
      return { from, to };
    }
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    if (timePreset === "7d")  return { from: new Date(today.getTime() - 6 * 86400000), to: now };
    if (timePreset === "30d") return { from: new Date(today.getTime() - 29 * 86400000), to: now };
    if (timePreset === "3m")  return { from: new Date(now.getFullYear(), now.getMonth() - 3, 1), to: now };
    if (timePreset === "6m")  return { from: new Date(now.getFullYear(), now.getMonth() - 6, 1), to: now };
    if (timePreset === "12m") return { from: new Date(now.getFullYear(), now.getMonth() - 11, 1), to: now };
    return { from: new Date(0), to: now };
  }, [timePreset, customStart, customEnd]);

  const trendWindow = useMemo(
    () => computeTrendWindow(timePreset, customStart, customEnd),
    [timePreset, customStart, customEnd],
  );

  const filteredSales = useMemo(() => {
    return soldSales.filter((s) => {
      const t = new Date(s.soldAt).getTime();
      if (t < timeBounds.from.getTime() || t > timeBounds.to.getTime()) return false;
      if (collectionFilter && s.collectionId !== collectionFilter) return false;
      return true;
    });
  }, [soldSales, timeBounds, collectionFilter]);

  // ---- KPIs ----
  // Cell counts split by product category: "bonbons" are non-bar products,
  // "bars" are bar-category products. A mixed-content sale contributes to both
  // counts (and to box-count once). In practice every sale is single-category
  // given the production flow, but the split keeps the page honest.
  const kpis = useMemo(() => {
    let revenue = 0;
    let bonbons = 0;
    let bars = 0;
    for (const s of filteredSales) {
      revenue += s.price;
      for (const c of s.cells) {
        if (!c) continue;
        if (barProductIds.has(c)) bars++;
        else bonbons++;
      }
    }
    const boxes = filteredSales.length;
    return {
      boxes,
      revenue,
      bonbons,
      bars,
      avgBox: boxes > 0 ? revenue / boxes : null,
      avgBonbonsPerBox: boxes > 0 ? bonbons / boxes : null,
    };
  }, [filteredSales, barProductIds]);

  // ---- Chart periods (clamped to data on "all") ----
  const chartPeriods = useMemo(() => {
    let from = timeBounds.from;
    const to = timeBounds.to;
    if (timePreset === "all" && filteredSales.length > 0) {
      const earliest = filteredSales.reduce(
        (min, s) => {
          const t = new Date(s.soldAt).getTime();
          return t < min ? t : min;
        },
        new Date(filteredSales[0].soldAt).getTime(),
      );
      const earliestDate = new Date(earliest);
      from = granularity === "month"
        ? new Date(earliestDate.getFullYear(), earliestDate.getMonth(), 1)
        : getWeekStart(earliestDate);
    }
    return generateChartPeriods(from, to, granularity);
  }, [timeBounds, timePreset, filteredSales, granularity]);

  // ---- Collection colour list (ordered by revenue in window) ----
  const collectionColorList = useMemo(() => {
    const byCollection = new Map<string, { name: string; revenue: number }>();
    for (const s of filteredSales) {
      const name = collectionMap.get(s.collectionId)?.name ?? "Unknown";
      const ex = byCollection.get(s.collectionId);
      if (ex) ex.revenue += s.price;
      else byCollection.set(s.collectionId, { name, revenue: s.price });
    }
    return [...byCollection.entries()]
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .map(([id, { name, revenue }], i) => ({
        id,
        name,
        revenue,
        color: COLLECTION_COLORS[i % COLLECTION_COLORS.length],
      }));
  }, [filteredSales, collectionMap]);

  const collectionColorById = useMemo(
    () => new Map(collectionColorList.map((r) => [r.id, r.color])),
    [collectionColorList],
  );

  // ---- Chart data: revenue per period, stacked by collection ----
  const chartData = useMemo(() => {
    const byPeriod = new Map<string, { byCollection: Map<string, number>; boxes: number }>();
    for (const s of filteredSales) {
      const key = getPeriodKey(new Date(s.soldAt), granularity);
      if (!byPeriod.has(key)) byPeriod.set(key, { byCollection: new Map(), boxes: 0 });
      const bucket = byPeriod.get(key)!;
      bucket.byCollection.set(
        s.collectionId,
        (bucket.byCollection.get(s.collectionId) ?? 0) + s.price,
      );
      bucket.boxes++;
    }
    return chartPeriods.map((p) => {
      const bucket = byPeriod.get(p.key);
      const byCollection = bucket?.byCollection ?? new Map<string, number>();
      const total = [...byCollection.values()].reduce((s, v) => s + v, 0);
      return { ...p, byCollection, total, boxes: bucket?.boxes ?? 0 };
    });
  }, [filteredSales, chartPeriods, granularity]);

  const maxPeriodRevenue = Math.max(...chartData.map((d) => d.total), 1);

  // ---- Product leaderboards (split by category) ----
  // Single pass over sales builds two maps — `bonbons` and `bars` — so the
  // page can render separate rankings without double-iterating.
  const { bonbonLeaderboard, barLeaderboard } = useMemo(() => {
    type Row = { id: string; name: string; units: number; recent: number; previous: number };
    const bonbonMap = new Map<string, Row>();
    const barMap = new Map<string, Row>();

    function getOrCreate(map: Map<string, Row>, productId: string): Row {
      if (!map.has(productId)) {
        const name = productMap.get(productId)?.name ?? productInfoById.get(productId)?.name ?? "Unknown";
        map.set(productId, { id: productId, name, units: 0, recent: 0, previous: 0 });
      }
      return map.get(productId)!;
    }

    const tw = trendWindow;
    const baseSales = soldSales.filter(
      (s) => !collectionFilter || s.collectionId === collectionFilter,
    );

    for (const s of baseSales) {
      const t = new Date(s.soldAt).getTime();
      const inWindow = t >= timeBounds.from.getTime() && t <= timeBounds.to.getTime();
      const inRecent = t >= tw.recentFrom.getTime() && t <= tw.recentTo.getTime();
      const inPrevious = t >= tw.previousFrom.getTime() && t <= tw.previousTo.getTime();
      if (!inWindow && !inRecent && !inPrevious) continue;

      for (const cell of s.cells) {
        if (!cell) continue;
        const map = barProductIds.has(cell) ? barMap : bonbonMap;
        const row = getOrCreate(map, cell);
        if (inWindow) row.units++;
        if (inRecent) row.recent++;
        if (inPrevious) row.previous++;
      }
    }

    const asSorted = (m: Map<string, Row>) =>
      [...m.values()].filter((r) => r.units > 0).sort((a, b) => b.units - a.units);

    return {
      bonbonLeaderboard: asSorted(bonbonMap),
      barLeaderboard: asSorted(barMap),
    };
  }, [soldSales, collectionFilter, timeBounds, trendWindow, productMap, productInfoById, barProductIds]);

  const topBonbon = bonbonLeaderboard[0] ?? null;
  const maxBonbonUnits = bonbonLeaderboard[0]?.units ?? 1;
  const topBar = barLeaderboard[0] ?? null;
  const maxBarUnits = barLeaderboard[0]?.units ?? 1;

  // ---- Best-selling box sizes (packagings) ----
  const packagingLeaderboard = useMemo(() => {
    type Row = {
      id: string;
      packaging: Packaging | undefined;
      boxes: number;
      revenue: number;
      bonbons: number;
      recent: number;
      previous: number;
    };
    const map = new Map<string, Row>();
    function getOrCreate(packagingId: string): Row {
      if (!map.has(packagingId)) {
        map.set(packagingId, {
          id: packagingId,
          packaging: packagingMap.get(packagingId),
          boxes: 0,
          revenue: 0,
          bonbons: 0,
          recent: 0,
          previous: 0,
        });
      }
      return map.get(packagingId)!;
    }
    const tw = trendWindow;
    const baseSales = soldSales.filter(
      (s) => !collectionFilter || s.collectionId === collectionFilter,
    );
    for (const s of baseSales) {
      const t = new Date(s.soldAt).getTime();
      if (t >= timeBounds.from.getTime() && t <= timeBounds.to.getTime()) {
        const row = getOrCreate(s.packagingId);
        row.boxes++;
        row.revenue += s.price;
        row.bonbons += countFilled(s.cells);
      }
      if (t >= tw.recentFrom.getTime() && t <= tw.recentTo.getTime()) getOrCreate(s.packagingId).recent++;
      if (t >= tw.previousFrom.getTime() && t <= tw.previousTo.getTime()) getOrCreate(s.packagingId).previous++;
    }
    return [...map.values()]
      .filter((r) => r.boxes > 0)
      .sort((a, b) => b.boxes - a.boxes);
  }, [soldSales, collectionFilter, timeBounds, trendWindow, packagingMap]);

  const maxPackagingBoxes = packagingLeaderboard[0]?.boxes ?? 1;

  // ---- Best-selling collections ----
  // Intentionally ignores the collection filter — a single-collection view
  // would make a one-row "collections by revenue" list, which is noise.
  const collectionLeaderboard = useMemo(() => {
    type Row = {
      id: string;
      name: string;
      boxes: number;
      revenue: number;
      recent: number;
      previous: number;
    };
    const map = new Map<string, Row>();
    function getOrCreate(collectionId: string): Row {
      if (!map.has(collectionId)) {
        map.set(collectionId, {
          id: collectionId,
          name: collectionMap.get(collectionId)?.name ?? "Unknown",
          boxes: 0,
          revenue: 0,
          recent: 0,
          previous: 0,
        });
      }
      return map.get(collectionId)!;
    }
    const tw = trendWindow;
    for (const s of soldSales) {
      const t = new Date(s.soldAt).getTime();
      if (t >= timeBounds.from.getTime() && t <= timeBounds.to.getTime()) {
        const row = getOrCreate(s.collectionId);
        row.boxes++;
        row.revenue += s.price;
      }
      if (t >= tw.recentFrom.getTime() && t <= tw.recentTo.getTime()) getOrCreate(s.collectionId).recent++;
      if (t >= tw.previousFrom.getTime() && t <= tw.previousTo.getTime()) getOrCreate(s.collectionId).previous++;
    }
    return [...map.values()]
      .filter((r) => r.boxes > 0)
      .sort((a, b) => b.revenue - a.revenue);
  }, [soldSales, timeBounds, trendWindow, collectionMap]);

  const maxCollectionRevenue = collectionLeaderboard[0]?.revenue ?? 1;

  const hasAnySales = soldSales.length > 0;
  const hasWindowData = filteredSales.length > 0;
  const barWidth = granularity === "week" ? "20px" : "28px";

  return (
    <div>
      {tooltip && (
        <div
          className="fixed z-50 pointer-events-none bg-stone-900 text-white text-xs px-2 py-1.5 rounded shadow-lg whitespace-nowrap"
          style={{ left: tooltip.x + 10, top: tooltip.y - 36 }}
        >
          {tooltip.lines.map((line, i) => (
            <div key={i} className={i === 0 ? "font-medium" : "text-white/70"}>{line}</div>
          ))}
        </div>
      )}
      <PageHeader
        title="Shop Insights"
        description="Best-selling bonbons, bars, box sizes, and revenue trends from the Shop counter."
      />

      <div className="px-4 pb-10 space-y-6">
        {/* Filters */}
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-1.5">
            {TIME_PRESETS.map((p) => (
              <button
                key={p.value}
                onClick={() => handlePresetChange(p.value)}
                className={`px-3 py-1 text-xs rounded-full border transition-colors ${
                  timePreset === p.value
                    ? "bg-stone-800 text-white border-stone-800"
                    : "bg-transparent text-stone-600 border-stone-300 hover:bg-stone-100 hover:border-stone-400"
                }`}
                data-testid={`shop-insights-preset-${p.value}`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {timePreset === "custom" && (
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-muted-foreground">From</span>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="text-sm border border-border rounded px-2 py-1 bg-background"
              />
              <span className="text-xs text-muted-foreground">to</span>
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="text-sm border border-border rounded px-2 py-1 bg-background"
              />
            </div>
          )}

          {collections.length > 1 && (
            <div className="flex flex-wrap gap-2">
              <select
                value={collectionFilter}
                onChange={(e) => setCollectionFilter(e.target.value)}
                className="text-sm border border-border rounded-md px-2 py-1.5 bg-background"
                data-testid="shop-insights-collection-filter"
              >
                <option value="">All collections</option>
                {collections.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {collectionFilter && (
                <button
                  onClick={() => setCollectionFilter("")}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {!hasAnySales && (
          <div className="text-center py-12 space-y-2">
            <p className="text-sm text-muted-foreground">No sold boxes yet.</p>
            <p className="text-xs text-muted-foreground">
              Sell a box from the Shop counter to start seeing insights here.
            </p>
          </div>
        )}

        {hasAnySales && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Revenue</p>
                <p className="text-2xl font-semibold tabular-nums mt-1">
                  {formatMoney(kpis.revenue, sym)}
                </p>
                <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                  {kpis.boxes.toLocaleString()} box{kpis.boxes === 1 ? "" : "es"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Bonbons · Bars</p>
                <p className="text-2xl font-semibold tabular-nums mt-1">
                  <span>{kpis.bonbons.toLocaleString()}</span>
                  <span className="text-muted-foreground font-normal"> · </span>
                  <span>{kpis.bars.toLocaleString()}</span>
                </p>
                <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                  {kpis.bars > 0
                    ? `${kpis.bonbons + kpis.bars} pieces sold`
                    : kpis.avgBonbonsPerBox !== null
                    ? `${kpis.avgBonbonsPerBox.toFixed(1)} per box`
                    : "—"}
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Avg. box</p>
                <p className="text-2xl font-semibold tabular-nums mt-1">
                  {kpis.avgBox !== null ? formatMoney(kpis.avgBox, sym) : "—"}
                </p>
                <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">In period</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">
                  {topBar ? "Top seller" : "Top bonbon"}
                </p>
                <p className="text-sm font-semibold mt-1 truncate" title={topBonbon?.name}>
                  {topBonbon?.name ?? topBar?.name ?? "—"}
                </p>
                {topBonbon && (
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {topBonbon.units.toLocaleString()} bonbons
                  </p>
                )}
                {topBar && (
                  <p className="text-[11px] text-muted-foreground tabular-nums truncate" title={topBar.name}>
                    {topBar.name} · {topBar.units.toLocaleString()} bars
                  </p>
                )}
              </div>
            </div>

            {/* Revenue chart */}
            {hasWindowData ? (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Revenue per {granularity === "month" ? "month" : "week"}
                  </p>
                  <div className="flex text-xs border border-border rounded overflow-hidden">
                    <button
                      onClick={() => setGranularity("month")}
                      className={`px-2.5 py-1 transition-colors ${
                        granularity === "month"
                          ? "bg-stone-800 text-white"
                          : "text-muted-foreground hover:bg-stone-100"
                      }`}
                    >
                      Monthly
                    </button>
                    <button
                      onClick={() => setGranularity("week")}
                      className={`px-2.5 py-1 border-l border-border transition-colors ${
                        granularity === "week"
                          ? "bg-stone-800 text-white"
                          : "text-muted-foreground hover:bg-stone-100"
                      }`}
                    >
                      Weekly
                    </button>
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <div className="flex items-end gap-1 min-w-max" style={{ height: "100px" }}>
                    {chartData.map((period) => (
                      <div
                        key={period.key}
                        className="flex flex-col items-center gap-1"
                        style={{ width: barWidth }}
                      >
                        <div className="w-full flex flex-col-reverse" style={{ height: "78px" }}>
                          {period.total > 0 ? (
                            collectionColorList.map((c) => {
                              const amount = period.byCollection.get(c.id) ?? 0;
                              if (amount <= 0) return null;
                              const h = Math.max(Math.round((amount / maxPeriodRevenue) * 78), 2);
                              return (
                                <div
                                  key={c.id}
                                  style={{
                                    height: `${h}px`,
                                    backgroundColor: c.color,
                                    width: "100%",
                                  }}
                                  onMouseEnter={(e) =>
                                    setTooltip({
                                      x: e.clientX,
                                      y: e.clientY,
                                      lines: [
                                        `${period.label} · ${formatMoney(period.total, sym)}`,
                                        `${c.name}: ${formatMoney(amount, sym)}`,
                                        `${period.boxes} box${period.boxes === 1 ? "" : "es"}`,
                                      ],
                                    })
                                  }
                                  onMouseMove={(e) =>
                                    setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
                                  }
                                  onMouseLeave={() => setTooltip(null)}
                                />
                              );
                            })
                          ) : (
                            <div className="w-full" style={{ height: "4px" }} />
                          )}
                        </div>
                        <span className="text-[9px] text-muted-foreground/70 leading-none">{period.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {collectionColorList.length > 1 && (
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3 pt-3 border-t border-border/40">
                    {collectionColorList.map((c) => (
                      <div
                        key={c.id}
                        className="flex items-center gap-1.5 cursor-default"
                        onMouseEnter={(e) =>
                          setTooltip({
                            x: e.clientX,
                            y: e.clientY,
                            lines: [c.name, `${formatMoney(c.revenue, sym)} in period`],
                          })
                        }
                        onMouseMove={(e) =>
                          setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
                        }
                        onMouseLeave={() => setTooltip(null)}
                      >
                        <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c.color }} />
                        <span className="text-[11px] text-muted-foreground truncate max-w-[10rem]">{c.name}</span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-4 mt-3 text-[10px] text-muted-foreground/70 tabular-nums">
                  <span>max&thinsp;·&thinsp;{formatShortMoney(maxPeriodRevenue, sym)}</span>
                  <span>total&thinsp;·&thinsp;{formatMoney(kpis.revenue, sym)}</span>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-8 text-center">
                <p className="text-xs text-muted-foreground">No sales in the selected window.</p>
              </div>
            )}

            {/* Best-selling bonbons */}
            {bonbonLeaderboard.length > 0 && (
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Best-selling bonbons
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Units across every sold box · trend {trendWindow.description}
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                    {bonbonLeaderboard.length} product{bonbonLeaderboard.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="divide-y divide-border/40" data-testid="shop-insights-bonbon-list">
                  {bonbonLeaderboard.slice(0, 10).map((row, idx) => {
                    const trend = getTrend(row.recent, row.previous);
                    const info = productInfoById.get(row.id);
                    const share = row.units / maxBonbonUnits;
                    return (
                      <li key={row.id} className="px-4 py-3 flex items-center gap-3">
                        <span className="shrink-0 w-5 text-[11px] font-mono tabular-nums text-muted-foreground">
                          {idx + 1}
                        </span>
                        <span
                          className="shrink-0 w-5 h-5 rounded-full border border-black/10"
                          style={{ backgroundColor: info?.color ?? "#8b5e3c" }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{row.name}</p>
                          <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-foreground/80"
                              style={{ width: `${Math.max(share * 100, 2)}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold tabular-nums">
                            {row.units.toLocaleString()}
                          </p>
                          <p className="text-[10px] text-muted-foreground">units</p>
                        </div>
                        <div className="w-20 text-right shrink-0">
                          <span className={`text-xs ${trend.className}`}>{trend.label}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
                {bonbonLeaderboard.length > 10 && (
                  <p className="px-4 py-2 text-[11px] text-muted-foreground border-t border-border/40 bg-muted/30">
                    Showing top 10 of {bonbonLeaderboard.length}
                  </p>
                )}
              </div>
            )}

            {/* Best-selling bars — only shown when there's bar data. Mirrors
                the bonbons list but with a subtle bar-shaped swatch to make
                the category difference visible at a glance. */}
            {barLeaderboard.length > 0 && (
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border/50 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                      Best-selling bars
                    </p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Individually wrapped pieces sold · trend {trendWindow.description}
                    </p>
                  </div>
                  <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
                    {barLeaderboard.length} bar{barLeaderboard.length === 1 ? "" : "s"}
                  </span>
                </div>
                <ul className="divide-y divide-border/40" data-testid="shop-insights-bar-list">
                  {barLeaderboard.slice(0, 10).map((row, idx) => {
                    const trend = getTrend(row.recent, row.previous);
                    const info = productInfoById.get(row.id);
                    const share = row.units / maxBarUnits;
                    return (
                      <li key={row.id} className="px-4 py-3 flex items-center gap-3">
                        <span className="shrink-0 w-5 text-[11px] font-mono tabular-nums text-muted-foreground">
                          {idx + 1}
                        </span>
                        <span
                          className="shrink-0 w-2.5 h-6 rounded-sm border border-black/10"
                          style={{ backgroundColor: info?.color ?? "#4a3324" }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{row.name}</p>
                          <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-foreground/80"
                              style={{ width: `${Math.max(share * 100, 2)}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold tabular-nums">
                            {row.units.toLocaleString()}
                          </p>
                          <p className="text-[10px] text-muted-foreground">bars</p>
                        </div>
                        <div className="w-20 text-right shrink-0">
                          <span className={`text-xs ${trend.className}`}>{trend.label}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Best-selling box sizes */}
            {packagingLeaderboard.length > 0 && (
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border/50">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Best-selling box sizes
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Packaging units sold · trend {trendWindow.description}
                  </p>
                </div>
                <ul className="divide-y divide-border/40" data-testid="shop-insights-packaging-list">
                  {packagingLeaderboard.map((row, idx) => {
                    const trend = getTrend(row.recent, row.previous);
                    const pkg = row.packaging;
                    const name = pkg?.name ?? "Unknown packaging";
                    const share = row.boxes / maxPackagingBoxes;
                    const avg = row.boxes > 0 ? row.revenue / row.boxes : 0;
                    const emptyCells = pkg ? Array<null>(pkg.capacity).fill(null) : [];
                    return (
                      <li key={row.id} className="px-4 py-3 flex items-center gap-3">
                        <span className="shrink-0 w-5 text-[11px] font-mono tabular-nums text-muted-foreground">
                          {idx + 1}
                        </span>
                        {pkg && (
                          <div className="shrink-0" aria-hidden>
                            <CavityPreview
                              cells={emptyCells}
                              packaging={pkg}
                              productInfoById={productInfoById}
                              cellSize={8}
                              gap={1}
                              pad={2}
                            />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{name}</p>
                          <p className="text-[11px] text-muted-foreground tabular-nums">
                            {pkg ? `${pkg.capacity} cavit${pkg.capacity === 1 ? "y" : "ies"}` : "—"}
                            {" · "}
                            avg {formatMoney(avg, sym)}
                          </p>
                          <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-foreground/80"
                              style={{ width: `${Math.max(share * 100, 2)}%` }}
                            />
                          </div>
                        </div>
                        <div className="text-right shrink-0 space-y-0.5">
                          <p className="text-sm font-semibold tabular-nums">
                            {row.boxes.toLocaleString()}
                          </p>
                          <p className="text-[10px] text-muted-foreground tabular-nums">
                            {formatMoney(row.revenue, sym)}
                          </p>
                        </div>
                        <div className="w-20 text-right shrink-0">
                          <span className={`text-xs ${trend.className}`}>{trend.label}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Best-selling collections */}
            {collectionLeaderboard.length > 1 && (
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border/50">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Collections by revenue
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Revenue share across all collections · trend {trendWindow.description}
                  </p>
                </div>
                <ul className="divide-y divide-border/40" data-testid="shop-insights-collection-list">
                  {collectionLeaderboard.map((row, idx) => {
                    const trend = getTrend(row.recent, row.previous);
                    const share = row.revenue / maxCollectionRevenue;
                    const avgBox = row.boxes > 0 ? row.revenue / row.boxes : 0;
                    const color = collectionColorById.get(row.id) ?? "#9ca3af";
                    return (
                      <li key={row.id} className="px-4 py-3 flex items-center gap-3">
                        <span className="shrink-0 w-5 text-[11px] font-mono tabular-nums text-muted-foreground">
                          {idx + 1}
                        </span>
                        <span
                          className="shrink-0 w-2.5 h-8 rounded-sm"
                          style={{ backgroundColor: color }}
                          aria-hidden
                        />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{row.name}</p>
                          <p className="text-[11px] text-muted-foreground tabular-nums">
                            {row.boxes.toLocaleString()} box{row.boxes === 1 ? "" : "es"}
                            {" · "}
                            avg {formatMoney(avgBox, sym)}
                          </p>
                          <div className="mt-1 h-1 w-full rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full"
                              style={{
                                width: `${Math.max(share * 100, 2)}%`,
                                backgroundColor: color,
                              }}
                            />
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-semibold tabular-nums">
                            {formatMoney(row.revenue, sym)}
                          </p>
                          <p className="text-[10px] text-muted-foreground">revenue</p>
                        </div>
                        <div className="w-20 text-right shrink-0">
                          <span className={`text-xs ${trend.className}`}>{trend.label}</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
