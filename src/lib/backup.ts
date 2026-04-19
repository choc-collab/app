import { db } from "@/lib/db";

const BACKUP_VERSION = 1;

export interface BackupData {
  version: number;
  exportedAt: string;
  ingredients: unknown[];
  products: unknown[];
  productCategories?: unknown[];
  fillings: unknown[];
  productFillings: unknown[];
  fillingIngredients: unknown[];
  moulds: unknown[];
  productionPlans: unknown[];
  planProducts: unknown[];
  planStepStatus: unknown[];
  settings?: unknown[];
  userPreferences?: unknown[];
  productFillingHistory?: unknown[];
  ingredientPriceHistory?: unknown[];
  coatingChocolateMappings?: unknown[];
  productCostSnapshots?: unknown[];
  packaging?: unknown[];
  packagingOrders?: unknown[];
  decorationMaterials?: unknown[];
  decorationCategories?: unknown[];
  shellDesigns?: unknown[];
  experiments?: unknown[];
  experimentIngredients?: unknown[];
  shoppingItems?: unknown[];
  collections?: unknown[];
  collectionProducts?: unknown[];
  collectionPackagings?: unknown[];
  collectionPricingSnapshots?: unknown[];
  fillingStock?: unknown[];
  fillingCategories?: unknown[];
  ingredientCategories?: unknown[];

  // --- Legacy key compat (older backups written before the Product/Filling rename) ---
  // These are accepted on import and remapped to the new tables above.
  recipes?: unknown[];
  layers?: unknown[];
  recipeLayers?: unknown[];
  layerIngredients?: unknown[];
  planBonbons?: unknown[];
  recipeLayerHistory?: unknown[];
  recipeCostSnapshots?: unknown[];
  collectionRecipes?: unknown[];
  layerStock?: unknown[];
}

export interface ExportBackupOptions {
  filenamePrefix?: string;
}

async function buildBackupData(): Promise<BackupData> {
  const [
    ingredients,
    products,
    productCategories,
    fillings,
    productFillings,
    fillingIngredients,
    moulds,
    productionPlans,
    planProducts,
    planStepStatus,
    userPreferences,
    productFillingHistory,
    ingredientPriceHistory,
    coatingChocolateMappings,
    productCostSnapshots,
    packaging,
    packagingOrders,
    decorationMaterials,
    decorationCategories,
    shellDesigns,
    experiments,
    experimentIngredients,
    shoppingItems,
    collections,
    collectionProducts,
    collectionPackagings,
    collectionPricingSnapshots,
    fillingStock,
    fillingCategories,
    ingredientCategories,
  ] = await Promise.all([
    db.ingredients.toArray(),
    db.products.toArray(),
    db.productCategories.toArray(),
    db.fillings.toArray(),
    db.productFillings.toArray(),
    db.fillingIngredients.toArray(),
    db.moulds.toArray(),
    db.productionPlans.toArray(),
    db.planProducts.toArray(),
    db.planStepStatus.toArray(),
    db.userPreferences.toArray(),
    db.productFillingHistory.toArray(),
    db.ingredientPriceHistory.toArray(),
    db.coatingChocolateMappings.toArray(),
    db.productCostSnapshots.toArray(),
    db.packaging.toArray(),
    db.packagingOrders.toArray(),
    db.decorationMaterials.toArray(),
    db.decorationCategories.toArray(),
    db.shellDesigns.toArray(),
    db.experiments.toArray(),
    db.experimentIngredients.toArray(),
    db.shoppingItems.toArray(),
    db.collections.toArray(),
    db.collectionProducts.toArray(),
    db.collectionPackagings.toArray(),
    db.collectionPricingSnapshots.toArray(),
    db.fillingStock.toArray(),
    db.fillingCategories.toArray(),
    db.ingredientCategories.toArray(),
  ]);

  return {
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    ingredients,
    products,
    productCategories,
    fillings,
    productFillings,
    fillingIngredients,
    moulds,
    productionPlans,
    planProducts,
    planStepStatus,
    settings: [], // Legacy — v4 migrated to userPreferences. Kept for backward compat.
    userPreferences,
    productFillingHistory,
    ingredientPriceHistory,
    coatingChocolateMappings,
    productCostSnapshots,
    packaging,
    packagingOrders,
    decorationMaterials,
    decorationCategories,
    shellDesigns,
    experiments,
    experimentIngredients,
    shoppingItems,
    collections,
    collectionProducts,
    collectionPackagings,
    collectionPricingSnapshots,
    fillingStock,
    fillingCategories,
    ingredientCategories,
  };
}

