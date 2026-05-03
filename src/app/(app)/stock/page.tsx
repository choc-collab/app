"use client";

import { useMemo, useState } from "react";
import {
  useAllPlanProducts, useProductionPlans, useProductsList, useMouldsList,
  setPlanProductStockStatus, useFillingStockItems, useFillings, adjustFillingStock, discardFillingStock, saveFillingStock,
  updateProductStockCount,
  freezePlanProduct, defrostPlanProduct,
  freezeFillingStock, defrostFillingStock,
} from "@/lib/hooks";
import { PageHeader } from "@/components/page-header";
import { Search, SlidersHorizontal, X, Plus, ClipboardList, Snowflake, StickyNote } from "lucide-react";
import type { PlanProduct, ProductionPlan, Product, Mould, FillingStock } from "@/types";
import { reconcileStockCount } from "@/lib/stockCount";
import { remainingShelfLifeDays, batchSellBy, WEEK_MS } from "@/lib/freezer";
import { FreezeModal, DefrostConfirmModal } from "@/components/freeze-modal";

function sellByInfo(sellBefore: Date | null): { text: string; cls: string } {
  if (!sellBefore) return { text: "No shelf life set", cls: "text-muted-foreground" };
  const diff = sellBefore.getTime() - Date.now();
  const fmt = sellBefore.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  if (diff < 0) return { text: `Sell by ${fmt} — expired`, cls: "text-status-alert" };
  if (diff < 7 * 24 * 60 * 60 * 1000) return { text: `Sell by ${fmt} — soon`, cls: "text-status-warn" };
  return { text: `Sell by ${fmt}`, cls: "text-muted-foreground" };
}

type BatchRow = {
  pb: PlanProduct;
  plan: ProductionPlan;
  product: Product | undefined;
  mould: Mould | undefined;
  sellBefore: Date | null;
  /** Available (non-frozen) piece count. */
  productCount: number | null;
  /** Frozen piece count for this batch. */
  frozenCount: number;
  originalCount: number | null;
};

type Group = {
  productId: string;
  product: Product | undefined;
  batches: BatchRow[];
  /** Sum of available (non-frozen) pieces across in-stock batches. */
  totalProducts: number;
  /** Sum of frozen pieces across batches (informational). */
  frozenProducts: number;
  earliestSellBefore: Date | null;
  isLow: boolean; // totalProducts < product.lowStockThreshold (only when threshold is set)
};

/** Format a last-counted timestamp in the user's local timezone.
 *  Today → "Today 14:32", yesterday → "Yesterday 14:32", older → "4 Apr 14:32". */
function formatCountedAt(ts: number | undefined): string | null {
  if (!ts) return null;
  const d = new Date(ts);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });

  const startOfDay = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const dayDiff = Math.round((startOfDay(new Date()) - startOfDay(d)) / (24 * 60 * 60 * 1000));

  if (dayDiff === 0) return `Today ${time}`;
  if (dayDiff === 1) return `Yesterday ${time}`;
  const currentYear = new Date().getFullYear();
  const datePart = d.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    ...(d.getFullYear() !== currentYear ? { year: "numeric" } : {}),
  });
  return `${datePart} ${time}`;
}

export default function StockPage() {
  const [activeTab, setActiveTab] = useState<"products" | "fillings">("products");

  return (
    <div>
      <PageHeader title="Stock" description="Track what's still in stock" />

      {/* Tab strip */}
      <div className="px-4 pb-3 flex gap-1">
        {(["products", "fillings"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-accent text-accent-foreground"
                : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "products" ? "Products" : "Fillings"}
          </button>
        ))}
      </div>

      {activeTab === "products" ? <ProductStockTab /> : <FillingStockTab />}
    </div>
  );
}

// ─── Product Stock Tab ─────────────────────────────────────────────────────

