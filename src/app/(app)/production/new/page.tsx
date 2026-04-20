"use client";

import { useState, useMemo, useEffect, Suspense } from "react";
import { useProductsList, useMouldsList, useProductFillingsForProducts, useFillingIngredientsForFillings, useIngredients, saveProductionPlan, savePlanProduct, toggleStep, useFillings, usePlanProducts, generateBatchNumber, useProductStockAlerts, useCollections, useAllCollectionProducts, useFillingStockItems, useShelfStableCategoryNames } from "@/lib/hooks";
import { AlertTriangle, ArrowLeft, Check, ChevronDown, History, PackageX, Plus, ShoppingCart, X } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Product, Mould, PlanProduct, PlanProductAdditionalMould, FillingPreviousBatch } from "@/types";
import { FILL_FACTOR, DENSITY_G_PER_ML, generateBatchSummary, generateSteps, calculateFillingAmounts, getTotalCavities } from "@/lib/production";
import { YieldModal } from "@/components/yield-modal";
import type { YieldEntry } from "@/components/yield-modal";

// Per-product ingredient stock issues
interface IngredientIssue {
  ingredientId: string;
  name: string;
  status: "outOfStock" | "lowStock" | "ordered";
}

export default function NewProductionPlanPage() {
  return (
    <Suspense fallback={<div className="px-4 pt-6"><p className="text-sm text-muted-foreground">Loading…</p></div>}>
      <NewPlanContent />
    </Suspense>
  );
}