// True if at least one table has rows — used to skip auto-snapshots on a fresh
// install where a download file would be noise with nothing to protect.
function hasAnyData(data: BackupData): boolean {
  const arrays: unknown[][] = [
    data.ingredients, data.products, data.productCategories ?? [], data.fillings,
    data.productFillings, data.fillingIngredients, data.moulds, data.productionPlans,
    data.planProducts, data.planStepStatus, data.userPreferences ?? [],
    data.productFillingHistory ?? [], data.ingredientPriceHistory ?? [],
    data.coatingChocolateMappings ?? [], data.productCostSnapshots ?? [],
    data.packaging ?? [], data.packagingOrders ?? [], data.decorationMaterials ?? [],
    data.decorationCategories ?? [], data.shellDesigns ?? [], data.experiments ?? [],
    data.experimentIngredients ?? [], data.shoppingItems ?? [], data.collections ?? [],
    data.collectionProducts ?? [], data.collectionPackagings ?? [],
    data.collectionPricingSnapshots ?? [], data.fillingStock ?? [],
    data.fillingCategories ?? [], data.ingredientCategories ?? [],
  ];
  return arrays.some((a) => Array.isArray(a) && a.length > 0);
}

function triggerBackupDownload(data: BackupData, filenamePrefix: string): void {
  if (typeof document === "undefined") return;
  const json = JSON.stringify(data, (_key, value) => value ?? undefined);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const date = new Date().toISOString().slice(0, 10);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenamePrefix}-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function exportBackup(options?: ExportBackupOptions): Promise<void> {
  const data = await buildBackupData();
  triggerBackupDownload(data, options?.filenamePrefix ?? "choc-collab-backup");
}

// Write a safety snapshot of the current DB before a destructive operation so
// a misclick or a bad backup file is always recoverable. No-op if the DB is
// empty. Errors are swallowed — the snapshot is a best-effort safety net and
// should never block the operation the user actually asked for.
async function writeSafetySnapshot(filenamePrefix: string): Promise<void> {
  try {
    const data = await buildBackupData();
    if (!hasAnyData(data)) return;
    triggerBackupDownload(data, filenamePrefix);
  } catch {
    // Intentionally swallowed.
  }
}

export interface DestructiveOpOptions {
  // When true (the default), a timestamped safety snapshot is downloaded
  // before the DB is wiped. Pass false only for tests or scripted flows.
  snapshot?: boolean;
}

