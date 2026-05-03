import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import type { Ingredient, Product, ProductCategory, Filling, FillingCategory, ProductFilling, FillingIngredient, FillingComponent, Mould, ProductionPlan, PlanProduct, PlanFilling, PlanStepStatus, UserPreferences, ProductFillingHistory, IngredientPriceHistory, CoatingChocolateMapping, ProductCostSnapshot, Experiment, ExperimentIngredient, Packaging, PackagingOrder, ShoppingItem, Collection, CollectionProduct, CollectionPackaging, CollectionPricingSnapshot, DecorationMaterial, DecorationCategory, ShellDesign, FillingStock, IngredientCategory, Sale, ShopKind, GiveAwayRecord, GiveAwayShape, GiveAwayReason } from "@/types";
import { DEFAULT_PRODUCT_CATEGORIES, DEFAULT_INGREDIENT_CATEGORIES, DEFAULT_COATINGS, SHELF_STABLE_CATEGORIES, costPerGram as deriveIngredientCostPerGram, hasPricingData, type MarketRegion, type CurrencyCode, type FillMode, getCurrencySymbol } from "@/types";
import { validateCategoryRange } from "@/lib/productCategories";
import { calculateProductCost, buildIngredientCostMap, serializeBreakdown, deriveShellPercentageFromFractions } from "@/lib/costCalculation";
import { computeShopKpis, EMPTY_SHOP_KPIS, type ShopKpis } from "@/lib/shopKpis";
import { computeTodaySignals, type TodaySignals, type TodayProductInfo } from "@/lib/todaySignals";
import {
  computeCommitStockDeltas,
  computeRestoreStockDeltas,
  tallyCells,
  type SaleStockBatch,
} from "@/lib/saleStock";
import { resolveShopColor, type ShopProductInfo, DEFAULT_SHOP_KIND } from "@/lib/shopColor";
import { ancestorFillingIds, buildChildMap, buildParentMap, reachableIngredientIds, wouldCreateCycle } from "@/lib/fillingComponents";

// --- Ingredients ---

export function useIngredients(includeArchived = false) {
  return useLiveQuery(() => db.ingredients.toArray().then((all) =>
    all.filter((i) => includeArchived || !i.archived)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
  ), [includeArchived]) ?? [];
}

export function useIngredient(id: string | undefined) {
  return useLiveQuery(
    () => (id ? db.ingredients.get(id) : undefined),
    [id]
  );
}

export async function saveIngredient(ingredient: Omit<Ingredient, "id"> & { id?: string }) {
  let savedId: string;
  let priceChanged = false;

  if (ingredient.id) {
    const existing = await db.ingredients.get(ingredient.id);
    if (existing) {
      priceChanged =
        existing.purchaseCost !== ingredient.purchaseCost ||
        existing.purchaseQty !== ingredient.purchaseQty ||
        existing.purchaseUnit !== ingredient.purchaseUnit ||
        existing.gramsPerUnit !== ingredient.gramsPerUnit;
    }
    await db.ingredients.update(ingredient.id, { ...ingredient, updatedAt: new Date() });
    savedId = ingredient.id;
  } else {
    savedId = await db.ingredients.add({ ...ingredient, updatedAt: new Date() } as Ingredient) as string;
    priceChanged = deriveIngredientCostPerGram(ingredient as Ingredient) !== null;
  }

  // Allergen change cascades up: every direct host of this ingredient gets
  // refreshed, plus every filling that transitively nests one of those hosts.
  const affected = await db.fillingIngredients.where("ingredientId").equals(savedId).toArray();
  const fillingIds = [...new Set(affected.map((li) => li.fillingId))];
  await Promise.all(fillingIds.map((id) => cascadeAllergensFromFilling(id)));

  if (priceChanged) {
    const savedIngredient = ingredient.id ? ingredient as Ingredient : { ...ingredient, id: savedId } as Ingredient;
    await saveIngredientPriceEntry(savedId, savedIngredient);
    await computeSnapshotsForAffectedProducts(
      savedId,
      "ingredient_price",
      `${ingredient.name} price updated`,
    );
  }

  return savedId;
}

export async function deleteIngredient(id: string) {
  await db.ingredients.delete(id);
}

export interface IngredientDeleteCheck {
  activeFillings: Filling[];
  produced: boolean;
}

export async function checkIngredientBeforeDelete(ingredientId: string): Promise<IngredientDeleteCheck> {
  const lis = await db.fillingIngredients.where("ingredientId").equals(ingredientId).toArray();
  if (lis.length === 0) return { activeFillings: [], produced: false };

  const fillingIds = [...new Set(lis.map((li) => li.fillingId))];
  const fillings = (await Promise.all(fillingIds.map((id) => db.fillings.get(id)))).filter((l): l is Filling => l !== undefined);
  const activeFillings = fillings.filter((l) => !l.supersededAt);

  const rls = (await Promise.all(fillingIds.map((id) => db.productFillings.where("fillingId").equals(id).toArray()))).flat();
  let produced = false;
  if (rls.length > 0) {
    const productIds = [...new Set(rls.map((rl) => rl.productId))];
    const counts = await Promise.all(productIds.map((id) => db.planProducts.where("productId").equals(id).count()));
    produced = counts.some((c) => c > 0);
  }

  return { activeFillings, produced };
}

export async function archiveIngredient(id: string) {
  await db.ingredients.update(id, { archived: true });
}

export async function unarchiveIngredient(id: string) {
  await db.ingredients.update(id, { archived: undefined });
}

/** Reactive list of ingredients that can serve as shell chocolates.
 *  Filters on `category === "Chocolate" && shellCapable === true && !archived`. */
export function useShellCapableIngredients(): Ingredient[] {
  return useLiveQuery(
    () => db.ingredients.where("category").equals("Chocolate").toArray().then((chocs) =>
      chocs.filter((i) => i.shellCapable && !i.archived)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    ),
  ) ?? [];
}

// --- Products ---

export function useProductsList(includeArchived = false): Omit<Product, "photo">[] {
  return useLiveQuery(() =>
    db.products.toArray().then(
      (all) => all
        .filter((r) => includeArchived || !r.archived)
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(({ photo: _photo, ...r }) => r)
    ),
    [includeArchived]
  ) ?? [];
}

export function useProduct(id: string | undefined) {
  return useLiveQuery(
    () => (id ? db.products.get(id) : undefined),
    [id]
  );
}

export async function saveProduct(product: Omit<Product, "id" | "createdAt" | "updatedAt"> & { id?: string }) {
  const now = new Date();
  if (product.id) {
    const existing = await db.products.get(product.id);
    await db.products.update(product.id, { ...product, updatedAt: now });
    if (existing) {
      if (existing.defaultMouldId !== product.defaultMouldId) {
        await computeAndSaveProductCostSnapshot({
          productId: product.id,
          triggerType: "mould_change",
          triggerDetail: "Default mould changed",
        });
      } else if (
        existing.shellIngredientId !== product.shellIngredientId ||
        existing.shellPercentage !== product.shellPercentage
      ) {
        await computeAndSaveProductCostSnapshot({
          productId: product.id,
          triggerType: "shell_change",
          triggerDetail: existing.shellIngredientId !== product.shellIngredientId
            ? "Shell chocolate changed"
            : `Shell percentage changed to ${product.shellPercentage ?? 37}%`,
        });
      }
    }
    return product.id;
  }
  return db.products.add({ ...product, createdAt: now, updatedAt: now } as Product);
}

export async function deleteProduct(id: string) {
  await db.transaction("rw", [db.products, db.productFillings], async () => {
    await db.productFillings.where("productId").equals(id).delete();
    await db.products.delete(id);
  });
}

export async function duplicateProduct(productId: string, options: { duplicateFillings: boolean }): Promise<string> {
  return db.transaction("rw", [db.products, db.productFillings, db.fillings, db.fillingIngredients], async () => {
    const product = await db.products.get(productId);
    if (!product?.id) throw new Error("Product not found");

    const now = new Date();
    const { id: _id, createdAt: _createdAt, updatedAt: _updatedAt, archived: _archived, ...productData } = product;
    const newProductId = await db.products.add({
      ...productData,
      name: `${product.name} (copy)`,
      createdAt: now,
      updatedAt: now,
    } as Product) as string;

    const productLinks = await db.productFillings.where("productId").equals(productId).toArray();

    if (options.duplicateFillings) {
      // Duplicate each filling and link to new product
      for (const rl of productLinks) {
        const filling = await db.fillings.get(rl.fillingId);
        if (!filling?.id) continue;

        const { id: _fillingId, rootId: _rootId, version: _version, supersededAt: _supersededAt, versionNotes: _versionNotes, createdAt: _fillingCreatedAt, ...fillingData } = filling;
        const newFillingId = await db.fillings.add({
          ...fillingData,
          name: `${filling.name} (copy)`,
          createdAt: now,
        } as Filling) as string;

        // Copy filling ingredients
        const ingredients = await db.fillingIngredients.where("fillingId").equals(rl.fillingId).toArray();
        await Promise.all(
          ingredients.map((li) => {
            const { id: _liId, ...liData } = li;
            return db.fillingIngredients.add({ ...liData, fillingId: newFillingId } as FillingIngredient);
          })
        );

        // Link duplicated filling to new product
        const { id: _rlId, ...rlData } = rl;
        await db.productFillings.add({ ...rlData, productId: newProductId, fillingId: newFillingId } as ProductFilling);
      }
    } else {
      // Link existing fillings to new product
      await Promise.all(
        productLinks.map((rl) => {
          const { id: _rlId, ...rlData } = rl;
          return db.productFillings.add({ ...rlData, productId: newProductId } as ProductFilling);
        })
      );
    }

    return newProductId;
  });
}

// --- Fillings (standalone, reusable) ---

export function useFillings(includeArchived = false) {
  return useLiveQuery(() =>
    db.fillings.toArray().then((all) =>
      all.filter((l) => !l.supersededAt && (includeArchived || !l.archived))
        .sort((a, b) => a.name.localeCompare(b.name))
    ),
    [includeArchived]
  ) ?? [];
}

export function useAllFillingStatuses() {
  return useLiveQuery(async () => {
    const all = await db.fillings.toArray();
    return [...new Set(all.map((f) => f.status).filter(Boolean))] as string[];
  }) ?? [];
}

export function useFilling(id: string | undefined) {
  return useLiveQuery(
    () => (id ? db.fillings.get(id) : undefined),
    [id]
  );
}

export async function saveFilling(filling: Omit<Filling, "id"> & { id?: string }) {
  if (filling.id) {
    await db.fillings.update(filling.id, filling);
    return filling.id;
  }
  return db.fillings.add(filling as Filling);
}

export async function deleteFilling(id: string) {
  await db.transaction("rw", [db.fillings, db.fillingIngredients, db.productFillings, db.productFillingHistory], async () => {
    await db.fillingIngredients.where("fillingId").equals(id).delete();
    await db.productFillings.where("fillingId").equals(id).delete();
    await db.productFillingHistory.where("fillingId").equals(id).delete();
    await db.productFillingHistory.where("replacedByFillingId").equals(id).delete();
    await db.fillings.delete(id);
  });
}

export async function getOrphanedProductsOnFillingDelete(fillingId: string): Promise<Product[]> {
  const impact = await getFillingDeleteImpact(fillingId);
  return [...impact.soleFillingProducts];
}

export interface FillingDeleteImpact {
  soleFillingProducts: Product[];   // products where this is the only filling — will become empty
  multiFillingProducts: Product[];  // products with other fillings — will have fill % redistributed
}

