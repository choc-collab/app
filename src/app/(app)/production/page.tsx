"use client";

import {
  useProductionPlans, useProductsList, useMouldsList, useFillings,
  useAllPlanProducts, useAllPlanFillings, useAllPlanStepStatuses, deleteProductionPlan,
} from "@/lib/hooks";
import { PageHeader } from "@/components/page-header";
import { Plus, Trash2, ChevronRight, ChevronDown, BookOpen, Search, Sprout, StickyNote, Copy } from "lucide-react";
import { CollapseControls } from "@/components/pantry";
import Link from "next/link";
import { useState, useMemo } from "react";
import type { ProductionPlan, Product, PlanProduct, PlanFilling, Filling, Mould } from "@/types";
import { getTotalCavities, formatMouldList, hasAlternativeMouldSetup } from "@/lib/production";

const STATUS_LABEL: Record<string, string> = { draft: "Not yet started", active: "In progress", done: "Done" };
const STATUS_STYLE: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  active: "bg-warning-muted text-warning",
  done: "bg-success-muted text-success",
};

type TimeRange = "7d" | "30d" | "90d" | "12mo" | "all";
const RANGE_DAYS: Record<Exclude<TimeRange, "all">, number> = { "7d": 7, "30d": 30, "90d": 90, "12mo": 365 };
const RANGE_LABEL: Record<TimeRange, string> = { "7d": "7 days", "30d": "30 days", "90d": "90 days", "12mo": "12 months", "all": "All time" };
const RANGE_ORDER: TimeRange[] = ["7d", "30d", "90d", "12mo", "all"];