function NewPlanContent() {
  const searchParams = useSearchParams();
  const fromPlanId = searchParams.get("from") ?? undefined;

  const products = useProductsList();
  const moulds = useMouldsList(true);
  const allFillings = useFillings();
  const shelfStableCategoryNames = useShelfStableCategoryNames();
  const collections = useCollections();
  const allCollectionProducts = useAllCollectionProducts();
  const router = useRouter();

  const [phase, setPhase] = useState<"select" | "configure" | "batch-sizes">("select");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set<string>());
  // `partialCavities` / `additionalMoulds` stay undefined/empty for the default
  // single-mould path so persisted PlanProducts match the legacy shape unless the
  // user opens the "Alternative mould setup" disclosure.
  type ProductConfig = {
    mouldId: string | "";
    quantity: number;
    partialCavities?: number;
    additionalMoulds: PlanProductAdditionalMould[];
  };
  const [config, setConfig] = useState<Record<string, ProductConfig>>({});
  // Product IDs whose alternative-mould-setup disclosure is expanded.
  const [altOpen, setAltOpen] = useState<Set<string>>(new Set<string>());
  const [fillingMultipliers, setFillingMultipliers] = useState<Record<string, number>>({});
  const [fillingPreviousBatches, setFillingPreviousBatches] = useState<Record<string, FillingPreviousBatch>>({});
  const [planName, setPlanName] = useState(() => {
    const d = new Date();
    return `Batch — ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
  });
  const [saving, setSaving] = useState(false);
  const [initialized, setInitialized] = useState(!fromPlanId);
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [isPastBatch, setIsPastBatch] = useState(false);
  const [completedDateStr, setCompletedDateStr] = useState(() => new Date().toISOString().slice(0, 10));
  const [batchNote, setBatchNote] = useState("");
  const [productNotes, setProductNotes] = useState<Record<string, string>>({});
  // Yield modal for past batches
  const [yieldModal, setYieldModal] = useState<{ entries: YieldEntry[]; pendingFinalize: ((entries: YieldEntry[]) => Promise<void>) | null } | null>(null);
  // Which product cards have their ingredient warning expanded
  const [expandedWarnings, setExpandedWarnings] = useState<Set<string>>(new Set<string>());
  // Collection filter — default ON so active-collection products are prioritised
  const [filterToActiveCollection, setFilterToActiveCollection] = useState(true);

  // Load source plan products when duplicating
  const sourcePlanProducts = usePlanProducts(fromPlanId);

  // Pre-populate from source plan on first load
  useEffect(() => {
    if (!fromPlanId || initialized || sourcePlanProducts.length === 0) return;
    const ids = new Set(sourcePlanProducts.map((pb) => pb.productId));
    setSelectedIds(ids);
    const cfg: Record<string, ProductConfig> = {};
    const reopened = new Set<string>();
    for (const pb of sourcePlanProducts) {
      cfg[pb.productId] = {
        mouldId: pb.mouldId,
        quantity: pb.quantity,
        partialCavities: pb.partialCavities,
        additionalMoulds: (pb.additionalMoulds ?? []).map((am) => ({ ...am })),
      };
      if (pb.partialCavities != null || (pb.additionalMoulds?.length ?? 0) > 0) {
        reopened.add(pb.productId);
      }
    }
    setConfig(cfg);
    if (reopened.size > 0) setAltOpen(reopened);
    setPhase("configure");
    setInitialized(true);
  }, [sourcePlanProducts, fromPlanId, initialized]);

  const allIngredients = useIngredients();
  const selectedProducts = products.filter((r) => selectedIds.has(r.id!));
  const selectedProductIds = useMemo(() => Array.from(selectedIds), [selectedIds]);
  const productFillingsMap = useProductFillingsForProducts(selectedProductIds);
  const allSelectedFillingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [, rls] of productFillingsMap) for (const rl of rls) ids.add(rl.fillingId);
    return Array.from(ids);
  }, [productFillingsMap]);
  const fillingIngredientsMap = useFillingIngredientsForFillings(allSelectedFillingIds);

  // --- Stock awareness: load all product fillings + ingredients for the select phase ---
  const allProductIds = useMemo(() => products.map((r) => r.id!).filter(Boolean), [products]);
  const allProductsFillingsMap = useProductFillingsForProducts(allProductIds);
  const allProductsFillingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const [, rls] of allProductsFillingsMap) for (const rl of rls) ids.add(rl.fillingId);
    return Array.from(ids);
  }, [allProductsFillingsMap]);
  const allProductsIngredientMap = useFillingIngredientsForFillings(allProductsFillingIds);

  // Product-level stock alerts (from completed batches flagged as "low" or "gone")
  const productStockAlerts = useProductStockAlerts();

  // Ingredient-level issues per product (deduped by ingredient)
  const ingredientIssuesByProduct = useMemo(() => {
    const ingredientById = new Map(allIngredients.map((i) => [i.id!, i]));
    const result = new Map<string, IngredientIssue[]>();

    for (const product of products) {
      const seen = new Set<string>();
      const issues: IngredientIssue[] = [];
      const fillings = allProductsFillingsMap.get(product.id!) ?? [];
      for (const rl of fillings) {
        const fillingIngredients = allProductsIngredientMap.get(rl.fillingId) ?? [];
        for (const li of fillingIngredients) {
          if (seen.has(li.ingredientId)) continue;
          const ing = ingredientById.get(li.ingredientId);
          if (!ing) continue;
          if (ing.outOfStock) {
            seen.add(li.ingredientId);
            issues.push({ ingredientId: li.ingredientId, name: ing.name, status: "outOfStock" });
          } else if (ing.lowStock && ing.lowStockOrdered) {
            seen.add(li.ingredientId);
            issues.push({ ingredientId: li.ingredientId, name: ing.name, status: "ordered" });
          } else if (ing.lowStock) {
            seen.add(li.ingredientId);
            issues.push({ ingredientId: li.ingredientId, name: ing.name, status: "lowStock" });
          }
        }
      }
      if (issues.length > 0) result.set(product.id!, issues);
    }
    return result;
  }, [products, allProductsFillingsMap, allProductsIngredientMap, allIngredients]);

  // Active collections: startDate <= today, endDate unset or >= today
  const today = new Date().toISOString().slice(0, 10);
  const activeCollectionIds = useMemo(() => new Set(
    collections
      .filter((c) => c.startDate <= today && (!c.endDate || c.endDate >= today))
      .map((c) => c.id!)
  ), [collections, today]);

  const hasActiveCollections = activeCollectionIds.size > 0;

  const activeCollectionProductIds = useMemo(() => new Set(
    allCollectionProducts
      .filter((cr) => activeCollectionIds.has(cr.collectionId))
      .map((cr) => cr.productId)
  ), [allCollectionProducts, activeCollectionIds]);

  // Sort products: when collections exist, active-collection products float to top.
  // Within each group (active / rest): gone → low stock → ingredient issues → alpha.
  // When no collections defined, sort is unchanged (stock priority → alpha).
  const sortedProducts = useMemo(() => {
    const stockPriority = (alert: "low" | "gone" | undefined, issues: IngredientIssue[]) => {
      if (alert === "gone") return 0;
      if (alert === "low") return 1;
      if (issues.some((i) => i.status === "outOfStock")) return 2;
      if (issues.some((i) => i.status === "lowStock")) return 3;
      if (issues.some((i) => i.status === "ordered")) return 4;
      return 5;
    };

    const list = filterToActiveCollection && hasActiveCollections
      ? products.filter((r) => activeCollectionProductIds.has(r.id!))
      : [...products];

    return list.sort((a, b) => {
      // If collections exist, active-collection products sort before others
      if (hasActiveCollections) {
        const aIn = activeCollectionProductIds.has(a.id!);
        const bIn = activeCollectionProductIds.has(b.id!);
        if (aIn !== bIn) return aIn ? -1 : 1;
      }
      const pa = stockPriority(productStockAlerts.get(a.id!), ingredientIssuesByProduct.get(a.id!) ?? []);
      const pb = stockPriority(productStockAlerts.get(b.id!), ingredientIssuesByProduct.get(b.id!) ?? []);
      if (pa !== pb) return pa - pb;
      return a.name.localeCompare(b.name);
    });
  }, [products, productStockAlerts, ingredientIssuesByProduct, activeCollectionProductIds, hasActiveCollections, filterToActiveCollection]);

  const hasShelfStableFillings = useMemo(() => {
    for (const productId of selectedProductIds) {
      for (const bl of productFillingsMap.get(productId) ?? []) {
        const filling = allFillings.find((l) => l.id === bl.fillingId);
        if (filling && shelfStableCategoryNames.has(filling.category)) return true;
      }
    }
    return false;
  }, [productFillingsMap, selectedProductIds, allFillings, shelfStableCategoryNames]);

  const mouldWarnings = useMemo(() => {
    // Aggregate physical-mould usage across primary + additional moulds for every
    // selected product. Partial-cavity slots count as 1 physical mould.
    const usage = new Map<string, number>();
    const addUsage = (mouldId: string, quantity: number, partialCavities?: number) => {
      if (!mouldId) return;
      const need = partialCavities != null ? 1 : quantity;
      usage.set(mouldId, (usage.get(mouldId) ?? 0) + need);
    };
    for (const r of selectedProducts) {
      const cfg = config[r.id!];
      if (!cfg) continue;
      if (cfg.mouldId) addUsage(cfg.mouldId, cfg.quantity, cfg.partialCavities);
      for (const am of cfg.additionalMoulds) addUsage(am.mouldId, am.quantity, am.partialCavities);
    }
    const warnings: { mouldName: string; needed: number; owned: number }[] = [];
    for (const [mouldId, needed] of usage) {
      const mould = moulds.find((m) => m.id === mouldId);
      if (mould?.quantityOwned != null && needed > mould.quantityOwned) {
        warnings.push({ mouldName: mould.name, needed, owned: mould.quantityOwned });
      }
    }
    return warnings;
  }, [config, selectedProducts, moulds]);

  function toggleProduct(id: string, product: Product) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
        setConfig((c) => ({
          ...c,
          [id]: {
            mouldId: product.defaultMouldId ?? (moulds[0]?.id ?? ""),
            quantity: product.defaultBatchQty ?? 1,
            additionalMoulds: [],
          },
        }));
      }
      return next;
    });
  }

  function updateConfig(productId: string, field: "mouldId" | "quantity", value: string | number | "") {
    setConfig((c) => ({ ...c, [productId]: { ...c[productId], [field]: value } }));
  }

  // ─── Alternative mould setup (rarely used disclosure) ──────────────────────

  function toggleAltOpen(productId: string) {
    setAltOpen((prev) => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  }

  /** Toggle partial-cavity mode on the primary mould.
   *  Turning on pre-fills with the mould's cavity count so the input is editable immediately. */
  function togglePrimaryPartial(productId: string, on: boolean) {
    setConfig((c) => {
      const cur = c[productId];
      if (!cur) return c;
      if (on) {
        const mould = moulds.find((m) => m.id === cur.mouldId);
        const defaultCavities = mould?.numberOfCavities ?? 1;
        return { ...c, [productId]: { ...cur, partialCavities: defaultCavities } };
      }
      const { partialCavities: _removed, ...rest } = cur;
      void _removed;
      return { ...c, [productId]: rest };
    });
  }

  function updatePrimaryPartial(productId: string, value: number) {
    setConfig((c) => {
      const cur = c[productId];
      if (!cur) return c;
      return { ...c, [productId]: { ...cur, partialCavities: Math.max(1, value) } };
    });
  }

  function addAdditionalMould(productId: string) {
    setConfig((c) => {
      const cur = c[productId];
      if (!cur) return c;
      // Default to the first mould that's not already in use on this row so the
      // user doesn't immediately see a duplicate of the primary.
      const usedMouldIds = new Set<string>([cur.mouldId, ...cur.additionalMoulds.map((a) => a.mouldId)].filter(Boolean) as string[]);
      const firstUnused = moulds.find((m) => !usedMouldIds.has(m.id!)) ?? moulds[0];
      return {
        ...c,
        [productId]: {
          ...cur,
          additionalMoulds: [...cur.additionalMoulds, { mouldId: firstUnused?.id ?? "", quantity: 1 }],
        },
      };
    });
  }

  function updateAdditionalMould(productId: string, index: number, patch: Partial<PlanProductAdditionalMould>) {
    setConfig((c) => {
      const cur = c[productId];
      if (!cur) return c;
      const next = cur.additionalMoulds.map((am, i) => (i === index ? { ...am, ...patch } : am));
      return { ...c, [productId]: { ...cur, additionalMoulds: next } };
    });
  }

  function removeAdditionalMould(productId: string, index: number) {
    setConfig((c) => {
      const cur = c[productId];
      if (!cur) return c;
      const next = cur.additionalMoulds.filter((_, i) => i !== index);
      return { ...c, [productId]: { ...cur, additionalMoulds: next } };
    });
  }

  async function handleCreate() {
    if (selectedProducts.length === 0) return;
    for (const r of selectedProducts) {
      if (!config[r.id!]?.mouldId) return;
    }
    setSaving(true);
    try {
      const completedAt = isPastBatch ? new Date(completedDateStr + "T12:00:00") : undefined;
      const overridesJson = !isPastBatch && Object.keys(fillingMultipliers).length > 0
        ? JSON.stringify(fillingMultipliers)
        : undefined;
      const prevBatchesJson = !isPastBatch && Object.keys(fillingPreviousBatches).length > 0
        ? JSON.stringify(fillingPreviousBatches)
        : undefined;
      const batchNumber = completedAt ? await generateBatchNumber(completedAt) : undefined;

      const planId = await saveProductionPlan({
        name: planName.trim() || "Batch",
        status: isPastBatch ? "done" : "draft",
        notes: isPastBatch ? (batchNote.trim() || undefined) : "",
        fillingOverrides: overridesJson,
        fillingPreviousBatches: prevBatchesJson,
        ...(completedAt ? { completedAt, batchNumber } : {}),
      } as any);

      const savedProducts: PlanProduct[] = [];
      for (let i = 0; i < selectedProducts.length; i++) {
        const r = selectedProducts[i];
        const cfg = config[r.id!];
        // Drop empty additional-mould rows (mouldId blank) so we don't persist noise.
        const cleanedAdditional = cfg.additionalMoulds.filter((am) => am.mouldId);
        const partialCavities = cfg.partialCavities;
        const id = await savePlanProduct({
          planId,
          productId: r.id!,
          mouldId: cfg.mouldId as string,
          quantity: cfg.quantity,
          sortOrder: i,
          ...(partialCavities != null ? { partialCavities } : {}),
          ...(cleanedAdditional.length > 0 ? { additionalMoulds: cleanedAdditional } : {}),
          ...(isPastBatch ? { notes: productNotes[r.id!]?.trim() || undefined } : {}),
        });
        savedProducts.push({
          id, planId, productId: r.id!, mouldId: cfg.mouldId as string, quantity: cfg.quantity, sortOrder: i,
          ...(partialCavities != null ? { partialCavities } : {}),
          ...(cleanedAdditional.length > 0 ? { additionalMoulds: cleanedAdditional } : {}),
        });
      }

      if (isPastBatch && completedAt) {
        const productNamesMap = new Map(selectedProducts.map((r) => [r.id!, r.name]));
        const mouldsMap = new Map(moulds.map((m) => [m.id!, m]));
        const fillingsMap = new Map(allFillings.map((l) => [l.id!, l]));
        const fillingAmounts = calculateFillingAmounts(
          savedProducts as any,
          productNamesMap,
          productFillingsMap,
          fillingIngredientsMap,
          fillingsMap,
          mouldsMap,
          {},
          {},
          new Map(),
          shelfStableCategoryNames,
        );

        // Build yield entries for the modal — total across all mould slots.
        const yieldEntries: YieldEntry[] = savedProducts.map((pb) => {
          const total = getTotalCavities(pb, mouldsMap);
          return {
            planProductId: pb.id!,
            productName: productNamesMap.get(pb.productId) ?? "Unknown",
            totalProducts: total,
            yield: total,
          };
        });

        // Show yield modal — finalize is called after user confirms yields
        const finalize = async (confirmedEntries: YieldEntry[]) => {
          // Save actual yield on each PlanProduct
          for (const entry of confirmedEntries) {
            const pb = savedProducts.find((b) => b.id === entry.planProductId);
            if (pb) {
              pb.actualYield = entry.yield;
              await savePlanProduct({ ...pb, actualYield: entry.yield });
            }
          }

          // Mark all steps as done
          const steps = generateSteps(savedProducts as any, productNamesMap, productFillingsMap, fillingAmounts, fillingsMap, mouldsMap);
          for (const step of steps) {
            await toggleStep(planId, step.key, true);
          }

          const batchSummary = generateBatchSummary({
            batchNumber: batchNumber ?? "",
            planName: planName.trim() || "Batch",
            completedAt,
            planProducts: savedProducts as any,
            productNames: productNamesMap,
            moulds: mouldsMap,
            fillingAmounts,
            ingredients: allIngredients.filter((i) => i.id != null) as { id: string; name: string; manufacturer?: string }[],
          });
          await saveProductionPlan({ id: planId, name: planName.trim() || "Batch", status: "done", notes: batchNote.trim() || undefined, batchSummary, completedAt, batchNumber } as any);
          setSaving(false);
          router.push(`/production/${encodeURIComponent(planId)}/summary?from=%2Fproduction`);
        };

        setYieldModal({ entries: yieldEntries, pendingFinalize: finalize });
        // Don't navigate yet — the yield modal onConfirm will call finalize
        return;
      } else {
        router.push(`/production/${encodeURIComponent(planId)}`);
      }
    } finally {
      setSaving(false);
    }
  }

  if (fromPlanId && !initialized) {
    return (
      <div className="px-4 pt-6">
        <p className="text-sm text-muted-foreground">Loading batch…</p>
      </div>
    );
  }

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <Link href="/production" className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3">
          <ArrowLeft className="w-4 h-4" /> Production
        </Link>
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-bold">{fromPlanId ? "Duplicate batch" : isPastBatch ? "Log past batch" : "New batch plan"}</h1>
          {!fromPlanId && (
            <button
              onClick={() => setIsPastBatch((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors ${isPastBatch ? "border-primary bg-primary/5 text-primary font-medium" : "border-border text-muted-foreground"}`}
              title="Log a batch that already happened"
            >
              <History className="w-3.5 h-3.5" aria-hidden="true" />
              {isPastBatch ? "Past batch" : "Log past batch"}
            </button>
          )}
        </div>
        {isPastBatch && (
          <p className="text-xs text-muted-foreground mt-1">
            This batch will be marked as completed immediately — no step tracking needed.
          </p>
        )}
      </div>

      {phase === "select" && (
        <div className="px-4 space-y-3 pb-6">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">Select the products you want to make:</p>
            {hasActiveCollections && (
              <button
                onClick={() => setFilterToActiveCollection((v) => !v)}
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
                  filterToActiveCollection
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border text-muted-foreground"
                }`}
              >
                {filterToActiveCollection ? "Current collection" : "All products"}
              </button>
            )}
          </div>
          {products.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">No products yet.</p>
          ) : (
            <>
            {hasActiveCollections && sortedProducts.length === 0 && (
              <p className="text-sm text-muted-foreground py-4 text-center">No products in the current collection.</p>
            )}
            <ul className="space-y-2">
              {sortedProducts.map((r, idx) => {
                const selected = selectedIds.has(r.id!);
                const stockAlert = productStockAlerts.get(r.id!);
                const ingIssues = ingredientIssuesByProduct.get(r.id!) ?? [];
                const hasOutOfStock = ingIssues.some((i) => i.status === "outOfStock");
                const hasIngWarning = ingIssues.length > 0;
                const warningExpanded = expandedWarnings.has(r.id!);

                // When showing all products with active collections, insert a divider
                // at the boundary between active-collection and other products
                const showDivider =
                  !filterToActiveCollection &&
                  hasActiveCollections &&
                  idx > 0 &&
                  activeCollectionProductIds.has(sortedProducts[idx - 1].id!) &&
                  !activeCollectionProductIds.has(r.id!);

                return (
                  <li key={r.id}>
                    {showDivider && (
                      <div className="flex items-center gap-2 py-1 mb-1">
                        <div className="h-px flex-1 bg-border" />
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wide">Other products</span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}
                    <div
                      className={`rounded-lg border transition-colors ${
                        selected
                          ? "border-primary bg-primary/5"
                          : stockAlert === "gone"
                          ? "border-status-alert-edge bg-status-alert-bg/60"
                          : stockAlert === "low"
                          ? "border-status-warn-edge bg-status-warn-bg/50"
                          : hasOutOfStock
                          ? "border-status-alert-edge bg-card"
                          : "border-border bg-card"
                      }`}
                    >
                      {/* Main product row */}
                      <button
                        onClick={() => toggleProduct(r.id!, r)}
                        className="w-full flex items-center gap-3 p-3 text-left"
                      >
                        <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 ${
                          selected ? "bg-primary border-primary" : "border-border"
                        }`}>
                          {selected && <Check className="w-3 h-3 text-primary-foreground" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm truncate">{r.name}</p>
                        </div>

                        {/* Product stock status badge */}
                        {stockAlert && (
                          <span className={`shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                            stockAlert === "gone"
                              ? "bg-status-alert-bg text-status-alert"
                              : "bg-status-warn-bg text-status-warn"
                          }`}>
                            {stockAlert === "gone" ? (
                              <><PackageX className="w-3 h-3" aria-hidden="true" />Out of stock</>
                            ) : (
                              <><ShoppingCart className="w-3 h-3" aria-hidden="true" />Low stock</>
                            )}
                          </span>
                        )}
                      </button>

                      {/* Ingredient issues row — shown when there are issues */}
                      {hasIngWarning && (
                        <div className={`border-t mx-0 ${
                          hasOutOfStock ? "border-status-alert-edge" : "border-status-warn-edge"
                        }`}>
                          <button
                            onClick={() => setExpandedWarnings((prev) => {
                              const next = new Set(prev);
                              if (next.has(r.id!)) next.delete(r.id!);
                              else next.add(r.id!);
                              return next;
                            })}
                            className="w-full flex items-center gap-2 px-3 py-2 text-left"
                          >
                            <AlertTriangle className={`w-3.5 h-3.5 shrink-0 ${hasOutOfStock ? "text-status-alert" : "text-status-warn"}`} aria-hidden="true" />
                            <span className={`flex-1 text-xs font-medium ${hasOutOfStock ? "text-status-alert" : "text-status-warn"}`}>
                              {hasOutOfStock
                                ? `${ingIssues.filter((i) => i.status === "outOfStock").length} ingredient${ingIssues.filter((i) => i.status === "outOfStock").length > 1 ? "s" : ""} out of stock`
                                : `${ingIssues.length} ingredient stock alert${ingIssues.length > 1 ? "s" : ""}`}
                            </span>
                            <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-muted-foreground transition-transform ${warningExpanded ? "" : "-rotate-90"}`} aria-hidden="true" />
                          </button>

                          {warningExpanded && (
                            <ul className="px-3 pb-2.5 space-y-1">
                              {ingIssues.map((issue) => (
                                <li key={issue.ingredientId} className="flex items-center gap-2">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                    issue.status === "outOfStock" ? "bg-status-alert" :
                                    issue.status === "ordered" ? "bg-blue-400" :
                                    "bg-status-warn-edge"
                                  }`} />
                                  <span className="text-xs text-foreground truncate">{issue.name}</span>
                                  <span className={`ml-auto shrink-0 text-[11px] ${
                                    issue.status === "outOfStock" ? "text-status-alert font-medium" :
                                    issue.status === "ordered" ? "text-blue-600" :
                                    "text-status-warn"
                                  }`}>
                                    {issue.status === "outOfStock" ? "Out of stock" :
                                     issue.status === "ordered" ? "Ordered" :
                                     "Running low"}
                                  </span>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
            </>
          )}
          <button
            onClick={() => setPhase("configure")}
            disabled={selectedIds.size === 0}
            className="w-full rounded-full bg-accent text-accent-foreground py-2.5 text-sm font-medium disabled:opacity-50 mt-2"
          >
            Continue ({selectedIds.size} selected)
          </button>
        </div>
      )}

      {phase === "configure" && (
        <div className="px-4 space-y-4 pb-6">
          {isPastBatch && (
            <div>
              <label className="block text-xs text-muted-foreground mb-0.5">Date completed *</label>
              <input
                type="date"
                value={completedDateStr}
                max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setCompletedDateStr(e.target.value)}
                className="input"
              />
            </div>
          )}

          <div>
            <label className="block text-xs text-muted-foreground mb-0.5">Plan name</label>
            <input
              type="text"
              value={planName}
              onChange={(e) => setPlanName(e.target.value)}
              className="input"
            />
          </div>

          <div className="space-y-3">
            {selectedProducts.map((r) => {
              const cfg = config[r.id!] ?? { mouldId: "", quantity: 1, additionalMoulds: [] };
              const selectedMould = moulds.find((m) => m.id === cfg.mouldId);
              const isAltOpen = altOpen.has(r.id!);
              const hasAltConfig = cfg.partialCavities != null || cfg.additionalMoulds.length > 0;
              const primaryCavities = cfg.partialCavities ?? (selectedMould ? selectedMould.numberOfCavities * cfg.quantity : 0);
              const additionalCavities = cfg.additionalMoulds.reduce((s, am) => {
                const m = moulds.find((mo) => mo.id === am.mouldId);
                return s + (am.partialCavities ?? (m ? m.numberOfCavities * am.quantity : 0));
              }, 0);
              const totalProducts = primaryCavities + additionalCavities;
              return (
                <div key={r.id} className="rounded-lg border border-border bg-card p-3 space-y-2">
                  <h3 className="font-medium text-sm">{r.name}</h3>
                  <div className="space-y-2">
                    <div>
                      <label className="block text-xs text-muted-foreground mb-0.5">Mould *</label>
                      <select
                        value={cfg.mouldId}
                        onChange={(e) => updateConfig(r.id!, "mouldId", e.target.value)}
                        className="input"
                      >
                        <option value="">— Select mould —</option>
                        {moulds.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name} ({m.cavityWeightG} g · {m.numberOfCavities} cavities)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-3">
                      <div>
                        <label className="block text-xs text-muted-foreground mb-0.5">Number of moulds</label>
                        <input
                          type="number"
                          min="1"
                          value={quantityInputs[r.id!] ?? cfg.quantity}
                          onChange={(e) => setQuantityInputs((prev) => ({ ...prev, [r.id!]: e.target.value }))}
                          onBlur={(e) => {
                            const val = Math.max(1, parseInt(e.target.value) || 1);
                            updateConfig(r.id!, "quantity", val);
                            setQuantityInputs((prev) => { const next = { ...prev }; delete next[r.id!]; return next; });
                          }}
                          className="input w-24"
                          disabled={cfg.partialCavities != null}
                        />
                      </div>
                      {selectedMould && (
                        <p className="text-xs text-muted-foreground mt-4">
                          = {totalProducts} product{totalProducts !== 1 ? "s" : ""}
                        </p>
                      )}
                    </div>

                    {/* Alternative mould setup disclosure — collapsed by default; expands on
                        demand for the rare case of multiple moulds or a partial-cavity pour.
                        Stays auto-visible while an alt config is populated so saved settings
                        aren't hidden behind a button. */}
                    {(!isAltOpen && !hasAltConfig) ? (
                      <button
                        type="button"
                        onClick={() => toggleAltOpen(r.id!)}
                        className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" aria-hidden="true" />
                        Alternative mould setup
                      </button>
                    ) : (
                      <div className="mt-1 pl-3 border-l border-border/60 space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">Alternative mould setup</p>
                          {!hasAltConfig && (
                            <button
                              type="button"
                              onClick={() => toggleAltOpen(r.id!)}
                              className="text-xs text-muted-foreground hover:text-foreground"
                            >
                              Hide
                            </button>
                          )}
                        </div>

                        {/* Partial cavities on the primary mould */}
                        {selectedMould && (
                          <>
                            <label className="flex items-center gap-2 text-xs text-muted-foreground">
                              <input
                                type="checkbox"
                                checked={cfg.partialCavities != null}
                                onChange={(e) => togglePrimaryPartial(r.id!, e.target.checked)}
                                className="h-3.5 w-3.5"
                              />
                              Fill only part of this mould
                            </label>
                            {cfg.partialCavities != null && (
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min={1}
                                  max={selectedMould.numberOfCavities}
                                  value={cfg.partialCavities}
                                  onChange={(e) => updatePrimaryPartial(r.id!, parseInt(e.target.value) || 1)}
                                  className="input w-20"
                                  aria-label="Cavities to fill on primary mould"
                                />
                                <span className="text-xs text-muted-foreground">
                                  of {selectedMould.numberOfCavities} cavities
                                </span>
                              </div>
                            )}
                          </>
                        )}

                        {/* Additional moulds — multiple allowed */}
                        {cfg.additionalMoulds.map((am, i) => {
                          const amMould = moulds.find((m) => m.id === am.mouldId);
                          return (
                            <div key={i} className="flex items-start gap-2">
                              <div className="flex-1 space-y-1">
                                <select
                                  value={am.mouldId}
                                  onChange={(e) => updateAdditionalMould(r.id!, i, { mouldId: e.target.value })}
                                  className="input text-sm"
                                >
                                  <option value="">— Select mould —</option>
                                  {moulds.map((m) => (
                                    <option key={m.id} value={m.id}>
                                      {m.name} ({m.cavityWeightG} g · {m.numberOfCavities} cavities)
                                    </option>
                                  ))}
                                </select>
                                <div className="flex items-center gap-2 text-xs flex-wrap">
                                  <input
                                    type="number"
                                    min={1}
                                    value={am.quantity}
                                    onChange={(e) =>
                                      updateAdditionalMould(r.id!, i, {
                                        quantity: Math.max(1, parseInt(e.target.value) || 1),
                                      })
                                    }
                                    className="input w-16"
                                    disabled={am.partialCavities != null}
                                    aria-label="Number of additional moulds"
                                  />
                                  <span className="text-muted-foreground">moulds, or</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={amMould?.numberOfCavities}
                                    placeholder="cavities"
                                    value={am.partialCavities ?? ""}
                                    onChange={(e) => {
                                      const raw = e.target.value.trim();
                                      if (raw === "") {
                                        updateAdditionalMould(r.id!, i, { partialCavities: undefined });
                                      } else {
                                        updateAdditionalMould(r.id!, i, {
                                          partialCavities: Math.max(1, parseInt(raw) || 1),
                                        });
                                      }
                                    }}
                                    className="input w-20"
                                    aria-label="Cavities to fill on this additional mould"
                                  />
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeAdditionalMould(r.id!, i)}
                                className="text-muted-foreground hover:text-destructive mt-1.5"
                                aria-label={`Remove additional mould ${i + 1}`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          );
                        })}

                        <button
                          type="button"
                          onClick={() => addAdditionalMould(r.id!)}
                          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" aria-hidden="true" />
                          Add mould
                        </button>
                      </div>
                    )}

                    {isPastBatch && (
                      <div>
                        <label className="block text-xs text-muted-foreground mb-0.5">Notes (optional)</label>
                        <input
                          type="text"
                          value={productNotes[r.id!] ?? ""}
                          onChange={(e) => setProductNotes((prev) => ({ ...prev, [r.id!]: e.target.value }))}
                          placeholder="Any notes for this product…"
                          className="input text-sm"
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {isPastBatch && (
            <div>
              <label className="block text-xs text-muted-foreground mb-0.5">Batch notes (optional)</label>
              <textarea
                value={batchNote}
                onChange={(e) => setBatchNote(e.target.value)}
                placeholder="General notes about this batch…"
                rows={3}
                className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
          )}

          {mouldWarnings.length > 0 && (
            <div className="rounded-lg border border-status-warn-edge bg-status-warn-bg px-3 py-2.5">
              <p className="text-sm font-medium text-status-warn flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
                Not enough moulds
              </p>
              <ul className="mt-1 space-y-0.5">
                {mouldWarnings.map((w) => (
                  <li key={w.mouldName} className="text-xs text-status-warn">
                    {w.mouldName}: need {w.needed}, own {w.owned}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-status-warn mt-1.5">You can still continue — this is just a reminder.</p>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => fromPlanId ? router.push("/production") : setPhase("select")}
              className="rounded-full border border-border px-4 py-2.5 text-sm"
            >
              {fromPlanId ? "Cancel" : "Back"}
            </button>
            <button
              onClick={() => !isPastBatch && hasShelfStableFillings ? setPhase("batch-sizes") : handleCreate()}
              disabled={selectedProducts.some((r) => !config[r.id!]?.mouldId) || saving}
              className="flex-1 rounded-full bg-accent text-accent-foreground py-2.5 text-sm font-medium disabled:opacity-50"
            >
              {saving ? (isPastBatch ? "Logging…" : "Creating…") : !isPastBatch && hasShelfStableFillings ? "Continue" : isPastBatch ? "Log completed batch" : "Create plan"}
            </button>
          </div>
        </div>
      )}

      {phase === "batch-sizes" && (
        <BatchSizesPhase
          selectedProductIds={Array.from(selectedIds)}
          allFillings={allFillings}
          fillingMultipliers={fillingMultipliers}
          onUpdateMultiplier={(fillingId, multiplier) =>
            setFillingMultipliers((prev) => ({ ...prev, [fillingId]: multiplier }))
          }
          fillingPreviousBatches={fillingPreviousBatches}
          onUpdatePreviousBatch={(fillingId, entry) =>
            setFillingPreviousBatches((prev) => entry ? { ...prev, [fillingId]: entry } : Object.fromEntries(Object.entries(prev).filter(([k]) => k !== fillingId)))
          }
          config={config}
          moulds={moulds}
          onBack={() => setPhase("configure")}
          onCreate={handleCreate}
          saving={saving}
        />
      )}

      {/* Yield modal for past batches */}
      {yieldModal && (
        <YieldModal
          entries={yieldModal.entries}
          onConfirm={async (entries) => {
            if (yieldModal.pendingFinalize) {
              await yieldModal.pendingFinalize(entries);
            }
            setYieldModal(null);
          }}
          onCancel={() => {
            // Skip = use full planned amounts (no adjustment); plan is already saved so we must finalize
            if (yieldModal.pendingFinalize) {
              yieldModal.pendingFinalize(yieldModal.entries);
            }
            setYieldModal(null);
          }}
          cancelLabel="All made it"
        />
      )}
    </div>
  );
}

// Separate component — loads product fillings via hooks (must be called unconditionally)
function BatchSizesPhase({
  selectedProductIds,
  allFillings,
  fillingMultipliers,
  onUpdateMultiplier,
  fillingPreviousBatches,
  onUpdatePreviousBatch,
  config,
  moulds,
  onBack,
  onCreate,
  saving,
}: {
  selectedProductIds: string[];
  allFillings: ReturnType<typeof useFillings>;
  fillingMultipliers: Record<string, number>;
  onUpdateMultiplier: (fillingId: string, multiplier: number) => void;
  fillingPreviousBatches: Record<string, FillingPreviousBatch>;
  onUpdatePreviousBatch: (fillingId: string, entry: FillingPreviousBatch | null) => void;
  config: Record<string, { mouldId: string | ""; quantity: number }>;
  moulds: Mould[];
  onBack: () => void;
  onCreate: () => void;
  saving: boolean;
}) {
  const productFillingsMap = useProductFillingsForProducts(selectedProductIds);
  const allFillingStockItems = useFillingStockItems();
  const shelfStableCategoryNames = useShelfStableCategoryNames();

  // Build a map of stock per filling split into available (non-frozen) and
  // frozen totals. Both are usable in the wizard — frozen stock is opt-in via
  // the per-filling `includeFrozen` toggle. Any frozen entry touched during
  // plan execution is implicitly defrosted (see deductFillingStock).
  const fillingStockMap = useMemo(() => {
    const map = new Map<string, {
      totalG: number;         // available (non-frozen) grams
      frozenG: number;        // grams in the freezer
      oldestMadeAt: string;   // across the whole stock pool (display hint)
    }>();
    for (const item of allFillingStockItems) {
      const existing = map.get(item.fillingId);
      if (existing) {
        if (item.frozen) existing.frozenG += item.remainingG;
        else existing.totalG += item.remainingG;
        if (item.madeAt < existing.oldestMadeAt) existing.oldestMadeAt = item.madeAt;
      } else {
        map.set(item.fillingId, {
          totalG: item.frozen ? 0 : item.remainingG,
          frozenG: item.frozen ? item.remainingG : 0,
          oldestMadeAt: item.madeAt,
        });
      }
    }
    return map;
  }, [allFillingStockItems]);

  // Collect unique shelf-stable filling IDs across all selected products
  const shelfStableFillingIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const productId of selectedProductIds) {
      for (const bl of productFillingsMap.get(productId) ?? []) {
        const filling = allFillings.find((l) => l.id === bl.fillingId);
        if (filling && shelfStableCategoryNames.has(filling.category) && !seen.has(bl.fillingId)) {
          seen.add(bl.fillingId);
          ids.push(bl.fillingId);
        }
      }
    }
    return ids;
  }, [productFillingsMap, selectedProductIds, allFillings, shelfStableCategoryNames]);

  const fillingIngredientsMap = useFillingIngredientsForFillings(shelfStableFillingIds);

  const fillingBaseTotals = useMemo(() => {
    const map: Record<string, { total: number; unit: string }> = {};
    for (const fillingId of shelfStableFillingIds) {
      const lis = fillingIngredientsMap.get(fillingId) ?? [];
      const total = lis.reduce((s, li) => s + li.amount, 0);
      const unit = lis[0]?.unit ?? "g";
      map[fillingId] = { total, unit };
    }
    return map;
  }, [fillingIngredientsMap, shelfStableFillingIds]);

  const minMultiplierMap = useMemo(() => {
    const mouldsById = new Map(moulds.map((m) => [m.id!, m]));
    const result: Record<string, number> = {};

    for (const fillingId of shelfStableFillingIds) {
      const base = fillingBaseTotals[fillingId];
      if (!base || base.total <= 0) continue;

      let neededG = 0;
      for (const productId of selectedProductIds) {
        const cfg = config[productId];
        if (!cfg || !cfg.mouldId) continue;
        const mould = mouldsById.get(cfg.mouldId as string);
        if (!mould) continue;
        const cavityWeight = mould.cavityWeightG ?? 0;
        if (cavityWeight <= 0) continue;
        const fillWeightG = cavityWeight * mould.numberOfCavities * cfg.quantity * FILL_FACTOR * DENSITY_G_PER_ML;
        for (const bl of productFillingsMap.get(productId) ?? []) {
          if (bl.fillingId !== fillingId) continue;
          const fillPct = (bl.fillPercentage ?? 100) / 100;
          neededG += fillWeightG * fillPct;
        }
      }

      if (neededG <= 0) continue;
      const rawMin = neededG / base.total;
      result[fillingId] = Math.ceil(rawMin * 10) / 10;
    }
    return result;
  }, [productFillingsMap, shelfStableFillingIds, fillingBaseTotals, selectedProductIds, config, moulds]);

  // Auto-set the multiplier per filling based on mode:
  //   • Make fresh (no previous batch): bump to min needed to cover all products.
  //   • Use stock + stock covers all: 0 (no fresh batch needed — the scaled recipe
  //     and "Make filling" step are suppressed in production.ts when multiplier is 0).
  //   • Use stock + shortfall: set multiplier so fresh batch covers the shortfall.
  useEffect(() => {
    for (const fillingId of shelfStableFillingIds) {
      const base = fillingBaseTotals[fillingId];
      if (!base || base.total <= 0) continue;
      const min = minMultiplierMap[fillingId];
      const prev = fillingPreviousBatches[fillingId];
      const stock = fillingStockMap.get(fillingId);
      const availableG = stock?.totalG ?? 0;
      const frozenG = stock?.frozenG ?? 0;
      const effectiveStockG = availableG + (prev?.includeFrozen ? frozenG : 0);
      const minNeededG = min != null ? base.total * min : 0;
      const current = fillingMultipliers[fillingId] ?? 1;

      if (prev) {
        // Using stock: drive multiplier by the shortfall
        const shortfallG = Math.max(0, minNeededG - effectiveStockG);
        const target = shortfallG > 0 && base.total > 0
          ? Math.round((shortfallG / base.total) * 100) / 100
          : 0;
        if (current !== target) onUpdateMultiplier(fillingId, target);
      } else {
        // Making fresh: bump up to min-needed to cover all products
        if (min !== undefined && current < min) {
          onUpdateMultiplier(fillingId, min);
        }
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(minMultiplierMap), JSON.stringify(fillingPreviousBatches), JSON.stringify([...fillingStockMap.entries()])]);

  // Auto-select "Use stock" for fillings that have stock available
  useEffect(() => {
    for (const fillingId of shelfStableFillingIds) {
      const stock = fillingStockMap.get(fillingId);
      if (stock && stock.totalG > 0 && !fillingPreviousBatches[fillingId]) {
        const filling = allFillings.find((l) => l.id === fillingId);
        onUpdatePreviousBatch(fillingId, {
          madeAt: stock.oldestMadeAt.slice(0, 10),
          ...(filling?.shelfLifeWeeks ? { shelfLifeWeeks: filling.shelfLifeWeeks } : {}),
          fillingName: filling?.name ?? "",
        });
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify([...fillingStockMap.entries()])]);

  const [inputStrings, setInputStrings] = useState<Record<string, string>>({});

  if (shelfStableFillingIds.length === 0) {
    return (
      <div className="px-4 space-y-4 pb-6">
        <p className="text-sm text-muted-foreground">
          No fruit or nut-based fillings in this batch — nothing to configure.
        </p>
        <div className="flex gap-2">
          <button onClick={onBack} className="rounded-full border border-border px-4 py-2.5 text-sm">
            Back
          </button>
          <button
            onClick={onCreate}
            disabled={saving}
            className="flex-1 rounded-full bg-accent text-accent-foreground py-2.5 text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Creating…" : "Create plan"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 space-y-4 pb-6">
      <div>
        <p className="text-sm font-medium">Batch sizes for shelf-stable fillings</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Fruit, nut, and praline fillings can be made ahead in larger batches.
          Set a multiplier — 1× means the base product amount.
        </p>
      </div>

      <div className="space-y-2">
        {shelfStableFillingIds.map((fillingId) => {
          const filling = allFillings.find((l) => l.id === fillingId);
          if (!filling) return null;
          const base = fillingBaseTotals[fillingId];
          const rawMin = minMultiplierMap[fillingId];
          const minMultiplier = rawMin != null && !isNaN(rawMin) ? rawMin : 0.5;
          const multiplier = Math.max(fillingMultipliers[fillingId] ?? 1, minMultiplier);
          const batchTotal = base ? Math.round(base.total * multiplier * 10) / 10 : null;
          const minNeededG = base ? Math.round(base.total * minMultiplier * 10) / 10 : null;
          const prevBatch = fillingPreviousBatches[fillingId];
          const usingPrevious = !!prevBatch;

          // Compute remaining shelf life preview when a previous batch date and shelf life are set
          let remainingWeeksPreview: number | null = null;
          if (prevBatch?.madeAt && prevBatch.shelfLifeWeeks && prevBatch.shelfLifeWeeks > 0) {
            const ageMs = Date.now() - new Date(prevBatch.madeAt).getTime();
            const ageWeeks = ageMs / (7 * 24 * 60 * 60 * 1000);
            remainingWeeksPreview = Math.max(0, Math.round((prevBatch.shelfLifeWeeks - ageWeeks) * 10) / 10);
          }

          const stock = fillingStockMap.get(fillingId);
          const frozenG = stock?.frozenG ?? 0;
          const availableG = stock?.totalG ?? 0;
          const anyStock = availableG > 0 || frozenG > 0;
          const includeFrozen = !!prevBatch?.includeFrozen;
          // Effective pool the wizard treats as "stock to use" — frozen counts
          // only when the user has opted in via the per-filling toggle.
          const effectiveStockG = availableG + (includeFrozen ? frozenG : 0);
          const hasStock = effectiveStockG > 0;
          const stockCoversAll = hasStock && minNeededG !== null && effectiveStockG >= minNeededG;

          return (
            <div key={fillingId} className="rounded-lg border border-border bg-card p-3 space-y-2.5">
              {/* Filling header + mode toggle */}
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate flex items-center gap-1.5">
                    {filling.name}
                    {frozenG > 0 && (
                      <span
                        className="shrink-0 rounded-full border border-sky-200 bg-sky-50 text-sky-700 px-1.5 py-0 text-[10px] font-semibold inline-flex items-center gap-0.5"
                        title={`${Math.round(frozenG)}g in the freezer — enable the toggle below to include it`}
                      >
                        ❄ {Math.round(frozenG)}g frozen
                      </span>
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">{filling.category}</p>
                </div>
                {/* Toggle: Make fresh / Use stock — show whenever any stock exists
                    (available OR frozen). Frozen-only stock requires opting in via
                    the "Include frozen" toggle below. */}
                {anyStock && (
                  <div className="flex shrink-0 rounded-md border border-border overflow-hidden text-xs">
                    <button
                      onClick={() => onUpdatePreviousBatch(fillingId, null)}
                      className={`px-2.5 py-1 transition-colors ${!usingPrevious ? "bg-accent text-accent-foreground font-medium" : "bg-card text-muted-foreground hover:bg-muted"}`}
                    >
                      Make fresh
                    </button>
                    <button
                      onClick={() => {
                        if (!usingPrevious && stock) {
                          // If only frozen stock exists, opt the user in by default
                          // so the toggle does something — they can opt out below.
                          const onlyFrozen = availableG <= 0 && frozenG > 0;
                          onUpdatePreviousBatch(fillingId, {
                            madeAt: stock.oldestMadeAt.slice(0, 10),
                            ...(filling.shelfLifeWeeks ? { shelfLifeWeeks: filling.shelfLifeWeeks } : {}),
                            fillingName: filling.name,
                            ...(onlyFrozen ? { includeFrozen: true } : {}),
                          });
                        }
                      }}
                      className={`px-2.5 py-1 border-l border-border transition-colors ${usingPrevious ? "bg-accent text-accent-foreground font-medium" : "bg-card text-muted-foreground hover:bg-muted"}`}
                    >
                      Use stock
                    </button>
                  </div>
                )}
              </div>

              {/* Stock info banner — show when any stock exists (make-fresh mode) */}
              {anyStock && !usingPrevious && stock && (() => {
                const ageMs = Date.now() - new Date(stock.oldestMadeAt).getTime();
                const ageWeeks = ageMs / (7 * 24 * 60 * 60 * 1000);
                const remaining = filling.shelfLifeWeeks != null ? Math.round((filling.shelfLifeWeeks - ageWeeks) * 10) / 10 : null;
                const expired = remaining !== null && remaining <= 0;
                const borderCls = expired ? "border-status-alert/30 bg-status-alert/5" : "border-primary/20 bg-primary/5";
                return (
                <div className={`rounded-md border px-2.5 py-1.5 ${borderCls}`}>
                  <p className={`text-xs font-medium ${expired ? "text-status-alert" : "text-primary"}`}>
                    {availableG > 0 && <>{Math.round(availableG)}g in stock</>}
                    {availableG > 0 && frozenG > 0 && <span className="text-muted-foreground font-normal"> · </span>}
                    {frozenG > 0 && (
                      <span className="text-sky-700">❄ {Math.round(frozenG)}g frozen</span>
                    )}
                    <span className="text-muted-foreground font-normal ml-1">
                      · made {new Date(stock.oldestMadeAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                    {remaining !== null && (
                      <span className={`ml-1 font-normal ${expired ? "text-status-alert" : remaining <= 1 ? "text-status-warn" : "text-muted-foreground"}`}>
                        · {expired ? "expired" : `${remaining} wk${remaining !== 1 ? "s" : ""} left`}
                      </span>
                    )}
                  </p>
                </div>
                );
              })()}

              {/* Make fresh: gram input */}
              {!usingPrevious && base && (() => {
                const freshG = Math.round(base.total * multiplier * 10) / 10;
                const minFreshG = minNeededG ?? base.total;
                return (
                <div>
                  {minNeededG !== null && minNeededG > base.total && (
                    <p className="text-xs text-status-warn mb-1.5">
                      Minimum {minNeededG}{base.unit} needed for this batch
                    </p>
                  )}
                  <label className="block text-xs text-muted-foreground mb-1">How much to make?</label>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min={1}
                      step="10"
                      value={inputStrings[fillingId] ?? freshG}
                      onChange={(e) => setInputStrings((prev) => ({ ...prev, [fillingId]: e.target.value }))}
                      onBlur={(e) => {
                        const val = parseFloat(e.target.value);
                        const clamped = isNaN(val) || val <= 0 ? minFreshG : Math.max(val, 1);
                        const newMultiplier = base.total > 0 ? Math.round((clamped / base.total) * 100) / 100 : 1;
                        onUpdateMultiplier(fillingId, Math.max(newMultiplier, 0.01));
                        setInputStrings((prev) => { const next = { ...prev }; delete next[fillingId]; return next; });
                      }}
                      className="w-20 rounded-md border border-border bg-card px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <span className="text-xs text-muted-foreground">g</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Base product: {base.total}{base.unit}
                    {freshG !== base.total && (
                      <span className="text-primary ml-1">({multiplier}×)</span>
                    )}
                  </p>
                </div>
                );
              })()}

              {/* Use stock: show stock details + shortfall + optional additional batch */}
              {usingPrevious && prevBatch && anyStock && stock && (() => {
                const shortfallG = minNeededG !== null ? Math.round(minNeededG - effectiveStockG) : 0;
                const ageMs = Date.now() - new Date(stock.oldestMadeAt).getTime();
                const ageWeeks = ageMs / (7 * 24 * 60 * 60 * 1000);
                const remaining = filling.shelfLifeWeeks != null ? Math.round((filling.shelfLifeWeeks - ageWeeks) * 10) / 10 : null;
                const expired = remaining !== null && remaining <= 0;
                const borderCls = expired ? "border-status-alert/30 bg-status-alert/5" : "border-primary/20 bg-primary/5";
                return (
                <div className="space-y-2">
                  <div className={`rounded-md border px-2.5 py-2 ${borderCls}`}>
                    <p className={`text-sm font-medium tabular-nums ${expired ? "text-status-alert" : "text-primary"}`}>
                      {Math.round(effectiveStockG)}g available
                      {includeFrozen && frozenG > 0 && (
                        <span className="text-sky-700 font-normal ml-1">
                          (incl. ❄ {Math.round(frozenG)}g frozen)
                        </span>
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      Made {new Date(stock.oldestMadeAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                      {remaining !== null && (
                        <span className={`ml-1 ${expired ? "text-status-alert font-medium" : remaining <= 1 ? "text-status-warn" : ""}`}>
                          · {expired ? "Expired — consider making fresh" : `${remaining} wk${remaining !== 1 ? "s" : ""} left`}
                        </span>
                      )}
                    </p>
                  </div>
                  {/* Include-frozen toggle — appears whenever frozen stock exists for this filling */}
                  {frozenG > 0 && (
                    <label className="flex items-start gap-2 rounded-md border border-sky-200 bg-sky-50/50 px-2.5 py-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={includeFrozen}
                        onChange={(e) => {
                          if (!prevBatch) return;
                          onUpdatePreviousBatch(fillingId, { ...prevBatch, includeFrozen: e.target.checked });
                        }}
                        className="mt-0.5 accent-sky-600"
                      />
                      <span className="text-xs">
                        <span className="font-medium text-sky-700">
                          ❄ Also use {Math.round(frozenG)}g from the freezer
                        </span>
                        <span className="block text-[11px] text-muted-foreground mt-0.5">
                          Remember to take it out of the freezer in time.
                        </span>
                      </span>
                    </label>
                  )}
                  {minNeededG !== null && !stockCoversAll && base && (() => {
                    const freshG = Math.round(base.total * multiplier * 10) / 10;
                    const totalWithStock = Math.round(effectiveStockG + freshG);
                    return (
                    <>
                      <p className="text-xs text-status-warn">
                        Stock ({Math.round(effectiveStockG)}g{includeFrozen && frozenG > 0 ? " incl. frozen" : ""}) covers {Math.round((effectiveStockG / minNeededG) * 100)}% — you need at least {shortfallG}g more
                      </p>
                      <div>
                        <label className="block text-xs text-muted-foreground mb-1">How much to make fresh?</label>
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            step="10"
                            value={inputStrings[fillingId] ?? freshG}
                            onChange={(e) => setInputStrings((prev) => ({ ...prev, [fillingId]: e.target.value }))}
                            onBlur={(e) => {
                              const val = parseFloat(e.target.value);
                              const clamped = isNaN(val) || val <= 0 ? shortfallG : Math.max(val, 1);
                              // Convert grams back to multiplier for storage
                              const newMultiplier = base.total > 0 ? Math.round((clamped / base.total) * 100) / 100 : 1;
                              onUpdateMultiplier(fillingId, Math.max(newMultiplier, 0.01));
                              setInputStrings((prev) => { const next = { ...prev }; delete next[fillingId]; return next; });
                            }}
                            className="w-20 rounded-md border border-border bg-card px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                          />
                          <span className="text-xs text-muted-foreground">g</span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1.5">
                          Total: {Math.round(effectiveStockG)}g stock + {freshG}g fresh = <span className="font-medium text-foreground">{totalWithStock}g</span>
                          {totalWithStock < minNeededG && (
                            <span className="text-status-warn ml-1">(need {minNeededG}g)</span>
                          )}
                        </p>
                      </div>
                    </>
                    );
                  })()}
                  {stockCoversAll && (
                    <p className="text-xs text-status-ok font-medium">
                      Stock covers this filling — no fresh batch needed
                    </p>
                  )}
                  {remainingWeeksPreview !== null && (
                    <p className={`text-xs font-medium ${remainingWeeksPreview <= 1 ? "text-status-alert" : remainingWeeksPreview <= 2 ? "text-status-warn" : "text-status-ok"}`}>
                      Remaining shelf life: {remainingWeeksPreview} week{remainingWeeksPreview !== 1 ? "s" : ""}
                      {remainingWeeksPreview <= 0 ? " — expired!" : ""}
                    </p>
                  )}
                </div>
                );
              })()}
            </div>
          );
        })}
      </div>

      <div className="flex gap-2">
        <button onClick={onBack} className="rounded-full border border-border px-4 py-2.5 text-sm">
          Back
        </button>
        <button
          onClick={onCreate}
          disabled={saving}
          className="flex-1 rounded-full bg-accent text-accent-foreground py-2.5 text-sm font-medium disabled:opacity-50"
        >
          {saving ? "Creating…" : "Create plan"}
        </button>
      </div>
    </div>
  );
}
