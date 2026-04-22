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

export function validateIngredientRow(
  data: Omit<Ingredient, "id">,
  knownCategories: ReadonlySet<string> = new Set(INGREDIENT_CATEGORIES),
): RowIssue[] {
  const issues: RowIssue[] = [];

  // Required: name
  if (!data.name) {
    issues.push({ field: "name", message: "Name is required", severity: "error" });
  }

  // Category: warn if unrecognised (still importable). `knownCategories` should include
  // both the built-in seed list AND any user-created categories from the live DB table.
  if (data.category && !knownCategories.has(data.category)) {
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

const ingredientKey = (i: Pick<Ingredient, "name" | "manufacturer">) =>
  `${i.name.toLowerCase().trim()}::${(i.manufacturer || "").toLowerCase().trim()}`;

/**
 * Build an ingredient CSV import config. Accepts the user's live category names
 * so the validator doesn't falsely flag user-created categories as "Unknown".
 * Falls back to just the built-in seed list when nothing is passed.
 */
export function makeIngredientImportConfig(
  options: { liveCategoryNames?: readonly string[] } = {},
): CSVImportConfig<Omit<Ingredient, "id">> {
  const knownCategories = new Set<string>([
    ...INGREDIENT_CATEGORIES,
    ...(options.liveCategoryNames ?? []),
  ]);
  return {
    entityName: "ingredient",
    templateColumns: INGREDIENT_TEMPLATE_COLUMNS,
    templateUrl: "/seed/ingredients.csv",
    mapRow: mapIngredientRow,
    validateRow: (data, _rowIndex) => validateIngredientRow(data, knownCategories),
    dedupKey: ingredientKey,
    commitBatch: async (items) => {
      await db.ingredients.bulkAdd(items);
      return items.length;
    },
    updateOne: async (id, data) => {
      await db.ingredients.update(id, { ...data, updatedAt: new Date() });
    },
    removeUnreferenced: async (ids) => {
      let removed = 0;
      let keptReferenced = 0;
      for (const id of ids) {
        if (await isIngredientReferenced(id)) {
          keptReferenced++;
        } else {
          await db.ingredients.delete(id);
          removed++;
        }
      }
      return { removed, keptReferenced };
    },
  };
}

/** Back-compat static export that uses only the built-in category list. */
export const ingredientImportConfig: CSVImportConfig<Omit<Ingredient, "id">> = makeIngredientImportConfig();

// ---------------------------------------------------------------------------
// Existing index loader (key → id) for dedup + upsert + remove-missing
// ---------------------------------------------------------------------------

export async function getExistingIngredientIndex(): Promise<Map<string, string>> {
  const all = await db.ingredients.toArray();
  const map = new Map<string, string>();
  for (const i of all) if (i.id) map.set(ingredientKey(i), i.id);
  return map;
}

/**
 * Reports whether an ingredient is referenced anywhere that deletion would break:
 *   - any filling (active OR superseded — superseded fillings back production history)
 *   - any product's shellIngredientId
 *   - any coating-chocolate mapping
 * When any of these are true, the CSV importer keeps the ingredient rather than deleting it.
 */
async function isIngredientReferenced(ingredientId: string): Promise<boolean> {
  const fillingUses = await db.fillingIngredients.where("ingredientId").equals(ingredientId).count();
  if (fillingUses > 0) return true;
  const shellUses = await db.products.where("shellIngredientId").equals(ingredientId).count();
  if (shellUses > 0) return true;
  // coatingChocolateMappings is not indexed on ingredientId — full-table scan is fine, the
  // table has one row per coating name (typically 2-5 rows total).
  const coatingUses = await db.coatingChocolateMappings.filter((m) => m.ingredientId === ingredientId).count();
  if (coatingUses > 0) return true;
  return false;
}
