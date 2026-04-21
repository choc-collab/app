"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useProductionPlan, usePlanProducts, usePlanFillings, usePlanStepStatuses,
  useProductsList, useProductFillingsForProducts, useFillings, useFillingIngredientsForFillings,
  useMouldsList, useIngredients, saveProductionPlan, savePlanProduct, savePlanFilling, deletePlanFilling, toggleStep,
  useDecorationMaterials, setDecorationMaterialLowStock, useCurrentCoatingMappings,
  saveFillingStock, deductFillingStock, useShelfStableCategoryNames,
} from "@/lib/hooks";
import { generateSteps, calculateFillingAmounts, calculateStandaloneFillingAmounts, consolidateSharedFillings, generateBatchSummary, getMouldSlots, getTotalCavities, formatMouldList, hasAlternativeMouldSetup, FILL_FACTOR, DENSITY_G_PER_ML } from "@/lib/production";
import type { Filling, Mould, PlanFilling, PlanProduct, Product, DecorationMaterial } from "@/types";
import { normalizeApplyAt } from "@/types";
import { ArrowLeft, RotateCcw, Pencil, Check, X, BookOpen, Beaker, StickyNote, Plus, Sprout, Trash2, ClipboardList, Printer } from "lucide-react";
import { YieldModal } from "@/components/yield-modal";
import type { YieldEntry } from "@/components/yield-modal";
import { LeftoverModal } from "@/components/leftover-modal";
import type { LeftoverEntry } from "@/components/leftover-modal";
import { LowStockFlagButton } from "@/components/pantry";
import { printLabels } from "@/lib/printer";
import type { LabelData } from "@/lib/printer";
import { useSpaId } from "@/lib/use-spa-id";
import Link from "next/link";

const PHASES = [
  { id: "colour",  label: "Colour"   },
  { id: "shell",   label: "Shell"    },
  { id: "filling", label: "Fillings" },
  { id: "fill",    label: "Fill"     },
  { id: "cap",     label: "Cap"      },
  { id: "unmould", label: "Unmould"  },
] as const;

type PhaseId = typeof PHASES[number]["id"];

export default function ProductionPlanPage() {
  const planId = useSpaId("production");

  const plan = useProductionPlan(planId);
  const planProducts = usePlanProducts(planId);
  const planFillings = usePlanFillings(planId);
  const stepStatuses = usePlanStepStatuses(planId);
  const products = useProductsList();
  const allFillings = useFillings();
  const moulds = useMouldsList(true);

  // Build lookup maps
  const productNames = useMemo(() => new Map(products.map((r) => [r.id!, r.name])), [products]);
  const productsMap = useMemo(() => new Map(products.map((r) => [r.id!, r])), [products]);
  const fillingsMap = useMemo(() => new Map(allFillings.map((l) => [l.id!, l])), [allFillings]);
  const mouldsMap = useMemo(() => new Map(moulds.map((m) => [m.id!, m])), [moulds]);
  const statusMap = useMemo(() => {
    const map = new Map(stepStatuses.map((s) => [s.stepKey, s.done]));
    // Backward compat: legacy filling step keys were filling-{planProductId}-{fillingId}.
    // If any legacy key is done, propagate to the new consolidated key filling-{fillingId}.
    for (const s of stepStatuses) {
      const match = s.stepKey.match(/^filling-.+-(.+)$/);
      if (match && s.done) {
        const newKey = `filling-${match[1]}`;
        if (!map.has(newKey)) map.set(newKey, true);
      }
    }
    return map;
  }, [stepStatuses]);

  if (!planId || !plan) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <PlanContent
      planId={planId}
      plan={plan}
      planProducts={planProducts}
      planFillings={planFillings}
      productNames={productNames}
      productsMap={productsMap}
      fillingsMap={fillingsMap}
      mouldsMap={mouldsMap}
      statusMap={statusMap}
      productIds={planProducts.map((pb) => pb.productId)}
    />
  );
}

