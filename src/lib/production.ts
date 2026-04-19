import type { PlanProduct, ProductFilling, Filling, FillingIngredient, Mould, Product, FillingPreviousBatch, DecorationMaterial } from "@/types";
import { SHELF_STABLE_CATEGORIES, normalizeApplyAt } from "@/types";

// Legacy fill factor — used as the default when a product has no per-product
// shellPercentage set. Equals (100 - 37) / 100 = 0.63, matching the old
// SHELL_FACTOR(30) + CAP_FACTOR(7) split.
export const FILL_FACTOR = 0.63;

/** Default shell percentage for products that predate the per-product field.
 *  37 = old SHELL_FACTOR(30%) + CAP_FACTOR(7%). */
export const DEFAULT_SHELL_PERCENTAGE = 37;

// Assumed density for filling calculations (g/ml). Ganache ≈ 1.1–1.3 g/ml.
export const DENSITY_G_PER_ML = 1.2;

export type ProductionStep = {
  key: string;
  label: string;
  group: "colour" | "shell" | "filling" | "fill" | "cap" | "unmould";
  detail?: string;
  colors?: string[];
  coating?: string;   // set on shell/cap steps for grouping by chocolate type
  mouldCount?: number; // number of physical moulds for this step (shell/fill/cap/unmould)
  subgroup?: "after_cap"; // decoration steps applied after capping
  planProductId?: string; // set on unmould steps to reference the specific PlanProduct
  totalProducts?: number; // total product count for this step (moulds × cavities)
};

export type ColorTask = {
  planProductId: string;
  mouldId: string;
  stepIndex: number;
  technique: string;
  colors: string[];     // normalized lowercase
  mouldName: string;
  mouldDetail?: string;
  notes?: string;
  productName: string;
};

/**
 * Reorder decoration tasks across products to minimize cocoa butter color switches.
 *
 * Constraints: within a single product, steps must stay in order (step 0 before step 1).
 * Across products, steps are freely reorderable.
 *
 * Greedy algorithm: batch all ready tasks by current color; when switching,
 * pick the color with the most ready tasks (tiebreak: fewest total remaining).
 */
export function scheduleColorSteps(tasks: ColorTask[]): ColorTask[] {
  if (tasks.length <= 1) return tasks;

  // Group tasks by planProductId to build dependency chains
  const byProduct = new Map<string, ColorTask[]>();
  for (const t of tasks) {
    const arr = byProduct.get(t.planProductId) ?? [];
    arr.push(t);
    byProduct.set(t.planProductId, arr);
  }
  // Sort each product's tasks by stepIndex
  for (const arr of byProduct.values()) {
    arr.sort((a, b) => a.stepIndex - b.stepIndex);
  }

  // Track which stepIndex is "next" (ready) for each product
  const nextIndex = new Map<string, number>();
  for (const id of byProduct.keys()) nextIndex.set(id, 0);

  // Build initial ready queue
  const ready: ColorTask[] = [];
  for (const [productId, arr] of byProduct) {
    if (arr.length > 0) ready.push(arr[0]);
  }

  // Count total remaining tasks per color (for tiebreaking)
  const totalColorCount = new Map<string, number>();
  for (const t of tasks) {
    for (const c of t.colors) {
      totalColorCount.set(c, (totalColorCount.get(c) ?? 0) + 1);
    }
  }

  const result: ColorTask[] = [];
  let currentColor: string | null = null;

  while (ready.length > 0) {
    // Find ready tasks matching current color
    const matching = currentColor !== null
      ? ready.filter((t) => t.colors.length === 0 || t.colors.includes(currentColor!))
      : [];

    let batch: ColorTask[];
    if (matching.length > 0) {
      // Multi-color steps first: do more complex work while multiple colors are active
      batch = [...matching].sort((a, b) => b.colors.length - a.colors.length);
    } else {
      // Pick next color: most ready tasks, tiebreak by fewest total remaining
      const colorReadyCount = new Map<string, number>();
      for (const t of ready) {
        for (const c of t.colors) {
          colorReadyCount.set(c, (colorReadyCount.get(c) ?? 0) + 1);
        }
      }

      // Also handle tasks with no colors (wildcards) — group them together
      const hasWildcards = ready.some((t) => t.colors.length === 0);
      if (colorReadyCount.size === 0 && hasWildcards) {
        // Only wildcards left
        batch = [...ready];
      } else {
        let bestColor: string | null = null;
        let bestReady = -1;
        let bestTotal = Infinity;
        for (const [color, readyCount] of colorReadyCount) {
          const total = totalColorCount.get(color) ?? 0;
          if (
            readyCount > bestReady ||
            (readyCount === bestReady && total < bestTotal)
          ) {
            bestColor = color;
            bestReady = readyCount;
            bestTotal = total;
          }
        }
        currentColor = bestColor;
        const picked = currentColor !== null
          ? ready.filter((t) => t.colors.length === 0 || t.colors.includes(currentColor!))
          : [...ready];
        // Multi-color steps first within this batch
        batch = picked.sort((a, b) => b.colors.length - a.colors.length);
      }
    }

    // Process batch: remove from ready, add to result, advance successors
    for (const task of batch) {
      result.push(task);
      const idx = ready.indexOf(task);
      if (idx >= 0) ready.splice(idx, 1);

      // Decrement total color counts
      for (const c of task.colors) {
        const cur = totalColorCount.get(c) ?? 1;
        totalColorCount.set(c, cur - 1);
      }

      // Advance successor
      const productTasks = byProduct.get(task.planProductId)!;
      const nextIdx = (nextIndex.get(task.planProductId) ?? 0) + 1;
      nextIndex.set(task.planProductId, nextIdx);
      if (nextIdx < productTasks.length) {
        ready.push(productTasks[nextIdx]);
      }
    }
  }

  return result;
}