function ProductStockTab() {
  const allPlanProducts = useAllPlanProducts();
  const allPlans = useProductionPlans();
  const products = useProductsList();
  const moulds = useMouldsList(true);
  const [search, setSearch] = useState("");
  const [confirmGone, setConfirmGone] = useState<string | null>(null);
  const [countingProductId, setCountingProductId] = useState<string | null>(null);
  const [countInput, setCountInput] = useState("");
  const [pendingCountConfirm, setPendingCountConfirm] = useState<{
    productId: string;
    newTotal: number;
    goneBatchLabels: string[];
  } | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const [filterLowOnly, setFilterLowOnly] = useState(false);
  const [filterSellBy, setFilterSellBy] = useState("");
  const [filterHasNotes, setFilterHasNotes] = useState(false);
  const [filterFreezer, setFilterFreezer] = useState<"all" | "available" | "frozen">("all");
  const [freezingPbId, setFreezingPbId] = useState<string | null>(null);
  const [defrostingPbId, setDefrostingPbId] = useState<string | null>(null);
  const activeFilterCount = (filterLowOnly ? 1 : 0) + (filterSellBy ? 1 : 0) + (filterHasNotes ? 1 : 0) + (filterFreezer !== "all" ? 1 : 0);

  const planMap = useMemo(() => new Map(allPlans.map((p) => [p.id!, p])), [allPlans]);
  const productMap = useMemo(() => new Map(products.map((r) => [r.id!, r])), [products]);
  const mouldMap = useMemo(() => new Map(moulds.map((m) => [m.id!, m])), [moulds]);

  const inStockRows: BatchRow[] = useMemo(() => {
    return allPlanProducts
      .filter((pb) => {
        if (planMap.get(pb.planId)?.status !== "done") return false;
        if (pb.stockStatus === "gone") return false;
        // Show the batch while it has either available OR frozen pieces.
        const available = pb.currentStock ?? pb.actualYield ?? (mouldMap.get(pb.mouldId) ? mouldMap.get(pb.mouldId)!.numberOfCavities * pb.quantity : 0);
        const frozen = pb.frozenQty ?? 0;
        return available > 0 || frozen > 0;
      })
      .map((pb) => {
        const plan = planMap.get(pb.planId)!;
        const product = productMap.get(pb.productId);
        const mould = mouldMap.get(pb.mouldId);
        const completedAt = plan.completedAt ? new Date(plan.completedAt) : undefined;
        const sellBefore = batchSellBy(pb, completedAt, product?.shelfLifeWeeks);
        const planned = mould ? mould.numberOfCavities * pb.quantity : null;
        const productCount = pb.currentStock ?? pb.actualYield ?? planned;
        const frozenCount = pb.frozenQty ?? 0;
        // Original = what came out of production (or the planned yield if actualYield was
        // never set). Shown alongside the current count so users see how much has been
        // sold/consumed since the batch was made.
        const originalCount = pb.actualYield ?? planned;
        return { pb, plan, product, mould, sellBefore, productCount, frozenCount, originalCount };
      });
  }, [allPlanProducts, planMap, productMap, mouldMap]);

  const groups: Group[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    // eslint-disable-next-line react-hooks/purity -- "expires in N days" is a render-time snapshot
    const now = Date.now();
    const DAY = 24 * 60 * 60 * 1000;

    const filtered = inStockRows.filter(({ product, plan, pb, sellBefore, productCount, frozenCount }) => {
      if (q) {
        const productMatch = product?.name.toLowerCase().includes(q);
        const batchMatch = plan.batchNumber?.toLowerCase().includes(q) ||
          plan.name.toLowerCase().includes(q) ||
          (plan.completedAt
            ? new Date(plan.completedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).toLowerCase().includes(q)
            : false);
        if (!productMatch && !batchMatch) return false;
      }
      if (filterHasNotes && !plan.notes && !pb.notes) return false;
      if (filterSellBy) {
        if (!sellBefore) return false;
        const diff = sellBefore.getTime() - now;
        if (filterSellBy === "expired" && diff >= 0) return false;
        if (filterSellBy === "7d" && diff >= 7 * DAY) return false;
        if (filterSellBy === "30d" && diff >= 30 * DAY) return false;
      }
      if (filterFreezer === "frozen" && frozenCount <= 0) return false;
      if (filterFreezer === "available" && (productCount ?? 0) <= 0) return false;
      return true;
    });

    const map = new Map<string, Group>();
    for (const row of filtered) {
      const key = row.pb.productId;
      if (!map.has(key)) {
        map.set(key, { productId: key, product: row.product, batches: [], totalProducts: 0, frozenProducts: 0, earliestSellBefore: null, isLow: false });
      }
      const g = map.get(key)!;
      g.batches.push(row);
      if (row.productCount) g.totalProducts += row.productCount;
      g.frozenProducts += row.frozenCount;
      if (row.sellBefore && (!g.earliestSellBefore || row.sellBefore < g.earliestSellBefore)) {
        g.earliestSellBefore = row.sellBefore;
      }
    }

    for (const g of map.values()) {
      g.batches.sort((a, b) => {
        const aT = a.sellBefore?.getTime() ?? Infinity;
        const bT = b.sellBefore?.getTime() ?? Infinity;
        return aT - bT;
      });
      const t = g.product?.lowStockThreshold;
      g.isLow = typeof t === "number" && g.totalProducts < t;
    }

    const groupsOut = Array.from(map.values());
    const filteredGroups = filterLowOnly ? groupsOut.filter((g) => g.isLow) : groupsOut;

    return filteredGroups.sort((a, b) => {
      // Low-stock groups float to the top so users see what needs producing first
      if (a.isLow !== b.isLow) return a.isLow ? -1 : 1;
      const aT = a.earliestSellBefore?.getTime() ?? Infinity;
      const bT = b.earliestSellBefore?.getTime() ?? Infinity;
      return aT - bT;
    });
  }, [inStockRows, search, filterLowOnly, filterSellBy, filterHasNotes, filterFreezer]);

  async function handleSetStatus(pbId: string, status: "low" | "gone" | undefined) {
    await setPlanProductStockStatus(pbId, status);
    setConfirmGone(null);
  }

  async function commitCount(productId: string, newTotal: number) {
    await updateProductStockCount(productId, newTotal);
    setCountingProductId(null);
    setCountInput("");
    setPendingCountConfirm(null);
  }

  async function handleSaveCount(productId: string) {
    const val = parseInt(countInput, 10);
    if (isNaN(val) || val < 0) return;
    const group = groups.find((g) => g.productId === productId);
    if (!group) return;

    // Dry-run the same reconciliation the hook will perform so we can warn the user
    // before any batch is silently marked gone.
    const inputs = group.batches.map(({ pb, productCount, sellBefore, plan }) => ({
      id: pb.id!,
      currentStock: productCount ?? 0,
      fifoOrder: sellBefore?.getTime() ?? (plan.completedAt ? new Date(plan.completedAt).getTime() : 0),
      batchNumber: plan.batchNumber ?? plan.name,
    }));
    const deltas = reconcileStockCount(inputs, val);
    const zeroedIds = new Set(deltas.filter((d) => d.nextStock <= 0).map((d) => d.id));
    const goneBatchLabels = inputs
      .filter((i) => zeroedIds.has(i.id))
      .map((i) => i.batchNumber);

    if (goneBatchLabels.length > 0) {
      setPendingCountConfirm({ productId, newTotal: val, goneBatchLabels });
      return;
    }
    await commitCount(productId, val);
  }

  const isEmpty = inStockRows.length === 0;

  return (
    <div className="px-4 pb-8 space-y-3">
      <div className="flex gap-2">
        <div className="flex-1 relative min-w-0">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by product or batch…"
            aria-label="Search stock"
            className="input !pl-9"
          />
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`relative rounded-lg border p-2 transition-colors ${showFilters ? "bg-primary text-primary-foreground border-primary" : "border-border bg-background"}`}
          aria-label="Filters"
        >
          <SlidersHorizontal className="w-5 h-5" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
      </div>

      {showFilters && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Stock level</p>
            <button
              onClick={() => setFilterLowOnly((v) => !v)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${filterLowOnly ? "bg-status-warn-bg text-status-warn" : "border border-border text-muted-foreground"}`}
            >
              Low stock only
            </button>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Sell-by date</p>
            <div className="flex flex-wrap gap-1">
              {(["expired", "7d", "30d"] as const).map((opt) => {
                const label = opt === "expired" ? "Expired" : opt === "7d" ? "Within 7 days" : "Within 30 days";
                return (
                  <button
                    key={opt}
                    onClick={() => setFilterSellBy(filterSellBy === opt ? "" : opt)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${filterSellBy === opt ? "bg-accent text-accent-foreground" : "border border-border text-muted-foreground"}`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Freezer</p>
            <div className="flex flex-wrap gap-1">
              {(["all", "available", "frozen"] as const).map((opt) => {
                const label = opt === "all" ? "All" : opt === "available" ? "Available" : "Frozen only";
                const isFrozenOpt = opt === "frozen";
                return (
                  <button
                    key={opt}
                    onClick={() => setFilterFreezer(opt)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors inline-flex items-center gap-1 ${
                      filterFreezer === opt
                        ? isFrozenOpt ? "bg-sky-600 text-white" : "bg-accent text-accent-foreground"
                        : "border border-border text-muted-foreground"
                    }`}
                  >
                    {isFrozenOpt && <Snowflake className="w-3 h-3" />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Notes</p>
            <button
              onClick={() => setFilterHasNotes((v) => !v)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${filterHasNotes ? "bg-accent text-accent-foreground" : "border border-border text-muted-foreground"}`}
            >
              Has notes
            </button>
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={() => { setFilterLowOnly(false); setFilterSellBy(""); setFilterHasNotes(false); setFilterFreezer("all"); }}
              className="text-xs text-muted-foreground flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
        </div>
      )}

      {isEmpty ? (
        <p className="text-sm text-muted-foreground py-10 text-center">
          No batches in stock. Completed production batches will appear here.
        </p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No results match your search.</p>
      ) : (
        groups.map((group) => (
          <div
            key={group.productId}
            className={`rounded-lg border bg-card overflow-hidden ${
              group.isLow ? "border-status-warn-edge border-l-4" : "border-border"
            }`}
          >
            <div className={`px-3 py-2 border-b border-border ${group.isLow ? "bg-status-warn-bg" : "bg-muted/30"}`}>
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-sm truncate flex items-center gap-1.5 flex-wrap">
                    {group.product?.name ?? "Unknown product"}
                    {(() => {
                      const belowThreshold =
                        group.product?.lowStockThreshold != null &&
                        group.totalProducts < group.product.lowStockThreshold;
                      const pillCls = belowThreshold
                        ? "border-status-warn-edge bg-status-warn-bg text-status-warn"
                        : "border-border bg-background text-foreground";
                      return (
                        <span className={`shrink-0 rounded-full border ${pillCls} px-1.5 py-0 text-[10px] font-semibold tabular-nums inline-flex items-center gap-0.5`}>
                          {group.totalProducts} pcs
                        </span>
                      );
                    })()}
                    {group.isLow && (
                      <span className="shrink-0 rounded-full border border-status-warn-edge bg-status-warn-bg text-status-warn px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide">
                        Low
                      </span>
                    )}
                    {group.frozenProducts > 0 && (
                      <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 text-sky-700 px-1.5 py-0 text-[10px] font-semibold inline-flex items-center gap-0.5">
                        <Snowflake className="w-2.5 h-2.5" />
                        {group.frozenProducts}
                      </span>
                    )}
                  </p>
                  <div className="flex items-center gap-2 flex-wrap mt-0.5">
                    {group.product?.lowStockThreshold != null && (
                      <span className={`text-[11px] tabular-nums ${group.totalProducts < group.product.lowStockThreshold ? "text-status-warn" : "text-muted-foreground"}`}>
                        threshold {group.product.lowStockThreshold}
                      </span>
                    )}
                    {group.product?.stockCountedAt && (
                      <span className="text-[11px] text-muted-foreground">
                        {group.product?.lowStockThreshold != null ? "· " : ""}Last count {formatCountedAt(group.product.stockCountedAt)}
                      </span>
                    )}
                  </div>
                </div>
                {countingProductId !== group.productId && (
                  <button
                    onClick={() => { setCountingProductId(group.productId); setCountInput(String(group.totalProducts)); }}
                    className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border bg-background px-2 py-1 text-[11px] font-medium text-muted-foreground hover:border-primary hover:text-primary transition-colors"
                    title="Record the latest stock count for this product"
                  >
                    <ClipboardList className="w-3 h-3" /> Latest stock count
                  </button>
                )}
              </div>
              {countingProductId === group.productId && pendingCountConfirm?.productId !== group.productId && (
                <div className="mt-2 flex items-center gap-2">
                  <input
                    type="number"
                    min={0}
                    value={countInput}
                    onChange={(e) => setCountInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleSaveCount(group.productId); if (e.key === "Escape") { setCountingProductId(null); setCountInput(""); } }}
                    autoFocus
                    aria-label="New stock count"
                    className="input text-sm h-8 w-24"
                  />
                  <span className="text-xs text-muted-foreground">pcs</span>
                  <button onClick={() => handleSaveCount(group.productId)} className="text-xs font-medium text-primary">Save</button>
                  <button onClick={() => { setCountingProductId(null); setCountInput(""); }} className="text-xs text-muted-foreground">Cancel</button>
                </div>
              )}
              {pendingCountConfirm?.productId === group.productId && (
                <div className="mt-2 rounded-md bg-status-warn-bg border border-status-warn-edge px-2.5 py-2 text-xs">
                  <p className="text-foreground">
                    Saving <span className="font-semibold">{pendingCountConfirm.newTotal} pcs</span> will
                    mark {pendingCountConfirm.goneBatchLabels.length === 1 ? "1 batch" : `${pendingCountConfirm.goneBatchLabels.length} batches`} as gone:{" "}
                    <span className="font-mono">{pendingCountConfirm.goneBatchLabels.join(", ")}</span>.
                  </p>
                  <div className="mt-1.5 flex items-center gap-3">
                    <button
                      onClick={() => commitCount(pendingCountConfirm.productId, pendingCountConfirm.newTotal)}
                      className="text-xs font-medium text-status-warn"
                    >
                      Yes, save
                    </button>
                    <button
                      onClick={() => setPendingCountConfirm(null)}
                      className="text-xs text-muted-foreground"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>

            {group.batches.map(({ pb, plan, productCount, frozenCount, originalCount, sellBefore }, i) => {
              const { text: sellByText, cls: sellByCls } = sellByInfo(sellBefore);
              const completedDate = plan.completedAt
                ? new Date(plan.completedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
                : null;
              const isLast = i === group.batches.length - 1;
              const availableCount = productCount ?? 0;

              if (confirmGone === pb.id) {
                return (
                  <div key={pb.id} className={`px-3 py-2 bg-muted/40 flex items-center gap-3 ${!isLast ? "border-b border-border" : ""}`}>
                    <p className="text-xs text-muted-foreground flex-1">Mark as gone?</p>
                    <button onClick={() => handleSetStatus(pb.id!, "gone")} className="text-xs font-medium text-foreground">Yes</button>
                    <button onClick={() => setConfirmGone(null)} className="text-xs text-muted-foreground">Cancel</button>
                  </div>
                );
              }

              return (
                <div key={pb.id} className={!isLast ? "border-b border-border" : ""}>
                  {/* Available row — hidden when all pieces are in the freezer */}
                  {availableCount > 0 && (
                    <div className="px-3 py-2.5 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {plan.batchNumber && <span className="font-mono text-[10px] text-muted-foreground">{plan.batchNumber}</span>}
                          {completedDate && <span className="text-[10px] text-muted-foreground">· Made {completedDate}</span>}
                          <span className="text-[10px] text-muted-foreground">
                            · {availableCount} pcs
                            {originalCount != null && originalCount !== availableCount && (
                              <span className="text-muted-foreground/70"> of {originalCount} made</span>
                            )}
                          </span>
                          {pb.defrostedAt && (
                            <span className="text-[10px] text-sky-700" title="Sell-by shifted from defrost date">
                              · defrosted
                            </span>
                          )}
                        </div>
                        <p className={`text-xs mt-0.5 ${sellByCls}`}>{sellByText}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                        <button
                          onClick={() => setFreezingPbId(pb.id!)}
                          className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-sky-700 hover:border-sky-500 hover:bg-sky-50 transition-colors inline-flex items-center gap-0.5"
                          title="Move pieces to the freezer"
                        >
                          <Snowflake className="w-3 h-3" /> Freeze
                        </button>
                        <button
                          onClick={() => setConfirmGone(pb.id!)}
                          className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                        >
                          Gone
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Freezer sub-row */}
                  {frozenCount > 0 && (
                    <div className={`px-3 py-2.5 flex items-start justify-between gap-2 bg-sky-50/40 ${availableCount > 0 ? "border-t border-border/60" : ""}`}>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Snowflake className="w-3 h-3 text-sky-600" />
                          <span className="text-[10px] font-semibold text-sky-700 uppercase tracking-wide">
                            In freezer
                          </span>
                          <span className="text-[10px] text-muted-foreground">· {frozenCount} pcs</span>
                          {plan.batchNumber && <span className="font-mono text-[10px] text-muted-foreground">· {plan.batchNumber}</span>}
                          {completedDate && (
                            <span className="text-[10px] text-muted-foreground">· Made {completedDate}</span>
                          )}
                          {pb.frozenAt && (
                            <span className="text-[10px] text-muted-foreground">
                              · frozen since {new Date(pb.frozenAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          Not for sale · {pb.preservedShelfLifeDays ?? 0} days shelf life on defrost
                        </p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                        <button
                          onClick={() => setDefrostingPbId(pb.id!)}
                          className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] font-medium text-sky-700 hover:bg-sky-100 transition-colors"
                        >
                          Defrost
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Notes — batch-level (from production plan) and item-level (per bonbon batch).
                      Mirrors the styling of the product Batches/History tab so notes look the
                      same wherever they appear. */}
                  {(plan.notes || pb.notes) && (
                    <div className="px-3 pb-2 space-y-1 border-t border-border pt-2">
                      {plan.notes && (
                        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <StickyNote className="w-3 h-3 shrink-0 mt-px text-muted-foreground/60" />
                          <span><span className="font-medium text-foreground">Batch:</span> {plan.notes}</span>
                        </p>
                      )}
                      {pb.notes && (
                        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <StickyNote className="w-3 h-3 shrink-0 mt-px text-muted-foreground/60" />
                          <span><span className="font-medium text-foreground">Product:</span> {pb.notes}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}

      {/* Freeze modal */}
      {freezingPbId && (() => {
        const row = inStockRows.find((r) => r.pb.id === freezingPbId);
        if (!row) return null;
        const { pb, plan, product, productCount } = row;
        const available = productCount ?? 0;
        const madeAtMs = plan.completedAt ? new Date(plan.completedAt).getTime() : undefined;
        const remaining = remainingShelfLifeDays(madeAtMs, product?.shelfLifeWeeks);
        return (
          <FreezeModal
            title="Freeze pieces"
            itemName={product?.name ?? "Product"}
            itemSubtitle={plan.batchNumber}
            unit="pcs"
            availableQty={available}
            defaultQty={available}
            defaultShelfLifeDays={remaining}
            onConfirm={async (qty, days) => {
              await freezePlanProduct(pb.id!, qty, days);
              setFreezingPbId(null);
            }}
            onCancel={() => setFreezingPbId(null)}
          />
        );
      })()}

      {/* Defrost modal */}
      {defrostingPbId && (() => {
        const row = inStockRows.find((r) => r.pb.id === defrostingPbId);
        if (!row) return null;
        const { pb, product } = row;
        return (
          <DefrostConfirmModal
            itemName={product?.name ?? "product"}
            qty={pb.frozenQty ?? 0}
            unit="pcs"
            preservedShelfLifeDays={pb.preservedShelfLifeDays}
            onConfirm={async () => {
              await defrostPlanProduct(pb.id!);
              setDefrostingPbId(null);
            }}
            onCancel={() => setDefrostingPbId(null)}
          />
        );
      })()}
    </div>
  );
}

// ─── Filling Stock Tab ──────────────────────────────────────────────────────

function FillingStockTab() {
  const fillingStockItems = useFillingStockItems();
  const allFillings = useFillings();
  const allPlans = useProductionPlans();
  const [search, setSearch] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustInput, setAdjustInput] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [addFillingId, setAddFillingId] = useState("");
  const [addAmount, setAddAmount] = useState("");
  const [addDate, setAddDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showFilters, setShowFilters] = useState(false);
  const [filterFreezer, setFilterFreezer] = useState<"all" | "available" | "frozen">("all");
  const [filterHasNotes, setFilterHasNotes] = useState(false);
  const [freezingId, setFreezingId] = useState<string | null>(null);
  const [defrostingId, setDefrostingId] = useState<string | null>(null);

  const fillingsMap = useMemo(() => new Map(allFillings.map((l) => [l.id!, l])), [allFillings]);
  const plansMap = useMemo(() => new Map(allPlans.map((p) => [p.id!, p])), [allPlans]);

  const activeFilterCount = (filterFreezer !== "all" ? 1 : 0) + (filterHasNotes ? 1 : 0);

  // Group stock entries by filling. `planNotes` is lifted from the originating
  // production plan so the stock view can show batch-level notes alongside the
  // entry's own notes — same surface as the products tab.
  type FillingGroup = {
    fillingId: string;
    fillingName: string;
    category: string;
    shelfLifeWeeks?: number;
    entries: (FillingStock & { planName?: string; planNotes?: string })[];
    totalG: number;
    frozenG: number;
  };

  const groups: FillingGroup[] = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map<string, FillingGroup>();

    for (const item of fillingStockItems) {
      const filling = fillingsMap.get(item.fillingId);
      const fillingName = filling?.name ?? "Unknown filling";
      if (q && !fillingName.toLowerCase().includes(q)) continue;
      if (filterFreezer === "frozen" && !item.frozen) continue;
      if (filterFreezer === "available" && item.frozen) continue;
      const plan = item.planId ? plansMap.get(item.planId) : undefined;
      if (filterHasNotes && !item.notes && !plan?.notes) continue;

      if (!map.has(item.fillingId)) {
        map.set(item.fillingId, {
          fillingId: item.fillingId,
          fillingName,
          category: filling?.category ?? "",
          shelfLifeWeeks: filling?.shelfLifeWeeks ?? undefined,
          entries: [],
          totalG: 0,
          frozenG: 0,
        });
      }
      const g = map.get(item.fillingId)!;
      g.entries.push({ ...item, planName: plan?.name, planNotes: plan?.notes });
      if (item.frozen) g.frozenG += item.remainingG;
      else g.totalG += item.remainingG;
    }

    // Sort entries oldest-first within each group
    for (const g of map.values()) {
      g.entries.sort((a, b) => new Date(a.madeAt).getTime() - new Date(b.madeAt).getTime());
    }

    // eslint-disable-next-line react-hooks/purity -- urgency sort uses a render-time snapshot
    const now = Date.now();
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

    // Sort groups: most urgent first (expired → least remaining shelf life → oldest made)
    // Fillings without shelf life sort after those with shelf life, by oldest entry
    return Array.from(map.values()).sort((a, b) => {
      const aOldest = a.entries[0] ? new Date(a.entries[0].madeAt).getTime() : now;
      const bOldest = b.entries[0] ? new Date(b.entries[0].madeAt).getTime() : now;

      // Compute remaining weeks for the oldest entry (most urgent)
      const aRemaining = a.shelfLifeWeeks != null
        ? a.shelfLifeWeeks - (now - aOldest) / WEEK_MS
        : null;
      const bRemaining = b.shelfLifeWeeks != null
        ? b.shelfLifeWeeks - (now - bOldest) / WEEK_MS
        : null;

      // Both have shelf life: sort by remaining (expired first, then least remaining)
      if (aRemaining !== null && bRemaining !== null) return aRemaining - bRemaining;
      // Only one has shelf life: it sorts first (more actionable)
      if (aRemaining !== null) return -1;
      if (bRemaining !== null) return 1;
      // Neither has shelf life: oldest production date first
      return aOldest - bOldest;
    });
  }, [fillingStockItems, fillingsMap, plansMap, search, filterFreezer, filterHasNotes]);

  async function handleDiscard(id: string) {
    await discardFillingStock(id);
    setConfirmDiscard(null);
  }

  async function handleAdjust(id: string) {
    const val = parseFloat(adjustInput);
    if (!isNaN(val) && val >= 0) {
      await adjustFillingStock(id, Math.round(val));
    }
    setAdjustingId(null);
    setAdjustInput("");
  }

  async function handleAddManual() {
    if (!addFillingId || !addAmount) return;
    const val = parseFloat(addAmount);
    if (isNaN(val) || val <= 0) return;
    // Clamp date to today if somehow a future date was entered
    const today = new Date().toISOString().slice(0, 10);
    const clampedDate = addDate > today ? today : addDate;
    await saveFillingStock({
      fillingId: addFillingId,
      remainingG: Math.round(val),
      madeAt: new Date(clampedDate).toISOString(),
      createdAt: Date.now(),
    });
    setShowAdd(false);
    setAddFillingId("");
    setAddAmount("");
    setAddDate(new Date().toISOString().slice(0, 10));
  }

  const isEmpty = fillingStockItems.length === 0 && !showAdd;

  return (
    <div className="px-4 pb-8 space-y-3">
      <div className="flex gap-2">
        <div className="flex-1 relative min-w-0">
          <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search fillings…"
            aria-label="Search filling stock"
            className="input !pl-9"
          />
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          className={`relative rounded-lg border p-2 transition-colors ${showFilters ? "bg-primary text-primary-foreground border-primary" : "border-border bg-background"}`}
          aria-label="Filters"
        >
          <SlidersHorizontal className="w-5 h-5" />
          {activeFilterCount > 0 && (
            <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
              {activeFilterCount}
            </span>
          )}
        </button>
        <button
          onClick={() => setShowAdd((v) => !v)}
          className="rounded-full border border-border bg-background p-2 transition-colors hover:bg-muted"
          aria-label="Add filling stock"
          title="Add filling stock manually"
        >
          <Plus className="w-5 h-5" />
        </button>
      </div>

      {showFilters && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Freezer</p>
            <div className="flex flex-wrap gap-1">
              {(["all", "available", "frozen"] as const).map((opt) => {
                const label = opt === "all" ? "All" : opt === "available" ? "Available" : "Frozen only";
                const isFrozenOpt = opt === "frozen";
                return (
                  <button
                    key={opt}
                    onClick={() => setFilterFreezer(opt)}
                    className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors inline-flex items-center gap-1 ${
                      filterFreezer === opt
                        ? isFrozenOpt ? "bg-sky-600 text-white" : "bg-accent text-accent-foreground"
                        : "border border-border text-muted-foreground"
                    }`}
                  >
                    {isFrozenOpt && <Snowflake className="w-3 h-3" />}
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1.5">Notes</p>
            <button
              onClick={() => setFilterHasNotes((v) => !v)}
              className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors inline-flex items-center gap-1 ${filterHasNotes ? "bg-accent text-accent-foreground" : "border border-border text-muted-foreground"}`}
            >
              <StickyNote className="w-3 h-3" />
              Has notes
            </button>
          </div>
          {activeFilterCount > 0 && (
            <button
              onClick={() => { setFilterFreezer("all"); setFilterHasNotes(false); }}
              className="text-xs text-muted-foreground flex items-center gap-1"
            >
              <X className="w-3 h-3" /> Clear filters
            </button>
          )}
        </div>
      )}

      {/* Manual add form */}
      {showAdd && (
        <div className="rounded-lg border border-border bg-card p-3 space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Add leftover filling manually</p>
          <select
            value={addFillingId}
            onChange={(e) => setAddFillingId(e.target.value)}
            className="input text-sm"
          >
            <option value="">Select filling…</option>
            {allFillings
              .filter((l) => !l.archived && !l.supersededAt)
              .sort((a, b) => a.name.localeCompare(b.name))
              .map((l) => (
                <option key={l.id} value={l.id!}>{l.name}</option>
              ))}
          </select>
          <div className="flex gap-2">
            <input
              type="number"
              min={1}
              value={addAmount}
              onChange={(e) => setAddAmount(e.target.value)}
              placeholder="Amount in grams"
              className="input flex-1 text-sm"
            />
            <span className="self-center text-xs text-muted-foreground">g</span>
          </div>
          <div>
            <label className="block text-xs text-muted-foreground mb-0.5">Production date</label>
            <input
              type="date"
              value={addDate}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setAddDate(e.target.value)}
              className="input text-sm"
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button onClick={() => { setShowAdd(false); setAddFillingId(""); setAddAmount(""); setAddDate(new Date().toISOString().slice(0, 10)); }} className="text-xs text-muted-foreground">Cancel</button>
            <button
              onClick={handleAddManual}
              disabled={!addFillingId || !addAmount}
              className="rounded-full bg-accent text-accent-foreground px-3 py-1.5 text-xs font-medium disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}

      {isEmpty ? (
        <p className="text-sm text-muted-foreground py-10 text-center">
          No leftover fillings tracked. After filling products in a production batch, you can register leftover filling here.
        </p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-muted-foreground py-6 text-center">No fillings match your search.</p>
      ) : (
        groups.map((group) => (
          <div key={group.fillingId} className="rounded-lg border border-border bg-card overflow-hidden">
            {/* Group header */}
            <div className="px-3 py-2 bg-muted/30 border-b border-border flex justify-between items-baseline">
              <div>
                <p className="font-semibold text-sm">{group.fillingName}</p>
                <p className="text-[10px] text-muted-foreground">
                  {group.category}{group.shelfLifeWeeks ? ` · ${group.shelfLifeWeeks}-week shelf life` : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {group.frozenG > 0 && (
                  <span className="shrink-0 rounded-full border border-sky-200 bg-sky-50 text-sky-700 px-1.5 py-0 text-[10px] font-semibold inline-flex items-center gap-0.5">
                    <Snowflake className="w-2.5 h-2.5" />
                    {Math.round(group.frozenG)}g
                  </span>
                )}
                <span className="text-sm font-semibold tabular-nums">{Math.round(group.totalG)}g</span>
              </div>
            </div>

            {/* Stock entries */}
            {group.entries.map((entry, i) => {
              const madeDate = new Date(entry.madeAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
              const isLast = i === group.entries.length - 1;

              // Freshness based on filling shelf life. Frozen entries pause
              // the shelf-life clock; defrosted entries use the captured
              // preservedShelfLifeDays from defrostedAt.
              let freshness: { text: string; cls: string } | null = null;
              if (entry.frozen) {
                freshness = { text: "Paused (frozen)", cls: "text-sky-700" };
              } else if (entry.defrostedAt && entry.preservedShelfLifeDays != null) {
                const sellBy = entry.defrostedAt + entry.preservedShelfLifeDays * 24 * 60 * 60 * 1000;
                const remainingDays = Math.round((sellBy - Date.now()) / (24 * 60 * 60 * 1000));
                if (remainingDays <= 0) freshness = { text: "Expired", cls: "text-status-alert" };
                else if (remainingDays <= 7) freshness = { text: `${remainingDays}d left · defrosted`, cls: "text-status-warn" };
                else freshness = { text: `${remainingDays}d left · defrosted`, cls: "text-status-ok" };
              } else if (group.shelfLifeWeeks) {
                const ageMs = Date.now() - new Date(entry.madeAt).getTime();
                const ageWeeks = ageMs / (7 * 24 * 60 * 60 * 1000);
                const remaining = Math.round((group.shelfLifeWeeks - ageWeeks) * 10) / 10;
                if (remaining <= 0) {
                  freshness = { text: "Expired", cls: "text-status-alert" };
                } else if (remaining <= 1) {
                  freshness = { text: `${remaining} wk left`, cls: "text-status-warn" };
                } else {
                  freshness = { text: `${remaining} wks left`, cls: "text-status-ok" };
                }
              }

              if (confirmDiscard === entry.id) {
                return (
                  <div key={entry.id} className={`px-3 py-2 bg-muted/40 flex items-center gap-3 ${!isLast ? "border-b border-border" : ""}`}>
                    <p className="text-xs text-muted-foreground flex-1">Discard this stock?</p>
                    <button onClick={() => handleDiscard(entry.id!)} className="text-xs font-medium text-status-alert">Yes</button>
                    <button onClick={() => setConfirmDiscard(null)} className="text-xs text-muted-foreground">Cancel</button>
                  </div>
                );
              }

              if (adjustingId === entry.id) {
                return (
                  <div key={entry.id} className={`px-3 py-2 flex items-center gap-2 ${!isLast ? "border-b border-border" : ""}`}>
                    <input
                      type="number"
                      min={0}
                      value={adjustInput}
                      onChange={(e) => setAdjustInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") handleAdjust(entry.id!); if (e.key === "Escape") { setAdjustingId(null); setAdjustInput(""); } }}
                      autoFocus
                      className="input flex-1 text-sm h-7"
                    />
                    <span className="text-xs text-muted-foreground">g</span>
                    <button onClick={() => handleAdjust(entry.id!)} className="text-xs font-medium text-primary">Save</button>
                    <button onClick={() => { setAdjustingId(null); setAdjustInput(""); }} className="text-xs text-muted-foreground">Cancel</button>
                  </div>
                );
              }

              return (
                <div
                  key={entry.id}
                  className={!isLast ? "border-b border-border" : ""}
                >
                  <div className={`px-3 py-2.5 flex items-start justify-between gap-2 ${entry.frozen ? "bg-sky-50/40" : ""}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {entry.frozen && <Snowflake className="w-3 h-3 text-sky-600" />}
                        <span className="text-sm font-medium tabular-nums">{Math.round(entry.remainingG)}g</span>
                        {entry.frozen && (
                          <span className="text-[10px] font-semibold text-sky-700 uppercase tracking-wide">
                            In freezer
                          </span>
                        )}
                        <span className="text-[10px] text-muted-foreground">· Made {madeDate}</span>
                        {freshness && (
                          <span className={`text-[10px] font-medium ${freshness.cls}`}>· {freshness.text}</span>
                        )}
                      </div>
                      {entry.planName && (
                        <p className="text-[10px] text-muted-foreground mt-0.5">From: {entry.planName}</p>
                      )}
                      {entry.frozen && entry.preservedShelfLifeDays != null && (
                        <p className="text-[11px] text-muted-foreground mt-0.5">
                          {entry.preservedShelfLifeDays} days shelf life on defrost
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                      {entry.frozen ? (
                        <button
                          onClick={() => setDefrostingId(entry.id!)}
                          className="rounded-full border border-sky-200 bg-white px-2 py-0.5 text-[10px] font-medium text-sky-700 hover:bg-sky-100 transition-colors"
                        >
                          Defrost
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => setFreezingId(entry.id!)}
                            className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-sky-700 hover:border-sky-500 hover:bg-sky-50 transition-colors inline-flex items-center gap-0.5"
                            title="Move to freezer"
                          >
                            <Snowflake className="w-3 h-3" /> Freeze
                          </button>
                          <button
                            onClick={() => { setAdjustingId(entry.id!); setAdjustInput(String(Math.round(entry.remainingG))); }}
                            className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:border-foreground hover:text-foreground transition-colors"
                          >
                            Adjust
                          </button>
                          <button
                            onClick={() => setConfirmDiscard(entry.id!)}
                            className="rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:border-status-alert hover:text-status-alert transition-colors"
                          >
                            Discard
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Notes — batch-level (from the production plan) and entry-level
                      (the leftover stock row itself). Matches the product Batches/History tab. */}
                  {(entry.planNotes || entry.notes) && (
                    <div className="px-3 pb-2 space-y-1 border-t border-border pt-2">
                      {entry.planNotes && (
                        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <StickyNote className="w-3 h-3 shrink-0 mt-px text-muted-foreground/60" />
                          <span><span className="font-medium text-foreground">Batch:</span> {entry.planNotes}</span>
                        </p>
                      )}
                      {entry.notes && (
                        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
                          <StickyNote className="w-3 h-3 shrink-0 mt-px text-muted-foreground/60" />
                          <span><span className="font-medium text-foreground">Filling:</span> {entry.notes}</span>
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))
      )}

      {/* Freeze filling modal */}
      {freezingId && (() => {
        const entry = fillingStockItems.find((e) => e.id === freezingId);
        if (!entry) return null;
        const filling = fillingsMap.get(entry.fillingId);
        const madeAtMs = new Date(entry.madeAt).getTime();
        const remaining = remainingShelfLifeDays(madeAtMs, filling?.shelfLifeWeeks);
        return (
          <FreezeModal
            title="Freeze filling"
            itemName={filling?.name ?? "Filling"}
            itemSubtitle={filling?.category}
            unit="g"
            availableQty={entry.remainingG}
            defaultQty={entry.remainingG}
            defaultShelfLifeDays={remaining}
            onConfirm={async (qty, days) => {
              await freezeFillingStock(entry.id!, days, qty);
              setFreezingId(null);
            }}
            onCancel={() => setFreezingId(null)}
          />
        );
      })()}

      {/* Defrost filling modal */}
      {defrostingId && (() => {
        const entry = fillingStockItems.find((e) => e.id === defrostingId);
        if (!entry) return null;
        const filling = fillingsMap.get(entry.fillingId);
        return (
          <DefrostConfirmModal
            itemName={filling?.name ?? "filling"}
            qty={entry.remainingG}
            unit="g"
            preservedShelfLifeDays={entry.preservedShelfLifeDays}
            onConfirm={async () => {
              await defrostFillingStock(entry.id!);
              setDefrostingId(null);
            }}
            onCancel={() => setDefrostingId(null)}
          />
        );
      })()}
    </div>
  );
}