export async function clearAllData(options?: DestructiveOpOptions): Promise<void> {
  if (options?.snapshot !== false) {
    await writeSafetySnapshot("choc-collab-snapshot-before-clear");
  }
  await db.transaction(
    "rw",
    [
      db.ingredients, db.products, db.productCategories, db.fillings, db.productFillings, db.fillingIngredients,
      db.moulds, db.productionPlans, db.planProducts, db.planStepStatus, db.settings, db.userPreferences,
      db.productFillingHistory, db.ingredientPriceHistory, db.coatingChocolateMappings,
      db.productCostSnapshots, db.packaging, db.packagingOrders, db.decorationMaterials,
      db.decorationCategories, db.shellDesigns,
      db.experiments, db.experimentIngredients, db.shoppingItems,
      db.collections, db.collectionProducts, db.collectionPackagings, db.collectionPricingSnapshots, db.fillingStock,
      db.fillingCategories, db.ingredientCategories,
    ],
    async () => {
      await Promise.all([
        db.ingredients.clear(), db.products.clear(), db.productCategories.clear(), db.fillings.clear(),
        db.productFillings.clear(), db.fillingIngredients.clear(), db.moulds.clear(),
        db.productionPlans.clear(), db.planProducts.clear(), db.planStepStatus.clear(),
        db.settings.clear(), db.userPreferences.clear(), db.productFillingHistory.clear(), db.ingredientPriceHistory.clear(),
        db.coatingChocolateMappings.clear(), db.productCostSnapshots.clear(),
        db.packaging.clear(), db.packagingOrders.clear(), db.decorationMaterials.clear(),
        db.decorationCategories.clear(), db.shellDesigns.clear(),
        db.experiments.clear(), db.experimentIngredients.clear(), db.shoppingItems.clear(),
        db.collections.clear(), db.collectionProducts.clear(),
        db.collectionPackagings.clear(), db.collectionPricingSnapshots.clear(),
        db.fillingStock.clear(), db.fillingCategories.clear(), db.ingredientCategories.clear(),
      ]);
    },
  );
  // Prevent seed data from reloading on next visit
  localStorage.setItem("chocolatier-seeded", "true");
}

// --- Legacy-field migrators (applied on import so old Recipe/Layer/Bonbon backups keep working) ---

type AnyRec = Record<string, unknown>;

function renameField<T extends AnyRec>(obj: T, oldKey: string, newKey: string): T {
  if (obj && oldKey in obj && !(newKey in obj)) {
    const { [oldKey]: value, ...rest } = obj as AnyRec;
    return { ...rest, [newKey]: value } as T;
  }
  return obj;
}

function migrateProduct(r: AnyRec): AnyRec {
  return renameField(r, "bonbonType", "productType");
}

function migrateProductFilling(r: AnyRec): AnyRec {
  let out = renameField(r, "recipeId", "productId");
  out = renameField(out, "layerId", "fillingId");
  return out;
}

function migrateFillingIngredient(r: AnyRec): AnyRec {
  return renameField(r, "layerId", "fillingId");
}

function migratePlanProduct(r: AnyRec): AnyRec {
  return renameField(r, "recipeId", "productId");
}

function migrateProductFillingHistory(r: AnyRec): AnyRec {
  let out = renameField(r, "recipeId", "productId");
  out = renameField(out, "layerId", "fillingId");
  out = renameField(out, "replacedByLayerId", "replacedByFillingId");
  return out;
}

function migrateProductCostSnapshot(r: AnyRec): AnyRec {
  let out = renameField(r, "recipeId", "productId");
  out = renameField(out, "costPerBonbon", "costPerProduct");
  // Translate trigger type and breakdown JSON in-place
  if (typeof out.triggerType === "string" && out.triggerType === "layer_version") {
    out = { ...out, triggerType: "filling_version" };
  }
  if (typeof out.breakdown === "string") {
    try {
      const entries = JSON.parse(out.breakdown as string) as AnyRec[];
      const migrated = entries.map(e => {
        let m = { ...e };
        if (m.kind === "layer_ingredient") m.kind = "filling_ingredient";
        m = renameField(m, "layerId", "fillingId");
        return m;
      });
      out = { ...out, breakdown: JSON.stringify(migrated) };
    } catch {
      // leave unchanged if not parseable
    }
  }
  return out;
}

function migrateCollectionProduct(r: AnyRec): AnyRec {
  return renameField(r, "recipeId", "productId");
}

function migrateCollectionPricingSnapshot(r: AnyRec): AnyRec {
  return renameField(r, "avgBonbonCost", "avgProductCost");
}

function migrateFillingStock(r: AnyRec): AnyRec {
  return renameField(r, "layerId", "fillingId");
}

function migrateProductionPlan(r: AnyRec): AnyRec {
  let out = renameField(r, "layerOverrides", "fillingOverrides");
  out = renameField(out, "layerPreviousBatches", "fillingPreviousBatches");
  return out;
}

