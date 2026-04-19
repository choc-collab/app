"use client";

import { useState, useMemo } from "react";
import {
  useProductionPlans,
  useAllPlanProducts,
  useMouldsList,
  useProductsList,
  useCollections,
} from "@/lib/hooks";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import { PageHeader } from "@/components/page-header";
import type { CollectionProduct } from "@/types";

type ProductionEvent = {
  planId: string;
  productId: string;
  productName: string;
  productCount: number;   // actual yield (or planned if actualYield not set)
  plannedCount: number;  // quantity × cavities (always the calculated max)
  completedAt: Date;
  collectionIds: string[];
};

type ProductRow = {
  productId: string;
  name: string;
  total: number;
  totalPlanned: number;
  lastProduced?: Date;
  recent: number;
  previous: number;
  collectionIds: string[];
};

type TrendWindow = {
  recentFrom: Date;
  recentTo: Date;
  previousFrom: Date;
  previousTo: Date;
  description: string; // shown in leaderboard header
};

function computeTrendWindow(
  preset: TimePreset,
  customStart: string,
  customEnd: string
): TrendWindow {
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
  // "12m", "all", or custom without dates — use 6-month comparison
  const recentFrom = new Date(now.getFullYear(), now.getMonth() - 6, 1);
  const previousFrom = new Date(now.getFullYear(), now.getMonth() - 12, 1);
  const previousTo = new Date(recentFrom.getTime() - 1);
  return { recentFrom, recentTo: now, previousFrom, previousTo, description: "vs previous 6 months" };
}

type Trend = { label: string; className: string };
type TimePreset = "7d" | "30d" | "3m" | "6m" | "12m" | "all" | "custom";
type Granularity = "month" | "week";
type Tooltip = { x: number; y: number; lines: string[] };

function getTrend(recent: number, previous: number): Trend {
  if (recent === 0 && previous === 0) return { label: "—", className: "text-muted-foreground" };
  if (recent === 0 && previous > 0) return { label: "Dormant", className: "text-status-alert font-medium" };
  if (recent > 0 && previous === 0) return { label: "New", className: "text-emerald-600 font-medium" };
  const ratio = recent / previous;
  if (ratio >= 1.3) return { label: "↑ Rising", className: "text-emerald-600 font-medium" };
  if (ratio <= 0.7) return { label: "↓ Easing", className: "text-status-warn font-medium" };
  return { label: "→ Steady", className: "text-muted-foreground" };
}

const RECIPE_COLORS = [
  "#78350f", "#c2410c", "#b45309", "#15803d", "#1d4ed8",
  "#7c3aed", "#be123c", "#0f766e", "#a16207", "#9f1239",
];

function getMonthKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