export async function getFillingDeleteImpact(fillingId: string): Promise<FillingDeleteImpact> {
  const links = await db.productFillings.where("fillingId").equals(fillingId).toArray();
  const productIds = [...new Set(links.map((rl) => rl.productId))];
  if (productIds.length === 0) return { soleFillingProducts: [], multiFillingProducts: [] };

  const soleFillingProducts: Product[] = [];
  const multiFillingProducts: Product[] = [];

  for (const rid of productIds) {
    const product = await db.products.get(rid);
    if (!product || product.archived) continue;
    const fillingCount = await db.productFillings.where("productId").equals(rid).count();
    if (fillingCount <= 1) {
      soleFillingProducts.push(product);
    } else {
      multiFillingProducts.push(product);
    }
  }

  return {
    soleFillingProducts: soleFillingProducts.sort((a, b) => a.name.localeCompare(b.name)),
    multiFillingProducts: multiFillingProducts.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function deleteFillingWithCleanup(fillingId: string, options: { removeOrphanedProducts: boolean; archivableProductIds: string[] }): Promise<void> {
  // First, remove from multi-filling products (redistributes fill %)
  const links = await db.productFillings.where("fillingId").equals(fillingId).toArray();
  for (const rl of links) {
    const fillingCount = await db.productFillings.where("productId").equals(rl.productId).count();
    if (fillingCount > 1 && rl.id) {
      await removeFillingFromProduct(rl.id);
    }
  }

  // Archive produced products
  for (const productId of options.archivableProductIds) {
    await archiveProduct(productId);
  }

  // Delete orphaned unproduced products if requested
  if (options.removeOrphanedProducts) {
    const remainingLinks = await db.productFillings.where("fillingId").equals(fillingId).toArray();
    const orphanedProductIds = [...new Set(remainingLinks.map((rl) => rl.productId))];
    for (const productId of orphanedProductIds) {
      const fillingCount = await db.productFillings.where("productId").equals(productId).count();
      if (fillingCount <= 1) {
        await deleteProduct(productId);
      }
    }
  }

  // Finally delete the filling itself
  await deleteFilling(fillingId);
}

export async function hasProductBeenProduced(productId: string): Promise<boolean> {
  const count = await db.planProducts.where("productId").equals(productId).count();
  return count > 0;
}

export async function archiveProduct(id: string) {
  await db.products.update(id, { archived: true, updatedAt: new Date() });
}

export async function unarchiveProduct(id: string) {
  await db.products.update(id, { archived: undefined, updatedAt: new Date() });
}

export async function archiveFilling(id: string) {
  await db.fillings.update(id, { archived: true });
}

export interface FillingArchiveImpact {
  soleFillingProducts: Product[];   // products where this is the only filling — will become empty
  multiFillingProducts: Product[];  // products with other fillings — can remove & redistribute
  /** Fillings that have THIS filling listed as a nested component. When
   *  non-empty, archive is blocked: the user has to remove the nested-component
   *  edge from those host fillings first. Mirrors how products use the filling,
   *  but at one level up — leaving these dangling would break cost / nutrition /
   *  allergen aggregation on the host. */
  nestedInsideFillings: Filling[];
}

export async function getFillingArchiveImpact(fillingId: string): Promise<FillingArchiveImpact> {
  // Find every host filling that nests this one as a component. If any exist,
  // the archive is blocked — the user has to clean up those edges first.
  const incomingComponents = await db.fillingComponents.where("childFillingId").equals(fillingId).toArray();
  const nestedHostIds = [...new Set(incomingComponents.map((c) => c.fillingId))];
  const nestedHosts = (
    await Promise.all(nestedHostIds.map((id) => db.fillings.get(id)))
  ).filter((f): f is Filling => f != null && !f.archived);

  const productLinks = await db.productFillings.where("fillingId").equals(fillingId).toArray();
  if (productLinks.length === 0) {
    return {
      soleFillingProducts: [],
      multiFillingProducts: [],
      nestedInsideFillings: nestedHosts.sort((a, b) => a.name.localeCompare(b.name)),
    };
  }

  const productIds = [...new Set(productLinks.map((rl) => rl.productId))];
  const soleFillingProducts: Product[] = [];
  const multiFillingProducts: Product[] = [];

  for (const productId of productIds) {
    const product = await db.products.get(productId);
    if (!product || product.archived) continue;
    const fillingCount = await db.productFillings.where("productId").equals(productId).count();
    if (fillingCount <= 1) {
      soleFillingProducts.push(product);
    } else {
      multiFillingProducts.push(product);
    }
  }

  return {
    soleFillingProducts: soleFillingProducts.sort((a, b) => a.name.localeCompare(b.name)),
    multiFillingProducts: multiFillingProducts.sort((a, b) => a.name.localeCompare(b.name)),
    nestedInsideFillings: nestedHosts.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

/** Thrown by `archiveFillingWithCleanup` when the filling is still nested
 *  inside another filling. The UI surfaces this as a soft-block: the user
 *  has to remove the component edge on the host filling first. We chose to
 *  block (rather than silently cascade-remove) because mutating *other*
 *  fillings during an archive would be a surprising side-effect — host
 *  fillings depend on this one for cost / nutrition / allergens. */
export class FillingNestedInUseError extends Error {
  hosts: Filling[];
  constructor(hosts: Filling[]) {
    const names = hosts.map((h) => h.name).join(", ");
    super(`Filling is nested inside: ${names}. Remove it from those fillings first.`);
    this.name = "FillingNestedInUseError";
    this.hosts = hosts;
  }
}

export async function archiveFillingWithCleanup(
  fillingId: string,
  options: { archiveSoleProducts: boolean; removeFromMultiProducts: boolean }
): Promise<void> {
  // Block-on-nested: refuse to archive while any other filling has this one
  // as a component. The user sees the list of hosts on the impact panel and
  // can resolve them one by one before retrying.
  const impact = await getFillingArchiveImpact(fillingId);
  if (impact.nestedInsideFillings.length > 0) {
    throw new FillingNestedInUseError(impact.nestedInsideFillings);
  }

  const productLinks = await db.productFillings.where("fillingId").equals(fillingId).toArray();
  const productIds = [...new Set(productLinks.map((rl) => rl.productId))];

  // Handle sole-filling products
  if (options.archiveSoleProducts) {
    for (const productId of productIds) {
      const product = await db.products.get(productId);
      if (!product || product.archived) continue;
      const fillingCount = await db.productFillings.where("productId").equals(productId).count();
      if (fillingCount <= 1) {
        await archiveProduct(productId);
      }
    }
  }

  // Handle multi-filling products: remove the filling link and redistribute
  if (options.removeFromMultiProducts) {
    for (const rl of productLinks) {
      const product = await db.products.get(rl.productId);
      if (!product || product.archived) continue;
      const fillingCount = await db.productFillings.where("productId").equals(rl.productId).count();
      if (fillingCount > 1 && rl.id) {
        await removeFillingFromProduct(rl.id);
      }
    }
  }

  await archiveFilling(fillingId);
}

export async function unarchiveFilling(id: string) {
  await db.fillings.update(id, { archived: undefined });
}

export async function hasFillingBeenProduced(fillingId: string): Promise<boolean> {
  const productLinks = await db.productFillings.where("fillingId").equals(fillingId).toArray();
  if (productLinks.length === 0) return false;
  const productIds = [...new Set(productLinks.map((rl) => rl.productId))];
  for (const productId of productIds) {
    if (await hasProductBeenProduced(productId)) return true;
  }
  return false;
}

// --- Filling Categories ---

export function useFillingCategories(includeArchived = false) {
  return useLiveQuery(
    () => db.fillingCategories.orderBy("name").filter((c) => includeArchived || !c.archived).toArray(),
    [includeArchived],
  ) ?? [];
}

export function useFillingCategory(id: string | undefined) {
  return useLiveQuery(() => (id ? db.fillingCategories.get(id) : undefined), [id]);
}

/** Reactive Map<name, FillingCategory> for fast lookups by category name. */
export function useFillingCategoryMap() {
  return useLiveQuery(async () => {
    const all = await db.fillingCategories.toArray();
    return new Map(all.map((c) => [c.name, c]));
  }) ?? new Map<string, FillingCategory>();
}

/** Reactive Set of category names where shelfStable === true.
 *  Replaces the old hardcoded SHELF_STABLE_CATEGORIES constant. Falls back to
 *  the legacy constant when the categories table hasn't loaded yet (initial render). */
export function useShelfStableCategoryNames(): Set<string> {
  const result = useLiveQuery(async () => {
    const all = await db.fillingCategories.toArray();
    return new Set(all.filter((c) => c.shelfStable).map((c) => c.name));
  });
  if (result) return result;
  // Fallback for the brief moment before the live query resolves
  return new Set<string>(SHELF_STABLE_CATEGORIES as readonly string[]);
}

/** How many active fillings reference a given category by name. */
export function useFillingCategoryUsage(name: string | undefined) {
  return useLiveQuery(async () => {
    if (!name) return 0;
    return await db.fillings.where("category").equals(name).filter((f) => !f.archived).count();
  }, [name]) ?? 0;
}

export function useFillingCategoryUsageCounts() {
  return useLiveQuery(async () => {
    const all = await db.fillings.toArray();
    const counts = new Map<string, number>();
    for (const f of all) {
      if (f.archived) continue;
      counts.set(f.category, (counts.get(f.category) ?? 0) + 1);
    }
    return counts;
  }) ?? new Map<string, number>();
}

export async function saveFillingCategory(obj: Omit<FillingCategory, "id" | "createdAt" | "updatedAt"> & { id?: string; createdAt?: Date; updatedAt?: Date }): Promise<string> {
  const now = new Date();
  if (obj.id) {
    const existing = await db.fillingCategories.get(obj.id);
    const oldName = existing?.name;
    await db.fillingCategories.update(obj.id, { name: obj.name, shelfStable: obj.shelfStable, color: obj.color, archived: obj.archived, updatedAt: now });
    // Cascade rename to all fillings that reference the old name.
    if (oldName && oldName !== obj.name) {
      const affected = await db.fillings.where("category").equals(oldName).toArray();
      for (const f of affected) {
        if (f.id) await db.fillings.update(f.id, { category: obj.name });
      }
    }
    return obj.id;
  }
  return await db.fillingCategories.add({
    name: obj.name,
    shelfStable: obj.shelfStable,
    color: obj.color,
    archived: obj.archived,
    createdAt: now,
    updatedAt: now,
  } as FillingCategory) as string;
}

/** Refuses to delete a category that is still in use. Caller should check usage
 *  first and offer Archive instead. */
export async function deleteFillingCategory(id: string): Promise<void> {
  const cat = await db.fillingCategories.get(id);
  if (!cat) return;
  const usage = await db.fillings.where("category").equals(cat.name).count();
  if (usage > 0) {
    throw new Error(`Cannot delete category "${cat.name}" — ${usage} filling(s) still use it.`);
  }
  await db.fillingCategories.delete(id);
}

export async function archiveFillingCategory(id: string): Promise<void> {
  await db.fillingCategories.update(id, { archived: true, updatedAt: new Date() });
}

export async function unarchiveFillingCategory(id: string): Promise<void> {
  await db.fillingCategories.update(id, { archived: false, updatedAt: new Date() });
}

/** Idempotent — seeds any missing default filling categories. Transaction-
 *  wrapped so concurrent invocations (React StrictMode double-mount, SeedLoader
 *  racing importBackup's post-restore reconciliation, Dexie Cloud sync) can't
 *  each observe an empty table and independently insert the same names. */
export async function ensureDefaultFillingCategories(): Promise<void> {
  const { DEFAULT_FILLING_CATEGORIES } = await import("@/types");
  await db.transaction("rw", db.fillingCategories, async () => {
    const existing = await db.fillingCategories.toArray();
    const existingNames = new Set(existing.map((c) => c.name));
    const now = new Date();
    for (const cat of DEFAULT_FILLING_CATEGORIES) {
      if (existingNames.has(cat.name)) continue;
      await db.fillingCategories.add({
        name: cat.name,
        shelfStable: cat.shelfStable,
        color: cat.color,
        createdAt: now,
        updatedAt: now,
      } as FillingCategory);
      existingNames.add(cat.name);
    }
  });
}

// --- Filling versioning ---

export function useFillingVersionHistory(fillingId: string | undefined) {
  return useLiveQuery(async () => {
    if (!fillingId) return [];
    const filling = await db.fillings.get(fillingId);
    if (!filling) return [];
    if (!filling.rootId) return [filling];
    const versions = await db.fillings.where("rootId").equals(filling.rootId).toArray();
    return versions.sort((a, b) => (a.version ?? 1) - (b.version ?? 1));
  }, [fillingId]) ?? [];
}

export async function getFillingForkImpact(fillingId: string): Promise<{
  products: import("@/types").Product[];
  /** Host fillings that nest THIS filling as a component. Forking does NOT
   *  migrate the component edge — these hosts stay on the old version, so
   *  the panel surfaces the list as a heads-up. The user can refork those
   *  hosts manually if they want to upgrade. */
  nestedInsideFillings: Filling[];
}> {
  const productFillings = await db.productFillings.where("fillingId").equals(fillingId).toArray();
  const productIds = [...new Set(productFillings.map((rl) => rl.productId))];
  const products = productIds.length > 0
    ? (await Promise.all(productIds.map((id) => db.products.get(id)))).filter((r): r is Product => r !== undefined)
    : [];

  const incomingComponents = await db.fillingComponents.where("childFillingId").equals(fillingId).toArray();
  const nestedHostIds = [...new Set(incomingComponents.map((c) => c.fillingId))];
  const nestedHosts = (
    await Promise.all(nestedHostIds.map((id) => db.fillings.get(id)))
  ).filter((f): f is Filling => f != null && !f.archived);

  return {
    products: products.sort((a, b) => a.name.localeCompare(b.name)),
    nestedInsideFillings: nestedHosts.sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function forkFillingVersion(fillingId: string, versionNotes?: string): Promise<string> {
  return db.transaction("rw", [db.fillings, db.fillingIngredients, db.productFillings, db.productFillingHistory], async () => {
    const filling = await db.fillings.get(fillingId);
    if (!filling?.id) throw new Error("Filling not found");

    const now = new Date();
    const rootId = filling.rootId ?? filling.id;
    const currentVersion = filling.version ?? 1;

    await db.fillings.update(fillingId, { supersededAt: now, rootId });

    const { id: _id, ...fillingWithoutId } = filling;
    const newFillingId = await db.fillings.add({
      ...fillingWithoutId,
      rootId,
      version: currentVersion + 1,
      createdAt: now,
      supersededAt: undefined,
      versionNotes: versionNotes?.trim() || undefined,
      status: "testing",
    } as Filling) as string;

    const ingredients = await db.fillingIngredients.where("fillingId").equals(fillingId).toArray().then((rows) => rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)));
    await Promise.all(
      ingredients.map((li) => {
        const { id: _liId, ...liWithoutId } = li;
        return db.fillingIngredients.add({ ...liWithoutId, fillingId: newFillingId } as FillingIngredient);
      })
    );

    const affectedProductFillings = await db.productFillings.where("fillingId").equals(fillingId).toArray();
    await Promise.all(
      affectedProductFillings.map(async (rl) => {
        await db.productFillingHistory.add({
          productId: rl.productId,
          fillingId,
          replacedByFillingId: newFillingId,
          fillPercentage: rl.fillPercentage,
          sortOrder: rl.sortOrder,
          replacedAt: now,
        } as ProductFillingHistory);
        await db.productFillings.update(rl.id!, { fillingId: newFillingId });
      })
    );

    const affectedProductIds = [...new Set(affectedProductFillings.map((rl) => rl.productId))];

    return { newFillingId, affectedProductIds, fillingName: filling.name, newVersion: currentVersion + 1 };
  }).then(async ({ newFillingId, affectedProductIds, fillingName, newVersion }) => {
    await Promise.all(
      affectedProductIds.map((productId) =>
        computeAndSaveProductCostSnapshot({
          productId,
          triggerType: "filling_version",
          triggerDetail: `${fillingName} updated to v${newVersion}`,
        })
      )
    );
    return newFillingId;
  });
}

export async function duplicateFilling(fillingId: string): Promise<string> {
  return db.transaction("rw", [db.fillings, db.fillingIngredients], async () => {
    const filling = await db.fillings.get(fillingId);
    if (!filling?.id) throw new Error("Filling not found");

    const { id: _id, rootId: _rootId, version: _version, supersededAt: _supersededAt, versionNotes: _versionNotes, createdAt: _createdAt, ...fillingData } = filling;
    const newFillingId = await db.fillings.add({
      ...fillingData,
      name: `${filling.name} (copy)`,
      createdAt: new Date(),
    } as Filling) as string;

    // Copy ingredients
    const ingredients = await db.fillingIngredients.where("fillingId").equals(fillingId).toArray();
    await Promise.all(
      ingredients.map((li) => {
        const { id: _liId, ...liData } = li;
        return db.fillingIngredients.add({ ...liData, fillingId: newFillingId } as FillingIngredient);
      })
    );

    return newFillingId;
  });
}

export function useProductFillingHistory(productId: string | undefined) {
  return useLiveQuery(async () => {
    if (!productId) return [];
    const history = await db.productFillingHistory
      .where("productId").equals(productId)
      .toArray();
    history.sort((a, b) => new Date(b.replacedAt).getTime() - new Date(a.replacedAt).getTime());
    if (history.length === 0) return [];
    const fillingIds = [...new Set([
      ...history.map((h) => h.fillingId),
      ...history.map((h) => h.replacedByFillingId),
    ])];
    const fillings = (await Promise.all(fillingIds.map((id) => db.fillings.get(id)))).filter((l): l is Filling => l !== undefined);
    const fillingMap = new Map(fillings.map((l) => [l.id!, l]));
    return history.map((h) => ({
      ...h,
      oldFilling: fillingMap.get(h.fillingId),
      newFilling: fillingMap.get(h.replacedByFillingId),
    }));
  }, [productId]) ?? [];
}

// --- ProductFillings (join table: product <-> filling) ---

export function useProductFillings(productId: string | undefined) {
  return useLiveQuery(
    () =>
      productId
        ? db.productFillings.where("productId").equals(productId).toArray().then((rows) => rows.sort((a, b) => a.sortOrder - b.sortOrder))
        : [],
    [productId]
  ) ?? [];
}

function distributePercentages(ids: string[]): Record<string, number> {
  const n = ids.length;
  if (n === 0) return {};
  const base = Math.floor(100 / n);
  const remainder = 100 - base * n;
  const result: Record<string, number> = {};
  ids.forEach((id, i) => { result[id] = i === n - 1 ? base + remainder : base; });
  return result;
}

export async function addFillingToProduct(productId: string, fillingId: string) {
  const newId = await db.transaction("rw", db.productFillings, async () => {
    const existing = await db.productFillings.where("productId").equals(productId).toArray().then((rows) => rows.sort((a, b) => a.sortOrder - b.sortOrder));
    const maxOrder = existing.reduce((max, rl) => Math.max(max, rl.sortOrder), 0);
    const id = await db.productFillings.add({ productId, fillingId, sortOrder: maxOrder + 1, fillPercentage: 100 } as ProductFilling) as string;
    const allIds = [...existing.map((rl) => rl.id!), id];
    const dist = distributePercentages(allIds);
    await Promise.all(allIds.map((i) => db.productFillings.update(i, { fillPercentage: dist[i] })));
    return id;
  });
  await computeAndSaveProductCostSnapshot({ productId, triggerType: "manual", triggerDetail: "Filling added to product" });
  return newId;
}

export async function removeFillingFromProduct(productFillingId: string) {
  const rl = await db.productFillings.get(productFillingId);
  if (!rl) return;
  await db.transaction("rw", db.productFillings, async () => {
    await db.productFillings.delete(productFillingId);
    const remaining = await db.productFillings.where("productId").equals(rl.productId).toArray().then((rows) => rows.sort((a, b) => a.sortOrder - b.sortOrder));
    if (remaining.length > 0) {
      const dist = distributePercentages(remaining.map((r) => r.id!));
      await Promise.all(remaining.map((r) => db.productFillings.update(r.id!, { fillPercentage: dist[r.id!] })));
    }
  });
  await computeAndSaveProductCostSnapshot({ productId: rl.productId, triggerType: "manual", triggerDetail: "Filling removed from product" });
}

export async function updateProductFillingPercentage(productFillingId: string, fillPercentage: number) {
  await db.productFillings.update(productFillingId, { fillPercentage });
  const rl = await db.productFillings.get(productFillingId);
  if (rl) {
    await computeAndSaveProductCostSnapshot({ productId: rl.productId, triggerType: "manual", triggerDetail: "Fill percentage updated" });
  }
}

export async function updateProductFillingFraction(productFillingId: string, fillFraction: number) {
  await db.productFillings.update(productFillingId, { fillFraction });
  const rl = await db.productFillings.get(productFillingId);
  if (rl) {
    await computeAndSaveProductCostSnapshot({ productId: rl.productId, triggerType: "manual", triggerDetail: "Fill grams updated" });
  }
}

export async function reorderProductFillings(items: ProductFilling[]) {
  await db.transaction("rw", db.productFillings, async () => {
    await Promise.all(
      items.map((rl, i) => db.productFillings.update(rl.id!, { sortOrder: i }))
    );
  });
}

// --- Filling Ingredients ---

export function useFillingIngredients(fillingId: string | undefined) {
  return useLiveQuery(
    () =>
      fillingId
        ? db.fillingIngredients.where("fillingId").equals(fillingId).toArray().then((rows) => rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)))
        : [],
    [fillingId]
  ) ?? [];
}

export function useProductFillingsForProducts(productIds: string[]): Map<string, ProductFilling[]> {
  return useLiveQuery(async () => {
    if (productIds.length === 0) return new Map<string, ProductFilling[]>();
    const rows = (await Promise.all(productIds.map((id) => db.productFillings.where("productId").equals(id).toArray()))).flat().sort((a, b) => a.sortOrder - b.sortOrder);
    const map = new Map<string, ProductFilling[]>();
    for (const r of rows) {
      const arr = map.get(r.productId) ?? [];
      arr.push(r);
      map.set(r.productId, arr);
    }
    return map;
  }, [productIds.join(",")]) ?? new Map<string, ProductFilling[]>();
}

export function useFillingIngredientsForFillings(fillingIds: string[]): Map<string, FillingIngredient[]> {
  return useLiveQuery(async () => {
    if (fillingIds.length === 0) return new Map<string, FillingIngredient[]>();
    const rows = (await Promise.all(fillingIds.map((id) => db.fillingIngredients.where("fillingId").equals(id).toArray()))).flat().sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const map = new Map<string, FillingIngredient[]>();
    for (const r of rows) {
      const arr = map.get(r.fillingId) ?? [];
      arr.push(r);
      map.set(r.fillingId, arr);
    }
    return map;
  }, [fillingIds.join(",")]) ?? new Map<string, FillingIngredient[]>();
}

export async function saveFillingIngredient(li: Omit<FillingIngredient, "id"> & { id?: string }) {
  let savedId: string;
  if (li.id) {
    await db.fillingIngredients.update(li.id, li);
    savedId = li.id;
  } else {
    const existing = await db.fillingIngredients.where("fillingId").equals(li.fillingId).toArray();
    const maxOrder = existing.reduce((max, x) => Math.max(max, x.sortOrder ?? 0), -1);
    savedId = await db.fillingIngredients.add({ ...li, sortOrder: maxOrder + 1 } as FillingIngredient) as string;
  }
  await computeSnapshotsForFilling(li.fillingId, "manual", "Filling ingredient updated");
  return savedId;
}

export async function reorderFillingIngredients(items: FillingIngredient[]) {
  await db.transaction("rw", db.fillingIngredients, async () => {
    await Promise.all(
      items.map((li, i) => db.fillingIngredients.update(li.id!, { sortOrder: i }))
    );
  });
}

export async function deleteFillingIngredient(id: string) {
  const li = await db.fillingIngredients.get(id);
  await db.fillingIngredients.delete(id);
  if (li) {
    await computeSnapshotsForFilling(li.fillingId, "manual", "Filling ingredient removed");
  }
}

// --- Filling components (filling-in-filling) ---
//
// `FillingComponent` rows live in their own table, alongside (not inside)
// `fillingIngredients`. Cost / allergens / nutrition aggregation that wants
// to walk nested fillings reads both. The save mutator rejects any edge
// that would close a cycle.

export class FillingComponentCycleError extends Error {
  constructor() {
    super("Adding this filling would create a cycle");
    this.name = "FillingComponentCycleError";
  }
}

export function useFillingComponents(fillingId: string | undefined): FillingComponent[] {
  return useLiveQuery(
    () =>
      fillingId
        ? db.fillingComponents.where("fillingId").equals(fillingId).toArray().then((rows) => rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)))
        : [],
    [fillingId],
  ) ?? [];
}