export default function ProductionPage() {
  const plans = useProductionPlans();
  const products = useProductsList();
  const moulds = useMouldsList(true);
  const fillings = useFillings();
  const allPlanProducts = useAllPlanProducts();
  const allPlanFillings = useAllPlanFillings();
  const allStepStatuses = useAllPlanStepStatuses();

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [view, setView] = useState<"active" | "history">("active");
  const [search, setSearch] = useState("");
  const [range, setRange] = useState<TimeRange>("90d");
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());

  const productMap = useMemo(() => new Map(products.map((r) => [r.id!, r])), [products]);
  const mouldMap = useMemo(() => new Map(moulds.map((m) => [m.id!, m])), [moulds]);
  const fillingMap = useMemo(() => new Map(fillings.map((f) => [f.id!, f])), [fillings]);

  // One pass over all PlanProduct rows → Map<planId, PlanProduct[]>
  const planProductsByPlan = useMemo(() => {
    const map = new Map<string, PlanProduct[]>();
    for (const pp of allPlanProducts) {
      const arr = map.get(pp.planId);
      if (arr) arr.push(pp);
      else map.set(pp.planId, [pp]);
    }
    // stable sort within each plan by sortOrder
    for (const arr of map.values()) arr.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return map;
  }, [allPlanProducts]);

  // One pass over all PlanFilling rows → Map<planId, PlanFilling[]>
  const planFillingsByPlan = useMemo(() => {
    const map = new Map<string, PlanFilling[]>();
    for (const pf of allPlanFillings) {
      const arr = map.get(pf.planId);
      if (arr) arr.push(pf);
      else map.set(pf.planId, [pf]);
    }
    for (const arr of map.values()) arr.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    return map;
  }, [allPlanFillings]);

  // One pass over all step statuses → Map<planId, Set<stepKey of done>>
  const doneKeysByPlan = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const s of allStepStatuses) {
      if (!s.done) continue;
      const set = map.get(s.planId) ?? new Set<string>();
      set.add(s.stepKey);
      map.set(s.planId, set);
    }
    return map;
  }, [allStepStatuses]);

  // Not yet started first, then in progress, then recent done; within each group newest first
  const sorted = useMemo(() => {
    const order = { draft: 0, active: 1, done: 2 };
    return [...plans].sort((a, b) => {
      const statusDiff = (order[a.status as keyof typeof order] ?? 3) - (order[b.status as keyof typeof order] ?? 3);
      if (statusDiff !== 0) return statusDiff;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [plans]);

  // Search predicate reused by the in-range filter and the out-of-range counter.
  // Returning a closure from useMemo trips React Compiler's preserve-memoization
  // check — intentional here, the predicate is stable per-search and reused.
  // eslint-disable-next-line react-hooks/preserve-manual-memoization
  const searchMatches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return () => true;
    return (plan: ProductionPlan) => {
      if (plan.name.toLowerCase().includes(q)) return true;
      if (plan.batchNumber?.toLowerCase().includes(q)) return true;
      const dateStr = new Date(plan.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }).toLowerCase();
      if (dateStr.includes(q)) return true;
      const pps = planProductsByPlan.get(plan.id!) ?? [];
      return pps.some((pp) => productMap.get(pp.productId)?.name.toLowerCase().includes(q));
    };
  }, [search, planProductsByPlan, productMap]);

  const historyPlans = useMemo(() => sorted.filter((p) => p.status === "done"), [sorted]);
  const activePlans = useMemo(() => sorted.filter((p) => p.status !== "done"), [sorted]);

  const rangeCutoff = useMemo(() => {
    if (view !== "history" || range === "all") return null;
    // Snapshot Date.now() at memo time — cutoff doesn't drift while the page
    // is open (good enough for "last 7d" filtering on a desktop session).
    // eslint-disable-next-line react-hooks/purity
    return Date.now() - RANGE_DAYS[range] * 86_400_000;
  }, [view, range]);

  const filtered = useMemo(() => {
    const base = view === "history" ? historyPlans : activePlans;
    const inRange = rangeCutoff == null
      ? base
      : base.filter((p) => new Date(p.createdAt).getTime() >= rangeCutoff);
    return inRange.filter(searchMatches);
  }, [view, historyPlans, activePlans, rangeCutoff, searchMatches]);

  // Out-of-range search hits — powers the "N more matches outside…" prompt
  const outsideRangeCount = useMemo(() => {
    if (view !== "history" || rangeCutoff == null || !search.trim()) return 0;
    return historyPlans.filter((p) => new Date(p.createdAt).getTime() < rangeCutoff).filter(searchMatches).length;
  }, [view, historyPlans, rangeCutoff, search, searchMatches]);

  // Group history by "YYYY-MM" → { label, plans[] }. Active view is flat.
  const historyGroups = useMemo(() => {
    if (view !== "history") return null;
    const groups = new Map<string, { label: string; plans: ProductionPlan[] }>();
    for (const p of filtered) {
      const d = new Date(p.createdAt);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      const g = groups.get(key);
      if (g) g.plans.push(p);
      else groups.set(key, { label, plans: [p] });
    }
    // Map preserves insertion order; `filtered` is already newest-first, so keys land newest-first too
    return [...groups.entries()].map(([key, v]) => ({ key, ...v }));
  }, [view, filtered]);

  function toggleMonth(key: string) {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const isHistory = view === "history";
  const totalHistory = historyPlans.length;
  const showingStrip = isHistory && totalHistory > 0;

  return (
    <div>
      <PageHeader title="Production" description="Plan and track your batches" />
      <div className="px-4 space-y-3 pb-6">
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden text-sm font-medium shrink-0">
            <button
              onClick={() => setView("active")}
              className={`px-3 py-1.5 transition-colors ${view === "active" ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground"}`}
            >
              Active
            </button>
            <button
              onClick={() => setView("history")}
              className={`px-3 py-1.5 transition-colors ${view === "history" ? "bg-accent text-accent-foreground" : "bg-card text-muted-foreground"}`}
            >
              History
            </button>
          </div>

          <div className="relative flex-1 min-w-0">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Name, batch no., date, or product…"
              className="w-full pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border bg-card placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>

          <Link
            href="/production/new"
            className="rounded-full bg-accent text-accent-foreground p-2 inline-flex shrink-0"
            aria-label="New plan"
          >
            <Plus className="w-5 h-5" />
          </Link>
        </div>

        {isHistory && (
          <div className="flex flex-wrap items-center gap-1.5" role="radiogroup" aria-label="Time range">
            {RANGE_ORDER.map((r) => (
              <button
                key={r}
                role="radio"
                aria-checked={range === r}
                onClick={() => setRange(r)}
                className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                  range === r
                    ? "bg-accent text-accent-foreground border-accent"
                    : "bg-card text-muted-foreground border-border hover:bg-muted"
                }`}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
        )}

        {showingStrip && (
          <p className="text-xs text-muted-foreground">
            Showing {filtered.length} of {totalHistory} completed {totalHistory === 1 ? "batch" : "batches"}
            {range !== "all" && <> · last {RANGE_LABEL[range].toLowerCase()}</>}
            {outsideRangeCount > 0 && (
              <>
                {" · "}
                <button
                  onClick={() => setRange("all")}
                  className="underline hover:text-foreground"
                >
                  {outsideRangeCount} more {outsideRangeCount === 1 ? "match" : "matches"} outside range
                </button>
              </>
            )}
          </p>
        )}

        {filtered.length === 0 ? (
          <p className="text-muted-foreground text-sm py-8 text-center">
            {search
              ? isHistory && outsideRangeCount > 0
                ? <>No matches in this range. <button onClick={() => setRange("all")} className="underline">Search all time</button>.</>
                : "No batches match your search."
              : isHistory
                ? totalHistory === 0
                  ? "No completed batches yet."
                  : `No completed batches in the last ${RANGE_LABEL[range].toLowerCase()}.`
                : "No active batches. Tap + to plan your first batch."}
          </p>
        ) : isHistory && historyGroups ? (
          <div className="space-y-4">
            {historyGroups.length > 1 && (
              <CollapseControls
                onCollapseAll={() => setCollapsedMonths(new Set(historyGroups.map((g) => g.key)))}
                onExpandAll={() => setCollapsedMonths(new Set())}
              />
            )}
            {historyGroups.map((group) => {
              const isCollapsed = collapsedMonths.has(group.key);
              return (
                <div key={group.key}>
                  <button
                    onClick={() => toggleMonth(group.key)}
                    aria-expanded={!isCollapsed}
                    className="flex items-center gap-2 w-full text-left mb-2"
                  >
                    <ChevronDown aria-hidden="true" className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isCollapsed ? "-rotate-90" : ""}`} />
                    <h2 className="text-sm font-semibold text-primary">{group.label}</h2>
                    <span className="text-xs text-muted-foreground">({group.plans.length})</span>
                  </button>
                  {!isCollapsed && (
                    <ul className="space-y-2 ml-6">
                      {group.plans.map((plan) => (
                        <PlanRow
                          key={plan.id}
                          plan={plan}
                          planProducts={planProductsByPlan.get(plan.id!) ?? []}
                          planFillings={planFillingsByPlan.get(plan.id!) ?? []}
                          doneKeys={doneKeysByPlan.get(plan.id!) ?? EMPTY_SET}
                          productMap={productMap}
                          mouldMap={mouldMap}
                          fillingMap={fillingMap}
                          confirmDeleteId={confirmDeleteId}
                          onConfirmDelete={setConfirmDeleteId}
                          onDelete={async (id) => { await deleteProductionPlan(id); setConfirmDeleteId(null); }}
                        />
                      ))}
                    </ul>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((plan) => (
              <PlanRow
                key={plan.id}
                plan={plan}
                planProducts={planProductsByPlan.get(plan.id!) ?? []}
                planFillings={planFillingsByPlan.get(plan.id!) ?? []}
                doneKeys={doneKeysByPlan.get(plan.id!) ?? EMPTY_SET}
                productMap={productMap}
                mouldMap={mouldMap}
                fillingMap={fillingMap}
                confirmDeleteId={confirmDeleteId}
                onConfirmDelete={setConfirmDeleteId}
                onDelete={async (id) => { await deleteProductionPlan(id); setConfirmDeleteId(null); }}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

const EMPTY_SET: Set<string> = new Set();

// Key formats (must stay in sync with production.ts generateSteps):
//   colour:  color-{planProductId}  or  color-{planProductId}-{i}
//   shell:   shell-{coating}-{mouldId}
//   filling: filling-{planProductId}-{fillingId}
//   fill:    fill-{planProductId}
//   cap:     cap-{coating}-{mouldId}
//   unmould: unmould-{planProductId}
function lastActivityForProduct(planProductId: string, doneKeys: Set<string>): string | null {
  // Match both legacy single-slot keys (`shell-${pbId}`) and per-slot keys for
  // products with alternative mould setups (`shell-${pbId}-${slotId}`).
  const anyWithPrefix = (prefix: string) => [...doneKeys].some((k) => k === prefix || k.startsWith(`${prefix}-`));
  const checks: { rank: number; label: string; matched: boolean }[] = [
    { rank: 1, label: "Mould coloured", matched: anyWithPrefix(`color-${planProductId}`) },
    { rank: 2, label: "Shell done", matched: anyWithPrefix(`shell-${planProductId}`) },
    { rank: 3, label: "Fillings in progress", matched: [...doneKeys].some((k) => k.startsWith(`filling-${planProductId}-`)) },
    { rank: 4, label: "Filled", matched: anyWithPrefix(`fill-${planProductId}`) },
    { rank: 5, label: "Capped", matched: anyWithPrefix(`cap-${planProductId}`) },
    { rank: 6, label: "Unmoulded", matched: doneKeys.has(`unmould-${planProductId}`) },
  ];
  let best: { rank: number; label: string } | null = null;
  for (const check of checks) {
    if (check.matched && (!best || check.rank > best.rank)) best = check;
  }
  return best?.label ?? null;
}

function PlanRow({
  plan, planProducts, planFillings, doneKeys, productMap, mouldMap, fillingMap,
  confirmDeleteId, onConfirmDelete, onDelete,
}: {
  plan: ProductionPlan;
  planProducts: PlanProduct[];
  planFillings: PlanFilling[];
  doneKeys: Set<string>;
  productMap: Map<string, Product>;
  mouldMap: Map<string, Mould>;
  fillingMap: Map<string, Filling>;
  confirmDeleteId: string | null;
  onConfirmDelete: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const totalFillingG = useMemo(
    () => planFillings.reduce((s, pf) => s + (pf.actualYieldG ?? pf.targetGrams ?? 0), 0),
    [planFillings],
  );
  const isFillingsOnly = planProducts.length === 0 && planFillings.length > 0;
  const isHybrid = planProducts.length > 0 && planFillings.length > 0;
  const totalProducts = useMemo(
    () => planProducts.reduce((sum, pb) => {
      if (pb.actualYield != null) return sum + pb.actualYield;
      return sum + getTotalCavities(pb, mouldMap);
    }, 0),
    [planProducts, mouldMap]
  );

  // eslint-disable-next-line react-hooks/purity -- "started N days ago" is a render-time snapshot
  const daysSinceCreated = Math.floor((Date.now() - new Date(plan.createdAt).getTime()) / 86_400_000);
  const ageLabel = plan.status === "done"
    ? null
    : daysSinceCreated === 0
      ? "Started today"
      : daysSinceCreated === 1
        ? "Started yesterday"
        : `Started ${daysSinceCreated} days ago`;

  return (
    <li
      className="rounded-lg border border-border bg-card overflow-hidden"
      style={{ contentVisibility: "auto", containIntrinsicSize: "0 120px" }}
    >
      <div className="flex items-center">
        <Link href={`/production/${encodeURIComponent(plan.id ?? '')}`} className="flex-1 flex items-center gap-3 p-3 min-w-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-medium text-sm truncate">{plan.name}</h3>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${STATUS_STYLE[plan.status]}`}>
                {STATUS_LABEL[plan.status]}
              </span>
            </div>
            {plan.batchNumber && (
              <p className="font-mono text-[10px] text-muted-foreground mt-0.5">{plan.batchNumber}</p>
            )}
            {ageLabel && (
              <p className="text-xs text-muted-foreground mt-0.5">{ageLabel}</p>
            )}
            {plan.notes && (
              <p className="text-xs text-muted-foreground italic mt-0.5 flex items-start gap-1">
                <StickyNote className="w-3 h-3 shrink-0 mt-0.5" />
                <span className="line-clamp-2">{plan.notes}</span>
              </p>
            )}
            {(isFillingsOnly || isHybrid) && (
              <span className="inline-flex items-center gap-1 mt-1 rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
                <Sprout className="w-3 h-3" />
                {isHybrid ? "Products + filling batches" : "Fillings only"}
              </span>
            )}
            {plan.status === "done" && (
              <div className="mt-0.5 space-y-0.5">
                <p className="text-xs text-muted-foreground">
                  {new Date(plan.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                </p>
                {planProducts.length > 0 && (
                  <>
                    {totalProducts > 0 && (
                      <p className="text-xs font-medium mt-0.5">{totalProducts} products total</p>
                    )}
                    <ul className="mt-1 space-y-0.5">
                      {planProducts.map((pb) => {
                        const product = productMap.get(pb.productId);
                        const planned = getTotalCavities(pb, mouldMap);
                        const productCount = pb.actualYield ?? (planned > 0 ? planned : null);
                        const mouldLabel = hasAlternativeMouldSetup(pb)
                          ? formatMouldList(pb, mouldMap)
                          : `${pb.quantity} mould${pb.quantity !== 1 ? "s" : ""}`;
                        return (
                          <li key={pb.id}>
                            <div className="flex items-baseline gap-1 min-w-0 flex-wrap">
                              <span className="text-xs text-foreground truncate">{product?.name ?? "Unknown"}</span>
                              <span className="text-[10px] text-muted-foreground shrink-0">
                                · {mouldLabel}{productCount !== null ? ` · ${productCount} pcs` : ""}
                              </span>
                            </div>
                            {pb.notes && (
                              <p className="text-[10px] text-muted-foreground italic mt-0.5 flex items-start gap-1">
                                <StickyNote className="w-3 h-3 shrink-0 mt-px" />
                                <span className="line-clamp-1">{pb.notes}</span>
                              </p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}
              </div>
            )}
            {plan.status !== "done" && planFillings.length > 0 && (
              <div className="mt-1.5">
                <p className="text-xs font-medium">
                  {planFillings.length} filling batch{planFillings.length === 1 ? "" : "es"}
                  {totalFillingG > 0 ? ` · ${totalFillingG}g total` : ""}
                </p>
                <ul className="mt-1 space-y-0.5">
                  {planFillings.map((pf) => {
                    const filling = fillingMap.get(pf.fillingId);
                    return (
                      <li key={pf.id}>
                        <div className="flex items-center gap-1 min-w-0 flex-wrap">
                          <span className="text-xs text-foreground truncate">{filling?.name ?? "Unknown filling"}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">· {pf.targetGrams}g</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {plan.status === "done" && planFillings.length > 0 && (
              <div className="mt-0.5">
                <p className="text-xs font-medium mt-0.5">
                  {planFillings.length} filling batch{planFillings.length === 1 ? "" : "es"}
                  {totalFillingG > 0 ? ` · ${totalFillingG}g` : ""}
                </p>
                <ul className="mt-0.5 space-y-0.5">
                  {planFillings.map((pf) => {
                    const filling = fillingMap.get(pf.fillingId);
                    const actual = pf.actualYieldG ?? pf.targetGrams;
                    return (
                      <li key={pf.id}>
                        <div className="flex items-center gap-1 min-w-0 flex-wrap">
                          <span className="text-xs text-foreground truncate">{filling?.name ?? "Unknown filling"}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">· {actual}g</span>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
            {plan.status !== "done" && planProducts.length > 0 && (
              <>
                {totalProducts > 0 && (
                  <p className="text-xs font-medium mt-1.5">{totalProducts} products total</p>
                )}
                <ul className="mt-1 space-y-0.5">
                  {planProducts.map((pb) => {
                    const product = productMap.get(pb.productId);
                    const totalCavities = getTotalCavities(pb, mouldMap);
                    const productCount = totalCavities > 0 ? totalCavities : null;
                    const mouldLabel = hasAlternativeMouldSetup(pb)
                      ? formatMouldList(pb, mouldMap)
                      : `${pb.quantity} mould${pb.quantity !== 1 ? "s" : ""}`;
                    const lastActivity = lastActivityForProduct(pb.id!, doneKeys);
                    return (
                      <li key={pb.id}>
                        <div className="flex items-center gap-1 min-w-0 flex-wrap">
                          <span className="text-xs text-foreground truncate">{product?.name ?? "Unknown"}</span>
                          <span className="text-[10px] text-muted-foreground shrink-0">
                            · {mouldLabel}{productCount !== null ? ` · ${productCount} pcs` : ""}
                          </span>
                          {lastActivity ? (
                            <span className="text-[10px] text-primary/80 shrink-0">· {lastActivity}</span>
                          ) : (
                            <span className="text-[10px] text-muted-foreground shrink-0">· Not started</span>
                          )}
                        </div>
                        {pb.notes && (
                          <p className="text-[10px] text-muted-foreground italic mt-0.5 line-clamp-1">{pb.notes}</p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
        </Link>
        <div className="flex items-center gap-1 pr-2">
          {(planProducts.length > 0 || planFillings.length > 0) && (
            <Link
              href={`/production/${encodeURIComponent(plan.id ?? '')}/products`}
              className="p-1.5 rounded-full hover:bg-muted transition-colors"
              aria-label="View scaled recipes"
            >
              <BookOpen className="w-4 h-4 text-muted-foreground" />
            </Link>
          )}
          <Link
            href={`/production/new?from=${encodeURIComponent(plan.id ?? '')}`}
            className="p-1.5 rounded-full hover:bg-muted transition-colors"
            aria-label="Duplicate batch"
            title="Duplicate batch"
          >
            <Copy className="w-4 h-4 text-muted-foreground" />
          </Link>
          {confirmDeleteId === plan.id ? (
            <button
              onClick={() => onDelete(plan.id!)}
              className="p-1.5 rounded-full bg-destructive/10 text-destructive text-xs font-medium"
            >
              Confirm
            </button>
          ) : (
            <button
              onClick={() => onConfirmDelete(plan.id!)}
              className="p-1.5 rounded-full hover:bg-muted transition-colors"
              aria-label={`Delete ${plan.name}`}
            >
              <Trash2 className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>
      </div>
    </li>
  );
}
