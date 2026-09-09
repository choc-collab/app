"use client";

import { useState } from "react";
import {
  ALL_NUTRIENT_FIELDS, getNutrientsByMarket, getNutritionPanelTitle, fillDerivedNutrition,
  type NutritionData,
} from "@/lib/nutrition";
import type { Ingredient, MarketRegion } from "@/types";

const GROUP_LABELS: Record<string, string> = {
  energy: "Energy",
  fats: "Fats",
  carbs: "Carbohydrates",
  protein: "Protein",
  minerals: "Salt, sodium & minerals",
};

/**
 * Editable per-100g nutrition panel, showing only the nutrients the current
 * market requires.
 *
 * Every commit sends the whole `nutrition` object rather than one nutrient,
 * because `fillDerivedNutrition` cross-fills pairs — enter kcal and kJ appears,
 * enter sodium and salt appears. A per-field partial write would drop those
 * derived siblings on the next commit.
 */
export function IngredientNutritionEditor({
  ingredient,
  market,
  onCommit,
}: {
  ingredient: Ingredient;
  market: MarketRegion;
  onCommit: (nutrition: NutritionData | undefined) => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const out: Record<string, string> = {};
    if (ingredient.nutrition) {
      for (const f of ALL_NUTRIENT_FIELDS) {
        const v = ingredient.nutrition[f.key];
        if (v != null) out[f.key] = String(v);
      }
    }
    return out;
  });

  const marketKeys = new Set(getNutrientsByMarket(market).map((n) => n.key));
  const marketFields = ALL_NUTRIENT_FIELDS.filter((f) => marketKeys.has(f.key));
  const groups = [...new Set(marketFields.map((f) => f.group))];

  function commit(next: Record<string, string>) {
    const data: NutritionData = {};
    let any = false;
    for (const f of ALL_NUTRIENT_FIELDS) {
      const v = parseFloat(next[f.key] ?? "");
      if (!isNaN(v)) {
        data[f.key] = v;
        any = true;
      }
    }
    const filled = any ? fillDerivedNutrition(data) : undefined;
    onCommit(filled);
    // Reflect anything the fill derived (kJ from kcal, salt from sodium) back
    // into the inputs, so the panel shows what was actually stored.
    if (filled) {
      setValues((prev) => {
        const merged = { ...prev };
        for (const f of ALL_NUTRIENT_FIELDS) {
          const v = filled[f.key];
          if (v != null && !merged[f.key]) merged[f.key] = String(v);
        }
        return merged;
      });
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold">{getNutritionPanelTitle(market)}</h2>
        <span className="text-[11px] text-muted-foreground">per 100g</span>
      </div>
      <div className="p-4">
        {groups.map((group) => {
          const groupFields = marketFields.filter((f) => f.group === group);
          if (groupFields.length === 0) return null;
          return (
            <div key={group} className="mb-4 last:mb-0">
              <h3 className="text-[11px] font-semibold text-muted-foreground uppercase tracking-[0.06em] mb-2">
                {GROUP_LABELS[group]}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {groupFields.map((f) => (
                  <div key={f.key}>
                    <label className="label" htmlFor={`nutrient-${f.key}`}>
                      {f.label} <span className="text-muted-foreground font-normal">({f.unit})</span>
                    </label>
                    <input
                      id={`nutrient-${f.key}`}
                      type="number"
                      step="any"
                      min="0"
                      value={values[f.key] ?? ""}
                      onChange={(e) => setValues((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      onBlur={() => commit(values)}
                      className="input"
                      placeholder="0"
                    />
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
