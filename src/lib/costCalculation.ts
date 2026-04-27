import type { Mould, ProductFilling, FillingIngredient, FillingComponent, Filling, CoatingChocolateMapping, BreakdownEntry } from "@/types";
import { costPerGram as deriveIngredientCostPerGram } from "@/types";
import { flattenFillingToIngredients, rollUpAmounts } from "@/lib/fillingComponents";
import type { Ingredient } from "@/types";
import { DENSITY_G_PER_ML } from "@/lib/production";

// ── Legacy factors ──────────────────────────────────────────────────────────
// Kept as named exports for backward-compatible test assertions and for the
// `production.ts` FILL_FACTOR constant (which is still used for production
// scaling when no per-product shellPercentage is available).
export const SHELL_FACTOR = 0.30;
export const CAP_FACTOR = 0.07;

/** Default shell percentage applied to products that were created before v3
 *  (the per-product shellPercentage field). 37 = old SHELL_FACTOR(30) + CAP_FACTOR(7). */
export const DEFAULT_SHELL_PERCENTAGE = 37;

// ── Weight calculations ─────────────────────────────────────────────────────

/**
 * Shell weight for cost/nutrition purposes: a single entry covering the total
 * chocolate weight (shell + cap combined). Uses the product's `shellPercentage`
 * instead of the old hardcoded SHELL_FACTOR + CAP_FACTOR constants.
 *
 * @param shellPercentage — shell as % of total cavity weight (0–100). Default 37.
 */
export function calculateShellWeightG(mould: Mould, shellPercentage: number = DEFAULT_SHELL_PERCENTAGE): number {
  return mould.cavityWeightG * (shellPercentage / 100);
}

/**
 * Cap weight for cost/nutrition purposes.
 * @deprecated For backward compat only — new cost calculations use `calculateShellWeightG`
 * with the combined `shellPercentage` and emit a single "shell" breakdown entry.
 * Production step scheduling (which still distinguishes shell vs cap as physical actions)
 * can continue using the old constant directly if needed.
 */
export function calculateCapWeightG(mould: Mould): number {
  return mould.cavityWeightG * CAP_FACTOR;
}

/** Weight of a single filling's fill contribution per cavity (in grams).
 *  Fill factor is derived from `shellPercentage`: fillFactor = (100 - shellPercentage) / 100.
 *  cavityWeightG is cavity volume in grams-of-water (≈ ml), so we apply
 *  ganache density to convert to actual fill weight. */
export function calculateFillingWeightPerCavityG(mould: Mould, fillPercentage: number, shellPercentage: number = DEFAULT_SHELL_PERCENTAGE): number {
  const fillFactor = (100 - shellPercentage) / 100;
  return mould.cavityWeightG * fillFactor * DENSITY_G_PER_ML * (fillPercentage / 100);
}

/**
 * Convert a stored fill fraction (0–1, fraction of cavity volume) to grams of
 * filling per cavity, against a specific mould. This is the per-mould scaling
 * step: the same `fillFraction` produces different gram amounts depending on
 * the mould's cavity weight, preserving the recipe's fill-to-shell ratio.
 *
 * `cavityWeightG` is cavity volume expressed as grams of water (≈ ml), so
 * we multiply by ganache density to get actual filling weight in grams.
 */
export function fillFractionToGrams(
  fillFraction: number,
  cavityWeightG: number,
  density: number = DENSITY_G_PER_ML,
): number {
  return fillFraction * cavityWeightG * density;
}

/**
 * Convert a user-entered grams-per-cavity value to a stored fill fraction
 * (0–1, fraction of cavity volume). Inverse of `fillFractionToGrams`. The
 * mould passed here is the *reference* (the user's selected default mould at
 * input time) — the resulting fraction is mould-agnostic and can be rescaled
 * to any other mould later.
 */
export function gramsToFillFraction(
  grams: number,
  cavityWeightG: number,
  density: number = DENSITY_G_PER_ML,
): number {
  if (cavityWeightG <= 0) return 0;
  return grams / density / cavityWeightG;
}

/**
 * Derive the shell percentage from fill fractions. In grams mode, each filling
 * stores a `fillFraction` (0–1) of cavity volume; shell = whatever cavity
 * volume remains after subtracting all filling fractions.
 *
 * Returns a clamped [0, 100] percentage. If the fillings exceed the cavity
 * volume, returns 0 (no room for shell — the UI should warn).
 */