function migrateExperiment(r: AnyRec): AnyRec {
  let out = renameField(r, "sourceLayerId", "sourceFillingId");
  out = renameField(out, "promotedLayerId", "promotedFillingId");
  return out;
}

function applyAll<T>(rows: unknown[] | undefined, fn: (r: AnyRec) => AnyRec): T[] {
  if (!rows) return [];
  return rows.map(r => fn((r ?? {}) as AnyRec)) as T[];
}

export async function importBackup(file: File, options?: DestructiveOpOptions): Promise<void> {
  const text = await file.text();
  const data: BackupData = JSON.parse(text);

  if (!data.version || !data.exportedAt) {
    throw new Error("Invalid backup file: missing version or exportedAt.");
  }
  if (data.version !== BACKUP_VERSION) {
    throw new Error(`Unsupported backup version ${data.version}. Expected ${BACKUP_VERSION}.`);
  }

  // Snapshot the current DB before we wipe it, so a bad backup file or a
  // misclick is always recoverable. Runs after validation so we don't hand the
  // user a snapshot they can't undo with a file they couldn't use anyway.
  if (options?.snapshot !== false) {
    await writeSafetySnapshot("choc-collab-snapshot-before-restore");
  }

  // Prefer new keys, fall back to legacy keys from pre-rename backups.
  const rawIngredients             = data.ingredients             ?? [];
  const rawProductCategories       = data.productCategories       ?? [];
  const rawProducts                = data.products                ?? data.recipes                ?? [];
  const rawFillings                = data.fillings                ?? data.layers                 ?? [];
  const rawProductFillings         = data.productFillings         ?? data.recipeLayers           ?? [];
  const rawFillingIngredients      = data.fillingIngredients      ?? data.layerIngredients       ?? [];
  const rawMoulds                  = data.moulds                  ?? [];
  const rawProductionPlans         = data.productionPlans         ?? [];
  const rawPlanProducts            = data.planProducts            ?? data.planBonbons            ?? [];
  const rawPlanStepStatus          = data.planStepStatus          ?? [];
  const rawUserPreferences         = data.userPreferences          ?? [];
  const rawLegacySettings          = data.settings                ?? [];
  const rawProductFillingHistory   = data.productFillingHistory   ?? data.recipeLayerHistory     ?? [];
  const rawIngredientPriceHistory  = data.ingredientPriceHistory  ?? [];
  const rawCoatingChocolateMaps    = data.coatingChocolateMappings ?? [];
  const rawProductCostSnapshots    = data.productCostSnapshots    ?? data.recipeCostSnapshots    ?? [];
  const rawPackaging               = data.packaging               ?? [];
  const rawPackagingOrders         = data.packagingOrders         ?? [];
  const rawDecorationMaterials     = data.decorationMaterials     ?? [];
  const rawDecorationCategories    = data.decorationCategories    ?? [];
  const rawShellDesigns            = data.shellDesigns            ?? [];
  const rawExperiments             = data.experiments             ?? [];
  const rawExperimentIngredients   = data.experimentIngredients   ?? [];
  const rawShoppingItems           = data.shoppingItems           ?? [];
  const rawCollections             = data.collections             ?? [];
  const rawCollectionProducts      = data.collectionProducts      ?? data.collectionRecipes      ?? [];
  const rawCollectionPackagings    = data.collectionPackagings    ?? [];
  const rawCollectionPricingSnaps  = data.collectionPricingSnapshots ?? [];
  const rawFillingStock            = data.fillingStock            ?? data.layerStock             ?? [];
  const rawFillingCategories       = data.fillingCategories       ?? [];
  const rawIngredientCategories    = data.ingredientCategories    ?? [];

  // Apply field-level migrations for backups written pre-rename.
  const ingredients              = rawIngredients as never[];
  const productCategories        = rawProductCategories as never[];
  const products                 = applyAll<never>(rawProducts, migrateProduct);
  const fillings                 = rawFillings as never[];
  const productFillings          = applyAll<never>(rawProductFillings, migrateProductFilling);
  const fillingIngredients       = applyAll<never>(rawFillingIngredients, migrateFillingIngredient);
  const moulds                   = rawMoulds as never[];
  const productionPlans          = applyAll<never>(rawProductionPlans, migrateProductionPlan);
  const planProducts             = applyAll<never>(rawPlanProducts, migratePlanProduct);
  const planStepStatus           = rawPlanStepStatus as never[];
  const userPreferences          = rawUserPreferences as never[];
  const productFillingHistory    = applyAll<never>(rawProductFillingHistory, migrateProductFillingHistory);
  const ingredientPriceHistory   = rawIngredientPriceHistory as never[];
  const coatingChocolateMappings = rawCoatingChocolateMaps as never[];
  const productCostSnapshots     = applyAll<never>(rawProductCostSnapshots, migrateProductCostSnapshot);
  const packaging                = rawPackaging as never[];
  const packagingOrders          = rawPackagingOrders as never[];
  const decorationMaterials      = rawDecorationMaterials as never[];
  const decorationCategories     = rawDecorationCategories as never[];
  const shellDesigns             = rawShellDesigns as never[];
  const experiments              = applyAll<never>(rawExperiments, migrateExperiment);
  const experimentIngredients    = rawExperimentIngredients as never[];
  const shoppingItems            = rawShoppingItems as never[];
  const collections              = rawCollections as never[];
  const collectionProducts       = applyAll<never>(rawCollectionProducts, migrateCollectionProduct);
  const collectionPackagings     = rawCollectionPackagings as never[];
  const collectionPricingSnapshots = applyAll<never>(rawCollectionPricingSnaps, migrateCollectionPricingSnapshot);
  const fillingStock             = applyAll<never>(rawFillingStock, migrateFillingStock);
  const fillingCategories        = rawFillingCategories as never[];
  const ingredientCategories     = rawIngredientCategories as never[];

  await db.transaction(
    "rw",
    [
      db.ingredients, db.products, db.productCategories, db.fillings, db.productFillings, db.fillingIngredients,
      db.moulds, db.productionPlans, db.planProducts, db.planStepStatus, db.settings, db.userPreferences,
      db.productFillingHistory, db.ingredientPriceHistory, db.coatingChocolateMappings,
      db.productCostSnapshots, db.packaging, db.packagingOrders, db.decorationMaterials,
      db.decorationCategories, db.shellDesigns,
      db.experiments, db.experimentIngredients, db.shoppingItems,
      db.collections, db.collectionProducts, db.collectionPackagings, db.collectionPricingSnapshots, db.fillingStock,
      db.fillingCategories, db.ingredientCategories,
    ],
    async () => {
      await Promise.all([
        db.ingredients.clear(), db.products.clear(), db.productCategories.clear(), db.fillings.clear(),
        db.productFillings.clear(), db.fillingIngredients.clear(), db.moulds.clear(),
        db.productionPlans.clear(), db.planProducts.clear(), db.planStepStatus.clear(),
        db.settings.clear(), db.userPreferences.clear(), db.productFillingHistory.clear(), db.ingredientPriceHistory.clear(),
        db.coatingChocolateMappings.clear(), db.productCostSnapshots.clear(),
        db.packaging.clear(), db.packagingOrders.clear(), db.decorationMaterials.clear(),
        db.decorationCategories.clear(), db.shellDesigns.clear(),
        db.experiments.clear(), db.experimentIngredients.clear(), db.shoppingItems.clear(),
        db.collections.clear(), db.collectionProducts.clear(),
        db.collectionPackagings.clear(), db.collectionPricingSnapshots.clear(),
        db.fillingStock.clear(), db.fillingCategories.clear(), db.ingredientCategories.clear(),
      ]);
      await Promise.all([
        ingredients.length              && db.ingredients.bulkAdd(ingredients),
        products.length                 && db.products.bulkAdd(products),
        productCategories.length        && db.productCategories.bulkAdd(productCategories),
        fillings.length                 && db.fillings.bulkAdd(fillings),
        productFillings.length          && db.productFillings.bulkAdd(productFillings),
        fillingIngredients.length       && db.fillingIngredients.bulkAdd(fillingIngredients),
        moulds.length                   && db.moulds.bulkAdd(moulds),
        productionPlans.length          && db.productionPlans.bulkAdd(productionPlans),
        planProducts.length             && db.planProducts.bulkAdd(planProducts),
        planStepStatus.length           && db.planStepStatus.bulkAdd(planStepStatus),
        userPreferences.length          && db.userPreferences.bulkAdd(userPreferences),
        productFillingHistory.length    && db.productFillingHistory.bulkAdd(productFillingHistory),
        ingredientPriceHistory.length   && db.ingredientPriceHistory.bulkAdd(ingredientPriceHistory),
        coatingChocolateMappings.length && db.coatingChocolateMappings.bulkAdd(coatingChocolateMappings),
        productCostSnapshots.length     && db.productCostSnapshots.bulkAdd(productCostSnapshots),
        packaging.length                && db.packaging.bulkAdd(packaging),
        packagingOrders.length          && db.packagingOrders.bulkAdd(packagingOrders),
        decorationMaterials.length      && db.decorationMaterials.bulkAdd(decorationMaterials),
        decorationCategories.length     && db.decorationCategories.bulkAdd(decorationCategories),
        shellDesigns.length             && db.shellDesigns.bulkAdd(shellDesigns),
        experiments.length              && db.experiments.bulkAdd(experiments),
        experimentIngredients.length    && db.experimentIngredients.bulkAdd(experimentIngredients),
        shoppingItems.length            && db.shoppingItems.bulkAdd(shoppingItems),
        collections.length              && db.collections.bulkAdd(collections),
        collectionProducts.length       && db.collectionProducts.bulkAdd(collectionProducts),
        collectionPackagings.length     && db.collectionPackagings.bulkAdd(collectionPackagings),
        collectionPricingSnapshots.length && db.collectionPricingSnapshots.bulkAdd(collectionPricingSnapshots),
        fillingStock.length             && db.fillingStock.bulkAdd(fillingStock),
        fillingCategories.length        && db.fillingCategories.bulkAdd(fillingCategories),
        ingredientCategories.length     && db.ingredientCategories.bulkAdd(ingredientCategories),
      ]);
    },
  );

  // Pre-v2 backups (and pre-rename backups) lack the productCategories table and
  // store category names as the legacy `productType` string on each Product. Run
  // the same logic the v2 upgrade hook applies, but post-import: ensure the two
  // defaults exist, create extras for any unknown legacy types, and link every
  // product to a category. This is a no-op when the backup already includes
  // categories and `productCategoryId` on each product.
  await reconcileProductCategoriesAfterImport();

  // Pre-v4 backups lack the decorationCategories and shellDesigns tables.
  // Ensure the defaults exist so the UI always has categories and designs to show.
  const { ensureDefaultDecorationCategories, ensureDefaultShellDesigns, ensureDefaultFillingCategories, ensureDefaultIngredientCategories } = await import("@/lib/hooks");
  await ensureDefaultDecorationCategories();
  await ensureDefaultShellDesigns();
  // Pre-v5 backups also lack the fillingCategories table — seed defaults so the
  // production wizard can resolve shelf-stable status by name.
  await ensureDefaultFillingCategories();
  // Pre-v6 backups lack the ingredientCategories table — seed defaults so the
  // ingredient form and list page have categories to show.
  await ensureDefaultIngredientCategories();

  // Pre-v4 backups store preferences in the key-value `settings` table rather
  // than the new `userPreferences` table. Migrate them if userPreferences is
  // empty but legacy settings exist.
  await reconcileUserPreferencesAfterImport(rawLegacySettings);
}

