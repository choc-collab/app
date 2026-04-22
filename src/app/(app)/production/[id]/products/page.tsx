"use client";

import { useMemo, useState } from "react";
import {
  useProductionPlan, usePlanProducts, usePlanFillings, useProductsList,
  useProductFillingsForProducts, useFillings, useFillingIngredientsForFillings,
  useIngredients, useMouldsList, setIngredientLowStock, useShelfStableCategoryNames,
} from "@/lib/hooks";
import { calculateFillingAmounts, calculateStandaloneFillingAmounts, consolidateSharedFillings } from "@/lib/production";
import type { ConsolidatedFilling } from "@/lib/production";
import type { Filling, Mould, PlanProduct, PlanFilling } from "@/types";
import { ArrowLeft, Sprout } from "lucide-react";
import Link from "next/link";
import { LowStockFlagButton } from "@/components/pantry";
import { StepList } from "@/components/step-list-editor";
import { useSearchParams } from "next/navigation";
import { useSpaId } from "@/lib/use-spa-id";

export default function PlanProductsPage() {
  const planId = useSpaId("production");
  const searchParams = useSearchParams();
  const backTab = searchParams.get("back");

  const plan = useProductionPlan(planId);
  const planProducts = usePlanProducts(planId);
  const planFillings = usePlanFillings(planId);
  const products = useProductsList();
  const allFillings = useFillings();
  const moulds = useMouldsList(true);

  const productNames = useMemo(() => new Map(products.map((r) => [r.id!, r.name])), [products]);
  const fillingsMap = useMemo(() => new Map(allFillings.map((l) => [l.id!, l])), [allFillings]);
  const mouldsMap = useMemo(() => new Map(moulds.map((m) => [m.id!, m])), [moulds]);

  if (!planId || !plan) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <ProductsContent
      planId={planId}
      plan={plan}
      planProducts={planProducts}
      planFillings={planFillings}
      productNames={productNames}
      fillingsMap={fillingsMap}
      mouldsMap={mouldsMap}
      productIds={planProducts.map((pb) => pb.productId)}
      backTab={backTab}
    />
  );
}