/** Live query of every filling-component edge in the database. Used by the
 *  add-component picker to flag options that would close a cycle — cycle
 *  detection has to walk the whole graph, not just the host's direct rows.
 *  Also feeds the product-page cost / nutrition aggregations: those need to
 *  expand nested fillings recursively, so the map has to cover every host. */
export function useAllFillingComponents(): FillingComponent[] {
  return useLiveQuery(() => db.fillingComponents.toArray(), []) ?? [];
}

/** Returns the same shape as `useFillingIngredientsForFillings` but covers
 *  every filling in the database — needed when the caller will recursively
 *  walk through nested fillings whose ids it doesn't know up-front. */
export function useAllFillingIngredientsByFilling(): Map<string, FillingIngredient[]> {
  return useLiveQuery(async () => {
    const rows = await db.fillingIngredients.toArray();
    rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const map = new Map<string, FillingIngredient[]>();
    for (const r of rows) {
      const arr = map.get(r.fillingId);
      if (arr) arr.push(r);
      else map.set(r.fillingId, [r]);
    }
    return map;
  }, []) ?? new Map<string, FillingIngredient[]>();
}

/** Same shape as `useAllFillingIngredientsByFilling`, but for the
 *  filling-components table. Together these two cover every nesting level. */
export function useAllFillingComponentsByFilling(): Map<string, FillingComponent[]> {
  return useLiveQuery(async () => {
    const rows = await db.fillingComponents.toArray();
    rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const map = new Map<string, FillingComponent[]>();
    for (const r of rows) {
      const arr = map.get(r.fillingId);
      if (arr) arr.push(r);
      else map.set(r.fillingId, [r]);
    }
    return map;
  }, []) ?? new Map<string, FillingComponent[]>();
}

/** Insert or update a FillingComponent row, rejecting any change that would
 *  introduce a cycle. The cycle check + write happen inside one Dexie
 *  transaction so a concurrent write can't slip a closing edge in between.
 *  Cascades the host's allergens upward after the write completes — adding
 *  a child can introduce new leaf allergens, and ancestor fillings need to
 *  refresh their cached `allergens` array. */
export async function saveFillingComponent(
  c: Omit<FillingComponent, "id"> & { id?: string },
): Promise<string> {
  const savedId = await db.transaction("rw", db.fillingComponents, async () => {
    const all = await db.fillingComponents.toArray();
    // For an update, ignore the row's existing edge so re-saving is a no-op
    // for cycle purposes.
    const others = c.id ? all.filter((r) => r.id !== c.id) : all;
    if (wouldCreateCycle(buildChildMap(others), c.fillingId, c.childFillingId)) {
      throw new FillingComponentCycleError();
    }
    if (c.id) {
      await db.fillingComponents.update(c.id, c);
      return c.id;
    }
    const existing = all.filter((r) => r.fillingId === c.fillingId);
    const maxOrder = existing.reduce((max, x) => Math.max(max, x.sortOrder ?? 0), -1);
    const id = (await db.fillingComponents.add({
      ...c,
      sortOrder: maxOrder + 1,
    } as FillingComponent)) as string;
    return id;
  });
  await cascadeAllergensFromFilling(c.fillingId);
  // Snapshot every product that (transitively) uses this host — adding a
  // child changes ingredient mix and therefore cost.
  await computeSnapshotsForFilling(c.fillingId, "manual", "Filling component updated");
  return savedId;
}

export async function deleteFillingComponent(id: string): Promise<void> {
  // Capture the host id before the row is gone so we know whose allergens
  // and snapshots to recompute.
  const row = await db.fillingComponents.get(id);
  await db.fillingComponents.delete(id);
  if (row) {
    await cascadeAllergensFromFilling(row.fillingId);
    await computeSnapshotsForFilling(row.fillingId, "manual", "Filling component removed");
  }
}

// --- Moulds ---

export function useMoulds(includeArchived = false) {
  return useLiveQuery(() => db.moulds.toArray().then((all) =>
    all
      .filter((m) => includeArchived || !m.archived)
      .sort((a, b) => a.name.localeCompare(b.name))
  ), [includeArchived]) ?? [];
}

/** Photo-free variant of `useMoulds` for list/aggregation contexts.
 *  Returns `Mould[]` with `photo` runtime-stripped to avoid loading every
 *  mould's base64 photo into memory (and, under Dexie Cloud, over the wire)
 *  when only metadata is needed. Return type is kept as `Mould` so typed
 *  callers (e.g. `calculateFillingAmounts(..., moulds)`) stay compatible —
 *  but never read `.photo` from the result. */
export function useMouldsList(includeArchived = false): Mould[] {
  return useLiveQuery(() => db.moulds.toArray().then((all) =>
    all
      .filter((m) => includeArchived || !m.archived)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ photo: _photo, ...m }) => m as Mould)
  ), [includeArchived]) ?? [];
}

export function useMould(id: string | undefined) {
  return useLiveQuery(() => (id ? db.moulds.get(id) : undefined), [id]);
}

export async function saveMould(mould: Omit<Mould, "id"> & { id?: string }) {
  if (mould.id) {
    await db.moulds.update(mould.id, mould);
    return mould.id;
  }
  return db.moulds.add(mould as Mould);
}

export async function deleteMould(id: string) {
  await db.moulds.delete(id);
}

export async function archiveMould(id: string) {
  await db.moulds.update(id, { archived: true });
}

export async function unarchiveMould(id: string) {
  await db.moulds.update(id, { archived: undefined });
}

/** Returns true if the mould is referenced by any product or production plan. */
export async function isMouldInUse(id: string): Promise<boolean> {
  const productCount = await db.products.filter((p) => p.defaultMouldId === id).count();
  if (productCount > 0) return true;
  const planProductCount = await db.planProducts.filter((pp) => pp.mouldId === id).count();
  return planProductCount > 0;
}

/** Returns products that use this mould as their default (reactive). */
export function useMouldUsage(mouldId: string | undefined) {
  return useLiveQuery(async () => {
    if (!mouldId) return [];
    const products = await db.products.filter((p) => p.defaultMouldId === mouldId).toArray();
    return products.sort((a, b) => a.name.localeCompare(b.name));
  }, [mouldId]) ?? [];
}

// --- Production Plans ---

export function useProductionPlans() {
  return useLiveQuery(() => db.productionPlans.toArray().then((all) =>
    all.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  )) ?? [];
}

export function useProductionPlan(id: string | undefined) {
  return useLiveQuery(() => (id ? db.productionPlans.get(id) : undefined), [id]);
}

export async function generateBatchNumber(date: Date): Promise<string> {
  const dateStr = date.toISOString().slice(0, 10).replace(/-/g, "");
  const count = await db.productionPlans.count();
  const seq = String(count + 1).padStart(3, "0");
  return `${dateStr}-${seq}`;
}

export async function saveProductionPlan(plan: Omit<ProductionPlan, "id"> & { id?: string }): Promise<string> {
  const now = new Date();
  const completedAt = plan.status === "done"
    ? (plan.completedAt ?? now)
    : undefined;
  if (plan.id) {
    await db.productionPlans.update(plan.id, { ...plan, updatedAt: now, completedAt });
    return plan.id;
  }
  const batchNumber = plan.batchNumber ?? await generateBatchNumber(now);
  return db.productionPlans.add({ ...plan, batchNumber, createdAt: now, updatedAt: now, completedAt } as ProductionPlan) as Promise<string>;
}

export async function deleteProductionPlan(id: string) {
  await db.transaction("rw", [db.productionPlans, db.planProducts, db.planStepStatus], async () => {
    await db.planProducts.where("planId").equals(id).delete();
    await db.planStepStatus.where("planId").equals(id).delete();
    await db.productionPlans.delete(id);
  });
}

export async function setPlanProductStockStatus(id: string, status: "low" | "gone" | undefined) {
  await db.planProducts.update(id, { stockStatus: status });
}

/** Move pieces from `currentStock` to `frozenQty`. Captures the user-confirmed
 *  shelf-life (in days) to apply once the batch is defrosted. */
export async function freezePlanProduct(
  id: string,
  qty: number,
  preservedShelfLifeDays: number,
): Promise<void> {
  await db.transaction("rw", db.planProducts, db.moulds, async () => {
    const pb = await db.planProducts.get(id);
    if (!pb) return;
    const mould = pb.mouldId ? await db.moulds.get(pb.mouldId) : undefined;
    const planned = mould ? mould.numberOfCavities * pb.quantity : 0;
    const available = pb.currentStock ?? pb.actualYield ?? planned;
    const moving = Math.max(0, Math.min(Math.round(qty), available));
    if (moving <= 0) return;
    await db.planProducts.update(id, {
      currentStock: Math.max(0, available - moving),
      frozenQty: (pb.frozenQty ?? 0) + moving,
      frozenAt: Date.now(),
      preservedShelfLifeDays: Math.max(0, Math.round(preservedShelfLifeDays)),
    });
  });
}

/** Move pieces from `frozenQty` back to `currentStock` and stamp `defrostedAt`.
 *  Sell-by for the defrosted stock becomes `defrostedAt + preservedShelfLifeDays`. */
export async function defrostPlanProduct(id: string): Promise<void> {
  await db.transaction("rw", db.planProducts, async () => {
    const pb = await db.planProducts.get(id);
    if (!pb || !pb.frozenQty) return;
    const moving = pb.frozenQty;
    const base = pb.currentStock ?? pb.actualYield ?? 0;
    await db.planProducts.update(id, {
      currentStock: base + moving,
      frozenQty: 0,
      frozenAt: undefined,
      defrostedAt: Date.now(),
      // Clear the "gone" flag — defrosted pieces revive the batch.
      stockStatus: undefined,
    });
  });
}

/** Returns a map of productId → "low" | "gone" for products that should be prioritised
 *  in the production wizard.
 *
 *  Resolution:
 *   1. If the product has `lowStockThreshold` set → compare against the sum of
 *      `currentStock` (falling back to `actualYield`) across non-"gone" batches.
 *      0 → "gone", below threshold → "low".
 *   2. Otherwise fall back to the legacy per-batch `stockStatus` flag: "gone"
 *      only when all batches are gone, "low" when any is flagged low.
 */
export function useProductStockAlerts(): Map<string, "low" | "gone"> {
  return useLiveQuery(async () => {
    const donePlans = await db.productionPlans.where("status").equals("done").toArray();
    if (donePlans.length === 0) return new Map<string, "low" | "gone">();
    const planIds = donePlans.map((p) => p.id!);
    const [allBatches, allProducts] = await Promise.all([
      db.planProducts.where("planId").anyOf(planIds).toArray(),
      db.products.toArray(),
    ]);
    const productsById = new Map(allProducts.map((p) => [p.id!, p] as const));

    // Per-product aggregation. Frozen pieces (pb.frozenQty) do NOT count toward
    // available stock — they're in the freezer and unavailable until defrosted.
    type Agg = { total: number; anyInStock: boolean; legacyLow: boolean; allGone: boolean; hasBatches: boolean };
    const agg = new Map<string, Agg>();
    for (const pb of allBatches) {
      const a = agg.get(pb.productId) ?? { total: 0, anyInStock: false, legacyLow: false, allGone: true, hasBatches: false };
      a.hasBatches = true;
      if (pb.stockStatus === "gone") {
        // skip from total
      } else {
        const pieces = pb.currentStock ?? pb.actualYield ?? 0;
        if (pieces > 0) a.allGone = false;
        a.total += pieces;
        if (pb.stockStatus === "low") a.legacyLow = true;
        else if (pieces > 0) a.anyInStock = true;
      }
      agg.set(pb.productId, a);
    }

    const result = new Map<string, "low" | "gone">();
    for (const [productId, a] of agg) {
      if (!a.hasBatches) continue;
      const product = productsById.get(productId);
      const threshold = product?.lowStockThreshold;
      if (typeof threshold === "number" && threshold >= 0) {
        if (a.allGone || a.total <= 0) result.set(productId, "gone");
        else if (a.total < threshold) result.set(productId, "low");
      } else {
        if (a.allGone) result.set(productId, "gone");
        else if (a.legacyLow && !a.anyInStock) result.set(productId, "low");
        else if (a.legacyLow) result.set(productId, "low");
      }
    }
    return result;
  }) ?? new Map<string, "low" | "gone">();
}

/** Per-product aggregated stock totals for the stock page. Only includes products
 *  with at least one non-"gone" batch from a completed plan. */
export function useProductStockTotals(): Map<string, { currentStock: number; lastCountedAt?: number }> {
  return useLiveQuery(async () => {
    const donePlans = await db.productionPlans.where("status").equals("done").toArray();
    if (donePlans.length === 0) return new Map<string, { currentStock: number; lastCountedAt?: number }>();
    const planIds = donePlans.map((p) => p.id!);
    const [batches, products] = await Promise.all([
      db.planProducts.where("planId").anyOf(planIds).toArray(),
      db.products.toArray(),
    ]);
    const productsById = new Map(products.map((p) => [p.id!, p] as const));
    const result = new Map<string, { currentStock: number; lastCountedAt?: number }>();
    for (const pb of batches) {
      if (pb.stockStatus === "gone") continue;
      const pieces = pb.currentStock ?? pb.actualYield ?? 0;
      const existing = result.get(pb.productId);
      if (existing) existing.currentStock += pieces;
      else result.set(pb.productId, {
        currentStock: pieces,
        lastCountedAt: productsById.get(pb.productId)?.stockCountedAt,
      });
    }
    return result;
  }) ?? new Map<string, { currentStock: number; lastCountedAt?: number }>();
}

/** Reconcile a manual stock count: distribute the new total across in-stock batches
 *  FIFO (oldest first when deducting, newest when adding), stamp `stockCountedAt`
 *  on the product, and persist. */
export async function updateProductStockCount(productId: string, newTotal: number): Promise<void> {
  const { reconcileStockCount } = await import("./stockCount");
  await db.transaction("rw", [db.planProducts, db.productionPlans, db.products, db.moulds], async () => {
    const donePlans = await db.productionPlans.where("status").equals("done").toArray();
    const donePlanIds = new Set(donePlans.map((p) => p.id!));
    // Exclude batches that are entirely frozen — they carry no available stock
    // and the manual count reflects only what's on the shelf. A batch that still
    // has some available pieces (partial freeze) stays in the reconciler.
    const batches = (await db.planProducts.where("productId").equals(productId).toArray())
      .filter((pb) => {
        if (!donePlanIds.has(pb.planId)) return false;
        if (pb.stockStatus === "gone") return false;
        const available = pb.currentStock ?? pb.actualYield ?? 0;
        if (available <= 0 && (pb.frozenQty ?? 0) > 0) return false;
        return true;
      });

    // Build FIFO order using sellBefore (plan.completedAt + shelf life) fallback completedAt
    const product = await db.products.get(productId);
    const shelfWeeks = product?.shelfLifeWeeks ? parseFloat(product.shelfLifeWeeks) : NaN;
    const planById = new Map(donePlans.map((p) => [p.id!, p] as const));

    // Planned-yield fallback: when a batch has no currentStock / actualYield yet, use
    // mould.numberOfCavities × quantity (same fallback the stock list page uses for
    // the displayed piece count — the reconciler must see the same numbers).
    const mouldIds = Array.from(new Set(batches.map((pb) => pb.mouldId).filter(Boolean)));
    const moulds = mouldIds.length > 0 ? await db.moulds.where("id").anyOf(mouldIds).toArray() : [];
    const mouldById = new Map(moulds.map((m) => [m.id!, m] as const));

    const inputs = batches.map((pb) => {
      const plan = planById.get(pb.planId);
      const completedAt = plan?.completedAt ? new Date(plan.completedAt).getTime() : 0;
      const sellBefore = completedAt && !isNaN(shelfWeeks) && shelfWeeks > 0
        ? completedAt + Math.round((shelfWeeks - 1) * 7) * 24 * 60 * 60 * 1000
        : completedAt;
      const mould = mouldById.get(pb.mouldId);
      const planned = mould ? mould.numberOfCavities * pb.quantity : 0;
      return {
        id: pb.id!,
        currentStock: pb.currentStock ?? pb.actualYield ?? planned,
        fifoOrder: sellBefore,
      };
    });

    const deltas = reconcileStockCount(inputs, newTotal);
    for (const d of deltas) {
      const patch: Partial<PlanProduct> = { currentStock: d.nextStock };
      // A zeroed batch is effectively gone — drop it off the in-stock list so the
      // user doesn't see dead "0 pcs" rows. Any non-zero count clears the flag in
      // case the user is bumping a previously-gone batch back into circulation.
      if (d.nextStock <= 0) patch.stockStatus = "gone";
      else patch.stockStatus = undefined;
      await db.planProducts.update(d.id, patch);
    }
    await db.products.update(productId, { stockCountedAt: Date.now(), updatedAt: new Date() });
  });
}

