/**
 * Label-context resolver.
 *
 * Takes a `LabelSource` descriptor (Product+Batch, Filling batch, or
 * Collection package) and returns a fully-derived `LabelContext` — the
 * source-agnostic shape the editor preview, the EU-FIC linter, and the print
 * pipeline all consume. Renderers never read raw DB rows; they only ever read
 * a `LabelContext`. That keeps the renderer layer pure and makes adding a new
 * source kind in the future strictly additive.
 *
 * Architecture:
 *   - `buildProductionBatchContext(input)` is a pure function. It takes
 *     pre-loaded rows and is fully unit-tested; it has no Dexie / React
 *     dependency, so it round-trips identically server-side (future PDF
 *     generator) and on the client.
 *   - `useLabelContext(source)` is a reactive hook that loads the rows from
 *     Dexie (re-renders on row changes) and delegates to the pure function.
 *
 * Phase 1 implements `production-batch` only. The other two `LabelSource`
 * kinds return a stubbed context with a clear warning so the editor preview
 * can still render against sample data; full resolvers land in Phase 2
 * alongside their respective entry points (stock page → filling-batch,
 * shop → collection-package).
 */

import { useLiveQuery } from "dexie-react-hooks";
import { db } from "@/lib/db";
import {
  flattenFillingToIngredients,
  rollUpAmounts,
} from "@/lib/fillingComponents";
import {
  calculateShellWeightG,
  calculateFillingWeightPerCavityG,
  fillFractionToGrams,
  DEFAULT_SHELL_PERCENTAGE,
  deriveShellPercentageFromFractions,
} from "@/lib/costCalculation";
import { calculateProductNutrition } from "@/lib/nutrition";
import type {
  FillingComponent,
  FillingIngredient,
  Ingredient,
  LabelContext,
  LabelContextIngredient,
  LabelSource,
  Mould,
  PlanProduct,
  Product,
  ProductFilling,
  ProductionPlan,
} from "@/types";

// ---------------------------------------------------------------------------
// Pure builder — production-batch
// ---------------------------------------------------------------------------

export interface ProductionBatchContextInput {
  source: Extract<LabelSource, { kind: "production-batch" }>;
  plan: ProductionPlan;
  planProduct: PlanProduct;
  product: Product;
  /** Default mould resolved from `product.defaultMouldId`. Undefined when the
   *  product has no default mould (a state the existing nutrition / cost
   *  pipeline already handles by returning a warning). */
  mould: Mould | null | undefined;
  productFillings: ProductFilling[];
  fillingIngredientsMap: ReadonlyMap<string, FillingIngredient[]>;
  fillingComponentsMap: ReadonlyMap<string, FillingComponent[]>;
  ingredientMap: ReadonlyMap<string, Ingredient>;
  /** Resolved from `product.shellIngredientId`. Undefined when the product
   *  has no shell (e.g. bean-to-bar with `shellPercentage === 0`). */
  shellIngredient: Ingredient | null | undefined;
  facilityMayContain: string[];
}

/**
 * Build a `LabelContext` for the `production-batch` source kind. Pure —
 * accepts pre-loaded rows so it round-trips deterministically in tests and
 * in a future server-side renderer.
 */
