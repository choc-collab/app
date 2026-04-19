import type { Ingredient, ExperimentIngredient, GanacheType } from "@/types";
import { UNIVERSAL_GANACHE_RANGES } from "@/types";

export interface GanacheBalance {
  totalWeight: number;  // grams
  sugar: number;        // % of total — all sugars
  cacaoFat: number;     // % of total — cocoa butter
  milkFat: number;      // % of total — dairy/milk fat
  otherFats: number;    // % of total — coconut oil, nut fats, etc.
  solids: number;       // % of total — cocoa dry mass
  water: number;        // % of total — water content
  alcohol: number;      // % of total — alcohol content (spirits, liqueurs)
}

export type RangeStatus = "ok" | "low" | "high" | "na";

export interface ComponentCheck {
  value: number;
  min: number;
  max: number;
  status: RangeStatus;
}

export interface BalanceCheck {
  sugar: ComponentCheck;
  cacaoFat: ComponentCheck;
  milkFat: ComponentCheck;
  otherFats: ComponentCheck;
  solids: ComponentCheck;
  water: ComponentCheck;
  alcohol: number;      // % — informational only, no target range
  warnings: string[];
}

/**
 * Compute the ganache balance from a list of experiment ingredients and their
 * full ingredient records. Returns null if total weight is 0.
 */
export function calculateGanacheBalance(
  experimentIngredients: ExperimentIngredient[],
  ingredientMap: Map<string, Ingredient>
): GanacheBalance | null {
  let totalWeight = 0;
  let sugar = 0;
  let cacaoFat = 0;
  let milkFat = 0;
  let otherFats = 0;
  let solids = 0;
  let water = 0;
  let alcohol = 0;

  for (const ei of experimentIngredients) {
    const ing = ingredientMap.get(ei.ingredientId);
    if (!ing || ei.amount <= 0) continue;

    const g = ei.amount;
    totalWeight += g;
    sugar     += g * (ing.sugar     / 100);
    cacaoFat  += g * (ing.cacaoFat  / 100);
    milkFat   += g * (ing.milkFat   / 100);
    otherFats += g * (ing.otherFats / 100);
    solids    += g * (ing.solids    / 100);
    water     += g * (ing.water     / 100);
    alcohol   += g * ((ing.alcohol ?? 0) / 100);
  }

  if (totalWeight === 0) return null;

  const pct = (v: number) => (v / totalWeight) * 100;

  return {
    totalWeight,
    sugar:     pct(sugar),
    cacaoFat:  pct(cacaoFat),
    milkFat:   pct(milkFat),
    otherFats: pct(otherFats),
    solids:    pct(solids),
    water:     pct(water),
    alcohol:   pct(alcohol),
  };
}

/**
 * Infer the dominant chocolate type from the experiment ingredients.
 * Checks ingredients in the "Chocolate" category: first by name keywords
 * (white / milk / dark / noir / bitter), then by composition as a fallback.
 * Returns the type with the highest combined weight, or null if no chocolate
 * ingredients are present.
 */
export function detectChocolateType(
  experimentIngredients: ExperimentIngredient[],
  ingredientMap: Map<string, Ingredient>
): GanacheType | null {
  const totals: Record<GanacheType, number> = { white: 0, milk: 0, dark: 0 };

  for (const ei of experimentIngredients) {
    const ing = ingredientMap.get(ei.ingredientId);
    if (!ing || ei.amount <= 0) continue;
    if (ing.category?.toLowerCase() !== "chocolate") continue;

    let type: GanacheType | null = null;
    const name = ing.name.toLowerCase();

    if (name.includes("white")) {
      type = "white";
    } else if (name.includes("milk") || name.includes("lait") || name.includes("melk")) {
      type = "milk";
    } else if (name.includes("dark") || name.includes("noir") || name.includes("bitter") || name.includes("extra")) {
      type = "dark";
    } else {
      // Composition fallback:
      // White: has cacaoFat and milkFat but no dry cocoa mass (solids < 1)
      // Milk: has both cocoa solids and meaningful milkFat
      // Dark: has cocoa solids, little or no milkFat
      if (ing.cacaoFat > 0 && ing.milkFat > 0 && ing.solids < 1) {
        type = "white";
      } else if (ing.solids > 0 && ing.milkFat >= 5) {
        type = "milk";
      } else if (ing.solids > 5) {
        type = "dark";
      }
    }

    if (type) totals[type] += ei.amount;
  }

  const best = (Object.entries(totals) as [GanacheType, number][]).reduce<[GanacheType, number] | null>(
    (a, b) => (b[1] > 0 && (a === null || b[1] > a[1]) ? b : a),
    null
  );
  return best ? best[0] : null;
}

