"use client";

import { useMemo, useState } from "react";
import {
  useProductionPlan, usePlanProducts, useProductsList,
  useProductFillingsForProducts, useFillings, useFillingIngredientsForFillings,
  useIngredients, useMouldsList, setIngredientLowStock, useShelfStableCategoryNames,
} from "@/lib/hooks";
import { calculateFillingAmounts, consolidateSharedFillings } from "@/lib/production";
import type { ConsolidatedFilling } from "@/lib/production";
import type { Filling, Mould, PlanProduct } from "@/types";
import { ArrowLeft } from "lucide-react";
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
      productNames={productNames}
      fillingsMap={fillingsMap}
      mouldsMap={mouldsMap}
      productIds={planProducts.map((pb) => pb.productId)}
      backTab={backTab}
    />
  );
}

function ProductsContent({
  planId, plan, planProducts, productNames, fillingsMap, mouldsMap, productIds, backTab,
}: {
  planId: string;
  plan: { id?: string; name: string; fillingOverrides?: string; fillingPreviousBatches?: string };
  planProducts: PlanProduct[];
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

  const planFillingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const bls of productFillingsMap.values()) {
      for (const bl of bls) ids.add(bl.fillingId);
    }
    return Array.from(ids);
  }, [productFillingsMap]);

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

  // Consolidate fillings: shared fillings appear once with summed amounts
  const consolidated = useMemo(() =>
    consolidateSharedFillings(fillingAmounts.filter((la) => !la.isFromPreviousBatch)),
    [fillingAmounts]
  );

  const backHref = `/production/${encodeURIComponent(planId)}${backTab ? `?tab=${backTab}` : ""}`;

  const [activeFillingId, setActiveFillingId] = useState<string | null>(null);
  const currentFillingId = activeFillingId ?? consolidated[0]?.fillingId ?? null;
  const activeConsolidated = consolidated.find((cl) => cl.fillingId === currentFillingId);

  if (consolidated.length === 0) {
    return (
      <div>
        <div className="px-4 pt-6 pb-4">
          <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3">
            <ArrowLeft className="w-4 h-4" /> {plan.name}
          </Link>
          <h1 className="text-xl font-bold">Scaled recipes</h1>
        </div>
        <p className="px-4 text-sm text-muted-foreground">
          No fillings found. Make sure the products in this plan have fillings with ingredients assigned.
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

      {/* Tab strip — one tab per filling */}
      {consolidated.length > 1 && (
        <div className="px-4 pb-4 flex gap-1 flex-wrap">
          {consolidated.map((cl) => {
            const active = cl.fillingId === currentFillingId;
            return (
              <button
                key={cl.fillingId}
                onClick={() => setActiveFillingId(cl.fillingId)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  active
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {cl.fillingName}
                {cl.shared && (
                  <span className={`text-[10px] px-1 py-0.5 rounded ${
                    active
                      ? "bg-accent-foreground/20 text-accent-foreground"
                      : "bg-accent/10 text-accent-foreground"
                  }`}>
                    {cl.usedBy.length} products
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Active filling card */}
      <div className="px-4 pb-8">
        {activeConsolidated ? (
          <FillingProductCard
            cl={activeConsolidated}
            filling={fillingsMap.get(activeConsolidated.fillingId)}
            ingredientsMap={ingredientsMap}
            multiplier={fillingOverrides[activeConsolidated.fillingId]}
          />
        ) : (
          <p className="text-sm text-muted-foreground py-2">No filling selected.</p>
        )}
      </div>
    </div>
  );
}

function FillingProductCard({
  cl, filling, ingredientsMap, multiplier,
}: {
  cl: ConsolidatedFilling;
  filling: Filling | undefined;
  ingredientsMap: Map<string, { id: string; name: string; lowStock?: boolean }>;
  multiplier?: number;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-start px-3 pt-3 pb-2 bg-primary/8">
        <div>
          <h3 className="font-medium text-sm">{cl.fillingName}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{filling?.category}</p>
        </div>
        <div className="text-right shrink-0 ml-3">
          <span className="text-sm font-semibold tabular-nums">{cl.totalWeightG}g</span>
          {multiplier !== undefined && multiplier !== 1 && (
            <p className="text-[10px] text-status-warn">{multiplier}× batch</p>
          )}
        </div>
      </div>

      {/* Shared breakdown — which products use this filling */}
      {cl.shared && (
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