function ProductsContent({
  planId, plan, planProducts, planFillings, productNames, fillingsMap, mouldsMap, productIds, backTab,
}: {
  planId: string;
  plan: { id?: string; name: string; fillingOverrides?: string; fillingPreviousBatches?: string };
  planProducts: PlanProduct[];
  planFillings: PlanFilling[];
  productNames: Map<string, string>;
  fillingsMap: Map<string, Filling>;
  mouldsMap: Map<string, Mould>;
  productIds: string[];
  backTab: string | null;
}) {
  const allIngredients = useIngredients();
  const shelfStableCategoryNames = useShelfStableCategoryNames();
  const products = useProductsList();
  const productsMap = useMemo(() => new Map(products.map((p) => [p.id!, p])), [products]);

  const productFillingsMap = useProductFillingsForProducts(productIds);

  // Combine product-driven filling IDs with standalone (PlanFilling) ones so
  // the ingredient-map query covers every filling whose scaled recipe appears
  // on this page.
  const planFillingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const bls of productFillingsMap.values()) {
      for (const bl of bls) ids.add(bl.fillingId);
    }
    for (const pf of planFillings) ids.add(pf.fillingId);
    return Array.from(ids);
  }, [productFillingsMap, planFillings]);

  const fillingIngredientsMap = useFillingIngredientsForFillings(planFillingIds);

  const ingredientsMap = useMemo(() => new Map(allIngredients.map((i) => [i.id!, i as { id: string; name: string; lowStock?: boolean }])), [allIngredients]);

  const fillingOverrides = useMemo<Record<string, number>>(() => {
    if (!plan.fillingOverrides) return {};
    try { return JSON.parse(plan.fillingOverrides); } catch { return {}; }
  }, [plan.fillingOverrides]);

  const fillingPreviousBatches = useMemo<Record<string, import("@/types").FillingPreviousBatch>>(() => {
    if (!plan.fillingPreviousBatches) return {};
    try { return JSON.parse(plan.fillingPreviousBatches); } catch { return {}; }
  }, [plan.fillingPreviousBatches]);

  const fillingAmounts = useMemo(() =>
    calculateFillingAmounts(planProducts, productNames, productFillingsMap, fillingIngredientsMap, fillingsMap, mouldsMap, fillingOverrides, fillingPreviousBatches, productsMap, shelfStableCategoryNames),
    [planProducts, productNames, productFillingsMap, fillingIngredientsMap, fillingsMap, mouldsMap, fillingOverrides, fillingPreviousBatches, productsMap, shelfStableCategoryNames]
  );

  // Consolidate product-driven fillings: shared fillings appear once with summed amounts.
  const productConsolidated = useMemo(() =>
    consolidateSharedFillings(fillingAmounts.filter((la) => !la.isFromPreviousBatch)),
    [fillingAmounts]
  );

  // Standalone filling batches (PlanFilling rows) — each gets its own card.
  // Shaped as ConsolidatedFilling so the same renderer can be reused; marked
  // with `isStandaloneBatch` via the synthetic "Filling batch" usedBy entry.
  const standaloneConsolidated = useMemo<Array<ConsolidatedFilling & { planFillingId: string }>>(() => {
    const amounts = calculateStandaloneFillingAmounts(planFillings, fillingsMap, fillingIngredientsMap);
    return amounts.map((sf) => ({
      fillingId: sf.fillingId,
      fillingName: sf.fillingName,
      totalWeightG: sf.targetGrams,
      scaledIngredients: sf.scaledIngredients,
      usedBy: [{ planProductId: `pf-${sf.planFillingId}`, productName: "Filling batch", weightG: sf.targetGrams }],
      shared: false,
      planFillingId: sf.planFillingId,
    }));
  }, [planFillings, fillingsMap, fillingIngredientsMap]);

  // Merged list for tab rendering — product-driven fillings first, then
  // standalone batches. Tab keys are distinct (filling-X for product-driven,
  // planfilling-Y for standalone) so hybrid plans can show both.
  type Entry = { tabKey: string; cl: ConsolidatedFilling; kind: "product" | "standalone" };
  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [];
    for (const cl of productConsolidated) list.push({ tabKey: `filling-${cl.fillingId}`, cl, kind: "product" });
    for (const sc of standaloneConsolidated) list.push({ tabKey: `planfilling-${sc.planFillingId}`, cl: sc, kind: "standalone" });
    return list;
  }, [productConsolidated, standaloneConsolidated]);

  const backHref = `/production/${encodeURIComponent(planId)}${backTab ? `?tab=${backTab}` : ""}`;

  const [activeTabKey, setActiveTabKey] = useState<string | null>(null);
  const currentTabKey = activeTabKey ?? entries[0]?.tabKey ?? null;
  const activeEntry = entries.find((e) => e.tabKey === currentTabKey);

  if (entries.length === 0) {
    return (
      <div>
        <div className="px-4 pt-6 pb-4">
          <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3">
            <ArrowLeft className="w-4 h-4" /> {plan.name}
          </Link>
          <h1 className="text-xl font-bold">Scaled recipes</h1>
        </div>
        <p className="px-4 text-sm text-muted-foreground">
          No fillings found. Add fillings to the plan&rsquo;s products (or add standalone filling batches) with ingredients assigned.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 pt-6 pb-3">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3">
          <ArrowLeft className="w-4 h-4" /> {plan.name}
        </Link>
        <h1 className="text-xl font-bold">Scaled recipes</h1>
        <p className="text-sm text-muted-foreground mt-0.5">Amounts scaled to this batch</p>
      </div>

      {/* Tab strip — one tab per filling (product-driven + standalone batches) */}
      {entries.length > 1 && (
        <div className="px-4 pb-4 flex gap-1 flex-wrap">
          {entries.map(({ tabKey, cl, kind }) => {
            const active = tabKey === currentTabKey;
            return (
              <button
                key={tabKey}
                onClick={() => setActiveTabKey(tabKey)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {kind === "standalone" && <Sprout className="w-3.5 h-3.5" aria-hidden="true" />}
                {cl.fillingName}
                {kind === "product" && cl.shared && (
                  <span className={`text-[10px] px-1 py-0.5 rounded ${
                    active
                      ? "bg-accent-foreground/20 text-accent-foreground"
                      : "bg-accent/10 text-accent-foreground"
                  }`}>
                    {cl.usedBy.length} products
                  </span>
                )}
                {kind === "standalone" && (
                  <span className={`text-[10px] px-1 py-0.5 rounded ${
                    active
                      ? "bg-accent-foreground/20 text-accent-foreground"
                      : "bg-accent/10 text-accent-foreground"
                  }`}>
                    Batch
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Active filling card */}
      <div className="px-4 pb-8">
        {activeEntry ? (
          <FillingProductCard
            cl={activeEntry.cl}
            filling={fillingsMap.get(activeEntry.cl.fillingId)}
            ingredientsMap={ingredientsMap}
            multiplier={activeEntry.kind === "product" ? fillingOverrides[activeEntry.cl.fillingId] : undefined}
            kind={activeEntry.kind}
          />
        ) : (
          <p className="text-sm text-muted-foreground py-2">No filling selected.</p>
        )}
      </div>
    </div>
  );
}

function FillingProductCard({
  cl, filling, ingredientsMap, multiplier, kind = "product",
}: {
  cl: ConsolidatedFilling;
  filling: Filling | undefined;
  ingredientsMap: Map<string, { id: string; name: string; lowStock?: boolean }>;
  multiplier?: number;
  kind?: "product" | "standalone";
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-start px-3 pt-3 pb-2 bg-primary/8">
        <div>
          <h3 className="font-medium text-sm">{cl.fillingName}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {kind === "standalone" ? "Standalone batch for stock" : filling?.category}
          </p>
        </div>
        <div className="text-right shrink-0 ml-3">
          <span className="text-sm font-semibold tabular-nums">{cl.totalWeightG}g</span>
          {multiplier !== undefined && multiplier !== 1 && (
            <p className="text-[10px] text-status-warn">{multiplier}× batch</p>
          )}
        </div>
      </div>

      {/* Shared breakdown — which products use this filling (product-driven only) */}
      {kind === "product" && cl.shared && (
        <div className="border-t border-border px-3 py-2 bg-muted/30">
          <p className="text-xs font-medium text-muted-foreground mb-1">Used in</p>
          <div className="flex flex-wrap gap-x-3 gap-y-0.5">
            {cl.usedBy.map((u) => (
              <span key={u.planProductId} className="text-xs text-foreground">
                {u.productName} <span className="text-muted-foreground tabular-nums">{u.weightG}g</span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Ingredient list */}
      {cl.scaledIngredients.length > 0 ? (
        <ul className="border-t border-border">
          {cl.scaledIngredients.map((si, idx) => {
            const ing = ingredientsMap.get(si.ingredientId);
            const active = hoveredId === si.ingredientId;
            return (
              <li
                key={idx}
                onMouseEnter={() => setHoveredId(si.ingredientId)}
                onMouseLeave={() => setHoveredId(null)}
                className={`flex items-baseline gap-2 px-3 py-2 border-b border-border last:border-b-0 transition-colors ${
                  active ? "bg-muted" : ""
                }`}
              >
                <div className="min-w-0 flex-1">
                  <span className={`text-sm ${active ? "font-medium" : ""}`}>
                    {ing?.name ?? `Ingredient #${si.ingredientId}`}
                  </span>
                  {si.note && (
                    <p className="text-xs text-muted-foreground mt-0.5">{si.note}</p>
                  )}
                </div>
                <span className={`tabular-nums shrink-0 ${active ? "text-base font-bold text-primary" : "text-sm font-medium"}`}>
                  {si.amount}{si.unit}
                </span>
                <LowStockFlagButton
                  flagged={ing?.lowStock}
                  itemName={ing?.name}
                  onFlag={() => { if (ing?.id) setIngredientLowStock(ing.id, true); }}
                  size="sm"
                />
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="px-3 pb-3 text-xs text-muted-foreground border-t border-border pt-2">
          No ingredients recorded for this filling.
        </p>
      )}

      {/* Instructions — always visible if present */}
      {filling?.instructions?.trim() && (
        <div className="border-t border-border px-3 py-3">
          <p className="text-xs font-medium text-muted-foreground mb-1">Instructions</p>
          <StepList text={filling.instructions} className="text-foreground leading-relaxed" />
        </div>
      )}
    </div>
  );
}