export type ScaledIngredient = {
  ingredientId: string;
  amount: number;
  unit: string;
  note?: string;
};

export type FillingAmount = {
  fillingId: string;
  fillingName: string;
  planProductId: string;
  productName: string;
  weightG: number;
  // Scaled ingredient amounts for this batch
  scaledIngredients: ScaledIngredient[];
  // True when this filling is being sourced from a prior batch — no ingredients to prepare
  isFromPreviousBatch?: boolean;
  // When isFromPreviousBatch is true: the date it was made (ISO string)
  previousBatchMadeAt?: string;
};

/** A filling consolidated across all plan products that use it. */
export type ConsolidatedFilling = {
  fillingId: string;
  fillingName: string;
  /** Total weight to prepare (sum across all products using this filling). */
  totalWeightG: number;
  /** Merged & summed ingredient amounts for the consolidated batch. */
  scaledIngredients: ScaledIngredient[];
  /** Which products use this filling and how much each needs. */
  usedBy: { planProductId: string; productName: string; weightG: number }[];
  /** True when shared by 2+ plan products. */
  shared: boolean;
  /** True when sourced from a prior batch (no ingredients to prepare). */
  isFromPreviousBatch?: boolean;
  previousBatchMadeAt?: string;
};

/**
 * Consolidate per-planProduct FillingAmounts into one entry per unique filling.
 *
 * Fillings used by multiple products are merged: weights are summed and
 * ingredient amounts are aggregated. The `usedBy` array shows the breakdown.
 */
export function consolidateSharedFillings(fillingAmounts: FillingAmount[]): ConsolidatedFilling[] {
  const map = new Map<string, ConsolidatedFilling>();

  for (const la of fillingAmounts) {
    const existing = map.get(la.fillingId);
    if (existing) {
      existing.totalWeightG += la.weightG;
      existing.usedBy.push({
        planProductId: la.planProductId,
        productName: la.productName,
        weightG: la.weightG,
      });
      // Merge scaled ingredients: sum amounts by ingredientId
      for (const si of la.scaledIngredients) {
        const existingIng = existing.scaledIngredients.find(
          (e) => e.ingredientId === si.ingredientId,
        );
        if (existingIng) {
          existingIng.amount = Math.round((existingIng.amount + si.amount) * 10) / 10;
        } else {
          existing.scaledIngredients.push({ ...si });
        }
      }
    } else {
      map.set(la.fillingId, {
        fillingId: la.fillingId,
        fillingName: la.fillingName,
        totalWeightG: la.weightG,
        scaledIngredients: la.scaledIngredients.map((si) => ({ ...si })),
        usedBy: [{
          planProductId: la.planProductId,
          productName: la.productName,
          weightG: la.weightG,
        }],
        shared: false, // will be set below
        isFromPreviousBatch: la.isFromPreviousBatch,
        previousBatchMadeAt: la.previousBatchMadeAt,
      });
    }
  }

  // Mark shared fillings and round totals
  for (const cl of map.values()) {
    cl.shared = cl.usedBy.length > 1;
    cl.totalWeightG = Math.round(cl.totalWeightG);
  }

  return Array.from(map.values());
}