function getWeekStart(date: Date): Date {
  const d = new Date(date.getTime());
  const day = d.getDay(); // 0=Sun
  const diff = day === 0 ? -6 : 1 - day; // adjust to Monday
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

function generateChartPeriods(
  from: Date,
  to: Date,
  granularity: Granularity
): { key: string; label: string }[] {
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

const TIME_PRESETS: { value: TimePreset; label: string; defaultGranularity: Granularity }[] = [
  { value: "7d",    label: "7 days",    defaultGranularity: "week" },
  { value: "30d",   label: "30 days",   defaultGranularity: "week" },
  { value: "3m",    label: "3 months",  defaultGranularity: "month" },
  { value: "6m",    label: "6 months",  defaultGranularity: "month" },
  { value: "12m",   label: "12 months", defaultGranularity: "month" },
  { value: "all",   label: "All time",  defaultGranularity: "month" },
  { value: "custom",label: "Custom…",   defaultGranularity: "month" },
];

export default function StatsPage() {
  const plans = useProductionPlans();
  const allPlanProducts = useAllPlanProducts();
  const moulds = useMouldsList(true);
  const products = useProductsList();
  const collections = useCollections();
  const allCollectionProducts: CollectionProduct[] =
    useLiveQuery(() => db.collectionProducts.toArray()) ?? [];

  const [timePreset, setTimePreset] = useState<TimePreset>("12m");
  const [customStart, setCustomStart] = useState<string>("");
  const [customEnd, setCustomEnd] = useState<string>("");
  const [granularity, setGranularity] = useState<Granularity>("month");
  const [collectionFilter, setCollectionFilter] = useState<string>("");
  const [productFilter, setProductFilter] = useState<string>("");
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  function handlePresetChange(preset: TimePreset) {
    setTimePreset(preset);
    if (preset !== "custom") {
      const p = TIME_PRESETS.find((t) => t.value === preset);
      if (p) setGranularity(p.defaultGranularity);
    }
  }

  // Build lookup maps
  const mouldMap = useMemo(() => new Map(moulds.map((m) => [m.id!, m])), [moulds]);
  const productMap = useMemo(() => new Map(products.map((r) => [r.id!, r])), [products]);
  const planMap = useMemo(
    () => new Map(plans.filter((p) => p.status === "done" && p.completedAt).map((p) => [p.id!, p])),
    [plans]
  );

  const productToCollectionIds = useMemo(() => {
    const m = new Map<string, string[]>();
    for (const cr of allCollectionProducts) {
      const arr = m.get(cr.productId) ?? [];
      arr.push(cr.collectionId);
      m.set(cr.productId, arr);
    }
    return m;
  }, [allCollectionProducts]);

  const allEvents = useMemo((): ProductionEvent[] => {
    return allPlanProducts
      .filter((pb) => planMap.has(pb.planId))
      .map((pb) => {
        const plan = planMap.get(pb.planId)!;
        const mould = mouldMap.get(pb.mouldId);
        const product = productMap.get(pb.productId);
        const plannedCount = pb.quantity * (mould?.numberOfCavities ?? 0);
        return {
          planId: pb.planId,
          productId: pb.productId,
          productName: product?.name ?? "Unknown product",
          productCount: pb.actualYield ?? plannedCount,
          plannedCount,
          completedAt: new Date(plan.completedAt!),
          collectionIds: productToCollectionIds.get(pb.productId) ?? [],
        };
      });
  }, [allPlanProducts, planMap, mouldMap, productMap, productToCollectionIds]);

  // Compute time bounds from preset
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
    return { from: new Date(0), to: now }; // "all"
  }, [timePreset, customStart, customEnd]);

  const trendWindow = useMemo(
    () => computeTrendWindow(timePreset, customStart, customEnd),
    [timePreset, customStart, customEnd]
  );

  // Apply time + collection + product filters
  const filteredEvents = useMemo(() => {
    return allEvents.filter((e) => {
      if (e.completedAt < timeBounds.from || e.completedAt > timeBounds.to) return false;
      if (collectionFilter && !e.collectionIds.includes(collectionFilter)) return false;
      if (productFilter && e.productId !== productFilter) return false;
      return true;
    });
  }, [allEvents, timeBounds, collectionFilter, productFilter]);

  // Products that appear in production history (for filter dropdown)
  const producedProducts = useMemo(() => {
    const byId = new Map<string, string>();
    for (const e of allEvents) {
      if (!byId.has(e.productId)) byId.set(e.productId, e.productName);
    }
    return [...byId.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allEvents]);

  // KPIs
  const kpis = useMemo(() => {
    const totalProducts = filteredEvents.reduce((s, e) => s + e.productCount, 0);
    const totalPlanned = filteredEvents.reduce((s, e) => s + e.plannedCount, 0);
    const totalWaste = totalPlanned - totalProducts;
    const yieldRate = totalPlanned > 0 ? (totalProducts / totalPlanned) * 100 : 100;
    const uniquePlans = new Set(filteredEvents.map((e) => e.planId)).size;
    const byProduct = new Map<string, { name: string; count: number }>();
    for (const e of filteredEvents) {
      const ex = byProduct.get(e.productId);
      if (ex) ex.count += e.productCount;
      else byProduct.set(e.productId, { name: e.productName, count: e.productCount });
    }
    const topProduct = [...byProduct.values()].sort((a, b) => b.count - a.count)[0] ?? null;
    return { totalProducts, totalPlanned, totalWaste, yieldRate, uniquePlans, topProduct, uniqueProducts: byProduct.size };
  }, [filteredEvents]);

  // Chart periods (clamped to actual data for "all" preset)
  const chartPeriods = useMemo(() => {
    let from = timeBounds.from;
    const to = timeBounds.to;
    if (timePreset === "all" && filteredEvents.length > 0) {
      const earliest = filteredEvents.reduce(
        (min, e) => (e.completedAt < min ? e.completedAt : min),
        filteredEvents[0].completedAt
      );
      from = granularity === "month"
        ? new Date(earliest.getFullYear(), earliest.getMonth(), 1)
        : getWeekStart(earliest);
    }
    return generateChartPeriods(from, to, granularity);
  }, [timeBounds, timePreset, filteredEvents, granularity]);

  // Product color list (stable ordering by total within period)
  const productColorList = useMemo(() => {
    const byProduct = new Map<string, { name: string; total: number }>();
    for (const e of filteredEvents) {
      const ex = byProduct.get(e.productId);
      if (ex) ex.total += e.productCount;
      else byProduct.set(e.productId, { name: e.productName, total: e.productCount });
    }
    return [...byProduct.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([id, { name, total }], i) => ({ id, name, total, color: RECIPE_COLORS[i % RECIPE_COLORS.length] }));
  }, [filteredEvents]);

  // Chart data buckets
  const chartData = useMemo(() => {
    const byPeriod = new Map<string, { actual: Map<string, number>; waste: number }>();
    for (const e of filteredEvents) {
      const key = getPeriodKey(e.completedAt, granularity);
      if (!byPeriod.has(key)) byPeriod.set(key, { actual: new Map(), waste: 0 });
      const bucket = byPeriod.get(key)!;
      bucket.actual.set(e.productId, (bucket.actual.get(e.productId) ?? 0) + e.productCount);
      bucket.waste += e.plannedCount - e.productCount;
    }
    return chartPeriods.map((p) => {
      const bucket = byPeriod.get(p.key);
      const byProduct = bucket?.actual ?? new Map<string, number>();
      const total = [...byProduct.values()].reduce((s, v) => s + v, 0);
      const waste = bucket?.waste ?? 0;
      return { ...p, byProduct, total, waste };
    });
  }, [filteredEvents, chartPeriods, granularity]);

  const maxPeriodCount = Math.max(...chartData.map((d) => d.total + d.waste), 1);

  // Product leaderboard — totals respect time filter; trend uses adaptive window
  const leaderboard = useMemo((): ProductRow[] => {
    const tw = trendWindow;
    const baseEvents = allEvents.filter(
      (e) =>
        (!collectionFilter || e.collectionIds.includes(collectionFilter)) &&
        (!productFilter || e.productId === productFilter)
    );

    const byProduct = new Map<string, ProductRow>();

    function getOrCreate(e: ProductionEvent): ProductRow {
      if (!byProduct.has(e.productId)) {
        byProduct.set(e.productId, {
          productId: e.productId,
          name: e.productName,
          total: 0,
          totalPlanned: 0,
          recent: 0,
          previous: 0,
          collectionIds: e.collectionIds,
        });
      }
      return byProduct.get(e.productId)!;
    }

    for (const e of baseEvents) {
      if (e.completedAt >= timeBounds.from && e.completedAt <= timeBounds.to) {
        const row = getOrCreate(e);
        row.total += e.productCount;
        row.totalPlanned += e.plannedCount;
        if (!row.lastProduced || e.completedAt > row.lastProduced) row.lastProduced = e.completedAt;
      }
      if (e.completedAt >= tw.recentFrom && e.completedAt <= tw.recentTo) {
        getOrCreate(e).recent += e.productCount;
      }
      if (e.completedAt >= tw.previousFrom && e.completedAt <= tw.previousTo) {
        getOrCreate(e).previous += e.productCount;
      }
    }

    return [...byProduct.values()]
      .filter((row) => row.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [allEvents, collectionFilter, productFilter, timeBounds, trendWindow]);

  const collectionMap = useMemo(
    () => new Map(collections.map((c) => [c.id!, c.name])),
    [collections]
  );

  const hasData = allEvents.length > 0;

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
      <PageHeader title="Production Stats" description="Historical output across batches, products, and collections." />

      <div className="px-4 pb-10 space-y-6">
        {/* Filters */}
        <div className="space-y-2.5">
          {/* Time preset pills */}
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
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Custom date range */}
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

          {/* Collection + Product filters */}
          {(collections.length > 0 || producedProducts.length > 0) && (
            <div className="flex flex-wrap gap-2">
              {collections.length > 0 && (
                <select
                  value={collectionFilter}
                  onChange={(e) => setCollectionFilter(e.target.value)}
                  className="text-sm border border-border rounded-md px-2 py-1.5 bg-background"
                >
                  <option value="">All collections</option>
                  {collections.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              )}
              {producedProducts.length > 0 && (
                <select
                  value={productFilter}
                  onChange={(e) => setProductFilter(e.target.value)}
                  className="text-sm border border-border rounded-md px-2 py-1.5 bg-background max-w-[14rem]"
                >
                  <option value="">All products</option>
                  {producedProducts.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              )}
              {(collectionFilter || productFilter) && (
                <button
                  onClick={() => { setCollectionFilter(""); setProductFilter(""); }}
                  className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
                >
                  Clear
                </button>
              )}
            </div>
          )}
        </div>

        {/* Empty state */}
        {!hasData && (
          <div className="text-center py-12 space-y-2">
            <p className="text-sm text-muted-foreground">No completed production batches yet.</p>
            <p className="text-xs text-muted-foreground">
              Mark a production plan as done to start seeing stats here.
            </p>
          </div>
        )}

        {hasData && (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">To stock</p>
                <p className="text-2xl font-semibold tabular-nums mt-1">
                  {kpis.totalProducts.toLocaleString()}
                </p>
                {kpis.totalWaste > 0 && (
                  <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                    of {kpis.totalPlanned.toLocaleString()} planned
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Yield</p>
                <p className={`text-2xl font-semibold tabular-nums mt-1 ${
                  kpis.yieldRate >= 98 ? "text-status-ok" : kpis.yieldRate >= 90 ? "" : "text-status-warn"
                }`}>
                  {kpis.totalPlanned > 0 ? `${kpis.yieldRate.toFixed(1)}%` : "—"}
                </p>
                {kpis.totalWaste > 0 && (
                  <p className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                    {kpis.totalWaste.toLocaleString()} set aside
                  </p>
                )}
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Batches</p>
                <p className="text-2xl font-semibold tabular-nums mt-1">{kpis.uniquePlans}</p>
              </div>
              <div className="rounded-lg border border-border bg-card p-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wide">Top product</p>
                <p className="text-sm font-semibold mt-1 truncate" title={kpis.topProduct?.name}>
                  {kpis.topProduct?.name ?? "—"}
                </p>
                {kpis.topProduct && (
                  <p className="text-xs text-muted-foreground tabular-nums">
                    {kpis.topProduct.count.toLocaleString()} pcs
                  </p>
                )}
              </div>
            </div>

            {/* Chart */}
            {filteredEvents.length > 0 && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="flex items-center justify-between mb-4">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Products per {granularity === "month" ? "month" : "week"}
                  </p>
                  {/* Granularity toggle */}
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
                  <div className="flex items-end gap-1 min-w-max" style={{ height: "80px" }}>
                    {chartData.map((period) => (
                      <div
                        key={period.key}
                        className="flex flex-col items-center gap-1"
                        style={{ width: barWidth }}
                      >
                        <div className="w-full flex flex-col-reverse" style={{ height: "60px" }}>
                          {period.total > 0 || period.waste > 0 ? (
                            <>
                              {/* Waste segment — shown on top (rendered first in flex-col-reverse) */}
                              {period.waste > 0 && (
                                <div
                                  style={{
                                    height: `${Math.max(Math.round((period.waste / maxPeriodCount) * 60), 2)}px`,
                                    width: "100%",
                                  }}
                                  className="bg-stone-200"
                                  onMouseEnter={(e) =>
                                    setTooltip({
                                      x: e.clientX,
                                      y: e.clientY,
                                      lines: [`${period.label}`, `${period.waste} set aside`],
                                    })
                                  }
                                  onMouseMove={(e) =>
                                    setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
                                  }
                                  onMouseLeave={() => setTooltip(null)}
                                />
                              )}
                              {/* Actual yield segments by product */}
                              {productColorList.map((r) => {
                                const count = period.byProduct.get(r.id) ?? 0;
                                if (!count) return null;
                                return (
                                  <div
                                    key={r.id}
                                    style={{
                                      height: `${Math.round((count / maxPeriodCount) * 60)}px`,
                                      backgroundColor: r.color,
                                      width: "100%",
                                    }}
                                    onMouseEnter={(e) =>
                                      setTooltip({
                                        x: e.clientX,
                                        y: e.clientY,
                                        lines: [
                                          `${period.label} · ${period.total} to stock`,
                                          `${r.name}: ${count}`,
                                          ...(period.waste > 0 ? [`${period.waste} set aside`] : []),
                                        ],
                                      })
                                    }
                                    onMouseMove={(e) =>
                                      setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
                                    }
                                    onMouseLeave={() => setTooltip(null)}
                                  />
                                );
                              })}
                            </>
                          ) : (
                            <div className="w-full" style={{ height: "4px" }} />
                          )}
                        </div>
                        <span className="text-[9px] text-muted-foreground/70 leading-none">{period.label}</span>
                      </div>
                    ))}
                  </div>
                </div>
                {(productColorList.length > 1 || chartData.some((d) => d.waste > 0)) && (
                  <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-3 border-t border-border/40">
                    {productColorList.map((r) => (
                      <div
                        key={r.id}
                        className="w-3 h-3 rounded-sm cursor-default"
                        style={{ backgroundColor: r.color }}
                        onMouseEnter={(e) =>
                          setTooltip({
                            x: e.clientX,
                            y: e.clientY,
                            lines: [r.name, `${r.total.toLocaleString()} to stock`],
                          })
                        }
                        onMouseMove={(e) =>
                          setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
                        }
                        onMouseLeave={() => setTooltip(null)}
                      />
                    ))}
                    {chartData.some((d) => d.waste > 0) && (
                      <>
                        <span className="text-[9px] text-muted-foreground mx-0.5">·</span>
                        <div
                          className="w-3 h-3 rounded-sm bg-stone-200 cursor-default"
                          onMouseEnter={(e) => {
                            const totalWaste = chartData.reduce((s, d) => s + d.waste, 0);
                            setTooltip({
                              x: e.clientX,
                              y: e.clientY,
                              lines: ["Set aside", `${totalWaste.toLocaleString()} products`],
                            });
                          }}
                          onMouseMove={(e) =>
                            setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null)
                          }
                          onMouseLeave={() => setTooltip(null)}
                        />
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Product leaderboard */}
            {leaderboard.length > 0 && (
              <div className="rounded-lg border border-border bg-card overflow-hidden">
                <div className="px-4 py-3 border-b border-border/50">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    Product breakdown
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    Trend = selected period {trendWindow.description}
                  </p>
                </div>
                <ul className="divide-y divide-border/40">
                  {leaderboard.map((row) => {
                    const trend = getTrend(row.recent, row.previous);
                    const colNames = row.collectionIds
                      .map((id) => collectionMap.get(id))
                      .filter(Boolean)
                      .join(", ");
                    const waste = row.totalPlanned - row.total;
                    const yieldRate = row.totalPlanned > 0 ? (row.total / row.totalPlanned) * 100 : 100;
                    return (
                      <li key={row.productId} className="px-4 py-3 flex items-center gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium truncate">{row.name}</p>
                          {colNames && (
                            <p className="text-[11px] text-muted-foreground truncate">{colNames}</p>
                          )}
                        </div>
                        <div className="text-right shrink-0 space-y-0.5">
                          <p className="text-sm font-semibold tabular-nums">
                            {row.total.toLocaleString()} pcs
                          </p>
                          {waste > 0 ? (
                            <p className="text-[10px] text-muted-foreground tabular-nums">
                              {yieldRate.toFixed(0)}% yield · {waste} aside
                            </p>
                          ) : row.lastProduced ? (
                            <p className="text-[10px] text-muted-foreground">
                              last: {row.lastProduced.toLocaleDateString("default", { month: "short", year: "numeric" })}
                            </p>
                          ) : null}
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
