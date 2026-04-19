import Dexie, { type EntityTable } from "dexie";
import dexieCloud from "dexie-cloud-addon";
import type { Ingredient, Product, ProductCategory, Filling, FillingCategory, ProductFilling, FillingIngredient, Mould, ProductionPlan, PlanProduct, PlanStepStatus, AppSetting, UserPreferences, ProductFillingHistory, IngredientPriceHistory, CoatingChocolateMapping, ProductCostSnapshot, Experiment, ExperimentIngredient, Packaging, PackagingOrder, ShoppingItem, Collection, CollectionProduct, CollectionPackaging, CollectionPricingSnapshot, DecorationMaterial, DecorationCategory, ShellDesign, FillingStock, IngredientCategory } from "@/types";
import { DEFAULT_PRODUCT_CATEGORIES, DEFAULT_DECORATION_CATEGORIES, DEFAULT_SHELL_DESIGNS, DEFAULT_FILLING_CATEGORIES, DEFAULT_INGREDIENT_CATEGORIES } from "@/types";

const db = new Dexie("ChocolatierDB", { addons: [dexieCloud] }) as Dexie & {
  ingredients: EntityTable<Ingredient, "id">;
  products: EntityTable<Product, "id">;
  productCategories: EntityTable<ProductCategory, "id">;
  fillings: EntityTable<Filling, "id">;
  productFillings: EntityTable<ProductFilling, "id">;
  fillingIngredients: EntityTable<FillingIngredient, "id">;
  moulds: EntityTable<Mould, "id">;
  productionPlans: EntityTable<ProductionPlan, "id">;
  planProducts: EntityTable<PlanProduct, "id">;
  planStepStatus: EntityTable<PlanStepStatus, "id">;
  settings: EntityTable<AppSetting, "key">;
  userPreferences: EntityTable<UserPreferences, "id">;
  productFillingHistory: EntityTable<ProductFillingHistory, "id">;
  ingredientPriceHistory: EntityTable<IngredientPriceHistory, "id">;
  coatingChocolateMappings: EntityTable<CoatingChocolateMapping, "id">;
  productCostSnapshots: EntityTable<ProductCostSnapshot, "id">;
  experiments: EntityTable<Experiment, "id">;
  experimentIngredients: EntityTable<ExperimentIngredient, "id">;
  packaging: EntityTable<Packaging, "id">;
  packagingOrders: EntityTable<PackagingOrder, "id">;
  shoppingItems: EntityTable<ShoppingItem, "id">;
  collections: EntityTable<Collection, "id">;
  collectionProducts: EntityTable<CollectionProduct, "id">;
  collectionPackagings: EntityTable<CollectionPackaging, "id">;
  collectionPricingSnapshots: EntityTable<CollectionPricingSnapshot, "id">;
  decorationMaterials: EntityTable<DecorationMaterial, "id">;
  decorationCategories: EntityTable<DecorationCategory, "id">;
  shellDesigns: EntityTable<ShellDesign, "id">;
  fillingStock: EntityTable<FillingStock, "id">;
  fillingCategories: EntityTable<FillingCategory, "id">;
  ingredientCategories: EntityTable<IngredientCategory, "id">;
};

// v1 — clean schema with the open-source naming (Product/Filling).
//
// Primary keys are inbound (plain `id`, not `@id`): we supply random UUIDs via
// `newId()` on every insert. We deliberately avoid Dexie Cloud's managed `@id`
// prefixes so that pre-rename backups (which carry the old `rcp*` / `lyr*` /
// `bon*` prefixes) can be imported verbatim without FK remapping gymnastics.
// Per Dexie Cloud docs, custom IDs are supported as long as they are random
// and globally unique — UUIDs qualify.
db.version(1).stores({
  ingredients: "id, name, category",
  products: "id, name, defaultMouldId, productType",
  fillings: "id, name, category, subcategory, rootId",
  productFillings: "id, productId, fillingId, sortOrder",
  fillingIngredients: "id, fillingId, ingredientId, sortOrder",
  moulds: "id, name",
  productionPlans: "id, createdAt, status, batchNumber",
  planProducts: "id, planId, productId",
  planStepStatus: "id, planId, stepKey, [planId+stepKey]",
  settings: "key",
  productFillingHistory: "id, productId, fillingId, replacedByFillingId",
  ingredientPriceHistory: "id, ingredientId, recordedAt",
  coatingChocolateMappings: "id, coatingName, effectiveFrom",
  productCostSnapshots: "id, productId, recordedAt",
  experiments: "id, createdAt, rootId",
  experimentIngredients: "id, experimentId, ingredientId",
  packaging: "id, name",
  packagingOrders: "id, packagingId, orderedAt",
  shoppingItems: "id, orderedAt",
  collections: "id, name, startDate, endDate",
  collectionProducts: "id, collectionId, productId",
  collectionPackagings: "id, collectionId, packagingId",
  collectionPricingSnapshots: "id, collectionId, packagingId, recordedAt",
  decorationMaterials: "id, name, type",
  fillingStock: "id, fillingId, planId",
});