/**
 * Calculate how many grams of each filling are needed.
 *
 * quantity = number of moulds.
 * Total cavity weight = cavityWeightG × numberOfCavities × quantity.
 * Fill factor = (100 - product.shellPercentage) / 100 — derived from the per-product
 * shell percentage (or DEFAULT_SHELL_PERCENTAGE = 37 for pre-v3 products).
 *
 * For shelf-stable fillings (Fruit & Acid, Nut-Based): weight is determined by
 * the base product weight × the user-supplied multiplier (default 1×).
 *
 * Filling volumes for ganaches/caramels are split proportionally to each filling's product weight.
 * Ingredient amounts are then scaled to match the required batch weight.
 */
export function calculateFillingAmounts(
  planProducts: PlanProduct[],
  productNames: Map<string, string>,
  productFillingsMap: Map<string, ProductFilling[]>,
  fillingIngredientsMap: Map<string, FillingIngredient[]>,
  fillingsMap: Map<string, Filling>,
  moulds: Map<string, Mould>,
  // fillingId → multiplier for shelf-stable fillings
  fillingOverrides: Record<string, number> = {},
  // fillingId → previous batch info (filling sourced from a prior batch)
  fillingPreviousBatches: Record<string, FillingPreviousBatch> = {},
  // productId → Product for reading shellPercentage
  productsMap: Map<string, Product> = new Map(),
  // Names of filling categories where `shelfStable === true`. When omitted, falls
  // back to the legacy hardcoded SHELF_STABLE_CATEGORIES list (only used by tests
  // / pre-migration callers — production callers pass the live set from the DB).
  shelfStableCategoryNames?: ReadonlySet<string>,
): FillingAmount[] {
  const results: FillingAmount[] = [];

  for (const pb of planProducts) {
    const mould = moulds.get(pb.mouldId);
    if (!mould) continue;

    // Derive fill factor from the product's per-product shellPercentage
    const product = productsMap.get(pb.productId);
    const shellPct = product?.shellPercentage ?? DEFAULT_SHELL_PERCENTAGE;
    const fillFactor = (100 - shellPct) / 100;

    // Total fill weight for all moulds in this plan entry
    // cavityWeightG is the cavity volume expressed as grams of water (≈ ml),
    // so we multiply by ganache density to get actual fill weight in grams.
    const totalCavityVolumeML = mould.cavityWeightG * mould.numberOfCavities * pb.quantity;
    const fillWeightG = totalCavityVolumeML * fillFactor * DENSITY_G_PER_ML;

    const productFillings = productFillingsMap.get(pb.productId) ?? [];

    // Sum ingredient amounts per filling (their "product weight" = base batch total)
    const fillingWeights = productFillings.map((bl) => {
      const lis = fillingIngredientsMap.get(bl.fillingId) ?? [];
      return {
        fillingId: bl.fillingId,
        totalWeight: lis.reduce((s, li) => s + li.amount, 0),
        ingredients: lis,
      };
    });

    // Only ganache/caramel fillings are fill-scaled; shelf-stable fillings use their own batch size.
    // The set of shelf-stable category names comes from the fillingCategories table at runtime
    // (passed in by callers); fall back to the legacy constant for tests and pre-migration code.
    const shelfStableSet: ReadonlySet<string> =
      shelfStableCategoryNames ?? new Set<string>(SHELF_STABLE_CATEGORIES as readonly string[]);

    for (const bl of productFillings) {
      const lw = fillingWeights.find((lw) => lw.fillingId === bl.fillingId);
      if (!lw) continue;
      const filling = fillingsMap.get(lw.fillingId);
      if (!filling) continue;

      const isShelfStable = shelfStableSet.has(filling.category);
      const prevBatch = fillingPreviousBatches[lw.fillingId];
      const isGramsMode = product?.fillMode === "grams" && bl.fillGrams != null;
      let weightG: number;

      if (isShelfStable && prevBatch && !fillingOverrides[lw.fillingId]) {
        // Fully from a prior batch (no additional fresh batch) — compute how much is needed for reference
        if (isGramsMode) {
          weightG = Math.round(bl.fillGrams! * mould.numberOfCavities * pb.quantity);
        } else {
          const fillPct = (bl.fillPercentage ?? 100) / 100;
          weightG = Math.round(fillWeightG * fillPct);
        }
        results.push({
          fillingId: lw.fillingId,
          fillingName: filling.name,
          planProductId: pb.id!,
          productName: productNames.get(pb.productId) ?? "Unknown",
          weightG,
          scaledIngredients: [],
          isFromPreviousBatch: true,
          previousBatchMadeAt: prevBatch.madeAt,
        });
        continue;
      } else if (isShelfStable) {
        // Use base product weight × user-supplied multiplier (default 1)
        const multiplier = fillingOverrides[lw.fillingId] ?? 1;
        weightG = Math.round(lw.totalWeight * multiplier);
      } else if (isGramsMode) {
        // Grams mode: fillGrams per cavity × total cavities
        weightG = Math.round(bl.fillGrams! * mould.numberOfCavities * pb.quantity);
      } else {
        // Percentage mode: scale by this filling's fill percentage of the total fill volume
        const fillPct = (bl.fillPercentage ?? 100) / 100;
        weightG = Math.round(fillWeightG * fillPct);
      }

      // Scale each ingredient from product weight to required weight
      const scaledIngredients: ScaledIngredient[] = lw.ingredients.map((li) => {
        const scaleFactor = lw.totalWeight > 0 ? weightG / lw.totalWeight : 1;
        return {
          ingredientId: li.ingredientId,
          amount: Math.round(li.amount * scaleFactor * 10) / 10,
          unit: li.unit,
          note: li.note,
        };
      });

      results.push({
        fillingId: lw.fillingId,
        fillingName: filling.name,
        planProductId: pb.id!,
        productName: productNames.get(pb.productId) ?? "Unknown",
        weightG,
        scaledIngredients,
      });
    }
  }

  return results;
}

