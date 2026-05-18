/**
 * Water activity (Aw) estimation and shelf-life mapping.
 *
 * This is a *heuristic* — not a measurement. Real Aw requires a calibrated
 * meter. The estimator uses a Raoult-style sucrose-water curve fit against
 * empirical anchors for cream/chocolate/butter ganaches. It under-predicts
 * for recipes that lean heavily on polyols (sorbitol, glycerol, invert sugar)
 * because the current ingredient model does not distinguish polyols from
 * sucrose. Those recipes are flagged as low-confidence.
 *
 * Shelf-life bands follow widely-published food-science consensus for
 * refrigerated, properly-packaged confectionery.
 */

import type { GanacheBalance } from "./ganacheBalance";

export type AwConfidence = "low" | "medium";

export interface AwEstimate {
  /** Central estimate, clamped to [0.50, 1.00]. */
  value: number;
  /** Lower bound of the honest uncertainty range. */
  lo: number;
  /** Upper bound of the honest uncertainty range. */
  hi: number;
  /** "medium" for ordinary recipes; "low" when the composition pushes the
   *  heuristic into territory where polyols / extreme ratios distort the fit. */
  confidence: AwConfidence;
  /** Human-readable reasons that drove a low-confidence verdict (empty when medium). */
  caveats: string[];
}

export type ShelfLifeBand = "short" | "medium" | "long" | "very_long";

export interface ShelfLifeWindow {
  band: ShelfLifeBand;
  label: string;
  /** Days, refrigerated and properly packaged. Conservative — meant as a guide,
   *  not a guarantee. */
  daysMin: number;
  daysMax: number;
}

/**
 * Estimate water activity from a ganache balance.
 *
 * Model:
 *   solute_mass = sugar + 0.4 * cocoa-solids        // dry solids partly bind water
 *   w_solute    = solute_mass / (solute_mass + water)
 *   alc_frac    = alcohol / (water + alcohol)
 *   aw          = 1 - 0.55 * w_solute^2 - 0.15 * alc_frac
 *
 * Alcohol is treated separately rather than as part of the solvent: it
 * lowers Aw via its own term (Raoult-like vapor pressure contribution),
 * without diluting the sugar-water ratio that drives the main curve.
 *
 * Coefficients fitted to anchor recipes published across multiple chocolatier
 * study materials. The quadratic shape matches the Raoult-law sucrose-water
 * curve in the 30–70% solute range.
 */
export function estimateAw(balance: GanacheBalance): AwEstimate {
  const sugar    = balance.sugar;
  const solids   = balance.solids;
  const water    = balance.water;
  const alcohol  = balance.alcohol;

  // Effective solute mass — sugars at full strength, dry cocoa solids partially.
  const effectiveSolute = sugar + 0.4 * solids;
  const denom = effectiveSolute + water;

  let value: number;
  if (denom <= 0) {
    // No water-phase or solute info → can't estimate.
    return { value: 1.0, lo: 0.95, hi: 1.0, confidence: "low",
             caveats: ["No water-phase or sugar information — cannot estimate."] };
  }

  // wSolute uses only WATER in the denominator. Alcohol gets its own term so
  // adding alcohol always lowers Aw (it doesn't dilute the sugar-water ratio).
  const wSolute = effectiveSolute / denom;
  const totalAqueous = water + alcohol;
  const alcFrac = totalAqueous > 0 ? alcohol / totalAqueous : 0;

  const central = 1 - 0.55 * (wSolute ** 2) - 0.15 * alcFrac;
  value = clamp(central, 0.50, 1.00);

  // Confidence: medium by default, downgraded for known weak spots.
  const caveats: string[] = [];
  if (sugar > 38) {
    caveats.push("High total sugar (>38%) — if any portion is sorbitol, glycerol or invert sugar, the real Aw will be lower than the estimate.");
  }
  if (water < 12) {
    caveats.push("Very low water (<12%) — Aw curves become unreliable; small composition shifts move the estimate a lot.");
  }
  if (alcohol > 8) {
    caveats.push("High alcohol (>8%) — alcohol's Aw-lowering effect at this level is not well captured by the simple model.");
  }
  if (solids > 25) {
    caveats.push("High dry solids (>25%) — the partial-binding factor of 0.4 is approximate.");
  }

  // Tolerance widens with the caveats — at most ±0.08, at least ±0.04.
  const baseTolerance = 0.04;
  const extraTolerance = Math.min(0.04, 0.015 * caveats.length);
  const tolerance = baseTolerance + extraTolerance;

  return {
    value,
    lo: clamp(value - tolerance, 0.40, 1.00),
    hi: clamp(value + tolerance, 0.40, 1.00),
    confidence: caveats.length > 0 ? "low" : "medium",
    caveats,
  };
}

/**
 * Map a water activity value to a refrigerated shelf-life band.
 * Thresholds follow industry-consensus food-science guidance for confectionery.
 */
export function shelfLifeFromAw(aw: number): ShelfLifeWindow {
  if (aw > 0.85)  return { band: "short",     label: "Up to ~3 weeks",         daysMin: 0,   daysMax: 21 };
  if (aw > 0.70)  return { band: "medium",    label: "Up to ~3 months",        daysMin: 21,  daysMax: 90 };
  if (aw > 0.60)  return { band: "long",      label: "Several months",         daysMin: 90,  daysMax: 180 };
  return                 { band: "very_long", label: "Microbiologically stable", daysMin: 180, daysMax: 365 };
}

/**
 * Map the *upper* bound of the Aw range to a conservative shelf-life band.
 * (We err pessimistic — better to underestimate shelf life than overestimate.)
 */
export function shelfLifeFromEstimate(est: AwEstimate): ShelfLifeWindow {
  return shelfLifeFromAw(est.hi);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