/**
 * Idempotent post-import reconciliation. Ensures the productCategories table
 * has at least the default seeded categories, then walks every product and
 * back-fills `productCategoryId` from the legacy `productType` string for any
 * product that doesn't already have one set. Safe to call after any import.
 */
async function reconcileProductCategoriesAfterImport(): Promise<void> {
  const existing = await db.productCategories.toArray();
  const byLower = new Map(existing.map((c) => [c.name.toLowerCase(), c]));

  // Ensure both default categories exist (preserving any user-edited ranges).
  const now = new Date();
  const { DEFAULT_PRODUCT_CATEGORIES } = await import("@/types");
  for (const seed of DEFAULT_PRODUCT_CATEGORIES) {
    if (byLower.has(seed.name.toLowerCase())) continue;
    const id = await db.productCategories.add({
      name: seed.name,
      shellPercentMin: seed.shellPercentMin,
      shellPercentMax: seed.shellPercentMax,
      defaultShellPercent: seed.defaultShellPercent,
      createdAt: now,
      updatedAt: now,
    } as never) as string;
    byLower.set(seed.name.toLowerCase(), { ...seed, id, createdAt: now, updatedAt: now } as never);
  }

  // Walk products needing back-fill (no productCategoryId set).
  const products = await db.products.toArray();
  const needsLink = products.filter((p) => !p.productCategoryId);
  if (needsLink.length === 0) return;

  // For each unique legacy productType string not already a category, create one.
  const legacyTypes = new Set<string>();
  for (const p of needsLink) {
    const t = ((p as unknown as { productType?: string }).productType ?? "").toString().trim();
    if (t && !byLower.has(t.toLowerCase())) legacyTypes.add(t);
  }
  for (const name of legacyTypes) {
    const id = await db.productCategories.add({
      name,
      shellPercentMin: 0,
      shellPercentMax: 100,
      defaultShellPercent: 30,
      createdAt: now,
      updatedAt: now,
    } as never) as string;
    byLower.set(name.toLowerCase(), { id, name, shellPercentMin: 0, shellPercentMax: 100, defaultShellPercent: 30, createdAt: now, updatedAt: now } as never);
  }

  // Link each product. Default to "moulded".
  const mouldedId = byLower.get("moulded")?.id;
  for (const p of needsLink) {
    if (!p.id) continue;
    const t = ((p as unknown as { productType?: string }).productType ?? "").toString().trim().toLowerCase();
    const categoryId = (t && byLower.get(t)?.id) || mouldedId;
    if (categoryId) {
      await db.products.update(p.id, { productCategoryId: categoryId });
    }
  }
}