export type IngredientRef = { id: string; name: string; manufacturer?: string };

/**
 * Compute the effective shelf life for a product batch, taking into account that
 * some shelf-stable fillings may come from a previous batch and have already aged.
 *
 * Returns null when the product has no shelf life defined.
 * When a previous-batch filling limits shelf life, returns the reduced value and which filling is limiting.
 */
export function computeEffectiveShelfLife(
  productShelfLifeWeeks: string | undefined,
  productFillingIds: string[],
  fillingPreviousBatches: Record<string, FillingPreviousBatch>,
  planDate: Date = new Date(),
): { effectiveWeeks: number | null; limitedByFillingId: string | null } {
  const productWeeks = productShelfLifeWeeks ? parseFloat(productShelfLifeWeeks) : NaN;
  if (isNaN(productWeeks)) return { effectiveWeeks: null, limitedByFillingId: null };

  let minWeeks = productWeeks;
  let limitedByFillingId: string | null = null;

  for (const fillingId of productFillingIds) {
    const prev = fillingPreviousBatches[fillingId];
    if (!prev || !prev.shelfLifeWeeks) continue;

    const ageMs = planDate.getTime() - new Date(prev.madeAt).getTime();
    const ageWeeks = ageMs / (7 * 24 * 60 * 60 * 1000);
    const remainingWeeks = prev.shelfLifeWeeks - ageWeeks;

    if (remainingWeeks < minWeeks) {
      minWeeks = remainingWeeks;
      limitedByFillingId = fillingId;
    }
  }

  return { effectiveWeeks: Math.max(0, Math.round(minWeeks * 10) / 10), limitedByFillingId };
}

/**
 * Generate a plain-text batch summary snapshot for recall tracing.
 * Saved once when the batch is marked done; ingredient names are captured at that moment.
 */