export function deriveShellPercentageFromFractions(totalFillFraction: number): number {
  const shellFraction = 1 - totalFillFraction;
  return Math.max(0, Math.min(100, Math.round(shellFraction * 1000) / 10));
}

// ── Cost calculation ────────────────────────────────────────────────────────

export interface CostCalculationInput {
  mould: Mould | null | undefined;
  productFillings: ProductFilling[];
  fillingIngredientsMap: Map<string, FillingIngredient[]>;
  fillingsMap: Map<string, Filling>;
  /** ingredientId → cost per gram (can be null if not enough purchase data) */
  ingredientCostMap: Map<string, number | null>;
  /** Cost per gram of the shell chocolate (resolved from shellIngredientId). */
  shellChocolateCostPerGram: number | null;
  /** Display label for the shell chocolate (ingredient name). */
  shellChocolateLabel?: string;
  /** Shell as % of total cavity weight (0–100). Default 37.
   *  In grams mode this is derived from the fill fractions — pass the derived value. */
  shellPercentage?: number;
  /** "percentage" (default) or "grams". In grams mode, each ProductFilling's
   *  `fillFraction` (0–1 of cavity volume) is converted to grams using the supplied
   *  mould's `cavityWeightG`, instead of computing weight from `fillPercentage`. */
  fillMode?: "percentage" | "grams";
  /** Optional: nested-filling component edges keyed by host fillingId. When
   *  present, each filling on the product is flattened recursively (child
   *  fillings expand into their own ingredients, scaled by the host's portion
   *  of the child) before cost is summed. Omit to keep the legacy
   *  ingredient-only behaviour — used by callers that haven't migrated. */
  fillingComponentsMap?: Map<string, FillingComponent[]>;
}

export interface CostCalculationResult {
  costPerProduct: number;
  breakdown: BreakdownEntry[];
  warnings: string[];
}

export function calculateProductCost(input: CostCalculationInput): CostCalculationResult {
  const {
    mould, productFillings, fillingIngredientsMap, fillingsMap, ingredientCostMap,
    shellChocolateCostPerGram, shellChocolateLabel,
    shellPercentage = DEFAULT_SHELL_PERCENTAGE,
    fillMode = "percentage",
    fillingComponentsMap,
  } = input;
  const breakdown: BreakdownEntry[] = [];
  const warnings: string[] = [];

  if (!mould) {
    warnings.push("No default mould set — cannot calculate cost.");
    return { costPerProduct: 0, breakdown, warnings };
  }

  // --- Filling ingredients ---
  for (const rl of productFillings) {
    const filling = fillingsMap.get(rl.fillingId);
    // Flatten the host filling — child fillings expand into their own
    // ingredients. When `fillingComponentsMap` is omitted we still get
    // {ingredientId, amount} rows that match the legacy
    // `fillingIngredients`-only view, so the math below is unchanged for
    // ingredient-only fillings.
    const flatRows = fillingComponentsMap
      ? rollUpAmounts(flattenFillingToIngredients(rl.fillingId, fillingIngredientsMap, fillingComponentsMap))
      : (fillingIngredientsMap.get(rl.fillingId) ?? []).map((li) => ({ ingredientId: li.ingredientId, amount: li.amount }));

    // In grams mode, scale the stored fillFraction to grams using the mould's
    // cavity weight. In percentage mode, derive from total fill volume × fillPercentage.
    const fillingWeightG = fillMode === "grams" && rl.fillFraction != null
      ? fillFractionToGrams(rl.fillFraction, mould.cavityWeightG)
      : calculateFillingWeightPerCavityG(mould, rl.fillPercentage, shellPercentage);
    const fillingTotalG = flatRows.reduce((s, row) => s + row.amount, 0);

    for (const row of flatRows) {
      const ingredientFraction = fillingTotalG > 0 ? row.amount / fillingTotalG : 0;
      const ingredientGrams = fillingWeightG * ingredientFraction;
      const cpg = ingredientCostMap.get(row.ingredientId) ?? null;
      if (cpg === null || cpg === undefined) {
        warnings.push(`Ingredient #${row.ingredientId} has no purchase price — skipped in cost.`);
        continue;
      }
      const subtotal = ingredientGrams * cpg;
      breakdown.push({
        label: filling ? `${filling.name} — ingredient #${row.ingredientId}` : `Filling #${rl.fillingId} — ingredient #${row.ingredientId}`,
        grams: Math.round(ingredientGrams * 1000) / 1000,
        costPerGram: cpg,
        subtotal,
        kind: "filling_ingredient",
        ingredientId: row.ingredientId,
        fillingId: rl.fillingId,
      });
    }
  }

  // --- Shell (combined shell + cap as a single entry) ---
  if (shellPercentage > 0) {
    const shellWeightG = calculateShellWeightG(mould, shellPercentage);
    if (shellChocolateCostPerGram !== null && shellChocolateCostPerGram !== undefined) {
      breakdown.push({
        label: `Shell (${shellChocolateLabel ?? "chocolate"})`,
        grams: Math.round(shellWeightG * 1000) / 1000,
        costPerGram: shellChocolateCostPerGram,
        subtotal: shellWeightG * shellChocolateCostPerGram,
        kind: "shell",
      });
    } else {
      warnings.push(`No shell chocolate set — shell cost skipped.`);
    }
  }

  const costPerProduct = breakdown.reduce((s, e) => s + e.subtotal, 0);
  return { costPerProduct, breakdown, warnings };
}