// v2 — adds the productCategories table and replaces the free-text `productType`
// string on Product with a foreign key into productCategories. The string field
// is left in storage (Dexie does not enforce schemas at the data level) so that
// the upgrade hook can read it; new code reads `productCategoryId` instead.
//
// Migration:
//   1. Create the two seeded categories (moulded + bar) plus one extra category
//      per unique non-default `productType` string found on existing products.
//   2. Walk every product and set `productCategoryId` from a case-insensitive
//      lookup of its old `productType` string (defaulting to "moulded").
//
// Fresh users skip the upgrade hook entirely; for them, ensureDefaultProductCategories()
// (called from the seed loader on every app load) seeds the two defaults.
db.version(2).stores({
  productCategories: "id, name, archived",
  products: "id, name, defaultMouldId, productType, productCategoryId",
}).upgrade(async (tx) => {
  const productsTable = tx.table("products");
  const categoriesTable = tx.table("productCategories");
  const products = await productsTable.toArray();

  // Collect every distinct legacy productType string. Always include the two defaults.
  const namesByLower = new Map<string, string>();
  for (const { name } of DEFAULT_PRODUCT_CATEGORIES) namesByLower.set(name.toLowerCase(), name);
  for (const p of products) {
    const t = (p?.productType ?? "").toString().trim();
    if (!t) continue;
    const key = t.toLowerCase();
    if (!namesByLower.has(key)) namesByLower.set(key, t);
  }

  // Create one ProductCategory record per unique name. Defaults from DEFAULT_PRODUCT_CATEGORIES
  // get their seeded ranges; extras (legacy types like "truffle") get a permissive 0–100 range
  // so they don't accidentally constrain existing products.
  const now = new Date();
  const defaultsByLower = new Map<string, (typeof DEFAULT_PRODUCT_CATEGORIES)[number]>();
  for (const d of DEFAULT_PRODUCT_CATEGORIES) defaultsByLower.set(d.name.toLowerCase(), d);
  const idByLower = new Map<string, string>();
  for (const [lower, name] of namesByLower) {
    const seed = defaultsByLower.get(lower);
    const id = newId();
    await categoriesTable.add({
      id,
      name,
      shellPercentMin:    seed?.shellPercentMin    ?? 0,
      shellPercentMax:    seed?.shellPercentMax    ?? 100,
      defaultShellPercent: seed?.defaultShellPercent ?? 30,
      createdAt: now,
      updatedAt: now,
    });
    idByLower.set(lower, id);
  }

  // Link every product to its matching category (default to "moulded").
  const mouldedId = idByLower.get("moulded")!;
  for (const p of products) {
    if (!p?.id) continue;
    const t = (p.productType ?? "").toString().trim().toLowerCase();
    const categoryId = (t && idByLower.get(t)) || mouldedId;
    await productsTable.update(p.id, { productCategoryId: categoryId });
  }
});