export function useAllPlanProducts() {
  return useLiveQuery(() => db.planProducts.toArray()) ?? [];
}

export function usePlanProductsForProduct(productId: string | undefined) {
  return useLiveQuery(
    () => productId ? db.planProducts.where("productId").equals(productId).toArray() : [],
    [productId]
  ) ?? [];
}

export function usePlanProducts(planId: string | undefined) {
  return useLiveQuery(
    () => planId ? db.planProducts.where("planId").equals(planId).toArray().then((rows) => rows.sort((a, b) => a.sortOrder - b.sortOrder)) : [],
    [planId]
  ) ?? [];
}

/** Returns a map of productId → { lastProducedAt, inStock } for all products that have been in a completed plan. */
export function useProductProductionMap(): Map<string, { lastProducedAt: Date; inStock: boolean }> {
  return useLiveQuery(async () => {
    const donePlans = await db.productionPlans.where("status").equals("done").toArray();
    if (donePlans.length === 0) return new Map();
    const planCompletedAt = new Map<string, Date>(
      donePlans.map((p) => [p.id!, p.completedAt!])
    );
    const allProducts = await db.planProducts
      .where("planId")
      .anyOf(donePlans.map((p) => p.id!))
      .toArray();
    const result = new Map<string, { lastProducedAt: Date; inStock: boolean }>();
    for (const pb of allProducts) {
      const completedAt = planCompletedAt.get(pb.planId);
      if (!completedAt) continue;
      const existing = result.get(pb.productId);
      const isInStock = pb.stockStatus !== "gone";
      if (!existing) {
        result.set(pb.productId, { lastProducedAt: completedAt, inStock: isInStock });
      } else {
        result.set(pb.productId, {
          lastProducedAt: completedAt > existing.lastProducedAt ? completedAt : existing.lastProducedAt,
          inStock: existing.inStock || isInStock,
        });
      }
    }
    return result;
  }) ?? new Map();
}

export async function savePlanProduct(pb: Omit<PlanProduct, "id"> & { id?: string }): Promise<string> {
  if (pb.id) {
    await db.planProducts.update(pb.id, pb);
    return pb.id;
  }
  return db.planProducts.add(pb as PlanProduct) as Promise<string>;
}

// --- PlanFilling (standalone filling batches in a plan) ---

/** Live list of standalone filling batches for a plan, sorted by sortOrder. */
export function usePlanFillings(planId: string | undefined) {
  return useLiveQuery(
    () => planId
      ? db.planFillings.where("planId").equals(planId).toArray().then((rows) => rows.sort((a, b) => a.sortOrder - b.sortOrder))
      : [],
    [planId],
  ) ?? [];
}

export async function savePlanFilling(pf: Omit<PlanFilling, "id"> & { id?: string }): Promise<string> {
  if (pf.id) {
    await db.planFillings.update(pf.id, pf);
    return pf.id;
  }
  return db.planFillings.add(pf as PlanFilling) as Promise<string>;
}

export async function deletePlanFilling(id: string): Promise<void> {
  await db.planFillings.delete(id);
}

/** Bulk fetch — used by list/stats pages that aggregate across plans. */
export function useAllPlanFillings(): PlanFilling[] {
  return useLiveQuery(() => db.planFillings.toArray()) ?? [];
}

export function usePlanStepStatuses(planId: string | undefined) {
  return useLiveQuery(
    () => planId ? db.planStepStatus.where("planId").equals(planId).toArray() : [],
    [planId]
  ) ?? [];
}

/** Aggregate hook: every step status across every plan.
 *  Use on list pages (production history) so one query serves all rows instead
 *  of N per-plan live subscriptions. Consumer builds a `Map<planId, Set<stepKey>>`. */
export function useAllPlanStepStatuses(): PlanStepStatus[] {
  return useLiveQuery(() => db.planStepStatus.toArray()) ?? [];
}

export async function toggleStep(planId: string, stepKey: string, done: boolean) {
  const existing = await db.planStepStatus.where({ planId, stepKey }).first();
  if (existing) {
    await db.planStepStatus.update(existing.id!, { done, doneAt: done ? new Date() : undefined });
  } else {
    await db.planStepStatus.add({ planId, stepKey, done, doneAt: done ? new Date() : undefined } as PlanStepStatus);
  }
}

// --- User Preferences (synced across devices via Dexie Cloud) ---

const DEFAULT_PREFERENCES: Omit<UserPreferences, "id"> = {
  marketRegion: "EU",
  currency: "EUR",
  defaultFillMode: "percentage",
  facilityMayContain: [],
  coatings: [...DEFAULT_COATINGS],
  updatedAt: new Date(),
};

/** Read the single UserPreferences record, or return defaults if none exists yet. */
async function getPreferences(): Promise<UserPreferences> {
  const all = await db.userPreferences.toArray();
  return all[0] ?? { ...DEFAULT_PREFERENCES };
}

/** Update one or more fields on the preferences record, creating it if needed. */
async function updatePreference(patch: Partial<Omit<UserPreferences, "id">>): Promise<void> {
  const all = await db.userPreferences.toArray();
  const existing = all[0];
  if (existing?.id) {
    await db.userPreferences.update(existing.id, { ...patch, updatedAt: new Date() });
  } else {
    await db.userPreferences.add({ ...DEFAULT_PREFERENCES, ...patch, updatedAt: new Date() } as UserPreferences);
  }
}

export function useCoatings(): string[] {
  return useLiveQuery(async () => {
    const prefs = await getPreferences();
    return prefs.coatings;
  }) ?? [...DEFAULT_COATINGS];
}

export async function addCoating(coating: string): Promise<void> {
  const prefs = await getPreferences();
  if (!prefs.coatings.includes(coating)) {
    await updatePreference({ coatings: [...prefs.coatings, coating] });
  }
}

// --- Product Categories ---
//
// Replaces the legacy free-text `productType` string with a managed table. Each
// category configures the recommended shell-percentage range and default. The
// list is editable via the Categories tab on /products. Bar-like UI behaviour is
// implicit from the range — see lib/productCategories.ts for the helpers.

/** Idempotently ensure the default seeded categories (moulded + bar) exist.
 *  Called from the seed loader on every app load — no-ops once seeded. Fresh users
 *  hit this path because the v2 upgrade hook only runs for users coming from v1. */
/** Idempotent — seeds any missing default product categories. Transaction-
 *  wrapped so concurrent invocations can't both observe an empty table and
 *  independently insert the same names (see ensureDefaultShellDesigns). */
export async function ensureDefaultProductCategories(): Promise<void> {
  await db.transaction("rw", db.productCategories, async () => {
    const existing = await db.productCategories.toArray();
    const existingByLower = new Map<string, ProductCategory>();
    for (const c of existing) existingByLower.set(c.name.toLowerCase(), c);
    const now = new Date();

    const missing = DEFAULT_PRODUCT_CATEGORIES.filter(
      (seed) => !existingByLower.has(seed.name.toLowerCase()),
    );
    if (missing.length > 0) {
      await db.productCategories.bulkAdd(
        missing.map((seed) => ({
          name: seed.name,
          shellPercentMin: seed.shellPercentMin,
          shellPercentMax: seed.shellPercentMax,
          defaultShellPercent: seed.defaultShellPercent,
          shopKind: seed.shopKind,
          createdAt: now,
          updatedAt: now,
        } as ProductCategory)),
      );
    }

    // Backfill shopKind on existing seed rows that pre-date the field. Skips rows
    // the user may have customised (we only set kind when it's missing entirely).
    for (const seed of DEFAULT_PRODUCT_CATEGORIES) {
      const row = existingByLower.get(seed.name.toLowerCase());
      if (row?.id && !row.shopKind) {
        await db.productCategories.update(row.id, { shopKind: seed.shopKind, updatedAt: now });
      }
    }
  });
}

export function useProductCategories(includeArchived = false): ProductCategory[] {
  return useLiveQuery(
    () => db.productCategories.toArray().then((all) =>
      all.filter((c) => includeArchived || !c.archived)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    ),
    [includeArchived],
  ) ?? [];
}

export function useProductCategory(id: string | undefined) {
  return useLiveQuery(
    () => (id ? db.productCategories.get(id) : undefined),
    [id],
  );
}

/** Reactive map of categoryId → ProductCategory for fast lookup in lists. */
export function useProductCategoryMap(): Map<string, ProductCategory> {
  return useLiveQuery(async () => {
    const all = await db.productCategories.toArray();
    return new Map(all.map((c) => [c.id!, c]));
  }) ?? new Map();
}

export async function saveProductCategory(category: Omit<ProductCategory, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<string> {
  const validation = validateCategoryRange({
    shellPercentMin: category.shellPercentMin,
    shellPercentMax: category.shellPercentMax,
    defaultShellPercent: category.defaultShellPercent,
  });
  if (!validation.valid) {
    throw new Error(validation.errors.join("; "));
  }
  const now = new Date();
  if (category.id) {
    await db.productCategories.update(category.id, { ...category, updatedAt: now });
    return category.id;
  }
  return db.productCategories.add({ ...category, createdAt: now, updatedAt: now } as ProductCategory) as Promise<string>;
}

export async function archiveProductCategory(id: string): Promise<void> {
  await db.productCategories.update(id, { archived: true, updatedAt: new Date() });
}

export async function unarchiveProductCategory(id: string): Promise<void> {
  await db.productCategories.update(id, { archived: false, updatedAt: new Date() });
}

/** Hard-delete a category. Throws if any product still references it — callers
 *  must call useProductCategoryUsage() first and offer Archive instead. */
export async function deleteProductCategory(id: string): Promise<void> {
  const inUse = await db.products.where("productCategoryId").equals(id).count();
  if (inUse > 0) {
    throw new Error(`Cannot delete category: ${inUse} product(s) still reference it. Archive it instead.`);
  }
  await db.productCategories.delete(id);
}

/** Reactive list of products currently assigned to a category — used by the
 *  detail page to show "Used in" and to switch the delete button to Archive. */
export function useProductCategoryUsage(categoryId: string | undefined): Omit<Product, "photo">[] {
  return useLiveQuery(async () => {
    if (!categoryId) return [];
    const products = await db.products.where("productCategoryId").equals(categoryId).toArray();
    return products
      .filter((p) => !p.archived)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ photo: _photo, ...rest }) => rest);
  }, [categoryId]) ?? [];
}

/** Reactive map of categoryId → number of (non-archived) products using it.
 *  Used by the list page to show usage counts on each row. */
export function useProductCategoryUsageCounts(): Map<string, number> {
  return useLiveQuery(async () => {
    const products = await db.products.toArray();
    const counts = new Map<string, number>();
    for (const p of products) {
      if (p.archived) continue;
      const id = p.productCategoryId;
      if (!id) continue;
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return counts;
  }) ?? new Map();
}

// --- Ingredient categories ---

/** Idempotent — seeds any missing default ingredient categories. Transaction-
 *  wrapped so concurrent invocations can't both observe an empty table and
 *  independently insert the same names (see ensureDefaultShellDesigns). */
export async function ensureDefaultIngredientCategories(): Promise<void> {
  await db.transaction("rw", db.ingredientCategories, async () => {
    const existing = await db.ingredientCategories.toArray();
    const existingNames = new Set(existing.map((c) => c.name));
    const missing = DEFAULT_INGREDIENT_CATEGORIES.filter((seed) => !existingNames.has(seed.name));
    if (missing.length === 0) return;
    const now = new Date();
    await db.ingredientCategories.bulkAdd(
      missing.map((seed) => ({
        name: seed.name,
        createdAt: now,
        updatedAt: now,
      } as IngredientCategory)),
    );
  });
}

export function useIngredientCategories(includeArchived = false): IngredientCategory[] {
  return useLiveQuery(
    () => db.ingredientCategories.toArray().then((all) =>
      all.filter((c) => includeArchived || !c.archived)
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }))
    ),
    [includeArchived],
  ) ?? [];
}

export function useIngredientCategory(id: string | undefined) {
  return useLiveQuery(
    () => (id ? db.ingredientCategories.get(id) : undefined),
    [id],
  );
}

/** Reactive list of all ingredient category names (non-archived). Used by the ingredient
 *  form select dropdown and the list page grouping/filter. */
export function useIngredientCategoryNames(): string[] {
  return useLiveQuery(
    () => db.ingredientCategories.toArray().then((all) =>
      all.filter((c) => !c.archived)
        .map((c) => c.name)
        .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }))
    ),
  ) ?? [];
}

export async function saveIngredientCategory(category: Omit<IngredientCategory, "id" | "createdAt" | "updatedAt"> & { id?: string }): Promise<string> {
  const now = new Date();
  if (category.id) {
    // Detect rename — cascade to all ingredients using the old name
    const existing = await db.ingredientCategories.get(category.id);
    if (existing && existing.name !== category.name) {
      const affectedIngredients = await db.ingredients.where("category").equals(existing.name).toArray();
      await db.transaction("rw", [db.ingredientCategories, db.ingredients], async () => {
        await db.ingredientCategories.update(category.id!, { ...category, updatedAt: now });
        for (const ing of affectedIngredients) {
          if (ing.id) await db.ingredients.update(ing.id, { category: category.name });
        }
      });
    } else {
      await db.ingredientCategories.update(category.id, { ...category, updatedAt: now });
    }
    return category.id;
  }
  return db.ingredientCategories.add({ ...category, createdAt: now, updatedAt: now } as IngredientCategory) as Promise<string>;
}

export async function archiveIngredientCategory(id: string): Promise<void> {
  await db.ingredientCategories.update(id, { archived: true, updatedAt: new Date() });
}

export async function unarchiveIngredientCategory(id: string): Promise<void> {
  await db.ingredientCategories.update(id, { archived: false, updatedAt: new Date() });
}

/** Hard-delete an ingredient category. Throws if any ingredient still references it — callers
 *  must call useIngredientCategoryUsage() first and offer Archive instead.
 *  Also throws if attempting to delete the protected "Chocolate" category. */
export async function deleteIngredientCategory(id: string): Promise<void> {
  const cat = await db.ingredientCategories.get(id);
  if (cat?.name === "Chocolate") {
    throw new Error('The "Chocolate" category cannot be deleted — it is required for shell ingredient selection.');
  }
  const inUse = await db.ingredients.where("category").equals(cat?.name ?? "").count();
  if (inUse > 0) {
    throw new Error(`Cannot delete category: ${inUse} ingredient(s) still reference it. Archive it instead.`);
  }
  await db.ingredientCategories.delete(id);
}