export function buildProductionBatchContext(input: ProductionBatchContextInput): LabelContext {
  const {
    source, plan, planProduct, product, mould,
    productFillings, fillingIngredientsMap, fillingComponentsMap,
    ingredientMap, shellIngredient, facilityMayContain,
  } = input;

  const warnings: string[] = [];

  // Resolve shell percentage (mirrors costCalculation): in grams mode we
  // derive from the sum of fill fractions; otherwise use the product's stored
  // value or the default.
  const fillMode = product.fillMode ?? "percentage";
  const totalFillFraction = productFillings.reduce(
    (sum, rl) => sum + (rl.fillFraction ?? 0),
    0,
  );
  const shellPercentage = fillMode === "grams"
    ? deriveShellPercentageFromFractions(totalFillFraction)
    : (product.shellPercentage ?? DEFAULT_SHELL_PERCENTAGE);

  // ---- Per-cavity ingredient breakdown ------------------------------------
  // For each filling: flatten to ingredients, scale by the filling's
  // per-cavity grams. Then sum across fillings, add the shell as one entry,
  // and sort descending by mass for EU FIC ordering.
  const perIngredientGrams = new Map<string, number>();

  if (mould) {
    for (const rl of productFillings) {
      const flatRows = rollUpAmounts(
        flattenFillingToIngredients(rl.fillingId, fillingIngredientsMap, fillingComponentsMap),
      );
      const fillingTotalG = flatRows.reduce((s, r) => s + r.amount, 0);
      if (fillingTotalG <= 0) continue;

      const fillingWeightG = fillMode === "grams" && rl.fillFraction != null
        ? fillFractionToGrams(rl.fillFraction, mould.cavityWeightG)
        : calculateFillingWeightPerCavityG(mould, rl.fillPercentage, shellPercentage);

      for (const row of flatRows) {
        const ingredientGrams = fillingWeightG * (row.amount / fillingTotalG);
        perIngredientGrams.set(
          row.ingredientId,
          (perIngredientGrams.get(row.ingredientId) ?? 0) + ingredientGrams,
        );
      }
    }
  } else {
    warnings.push("No default mould — per-piece weight unavailable.");
  }

  // Shell as a synthetic ingredient row.
  if (mould && shellIngredient && shellPercentage > 0) {
    const shellWeightG = calculateShellWeightG(mould, shellPercentage);
    if (shellIngredient.id) {
      perIngredientGrams.set(
        shellIngredient.id,
        (perIngredientGrams.get(shellIngredient.id) ?? 0) + shellWeightG,
      );
    }
  } else if (shellPercentage > 0 && !shellIngredient) {
    warnings.push("Shell ingredient unresolved — shell omitted from ingredient list.");
  }

  // Build the ordered ingredient list — descending by mass.
  const ingredients: LabelContextIngredient[] = Array.from(perIngredientGrams.entries())
    .map(([ingredientId, amountG]) => {
      const ing = ingredientMap.get(ingredientId);
      if (!ing) {
        warnings.push(`Ingredient ${ingredientId} not found — omitted from list.`);
        return null;
      }
      return {
        name: ing.name,
        allergens: ing.allergens ?? [],
        amountG: Math.round(amountG * 1000) / 1000,
      };
    })
    .filter((x): x is LabelContextIngredient => x !== null)
    .sort((a, b) => b.amountG - a.amountG);

  // ---- Per-cavity weight + total cavity count ------------------------------
  const perCavityWeightG = ingredients.reduce((s, i) => s + i.amountG, 0);

  const cavityCount = mould?.numberOfCavities ?? 0;
  const additionalCavities = (planProduct.additionalMoulds ?? []).reduce((sum, m) => {
    return sum + (m.partialCavities ?? (m.quantity * cavityCount));
  }, 0);
  const primaryCavities = planProduct.partialCavities ?? (planProduct.quantity * cavityCount);
  const totalCavityCount = planProduct.actualYield ?? (primaryCavities + additionalCavities);

  // ---- Allergens (union across leaf ingredients) ---------------------------
  const allergenSet = new Set<string>();
  for (const ing of ingredients) {
    for (const a of ing.allergens) allergenSet.add(a);
  }
  const allergens = Array.from(allergenSet).sort();

  // ---- Nutrition (delegates to existing per-100g aggregator) --------------
  const nutritionResult = calculateProductNutrition({
    mould: mould ?? null,
    productFillings,
    fillingIngredientsMap: new Map(fillingIngredientsMap),
    ingredientMap: new Map(ingredientMap),
    shellIngredient: shellIngredient ?? null,
    shellPercentage,
    fillMode,
    fillingComponentsMap: new Map(fillingComponentsMap),
  });
  for (const w of nutritionResult.warnings) warnings.push(w);

  // ---- Best-before --------------------------------------------------------
  const weeks = parseInt(product.shelfLifeWeeks ?? "", 10);
  const bestBefore = plan.completedAt && !isNaN(weeks) && weeks > 0
    ? new Date(new Date(plan.completedAt).getTime() + weeks * 7 * 24 * 60 * 60 * 1000)
    : null;

  // ---- Origin -------------------------------------------------------------
  const origin = shellIngredient
    ? (shellIngredient.commercialName ?? shellIngredient.name)
    : "";

  return {
    source,
    name: product.name,
    perCavityWeightG: Math.round(perCavityWeightG * 1000) / 1000,
    totalCavityCount,
    ingredients,
    allergens,
    mayContain: [...facilityMayContain],
    nutritionPer100g: nutritionResult.per100g,
    bestBefore,
    batchNumber: plan.batchNumber ?? "",
    producedAt: plan.completedAt ?? null,
    origin,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// DB-loading reactive hook
// ---------------------------------------------------------------------------

/** Stub returned when a not-yet-implemented `LabelSource` kind is requested.
 *  The editor's preview can still render the brand-group fields and the
 *  template's free-text fields against an empty context, surfacing the
 *  resolver gap as a warning. */
function unresolvedContext(source: LabelSource, reason: string): LabelContext {
  return {
    source,
    name: "",
    perCavityWeightG: 0,
    totalCavityCount: 0,
    ingredients: [],
    allergens: [],
    mayContain: [],
    nutritionPer100g: {},
    bestBefore: null,
    batchNumber: "",
    producedAt: null,
    origin: "",
    warnings: [reason],
  };
}

/**
 * Reactive hook that loads everything `buildProductionBatchContext` needs and
 * returns a `LabelContext` (or `undefined` while the live query is still
 * resolving). Re-renders when any underlying row changes.
 */
export function useLabelContext(source: LabelSource | null | undefined): LabelContext | undefined {
  return useLiveQuery(async () => {
    if (!source) return undefined;

    if (source.kind !== "production-batch") {
      return unresolvedContext(
        source,
        `Resolver for "${source.kind}" not implemented yet — Phase 2.`,
      );
    }

    const [plan, planProduct] = await Promise.all([
      db.productionPlans.get(source.planId),
      db.planProducts.get(source.planProductId),
    ]);
    if (!plan || !planProduct) {
      return unresolvedContext(source, "Plan or plan-product not found.");
    }
    const product = await db.products.get(planProduct.productId);
    if (!product?.id) {
      return unresolvedContext(source, "Product not found.");
    }

    const mould = product.defaultMouldId ? await db.moulds.get(product.defaultMouldId) : undefined;

    const productFillings = await db.productFillings
      .where("productId").equals(product.id)
      .toArray();
    const sortedProductFillings = productFillings
      .slice()
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const fillingIds = sortedProductFillings.map((rl) => rl.fillingId);

    // Filling ingredients + components — load for every host filling and any
    // descendant filling, since flattenFillingToIngredients walks the tree.
    const allFillingsTouched = new Set<string>(fillingIds);
    let frontier = new Set<string>(fillingIds);
    while (frontier.size > 0) {
      const components = await db.fillingComponents
        .where("fillingId").anyOf([...frontier])
        .toArray();
      const next = new Set<string>();
      for (const c of components) {
        if (!allFillingsTouched.has(c.childFillingId)) {
          allFillingsTouched.add(c.childFillingId);
          next.add(c.childFillingId);
        }
      }
      frontier = next;
    }

    const allFillingIds = [...allFillingsTouched];
    const [fillingIngredientsRaw, fillingComponentsRaw] = await Promise.all([
      allFillingIds.length > 0
        ? db.fillingIngredients.where("fillingId").anyOf(allFillingIds).toArray()
        : Promise.resolve([] as FillingIngredient[]),
      allFillingIds.length > 0
        ? db.fillingComponents.where("fillingId").anyOf(allFillingIds).toArray()
        : Promise.resolve([] as FillingComponent[]),
    ]);

    const fillingIngredientsMap = new Map<string, FillingIngredient[]>();
    for (const li of fillingIngredientsRaw) {
      const arr = fillingIngredientsMap.get(li.fillingId) ?? [];
      arr.push(li);
      fillingIngredientsMap.set(li.fillingId, arr);
    }
    const fillingComponentsMap = new Map<string, FillingComponent[]>();
    for (const fc of fillingComponentsRaw) {
      const arr = fillingComponentsMap.get(fc.fillingId) ?? [];
      arr.push(fc);
      fillingComponentsMap.set(fc.fillingId, arr);
    }

    // Ingredients — every leaf id referenced by any filling or by the shell.
    const ingredientIds = new Set<string>();
    for (const li of fillingIngredientsRaw) ingredientIds.add(li.ingredientId);
    if (product.shellIngredientId) ingredientIds.add(product.shellIngredientId);

    const ingredientList = ingredientIds.size > 0
      ? (await Promise.all([...ingredientIds].map((id) => db.ingredients.get(id))))
        .filter((i): i is Ingredient => !!i)
      : [];
    const ingredientMap = new Map(ingredientList.filter((i) => i.id).map((i) => [i.id!, i]));
    const shellIngredient = product.shellIngredientId
      ? ingredientMap.get(product.shellIngredientId) ?? null
      : null;

    const prefs = (await db.userPreferences.toArray())[0];
    const facilityMayContain = prefs?.facilityMayContain ?? [];

    return buildProductionBatchContext({
      source,
      plan,
      planProduct,
      product,
      mould,
      productFillings: sortedProductFillings,
      fillingIngredientsMap,
      fillingComponentsMap,
      ingredientMap,
      shellIngredient,
      facilityMayContain,
    });
  }, [source?.kind, source && "planId" in source ? source.planId : null, source && "planProductId" in source ? source.planProductId : null, source && "stockId" in source ? source.stockId : null, source && "collectionId" in source ? source.collectionId : null, source && "packagingId" in source ? source.packagingId : null]);
}

// ---------------------------------------------------------------------------
// Batch loader for the print pipeline
// ---------------------------------------------------------------------------

/**
 * Load one `LabelContext` per `PlanProduct` in a completed production batch.
 *
 * Used by the print pipeline (event-driven, not reactive) to resolve every
 * label that the batch should produce in a single Dexie sweep. Batches lookups
 * by table — one query per table, not one per product — so a 20-product batch
 * stays a handful of round-trips even on slow devices.
 *
 * Returns an empty array when the plan or its plan-products aren't found, so
 * the caller can render an empty-state message rather than crash.
 */
export async function loadProductionBatchContexts(planId: string): Promise<LabelContext[]> {
  const plan = await db.productionPlans.get(planId);
  if (!plan?.id) return [];

  const planProducts = await db.planProducts.where("planId").equals(planId).toArray();
  if (planProducts.length === 0) return [];

  const productIds = [...new Set(planProducts.map((pp) => pp.productId))];
  const products = productIds.length > 0
    ? await db.products.where("id").anyOf(productIds).toArray()
    : [];
  const productMap = new Map(products.filter((p) => !!p.id).map((p) => [p.id!, p]));

  const mouldIds = [...new Set(products
    .map((p) => p.defaultMouldId)
    .filter((id): id is string => !!id))];
  const moulds = mouldIds.length > 0
    ? await db.moulds.where("id").anyOf(mouldIds).toArray()
    : [];
  const mouldMap = new Map(moulds.filter((m) => !!m.id).map((m) => [m.id!, m]));

  // Per-product fillings (the row that ties a Product to a Filling, with
  // fill percentages and sort order). One query covers every product.
  const productFillings = productIds.length > 0
    ? await db.productFillings.where("productId").anyOf(productIds).toArray()
    : [];
  const fillingsByProduct = new Map<string, ProductFilling[]>();
  for (const pf of productFillings) {
    const arr = fillingsByProduct.get(pf.productId) ?? [];
    arr.push(pf);
    fillingsByProduct.set(pf.productId, arr);
  }

  // Walk the filling-component graph so descendant fillings are loaded too.
  const allFillingIds = new Set<string>(productFillings.map((pf) => pf.fillingId));
  let frontier = new Set<string>(allFillingIds);
  while (frontier.size > 0) {
    const components = await db.fillingComponents
      .where("fillingId").anyOf([...frontier])
      .toArray();
    const next = new Set<string>();
    for (const c of components) {
      if (!allFillingIds.has(c.childFillingId)) {
        allFillingIds.add(c.childFillingId);
        next.add(c.childFillingId);
      }
    }
    frontier = next;
  }

  const fillingIdArr = [...allFillingIds];
  const [fillingIngredientRows, fillingComponentRows] = await Promise.all([
    fillingIdArr.length > 0
      ? db.fillingIngredients.where("fillingId").anyOf(fillingIdArr).toArray()
      : Promise.resolve([] as FillingIngredient[]),
    fillingIdArr.length > 0
      ? db.fillingComponents.where("fillingId").anyOf(fillingIdArr).toArray()
      : Promise.resolve([] as FillingComponent[]),
  ]);

  const fillingIngredientsMap = new Map<string, FillingIngredient[]>();
  for (const li of fillingIngredientRows) {
    const arr = fillingIngredientsMap.get(li.fillingId) ?? [];
    arr.push(li);
    fillingIngredientsMap.set(li.fillingId, arr);
  }
  const fillingComponentsMap = new Map<string, FillingComponent[]>();
  for (const fc of fillingComponentRows) {
    const arr = fillingComponentsMap.get(fc.fillingId) ?? [];
    arr.push(fc);
    fillingComponentsMap.set(fc.fillingId, arr);
  }

  const ingredientIds = new Set<string>();
  for (const li of fillingIngredientRows) ingredientIds.add(li.ingredientId);
  for (const p of products) if (p.shellIngredientId) ingredientIds.add(p.shellIngredientId);
  const ingredients = ingredientIds.size > 0
    ? await db.ingredients.where("id").anyOf([...ingredientIds]).toArray()
    : [];
  const ingredientMap = new Map(ingredients.filter((i) => !!i.id).map((i) => [i.id!, i]));

  const prefs = (await db.userPreferences.toArray())[0];
  const facilityMayContain = prefs?.facilityMayContain ?? [];

  return planProducts.map((pp) => {
    const product = productMap.get(pp.productId);
    if (!product?.id || !pp.id) {
      return unresolvedContext(
        { kind: "production-batch", planId, planProductId: pp.id ?? "" },
        "Product or plan-product row not found.",
      );
    }
    const mould = product.defaultMouldId ? mouldMap.get(product.defaultMouldId) ?? null : null;
    const shellIngredient = product.shellIngredientId
      ? ingredientMap.get(product.shellIngredientId) ?? null
      : null;
    return buildProductionBatchContext({
      source: { kind: "production-batch", planId, planProductId: pp.id },
      plan,
      planProduct: pp,
      product,
      mould,
      productFillings: (fillingsByProduct.get(product.id) ?? [])
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder),
      fillingIngredientsMap,
      fillingComponentsMap,
      ingredientMap,
      shellIngredient,
      facilityMayContain,
    });
  });
}