// v3 — direct shell chocolate per product.
//
// Adds `shellIngredientId` and `shellPercentage` to Product (replacing the
// indirect coating name → CoatingChocolateMapping → ingredient lookup).
// Also marks all category "Chocolate" ingredients as `shellCapable`.
//
// Migration:
//   1. Mark all ingredients with category "Chocolate" as shellCapable.
//   2. For each product that has a coating name, resolve the latest
//      CoatingChocolateMapping to find the ingredientId and set it as
//      shellIngredientId.
//   3. Set shellPercentage = 37 on all products (old SHELL_FACTOR + CAP_FACTOR
//      = 0.30 + 0.07 = 0.37 = 37%).
//   4. Update moulded category default from 30 → 37 (matches the old hardcoded
//      total so existing users keep cost continuity).
db.version(3).stores({
  products: "id, name, defaultMouldId, productType, productCategoryId, shellIngredientId",
}).upgrade(async (tx) => {
  const ingredientsTable = tx.table("ingredients");
  const productsTable = tx.table("products");
  const mappingsTable = tx.table("coatingChocolateMappings");
  const categoriesTable = tx.table("productCategories");

  // 1. Mark all "Chocolate" ingredients as shellCapable
  const allIngredients = await ingredientsTable.toArray();
  for (const ing of allIngredients) {
    if (ing.category === "Chocolate" && ing.id) {
      await ingredientsTable.update(ing.id, { shellCapable: true });
    }
  }

  // 2. Build coating → latest ingredientId map from existing mappings
  const allMappings = await mappingsTable.toArray();
  const latestByCoating = new Map<string, string>();
  for (const m of allMappings) {
    const existing = latestByCoating.get(m.coatingName);
    if (!existing) {
      latestByCoating.set(m.coatingName, m.ingredientId);
    } else {
      // Keep the one with the latest effectiveFrom
      const existingMapping = allMappings.find((x) => x.ingredientId === existing && x.coatingName === m.coatingName);
      if (existingMapping && new Date(m.effectiveFrom).getTime() > new Date(existingMapping.effectiveFrom).getTime()) {
        latestByCoating.set(m.coatingName, m.ingredientId);
      }
    }
  }

  // 3. Walk every product: set shellIngredientId from coating name, shellPercentage = 37
  const products = await productsTable.toArray();
  for (const p of products) {
    if (!p?.id) continue;
    const coating = (p.coating ?? "").toString().trim();
    const shellIngredientId = coating ? (latestByCoating.get(coating) ?? undefined) : undefined;
    await productsTable.update(p.id, {
      shellIngredientId,
      shellPercentage: 37,
    });
  }

  // 4. Update moulded category default 30 → 37
  const categories = await categoriesTable.toArray();
  for (const c of categories) {
    if (c.name?.toLowerCase() === "moulded" && c.defaultShellPercent === 30 && c.id) {
      await categoriesTable.update(c.id, { defaultShellPercent: 37, updatedAt: new Date() });
    }
  }
});

// v4 — configurable decoration categories, shell designs, and syncable user preferences.
//
// Adds `decorationCategories` (replaces hardcoded DECORATION_MATERIAL_TYPES),
// `shellDesigns` (replaces hardcoded SHELL_TECHNIQUES), and `userPreferences`
// (replaces the old device-local `settings` key-value store — all preferences
// now sync across devices via Dexie Cloud).
db.version(4).stores({
  decorationCategories: "id, slug, name, archived",
  shellDesigns: "id, name, archived",
  userPreferences: "id",
}).upgrade(async (tx) => {
  const now = new Date();

  // --- Decoration categories & shell designs ---
  const categoriesTable = tx.table("decorationCategories");
  const designsTable = tx.table("shellDesigns");

  // Seed decoration categories from the hardcoded types
  for (const cat of DEFAULT_DECORATION_CATEGORIES) {
    await categoriesTable.add({
      id: newId(),
      name: cat.name,
      slug: cat.slug,
      createdAt: now,
      updatedAt: now,
    });
  }

  // Seed shell designs from the hardcoded techniques
  for (const design of DEFAULT_SHELL_DESIGNS) {
    await designsTable.add({
      id: newId(),
      name: design.name,
      defaultApplyAt: design.defaultApplyAt,
      createdAt: now,
      updatedAt: now,
    });
  }

  // --- User preferences migration ---
  const settingsTable = tx.table("settings");
  const prefsTable = tx.table("userPreferences");

  const rows = await settingsTable.toArray();
  const byKey = new Map<string, string>();
  for (const row of rows) {
    if (row.key && row.value) byKey.set(row.key, row.value);
  }

  function parse<T>(key: string, fallback: T): T {
    const raw = byKey.get(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  }

  await prefsTable.add({
    id: newId(),
    marketRegion: parse("marketRegion", "EU"),
    currency: parse("currency", "EUR"),
    defaultFillMode: parse("defaultFillMode", "percentage"),
    facilityMayContain: parse<string[]>("facilityMayContain", []),
    coatings: parse<string[]>("coatings", ["dark", "milk", "white", "vegan white", "vegan milk", "caramel"]),
    updatedAt: now,
  });

  // Clear old settings — data has been migrated
  await settingsTable.clear();
});

// v5 — configurable filling categories.
//
// Adds a `fillingCategories` table holding one record per category name with a
// `shelfStable` flag. Replaces the hardcoded SHELF_STABLE_CATEGORIES constant.
// `Filling.category` continues to store the category name as a string (the link
// key); renames cascade through the saveFillingCategory hook.
//
// Migration:
//   1. Seed one record per name in DEFAULT_FILLING_CATEGORIES.
//   2. Add one extra record per unique non-default `Filling.category` string
//      currently in use, defaulting shelfStable=false (legacy/custom labels).
db.version(5).stores({
  fillingCategories: "id, name, archived",
}).upgrade(async (tx) => {
  const now = new Date();
  const fillingCategoriesTable = tx.table("fillingCategories");
  const fillingsTable = tx.table("fillings");

  const namesByLower = new Map<string, { name: string; shelfStable: boolean }>();
  for (const seed of DEFAULT_FILLING_CATEGORIES) {
    namesByLower.set(seed.name.toLowerCase(), { name: seed.name, shelfStable: seed.shelfStable });
  }
  const fillings = await fillingsTable.toArray();
  for (const f of fillings) {
    const raw = (f?.category ?? "").toString().trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!namesByLower.has(key)) namesByLower.set(key, { name: raw, shelfStable: false });
  }

  for (const { name, shelfStable } of namesByLower.values()) {
    await fillingCategoriesTable.add({
      id: newId(),
      name,
      shelfStable,
      createdAt: now,
      updatedAt: now,
    });
  }
});