/** Reactive list of (non-archived) ingredients currently assigned to a category by name. */
export function useIngredientCategoryUsage(categoryName: string | undefined): Omit<Ingredient, "photo">[] {
  return useLiveQuery(async () => {
    if (!categoryName) return [];
    const ingredients = await db.ingredients.where("category").equals(categoryName).toArray();
    return ingredients
      .filter((i) => !i.archived)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [categoryName]) ?? [];
}

/** Reactive map of category name → number of (non-archived) ingredients using it. */
export function useIngredientCategoryUsageCounts(): Map<string, number> {
  return useLiveQuery(async () => {
    const ingredients = await db.ingredients.toArray();
    const counts = new Map<string, number>();
    for (const ing of ingredients) {
      if (ing.archived) continue;
      const cat = ing.category;
      if (!cat) continue;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return counts;
  }) ?? new Map();
}

export function useMarketRegion(): MarketRegion {
  return useLiveQuery(async () => (await getPreferences()).marketRegion, [], "EU");
}

export async function setMarketRegion(region: MarketRegion): Promise<void> {
  await updatePreference({ marketRegion: region });
}

export function useCurrency(): CurrencyCode {
  return useLiveQuery(async () => (await getPreferences()).currency, [], "EUR");
}

export async function setCurrency(code: CurrencyCode): Promise<void> {
  await updatePreference({ currency: code });
}

/** Reactive currency symbol for use in UI components. Combines useCurrency + getCurrencySymbol. */
export function useCurrencySymbol(): string {
  const code = useCurrency();
  return getCurrencySymbol(code);
}

export function useDefaultFillMode(): FillMode {
  return useLiveQuery(async () => (await getPreferences()).defaultFillMode, [], "percentage");
}

export async function setDefaultFillMode(mode: FillMode): Promise<void> {
  await updatePreference({ defaultFillMode: mode });
}

export function useFacilityMayContain(): string[] {
  return useLiveQuery(async () => (await getPreferences()).facilityMayContain, [], []);
}

export async function setFacilityMayContain(allergens: string[]): Promise<void> {
  await updatePreference({ facilityMayContain: allergens });
}

/**
 * Reactive read of the last app version the user saw the "What's new" banner
 * for. `undefined` means they've never seen one (fresh install or pre-banner
 * user). `null` is the initial loading state before Dexie returns.
 */
export function useLastSeenVersion(): string | null | undefined {
  return useLiveQuery(async () => (await getPreferences()).lastSeenVersion ?? null, [], undefined);
}

export async function setLastSeenVersion(version: string): Promise<void> {
  await updatePreference({ lastSeenVersion: version });
}

// --- Filling usage (which products use a filling) ---

export function useFillingUsageCounts(): Map<string, number> {
  return useLiveQuery(async () => {
    const all = await db.productFillings.toArray();
    const counts = new Map<string, Set<string>>();
    for (const rl of all) {
      if (!counts.has(rl.fillingId)) counts.set(rl.fillingId, new Set());
      counts.get(rl.fillingId)!.add(rl.productId);
    }
    const result = new Map<string, number>();
    for (const [fillingId, productIds] of counts) result.set(fillingId, productIds.size);
    return result;
  }) ?? new Map();
}

export function useFillingUsage(fillingId: string | undefined) {
  return useLiveQuery(async () => {
    if (!fillingId) return [];
    const productFillings = await db.productFillings.where("fillingId").equals(fillingId).toArray();
    const productIds = [...new Set(productFillings.map((rl) => rl.productId))];
    if (productIds.length === 0) return [];
    const products = (await Promise.all(productIds.map((id) => db.products.get(id)))).filter((r): r is Product => r !== undefined);
    return products.sort((a, b) => a.name.localeCompare(b.name));
  }, [fillingId]) ?? [];
}

// --- Ingredient usage (which fillings + products use an ingredient) ---

export function useIngredientUsage(ingredientId: string | undefined) {
  return useLiveQuery(async () => {
    if (!ingredientId) return [];
    const lis = await db.fillingIngredients.where("ingredientId").equals(ingredientId).toArray();
    const fillingIds = [...new Set(lis.map((li) => li.fillingId))];
    if (fillingIds.length === 0) return [];

    const [fillings, productFillings] = await Promise.all([
      Promise.all(fillingIds.map((id) => db.fillings.get(id))).then((rs) => rs.filter((l): l is Filling => l !== undefined)),
      Promise.all(fillingIds.map((id) => db.productFillings.where("fillingId").equals(id).toArray())).then((rs) => rs.flat()),
    ]);

    const productIds = [...new Set(productFillings.map((rl) => rl.productId))];
    const products = productIds.length > 0
      ? (await Promise.all(productIds.map((id) => db.products.get(id)))).filter((r): r is Product => r !== undefined)
      : [];

    const productMap = new Map(products.map((r) => [r.id!, r]));

    return fillings.map((filling) => ({
      filling,
      products: productFillings
        .filter((rl) => rl.fillingId === filling.id)
        .map((rl) => productMap.get(rl.productId))
        .filter((r): r is NonNullable<typeof r> => r != null),
    }));
  }, [ingredientId]) ?? [];
}

// --- Ingredient Price History ---

export async function deleteIngredientPriceHistoryEntry(id: string): Promise<void> {
  await db.ingredientPriceHistory.delete(id);
}

export function useIngredientPriceHistory(ingredientId: string | undefined): IngredientPriceHistory[] {
  return useLiveQuery(async () => {
    if (!ingredientId) return [];
    const all = await db.ingredientPriceHistory.where("ingredientId").equals(ingredientId).toArray();
    return all.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
  }, [ingredientId]) ?? [];
}

async function saveIngredientPriceEntry(ingredientId: string, ingredient: Ingredient): Promise<void> {
  const cpg = deriveIngredientCostPerGram(ingredient);
  if (cpg === null) return;
  // Defence against duplicate rows from re-entrant saves (form double-submit,
  // concurrent code paths): if the newest entry already has identical pricing
  // fields, skip. The form's savingRef is the primary guard; this is backstop.
  const prior = await db.ingredientPriceHistory
    .where("ingredientId").equals(ingredientId).toArray();
  if (prior.length > 0) {
    prior.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
    const newest = prior[0];
    if (
      newest.purchaseCost === ingredient.purchaseCost &&
      newest.purchaseQty === ingredient.purchaseQty &&
      newest.purchaseUnit === ingredient.purchaseUnit &&
      newest.gramsPerUnit === ingredient.gramsPerUnit
    ) {
      return;
    }
  }
  await db.ingredientPriceHistory.add({
    ingredientId,
    costPerGram: cpg,
    recordedAt: new Date(),
    purchaseCost: ingredient.purchaseCost,
    purchaseQty: ingredient.purchaseQty,
    purchaseUnit: ingredient.purchaseUnit,
    gramsPerUnit: ingredient.gramsPerUnit,
  } as IngredientPriceHistory);
}

// --- Coating Chocolate Mappings ---

export function useCoatingChocolateMappings(): CoatingChocolateMapping[] {
  return useLiveQuery(() =>
    db.coatingChocolateMappings.toArray().then((all) =>
      all.sort((a, b) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime())
    )
  ) ?? [];
}

export function useCurrentCoatingMappings(): Map<string, CoatingChocolateMapping> {
  return useLiveQuery(async () => {
    const all = await db.coatingChocolateMappings.toArray();
    all.sort((a, b) => new Date(a.effectiveFrom).getTime() - new Date(b.effectiveFrom).getTime());
    const map = new Map<string, CoatingChocolateMapping>();
    for (const m of all) {
      map.set(m.coatingName, m);
    }
    return map;
  }) ?? new Map();
}

export async function deleteCoatingChocolateMapping(id: string): Promise<void> {
  await db.coatingChocolateMappings.delete(id);
}

/** Toggle seed-tempering flag on the current (latest) mapping for a coating without creating a new history entry. */
export async function updateCoatingTemperingFlag(coatingName: string, seedTempering: boolean): Promise<void> {
  const all = await db.coatingChocolateMappings.where("coatingName").equals(coatingName).toArray();
  if (all.length === 0) return;
  all.sort((a, b) => new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime());
  const current = all[0];
  await db.coatingChocolateMappings.update(current.id!, { seedTempering });
}

/** @deprecated Legacy coating mapping. Prefer setting Product.shellIngredientId directly. */
export async function saveCoatingChocolateMapping(coatingName: string, ingredientId: string, note?: string, effectiveFrom?: Date): Promise<void> {
  await db.coatingChocolateMappings.add({
    coatingName,
    ingredientId,
    effectiveFrom: effectiveFrom ?? new Date(),
    note,
  } as CoatingChocolateMapping);
  // Also back-fill shellIngredientId on affected products for forward compat
  const affectedProducts = await db.products.filter((r) => r.coating === coatingName).toArray();
  await Promise.all(
    affectedProducts.map(async (r) => {
      await db.products.update(r.id!, { shellIngredientId: ingredientId, updatedAt: new Date() });
      await computeAndSaveProductCostSnapshot({
        productId: r.id!,
        triggerType: "shell_change",
        triggerDetail: `Shell chocolate updated (from coating mapping for "${coatingName}")`,
      });
    })
  );
}

// --- Product Cost Snapshots ---

export function useProductCostSnapshots(productId: string | undefined): ProductCostSnapshot[] {
  return useLiveQuery(
    () => productId
      ? db.productCostSnapshots.where("productId").equals(productId).toArray().then((all) =>
          all.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime())
        )
      : [],
    [productId]
  ) ?? [];
}

export function useLatestProductCostSnapshot(productId: string | undefined): ProductCostSnapshot | undefined {
  return useLiveQuery(async () => {
    if (!productId) return undefined;
    const all = await db.productCostSnapshots.where("productId").equals(productId).toArray();
    if (all.length === 0) return undefined;
    return all.reduce((latest, snap) =>
      new Date(snap.recordedAt) > new Date(latest.recordedAt) ? snap : latest
    );
  }, [productId]);
}

export async function computeAndSaveProductCostSnapshot(params: {
  productId: string;
  triggerType: ProductCostSnapshot["triggerType"];
  triggerDetail: string;
}): Promise<void> {
  const { productId, triggerType, triggerDetail } = params;

  const [product, productFillings, allIngredients] = await Promise.all([
    db.products.get(productId),
    db.productFillings.where("productId").equals(productId).toArray(),
    db.ingredients.toArray(),
  ]);

  if (!product) return;

  const fillingIds = productFillings.map((rl) => rl.fillingId);
  // Read the full filling-ingredient and filling-component tables — the
  // recursive flattener inside `calculateProductCost` needs every nesting
  // level, not just the host fillings on this product. Both tables are tiny
  // in practice, and a single full scan is cheaper than per-id queries.
  const [fillings, allFillingIngredients, allFillingComponents] = await Promise.all([
    fillingIds.length > 0 ? Promise.all(fillingIds.map((id) => db.fillings.get(id))).then((rs) => rs.filter((l): l is Filling => l !== undefined)) : Promise.resolve([]),
    db.fillingIngredients.toArray(),
    db.fillingComponents.toArray(),
  ]);

  const fillingsMap = new Map(fillings.map((l) => [l.id!, l]));
  const fillingIngredientsMap = new Map<string, FillingIngredient[]>();
  for (const li of allFillingIngredients) {
    const arr = fillingIngredientsMap.get(li.fillingId);
    if (arr) arr.push(li);
    else fillingIngredientsMap.set(li.fillingId, [li]);
  }
  const fillingComponentsMap = new Map<string, FillingComponent[]>();
  for (const c of allFillingComponents) {
    const arr = fillingComponentsMap.get(c.fillingId);
    if (arr) arr.push(c);
    else fillingComponentsMap.set(c.fillingId, [c]);
  }

  const ingredientCostMap = buildIngredientCostMap(allIngredients);
  const ingredientMap = new Map(allIngredients.map((i) => [i.id!, i]));

  // Resolve the shell chocolate cost directly from the product's shellIngredientId
  const shellIngredientId = product.shellIngredientId;
  const shellCostPerGram = shellIngredientId ? (ingredientCostMap.get(shellIngredientId) ?? null) : null;
  const shellIngredient = shellIngredientId ? ingredientMap.get(shellIngredientId) : undefined;
  const shellPercentage = product.shellPercentage ?? 37;

  // User-initiated direct edits (changing shell chocolate, mould, or forking a
  // filling version) always refresh the cost — these are explicit changes to the
  // product itself, not ambient price drift.
  const isUserEdit = triggerType === "manual"
    || triggerType === "shell_change"
    || triggerType === "mould_change"
    || triggerType === "filling_version";

  // Gating for ambient drift (ingredient_price, coating_change) — we want a lean
  // snapshot history:
  //   1. Every ingredient must be priced (partial snapshots are noise).
  //   2. Always record the very first snapshot once pricing is complete — it powers the
  //      product's cost tab even before production.
  //   3. After that first snapshot, only keep recording automatically if the product has
  //      actually been produced. For unproduced products the user can still force a
  //      snapshot via manual recalc.
  if (!isUserEdit) {
    // Walk every host filling on the product and collect leaf ingredient ids
    // through nested fillings — a partial price gate based only on direct
    // ingredients would silently snapshot an incomplete cost.
    const usedIngredientIds = new Set<string>();
    for (const rl of productFillings) {
      for (const id of reachableIngredientIds(rl.fillingId, fillingIngredientsMap, fillingComponentsMap)) {
        usedIngredientIds.add(id);
      }
    }
    const allPriced = [...usedIngredientIds].every((id) => {
      const ing = ingredientMap.get(id);
      return ing && hasPricingData(ing);
    });
    const shellIngredientPriced = shellPercentage === 0 || !shellIngredientId || (shellIngredient ? hasPricingData(shellIngredient) : false);
    if (!allPriced || !shellIngredientPriced) return;

    const existingCount = await db.productCostSnapshots.where("productId").equals(productId).count();
    if (existingCount > 0 && !(await hasProductBeenProduced(productId))) return;
  }

  const mould = product.defaultMouldId ? await db.moulds.get(product.defaultMouldId) : undefined;

  // In grams mode, derive shell percentage from the fill fractions. The fractions
  // are mould-agnostic, so this is the same regardless of which mould we're costing
  // against — the shell ratio is the recipe spec.
  const fillMode = product.fillMode ?? "percentage";
  let effectiveShellPercentage = shellPercentage;
  if (fillMode === "grams" && mould) {
    const totalFillFraction = productFillings.reduce((sum, rl) => sum + (rl.fillFraction ?? 0), 0);
    effectiveShellPercentage = deriveShellPercentageFromFractions(totalFillFraction);
  }

  const { costPerProduct, breakdown } = calculateProductCost({
    mould: mould ?? null,
    productFillings,
    fillingIngredientsMap,
    fillingsMap,
    ingredientCostMap,
    shellChocolateCostPerGram: shellCostPerGram,
    shellChocolateLabel: shellIngredient?.name,
    shellPercentage: effectiveShellPercentage,
    fillMode,
    fillingComponentsMap,
  });

  // Dedupe: if the most recent snapshot for this product is byte-for-byte identical,
  // skip the write — nothing changed.
  const serializedBreakdown = serializeBreakdown(breakdown);
  const latest = await db.productCostSnapshots
    .where("productId").equals(productId)
    .reverse().sortBy("recordedAt");
  const mostRecent = latest[0];
  if (
    mostRecent &&
    mostRecent.costPerProduct === costPerProduct &&
    mostRecent.breakdown === serializedBreakdown &&
    mostRecent.mouldId === product.defaultMouldId &&
    mostRecent.coatingName === product.coating
  ) {
    return;
  }

  await db.productCostSnapshots.add({
    productId,
    costPerProduct,
    breakdown: serializedBreakdown,
    recordedAt: new Date(),
    triggerType,
    triggerDetail,
    mouldId: product.defaultMouldId,
    coatingName: product.coating,
  } as ProductCostSnapshot);
}

async function computeSnapshotsForFilling(
  fillingId: string,
  triggerType: ProductCostSnapshot["triggerType"],
  triggerDetail: string,
): Promise<void> {
  // Editing a filling reaches every product whose own host filling
  // (transitively) nests `fillingId`. Walk the parent edges of the
  // filling-component graph and snapshot all of them.
  const allComponents = await db.fillingComponents.toArray();
  const ancestors = ancestorFillingIds(buildParentMap(allComponents), fillingId);
  const productFillings = (
    await Promise.all([...ancestors].map((id) => db.productFillings.where("fillingId").equals(id).toArray()))
  ).flat();
  const productIds = [...new Set(productFillings.map((rl) => rl.productId))];
  await Promise.all(
    productIds.map((productId) => computeAndSaveProductCostSnapshot({ productId, triggerType, triggerDetail }))
  );
}

async function computeSnapshotsForAffectedProducts(
  ingredientId: string,
  triggerType: ProductCostSnapshot["triggerType"],
  triggerDetail: string,
): Promise<void> {
  const productIds = new Set<string>();

  // Products affected via filling ingredients — direct or via nesting.
  // First find every filling whose own ingredient list mentions this id, then
  // expand to ancestors so a product whose host filling nests an affected
  // child still gets a fresh snapshot.
  const lis = await db.fillingIngredients.where("ingredientId").equals(ingredientId).toArray();
  const directFillingIds = [...new Set(lis.map((li) => li.fillingId))];
  if (directFillingIds.length > 0) {
    const allComponents = await db.fillingComponents.toArray();
    const parentMap = buildParentMap(allComponents);
    const reachableFillingIds = new Set<string>();
    for (const fid of directFillingIds) {
      for (const ancestor of ancestorFillingIds(parentMap, fid)) reachableFillingIds.add(ancestor);
    }
    const productFillings = (
      await Promise.all([...reachableFillingIds].map((id) => db.productFillings.where("fillingId").equals(id).toArray()))
    ).flat();
    for (const rl of productFillings) productIds.add(rl.productId);
  }

  // Products affected via shell ingredient (direct FK on product)
  const shellProducts = await db.products.where("shellIngredientId").equals(ingredientId).toArray();
  for (const p of shellProducts) if (p.id) productIds.add(p.id);

  if (productIds.size === 0) return;
  await Promise.all(
    [...productIds].map((productId) => computeAndSaveProductCostSnapshot({ productId, triggerType, triggerDetail }))
  );
}

export async function recalculateProductCost(productId: string): Promise<void> {
  await computeAndSaveProductCostSnapshot({ productId, triggerType: "manual", triggerDetail: "Manual recalculation" });
}

export async function clearAllProductCostSnapshots(): Promise<number> {
  const count = await db.productCostSnapshots.count();
  await db.productCostSnapshots.clear();
  return count;
}


// --- Allergen aggregation ---

/**
 * Aggregate the allergens for a single filling, walking through any nested
 * filling components recursively. The result is the sorted union of leaf
 * ingredient allergens reachable from this filling.
 *
 * Reads two tables (`fillingIngredients`, `fillingComponents`) and one ID set
 * from `ingredients`. The recursion is defended against malformed cycles via
 * `reachableIngredientIds`'s `seen` set, but real cycles can't appear in
 * production — `saveFillingComponent` rejects them.
 */
export async function aggregateFillingAllergens(fillingId: string): Promise<string[]> {
  const [allLis, allComponents] = await Promise.all([
    db.fillingIngredients.toArray(),
    db.fillingComponents.toArray(),
  ]);
  const lisByFilling = new Map<string, FillingIngredient[]>();
  for (const li of allLis) {
    const arr = lisByFilling.get(li.fillingId);
    if (arr) arr.push(li);
    else lisByFilling.set(li.fillingId, [li]);
  }
  const componentsByFilling = new Map<string, FillingComponent[]>();
  for (const c of allComponents) {
    const arr = componentsByFilling.get(c.fillingId);
    if (arr) arr.push(c);
    else componentsByFilling.set(c.fillingId, [c]);
  }
  const ingredientIds = reachableIngredientIds(fillingId, lisByFilling, componentsByFilling);
  if (ingredientIds.size === 0) return [];
  const ingredients = (
    await Promise.all([...ingredientIds].map((id) => db.ingredients.get(id)))
  ).filter((i): i is Ingredient => i !== undefined);
  const allergenSet = new Set<string>();
  for (const ing of ingredients) for (const a of ing.allergens) allergenSet.add(a);
  return Array.from(allergenSet).sort();
}

export async function updateFillingAllergens(fillingId: string) {
  const allergens = await aggregateFillingAllergens(fillingId);
  await db.fillings.update(fillingId, { allergens });
}

/**
 * When a filling's ingredients or components change, every filling that
 * (transitively) nests it may also need its cached `allergens` array
 * refreshed. Walks the `fillingComponents` parent edges from `fillingId` up,
 * and runs `updateFillingAllergens` on every ancestor (including the source
 * filling itself).
 *
 * Single read of the full component table — typically tiny (< a few hundred
 * rows), so the cost is fine. The set of ancestors per leaf is small in
 * practice (most fillings have at most 1-2 hosts), so the parallel updates
 * stay cheap.
 */
export async function cascadeAllergensFromFilling(fillingId: string): Promise<void> {
  const allComponents = await db.fillingComponents.toArray();
  const parentMap = buildParentMap(allComponents);
  const ancestors = ancestorFillingIds(parentMap, fillingId);
  await Promise.all([...ancestors].map((id) => updateFillingAllergens(id)));
}

// --- Lab (Experiments) ---

export function useExperiments() {
  return useLiveQuery(() => db.experiments.toArray().then((all) =>
    all
      .filter((e) => !e.supersededAt)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  )) ?? [];
}

export function useExperiment(id: string | undefined) {
  return useLiveQuery(
    () => (id ? db.experiments.get(id) : undefined),
    [id]
  );
}

export async function saveExperiment(experiment: Omit<Experiment, "id"> & { id?: string }) {
  const now = new Date();
  if (experiment.id) {
    await db.experiments.update(experiment.id, { ...experiment, updatedAt: now });
    return experiment.id;
  }
  return db.experiments.add({ ...experiment, createdAt: now, updatedAt: now } as Experiment) as Promise<string>;
}

export async function deleteExperiment(id: string) {
  await db.transaction("rw", [db.experiments, db.experimentIngredients], async () => {
    await db.experimentIngredients.where("experimentId").equals(id).delete();
    await db.experiments.delete(id);
  });
}

export function useExperimentIngredients(experimentId: string | undefined) {
  return useLiveQuery(
    () => experimentId
      ? db.experimentIngredients.where("experimentId").equals(experimentId).toArray().then((rows) => rows.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)))
      : Promise.resolve([] as ExperimentIngredient[]),
    [experimentId]
  ) ?? [];
}