// Separate component so we can load per-product fillings via individual hooks
function PlanContent({
  planId, plan, planProducts, planFillings, productNames, productsMap, fillingsMap, mouldsMap, statusMap, productIds,
}: {
  planId: string;
  plan: { id?: string; batchNumber?: string; batchSummary?: string; name: string; status: string; notes?: string; fillingOverrides?: string; fillingPreviousBatches?: string; createdAt: Date; completedAt?: Date };
  planProducts: PlanProduct[];
  planFillings: PlanFilling[];
  productNames: Map<string, string>;
  productsMap: Map<string, Product>;
  fillingsMap: Map<string, Filling>;
  mouldsMap: Map<string, Mould>;
  statusMap: Map<string, boolean>;
  productIds: string[];
}) {
  const [backHref, setBackHref] = useState("/production");
  const [backLabel, setBackLabel] = useState("Production");
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from");
    if (from) { setBackHref(from); setBackLabel("Back to product"); }
    const tab = params.get("tab") as PhaseId | null;
    if (tab && PHASES.some((p) => p.id === tab)) setActivePhase(tab);
  }, []);
  const allFillings = useFillings();
  const shelfStableCategoryNames = useShelfStableCategoryNames();
  const allMoulds = useMouldsList(true);
  const allIngredients = useIngredients();
  const allMaterials = useDecorationMaterials();
  const currentCoatingMappings = useCurrentCoatingMappings();
  const materialsMap = useMemo(() => new Map(allMaterials.map((m) => [m.id!, m])), [allMaterials]);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [activePhase, setActivePhase] = useState<PhaseId>("colour");
  const [confirmMarkDone, setConfirmMarkDone] = useState(false);
  const [editingBatchNote, setEditingBatchNote] = useState(false);
  const [printState, setPrintState] = useState<"idle" | "printing" | "done" | "error">("idle");
  const [printError, setPrintError] = useState("");

  // Yield modal state
  const [yieldModal, setYieldModal] = useState<{
    entries: YieldEntry[];
    mode: "single" | "batch"; // single = one unmould checkbox, batch = mark all done
    pendingStepKey?: string; // for single mode: the step key that triggered the modal
  } | null>(null);

  // Leftover filling modal state
  const [leftoverModal, setLeftoverModal] = useState<{
    entries: LeftoverEntry[];
    pendingStepKey?: string; // the fill step key that triggered the modal (single step)
    pendingFinishAll?: boolean; // true when triggered from "mark all done" flow
  } | null>(null);

  const printerEnabled = typeof window !== "undefined" && localStorage.getItem("niimbot-printer-enabled") === "true";

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirmMarkDone) setConfirmMarkDone(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmMarkDone]);
  const [batchNoteInput, setBatchNoteInput] = useState("");
  const [editingProductNoteId, setEditingProductNoteId] = useState<string | null>(null);
  const [productNoteInput, setProductNoteInput] = useState("");

  const productFillingsMap = useProductFillingsForProducts(productIds);

  // Load filling ingredients for every filling the plan touches — both via
  // products (productFillingsMap) and via standalone PlanFilling rows.
  const planFillingIds = useMemo(() => {
    const ids = new Set<string>();
    for (const bls of productFillingsMap.values()) {
      for (const bl of bls) ids.add(bl.fillingId);
    }
    for (const pf of planFillings) ids.add(pf.fillingId);
    return Array.from(ids);
  }, [productFillingsMap, planFillings]);

  const fillingIngredientsMap = useFillingIngredientsForFillings(planFillingIds);

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

  /** Standalone (PlanFilling-driven) batch amounts — scaled ingredients for
   *  each row. Empty for pure full-production plans. */
  const standaloneAmounts = useMemo(
    () => calculateStandaloneFillingAmounts(planFillings, fillingsMap, fillingIngredientsMap),
    [planFillings, fillingsMap, fillingIngredientsMap],
  );

  const consolidatedFillings = useMemo(
    () => consolidateSharedFillings(fillingAmounts.filter((la) => !la.isFromPreviousBatch)),
    [fillingAmounts],
  );

  const steps = useMemo(() =>
    generateSteps(planProducts, productNames, productFillingsMap, fillingAmounts, fillingsMap, mouldsMap, productsMap, fillingPreviousBatches, materialsMap, standaloneAmounts),
    [planProducts, productNames, productFillingsMap, fillingAmounts, fillingsMap, mouldsMap, productsMap, fillingPreviousBatches, materialsMap, standaloneAmounts]
  );

  /** Mode is derived from plan contents — no stored enum. */
  const planMode: "full" | "fillings-only" | "hybrid" = useMemo(() => {
    const hasProducts = planProducts.length > 0;
    const hasFillings = planFillings.length > 0;
    if (hasProducts && hasFillings) return "hybrid";
    if (hasFillings) return "fillings-only";
    return "full";
  }, [planProducts.length, planFillings.length]);

  /** Phases with at least one step — fillings-only plans collapse to just
   *  the Fillings tab; hybrid plans retain the full phase list. */
  const visiblePhases = useMemo(
    () => PHASES.filter((p) => steps.some((s) => s.group === p.id)),
    [steps],
  );

  // Keep activePhase valid when the default ("colour") isn't in visiblePhases
  // (e.g. fillings-only plans). Snap to the first available phase once steps load.
  useEffect(() => {
    if (visiblePhases.length === 0) return;
    if (!visiblePhases.some((p) => p.id === activePhase)) {
      setActivePhase(visiblePhases[0].id);
    }
  }, [visiblePhases, activePhase]);

  // Decoration material IDs needed for the colour phase (on_mould steps only)
  const colouringMaterialIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const pb of planProducts) {
      const product = productsMap.get(pb.productId);
      if (!product?.shellDesign) continue;
      for (const step of product.shellDesign) {
        const isTransferSheet = (step.materialIds ?? []).some(
          (id) => materialsMap.get(id)?.type === "transfer_sheet"
        );
        if (isTransferSheet || normalizeApplyAt(step.applyAt) !== "colour") continue;
        for (const id of (step.materialIds ?? [])) {
          if (!seen.has(id)) { seen.add(id); ids.push(id); }
        }
      }
    }
    return ids;
  }, [planProducts, productsMap, materialsMap]);

  // Decoration material IDs needed during capping (transfer sheets + after_cap steps)
  const cappingMaterialIds = useMemo(() => {
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const pb of planProducts) {
      const product = productsMap.get(pb.productId);
      if (!product?.shellDesign) continue;
      for (const step of product.shellDesign) {
        const isTransferSheet = (step.materialIds ?? []).some(
          (id) => materialsMap.get(id)?.type === "transfer_sheet"
        );
        if (!isTransferSheet && normalizeApplyAt(step.applyAt) === "colour") continue;
        for (const id of (step.materialIds ?? [])) {
          if (!seen.has(id)) { seen.add(id); ids.push(id); }
        }
      }
    }
    return ids;
  }, [planProducts, productsMap, materialsMap]);

  const doneCount = steps.filter((s) => statusMap.get(s.key)).length;

  /** Deduct filling stock for all fillings marked as "use stock" (fillingPreviousBatches).
   *  Sums cavity volume across every mould slot so alternative-mould-setup plan products
   *  deduct the right amount. */
  async function deductPreviousBatchStock() {
    for (const pb of planProducts) {
      const slots = getMouldSlots(pb, mouldsMap);
      if (slots.length === 0) continue;
      const totalCavityVolumeML = slots.reduce((s, sl) => s + sl.mould.cavityWeightG * sl.cavityCount, 0);
      const rls = productFillingsMap.get(pb.productId) ?? [];
      for (const rl of rls) {
        const prev = fillingPreviousBatches[rl.fillingId];
        if (!prev) continue;
        const fillPct = (rl.fillPercentage ?? 100) / 100;
        const fillWeightG = totalCavityVolumeML * FILL_FACTOR * DENSITY_G_PER_ML;
        const neededG = Math.round(fillWeightG * fillPct);
        if (neededG > 0) {
          await deductFillingStock(rl.fillingId, neededG, { includeFrozen: prev.includeFrozen });
        }
      }
    }
  }

  /** Build leftover entries for fresh fillings (skip pure previous-batch, allow hybrid).
   *  Fires for ALL filling categories — users can register leftovers for any filling, not just
   *  shelf-stable ones (the production-date field on the stock entry tracks freshness). */
  function buildAllLeftoverEntries(): LeftoverEntry[] {
    const entries: LeftoverEntry[] = [];
    for (const cl of consolidatedFillings) {
      // Skip fillings fully from previous batch (no fresh override)
      if (fillingPreviousBatches[cl.fillingId] && !fillingOverrides[cl.fillingId]) continue;
      const filling = fillingsMap.get(cl.fillingId);
      if (!filling) continue;
      const lis = fillingIngredientsMap.get(cl.fillingId) ?? [];
      const baseWeight = lis.reduce((s, li) => s + li.amount, 0);
      const multiplier = fillingOverrides[cl.fillingId] ?? 1;
      // For shelf-stable fillings the multiplier governs batch size, so leftover ≈ base × multiplier − used.
      // For other categories the recipe is fill-scaled so there's no inherent leftover; show 0 and let the user enter the actual amount.
      const isShelfStable = shelfStableCategoryNames.has(filling.category);
      // Shelf-stable fillings are scaled by multiplier, so the batch total is
      // baseWeight × multiplier. Non-shelf-stable fillings are fill-scaled, so
      // the scaled recipe yields ≈ what was needed (cl.totalWeightG).
      const totalMadeG = isShelfStable ? baseWeight * multiplier : cl.totalWeightG;
      const estimatedLeftoverG = isShelfStable ? baseWeight * multiplier - cl.totalWeightG : 0;
      entries.push({
        fillingId: cl.fillingId,
        fillingName: cl.fillingName,
        category: filling.category,
        estimatedLeftoverG,
        totalMadeG,
        shelfLifeWeeks: filling.shelfLifeWeeks,
        planId: plan.id,
        madeAt: new Date().toISOString(),
      });
    }
    return entries;
  }

  async function handleToggle(key: string) {
    const current = statusMap.get(key) ?? false;

    // Intercept fill steps being checked ON → show leftover filling prompt
    if (!current && key.startsWith("fill-")) {
      const planProductId = key.replace("fill-", "");
      const pb = planProducts.find((b) => b.id === planProductId);
      if (pb) {
        const productFillings = productFillingsMap.get(pb.productId) ?? [];
        const fillingIdsForProduct = productFillings.map((rl) => rl.fillingId);

        // Build leftover entries for fillings used by this product where all fill steps are now done
        const allEntries = buildAllLeftoverEntries();
        const readyFillings = allEntries.filter((entry) => {
          if (!fillingIdsForProduct.includes(entry.fillingId)) return false;
          const cl = consolidatedFillings.find((c) => c.fillingId === entry.fillingId);
          if (!cl) return false;
          return cl.usedBy.every((u) => {
            const fillKey = `fill-${u.planProductId}`;
            if (fillKey === key) return true;
            return statusMap.get(fillKey) ?? false;
          });
        });

        // Toggle the step first
        await toggleStep(planId, key, true);

        const newDoneCount = doneCount + 1;
        const newStatus = newDoneCount >= steps.length ? "done" : newDoneCount > 0 ? "active" : "draft";
        if (newStatus !== plan.status) {
          if (newStatus === "done") {
            await completePlan();
          } else {
            await saveProductionPlan({ ...plan as any, id: plan.id, status: newStatus });
          }
        }

        if (readyFillings.length > 0) {
          // Leftover modal will call deductPreviousBatchStock on confirm/skip
          setLeftoverModal({ entries: readyFillings, pendingStepKey: key });
        } else {
          // No leftover modal, deduct stock now
          await deductPreviousBatchStock();
        }
        return;
      }
    }

    // Intercept unmould steps being checked ON → show yield modal
    if (!current && key.startsWith("unmould-")) {
      const step = steps.find((s) => s.key === key);
      if (step?.planProductId && step.totalProducts) {
        const pb = planProducts.find((b) => b.id === step.planProductId);
        setYieldModal({
          entries: [{
            planProductId: step.planProductId,
            productName: step.label.replace("Unmould: ", ""),
            totalProducts: step.totalProducts,
            yield: pb?.actualYield ?? step.totalProducts,
          }],
          mode: "single",
          pendingStepKey: key,
        });
        return;
      }
    }

    await toggleStep(planId, key, !current);
    const newDoneCount = doneCount + (current ? -1 : 1);
    const newStatus = newDoneCount >= steps.length ? "done" : newDoneCount > 0 ? "active" : "draft";
    if (newStatus !== plan.status) {
      if (newStatus === "done") {
        await completePlan();
      } else {
        await saveProductionPlan({ ...plan as any, id: plan.id, status: newStatus });
      }
    }
  }

  async function completePlan() {
    const completedAt = new Date();
    // Emit FillingStock rows for every standalone filling batch whose step is
    // marked done — one row per PlanFilling, remainingG = targetGrams. Skip
    // PlanFillings that already have a FillingStock row for this plan+filling
    // to keep completePlan idempotent across retries.
    await writeFillingStockForDoneBatches(completedAt);

    const batchSummary = generateBatchSummary({
      batchNumber: plan.batchNumber,
      planName: plan.name,
      completedAt,
      planProducts,
      productNames,
      moulds: mouldsMap,
      fillingAmounts,
      ingredients: allIngredients.filter((i) => i.id != null) as { id: string; name: string; manufacturer?: string }[],
      previousBatches: Object.keys(fillingPreviousBatches).length > 0 ? fillingPreviousBatches : undefined,
      productsMap,
      productFillingsMap,
      standaloneFillings: standaloneAmounts,
    });
    await saveProductionPlan({ ...plan as any, id: plan.id, status: "done", completedAt, batchSummary });
  }

  /** Write FillingStock rows for every PlanFilling whose `planfilling-*` step
   *  is marked done. Deduplicates on (planId, fillingId) so re-completing a
   *  plan doesn't double-write stock. Re-reads step status from the DB rather
   *  than relying on the React closure — this runs right after a toggleStep
   *  write, and useLiveQuery may not have re-rendered yet. */
  async function writeFillingStockForDoneBatches(completedAt: Date) {
    if (planFillings.length === 0) return;
    const { db } = await import("@/lib/db");
    const [existing, liveStatuses] = await Promise.all([
      db.fillingStock.where("planId").equals(planId).toArray(),
      db.planStepStatus.where("planId").equals(planId).toArray(),
    ]);
    const doneKeys = new Set(liveStatuses.filter((s) => s.done).map((s) => s.stepKey));
    const existingKey = new Set(existing.map((s) => `${s.planId}::${s.fillingId}`));
    const madeAt = completedAt.toISOString().slice(0, 10);
    for (const pf of planFillings) {
      if (!pf.id) continue;
      if (!doneKeys.has(`planfilling-${pf.id}`)) continue;
      const key = `${planId}::${pf.fillingId}`;
      if (existingKey.has(key)) continue;
      await saveFillingStock({
        fillingId: pf.fillingId,
        remainingG: pf.actualYieldG ?? pf.targetGrams,
        planId,
        madeAt,
        createdAt: Date.now(),
      });
      existingKey.add(key);
    }
  }

  async function handleReset() {
    for (const step of steps) {
      if (statusMap.get(step.key)) {
        await toggleStep(planId, step.key, false);
      }
    }
    if (plan.status !== "draft") {
      await saveProductionPlan({ ...plan as any, id: plan.id, status: "draft" });
    }
  }

  async function handleTogglePhase(phaseId: PhaseId) {
    const phaseSteps = steps.filter((s) => s.group === phaseId);
    const allDoneInPhase = phaseSteps.every((s) => statusMap.get(s.key));
    const targetDone = !allDoneInPhase;

    // Intercept unmould phase "Mark all done" → show yield modal for all products
    if (targetDone && phaseId === "unmould") {
      const unmouldSteps = phaseSteps.filter((s) => s.planProductId && s.totalProducts && !(statusMap.get(s.key)));
      if (unmouldSteps.length > 0) {
        setYieldModal({
          entries: unmouldSteps.map((s) => {
            const pb = planProducts.find((b) => b.id === s.planProductId);
            return {
              planProductId: s.planProductId!,
              productName: s.label.replace("Unmould: ", ""),
              totalProducts: s.totalProducts!,
              yield: pb?.actualYield ?? s.totalProducts!,
            };
          }),
          mode: "batch",
        });
        return;
      }
    }

    for (const step of phaseSteps) {
      await toggleStep(planId, step.key, targetDone);
    }
    // Compute new doneCount after phase toggle
    const otherDone = steps.filter((s) => s.group !== phaseId && (statusMap.get(s.key) ?? false)).length;
    const newDoneCount = otherDone + (targetDone ? phaseSteps.length : 0);
    const newStatus = newDoneCount >= steps.length ? "done" : newDoneCount > 0 ? "active" : "draft";
    if (newStatus !== plan.status) {
      await saveProductionPlan({ ...plan as any, id: plan.id, status: newStatus });
    }
  }

  async function handleMarkAllDone() {
    // Check if any unmould steps haven't had yield recorded yet
    const unmouldSteps = steps.filter((s) => s.group === "unmould" && s.planProductId && s.totalProducts);
    const needsYield = unmouldSteps.filter((s) => {
      const pb = planProducts.find((b) => b.id === s.planProductId);
      return pb?.actualYield == null;
    });
    if (needsYield.length > 0) {
      setYieldModal({
        entries: unmouldSteps.map((s) => {
          const pb = planProducts.find((b) => b.id === s.planProductId);
          return {
            planProductId: s.planProductId!,
            productName: s.label.replace("Unmould: ", ""),
            totalProducts: s.totalProducts!,
            yield: pb?.actualYield ?? s.totalProducts!,
          };
        }),
        mode: "batch",
      });
      return;
    }
    await finishMarkAllDone();
  }

  async function finishMarkAllDone() {
    for (const step of steps) {
      if (!statusMap.get(step.key)) {
        await toggleStep(planId, step.key, true);
      }
    }
    await completePlan();
    setConfirmMarkDone(false);
  }

  async function handleYieldConfirm(entries: YieldEntry[]) {
    // Save actual yield on each PlanProduct
    for (const entry of entries) {
      const pb = planProducts.find((b) => b.id === entry.planProductId);
      if (pb) {
        await savePlanProduct({ ...pb, actualYield: entry.yield });
      }
    }

    if (yieldModal?.mode === "single" && yieldModal.pendingStepKey) {
      // Complete the single unmould step
      await toggleStep(planId, yieldModal.pendingStepKey, true);
      const newDoneCount = doneCount + 1;
      const newStatus = newDoneCount >= steps.length ? "done" : newDoneCount > 0 ? "active" : "draft";
      if (newStatus !== plan.status) {
        await saveProductionPlan({ ...plan as any, id: plan.id, status: newStatus });
      }
    } else {
      // Batch mode — toggle all steps, then show leftover modal before finishing
      for (const step of steps) {
        if (!statusMap.get(step.key)) {
          await toggleStep(planId, step.key, true);
        }
      }

      // Show leftover modal only if some fill steps were still pending
      // (if all fill steps were already done, leftover was handled per-step)
      const hadPendingFillSteps = steps
        .filter((s) => s.group === "fill")
        .some((s) => !statusMap.get(s.key));
      if (hadPendingFillSteps) {
        const leftoverEntries = buildAllLeftoverEntries();
        if (leftoverEntries.length > 0) {
          // Leftover modal will call deductPreviousBatchStock + finishMarkAllDone
          setLeftoverModal({ entries: leftoverEntries, pendingFinishAll: true });
          setYieldModal(null);
          return;
        }
        // No leftover entries but still need to deduct stock
        await deductPreviousBatchStock();
      }

      await finishMarkAllDone();
    }
    setYieldModal(null);
  }

  async function handlePrintLabels() {
    if (!plan.completedAt) return;
    setPrintState("printing");
    setPrintError("");

    // Guard: if any filling referenced by this batch can't be resolved, allergen data
    // would silently be incomplete — block the print rather than produce a bad label.
    for (const pb of planProducts) {
      const fillings = productFillingsMap.get(pb.productId) ?? [];
      const unresolved = fillings.filter((rl) => !fillingsMap.get(rl.fillingId));
      if (unresolved.length > 0) {
        const name = productNames.get(pb.productId) ?? "a product";
        setPrintState("error");
        setPrintError(`Allergen data incomplete for "${name}" — some fillings could not be resolved. Check the product before printing.`);
        return;
      }
    }

    const labels: LabelData[] = planProducts.map((pb) => {
      const product = productsMap.get(pb.productId);
      const fillings = productFillingsMap.get(pb.productId) ?? [];
      const allergenSet = new Set<string>();
      for (const rl of fillings) {
        for (const a of fillingsMap.get(rl.fillingId)!.allergens) allergenSet.add(a);
      }
      const weeks = parseInt(product?.shelfLifeWeeks ?? "");
      const bestBefore = !isNaN(weeks) && weeks > 0
        ? new Date(new Date(plan.completedAt!).getTime() + weeks * 7 * 24 * 60 * 60 * 1000)
        : null;
      return {
        productName: productNames.get(pb.productId) ?? "Unknown",
        batchNumber: plan.batchNumber ?? "",
        bestBeforeDate: bestBefore,
        allergens: Array.from(allergenSet).sort(),
        vegan: product?.vegan ?? false,
      };
    });

    const result = await printLabels(labels);
    if (result.success) {
      setPrintState("done");
      setTimeout(() => setPrintState("idle"), 3000);
    } else {
      setPrintState("error");
      setPrintError(result.error);
    }
  }

  async function handleRenamePlan() {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== plan.name) {
      await saveProductionPlan({ ...plan as any, id: plan.id, name: trimmed });
    }
    setEditingName(false);
  }

  async function handleSaveBatchNote() {
    const trimmed = batchNoteInput.trim();
    await saveProductionPlan({ ...plan as any, id: plan.id, notes: trimmed || undefined });
    setEditingBatchNote(false);
  }

  async function handleSaveProductNote(pb: PlanProduct) {
    const trimmed = productNoteInput.trim();
    await savePlanProduct({ ...pb, notes: trimmed || undefined });
    setEditingProductNoteId(null);
  }

  const daysSinceCreated = Math.floor((Date.now() - new Date(plan.createdAt as Date).getTime()) / 86_400_000);
  const ageLabel = plan.status === "done"
    ? `Completed · ${new Date((plan.completedAt ?? plan.createdAt) as Date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`
    : daysSinceCreated === 0 ? "Started today"
    : daysSinceCreated === 1 ? "Started yesterday"
    : `Day ${daysSinceCreated + 1} of this batch`;

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3">
          <ArrowLeft className="w-4 h-4" /> {backLabel}
        </Link>
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-1.5">
                <input
                  autoFocus
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleRenamePlan(); if (e.key === "Escape") setEditingName(false); }}
                  className="flex-1 rounded-md border border-border bg-card px-2 py-1 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button onClick={handleRenamePlan} className="p-1 rounded-full hover:bg-muted"><Check className="w-4 h-4 text-primary" /></button>
                <button onClick={() => setEditingName(false)} className="p-1 rounded-full hover:bg-muted"><X className="w-4 h-4 text-muted-foreground" /></button>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 group">
                <h1 className="text-xl font-bold truncate">{plan.name}</h1>
                <button
                  onClick={() => { setNameInput(plan.name); setEditingName(true); }}
                  className="p-1 rounded-full opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity"
                  aria-label="Rename batch"
                >
                  <Pencil className="w-3.5 h-3.5 text-muted-foreground" />
                </button>
              </div>
            )}
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              {plan.batchNumber && (
                <>
                  <span className="font-mono text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{plan.batchNumber}</span>
                  <span className="text-xs text-muted-foreground">·</span>
                </>
              )}
              <p className="text-xs text-muted-foreground">{ageLabel}</p>
              <span className="text-xs text-muted-foreground">·</span>
              <p className="text-xs text-muted-foreground">{doneCount} / {steps.length} steps</p>
              {plan.batchSummary && (
                <>
                  <span className="text-xs text-muted-foreground">·</span>
                  <Link href={`/production/${encodeURIComponent(planId)}/summary`} className="inline-flex items-center gap-1 text-xs text-primary">
                    <ClipboardList className="w-3 h-3" /> Summary
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-accent rounded-full transition-all duration-300"
            style={{ width: steps.length > 0 ? `${(doneCount / steps.length) * 100}%` : "0%" }}
          />
        </div>

        {/* Batch note */}
        {editingBatchNote ? (
          <div className="mt-3">
            <textarea
              autoFocus
              value={batchNoteInput}
              onChange={(e) => setBatchNoteInput(e.target.value)}
              onBlur={handleSaveBatchNote}
              onKeyDown={(e) => { if (e.key === "Escape") setEditingBatchNote(false); }}
              placeholder="Note for this batch…"
              rows={3}
              className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>
        ) : plan.notes ? (
          <button
            onClick={() => { setBatchNoteInput(plan.notes ?? ""); setEditingBatchNote(true); }}
            className="mt-3 w-full flex items-start gap-2 text-left group"
          >
            <StickyNote className="w-3.5 h-3.5 text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-xs text-muted-foreground italic flex-1 leading-relaxed">{plan.notes}</p>
            <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
          </button>
        ) : (
          <button
            onClick={() => { setBatchNoteInput(""); setEditingBatchNote(true); }}
            className="mt-2 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <StickyNote className="w-3 h-3" /> Add batch note
          </button>
        )}

        {/* Print labels (Niimbot) */}
        {plan.status === "done" && printerEnabled && (
          <div className="mt-3">
            {printState === "error" && (
              <p className="text-xs text-destructive mb-1">{printError}</p>
            )}
            <button
              onClick={handlePrintLabels}
              disabled={printState === "printing"}
              className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              <Printer className="w-3.5 h-3.5" />
              {printState === "printing" ? "Generating…" : printState === "done" ? "Saved!" : "Save labels"}
            </button>
          </div>
        )}

      </div>


      {steps.length === 0 ? (
        <div className="px-4 py-6 space-y-4">
          <p className="text-sm text-muted-foreground text-center">
            No steps generated. Add a filling batch below, or add products with fillings to this plan.
          </p>
          {/* Allow adding standalone batches even when the plan has no steps —
              this is the path back from an emptied-out fillings-only plan. */}
          <StandaloneBatchesPanel
            planId={planId}
            planFillings={planFillings}
            fillingsMap={fillingsMap}
            allFillings={allFillings}
            statusMap={statusMap}
            nextSortOrder={planFillings.reduce((m, pf) => Math.max(m, pf.sortOrder ?? 0), -1) + 1}
          />
        </div>
      ) : (
        <>
          {/* Phase tab bar — only phases with at least one step are shown;
              fillings-only plans collapse to a single "Fillings" tab. */}
          <div className="flex gap-1.5 overflow-x-auto px-4 pb-1 mt-3" style={{ scrollbarWidth: "none" }}>
            {visiblePhases.map(({ id, label }) => {
              const phaseSteps = steps.filter((s) => s.group === id);
              const phaseDone = phaseSteps.filter((s) => statusMap.get(s.key)).length;
              const allPhaseDone = phaseSteps.length > 0 && phaseDone === phaseSteps.length;
              const active = activePhase === id;
              return (
                <button
                  key={id}
                  onClick={() => setActivePhase(id)}
                  className={`shrink-0 flex flex-col items-center px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                    active
                      ? "bg-accent text-accent-foreground"
                      : allPhaseDone
                        ? "bg-status-ok-bg text-status-ok"
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                  }`}
                >
                  <span>{label}</span>
                  {phaseSteps.length > 0 && (
                    <span className={`text-[10px] font-normal mt-0.5 ${active ? "opacity-70" : ""}`}>
                      {phaseDone}/{phaseSteps.length}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Active phase content */}
          <div className="px-4 mt-3 pb-8 space-y-3">
            {/* Materials needed — Colour tab: on-mould steps only; Cap tab: transfer sheets + after-cap steps */}
            {((activePhase === "colour" && colouringMaterialIds.length > 0) ||
              (activePhase === "cap" && cappingMaterialIds.length > 0)) && (
              <div className="rounded-lg border border-border bg-card p-3 mb-1">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Materials needed for this step</p>
                <ul className="space-y-1.5">
                  {(activePhase === "colour" ? colouringMaterialIds : cappingMaterialIds).map((id) => {
                    const material = materialsMap.get(id);
                    return (
                      <li key={id} className="flex items-center gap-2.5">
                        <span
                          className="w-3.5 h-3.5 rounded-full border border-black/10 shrink-0"
                          style={{ backgroundColor: material?.color ?? "#9ca3af" }}
                        />
                        <span className="text-sm flex-1">{material?.name ?? id}</span>
                        <LowStockFlagButton
                          flagged={material?.lowStock}
                          itemName={material?.name}
                          onFlag={() => setDecorationMaterialLowStock(id, true)}
                          size="sm"
                        />
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {/* Fillings-tab actions — view scaled recipes + manage standalone
                filling batches. The Scaled-recipes button sits inline with the
                panel's empty-state "Add filling batch" button; when the panel
                expands (batches exist or the user is adding one) the panel
                card occupies its own row below. */}
            {activePhase === "filling" && (
              <div className="flex flex-wrap items-start gap-2">
                {(fillingAmounts.length > 0 || standaloneAmounts.length > 0) && (
                  <Link
                    href={`/production/${encodeURIComponent(planId)}/products?back=${activePhase}`}
                    className="btn-secondary"
                  >
                    <BookOpen className="w-4 h-4 shrink-0" />
                    Scaled recipes
                  </Link>
                )}
                <StandaloneBatchesPanel
                  planId={planId}
                  planFillings={planFillings}
                  fillingsMap={fillingsMap}
                  allFillings={allFillings}
                  statusMap={statusMap}
                  nextSortOrder={planFillings.reduce((m, pf) => Math.max(m, pf.sortOrder ?? 0), -1) + 1}
                />
              </div>
            )}

            {/* Step checklist for active phase */}
            {(() => {
              const activeSteps = steps.filter((s) => s.group === activePhase);
              if (activeSteps.length === 0) {
                return <p className="text-sm text-muted-foreground py-4 text-center">No steps for this phase.</p>;
              }

              const allDoneInPhase = activeSteps.every((s) => statusMap.get(s.key));
              const markAllBtn = (
                <div className="flex justify-end">
                  <button
                    onClick={() => handleTogglePhase(activePhase)}
                    className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {allDoneInPhase ? "Unmark all" : "Mark all done"}
                  </button>
                </div>
              );

              // Shell + Cap tabs: group steps by chocolate/coating type
              if (activePhase === "shell" || activePhase === "cap") {
                const coatingOrder: string[] = [];
                const byCoating = new Map<string, typeof activeSteps>();
                for (const step of activeSteps) {
                  const c = step.coating ?? "chocolate";
                  if (!byCoating.has(c)) { byCoating.set(c, []); coatingOrder.push(c); }
                  byCoating.get(c)!.push(step);
                }
                return (
                  <div className="space-y-4">
                    {markAllBtn}
                    {coatingOrder.map((coating) => {
                      const coatingSteps = byCoating.get(coating)!;
                      const coatingMoulds = coatingSteps.reduce((s, st) => s + (st.mouldCount ?? 0), 0);
                      const mapping = currentCoatingMappings.get(coating);
                      const seedTempering = activePhase === "shell" && (mapping?.seedTempering ?? false);
                      let temperingPanel: React.ReactNode = null;
                      if (seedTempering) {
                        // Sum total cavity weight (g) for all planProducts with this coating
                        // using manufacturer's cavityWeightG. Walks every mould slot (primary
                        // + additionalMoulds) so alt-setup plan products are included too.
                        const mouldsMissingWeight: string[] = [];
                        const totalCavityG = planProducts.reduce((sum, pb) => {
                          if ((productsMap.get(pb.productId)?.coating ?? "chocolate") !== coating) return sum;
                          let pbTotal = 0;
                          for (const slot of getMouldSlots(pb, mouldsMap)) {
                            if (slot.mould.cavityWeightG == null) {
                              if (!mouldsMissingWeight.includes(slot.mould.name)) mouldsMissingWeight.push(slot.mould.name);
                              continue;
                            }
                            pbTotal += slot.cavityCount * slot.mould.cavityWeightG;
                          }
                          return sum + pbTotal;
                        }, 0);
                        if (mouldsMissingWeight.length > 0) {
                          temperingPanel = (
                            <div className="mt-2 mb-3 rounded-md bg-status-warn-bg border border-status-warn-edge px-3 py-2.5 text-xs text-status-warn">
                              <p className="font-semibold text-status-warn text-[10px] uppercase tracking-wide mb-1">Seeding method</p>
                              <p>Set <strong>Cavity weight (g)</strong> on {mouldsMissingWeight.join(", ")} to see chocolate amounts.</p>
                            </div>
                          );
                        } else {
                          const totalG = Math.round(totalCavityG * 1.1);
                          const meltedG = Math.round(totalG * 4 / 5);
                          const seedG = Math.round(totalG / 5);
                          const isDark = coating.toLowerCase() === "dark";
                          const silkPct = isDark ? 1 : 2;
                          const silkG = Math.round(totalG * silkPct / 100);
                          temperingPanel = (
                            <div className="mt-2 mb-3 rounded-md bg-status-warn-bg border border-status-warn-edge px-3 py-2.5 text-xs space-y-1.5">
                              <p className="font-semibold text-status-warn uppercase tracking-wide text-[10px]">Seeding method — chocolate amounts</p>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-status-warn">
                                <span className="text-muted-foreground">Total chocolate</span><span className="font-medium">{totalG} g</span>
                                <span className="text-muted-foreground">Melt (⁴⁄₅)</span><span className="font-medium">{meltedG} g</span>
                                <span className="text-muted-foreground">Seed (¹⁄₅)</span><span className="font-medium">{seedG} g</span>
                                <span className="text-muted-foreground">Silk / Mycryo ({silkPct}%)</span><span className="font-medium">{silkG} g</span>
                              </div>
                            </div>
                          );
                        }
                      }
                      const regularCapSteps = coatingSteps.filter((s) => s.subgroup !== "after_cap");
                      const afterCapSteps = coatingSteps.filter((s) => s.subgroup === "after_cap");
                      return (
                      <div key={coating}>
                        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2 capitalize flex items-center gap-1.5">
                          {coating}
                          <span className="font-normal normal-case tracking-normal">· {coatingMoulds} mould{coatingMoulds !== 1 ? "s" : ""}</span>
                        </h3>
                        {temperingPanel}
                        <ul className="space-y-1.5">
                          {regularCapSteps.map((step) => (
                            <StepItem key={step.key} step={step} done={statusMap.get(step.key) ?? false} onToggle={handleToggle} materialsMap={materialsMap} />
                          ))}
                        </ul>
                        {afterCapSteps.length > 0 && (
                          <div className="mt-3">
                            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide mb-1.5">After capping</p>
                            <ul className="space-y-1.5">
                              {afterCapSteps.map((step) => (
                                <StepItem key={step.key} step={step} done={statusMap.get(step.key) ?? false} onToggle={handleToggle} materialsMap={materialsMap} />
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      );
                    })}
                  </div>
                );
              }

              return (
                <div className="space-y-3">
                  {markAllBtn}
                  <ul className="space-y-1.5">
                  {activeSteps.map((step, stepIdx) => {
                    const done = statusMap.get(step.key) ?? false;
                    const prevColors = activeSteps[stepIdx - 1]?.colors?.join(",") ?? "";
                    const curColors = step.colors?.join(",") ?? "";
                    const showSeparator = activePhase === "colour"
                      && stepIdx > 0
                      && step.colors && step.colors.length > 0
                      && curColors !== prevColors;
                    return (
                      <li key={step.key}>
                        {showSeparator && (
                          <div className="flex items-center gap-2 py-1.5 mb-1.5">
                            <div className="flex-1 h-px bg-border" />
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                              Switch to
                              {step.colors!.map((id) => {
                                const m = materialsMap.get(id);
                                return (
                                  <span
                                    key={id}
                                    className="inline-block w-2.5 h-2.5 rounded-full border border-black/10"
                                    style={{ backgroundColor: m?.color ?? "#9ca3af" }}
                                    title={m?.name ?? id}
                                  />
                                );
                              })}
                              {step.colors!.map((id) => materialsMap.get(id)?.name ?? id).join(", ")}
                            </span>
                            <div className="flex-1 h-px bg-border" />
                          </div>
                        )}
                        <StepItem
                          step={step}
                          done={done}
                          onToggle={handleToggle}
                          materialsMap={materialsMap}
                          yieldInfo={step.group === "unmould" && step.planProductId ? (() => {
                            const pb = planProducts.find((b) => b.id === step.planProductId);
                            return pb?.actualYield != null ? { actual: pb.actualYield, total: step.totalProducts ?? 0 } : null;
                          })() : undefined}
                        />
                      </li>
                    );
                  })}
                  </ul>
                </div>
              );
            })()}

            <button
              onClick={handleReset}
              className="flex items-center gap-1.5 text-xs text-muted-foreground mt-1"
            >
              <RotateCcw className="w-3.5 h-3.5" /> Reset all steps
            </button>
          </div>
        </>
      )}

      {/* Per-product notes */}
      {planProducts.length > 0 && (
        <div className="px-4 mt-2 pb-8 border-t border-border pt-4">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">Product notes</h2>
          <div className="space-y-2">
            {planProducts.map((pb) => {
              const productName = productNames.get(pb.productId) ?? "Unknown";
              const isEditing = editingProductNoteId === pb.id;
              return (
                <div key={pb.id} className="rounded-lg border border-border bg-card px-3 py-2.5">
                  <p className="text-xs font-medium text-foreground mb-1.5">{productName}</p>
                  {isEditing ? (
                    <textarea
                      autoFocus
                      value={productNoteInput}
                      onChange={(e) => setProductNoteInput(e.target.value)}
                      onBlur={() => handleSaveProductNote(pb)}
                      onKeyDown={(e) => { if (e.key === "Escape") setEditingProductNoteId(null); }}
                      placeholder="What happened with this product…"
                      rows={3}
                      className="w-full rounded-md border border-border bg-card px-2 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                    />
                  ) : pb.notes ? (
                    <button
                      onClick={() => { setProductNoteInput(pb.notes ?? ""); setEditingProductNoteId(pb.id!); }}
                      className="w-full flex items-start gap-2 text-left group"
                    >
                      <p className="text-xs text-muted-foreground italic flex-1 leading-relaxed">{pb.notes}</p>
                      <Pencil className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 mt-0.5" />
                    </button>
                  ) : (
                    <button
                      onClick={() => { setProductNoteInput(""); setEditingProductNoteId(pb.id!); }}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Plus className="w-3 h-3" /> Add note
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mark batch as done — placed at the bottom so it's reached only after reviewing all steps */}
      {plan.status !== "done" && (
        <div className="px-4 pt-4 pb-8 border-t border-border mt-2">
          {confirmMarkDone ? (
            <div className="rounded-lg border border-status-ok-edge bg-status-ok-bg px-3 py-2.5">
              <p className="text-sm font-medium text-status-ok mb-0.5">Mark entire batch as done?</p>
              <p className="text-xs text-status-ok mb-2.5">
                All {steps.length} steps will be marked complete and this batch will be closed out.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={handleMarkAllDone}
                  className="rounded-full bg-status-ok text-white px-3 py-1.5 text-sm font-medium"
                >
                  Yes, mark as done
                </button>
                <button
                  onClick={() => setConfirmMarkDone(false)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmMarkDone(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              <Check className="w-3.5 h-3.5" />
              Mark batch as done
            </button>
          )}
        </div>
      )}

      {/* Yield modal */}
      {yieldModal && (
        <YieldModal
          entries={yieldModal.entries}
          mode={yieldModal.mode}
          onConfirm={handleYieldConfirm}
          onCancel={() => setYieldModal(null)}
        />
      )}

      {leftoverModal && (
        <LeftoverModal
          entries={leftoverModal.entries}
          onConfirm={async (results) => {
            // Deduct old stock for all fillings sourced from previous batch
            await deductPreviousBatchStock();
            // Save new leftover stock — mark as frozen when the user chose
            // "Freeze leftover" (captures the full shelf life as preserved days).
            for (const r of results) {
              await saveFillingStock({
                fillingId: r.fillingId,
                remainingG: r.remainingG,
                planId: r.planId,
                madeAt: r.madeAt,
                createdAt: Date.now(),
                ...(r.frozen ? {
                  frozen: true,
                  frozenAt: Date.now(),
                  preservedShelfLifeDays: r.preservedShelfLifeDays ?? 0,
                } : {}),
              });
            }
            const shouldFinish = leftoverModal.pendingFinishAll;
            setLeftoverModal(null);
            if (shouldFinish) await finishMarkAllDone();
          }}
          onSkip={async () => {
            // Deduct old stock even when skipping leftover registration
            await deductPreviousBatchStock();
            const shouldFinish = leftoverModal.pendingFinishAll;
            setLeftoverModal(null);
            if (shouldFinish) await finishMarkAllDone();
          }}
        />
      )}
    </div>
  );
}

function StepItem({ step, done, onToggle, materialsMap, yieldInfo }: {
  step: { key: string; label: string; detail?: string; colors?: string[] };
  done: boolean;
  onToggle: (key: string) => void;
  materialsMap: Map<string, DecorationMaterial>;
  yieldInfo?: { actual: number; total: number } | null;
}) {
  return (
    <button
      onClick={() => onToggle(step.key)}
      className={`w-full flex items-center gap-3 p-3 rounded-lg border text-left transition-colors ${
        done ? "border-status-ok-edge bg-status-ok-bg" : "border-border bg-card"
      }`}
    >
      <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${
        done ? "bg-status-ok border-status-ok" : "border-border"
      }`}>
        {done && (
          <svg className="w-3 h-3 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        )}
      </div>
      {step.colors && step.colors.length > 0 && (
        <div className="flex gap-0.5 shrink-0">
          {step.colors.map((id) => {
            const m = materialsMap.get(id);
            return (
              <span
                key={id}
                className="inline-block w-3 h-3 rounded-full border border-black/10"
                style={{ backgroundColor: m?.color ?? "#9ca3af" }}
                title={m?.name ?? id}
              />
            );
          })}
        </div>
      )}
      <div className="flex-1 min-w-0">
        <p className={`text-sm ${done ? "line-through text-muted-foreground" : ""}`}>{step.label}</p>
        {step.detail && <p className="text-xs text-muted-foreground">{step.detail}</p>}
        {yieldInfo && done && (
          <p className="text-xs text-status-ok mt-0.5 font-medium">
            {yieldInfo.actual === yieldInfo.total
              ? `${yieldInfo.actual} to stock`
              : `${yieldInfo.actual} to stock · ${yieldInfo.total - yieldInfo.actual} set aside`
            }
          </p>
        )}
      </div>
    </button>
  );
}

// ─── Standalone filling-batches panel (hybrid + fillings-only plans) ─────────
// Lets the user add extra filling batches to any plan and remove ones that
// haven't been started yet. Done batches (step marked complete) are locked —
// a completed batch has already been written to FillingStock and must not
// disappear silently.
function StandaloneBatchesPanel({
  planId,
  planFillings,
  fillingsMap,
  allFillings,
  statusMap,
  nextSortOrder,
}: {
  planId: string;
  planFillings: PlanFilling[];
  fillingsMap: Map<string, Filling>;
  allFillings: Filling[];
  statusMap: Map<string, boolean>;
  nextSortOrder: number;
}) {
  const [adding, setAdding] = useState(false);
  const [pickFillingId, setPickFillingId] = useState<string>("");
  const [pickGrams, setPickGrams] = useState<string>("500");
  const [pendingRemoveId, setPendingRemoveId] = useState<string | null>(null);

  const usedFillingIds = new Set(planFillings.map((pf) => pf.fillingId));
  const options = allFillings
    .filter((f) => !f.archived && !usedFillingIds.has(f.id!))
    .sort((a, b) => a.name.localeCompare(b.name));

  async function handleAdd() {
    const g = parseInt(pickGrams, 10);
    if (!pickFillingId || !g || g <= 0) return;
    await savePlanFilling({
      planId,
      fillingId: pickFillingId,
      targetGrams: g,
      sortOrder: nextSortOrder,
    });
    setAdding(false);
    setPickFillingId("");
    setPickGrams("500");
  }

  async function handleRemove(id: string) {
    await deletePlanFilling(id);
    setPendingRemoveId(null);
  }

  // Empty state: render as a pill button so it reads as a real action rather
  // than a footnote. Matches the adjacent "Scaled recipes" button.
  if (planFillings.length === 0 && !adding) {
    return (
      <button
        onClick={() => setAdding(true)}
        className="btn-secondary"
      >
        <Sprout className="w-4 h-4 shrink-0" /> Add filling batch for stock
      </button>
    );
  }

  // Expanded: take the full row (breaks the inline flex pair onto its own line).
  return (
    <div className="basis-full rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-muted/40 flex items-center justify-between">
        <p className="mono-label text-muted-foreground flex items-center gap-1.5">
          <Sprout className="w-3.5 h-3.5" /> Filling batches for stock
        </p>
        <span className="text-[10px] text-muted-foreground">
          {planFillings.length} batch{planFillings.length === 1 ? "" : "es"}
        </span>
      </div>

      {planFillings.length > 0 && (
        <ul className="divide-y divide-border">
          {planFillings.map((pf) => {
            const filling = fillingsMap.get(pf.fillingId);
            const stepKey = `planfilling-${pf.id}`;
            const done = statusMap.get(stepKey) ?? false;
            const isPendingRemove = pendingRemoveId === pf.id;
            return (
              <li key={pf.id} className="flex items-center gap-2 px-3 py-2">
                <Beaker className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{filling?.name ?? "Unknown filling"}</p>
                  {filling?.category && (
                    <p className="text-xs text-muted-foreground truncate">{filling.category}</p>
                  )}
                </div>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">{pf.targetGrams}g</span>
                {done ? (
                  <span className="inline-flex items-center gap-1 text-[10px] text-status-ok shrink-0">
                    <Check className="w-3 h-3" /> Made
                  </span>
                ) : isPendingRemove ? (
                  <span className="flex items-center gap-1.5 text-xs shrink-0">
                    <span className="text-muted-foreground">Remove?</span>
                    <button onClick={() => handleRemove(pf.id!)} className="text-destructive font-medium hover:underline">
                      Yes
                    </button>
                    <button onClick={() => setPendingRemoveId(null)} className="text-muted-foreground hover:underline">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setPendingRemoveId(pf.id!)}
                    className="p-1 rounded-full hover:bg-muted transition-colors shrink-0"
                    aria-label={`Remove ${filling?.name ?? "filling"} batch`}
                  >
                    <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding ? (
        <div className="px-3 py-2.5 border-t border-border bg-muted/20 space-y-2">
          <div>
            <label className="label" htmlFor="batch-filling-picker">Filling</label>
            <select
              id="batch-filling-picker"
              value={pickFillingId}
              onChange={(e) => setPickFillingId(e.target.value)}
              className="input w-full"
              autoFocus
            >
              <option value="">— pick a filling —</option>
              {options.map((f) => (
                <option key={f.id} value={f.id!}>
                  {f.name} {f.category ? `· ${f.category}` : ""}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="batch-target-grams">Target weight (g)</label>
            <input
              id="batch-target-grams"
              type="number"
              min="1"
              step="10"
              value={pickGrams}
              onChange={(e) => setPickGrams(e.target.value)}
              className="input w-full"
            />
          </div>
          <div className="flex gap-2 justify-end pt-1">
            <button
              onClick={() => { setAdding(false); setPickFillingId(""); setPickGrams("500"); }}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleAdd}
              disabled={!pickFillingId || !pickGrams || parseInt(pickGrams, 10) <= 0}
              className="btn-primary px-3 py-1 text-xs"
            >
              Add batch
            </button>
          </div>
        </div>
      ) : (
        <div className="px-3 py-2 border-t border-border">
          <button
            onClick={() => setAdding(true)}
            disabled={options.length === 0}
            className="inline-flex items-center gap-1.5 text-sm text-foreground hover:opacity-70 disabled:opacity-40 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            {options.length === 0 ? "All fillings already batched" : "Add filling batch"}
          </button>
        </div>
      )}
    </div>
  );
}