function checkComponent(value: number, range: { min: number; max: number }): ComponentCheck {
  // White ganache has solids range 0–0; treat as N/A
  if (range.min === 0 && range.max === 0) {
    return { value, min: 0, max: 0, status: "na" };
  }
  const status: RangeStatus =
    value < range.min ? "low" :
    value > range.max ? "high" :
    "ok";
  return { value, min: range.min, max: range.max, status };
}

/**
 * Check balance values against the universal target ranges and generate
 * advisory notes. Warnings are intentionally soft — going outside a range
 * is sometimes deliberate (e.g. high CB for coated ganaches, lower water for
 * white chocolate). The notes explain *why* a value is noteworthy rather than
 * declaring it wrong.
 */
export function checkGanacheBalance(balance: GanacheBalance, detectedType?: GanacheType | null): BalanceCheck {
  const ranges = UNIVERSAL_GANACHE_RANGES;

  const sugarCheck     = checkComponent(balance.sugar,     ranges.sugar);
  const cacaoFatCheck  = checkComponent(balance.cacaoFat,  ranges.cacaoFat);
  const milkFatCheck   = checkComponent(balance.milkFat,   ranges.milkFat);
  const otherFatsCheck = checkComponent(balance.otherFats, ranges.otherFats);
  // Treat 0% solids as N/A — expected for white chocolate formulations.
  const solidsCheck: ComponentCheck = balance.solids < 0.5
    ? { value: balance.solids, min: ranges.solids.min, max: ranges.solids.max, status: "na" }
    : checkComponent(balance.solids, ranges.solids);
  const waterCheck     = checkComponent(balance.water,     ranges.water);

  const warnings: string[] = [];
  const fmt = (n: number) => n.toFixed(1) + "%";

  // Water/sugar correlation — the most important relationship in ganache.
  // Higher water demands proportionally more sugar (sugar_min ≈ water + 10):
  //   19% water → ~29% sugar; 22% water → ~32% sugar; 25% water → ~35% sugar.
  // 22% water + 29% sugar is technically within both ranges but creates an
  // unstable ganache in practice.
  if (balance.water > 18 && balance.sugar < balance.water + 10) {
    const suggestSugar = fmt(balance.water + 10);
    warnings.push(
      `Water/sugar balance: at ${fmt(balance.water)} water, sugar should be at least ` +
      `${suggestSugar} to keep water activity in check ` +
      `(currently ${fmt(balance.sugar)}). ` +
      `Consider adding more sugars or polyols such as sorbitol or invert sugar.`
    );
  }

  // Water advisory
  if (waterCheck.status === "high") {
    warnings.push(
      `Water is above the target range (${fmt(balance.water)}, target 19–22%). ` +
      `Exceeding 22% increases emulsion instability — consider reducing liquids ` +
      `or adding polyols to compensate.`
    );
  } else if (waterCheck.status === "low") {
    warnings.push(
      `Water is below the target range (${fmt(balance.water)}, target 19–22%). ` +
      `The ganache may feel thick or dry. Lower water is intentional for white/milk ` +
      `chocolate ganaches.`
    );
  }

  // Sugar advisory
  if (sugarCheck.status === "high") {
    warnings.push(
      `Sugar is above the target range (${fmt(balance.sugar)}, target 29–35%). ` +
      `Very high sugar may make the ganache overly sweet and susceptible to crystallisation.`
    );
  } else if (sugarCheck.status === "low") {
    warnings.push(
      `Sugar is below the target range (${fmt(balance.sugar)}, target 29–35%). ` +
      `More sugar helps bind water and extend shelf life.`
    );
  }

  // Cocoa butter advisory
  if (cacaoFatCheck.status === "high") {
    if (detectedType === "white") {
      warnings.push(
        `Cocoa butter is above the universal target range (${fmt(balance.cacaoFat)}, target 15–23%). ` +
        `For white chocolate ganaches this is expected — without dry cocoa mass to support the emulsion, ` +
        `a higher CB (typically 20–32%) is normal and provides the structure needed for a clean set.`
      );
    } else if (detectedType === "milk") {
      warnings.push(
        `Cocoa butter is above the universal target range (${fmt(balance.cacaoFat)}, target 15–23%). ` +
        `For milk chocolate ganaches slightly higher CB is common — milk chocolate has less cocoa mass ` +
        `than dark, so more cocoa butter helps maintain firmness and structure.`
      );
    } else {
      warnings.push(
        `Cocoa butter is above the target range (${fmt(balance.cacaoFat)}, target 15–23%). ` +
        `The ganache will set quite firm — this is intentional for coated ganaches requiring ` +
        `a clean cut, and for white/milk chocolate where there are few or no cocoa solids ` +
        `to support structure.`
      );
    }
  } else if (cacaoFatCheck.status === "low") {
    warnings.push(
      `Cocoa butter is below the target range (${fmt(balance.cacaoFat)}, target 15–23%). ` +
      `Cocoa butter is the primary structural fat — low levels can produce a soft, ` +
      `unstable ganache prone to separation, especially in white or milk chocolate formulations ` +
      `where there is little dry cocoa mass to support the structure.`
    );
  }

  // Milk fat advisory
  if (milkFatCheck.status === "high") {
    warnings.push(
      `Milk fat is above the target range (${fmt(balance.milkFat)}, target 15–23%). ` +
      `Higher butter fat gives a softer, creamier texture but may affect firmness for ` +
      `guitar-cut ganaches.`
    );
  } else if (milkFatCheck.status === "low") {
    warnings.push(
      `Milk fat is below the target range (${fmt(balance.milkFat)}, target 15–23%). ` +
      `Lower milk fat may reduce creaminess. If using plant-based fats, check Other fats.`
    );
  }

  // Other fats advisory
  if (otherFatsCheck.status === "high") {
    warnings.push(
      `Other fats are above the reference level (${fmt(balance.otherFats)}). ` +
      `Plant oils and nut fats soften the ganache — ensure total fat stays within 25–40%.`
    );
  }

  // Alcohol advisory — alcohol acts as a humectant, reducing water activity
  // similarly to polyols. Meaningful quantities (>3%) require water activity adjustment.
  if (balance.alcohol >= 3) {
    warnings.push(
      `Alcohol content is ${fmt(balance.alcohol)}. Alcohol acts as a humectant — it reduces ` +
      `water activity similarly to polyols and extends shelf life. When using spirits, reduce ` +
      `other liquids proportionally and account for the alcohol's contribution to total water ` +
      `activity (Aw). High alcohol (>8%) may affect emulsion texture during setting.`
    );
  }

  // Solids advisory (skipped when 0% / no cocoa mass)
  if (solidsCheck.status === "high") {
    warnings.push(
      `Cocoa solids are above the target range (${fmt(balance.solids)}, target 3–14%). ` +
      `Very high dry mass may produce a dense ganache that is harder to pipe.`
    );
  } else if (solidsCheck.status === "low") {
    warnings.push(
      `Cocoa solids are below the target range (${fmt(balance.solids)}, target 3–14%). ` +
      `Low dry mass reduces emulsion stability and body. This is expected for white chocolate.`
    );
  }

  // Total fat check — Wybauw recommends 25–40% combined fat for proper creaminess
  // and stability. Exceptions: white/milk ganaches with high CB can exceed 40% intentionally.
  const totalFat = balance.cacaoFat + balance.milkFat + balance.otherFats;
  if (totalFat < 25) {
    warnings.push(
      `Total fat is below 25% (currently ${fmt(totalFat)}, target 25–40%). ` +
      `Consider adding more cocoa butter, butter, or cream for structure and mouthfeel.`
    );
  } else if (totalFat > 40) {
    if (detectedType === "white") {
      warnings.push(
        `Total fat is above 40% (currently ${fmt(totalFat)}). ` +
        `For white chocolate ganaches this is normal — white chocolate is rich in both cocoa butter ` +
        `and milk fat with no dry cocoa mass to offset it. ` +
        `Keep water in the 15–18% range to maintain emulsion stability.`
      );
    } else if (detectedType === "milk") {
      warnings.push(
        `Total fat is above 40% (currently ${fmt(totalFat)}). ` +
        `For milk chocolate ganaches with lower cocoa solids, higher total fat is common. ` +
        `Ensure sugar levels are sufficient relative to water to keep water activity in check.`
      );
    } else {
      warnings.push(
        `Total fat exceeds 40% (currently ${fmt(totalFat)}, target 25–40%). ` +
        `Very high fat can make the ganache thick and prone to separation, ` +
        `particularly when water content is also low. ` +
        `White and milk chocolate ganaches with low dry mass are an exception.`
      );
    }
  }

  return {
    sugar: sugarCheck,
    cacaoFat: cacaoFatCheck,
    milkFat: milkFatCheck,
    otherFats: otherFatsCheck,
    solids: solidsCheck,
    water: waterCheck,
    alcohol: balance.alcohol,
    warnings,
  };
}