export async function saveExperimentIngredient(ei: Omit<ExperimentIngredient, "id"> & { id?: string }) {
  if (ei.id) {
    await db.experimentIngredients.update(ei.id, ei);
    return ei.id;
  }
  return db.experimentIngredients.add(ei as ExperimentIngredient) as Promise<string>;
}

export async function deleteExperimentIngredient(id: string) {
  await db.experimentIngredients.delete(id);
}

export async function forkExperimentVersion(experimentId: string): Promise<string> {
  return db.transaction("rw", [db.experiments, db.experimentIngredients], async () => {
    const old = await db.experiments.get(experimentId);
    if (!old) throw new Error("Experiment not found");
    const now = new Date();
    const rootId = old.rootId ?? old.id!;
    const all = await db.experiments.toArray();
    const chain = all.filter((e) => e.id === rootId || e.rootId === rootId);
    const maxVersion = Math.max(...chain.map((e) => e.version ?? 1));
    await db.experiments.update(experimentId, { supersededAt: now, updatedAt: now });
    const newExp: Omit<Experiment, "id"> = {
      name: old.name,
      ganacheType: old.ganacheType,
      applicationType: old.applicationType,
      rootId,
      version: maxVersion + 1,
      createdAt: now,
      updatedAt: now,
    };
    const newId = await db.experiments.add(newExp as Experiment) as string;
    const ingredients = await db.experimentIngredients.where("experimentId").equals(experimentId).toArray();
    await Promise.all(
      ingredients.map((ei) =>
        db.experimentIngredients.add({
          experimentId: newId,
          ingredientId: ei.ingredientId,
          amount: ei.amount,
          sortOrder: ei.sortOrder,
        } as ExperimentIngredient)
      )
    );
    return newId;
  });
}

// --- Packaging ---

export function usePackagingList(includeArchived = false) {
  return useLiveQuery(() => db.packaging.orderBy("name").toArray().then((all) =>
    all.filter((p) => includeArchived || !p.archived)
  ), [includeArchived]) ?? [];
}

export function usePackaging(id: string | undefined) {
  return useLiveQuery(() => (id ? db.packaging.get(id) : undefined), [id]);
}

export function usePackagingOrders(packagingId: string | undefined) {
  return useLiveQuery(
    () => packagingId
      ? db.packagingOrders.where("packagingId").equals(packagingId).toArray()
          .then((orders) => orders.sort((a, b) =>
            new Date(b.orderedAt).getTime() - new Date(a.orderedAt).getTime()
          ))
      : Promise.resolve([] as PackagingOrder[]),
    [packagingId]
  ) ?? [];
}

export function useAllPackagingOrders() {
  return useLiveQuery(() => db.packagingOrders.toArray()) ?? [];
}

export function useAllPackagingSuppliers() {
  return useLiveQuery(async () => {
    const orders = await db.packagingOrders.toArray();
    return [...new Set(orders.map((o) => o.supplier).filter(Boolean))] as string[];
  }) ?? [];
}

export async function savePackaging(obj: Omit<Packaging, "id"> & { id?: string }): Promise<string> {
  const now = new Date();
  if (obj.id) {
    await db.packaging.update(obj.id, { ...obj, updatedAt: now });
    return obj.id;
  }
  return db.packaging.add({ ...obj, createdAt: now, updatedAt: now } as Packaging) as Promise<string>;
}

export async function deletePackaging(id: string): Promise<void> {
  await db.packagingOrders.where("packagingId").equals(id).delete();
  await db.packaging.delete(id);
}

export async function archivePackaging(id: string): Promise<void> {
  await db.packaging.update(id, { archived: true, updatedAt: new Date() });
}

export async function unarchivePackaging(id: string): Promise<void> {
  await db.packaging.update(id, { archived: undefined, updatedAt: new Date() });
}

/** Returns true if the packaging is referenced by any collection. */
export async function isPackagingInUse(id: string): Promise<boolean> {
  const count = await db.collectionPackagings.filter((cp) => cp.packagingId === id).count();
  return count > 0;
}

export async function savePackagingOrder(obj: Omit<PackagingOrder, "id"> & { id?: string }): Promise<string> {
  if (obj.id) {
    await db.packagingOrders.update(obj.id, obj);
    return obj.id;
  }
  return db.packagingOrders.add(obj as PackagingOrder) as Promise<string>;
}

export async function deletePackagingOrder(id: string): Promise<void> {
  await db.packagingOrders.delete(id);
}

// --- Shopping list ---

export async function setIngredientLowStock(id: string, lowStock: boolean): Promise<void> {
  if (lowStock) {
    await db.ingredients.update(id, { lowStock: true, lowStockSince: Date.now(), lowStockOrdered: false });
  } else {
    await db.ingredients.update(id, { lowStock: false, lowStockSince: undefined, lowStockOrdered: false, outOfStock: false });
  }
}

export async function setIngredientOutOfStock(id: string, outOfStock: boolean): Promise<void> {
  if (outOfStock) {
    await db.ingredients.update(id, { outOfStock: true, lowStock: true, lowStockSince: Date.now(), lowStockOrdered: false });
  } else {
    await db.ingredients.update(id, { outOfStock: false, lowStock: false, lowStockSince: undefined, lowStockOrdered: false });
  }
}

export async function markIngredientOrdered(id: string): Promise<void> {
  await db.ingredients.update(id, { lowStockOrdered: true });
}

export async function unorderIngredient(id: string): Promise<void> {
  await db.ingredients.update(id, { lowStockOrdered: false });
}

export async function setPackagingLowStock(id: string, lowStock: boolean): Promise<void> {
  if (lowStock) {
    await db.packaging.update(id, { lowStock: true, lowStockSince: Date.now(), lowStockOrdered: false });
  } else {
    await db.packaging.update(id, { lowStock: false, lowStockSince: undefined, lowStockOrdered: false });
  }
}

export async function setPackagingOutOfStock(id: string, outOfStock: boolean): Promise<void> {
  if (outOfStock) {
    await db.packaging.update(id, { outOfStock: true, lowStock: true, lowStockSince: Date.now(), lowStockOrdered: false });
  } else {
    await db.packaging.update(id, { outOfStock: false });
  }
}

export async function markPackagingOrdered(id: string): Promise<void> {
  await db.packaging.update(id, { lowStockOrdered: true });
}

export async function unorderPackaging(id: string): Promise<void> {
  await db.packaging.update(id, { lowStockOrdered: false });
}

// --- Decoration Materials ---

export function useDecorationMaterials(includeArchived = false) {
  return useLiveQuery(
    () => db.decorationMaterials.orderBy("name").filter((m) => includeArchived || !m.archived).toArray(),
    [includeArchived],
  ) ?? [];
}

export function useDecorationMaterial(id: string | undefined) {
  return useLiveQuery(() => (id ? db.decorationMaterials.get(id) : undefined), [id]);
}

export function useDecorationMaterialUsage(materialId: string | undefined) {
  return useLiveQuery(async () => {
    if (!materialId) return [];
    const products = await db.products
      .filter((r) => (r.shellDesign ?? []).some((step) => step.materialIds?.includes(materialId)))
      .toArray();
    return products.sort((a, b) => a.name.localeCompare(b.name));
  }, [materialId]) ?? [];
}

/**
 * Aggregate product-usage counts across all decoration materials in one pass.
 * Use on list pages instead of calling useDecorationMaterialUsage once per row.
 */
export function useDecorationMaterialUsageCounts() {
  return useLiveQuery(async () => {
    const products = await db.products.toArray();
    const counts = new Map<string, number>();
    for (const p of products) {
      if (p.archived) continue;
      const seen = new Set<string>();
      for (const step of p.shellDesign ?? []) {
        for (const mid of step.materialIds ?? []) {
          if (seen.has(mid)) continue;
          seen.add(mid);
          counts.set(mid, (counts.get(mid) ?? 0) + 1);
        }
      }
    }
    return counts;
  }) ?? new Map<string, number>();
}

export function useAllDecorationManufacturers() {
  return useLiveQuery(async () => {
    const all = await db.decorationMaterials.toArray();
    return [...new Set(all.map((m) => m.manufacturer).filter(Boolean))] as string[];
  }) ?? [];
}

export function useAllDecorationSources() {
  return useLiveQuery(async () => {
    const all = await db.decorationMaterials.toArray();
    return [...new Set(all.map((m) => m.source).filter(Boolean))] as string[];
  }) ?? [];
}

export function useAllDecorationVendors() {
  return useLiveQuery(async () => {
    const all = await db.decorationMaterials.toArray();
    return [...new Set(all.map((m) => m.vendor).filter(Boolean))] as string[];
  }) ?? [];
}

export async function saveDecorationMaterial(obj: Omit<DecorationMaterial, "id"> & { id?: string }): Promise<string> {
  const now = new Date();
  if (obj.id) {
    await db.decorationMaterials.update(obj.id, { ...obj, updatedAt: now });
    return obj.id;
  }
  return await db.decorationMaterials.add({ ...obj, createdAt: now, updatedAt: now } as DecorationMaterial) as string;
}

export async function deleteDecorationMaterial(id: string): Promise<void> {
  await db.decorationMaterials.delete(id);
}

export async function archiveDecorationMaterial(id: string): Promise<void> {
  await db.decorationMaterials.update(id, { archived: true, updatedAt: new Date() });
}

export async function unarchiveDecorationMaterial(id: string): Promise<void> {
  await db.decorationMaterials.update(id, { archived: false, updatedAt: new Date() });
}

export async function setDecorationMaterialLowStock(id: string, lowStock: boolean): Promise<void> {
  if (lowStock) {
    await db.decorationMaterials.update(id, { lowStock: true, lowStockSince: Date.now(), lowStockOrdered: false });
  } else {
    await db.decorationMaterials.update(id, { lowStock: false, lowStockSince: undefined, lowStockOrdered: false });
  }
}

export async function setDecorationMaterialOutOfStock(id: string, outOfStock: boolean): Promise<void> {
  if (outOfStock) {
    await db.decorationMaterials.update(id, { outOfStock: true, lowStock: true, lowStockSince: Date.now(), lowStockOrdered: false });
  } else {
    await db.decorationMaterials.update(id, { outOfStock: false });
  }
}

export async function markDecorationMaterialOrdered(id: string): Promise<void> {
  await db.decorationMaterials.update(id, { lowStockOrdered: true });
}

export async function unorderDecorationMaterial(id: string): Promise<void> {
  await db.decorationMaterials.update(id, { lowStockOrdered: false });
}

// --- Decoration Categories ---

export function useDecorationCategories(includeArchived = false) {
  return useLiveQuery(
    () => db.decorationCategories.orderBy("name").filter((c) => includeArchived || !c.archived).toArray(),
    [includeArchived],
  ) ?? [];
}

export function useDecorationCategory(id: string | undefined) {
  return useLiveQuery(() => (id ? db.decorationCategories.get(id) : undefined), [id]);
}

/** Returns a reactive Map<slug, DecorationCategory> for fast lookups by slug. */
export function useDecorationCategoryMap() {
  return useLiveQuery(async () => {
    const all = await db.decorationCategories.toArray();
    return new Map(all.map((c) => [c.slug, c]));
  }) ?? new Map<string, DecorationCategory>();
}

/** Returns a reactive Map<slug, label> for display — replaces the old DECORATION_MATERIAL_TYPE_LABELS constant. */
export function useDecorationCategoryLabels() {
  return useLiveQuery(async () => {
    const all = await db.decorationCategories.filter((c) => !c.archived).toArray();
    return new Map(all.map((c) => [c.slug, c.name]));
  }) ?? new Map<string, string>();
}

/** Count of materials per category slug. */
export function useDecorationCategoryUsageCounts() {
  return useLiveQuery(async () => {
    const all = await db.decorationMaterials.toArray();
    const counts = new Map<string, number>();
    for (const m of all) {
      if (m.archived) continue;
      counts.set(m.type, (counts.get(m.type) ?? 0) + 1);
    }
    return counts;
  }) ?? new Map<string, number>();
}

export async function saveDecorationCategory(obj: Omit<DecorationCategory, "id"> & { id?: string }): Promise<string> {
  const now = new Date();
  if (obj.id) {
    await db.decorationCategories.update(obj.id, { ...obj, updatedAt: now });
    return obj.id;
  }
  return await db.decorationCategories.add({ ...obj, createdAt: now, updatedAt: now } as DecorationCategory) as string;
}

export async function deleteDecorationCategory(id: string): Promise<void> {
  await db.decorationCategories.delete(id);
}

export async function archiveDecorationCategory(id: string): Promise<void> {
  await db.decorationCategories.update(id, { archived: true, updatedAt: new Date() });
}

export async function unarchiveDecorationCategory(id: string): Promise<void> {
  await db.decorationCategories.update(id, { archived: false, updatedAt: new Date() });
}

/** Idempotent — seeds default decoration categories if the table is empty.
 *  Transaction-wrapped so concurrent invocations can't double-seed (see the
 *  comment on ensureDefaultShellDesigns for the full rationale). */
export async function ensureDefaultDecorationCategories(): Promise<void> {
  const { DEFAULT_DECORATION_CATEGORIES } = await import("@/types");
  await db.transaction("rw", db.decorationCategories, async () => {
    const existing = await db.decorationCategories.toArray();
    const existingSlugs = new Set(existing.map((c) => c.slug));
    const now = new Date();
    for (const cat of DEFAULT_DECORATION_CATEGORIES) {
      if (existingSlugs.has(cat.slug)) continue;
      await db.decorationCategories.add({
        name: cat.name,
        slug: cat.slug,
        createdAt: now,
        updatedAt: now,
      } as DecorationCategory);
      existingSlugs.add(cat.slug);
    }
  });
}

// --- Shell Designs ---

export function useShellDesigns(includeArchived = false) {
  return useLiveQuery(
    () => db.shellDesigns.orderBy("name").filter((d) => includeArchived || !d.archived).toArray(),
    [includeArchived],
  ) ?? [];
}

