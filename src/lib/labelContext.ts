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
import { aggregateNutrition, calculateProductNutrition } from "@/lib/nutrition";
import type {
  Collection,
  CollectionProduct,
  Filling,
  FillingComponent,
  FillingIngredient,
  Ingredient,
  LabelContext,
  LabelContextIngredient,
  LabelSource,
  Mould,
  Packaging,
  PlanFilling,
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
  const origin = shellIngredient ? shellIngredient.name : "";

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
// Pure builder — filling-batch
// ---------------------------------------------------------------------------

export interface FillingBatchContextInput {
  source: Extract<LabelSource, { kind: "filling-batch" }>;
  plan: ProductionPlan;
  planFilling: PlanFilling;
  filling: Filling;
  fillingIngredientsMap: ReadonlyMap<string, FillingIngredient[]>;
  fillingComponentsMap: ReadonlyMap<string, FillingComponent[]>;
  ingredientMap: ReadonlyMap<string, Ingredient>;
  facilityMayContain: string[];
}

/**
 * Build a `LabelContext` for the `filling-batch` source kind. One label per
 * `PlanFilling` — represents the *amount of filling produced by this batch*,
 * not a specific stock container. `perCavityWeightG` carries the total batch
 * weight (with `piecesPerLabel = 1` at template level) so the renderer's
 * weight field prints "500g" for a 500g batch.
 *
 * Best-before is derived from `plan.completedAt + filling.shelfLifeWeeks`.
 * Origin is always empty (no chocolate shell on a filling label). Pure —
 * caller supplies pre-loaded rows.
 */
export function buildFillingBatchContext(input: FillingBatchContextInput): LabelContext {
  const { source, plan, planFilling, filling, fillingIngredientsMap, fillingComponentsMap, ingredientMap, facilityMayContain } = input;
  const warnings: string[] = [];

  // Total grams produced by this filling batch. Prefer the actual yield (set
  // when the batch is finalised) and fall back to the targeted amount so
  // labels printed before the user confirms yield still show something
  // sensible.
  const totalBatchG = planFilling.actualYieldG ?? planFilling.targetGrams ?? 0;
  if (totalBatchG <= 0) warnings.push("Total batch weight is unknown.");

  // Flatten the filling's recipe to leaf ingredients with their per-recipe
  // grams. Roll up duplicates (same ingredient appearing in multiple component
  // fillings) into single entries.
  const flatRows = rollUpAmounts(
    flattenFillingToIngredients(filling.id!, fillingIngredientsMap, fillingComponentsMap),
  );
  const recipeTotalG = flatRows.reduce((s, r) => s + r.amount, 0);

  // Scale each ingredient from "amount in the recipe" to "amount in this
  // specific batch". If the recipe total is 0 (degenerate) we just pass through
  // the raw amounts.
  const scale = recipeTotalG > 0 && totalBatchG > 0 ? totalBatchG / recipeTotalG : 1;
  const perIngredientGrams = new Map<string, number>();
  for (const row of flatRows) {
    perIngredientGrams.set(row.ingredientId, (perIngredientGrams.get(row.ingredientId) ?? 0) + row.amount * scale);
  }

  // Sort descending by mass for EU FIC ordering, project to LabelContextIngredient.
  const allergenSet = new Set<string>();
  const ingredients: LabelContextIngredient[] = [...perIngredientGrams.entries()]
    .map(([ingredientId, grams]) => {
      const ing = ingredientMap.get(ingredientId);
      if (!ing) return null;
      for (const a of ing.allergens ?? []) allergenSet.add(a);
      return {
        name: ing.name,
        allergens: ing.allergens ?? [],
        amountG: Math.round(grams * 1000) / 1000,
      };
    })
    .filter((x): x is LabelContextIngredient => x !== null)
    .sort((a, b) => b.amountG - a.amountG);

  // Per-100g nutrition, weighted by each ingredient's grams in the batch.
  const nutritionResult = aggregateNutrition(
    ingredients.map((ing) => {
      const id = [...perIngredientGrams.keys()].find((k) => {
        const i = ingredientMap.get(k);
        return i?.name === ing.name;
      });
      return {
        amountG: ing.amountG,
        nutrition: (id ? ingredientMap.get(id)?.nutrition : undefined) ?? {},
      };
    }),
  );

  // Best-before: completed-at + shelf-life weeks, when both are set.
  let bestBefore: Date | null = null;
  if (plan.completedAt && filling.shelfLifeWeeks && filling.shelfLifeWeeks > 0) {
    bestBefore = new Date(new Date(plan.completedAt).getTime() + filling.shelfLifeWeeks * 7 * 86400000);
  } else if (!filling.shelfLifeWeeks) {
    warnings.push("Filling has no shelf life defined.");
  }

  return {
    source,
    name: filling.name,
    perCavityWeightG: Math.round(totalBatchG * 1000) / 1000,
    totalCavityCount: 1,
    ingredients,
    allergens: [...allergenSet].sort(),
    mayContain: [...facilityMayContain],
    nutritionPer100g: nutritionResult.per100g,
    bestBefore,
    batchNumber: plan.batchNumber ?? "",
    producedAt: plan.completedAt ?? null,
    origin: "",
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Pure builder — collection-package
// ---------------------------------------------------------------------------

export interface CollectionPackageContextInput {
  source: Extract<LabelSource, { kind: "collection-package" }>;
  collection: Collection;
  packaging: Packaging;
  /** Ordered list of products in the collection. */
  collectionProducts: CollectionProduct[];
  /** Lookup of every product referenced by `collectionProducts.productId`. */
  productMap: ReadonlyMap<string, Product>;
  /** Default moulds keyed by `Product.defaultMouldId`. Optional rows. */
  mouldMap: ReadonlyMap<string, Mould>;
  /** Per-product filling rows (recipe attachments), keyed by `productId`. */
  productFillingsByProduct: ReadonlyMap<string, ProductFilling[]>;
  fillingIngredientsMap: ReadonlyMap<string, FillingIngredient[]>;
  fillingComponentsMap: ReadonlyMap<string, FillingComponent[]>;
  ingredientMap: ReadonlyMap<string, Ingredient>;
  facilityMayContain: string[];
  /**
   * Optional per-cavity product distribution from `Sale.cells` (one productId
   * or null per cavity, length = packaging.capacity). When provided, the
   * label reflects the exact number of each product type in this specific
   * box — ingredient totals and box weight are summed by the real count
   * rather than assuming one of each.
   *
   * Omit for the design-time preview where no specific sale is selected; the
   * resolver falls back to one piece of each product in the collection.
   */
  cells?: ReadonlyArray<string | null>;
  /**
   * The date this specific box was packed. For a real sale that's
   * `Sale.preparedAt`. When provided, drives the printed best-before date
   * as `packedAt + earliest-product-shelf-life-weeks`.
   *
   * Omit at design-time (no specific sale yet); the label's BBE field will
   * fall back to an em-dash instead of a synthetic date so previews don't
   * mislead the user about what'll print.
   */
  packedAt?: Date | null;
}

/**
 * Build a `LabelContext` for the `collection-package` source kind — the
 * retail bonbon-box label sold via the shop.
 *
 * Aggregation model: a Collection + Packaging combination doesn't store an
 * explicit "X pieces of product A, Y of product B" slot distribution. We
 * treat the box as containing one of each product in the collection for
 * ingredient/allergen union (qualitatively correct — the box can hold any
 * of these chocolates) and compute total box weight as
 * `packaging.capacity × average-bonbon-weight-across-products`.
 *
 * Best-before is the *earliest* shelf-life among products (any expired
 * piece would taint the whole box). Batch number / production date stay
 * blank — there's no single batch behind a retail collection; the user
 * adds free-text fields if they want to stamp a packing date.
 *
 * Pure — caller supplies pre-loaded rows.
 */
export function buildCollectionPackageContext(input: CollectionPackageContextInput): LabelContext {
  const {
    source, collection, packaging, collectionProducts,
    productMap, mouldMap, productFillingsByProduct,
    fillingIngredientsMap, fillingComponentsMap, ingredientMap, facilityMayContain, cells, packedAt,
  } = input;

  const warnings: string[] = [];

  // Per-product quantity in this box. When `cells` is supplied (the print
  // path always passes it; only the design-time preview omits it), count the
  // exact per-product occurrences. Otherwise fall back to one of each — a
  // sensible default for previewing a template against an abstract Collection
  // × Packaging combination.
  const productCount = new Map<string, number>();
  if (cells && cells.length > 0) {
    for (const cell of cells) {
      if (!cell) continue;
      productCount.set(cell, (productCount.get(cell) ?? 0) + 1);
    }
  } else {
    for (const cp of collectionProducts) productCount.set(cp.productId, 1);
  }

  // Per-product per-piece weight — drives the box-total and is multiplied by
  // each product's count. A product without a default mould has unknown
  // weight and is skipped from the weight total; its ingredients still
  // aggregate (no quantity dependency on having a mould).
  const perProductPieceG = new Map<string, number>();
  // Aggregated grams per ingredient across every piece in the box.
  const perIngredientGrams = new Map<string, number>();
  const allergenSet = new Set<string>();

  // Drive the loop from the actual product distribution rather than the
  // collection's `collectionProducts` list. Bar / snack sales reference
  // products that aren't members of `collectionProducts` (those track only
  // the bonbon assortment), so iterating the collection would skip them and
  // render an empty label. Iterating `productCount` matches the cells the
  // user actually packed.
  for (const [productId, count] of productCount.entries()) {
    if (count === 0) continue;
    const product = productMap.get(productId);
    if (!product?.id) {
      warnings.push(`Product ${productId} from this sale was not found — its contribution is omitted.`);
      continue;
    }
    const mould = product.defaultMouldId ? mouldMap.get(product.defaultMouldId) ?? null : null;
    const productFillings = productFillingsByProduct.get(product.id) ?? [];

    // Per-cavity ingredient breakdown for one piece of this product, using the
    // same math as `buildProductionBatchContext` but flat (no Plan rescaling).
    const fillMode = product.fillMode ?? "percentage";
    const totalFillFraction = productFillings.reduce((s, rl) => s + (rl.fillFraction ?? 0), 0);
    const shellPercentage = fillMode === "grams"
      ? deriveShellPercentageFromFractions(totalFillFraction)
      : (product.shellPercentage ?? DEFAULT_SHELL_PERCENTAGE);

    if (!mould) {
      warnings.push(`Product "${product.name}" has no default mould — its weight contribution is unknown.`);
    }

    let productPieceG = 0;
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
        productPieceG += fillingWeightG;
        // Multiply by `count` so a box with 3 yuzu + 1 caramel sees the yuzu
        // filling's grams contribute three times to the ingredient list.
        for (const row of flatRows) {
          const ingredientGrams = fillingWeightG * (row.amount / fillingTotalG) * count;
          perIngredientGrams.set(
            row.ingredientId,
            (perIngredientGrams.get(row.ingredientId) ?? 0) + ingredientGrams,
          );
        }
      }
      // Shell ingredient — scaled by the same per-product count.
      if (product.shellIngredientId) {
        const shellG = calculateShellWeightG(mould, shellPercentage);
        productPieceG += shellG;
        perIngredientGrams.set(
          product.shellIngredientId,
          (perIngredientGrams.get(product.shellIngredientId) ?? 0) + shellG * count,
        );
      }
    }
    if (productPieceG > 0) perProductPieceG.set(product.id, productPieceG);
    // Per-product allergen aggregation flows through the ingredient walk
    // below — `Product` itself doesn't store an allergen list (it's derived
    // from its filling tree + shell ingredient at render time).
  }

  // Project the per-ingredient grams to LabelContextIngredient list, sorted
  // descending by mass for EU FIC ordering.
  const ingredients: LabelContextIngredient[] = [...perIngredientGrams.entries()]
    .map(([ingredientId, grams]) => {
      const ing = ingredientMap.get(ingredientId);
      if (!ing) return null;
      for (const a of ing.allergens ?? []) allergenSet.add(a);
      return {
        name: ing.name,
        allergens: ing.allergens ?? [],
        amountG: Math.round(grams * 1000) / 1000,
      };
    })
    .filter((x): x is LabelContextIngredient => x !== null)
    .sort((a, b) => b.amountG - a.amountG);

  // Per-100g nutrition, weighted by each ingredient's grams in the actual
  // box composition.
  const nutritionResult = aggregateNutrition(
    ingredients.map((ing) => {
      const id = [...perIngredientGrams.keys()].find((k) => {
        const i = ingredientMap.get(k);
        return i?.name === ing.name;
      });
      return {
        amountG: ing.amountG,
        nutrition: (id ? ingredientMap.get(id)?.nutrition : undefined) ?? {},
      };
    }),
  );

  // Total box weight = sum over each product of (piece weight × count).
  // We store the total in `perCavityWeightG` so the existing `weight`
  // renderer prints the whole-box weight without the template author having
  // to set `piecesPerLabel` to the box capacity (which would couple the
  // template to one specific packaging — wrong for collections that ship in
  // multiple box sizes). Mirrors how filling-batch labels store total batch
  // grams in the same slot.
  let totalBoxG = 0;
  let totalPieces = 0;
  for (const [productId, pieceG] of perProductPieceG.entries()) {
    const n = productCount.get(productId) ?? 0;
    totalBoxG += pieceG * n;
    totalPieces += n;
  }
  const totalBoxWeightG = Math.round(totalBoxG * 1000) / 1000;
  if (totalBoxWeightG <= 0) warnings.push("Total box weight is unknown.");

  // Earliest BBE across the *actual* products in the box — any expired piece
  // would taint the whole assortment, so we anchor BBE to the shortest shelf
  // life. We iterate the sale's `productCount` (rather than the collection's
  // `collectionProducts`) so bar / snack sales — whose product isn't a member
  // of the bonbon assortment — still get a correct value.
  let earliestWeeks: number | null = null;
  for (const productId of productCount.keys()) {
    const product = productMap.get(productId);
    const weeksStr = product?.shelfLifeWeeks;
    const weeks = weeksStr ? parseInt(weeksStr, 10) : NaN;
    if (Number.isFinite(weeks) && weeks > 0) {
      earliestWeeks = earliestWeeks == null ? weeks : Math.min(earliestWeeks, weeks);
    }
  }
  // BBE = packedAt + earliest shelf life. The shop print flow passes
  // `Sale.preparedAt` as `packedAt`; the editor's design-time preview omits
  // it (and the label correctly shows an em-dash) so users don't see a
  // misleading synthetic date.
  const bestBefore = packedAt && earliestWeeks != null
    ? new Date(packedAt.getTime() + earliestWeeks * 7 * 86400000)
    : null;
  if (earliestWeeks != null && !packedAt) {
    warnings.push(`Earliest product shelf life: ${earliestWeeks} weeks (BBE will populate from the sale's packing date at print time).`);
  }

  return {
    source,
    name: collection.name,
    perCavityWeightG: totalBoxWeightG,
    // When cells are known, totalCavityCount reflects the number of actually
    // filled cavities (skipping nulls); otherwise we fall back to the
    // packaging's nominal capacity.
    totalCavityCount: totalPieces > 0 ? totalPieces : packaging.capacity,
    ingredients,
    allergens: [...allergenSet].sort(),
    mayContain: [...facilityMayContain],
    nutritionPer100g: nutritionResult.per100g,
    bestBefore,
    batchNumber: "",
    producedAt: packedAt ?? null,
    origin: "",
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

    if (source.kind === "filling-batch") {
      const [plan, planFilling] = await Promise.all([
        db.productionPlans.get(source.planId),
        db.planFillings.get(source.planFillingId),
      ]);
      if (!plan || !planFilling) {
        return unresolvedContext(source, "Plan or plan-filling not found.");
      }
      const filling = await db.fillings.get(planFilling.fillingId);
      if (!filling?.id) {
        return unresolvedContext(source, "Filling not found.");
      }

      // Walk the filling-component graph so descendant fillings are loaded.
      const allFillingIds = new Set<string>([filling.id]);
      let frontier = new Set<string>([filling.id]);
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
      const [ingredientRows, componentRows] = await Promise.all([
        db.fillingIngredients.where("fillingId").anyOf(fillingIdArr).toArray(),
        db.fillingComponents.where("fillingId").anyOf(fillingIdArr).toArray(),
      ]);

      const fillingIngredientsMap = new Map<string, FillingIngredient[]>();
      for (const li of ingredientRows) {
        const arr = fillingIngredientsMap.get(li.fillingId) ?? [];
        arr.push(li);
        fillingIngredientsMap.set(li.fillingId, arr);
      }
      const fillingComponentsMap = new Map<string, FillingComponent[]>();
      for (const fc of componentRows) {
        const arr = fillingComponentsMap.get(fc.fillingId) ?? [];
        arr.push(fc);
        fillingComponentsMap.set(fc.fillingId, arr);
      }

      const ingredientIds = new Set<string>(ingredientRows.map((r) => r.ingredientId));
      const ingredients = ingredientIds.size > 0
        ? (await Promise.all([...ingredientIds].map((id) => db.ingredients.get(id))))
          .filter((i): i is Ingredient => !!i)
        : [];
      const ingredientMap = new Map(ingredients.filter((i) => !!i.id).map((i) => [i.id!, i]));

      const prefs = (await db.userPreferences.toArray())[0];
      const facilityMayContain = prefs?.facilityMayContain ?? [];

      return buildFillingBatchContext({
        source,
        plan,
        planFilling,
        filling,
        fillingIngredientsMap,
        fillingComponentsMap,
        ingredientMap,
        facilityMayContain,
      });
    }

    if (source.kind === "collection-package") {
      return await loadCollectionPackageContext(source.collectionId, source.packagingId);
    }

    // Only `production-batch` remains after the explicit branches above.

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
  }, [
    source?.kind,
    source && "planId" in source ? source.planId : null,
    source && "planProductId" in source ? source.planProductId : null,
    source && "planFillingId" in source ? source.planFillingId : null,
    source && "collectionId" in source ? source.collectionId : null,
    source && "packagingId" in source ? source.packagingId : null,
  ]);
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

/**
 * Load one `LabelContext` per `PlanFilling` in a completed batch. Mirrors
 * `loadProductionBatchContexts` but for filling-only / filling-side labels.
 * One label per planFilling: the user reprints if they want extras for split
 * containers from the leftover-modal flow.
 */
export async function loadFillingBatchContexts(planId: string): Promise<LabelContext[]> {
  const plan = await db.productionPlans.get(planId);
  if (!plan?.id) return [];

  const planFillings = await db.planFillings.where("planId").equals(planId).toArray();
  if (planFillings.length === 0) return [];

  const fillingIds = [...new Set(planFillings.map((pf) => pf.fillingId))];
  const fillings = fillingIds.length > 0
    ? await db.fillings.where("id").anyOf(fillingIds).toArray()
    : [];
  const fillingMap = new Map(fillings.filter((f) => !!f.id).map((f) => [f.id!, f]));

  // Walk the full filling-component graph from each host filling.
  const allFillingIds = new Set<string>(fillingIds);
  let frontier = new Set<string>(fillingIds);
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
  const [ingredientRows, componentRows] = await Promise.all([
    fillingIdArr.length > 0
      ? db.fillingIngredients.where("fillingId").anyOf(fillingIdArr).toArray()
      : Promise.resolve([] as FillingIngredient[]),
    fillingIdArr.length > 0
      ? db.fillingComponents.where("fillingId").anyOf(fillingIdArr).toArray()
      : Promise.resolve([] as FillingComponent[]),
  ]);

  const fillingIngredientsMap = new Map<string, FillingIngredient[]>();
  for (const li of ingredientRows) {
    const arr = fillingIngredientsMap.get(li.fillingId) ?? [];
    arr.push(li);
    fillingIngredientsMap.set(li.fillingId, arr);
  }
  const fillingComponentsMap = new Map<string, FillingComponent[]>();
  for (const fc of componentRows) {
    const arr = fillingComponentsMap.get(fc.fillingId) ?? [];
    arr.push(fc);
    fillingComponentsMap.set(fc.fillingId, arr);
  }

  const ingredientIds = new Set<string>(ingredientRows.map((r) => r.ingredientId));
  const ingredients = ingredientIds.size > 0
    ? await db.ingredients.where("id").anyOf([...ingredientIds]).toArray()
    : [];
  const ingredientMap = new Map(ingredients.filter((i) => !!i.id).map((i) => [i.id!, i]));

  const prefs = (await db.userPreferences.toArray())[0];
  const facilityMayContain = prefs?.facilityMayContain ?? [];

  return planFillings.map((pf) => {
    const filling = fillingMap.get(pf.fillingId);
    if (!filling?.id || !pf.id) {
      return unresolvedContext(
        { kind: "filling-batch", planId, planFillingId: pf.id ?? "" },
        "Filling or plan-filling row not found.",
      );
    }
    return buildFillingBatchContext({
      source: { kind: "filling-batch", planId, planFillingId: pf.id },
      plan,
      planFilling: pf,
      filling,
      fillingIngredientsMap,
      fillingComponentsMap,
      ingredientMap,
      facilityMayContain,
    });
  });
}

/**
 * Load a single `LabelContext` for the retail bonbon-box label identified by
 * `(collectionId, packagingId)`. Mirrors the per-batch loaders but returns
 * one context (boxes aren't enumerated; the user prints N copies of the same
 * PNG through their label printer rather than receiving N files).
 *
 * When `cells` is supplied (typically `Sale.cells` from the shop's prepared
 * sale the user is labelling), the resolver counts exact per-product
 * occurrences and renders the ingredient list / weight / nutrition against
 * the real box composition. When omitted, falls back to one-of-each for the
 * design-time preview.
 *
 * Returns a stub context with a warning when the collection or packaging row
 * is missing so the caller can still render an empty-state preview.
 */
export async function loadCollectionPackageContext(
  collectionId: string,
  packagingId: string,
  cells?: ReadonlyArray<string | null>,
  packedAt?: Date | null,
): Promise<LabelContext> {
  const source: Extract<LabelSource, { kind: "collection-package" }> = {
    kind: "collection-package", collectionId, packagingId,
  };

  const [collection, packaging] = await Promise.all([
    db.collections.get(collectionId),
    db.packaging.get(packagingId),
  ]);
  if (!collection || !packaging) {
    return unresolvedContext(source, "Collection or packaging not found.");
  }

  const collectionProducts = await db.collectionProducts
    .where("collectionId").equals(collectionId)
    .toArray();
  collectionProducts.sort((a, b) => a.sortOrder - b.sortOrder);

  // Union of every productId we need to resolve: the collection's defined
  // assortment plus anything referenced by the sale's actual cells. Bars /
  // snacks aren't members of `collectionProducts` (those only track the
  // bonbon assortment) so iterating the collection alone would miss them.
  const cellProductIds: string[] = cells
    ? cells.filter((c): c is string => !!c)
    : [];
  const productIds = [...new Set([
    ...collectionProducts.map((cp) => cp.productId),
    ...cellProductIds,
  ])];
  if (productIds.length === 0) {
    return unresolvedContext(source, "Collection has no products and no sale cells.");
  }
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

  const productFillings = productIds.length > 0
    ? await db.productFillings.where("productId").anyOf(productIds).toArray()
    : [];
  const productFillingsByProduct = new Map<string, ProductFilling[]>();
  for (const pf of productFillings) {
    const arr = productFillingsByProduct.get(pf.productId) ?? [];
    arr.push(pf);
    productFillingsByProduct.set(pf.productId, arr);
  }
  for (const arr of productFillingsByProduct.values()) {
    arr.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  // Walk filling-component graph from every host filling so descendants load.
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
  const [ingredientRows, componentRows] = await Promise.all([
    fillingIdArr.length > 0
      ? db.fillingIngredients.where("fillingId").anyOf(fillingIdArr).toArray()
      : Promise.resolve([] as FillingIngredient[]),
    fillingIdArr.length > 0
      ? db.fillingComponents.where("fillingId").anyOf(fillingIdArr).toArray()
      : Promise.resolve([] as FillingComponent[]),
  ]);

  const fillingIngredientsMap = new Map<string, FillingIngredient[]>();
  for (const li of ingredientRows) {
    const arr = fillingIngredientsMap.get(li.fillingId) ?? [];
    arr.push(li);
    fillingIngredientsMap.set(li.fillingId, arr);
  }
  const fillingComponentsMap = new Map<string, FillingComponent[]>();
  for (const fc of componentRows) {
    const arr = fillingComponentsMap.get(fc.fillingId) ?? [];
    arr.push(fc);
    fillingComponentsMap.set(fc.fillingId, arr);
  }

  const ingredientIds = new Set<string>(ingredientRows.map((r) => r.ingredientId));
  for (const p of products) if (p.shellIngredientId) ingredientIds.add(p.shellIngredientId);
  const ingredients = ingredientIds.size > 0
    ? await db.ingredients.where("id").anyOf([...ingredientIds]).toArray()
    : [];
  const ingredientMap = new Map(ingredients.filter((i) => !!i.id).map((i) => [i.id!, i]));

  const prefs = (await db.userPreferences.toArray())[0];
  const facilityMayContain = prefs?.facilityMayContain ?? [];

  return buildCollectionPackageContext({
    source,
    collection,
    packaging,
    collectionProducts,
    productMap,
    mouldMap,
    productFillingsByProduct,
    fillingIngredientsMap,
    fillingComponentsMap,
    ingredientMap,
    facilityMayContain,
    cells,
    packedAt,
  });
}

/**
 * Resolve a single `LabelContext` for the stock-page relabel flow. Wraps the
 * existing per-plan loaders and filters down to one row — callers want to
 * print exactly one sticker for a specific PlanProduct or FillingStock row,
 * not the whole batch.
 *
 * Returns null when the underlying plan/row can't be found (e.g. a manually
 * added filling-stock row that was never tied to a production plan).
 */
export async function loadProductionBatchContextForRow(
  planId: string,
  planProductId: string,
): Promise<LabelContext | null> {
  const contexts = await loadProductionBatchContexts(planId);
  return contexts.find(
    (ctx) => ctx.source.kind === "production-batch" && ctx.source.planProductId === planProductId,
  ) ?? null;
}

/**
 * Resolve a single filling-batch `LabelContext` from a `FillingStock` row.
 * Filling stock rows don't store the planFillingId directly — only planId and
 * fillingId — so we walk the plan's PlanFillings to find the matching pair.
 *
 * Manual / non-production stock rows (no `planId`) return null; the caller
 * should hide the relabel affordance in that case.
 */
export async function loadFillingBatchContextForStock(
  stockRow: { planId?: string; fillingId: string },
): Promise<LabelContext | null> {
  if (!stockRow.planId) return null;
  const planFillings = await db.planFillings.where("planId").equals(stockRow.planId).toArray();
  const pf = planFillings.find((p) => p.fillingId === stockRow.fillingId);
  if (!pf?.id) return null;
  const contexts = await loadFillingBatchContexts(stockRow.planId);
  return contexts.find(
    (ctx) => ctx.source.kind === "filling-batch" && ctx.source.planFillingId === pf.id,
  ) ?? null;
}

