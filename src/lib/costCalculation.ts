import type { Mould, ProductFilling, FillingIngredient, Filling, CoatingChocolateMapping, BreakdownEntry } from "@/types";
import { costPerGram as deriveIngredientCostPerGram } from "@/types";
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
 * Derive the shell percentage from fill-by-grams data. In grams mode, the user
 * specifies exact grams per filling per cavity. Shell = whatever cavity volume
 * remains after subtracting the total fill volume.
 *
 * fillGrams is actual weight; cavityWeightG is volume in ml (≈ grams of water).
 * We divide fillGrams by density to convert back to ml-equivalent volume, then
 * compute what fraction of the cavity is shell.
 *
 * Returns a clamped [0, 100] percentage. If the fillings exceed the cavity
 * volume, returns 0 (no room for shell — the UI should warn).
 */
export function deriveShellPercentageFromGrams(
  cavityWeightG: number,
  totalFillGrams: number,
  density: number = DENSITY_G_PER_ML,
): number {
  if (cavityWeightG <= 0) return 0;
  const fillVolumeMl = totalFillGrams / density;
  const shellFraction = 1 - fillVolumeMl / cavityWeightG;
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
   *  In grams mode this is derived from the fill grams — pass the derived value. */
  shellPercentage?: number;
  /** "percentage" (default) or "grams". In grams mode, each ProductFilling's
   *  `fillGrams` is used directly instead of computing weight from fillPercentage. */
  fillMode?: "percentage" | "grams";
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
    const lis = fillingIngredientsMap.get(rl.fillingId) ?? [];
    // In grams mode, use fillGrams directly; in percentage mode, derive from fill volume
    const fillingWeightG = fillMode === "grams" && rl.fillGrams != null
      ? rl.fillGrams
      : calculateFillingWeightPerCavityG(mould, rl.fillPercentage, shellPercentage);
    const fillingTotalG = lis.reduce((s, li) => s + li.amount, 0);

    for (const li of lis) {
      const ingredientFraction = fillingTotalG > 0 ? li.amount / fillingTotalG : 0;
      const ingredientGrams = fillingWeightG * ingredientFraction;
      const cpg = ingredientCostMap.get(li.ingredientId) ?? null;
      if (cpg === null || cpg === undefined) {
        warnings.push(`Ingredient #${li.ingredientId} has no purchase price — skipped in cost.`);
        continue;
      }
      const subtotal = ingredientGrams * cpg;
      breakdown.push({
        label: filling ? `${filling.name} — ingredient #${li.ingredientId}` : `Filling #${rl.fillingId} — ingredient #${li.ingredientId}`,
        grams: Math.round(ingredientGrams * 1000) / 1000,
        costPerGram: cpg,
        subtotal,
        kind: "filling_ingredient",
        ingredientId: li.ingredientId,
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