// ── Legacy coating resolution (kept for old snapshot display) ────────────────

/**
 * Resolve the current coating chocolate cost-per-gram for a given coating name.
 * Returns the most recent mapping where effectiveFrom <= now.
 * @deprecated Use direct shellIngredientId lookup instead for new code.
 */
export function resolveCoatingCostAtDate(
  coatingName: string | undefined,
  mappings: CoatingChocolateMapping[],
  ingredientCostMap: Map<string, number | null>,
  at: Date,
): { costPerGram: number | null; ingredientId: string | null } {
  if (!coatingName) return { costPerGram: null, ingredientId: null };
  const relevant = mappings
    .filter((m) => m.coatingName === coatingName && new Date(m.effectiveFrom).getTime() <= at.getTime())
    .sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
  if (relevant.length === 0) return { costPerGram: null, ingredientId: null };
  const mapping = relevant[0];
  const cpg = ingredientCostMap.get(mapping.ingredientId) ?? null;
  return { costPerGram: cpg, ingredientId: mapping.ingredientId };
}

/** @deprecated Use direct shellIngredientId lookup instead. */
export function resolveCurrentCoatingCostPerGram(
  coatingName: string | undefined,
  mappings: CoatingChocolateMapping[],
  ingredientCostMap: Map<string, number | null>,
): { costPerGram: number | null; ingredientId: string | null } {
  return resolveCoatingCostAtDate(coatingName, mappings, ingredientCostMap, new Date());
}

export function serializeBreakdown(breakdown: BreakdownEntry[]): string {
  return JSON.stringify(breakdown);
}

export function deserializeBreakdown(json: string): BreakdownEntry[] {
  try {
    return JSON.parse(json) as BreakdownEntry[];
  } catch {
    return [];
  }
}

/** Build an ingredientCostMap from a list of ingredients (current costPerGram) */
export function buildIngredientCostMap(ingredients: Ingredient[]): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const ing of ingredients) {
    if (ing.id != null) {
      map.set(ing.id, deriveIngredientCostPerGram(ing));
    }
  }
  return map;
}

/** Enrich breakdown labels using ingredient names */
export function enrichBreakdownLabels(
  breakdown: BreakdownEntry[],
  ingredientsMap: Map<string, Ingredient>,
  fillingsMap: Map<string, Filling>,
): BreakdownEntry[] {
  return breakdown.map((entry) => {
    if (entry.kind !== "filling_ingredient") return entry;
    const ingredient = entry.ingredientId ? ingredientsMap.get(entry.ingredientId) : undefined;
    const filling = entry.fillingId ? fillingsMap.get(entry.fillingId) : undefined;
    if (!ingredient && !filling) return entry;
    const ingredientLabel = ingredient ? ingredient.name : `ingredient #${entry.ingredientId}`;
    const fillingLabel = filling ? filling.name : `filling #${entry.fillingId}`;
    return { ...entry, label: `${fillingLabel} — ${ingredientLabel}` };
  });
}

export function formatCost(amount: number, currencySymbol = "€"): string {
  return `${currencySymbol}${amount.toFixed(3)}`;
}

/** Compute a diff label vs previous snapshot cost */
export function costDelta(current: number, previous: number, currencySymbol = "€"): { value: number; label: string; positive: boolean } {
  const delta = current - previous;
  const positive = delta >= 0;
  return {
    value: delta,
    label: `${positive ? "+" : ""}${formatCost(delta, currencySymbol)}`,
    positive,
  };
}

