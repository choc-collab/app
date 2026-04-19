import { db } from "@/lib/db";
import { parseCSV } from "@/lib/csv";
import type { NutrientKey, NutritionData } from "@/lib/nutrition";

/** Allergen IDs that appear as per-column booleans in the ingredients template.
 *  Union of EU (14, tree nuts expanded) + US-only (shellfish, wheat). */
const ALLERGEN_COLUMNS = [
  "gluten", "wheat",
  "crustaceans", "shellfish", "molluscs", "fish",
  "eggs", "milk", "peanuts", "soybeans", "sesame",
  "nuts_almonds", "nuts_hazelnuts", "nuts_walnuts", "nuts_cashews",
  "nuts_pecans", "nuts_brazil", "nuts_pistachios", "nuts_macadamia",
  "celery", "mustard", "sulphites", "lupin",
] as const;

/** NutritionData keys exposed as `nut_<key>` columns in the ingredients template. */
const NUTRITION_COLUMNS: NutrientKey[] = [
  "energyKj", "energyKcal", "fat", "saturatedFat", "transFat",
  "cholesterolMg", "carbohydrate", "sugars", "addedSugars", "fibre",
  "protein", "salt", "sodium", "vitaminDMcg", "calciumMg",
  "ironMg", "potassiumMg",
];

function parseNutritionColumns(r: Record<string, string>): NutritionData | undefined {
  const data: NutritionData = {};
  for (const key of NUTRITION_COLUMNS) {
    const val = toNumOpt(r[`nut_${key}`]);
    if (val !== undefined) data[key] = val;
  }
  return Object.keys(data).length > 0 ? data : undefined;
}

const SEED_KEY = "chocolatier-seeded";

export async function seedIfNeeded() {
  if (typeof window === "undefined") return;
  if (localStorage.getItem(SEED_KEY)) return;

  const ingredientCount = await db.ingredients.count();
  if (ingredientCount > 0) {
    localStorage.setItem(SEED_KEY, "true");
    return;
  }

  try {
    await seedIngredients();
    await seedMoulds();
    localStorage.setItem(SEED_KEY, "true");
  } catch (e) {
    console.error("Seeding failed:", e);
  }
}

async function fetchCSV(path: string) {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`Failed to fetch ${path}`);
  return parseCSV(await res.text());
}

function toNum(val: string | undefined): number {
  if (!val || val === "") return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

function toNumOpt(val: string | undefined): number | undefined {
  if (!val || val === "") return undefined;
  const n = parseFloat(val);
  return isNaN(n) ? undefined : n;
}

function toStrOpt(val: string | undefined): string | undefined {
  if (!val || val === "") return undefined;
  return val.trim();
}

function toBoolOpt(val: string | undefined): boolean | undefined {
  if (!val || val === "") return undefined;
  const v = val.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return undefined;
}

async function seedIngredients() {
  const rows = await fetchCSV("/seed/ingredients.csv");
  if (rows.length === 0) return;
  const items = rows.map((r) => ({
    name: r.name,
    commercialName: toStrOpt(r.commercialName),
    manufacturer: r.manufacturer || "",
    brand: toStrOpt(r.brand),
    vendor: toStrOpt(r.vendor),
    source: r.source || "",
    category: toStrOpt(r.category),
    cost: 0,
    purchaseCost: toNumOpt(r.purchaseCost),
    purchaseDate: toStrOpt(r.purchaseDate),
    purchaseQty: toNumOpt(r.purchaseQty),
    purchaseUnit: toStrOpt(r.purchaseUnit),
    gramsPerUnit: toNumOpt(r.gramsPerUnit),
    notes: r.notes || "",
    cacaoFat: toNum(r.cacaoFat),
    sugar: toNum(r.sugar),
    milkFat: toNum(r.milkFat),
    water: toNum(r.water),
    solids: toNum(r.solids),
    otherFats: toNum(r.otherFats),
    alcohol: toNumOpt(r.alcohol),
    allergens: ALLERGEN_COLUMNS.filter((id) => toBoolOpt(r[`allergen_${id}`]) === true),
    shellCapable: toBoolOpt(r.shellCapable),
    pricingIrrelevant: toBoolOpt(r.pricingIrrelevant),
    nutrition: parseNutritionColumns(r),
  }));
  await db.ingredients.bulkAdd(items);
}

async function seedMoulds() {
  const rows = await fetchCSV("/seed/moulds.csv");
  if (rows.length === 0) return;
  const items = rows.map((r) => ({
    name: r.name,
    productNumber: toStrOpt(r.productNumber),
    brand: toStrOpt(r.brand),
    cavityWeightG: toNum(r.cavityWeightG),
    numberOfCavities: toNum(r.numberOfCavities),
    fillingGramsPerCavity: toNumOpt(r.fillingGramsPerCavity),
    quantityOwned: toNumOpt(r.quantityOwned),
    notes: toStrOpt(r.notes),
  }));
  await db.moulds.bulkAdd(items);
}