export function useShellDesign(id: string | undefined) {
  return useLiveQuery(() => (id ? db.shellDesigns.get(id) : undefined), [id]);
}

/** Returns products that use this design technique in their shellDesign steps. */
export function useShellDesignUsage(designName: string | undefined) {
  return useLiveQuery(async () => {
    if (!designName) return [];
    const products = await db.products
      .filter((r) => (r.shellDesign ?? []).some((step) => step.technique === designName))
      .toArray();
    return products.sort((a, b) => a.name.localeCompare(b.name));
  }, [designName]) ?? [];
}

export async function saveShellDesign(obj: Omit<ShellDesign, "id"> & { id?: string }): Promise<string> {
  const now = new Date();
  if (obj.id) {
    await db.shellDesigns.update(obj.id, { ...obj, updatedAt: now });
    return obj.id;
  }
  return await db.shellDesigns.add({ ...obj, createdAt: now, updatedAt: now } as ShellDesign) as string;
}

export async function deleteShellDesign(id: string): Promise<void> {
  await db.shellDesigns.delete(id);
}

export async function archiveShellDesign(id: string): Promise<void> {
  await db.shellDesigns.update(id, { archived: true, updatedAt: new Date() });
}

export async function unarchiveShellDesign(id: string): Promise<void> {
  await db.shellDesigns.update(id, { archived: false, updatedAt: new Date() });
}

/** Idempotent — seeds default shell designs if the table is empty. */
/** Idempotent — seeds any missing default shell designs. The read + every insert
 *  runs inside a single Dexie transaction so two concurrent invocations (React
 *  StrictMode double-mount, SeedLoader racing with importBackup's post-restore
 *  reconciliation, Dexie Cloud sync retry) can't each observe an empty table
 *  and independently insert the same names, which is what caused duplicate
 *  "Airbrushing" / "Brushing" etc. entries on the designs page. */
export async function ensureDefaultShellDesigns(): Promise<void> {
  const { DEFAULT_SHELL_DESIGNS } = await import("@/types");
  await db.transaction("rw", db.shellDesigns, async () => {
    const existing = await db.shellDesigns.toArray();
    const existingNames = new Set(existing.map((d) => d.name));
    const now = new Date();
    for (const design of DEFAULT_SHELL_DESIGNS) {
      if (existingNames.has(design.name)) continue;
      await db.shellDesigns.add({
        name: design.name,
        defaultApplyAt: design.defaultApplyAt,
        createdAt: now,
        updatedAt: now,
      } as ShellDesign);
      existingNames.add(design.name);
    }
  });
}

// --- Collections ---

export function useCollections() {
  return useLiveQuery(() =>
    db.collections.orderBy("startDate").reverse().toArray()
  ) ?? [];
}

export function useCollection(id: string | undefined) {
  return useLiveQuery(() => (id ? db.collections.get(id) : undefined), [id]);
}

export async function saveCollection(obj: Omit<Collection, "id"> & { id?: string }): Promise<string> {
  const now = new Date();
  if (obj.id) {
    await db.collections.update(obj.id, { ...obj, updatedAt: now });
    return obj.id;
  }
  return db.collections.add({ ...obj, createdAt: now, updatedAt: now } as Collection) as Promise<string>;
}

export async function deleteCollection(id: string): Promise<void> {
  await db.transaction("rw", [db.collections, db.collectionProducts, db.collectionPackagings], async () => {
    await db.collectionProducts.where("collectionId").equals(id).delete();
    await db.collectionPackagings.where("collectionId").equals(id).delete();
    await db.collections.delete(id);
  });
}

export function useAllCollectionProducts() {
  return useLiveQuery(() => db.collectionProducts.toArray()) ?? [];
}

export function useCollectionProducts(collectionId: string | undefined) {
  return useLiveQuery(
    () => collectionId
      ? db.collectionProducts.where("collectionId").equals(collectionId).toArray()
          .then((rows) => rows.sort((a, b) => a.sortOrder - b.sortOrder))
      : Promise.resolve([] as CollectionProduct[]),
    [collectionId]
  ) ?? [];
}

export async function addProductToCollection(collectionId: string, productId: string): Promise<void> {
  const existing = await db.collectionProducts.where("collectionId").equals(collectionId).toArray();
  if (existing.some((r) => r.productId === productId)) return;
  const maxSort = existing.reduce((m, r) => Math.max(m, r.sortOrder), -1);
  await db.collectionProducts.add({ collectionId, productId, sortOrder: maxSort + 1 } as CollectionProduct);
}

export async function removeProductFromCollection(id: string): Promise<void> {
  await db.collectionProducts.delete(id);
}

// --- Collection Packagings (box pricing) ---

export function useCollectionPackagings(collectionId: string | undefined) {
  return useLiveQuery(
    () => collectionId
      ? db.collectionPackagings.where("collectionId").equals(collectionId).toArray()
      : Promise.resolve([] as CollectionPackaging[]),
    [collectionId]
  ) ?? [];
}

export function useAllCollectionPackagings() {
  return useLiveQuery(() => db.collectionPackagings.toArray()) ?? [];
}

export async function saveCollectionPackaging(obj: Omit<CollectionPackaging, "id"> & { id?: string }): Promise<string> {
  const now = new Date();
  if (obj.id) {
    await db.collectionPackagings.update(obj.id, { ...obj, updatedAt: now });
    return obj.id;
  }
  return db.collectionPackagings.add({ ...obj, createdAt: now, updatedAt: now } as CollectionPackaging) as Promise<string>;
}

export async function deleteCollectionPackaging(id: string): Promise<void> {
  await db.collectionPackagings.delete(id);
}

// --- Collection Pricing Snapshots (margin history) ---

/** All pricing snapshots for a collection, newest-first */
export function useCollectionPricingSnapshots(collectionId: string | undefined) {
  return useLiveQuery(
    async () => {
      if (!collectionId) return [] as CollectionPricingSnapshot[];
      const all = await db.collectionPricingSnapshots
        .where("collectionId").equals(collectionId).toArray();
      return all.sort((a, b) => new Date(b.recordedAt).getTime() - new Date(a.recordedAt).getTime());
    },
    [collectionId]
  ) ?? [];
}

export async function saveCollectionPricingSnapshot(
  obj: Omit<CollectionPricingSnapshot, "id"> & { id?: string }
): Promise<string> {
  if (obj.id) {
    await db.collectionPricingSnapshots.update(obj.id, obj);
    return obj.id;
  }
  return db.collectionPricingSnapshots.add(obj as CollectionPricingSnapshot) as Promise<string>;
}

export function useShoppingItems() {
  return useLiveQuery(() => db.shoppingItems.toArray()) ?? [];
}

/** Count of items pending ordering (for nav badge) */
export function usePendingShoppingCount(): number {
  return useLiveQuery(async () => {
    const [ingCount, pkgCount, decoCount, itemCount] = await Promise.all([
      db.ingredients.filter((i) => !!i.lowStock && !i.lowStockOrdered && !i.archived).count(),
      db.packaging.filter((p) => !!p.lowStock && !p.lowStockOrdered && !p.archived).count(),
      db.decorationMaterials.filter((m) => !!m.lowStock && !m.lowStockOrdered && !m.archived).count(),
      db.shoppingItems.filter((s) => !s.orderedAt).count(),
    ]);
    return ingCount + pkgCount + decoCount + itemCount;
  }) ?? 0;
}

export async function saveShoppingItem(obj: Omit<ShoppingItem, "id"> & { id?: string }): Promise<string> {
  if (obj.id) {
    await db.shoppingItems.update(obj.id, obj);
    return obj.id;
  }
  return db.shoppingItems.add(obj as ShoppingItem) as Promise<string>;
}

export async function markShoppingItemOrdered(id: string): Promise<void> {
  await db.shoppingItems.update(id, { orderedAt: Date.now() });
}

export async function deleteShoppingItem(id: string): Promise<void> {
  await db.shoppingItems.delete(id);
}

// --- Filling Stock (leftover filling) ---

/** All filling stock entries with remaining > 0 */
export function useFillingStockItems() {
  return useLiveQuery(() => db.fillingStock.toArray().then((items) => items.filter((s) => s.remainingG > 0)), [], []);
}

/** All filling stock entries for a specific filling with remaining > 0 */
export function useFillingStockForFilling(fillingId: string | undefined) {
  return useLiveQuery(
    () => fillingId ? db.fillingStock.where("fillingId").equals(fillingId).toArray().then((items) => items.filter((s) => s.remainingG > 0)) : [],
    [fillingId],
    [],
  );
}

export async function saveFillingStock(obj: Omit<FillingStock, "id"> & { id?: string }): Promise<string> {
  if (obj.id) {
    await db.fillingStock.update(obj.id, obj);
    return obj.id;
  }
  return db.fillingStock.add(obj as FillingStock) as Promise<string>;
}

/** Update the remaining grams on a filling stock entry */
export async function adjustFillingStock(id: string, remainingG: number): Promise<void> {
  await db.fillingStock.update(id, { remainingG: Math.max(0, remainingG) });
}

/** Zero out a filling stock entry (discard) */
export async function discardFillingStock(id: string): Promise<void> {
  await db.fillingStock.update(id, { remainingG: 0 });
}

/** Mark a filling stock entry as frozen. When `qty` is less than the entry's
 *  remainingG, the row is split: `qty` grams are frozen and the rest stays
 *  available in a new row. Captures the remaining shelf life (days) to apply
 *  when defrosted — user-editable in the freeze modal. */
export async function freezeFillingStock(
  id: string,
  preservedShelfLifeDays: number,
  qty?: number,
): Promise<void> {
  await db.transaction("rw", db.fillingStock, async () => {
    const entry = await db.fillingStock.get(id);
    if (!entry) return;
    const total = entry.remainingG;
    const freezeQty = qty == null ? total : Math.max(0, Math.min(Math.round(qty), total));
    if (freezeQty <= 0) return;
    const days = Math.max(0, Math.round(preservedShelfLifeDays));
    if (freezeQty >= total) {
      await db.fillingStock.update(id, {
        frozen: true,
        frozenAt: Date.now(),
        preservedShelfLifeDays: days,
      });
    } else {
      // Split: current row becomes the frozen portion; leftover goes into a new row.
      await db.fillingStock.update(id, {
        remainingG: freezeQty,
        frozen: true,
        frozenAt: Date.now(),
        preservedShelfLifeDays: days,
      });
      await db.fillingStock.add({
        fillingId: entry.fillingId,
        remainingG: Math.round((total - freezeQty) * 10) / 10,
        planId: entry.planId,
        madeAt: entry.madeAt,
        notes: entry.notes,
        createdAt: Date.now(),
      } as FillingStock);
    }
  });
}

/** Defrost a filling stock entry. Sets defrostedAt so freshness is computed from
 *  that point with the captured preservedShelfLifeDays. */
export async function defrostFillingStock(id: string): Promise<void> {
  await db.fillingStock.update(id, {
    frozen: false,
    frozenAt: undefined,
    defrostedAt: Date.now(),
  });
}

/** Deduct grams from filling stock for a given filling, oldest-first (FIFO). Returns total deducted.
 *  When `includeFrozen` is true, available (non-frozen) rows are consumed first; any
 *  remaining need then pulls from frozen rows (oldest first), and any frozen row that
 *  is touched is implicitly defrosted (frozen → false, defrostedAt stamped). */
export async function deductFillingStock(
  fillingId: string,
  gramsNeeded: number,
  options?: { includeFrozen?: boolean },
): Promise<number> {
  const entries = await db.fillingStock.where("fillingId").equals(fillingId).toArray();
  const sortByMadeAt = (a: FillingStock, b: FillingStock) =>
    new Date(a.madeAt).getTime() - new Date(b.madeAt).getTime();
  const available = entries.filter((e) => e.remainingG > 0 && !e.frozen).sort(sortByMadeAt);
  const frozen = options?.includeFrozen
    ? entries.filter((e) => e.remainingG > 0 && e.frozen).sort(sortByMadeAt)
    : [];

  let remaining = gramsNeeded;
  let totalDeducted = 0;

  for (const entry of available) {
    if (remaining <= 0) break;
    const deduct = Math.min(entry.remainingG, remaining);
    await db.fillingStock.update(entry.id!, { remainingG: Math.round((entry.remainingG - deduct) * 10) / 10 });
    remaining -= deduct;
    totalDeducted += deduct;
  }

  for (const entry of frozen) {
    if (remaining <= 0) break;
    const deduct = Math.min(entry.remainingG, remaining);
    // Touching a frozen row defrosts the whole row — you can't refreeze the rest.
    await db.fillingStock.update(entry.id!, {
      remainingG: Math.round((entry.remainingG - deduct) * 10) / 10,
      frozen: false,
      frozenAt: undefined,
      defrostedAt: Date.now(),
    });
    remaining -= deduct;
    totalDeducted += deduct;
  }

  return totalDeducted;
}

// --- Shop sales ---

/** Live map of decorationMaterial.id → color. The Shop uses this to derive
 *  each product's shop display colour from its shell design. Archived
 *  materials are kept in the map (renaming/archiving a material shouldn't
 *  erase the visual identity of every bonbon that referenced it). */
export function useDecorationMaterialColorMap(): Map<string, string | undefined> {
  return useLiveQuery(async () => {
    const all = await db.decorationMaterials.toArray();
    const m = new Map<string, string | undefined>();
    for (const dm of all) if (dm.id) m.set(dm.id, dm.color);
    return m;
  }, []) ?? new Map<string, string | undefined>();
}

/** Shop-focused products view:
 *    - `products`: non-archived product rows stripped of `photo` (photos
 *      aren't used anywhere in the Shop per the product's decision).
 *    - `viewById`: productId → { name, color, kind } ready to hand to a Shop
 *      component. Colour is resolved explicit → derived → hashed; kind comes
 *      from the product's category (`ProductCategory.shopKind`), defaulting
 *      to "moulded" when the category is missing or has no shopKind set.
 *
 *  Fires on writes to `products`, `decorationMaterials`, or `productCategories`;
 *  the merge is cheap because the maps are small. */
export function useShopProducts(): {
  products: Omit<Product, "photo">[];
  viewById: Map<string, ShopProductInfo>;
} {
  return useLiveQuery(async () => {
    const [productsAll, materialsAll, categoriesAll] = await Promise.all([
      db.products.toArray(),
      db.decorationMaterials.toArray(),
      db.productCategories.toArray(),
    ]);
    const materialColorById = new Map<string, string | undefined>();
    for (const dm of materialsAll) if (dm.id) materialColorById.set(dm.id, dm.color);

    const kindByCategoryId = new Map<string, ShopKind>();
    for (const c of categoriesAll) {
      if (c.id && c.shopKind) kindByCategoryId.set(c.id, c.shopKind);
    }

    const products = productsAll
      .filter((p) => !p.archived)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(({ photo: _photo, ...rest }) => rest);

    const viewById = new Map<string, ShopProductInfo>();
    for (const p of products) {
      if (!p.id) continue;
      const kind = (p.productCategoryId && kindByCategoryId.get(p.productCategoryId)) || DEFAULT_SHOP_KIND;
      viewById.set(p.id, {
        id: p.id,
        name: p.name,
        color: resolveShopColor(p, materialColorById),
        kind,
      });
    }
    return { products, viewById };
  }, []) ?? { products: [], viewById: new Map<string, ShopProductInfo>() };
}

export function useAllSales(): Sale[] {
  return useLiveQuery(() => db.sales.toArray(), []) ?? [];
}

export function useSale(id: string | undefined) {
  return useLiveQuery(() => (id ? db.sales.get(id) : undefined), [id]);
}

export function usePreparedSales(): Sale[] {
  return useLiveQuery(
    () => db.sales.where("status").equals("prepared").toArray().then((s) =>
      s.sort((a, b) => new Date(b.preparedAt).getTime() - new Date(a.preparedAt).getTime())
    ),
    [],
  ) ?? [];
}

export function useRecentSoldSales(limit = 10): Sale[] {
  return useLiveQuery(
    () => db.sales.where("status").equals("sold").toArray().then((s) =>
      s
        .sort((a, b) => {
          const at = a.soldAt ? new Date(a.soldAt).getTime() : 0;
          const bt = b.soldAt ? new Date(b.soldAt).getTime() : 0;
          return bt - at;
        })
        .slice(0, limit)
    ),
    [limit],
  ) ?? [];
}

/** Landing-page KPIs derived from the full sales list plus `Date.now()`.
 *  Returns an empty-KPI object on first render (before the live query resolves)
 *  so callers can render unconditionally without a loading branch. */
export function useShopKpis(): ShopKpis {
  const sales = useAllSales();
  return computeShopKpis(sales, new Date()) ?? EMPTY_SHOP_KPIS;
}

/** Aggregated signals for the /today dashboard — in-progress batches,
 *  expiring stock, low-stock products, and a 7-day shop-revenue window.
 *  Backed by the same live queries used elsewhere; derivation lives in
 *  `lib/todaySignals.ts`. */
export function useTodaySignals(): TodaySignals {
  const planProducts = useAllPlanProducts();
  const plans = useProductionPlans();
  const products = useProductsList();
  const pendingShoppingCount = usePendingShoppingCount();
  const sales = useAllSales();

  const productMap = new Map<string, TodayProductInfo>();
  for (const p of products) {
    if (p.id) {
      productMap.set(p.id, {
        id: p.id,
        name: p.name,
        lowStockThreshold: p.lowStockThreshold,
        shelfLifeWeeks: p.shelfLifeWeeks,
      });
    }
  }

  return computeTodaySignals({
    now: new Date(),
    planProducts,
    plans,
    products: productMap,
    pendingShoppingCount,
    sales,
  });
}