// v6 — configurable ingredient categories.
//
// Adds an `ingredientCategories` table replacing the hardcoded INGREDIENT_CATEGORIES
// constant. `Ingredient.category` continues to store the category name as a string
// (the link key — same approach as filling categories and decoration categories).
// Renames cascade through the saveIngredientCategory hook.
//
// Migration:
//   1. Seed one record per name in DEFAULT_INGREDIENT_CATEGORIES.
//   2. Add one extra record per unique non-default `Ingredient.category` string
//      currently in use, so custom categories are preserved.
db.version(6).stores({
  ingredientCategories: "id, name, archived",
}).upgrade(async (tx) => {
  const now = new Date();
  const ingCategoriesTable = tx.table("ingredientCategories");
  const ingredientsTable = tx.table("ingredients");

  const namesByLower = new Map<string, string>();
  for (const seed of DEFAULT_INGREDIENT_CATEGORIES) {
    namesByLower.set(seed.name.toLowerCase(), seed.name);
  }
  const ingredients = await ingredientsTable.toArray();
  for (const ing of ingredients) {
    const raw = (ing?.category ?? "").toString().trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    if (!namesByLower.has(key)) namesByLower.set(key, raw);
  }

  for (const name of namesByLower.values()) {
    await ingCategoriesTable.add({
      id: newId(),
      name,
      createdAt: now,
      updatedAt: now,
    });
  }
});

const cloudUrl = process.env.NEXT_PUBLIC_DEXIE_CLOUD_URL;
export const isCloudConfigured = Boolean(cloudUrl);

if (cloudUrl) {
  db.cloud.configure({
    databaseUrl: cloudUrl,
    requireAuth: true,
  });
}

/** Generate a random, globally unique primary key for a new record.
 *  Used by the `creating` hook below so existing `db.X.add({...})` call
 *  sites keep working exactly as they did under Dexie Cloud's `@id`
 *  auto-generation. */
export function newId(): string {
  // Node 19+ and all modern browsers support crypto.randomUUID.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  // Defensive fallback (should never hit this in practice)
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

// Auto-generate `id` for any row inserted without one. This keeps every
// existing call site that relied on `@id` auto-gen working unchanged
// (hooks.ts, seed.ts, seed-demo.ts, etc.). Rows that come in with a
// provided `id` (e.g. from importBackup's bulkAdd) are left alone, so
// pre-rename backups preserve their original identifiers and all
// foreign-key references stay intact.
const AUTO_ID_TABLES = [
  db.ingredients, db.products, db.productCategories, db.fillings, db.productFillings,
  db.fillingIngredients, db.moulds, db.productionPlans, db.planProducts,
  db.planStepStatus, db.productFillingHistory, db.ingredientPriceHistory,
  db.coatingChocolateMappings, db.productCostSnapshots, db.experiments,
  db.experimentIngredients, db.packaging, db.packagingOrders,
  db.shoppingItems, db.collections, db.collectionProducts,
  db.collectionPackagings, db.collectionPricingSnapshots,
  db.decorationMaterials, db.decorationCategories, db.shellDesigns, db.fillingStock, db.userPreferences,
  db.fillingCategories,
  db.ingredientCategories,
];
for (const table of AUTO_ID_TABLES) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (table as unknown as { hook: (event: "creating", fn: (primKey: unknown, obj: any) => unknown) => void }).hook(
    "creating",
    function (primKey, obj) {
      if (primKey == null && obj.id == null) {
        const id = newId();
        obj.id = id;
        return id;
      }
      return undefined;
    },
  );
}

// Before any table access triggers Dexie's lazy open (which runs `.upgrade()`
// hooks if the stored schema version is lower than the one declared above),
// issue a second connection at the existing version and dump it to a JSON
// file. IDB serializes the real open behind our peek until it closes, so the
// snapshot always captures pre-upgrade state. Fire-and-forget on purpose:
// failures here must never block the app, because the snapshot is a safety
// net, not a precondition.
if (typeof window !== "undefined") {
  void import("./upgrade-snapshot").then(({ snapshotBeforeUpgrade }) => snapshotBeforeUpgrade());
}

export { db };