export function generateBatchSummary(params: {
  batchNumber: string | undefined;
  planName: string;
  completedAt: Date;
  planProducts: PlanProduct[];
  productNames: Map<string, string>;
  moulds: Map<string, Mould>;
  fillingAmounts: FillingAmount[];
  ingredients: IngredientRef[];
  // Optional: previous batch filling info for recall notes + effective shelf life
  previousBatches?: Record<string, FillingPreviousBatch>;
  productsMap?: Map<string, { shelfLifeWeeks?: string }>;
  productFillingsMap?: Map<string, { fillingId: string }[]>;
}): string {
  const { batchNumber, planName, completedAt, planProducts, productNames, moulds, fillingAmounts, ingredients, previousBatches, productsMap, productFillingsMap } = params;
  const ingredientMap = new Map(ingredients.map((i) => [i.id, i]));

  const dateStr = completedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
  const lines: string[] = [];

  lines.push("BATCH SUMMARY");
  lines.push("─".repeat(48));
  if (batchNumber) lines.push(`Batch number:  ${batchNumber}`);
  lines.push(`Plan name:     ${planName}`);
  lines.push(`Completed:     ${dateStr}`);
  lines.push("");

  // --- Products produced ---
  lines.push("PRODUCTS PRODUCED");
  lines.push("─".repeat(48));
  let grandTotalActual = 0;
  let grandTotalPlanned = 0;
  for (const pb of planProducts) {
    const mould = moulds.get(pb.mouldId);
    const name = productNames.get(pb.productId) ?? "Unknown";
    const planned = mould ? mould.numberOfCavities * pb.quantity : 0;
    const actual = pb.actualYield ?? planned;
    grandTotalPlanned += planned;
    grandTotalActual += actual;
    const mouldLabel = `${pb.quantity} mould${pb.quantity !== 1 ? "s" : ""}`;
    if (actual !== planned && planned > 0) {
      lines.push(`  ${name.padEnd(30)} ${actual} of ${planned} pcs (${mouldLabel})`);
    } else {
      lines.push(`  ${name.padEnd(30)} ${planned > 0 ? `${planned} pcs` : "?"} (${mouldLabel})`);
    }
  }
  lines.push("─".repeat(48));
  if (grandTotalActual !== grandTotalPlanned && grandTotalPlanned > 0) {
    const yieldPct = ((grandTotalActual / grandTotalPlanned) * 100).toFixed(1);
    lines.push(`  ${"To stock:".padEnd(30)} ${grandTotalActual} pcs`);
    lines.push(`  ${"Planned:".padEnd(30)} ${grandTotalPlanned} pcs`);
    lines.push(`  ${"Yield:".padEnd(30)} ${yieldPct}%`);
  } else {
    lines.push(`  ${"Total:".padEnd(30)} ${grandTotalPlanned} pcs`);
  }
  lines.push("");

  // --- Fillings prepared (consolidated) ---
  const consolidatedFillings = consolidateSharedFillings(
    fillingAmounts.filter((la) => !la.isFromPreviousBatch),
  );
  if (consolidatedFillings.length > 0) {
    lines.push("FILLINGS PREPARED");
    lines.push("─".repeat(48));
    for (const cl of consolidatedFillings) {
      if (cl.shared) {
        const productList = cl.usedBy.map((u) => `${u.productName} (${u.weightG}g)`).join(", ");
        lines.push(`  ${cl.fillingName.padEnd(30)} ${cl.totalWeightG}g total`);
        lines.push(`    → ${productList}`);
      } else {
        lines.push(`  ${cl.fillingName.padEnd(30)} ${cl.totalWeightG}g`);
      }
    }
    lines.push("─".repeat(48));
    lines.push("");
  }

  // --- Ingredients used ---
  // Aggregate scaled amounts by ingredientId across all filling amounts
  const totals = new Map<string, { amount: number; unit: string }>();
  for (const la of fillingAmounts) {
    for (const si of la.scaledIngredients) {
      const existing = totals.get(si.ingredientId);
      if (existing) {
        existing.amount += si.amount;
      } else {
        totals.set(si.ingredientId, { amount: si.amount, unit: si.unit });
      }
    }
  }

  // Sort alphabetically by ingredient name
  const sorted = [...totals.entries()]
    .map(([id, { amount, unit }]) => ({
      name: ingredientMap.get(id)?.name ?? `Ingredient #${id}`,
      manufacturer: ingredientMap.get(id)?.manufacturer,
      amount: Math.round(amount * 10) / 10,
      unit,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));

  if (sorted.length > 0) {
    lines.push("INGREDIENTS USED");
    lines.push("─".repeat(48));
    for (const ing of sorted) {
      const label = ing.manufacturer ? `${ing.name} (${ing.manufacturer})` : ing.name;
      lines.push(`  ${label.padEnd(36)} ${ing.amount}${ing.unit}`);
    }
    lines.push("─".repeat(48));
  }

  // --- Previous batch fillings ---
  const prevEntries = previousBatches ? Object.entries(previousBatches) : [];
  if (prevEntries.length > 0) {
    lines.push("");
    lines.push("FILLINGS FROM PREVIOUS BATCH");
    lines.push("─".repeat(48));
    for (const [, prev] of prevEntries) {
      const madeDate = new Date(prev.madeAt).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
      const fillingLabel = prev.fillingName ?? "Filling";
      lines.push(`  ${fillingLabel}`);
      if (prev.shelfLifeWeeks) {
        const ageMs = completedAt.getTime() - new Date(prev.madeAt).getTime();
        const ageWeeks = ageMs / (7 * 24 * 60 * 60 * 1000);
        const remainingWeeks = Math.max(0, Math.round((prev.shelfLifeWeeks - ageWeeks) * 10) / 10);
        lines.push(`    Made: ${madeDate}  ·  Shelf life: ${prev.shelfLifeWeeks} wks  ·  Remaining: ${remainingWeeks} wks`);
      } else {
        lines.push(`    Made: ${madeDate}`);
      }
    }
    lines.push("─".repeat(48));
  }

  // --- Effective shelf life per product (when previous batch fillings limit it) ---
  if (prevEntries.length > 0 && productsMap && productFillingsMap && planProducts.length > 0) {
    const seenProducts = new Set<string>();
    const shelfLifeLines: string[] = [];
    for (const pb of planProducts) {
      if (seenProducts.has(pb.productId)) continue;
      seenProducts.add(pb.productId);
      const product = productsMap.get(pb.productId);
      if (!product?.shelfLifeWeeks) continue;
      const fillingIds = (productFillingsMap.get(pb.productId) ?? []).map((rl) => rl.fillingId);
      const { effectiveWeeks, limitedByFillingId } = computeEffectiveShelfLife(
        product.shelfLifeWeeks,
        fillingIds,
        previousBatches ?? {},
        completedAt,
      );
      if (effectiveWeeks === null) continue;
      const productName = productNames.get(pb.productId) ?? "Unknown";
      const originalWeeks = parseFloat(product.shelfLifeWeeks);
      if (limitedByFillingId && effectiveWeeks < originalWeeks) {
        const limitingFilling = previousBatches?.[limitedByFillingId]?.fillingName ?? limitedByFillingId;
        shelfLifeLines.push(`  ${productName.padEnd(30)} ${effectiveWeeks} wks  (reduced from ${originalWeeks} by ${limitingFilling})`);
      } else {
        shelfLifeLines.push(`  ${productName.padEnd(30)} ${effectiveWeeks} wks`);
      }
    }
    if (shelfLifeLines.length > 0) {
      lines.push("");
      lines.push("EFFECTIVE SHELF LIFE");
      lines.push("─".repeat(48));
      for (const l of shelfLifeLines) lines.push(l);
      lines.push("─".repeat(48));
    }
  }

  lines.push("");
  lines.push(`Generated: ${new Date().toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}`);

  return lines.join("\n");
}

/**
 * Generate the ordered list of production steps for a plan.
 * Steps are derived at render time; only completion status is persisted (by key).
 */
export function generateSteps(
  planProducts: PlanProduct[],
  productNames: Map<string, string>,
  productFillingsMap: Map<string, ProductFilling[]>,
  fillingAmounts: FillingAmount[],
  fillingsMap: Map<string, Filling>,
  moulds: Map<string, Mould>,
  productsMap: Map<string, Product> = new Map(),
  fillingPreviousBatches: Record<string, FillingPreviousBatch> = {},
  materialsMap: Map<string, DecorationMaterial> = new Map(),
): ProductionStep[] {
  const steps: ProductionStep[] = [];

  // planProducts sorted by coating — used for shell and cap steps so the UI
  // groups them correctly without needing extra sorting in the renderer.
  const planProductsByCoating = [...planProducts].sort((a, b) => {
    const ca = (productsMap.get(a.productId)?.coating?.trim() || "").toLowerCase();
    const cb = (productsMap.get(b.productId)?.coating?.trim() || "").toLowerCase();
    if (ca !== cb) return ca.localeCompare(cb);
    return a.sortOrder - b.sortOrder;
  });

  // 1: Collect all colour/decoration tasks across all products
  const colorTasks: ColorTask[] = [];
  for (const pb of planProducts) {
    const mould = moulds.get(pb.mouldId);
    const mouldName = mould?.name ?? "Unknown mould";
    const mouldDetail = mould
      ? `${pb.quantity} × ${mould.numberOfCavities} cavities = ${pb.quantity * mould.numberOfCavities} products`
      : undefined;
    const bName = productNames.get(pb.productId) ?? "Unknown";

    const shellDesign = productsMap.get(pb.productId)?.shellDesign ?? [];
    if (shellDesign.length > 0) {
      let onMouldCount = 0;
      shellDesign.forEach((designStep, i) => {
        // Transfer sheet steps are applied at capping — skip from colour phase
        const isTransferSheet = (designStep.materialIds ?? []).some(
          (id) => materialsMap.get(id)?.type === "transfer_sheet"
        );
        if (isTransferSheet) return;
        // Only include steps targeting the colour phase
        if (normalizeApplyAt(designStep.applyAt) !== "colour") return;
        onMouldCount++;
        colorTasks.push({
          planProductId: pb.id!,
          mouldId: pb.mouldId,
          stepIndex: i,
          technique: designStep.technique,
          colors: (designStep.materialIds ?? []),
          mouldName,
          mouldDetail,
          notes: designStep.notes,
          productName: bName,
        });
      });
    } else {
      // Fallback: single task with no colors (wildcard)
      colorTasks.push({
        planProductId: pb.id!,
        mouldId: pb.mouldId,
        stepIndex: 0,
        technique: "",
        colors: [],
        mouldName,
        mouldDetail,
        productName: bName,
      });
    }
  }

  // 2: Schedule for minimal color switches
  const scheduled = scheduleColorSteps(colorTasks);

  // 3: Emit colour steps from scheduled order
  for (const task of scheduled) {
    if (task.technique === "") {
      // Fallback for products with no design steps
      steps.push({
        key: `color-${task.planProductId}`,
        label: `Colour & brush mould: ${task.mouldName} (${task.productName})`,
        group: "colour",
        detail: task.mouldDetail,
      });
    } else {
      const colorList = task.colors.length > 0
        ? task.colors.map((id) => materialsMap.get(id)?.name ?? id).join(", ")
        : undefined;
      const detail = [task.mouldDetail, colorList, task.notes].filter(Boolean).join(" · ") || undefined;
      steps.push({
        key: `color-${task.planProductId}-${task.stepIndex}`,
        label: `${task.technique}: ${task.mouldName} (${task.productName})`,
        group: "colour",
        detail,
        colors: task.colors.length > 0 ? task.colors : undefined,
      });
    }
  }

  // 4: Shell — one step per planProduct, sorted by coating for grouping in the UI
  for (const pb of planProductsByCoating) {
    const mould = moulds.get(pb.mouldId);
    const mouldName = mould?.name ?? "Unknown mould";
    const productName = productNames.get(pb.productId) ?? "Unknown";
    const coating = productsMap.get(pb.productId)?.coating?.trim() || "";
    steps.push({
      key: `shell-${pb.id}`,
      label: `Shell: ${productName}`,
      group: "shell",
      detail: `${pb.quantity} mould${pb.quantity !== 1 ? "s" : ""} · ${mouldName}`,
      coating: coating || "chocolate",
      mouldCount: pb.quantity,
    });
  }

  // 3: Make each filling — one step per unique filling (consolidated across products)
  const consolidated = consolidateSharedFillings(fillingAmounts);
  for (const cl of consolidated) {
    const filling = fillingsMap.get(cl.fillingId);
    if (!filling) continue;
    const prevBatch = fillingPreviousBatches[cl.fillingId];

    if (prevBatch) {
      const madeDate = new Date(prevBatch.madeAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
      const weightDetail = `${cl.totalWeightG}g needed`;
      const productList = cl.shared
        ? cl.usedBy.map((u) => u.productName).join(", ")
        : undefined;
      steps.push({
        key: `filling-${cl.fillingId}`,
        label: `Use ${filling.name} from previous batch`,
        group: "filling",
        detail: [
          `Made ${madeDate}`,
          weightDetail,
          productList ? `for ${productList}` : undefined,
        ].filter(Boolean).join(" · "),
      });
    } else {
      const productList = cl.shared
        ? cl.usedBy.map((u) => `${u.productName} (${u.weightG}g)`).join(", ")
        : undefined;
      steps.push({
        key: `filling-${cl.fillingId}`,
        label: `Make ${filling.name}`,
        group: "filling",
        detail: [
          `${cl.totalWeightG}g needed`,
          productList ? `for ${productList}` : undefined,
        ].filter(Boolean).join(" · "),
      });
    }
  }

  // 4: Fill shells — one per product (skipped when shell is 100%, i.e. solid bars
  // with no filling/cap — the shell step already produces the finished piece)
  for (const pb of planProducts) {
    if ((productsMap.get(pb.productId)?.shellPercentage ?? DEFAULT_SHELL_PERCENTAGE) >= 100) continue;
    const productName = productNames.get(pb.productId) ?? "Unknown";
    const mould = moulds.get(pb.mouldId);
    const mouldName = mould?.name ?? "Unknown mould";
    steps.push({
      key: `fill-${pb.id}`,
      label: `Fill: ${productName}`,
      group: "fill",
      detail: `${pb.quantity} mould${pb.quantity !== 1 ? "s" : ""} · ${mouldName}`,
      mouldCount: pb.quantity,
    });
  }

  // 5a: Cap — one step per planProduct, sorted by coating for grouping in the UI
  // If a shell design step uses transfer sheet materials, merge into the cap label.
  for (const pb of planProductsByCoating) {
    if ((productsMap.get(pb.productId)?.shellPercentage ?? DEFAULT_SHELL_PERCENTAGE) >= 100) continue;
    const mould = moulds.get(pb.mouldId);
    const mouldName = mould?.name ?? "Unknown mould";
    const productName = productNames.get(pb.productId) ?? "Unknown";
    const coating = productsMap.get(pb.productId)?.coating?.trim() || "";
    const shellDesign = productsMap.get(pb.productId)?.shellDesign ?? [];

    // Collect transfer sheet material names for this product
    const transferSheetNames: string[] = [];
    for (const designStep of shellDesign) {
      for (const id of (designStep.materialIds ?? [])) {
        const mat = materialsMap.get(id);
        if (mat?.type === "transfer_sheet") {
          transferSheetNames.push(mat.name);
        }
      }
    }

    const capLabel = transferSheetNames.length > 0
      ? `Cap using transfer sheet: ${transferSheetNames.join(", ")} (${productName})`
      : `Cap: ${productName}`;

    steps.push({
      key: `cap-${pb.id}`,
      label: capLabel,
      group: "cap",
      detail: `${pb.quantity} mould${pb.quantity !== 1 ? "s" : ""} · ${mouldName}`,
      coating: coating || "chocolate",
      mouldCount: pb.quantity,
    });
  }

  // 5b: Non-colour decoration steps — placed in their target phase group.
  // Steps targeting "cap" appear after regular cap steps; steps targeting other phases
  // (shell, fill, unmould) appear after their regular steps in the same group.
  for (const pb of planProductsByCoating) {
    const productName = productNames.get(pb.productId) ?? "Unknown";
    const coating = productsMap.get(pb.productId)?.coating?.trim() || "";
    const shellDesign = productsMap.get(pb.productId)?.shellDesign ?? [];

    shellDesign.forEach((designStep, i) => {
      const isTransferSheet = (designStep.materialIds ?? []).some(
        (id) => materialsMap.get(id)?.type === "transfer_sheet"
      );
      if (isTransferSheet) return;
      const phase = normalizeApplyAt(designStep.applyAt);
      if (phase === "colour") return; // already handled in step 1
      steps.push({
        key: `${phase}-after-${pb.id}-${i}`,
        label: `${designStep.technique}: ${productName}`,
        group: phase,
        subgroup: phase === "cap" ? "after_cap" : undefined,
        detail: designStep.notes || undefined,
        coating: coating || "chocolate",
      });
    });
  }

  // 6: Unmould — one per product, after crystallisation
  for (const pb of planProducts) {
    const productName = productNames.get(pb.productId) ?? "Unknown";
    const mould = moulds.get(pb.mouldId);
    const mouldName = mould?.name ?? "Unknown mould";
    const totalProducts = mould ? pb.quantity * mould.numberOfCavities : 0;
    steps.push({
      key: `unmould-${pb.id}`,
      label: `Unmould: ${productName}`,
      group: "unmould",
      detail: `${pb.quantity} mould${pb.quantity !== 1 ? "s" : ""} · ${mouldName} · ${totalProducts} products`,
      mouldCount: pb.quantity,
      planProductId: pb.id,
      totalProducts,
    });
  }

  return steps;
}