/**
 * Migrate legacy key-value settings to the new userPreferences table.
 * Called after importing a pre-v4 backup that has `settings` but no `userPreferences`.
 * No-op if userPreferences already has data (i.e. the backup was v4+).
 */
async function reconcileUserPreferencesAfterImport(rawLegacySettings: unknown[]): Promise<void> {
  const existing = await db.userPreferences.toArray();
  if (existing.length > 0) return; // already migrated or backup included userPreferences

  if (!rawLegacySettings || rawLegacySettings.length === 0) {
    // No settings at all — create defaults
    await db.userPreferences.add({
      marketRegion: "EU",
      currency: "EUR",
      defaultFillMode: "percentage",
      facilityMayContain: [],
      coatings: ["dark", "milk", "white", "vegan white", "vegan milk", "caramel"],
      updatedAt: new Date(),
    } as never);
    return;
  }

  // Parse legacy key-value pairs
  const byKey = new Map<string, string>();
  for (const row of rawLegacySettings) {
    const r = row as { key?: string; value?: string };
    if (r?.key && r?.value) byKey.set(r.key, r.value);
  }

  function parse<T>(key: string, fallback: T): T {
    const raw = byKey.get(key);
    if (!raw) return fallback;
    try { return JSON.parse(raw) as T; } catch { return fallback; }
  }

  await db.userPreferences.add({
    marketRegion: parse("marketRegion", "EU"),
    currency: parse("currency", "EUR"),
    defaultFillMode: parse("defaultFillMode", "percentage"),
    facilityMayContain: parse<string[]>("facilityMayContain", []),
    coatings: parse<string[]>("coatings", ["dark", "milk", "white", "vegan white", "vegan milk", "caramel"]),
    updatedAt: new Date(),
  } as never);
}
