"use client";

import { useMemo, useState } from "react";
import {
  useProductionPlan, usePlanProducts, usePlanFillings, useProductsList,
  useProductFillingsForProducts, useFillings, useFillingIngredientsForFillings,
  useIngredients, useMouldsList, setIngredientLowStock, useShelfStableCategoryNames,
  useAllFillingComponentsByFilling, useAllFillingIngredientsByFilling,
} from "@/lib/hooks";
import { calculateFillingAmounts, calculateStandaloneFillingAmounts, consolidateSharedFillings, expandNestedFillings, attachScaledNestedFillings, topoSortFillingsChildrenFirst } from "@/lib/production";
import type { ConsolidatedFilling } from "@/lib/production";
import type { Filling, Mould, PlanProduct, PlanFilling } from "@/types";
import { ArrowLeft, Sprout, Layers, ArrowRight } from "lucide-react";
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

  // Nested-filling expansion (Phase 3): for every host filling on the plan,
  // walk `fillingComponents` and surface each nested child as its own batch
  // entry. Reads the *full* tables (not just the host fillings) because the
  // walk might dive into fillings that aren't directly on any product.
  const allFillingComponentsByFilling = useAllFillingComponentsByFilling();
  const allFillingIngredientsByFilling = useAllFillingIngredientsByFilling();
  const fillingAmountsWithNested = useMemo(() => {
    // Annotate each host with its direct nested-component rows so the
    // production card can render them inline alongside ingredients. Mutates
    // the array in place — but we call it before spreading, so the new
    // memoized array has the annotation.
    attachScaledNestedFillings(
      fillingAmounts,
      allFillingComponentsByFilling,
      allFillingIngredientsByFilling,
      fillingsMap,
    );
    const nested = expandNestedFillings(
      fillingAmounts.filter((la) => !la.isFromPreviousBatch),
      allFillingComponentsByFilling,
      allFillingIngredientsByFilling,
      fillingsMap,
    );
    // Annotate the synthetic nested-host rows too — a grandparent (A→B→C)
    // means B's batch card should also list C as a nested filling.
    attachScaledNestedFillings(
      nested,
      allFillingComponentsByFilling,
      allFillingIngredientsByFilling,
      fillingsMap,
    );
    return [...fillingAmounts, ...nested];
  }, [fillingAmounts, allFillingComponentsByFilling, allFillingIngredientsByFilling, fillingsMap]);

  // Consolidate product-driven fillings (host + nested). Shared fillings appear
  // once with summed amounts. Then topo-sort so children show up before hosts —
  // chocolatier ergonomics: you make the inner filling first.
  const productConsolidated = useMemo(() => {
    const consolidated = consolidateSharedFillings(fillingAmountsWithNested.filter((la) => !la.isFromPreviousBatch));
    return topoSortFillingsChildrenFirst(consolidated, allFillingComponentsByFilling);
  }, [fillingAmountsWithNested, allFillingComponentsByFilling]);

  // Standalone filling batches (PlanFilling rows) — each gets its own card.
  // Shaped as ConsolidatedFilling so the same renderer can be reused; marked
  // with `isStandaloneBatch` via the synthetic "Filling batch" usedBy entry.
  const standaloneConsolidated = useMemo<Array<ConsolidatedFilling & { planFillingId: string }>>(() => {
    const amounts = calculateStandaloneFillingAmounts(planFillings, fillingsMap, fillingIngredientsMap, allFillingComponentsByFilling);
    return amounts.map((sf) => ({
      fillingId: sf.fillingId,
      fillingName: sf.fillingName,
      totalWeightG: sf.targetGrams,
      scaledIngredients: sf.scaledIngredients,
      scaledNestedFillings: sf.scaledNestedFillings,
      usedBy: [{ planProductId: `pf-${sf.planFillingId}`, productName: "Filling batch", weightG: sf.targetGrams }],
      shared: false,
      planFillingId: sf.planFillingId,
    }));
  }, [planFillings, fillingsMap, fillingIngredientsMap, allFillingComponentsByFilling]);

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

  // Lookup of fillingId → tabKey so a nested-filling row on a host card can
  // jump to that filling's own tab. Only fillings that have their own tab in
  // this plan get a key; rows that nest a filling-from-previous-stock just
  // render as plain text (no tab to switch to).
  const tabKeyByFillingId = useMemo(() => {
    const m = new Map<string, string>();
    for (const e of entries) m.set(e.cl.fillingId, e.tabKey);
    return m;
  }, [entries]);

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
            planProducts={planProducts}
            productsMap={productsMap}
            mouldsMap={mouldsMap}
            tabKeyByFillingId={tabKeyByFillingId}
            onSwitchTab={setActiveTabKey}
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
  planProducts, productsMap, mouldsMap,
  tabKeyByFillingId, onSwitchTab,
}: {
  cl: ConsolidatedFilling;
  filling: Filling | undefined;
  ingredientsMap: Map<string, { id: string; name: string; lowStock?: boolean }>;
  multiplier?: number;
  kind?: "product" | "standalone";
  planProducts?: PlanProduct[];
  productsMap?: Map<string, { id?: string; defaultMouldId?: string; fillMode?: "percentage" | "grams" }>;
  mouldsMap?: Map<string, Mould>;
  /** Lookup of fillingId → tabKey, populated only for fillings that have their
   *  own card in this plan. A nested-filling row whose target isn't here
   *  renders as plain text (e.g. when the user is using it from prior stock). */
  tabKeyByFillingId?: Map<string, string>;
  onSwitchTab?: (tabKey: string) => void;
}) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // For grams-mode products, flag any usage where the planned mould isn't the
  // product's default — that's where fillFraction has been rescaled to a
  // different per-cavity gram amount. Just a heads-up so the user knows the
  // recipe was adjusted to fit the chosen mould.
  const rescaledUsages = useMemo(() => {
    if (kind !== "product" || !planProducts || !productsMap || !mouldsMap) return new Set<string>();
    const out = new Set<string>();
    for (const u of cl.usedBy) {
      const pp = planProducts.find((p) => p.id === u.planProductId);
      if (!pp) continue;
      const product = productsMap.get(pp.productId);
      if (product?.fillMode !== "grams") continue;
      if (product.defaultMouldId && pp.mouldId && product.defaultMouldId !== pp.mouldId) {
        out.add(u.planProductId);
      }
    }
    return out;
  }, [cl.usedBy, kind, planProducts, productsMap, mouldsMap]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      {/* Header */}
      <div className="flex justify-between items-start px-3 pt-3 pb-2 bg-primary/8">
        <div>
          <h3 className="font-medium text-sm">{cl.fillingName}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {kind === "standalone" ? "Standalone batch for stock" : filling?.category}
          </p>
          {rescaledUsages.size > 0 && (
            <p className="text-[10px] text-muted-foreground italic mt-1">
              Grams scaled to the planned mould (recipe defined against the product&apos;s default mould).
            </p>
          )}
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

      {/* Nested-filling list — sub-batches that are part of this recipe.
          Renders before ingredients because chocolatiers tend to prepare the
          inner filling first, then mix it with the outer's ingredients. Each
          row links to the corresponding tab when one exists in this plan. */}
      {cl.scaledNestedFillings && cl.scaledNestedFillings.length > 0 && (
        <ul className="border-t border-border" data-testid="card-nested-fillings">
          {cl.scaledNestedFillings.map((sn) => {
            const targetTabKey = tabKeyByFillingId?.get(sn.fillingId);
            const canSwitch = !!targetTabKey && !!onSwitchTab;
            const handleClick = canSwitch
              ? () => onSwitchTab!(targetTabKey!)
              : undefined;
            return (
              <li
                key={sn.fillingId}
                className="flex items-baseline gap-2 px-3 py-2 border-b border-border last:border-b-0"
                data-testid="card-nested-filling-row"
              >
                <Layers className="w-3.5 h-3.5 text-primary shrink-0 self-center" aria-hidden />
                <div className="min-w-0 flex-1">
                  {canSwitch ? (
                    <button
                      type="button"
                      onClick={handleClick}
                      className="text-sm text-primary hover:underline inline-flex items-center gap-1"
                      title={`Open ${sn.fillingName}'s recipe tab`}
                    >
                      {sn.fillingName}
                      <ArrowRight className="w-3 h-3" aria-hidden />
                    </button>
                  ) : (
                    <span className="text-sm">{sn.fillingName}</span>
                  )}
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {canSwitch ? "Make this filling first" : "Sourced separately (e.g. previous batch)"}
                    {sn.note ? ` · ${sn.note}` : ""}
                  </p>
                </div>
                <span className="tabular-nums shrink-0 text-sm font-medium">
                  {sn.amount}{sn.unit}
                </span>
              </li>
            );
          })}
        </ul>
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
        // Pure-nested fillings have no own ingredients but do have nested rows
        // above; suppress the "no ingredients" message in that case.
        (!cl.scaledNestedFillings || cl.scaledNestedFillings.length === 0) && (
          <p className="px-3 pb-3 text-xs text-muted-foreground border-t border-border pt-2">
            No ingredients recorded for this filling.
          </p>
        )
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
