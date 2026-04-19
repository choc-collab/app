/**
 * Ingredient-specific CSV import config.
 *
 * Maps CSV columns → Ingredient objects, validates composition + required fields,
 * and commits via bulkAdd (no price-history triggers — these are fresh imports).
 */

import { db } from "@/lib/db";
import type { Ingredient } from "@/types";
import { INGREDIENT_CATEGORIES } from "@/types";
import type { NutrientKey, NutritionData } from "@/lib/nutrition";
import type { CSVImportConfig, RowIssue } from "@/lib/csv-import";
import { toNum, toNumOpt, toStrOpt, toBoolOpt } from "@/lib/csv-import";

// ---------------------------------------------------------------------------
// Constants (shared with seed.ts — canonical source)
// ---------------------------------------------------------------------------

export const ALLERGEN_COLUMNS = [
  "gluten", "wheat",
  "crustaceans", "shellfish", "molluscs", "fish",
  "eggs", "milk", "peanuts", "soybeans", "sesame",
  "nuts_almonds", "nuts_hazelnuts", "nuts_walnuts", "nuts_cashews",
  "nuts_pecans", "nuts_brazil", "nuts_pistachios", "nuts_macadamia",
  "celery", "mustard", "sulphites", "lupin",
] as const;

const NUTRITION_COLUMNS: NutrientKey[] = [
  "energyKj", "energyKcal", "fat", "saturatedFat", "transFat",
  "cholesterolMg", "carbohydrate", "sugars", "addedSugars", "fibre",
  "protein", "salt", "sodium", "vitaminDMcg", "calciumMg",
  "ironMg", "potassiumMg",
];

// ---------------------------------------------------------------------------
// Template columns — must match public/seed/ingredients.csv header
// ---------------------------------------------------------------------------

export const INGREDIENT_TEMPLATE_COLUMNS = [
  // Core
  "name", "commercialName", "manufacturer", "brand", "vendor", "source", "category",
  // Purchase
  "purchaseCost", "purchaseDate", "purchaseQty", "purchaseUnit", "gramsPerUnit",
  // Notes
  "notes",
  // Composition
  "cacaoFat", "sugar", "milkFat", "water", "solids", "otherFats", "alcohol",
  // Flags
  "shellCapable", "pricingIrrelevant",
  // Allergens (22 boolean columns)
  ...ALLERGEN_COLUMNS.map((id) => `allergen_${id}`),
  // Nutrition (17 numeric columns)
  ...NUTRITION_COLUMNS.map((key) => `nut_${key}`),
];

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

function parseNutritionColumns(row: Record<string, string>): NutritionData | undefined {
  const data: NutritionData = {};
  for (const key of NUTRITION_COLUMNS) {
    const val = toNumOpt(row[`nut_${key}`]);
    if (val !== undefined) data[key] = val;
  }
  return Object.keys(data).length > 0 ? data : undefined;
}

export function mapIngredientRow(row: Record<string, string>): Omit<Ingredient, "id"> {
  return {
    name: (row.name ?? "").trim(),
    commercialName: toStrOpt(row.commercialName),
    manufacturer: row.manufacturer || "",
    brand: toStrOpt(row.brand),
    vendor: toStrOpt(row.vendor),
    source: row.source || "",
    category: toStrOpt(row.category),
    cost: 0,
    purchaseCost: toNumOpt(row.purchaseCost),
    purchaseDate: toStrOpt(row.purchaseDate),
    purchaseQty: toNumOpt(row.purchaseQty),
    purchaseUnit: toStrOpt(row.purchaseUnit),
    gramsPerUnit: toNumOpt(row.gramsPerUnit),
    notes: row.notes || "",
    cacaoFat: toNum(row.cacaoFat),
    sugar: toNum(row.sugar),
    milkFat: toNum(row.milkFat),
    water: toNum(row.water),
    solids: toNum(row.solids),
    otherFats: toNum(row.otherFats),
    alcohol: toNumOpt(row.alcohol),
    allergens: ALLERGEN_COLUMNS.filter((id) => toBoolOpt(row[`allergen_${id}`]) === true),
    shellCapable: toBoolOpt(row.shellCapable),
    pricingIrrelevant: toBoolOpt(row.pricingIrrelevant),
    nutrition: parseNutritionColumns(row),
  };
}

// ---------------------------------------------------------------------------
// Validator
// ---------------------------------------------------------------------------

export function validateIngredientRow(data: Omit<Ingredient, "id">): RowIssue[] {
  const issues: RowIssue[] = [];

  // Required: name
  if (!data.name) {
    issues.push({ field: "name", message: "Name is required", severity: "error" });
  }

  // Category: warn if unrecognised (still importable)
  if (data.category && !(INGREDIENT_CATEGORIES as readonly string[]).includes(data.category)) {
    issues.push({
      field: "category",
      message: `Unknown category "${data.category}"`,
      severity: "warning",
    });
  }

  // Composition sum check
  const compSum =
    data.cacaoFat + data.sugar + data.milkFat + data.water + data.solids + data.otherFats + (data.alcohol ?? 0);
  if (compSum > 0 && Math.abs(compSum - 100) > 0.5) {
    issues.push({
      field: "composition",
      message: `Composition sums to ${compSum.toFixed(1)}% (expected 100%)`,
      severity: "warning",
    });
  }

  // Purchase pricing: warn if partial
  const hasCost = data.purchaseCost != null && data.purchaseCost > 0;
  const hasGrams = data.gramsPerUnit != null && data.gramsPerUnit > 0;
  if (hasCost && !hasGrams) {
    issues.push({
      field: "gramsPerUnit",
      message: "purchaseCost set but gramsPerUnit missing — cost per gram can't be calculated",
      severity: "warning",
    });
  }
  if (!hasCost && hasGrams) {
    issues.push({
      field: "purchaseCost",
      message: "gramsPerUnit set but purchaseCost missing — cost per gram can't be calculated",
      severity: "warning",
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export const ingredientImportConfig: CSVImportConfig<Omit<Ingredient, "id">> = {
  entityName: "ingredient",
  templateColumns: INGREDIENT_TEMPLATE_COLUMNS,
  templateUrl: "/seed/ingredients.csv",
  mapRow: mapIngredientRow,
  validateRow: (data, _rowIndex) => validateIngredientRow(data),
  dedupKey: (data) => `${data.name.toLowerCase().trim()}::${(data.manufacturer || "").toLowerCase().trim()}`,
  commitBatch: async (items) => {
    await db.ingredients.bulkAdd(items);
    return items.length;
  },
};

// ---------------------------------------------------------------------------
// Existing keys loader (for dedup)
// ---------------------------------------------------------------------------

export async function getExistingIngredientKeys(): Promise<Set<string>> {
  const all = await db.ingredients.toArray();
  return new Set(all.map((i) => `${i.name.toLowerCase().trim()}::${(i.manufacturer || "").toLowerCase().trim()}`));
}