/** Available stock per product (live), derived from completed production plans.
 *  Identical aggregation to `useProductStockTotals` but returns a plain
 *  productId → pieces map (no lastCountedAt metadata). Frozen pieces are
 *  excluded. */
export function useProductStockMap(): Map<string, number> {
  return useLiveQuery(async () => {
    const donePlans = await db.productionPlans.where("status").equals("done").toArray();
    if (donePlans.length === 0) return new Map<string, number>();
    const planIds = donePlans.map((p) => p.id!);
    const batches = await db.planProducts.where("planId").anyOf(planIds).toArray();
    const m = new Map<string, number>();
    for (const pb of batches) {
      if (pb.stockStatus === "gone") continue;
      const pieces = pb.currentStock ?? pb.actualYield ?? 0;
      if (pieces <= 0) continue;
      m.set(pb.productId, (m.get(pb.productId) ?? 0) + pieces);
    }
    return m;
  }, []) ?? new Map<string, number>();
}

/** Commit one or more identical boxes as "prepared". Each copy inserts a
 *  Sale row; stock is decremented once for the full aggregate (cells × qty)
 *  across done-plan batches (FIFO). All-or-nothing via a Dexie transaction.
 *
 *  Throws when available stock can't cover `cells × quantity` for any
 *  product — callers should pre-check against `maxPrepareQuantity`. */
export async function saveSaleAsPrepared(input: {
  collectionId: string;
  packagingId: string;
  cells: (string | null)[];
  price: number;
  customerNote?: string;
  /** How many identical copies to prepare. Defaults to 1. Values < 1 are
   *  treated as 1 (the UI already clamps, but defend the invariant here). */
  quantity?: number;
}): Promise<string[]> {
  const quantity = Math.max(1, Math.floor(input.quantity ?? 1));

  return db.transaction("rw", [db.sales, db.planProducts, db.productionPlans], async () => {
    const donePlans = await db.productionPlans.where("status").equals("done").toArray();
    const planFifoOrder = new Map<string, number>();
    for (const plan of donePlans) {
      if (!plan.id) continue;
      planFifoOrder.set(plan.id, new Date(plan.completedAt ?? plan.createdAt).getTime());
    }
    const planIds = [...planFifoOrder.keys()];
    const rawBatches = planIds.length > 0
      ? await db.planProducts.where("planId").anyOf(planIds).toArray()
      : [];

    const batches: SaleStockBatch[] = rawBatches
      .filter((pb) => pb.id)
      .map((pb) => ({
        id: pb.id!,
        productId: pb.productId,
        currentStock: pb.currentStock,
        actualYield: pb.actualYield,
        stockStatus: pb.stockStatus,
        fifoOrder: planFifoOrder.get(pb.planId) ?? 0,
      }));

    // Scale per-cavity usage by quantity before decrementing.
    const perBoxUsage = tallyCells(input.cells);
    const scaledUsage = new Map<string, number>();
    for (const [pid, n] of perBoxUsage) scaledUsage.set(pid, n * quantity);

    // Pre-check feasibility per product so we fail before any write rather
    // than silently clamping to 0 stock.
    for (const [pid, need] of scaledUsage) {
      const avail = batches
        .filter((b) => b.productId === pid && b.stockStatus !== "gone")
        .reduce((s, b) => s + Math.max(0, b.currentStock ?? b.actualYield ?? 0), 0);
      if (avail < need) {
        throw new Error(
          `Not enough stock: need ${need} of product ${pid} for ${quantity} box${quantity !== 1 ? "es" : ""}, only ${avail} available`,
        );
      }
    }

    const deltas = computeCommitStockDeltas(batches, scaledUsage);
    for (const d of deltas) {
      await db.planProducts.update(d.id, { currentStock: d.nextStock });
    }

    const ids: string[] = [];
    // Insert `quantity` identical Sale rows. preparedAt is slightly skewed
    // so the rows sort deterministically on the landing page, preserving
    // the order they were committed in.
    const base = Date.now();
    for (let i = 0; i < quantity; i++) {
      const saleId = await db.sales.add({
        collectionId: input.collectionId,
        packagingId: input.packagingId,
        cells: input.cells,
        price: input.price,
        status: "prepared",
        preparedAt: new Date(base + i),
        customerNote: input.customerNote,
      } as Sale) as string;
      ids.push(saleId);
    }
    return ids;
  });
}

/** Package a freshly-unmoulded bar batch: write `quantity` prepared Sale rows
 *  (one bar each) and flag the originating PlanProduct as `stockStatus: "gone"`
 *  so the bars aren't double-counted in product stock.
 *
 *  Unlike `saveSaleAsPrepared`, this does NOT FIFO-decrement stock — the bars
 *  were just made; their PlanProduct lives in a not-yet-done plan and isn't
 *  visible to stock aggregation yet. Packaging them immediately is the point.
 *
 *  `cells` is a single-element array `[productId]` for a capacity-1 wrapper;
 *  the caller provides the packaging + collection so price snapshots at the
 *  current `CollectionPackaging.sellPrice`.
 */
export async function packagePlanProductAsSales(input: {
  planProductId: string;
  productId: string;
  collectionId: string;
  packagingId: string;
  price: number;
  quantity: number;
}): Promise<string[]> {
  const quantity = Math.max(0, Math.floor(input.quantity));
  if (quantity === 0) return [];

  return db.transaction("rw", [db.sales, db.planProducts, db.packaging], async () => {
    const pb = await db.planProducts.get(input.planProductId);
    if (!pb) throw new Error("Plan product not found");

    // Look up the packaging to get its capacity — a wrapper is expected to be
    // capacity 1, but we pad defensively so invalid configs don't crash.
    const pkg = await db.packaging.get(input.packagingId);
    const capacity = Math.max(1, pkg?.capacity ?? 1);
    const cells: (string | null)[] = Array(capacity).fill(null);
    for (let i = 0; i < Math.min(capacity, 1); i++) cells[i] = input.productId;

    const ids: string[] = [];
    const base = Date.now();
    for (let i = 0; i < quantity; i++) {
      const saleId = await db.sales.add({
        collectionId: input.collectionId,
        packagingId: input.packagingId,
        cells,
        price: input.price,
        status: "prepared",
        preparedAt: new Date(base + i),
      } as Sale) as string;
      ids.push(saleId);
    }

    // These bars now live as prepared sales rather than stock. Flag the batch
    // as "gone" so product stock queries skip it (mirrors how the Shop
    // handles a fully-sold box).
    await db.planProducts.update(input.planProductId, { stockStatus: "gone" });
    return ids;
  });
}

/** Mark a prepared sale as sold. Stamps `soldAt`; stock was already decremented
 *  at prep time, so this is a single-row update with no stock side-effects. */
export async function markSaleSold(saleId: string): Promise<void> {
  await db.sales.update(saleId, { status: "sold", soldAt: new Date() });
}

/** Bulk "Sell N" — flips multiple prepared sales to sold atomically. Shares a
 *  single `soldAt` timestamp across the batch so the landing KPI / recent-sales
 *  list treats them as the same transaction moment. */
export async function markSalesSold(saleIds: readonly string[]): Promise<void> {
  if (saleIds.length === 0) return;
  const soldAt = new Date();
  await db.transaction("rw", db.sales, async () => {
    for (const id of saleIds) {
      await db.sales.update(id, { status: "sold", soldAt });
    }
  });
}

/** Revert a sold sale back to prepared — the "Undo" path for a mis-tap on
 *  Sell. Clears `soldAt` and flips status. No stock side-effects (stock
 *  was decremented at prep time and hasn't changed since). */
export async function markSaleUnsold(saleId: string): Promise<void> {
  await db.sales.update(saleId, { status: "prepared", soldAt: undefined });
}

/** Update the free-text note on a sale. Scoped to prepared sales so we don't
 *  silently rewrite historical sold rows (which would confuse revenue audit).
 *  Passing an empty/whitespace-only note clears the field. */
export async function updateSaleNote(saleId: string, note: string): Promise<void> {
  const sale = await db.sales.get(saleId);
  if (!sale || sale.status !== "prepared") return;
  const trimmed = note.trim();
  await db.sales.update(saleId, { customerNote: trimmed === "" ? undefined : trimmed });
}

/** Bulk note update across multiple prepared sales — used when the Shop
 *  landing edits the shared note on a grouped row of identical boxes. Any
 *  targets that aren't "prepared" are silently skipped (we never rewrite a
 *  sold row's note). */
export async function updateSaleNotes(saleIds: readonly string[], note: string): Promise<void> {
  if (saleIds.length === 0) return;
  const trimmed = note.trim();
  const next = trimmed === "" ? undefined : trimmed;
  await db.transaction("rw", db.sales, async () => {
    for (const id of saleIds) {
      const sale = await db.sales.get(id);
      if (!sale || sale.status !== "prepared") continue;
      await db.sales.update(id, { customerNote: next });
    }
  });
}

/** Void a prepared sale: restore its stock (added back to the newest batch
 *  per product) and delete the sale row. Only valid for `prepared` sales —
 *  calling on a `sold` sale is a no-op (revenue was counted; can't silently
 *  unsell). */
export async function voidPreparedSale(saleId: string): Promise<void> {
  return db.transaction("rw", [db.sales, db.planProducts, db.productionPlans], async () => {
    const sale = await db.sales.get(saleId);
    if (!sale || sale.status !== "prepared") return;

    const donePlans = await db.productionPlans.where("status").equals("done").toArray();
    const planFifoOrder = new Map<string, number>();
    for (const plan of donePlans) {
      if (!plan.id) continue;
      planFifoOrder.set(plan.id, new Date(plan.completedAt ?? plan.createdAt).getTime());
    }
    const planIds = [...planFifoOrder.keys()];
    const rawBatches = planIds.length > 0
      ? await db.planProducts.where("planId").anyOf(planIds).toArray()
      : [];

    const batches: SaleStockBatch[] = rawBatches
      .filter((pb) => pb.id)
      .map((pb) => ({
        id: pb.id!,
        productId: pb.productId,
        currentStock: pb.currentStock,
        actualYield: pb.actualYield,
        stockStatus: pb.stockStatus,
        fifoOrder: planFifoOrder.get(pb.planId) ?? 0,
      }));

    const restore = tallyCells(sale.cells);
    const deltas = computeRestoreStockDeltas(batches, restore);
    for (const d of deltas) {
      await db.planProducts.update(d.id, { currentStock: d.nextStock });
    }

    await db.sales.delete(saleId);
  });
}

// ============================================================================
// Give-aways
// ============================================================================

/** Sum cell/slot counts in a give-away shape into a productId → count map.
 *  Pure — used by both the log mutation (stock decrement) and the live
 *  pieceCount/cost rollups on the editing screen. */
export function tallyGiveAwayShape(shape: GiveAwayShape): Map<string, number> {
  switch (shape.kind) {
    case "box":
      return tallyCells(shape.cells);
    case "loose":
    case "bar":
    case "snack": {
      const m = new Map<string, number>();
      for (const [pid, n] of Object.entries(shape.counts)) {
        if (n > 0) m.set(pid, n);
      }
      return m;
    }
  }
}

/** Total piece count for a give-away shape. Convenience wrapper over
 *  `tallyGiveAwayShape` for the (very common) "how many pieces are we logging?"
 *  question on the bottom strip of the log screen. */
export function pieceCountForGiveAway(shape: GiveAwayShape): number {
  let n = 0;
  for (const v of tallyGiveAwayShape(shape).values()) n += v;
  return n;
}

/** Reactive map productId → costPerProduct (latest snapshot). Used to roll up
 *  the give-away's `ingredientCost` at log time and for the live total on
 *  the bottom strip. Products without a snapshot contribute 0 — the give-away
 *  is still loggable, just with no cost rollup until the operator generates
 *  cost snapshots. */
export function useLatestProductCostMap(): Map<string, number> {
  return useLiveQuery(async () => {
    const all = await db.productCostSnapshots.toArray();
    const latestByProduct = new Map<string, ProductCostSnapshot>();
    for (const snap of all) {
      const ex = latestByProduct.get(snap.productId);
      if (!ex || new Date(snap.recordedAt) > new Date(ex.recordedAt)) {
        latestByProduct.set(snap.productId, snap);
      }
    }
    const m = new Map<string, number>();
    for (const [pid, snap] of latestByProduct) m.set(pid, snap.costPerProduct);
    return m;
  }, []) ?? new Map<string, number>();
}

/** Recent give-aways, newest first. Mirrors `useRecentSoldSales` so the
 *  landing page can render a unified "recent activity" timeline. */
export function useRecentGiveaways(limit = 10): GiveAwayRecord[] {
  return useLiveQuery(
    () => db.giveaways.toArray().then((all) =>
      all
        .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
        .slice(0, limit)
    ),
    [limit],
  ) ?? [];
}

export interface GiveAwayMonthTallies {
  /** Number of give-away records this month. */
  records: number;
  /** Total pieces given away this month (sum of every record's pieceCount). */
  pieces: number;
  /** Total ingredient cost this month (sum of every record's ingredientCost). */
  ingredientCost: number;
}

/** Running tallies for the current calendar month — drives the landing-tile
 *  subline ("12 give-aways this month · 38 pieces · €184 ingredient cost"). */
export function useGiveawayMonthTallies(): GiveAwayMonthTallies {
  return useLiveQuery(async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const all = await db.giveaways.toArray();
    let records = 0, pieces = 0, ingredientCost = 0;
    for (const g of all) {
      const t = new Date(g.at).getTime();
      if (t < monthStart) continue;
      records++;
      pieces += g.pieceCount;
      ingredientCost += g.ingredientCost;
    }
    return { records, pieces, ingredientCost };
  }, []) ?? { records: 0, pieces: 0, ingredientCost: 0 };
}

/**
 * Persist a give-away record. When `fromStock=true`, atomically decrements
 * product stock FIFO (same path the paid sale flow uses); when false, stock
 * is untouched (the chocolate was made fresh for the give-away and never
 * entered finished stock). All-or-nothing via a Dexie transaction.
 *
 * `pieceCount` and `ingredientCost` are computed at log time from `shape` and
 * the caller-supplied cost map (typically from `useLatestProductCostMap`),
 * so reporting doesn't have to walk the shape later.
 *
 * Throws when `fromStock=true` and any product would go below zero. The
 * picker disables tiles for that case, but we defend on the write so a
 * stale-stock race doesn't corrupt the ledger.
 */
export async function saveGiveaway(input: {
  reason: GiveAwayReason;
  fromStock: boolean;
  shape: GiveAwayShape;
  recipient?: string;
  note?: string;
  /** productId → costPerProduct (latest snapshot). Missing entries roll up
   *  as 0 — a permissive default so the user can still log give-aways for
   *  products without cost snapshots. */
  costPerProductById: ReadonlyMap<string, number>;
}): Promise<string> {
  const usage = tallyGiveAwayShape(input.shape);
  let pieceCount = 0;
  let ingredientCost = 0;
  for (const [pid, n] of usage) {
    pieceCount += n;
    const cpp = input.costPerProductById.get(pid) ?? 0;
    ingredientCost += cpp * n;
  }
  if (pieceCount === 0) {
    throw new Error("Give-away must include at least one piece");
  }

  const writeTables = input.fromStock
    ? [db.giveaways, db.planProducts, db.productionPlans]
    : [db.giveaways];

  return db.transaction("rw", writeTables, async () => {
    if (input.fromStock) {
      const donePlans = await db.productionPlans.where("status").equals("done").toArray();
      const planFifoOrder = new Map<string, number>();
      for (const plan of donePlans) {
        if (!plan.id) continue;
        planFifoOrder.set(plan.id, new Date(plan.completedAt ?? plan.createdAt).getTime());
      }
      const planIds = [...planFifoOrder.keys()];
      const rawBatches = planIds.length > 0
        ? await db.planProducts.where("planId").anyOf(planIds).toArray()
        : [];

      const batches: SaleStockBatch[] = rawBatches
        .filter((pb) => pb.id)
        .map((pb) => ({
          id: pb.id!,
          productId: pb.productId,
          currentStock: pb.currentStock,
          actualYield: pb.actualYield,
          stockStatus: pb.stockStatus,
          fifoOrder: planFifoOrder.get(pb.planId) ?? 0,
        }));

      // Pre-check feasibility per product so we fail loudly before writing.
      for (const [pid, need] of usage) {
        const avail = batches
          .filter((b) => b.productId === pid && b.stockStatus !== "gone")
          .reduce((s, b) => s + Math.max(0, b.currentStock ?? b.actualYield ?? 0), 0);
        if (avail < need) {
          throw new Error(
            `Not enough stock: need ${need} of product ${pid}, only ${avail} available`,
          );
        }
      }

      const deltas = computeCommitStockDeltas(batches, usage);
      for (const d of deltas) {
        await db.planProducts.update(d.id, { currentStock: d.nextStock });
      }
    }

    const id = await db.giveaways.add({
      at: new Date(),
      reason: input.reason,
      fromStock: input.fromStock,
      shape: input.shape,
      recipient: input.recipient,
      note: input.note,
      pieceCount,
      ingredientCost,
    } as GiveAwayRecord) as string;
    return id;
  });
}
