/** @deprecated Use the `ingredientCategories` table instead. Kept as a fallback
 *  for tests, CSV import validation, and pre-v6 migration code. */
export const INGREDIENT_CATEGORIES = [
  "Alcohol",
  "Chocolate",
  "Essential Oils",
  "Extra",
  "Fats",
  "Flavors & Additives",
  "Infusions",
  "Liquids",
  "Nuts / Nut Pastes / Pralines",
  "Sugars",
] as const;

export interface IngredientCategory {
  id?: string;
  name: string;
  /** Soft-delete: archived categories are hidden from create pickers but preserved on existing ingredients. */
  archived?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Default seeded ingredient categories — created on first run and re-created if missing. */
export const DEFAULT_INGREDIENT_CATEGORIES: ReadonlyArray<{ name: string }> = [
  { name: "Alcohol" },
  { name: "Chocolate" },
  { name: "Essential Oils" },
  { name: "Extra" },
  { name: "Fats" },
  { name: "Flavors & Additives" },
  { name: "Infusions" },
  { name: "Liquids" },
  { name: "Nuts / Nut Pastes / Pralines" },
  { name: "Sugars" },
];

export interface Ingredient {
  id?: string;
  name: string;
  manufacturer: string;
  brand?: string;           // product brand (e.g. "Valrhona", "Callebaut") — free-text with suggestions
  vendor?: string;           // where purchased (e.g. "Keylink", "Chocolate Trading Co") — free-text with suggestions
  source: string;
  cost: number; // legacy — superseded by purchaseCost
  notes: string;
  category?: string; // e.g. "Chocolate", "Fats" — from INGREDIENT_CATEGORIES
  // Purchase pricing
  purchaseCost?: number;    // total price paid
  purchaseDate?: string;    // ISO date string e.g. "2025-03-01"
  purchaseQty?: number;     // quantity purchased
  purchaseUnit?: string;    // unit of purchase e.g. "g", "kg", "pcs"
  gramsPerUnit?: number;    // grams per purchase unit — auto-set when purchaseUnit is "g" or "kg"
  // Composition (percentages, must sum to 100%)
  cacaoFat: number;
  sugar: number;
  milkFat: number;
  water: number;
  solids: number;
  otherFats: number;
  alcohol?: number;  // % alcohol content (spirits, liqueurs) — optional, defaults to 0
  // Allergens & food compatibility
  allergens: string[];
  archived?: boolean; // soft-delete: hidden from lists, preserved for production history
  pricingIrrelevant?: boolean; // true = ingredient has no meaningful cost (e.g. water, salt) — treated as zero cost, no missing-pricing warning
  /** True when this ingredient can serve as a product shell (couverture/coating chocolate).
   *  Only meaningful when category === "Chocolate"; UI shows the checkbox only for that category.
   *  Drives the shell-ingredient picker on the product detail page. */
  shellCapable?: boolean;
  commercialName?: string; // commercial/product name (e.g. "Guanaja 70%")
  updatedAt?: Date;
  // Shopping / restock tracking
  lowStock?: boolean;         // true = flagged as running low, shown on shopping list
  lowStockSince?: number;     // Date.now() when flagged
  lowStockOrdered?: boolean;  // true = order placed, awaiting delivery
  outOfStock?: boolean;       // true = completely out, higher urgency than lowStock
  // Nutrition data (all values per 100g of ingredient)
  nutrition?: import("@/lib/nutrition").NutritionData;
}

/** Derive cost per gram from purchase fields. Returns null if data is insufficient.
 *  Returns 0 for ingredients marked pricingIrrelevant (e.g. water, salt) — contributes zero cost without raising a missing-data warning.
 *  purchaseQty defaults to 1 when absent — supports the simplified "price for X grams" model. */
export function costPerGram(ing: Ingredient): number | null {
  if (ing.pricingIrrelevant) return 0;
  const { purchaseCost, purchaseQty, purchaseUnit } = ing;
  if (!purchaseCost) return null;
  // For unambiguous units (g, kg), derive gramsPerUnit from the unit itself rather
  // than trusting the stored value — repairs ingredients saved with a stale default
  // (pre-fix, new ingredients defaulted gramsPerUnit=1000 even when the unit was g).
  const gramsPerUnit =
    purchaseUnit === "g" ? 1 :
    purchaseUnit === "kg" ? 1000 :
    ing.gramsPerUnit;
  if (!gramsPerUnit) return null;
  const totalGrams = (purchaseQty ?? 1) * gramsPerUnit;
  if (totalGrams <= 0) return null;
  return purchaseCost / totalGrams;
}

/** Returns true if the ingredient has pricing data or is explicitly marked as pricing-irrelevant. */
export function hasPricingData(ing: Ingredient): boolean {
  return costPerGram(ing) !== null;
}

export const SHELL_TECHNIQUES = [
  "Airbrushing",
  "Brushing",
  "Droplet / Water Spotting",
  "Dual-Tone Swirling",
  "Finger Painting",
  "Layered Scratch-Back",
  "Masking / Taping",
  "Piping (Inside the Mould)",
  "Splattering / Speckling",
  "Spin & Drip",
  "Sponging",
  "Stamping",
  "Stenciling",
  "Transfer Sheet",
] as const;

/** Production phase where a decoration step can be applied.
 *  Maps 1:1 to production plan phase IDs, except "filling" which is not decoration-relevant.
 *  Legacy values "on_mould" and "after_cap" are kept for backward compat and treated as
 *  aliases for "colour" and "cap" respectively. */
export type ShellDesignApplyAt = "colour" | "shell" | "fill" | "cap" | "unmould" | "on_mould" | "after_cap";

/** Normalise legacy applyAt values to canonical production phase IDs. */
export function normalizeApplyAt(applyAt: string | undefined): "colour" | "shell" | "fill" | "cap" | "unmould" {
  if (applyAt === "on_mould" || applyAt === "colour" || !applyAt) return "colour";
  if (applyAt === "after_cap" || applyAt === "cap") return "cap";
  if (applyAt === "shell") return "shell";
  if (applyAt === "fill") return "fill";
  if (applyAt === "unmould") return "unmould";
  return "colour";
}

/** All production phases available as decoration step targets (excludes "filling"). */
export const DECORATION_APPLY_AT_OPTIONS: ReadonlyArray<{ value: "colour" | "shell" | "fill" | "cap" | "unmould"; label: string }> = [
  { value: "colour",  label: "Colour" },
  { value: "shell",   label: "Shell" },
  { value: "fill",    label: "Fill" },
  { value: "cap",     label: "Cap" },
  { value: "unmould", label: "Unmould" },
];

export interface ShellDesignStep {
  technique: string;
  materialIds: string[]; // references to DecorationMaterial.id
  notes?: string;
  /** When to apply this decoration step. Default "on_mould" = colour tab.
   *  Transfer sheet materials always apply at cap regardless of this field. */
  applyAt?: ShellDesignApplyAt;
}

export interface Product {
  id?: string;
  name: string;
  photo?: string; // base64 encoded image
  popularity?: number; // 1–5 stars
  productCategoryId?: string; // FK → ProductCategory.id (replaces the old free-text productType)
  /** Direct FK to the shell chocolate ingredient (must have shellCapable=true).
   *  Replaces the old `coating` string + CoatingChocolateMapping lookup. */
  shellIngredientId?: string;
  /** Shell as a percentage of total cavity weight (0–100). Bounded by the product
   *  category's [shellPercentMin, shellPercentMax]. Defaults to the category's
   *  defaultShellPercent. When 0 → no shell (e.g. bean-to-bar). When 100 → shell only. */
  shellPercentage?: number;
  /** How fill amounts are specified: "percentage" (default) = each filling gets a % of the
   *  fill volume; "grams" = user enters exact grams per filling per cavity, shell = remainder. */
  fillMode?: "percentage" | "grams";
  /** @deprecated Legacy coating name (e.g. "dark", "milk"). Kept on old records for
   *  backward-compatible display and production grouping. Not written by new code. */
  coating?: string;
  tags?: string[]; // user-defined labels e.g. "christmas", "spring"
  notes?: string;
  shelfLifeWeeks?: string;
  /** Threshold below which the product is flagged as "low stock" in the production wizard.
   *  Compared against the sum of `currentStock` across in-stock batches. When unset,
   *  the wizard falls back to the legacy per-batch `stockStatus` flag. */
  lowStockThreshold?: number;
  /** Timestamp (ms) of the most recent manual stock count. Set by `updateProductStockCount`. */
  stockCountedAt?: number;
  defaultMouldId?: string;
  defaultBatchQty?: number; // default: 1
  shellDesign?: ShellDesignStep[]; // ordered decoration steps for moulded products
  vegan?: boolean; // user-set flag; shown as a leaf icon on printed batch labels
  /** Colour used to render this product in the Shop (bonbon discs, cavity
   *  previews, palette tiles). 7-char hex ("#rrggbb"). When unset, the Shop
   *  derives one from the first colour-phase decoration material; if that
   *  also fails, it falls back to a deterministic hash of the product name. */
  shopColor?: string;
  archived?: boolean; // soft-delete: hidden from lists, preserved for production history
  createdAt: Date;
  updatedAt: Date;
}

/**
 * ShopKind — the visual shape used to render a product everywhere in the Shop
 * (palette tiles, cavity contents, summary chips, give-away pickers).
 *
 * Kinds:
 *   - "moulded"   → round glossy disc (polycarb-mould chocolate)
 *   - "enrobed"   → square slab with matte finish (slab cut + dipped)
 *   - "bar"       → long horizontal segment with cast lines (chocolate bar)
 *   - "snack-bar" → moulded but larger and elongated (single-piece snack format,
 *                   produced like a moulded bonbon but in its own packaging)
 *
 * The kind is set on the user-managed ProductCategory so adding a new category
 * (e.g. "praline tablet") just requires picking which existing visual it should
 * render as — no schema migration per category.
 */
export type ShopKind = "moulded" | "enrobed" | "bar" | "snack-bar";

/**
 * ProductCategory — user-managed top-level grouping for products (e.g. "moulded", "bar").
 * Replaces the old free-text `productType` string. Each category configures the
 * recommended shell-percentage range and default for products in that category.
 *
 * Bar-like behaviour is implicit from the range:
 *   - shellPercentMin === 0  → category allows the layers section to be the whole product (e.g. bean-to-bar)
 *   - shellPercentMax === 100 → category allows shell-only products (e.g. plain bar)
 */
export interface ProductCategory {
  id?: string;
  name: string;
  /** Lower bound of the recommended shell percentage (0–100). */
  shellPercentMin: number;
  /** Upper bound of the recommended shell percentage (0–100, must be >= min). */
  shellPercentMax: number;
  /** Default shell percentage for new products in this category (must lie within [min, max]). */
  defaultShellPercent: number;
  /** Visual shape used everywhere in the Shop. When unset, products fall back
   *  to "moulded" — a safe default for legacy categories that pre-date this field. */
  shopKind?: ShopKind;
  /** Soft-delete: archived categories are hidden from create pickers but preserved on existing products. */
  archived?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Default seeded categories — created on first run and re-created if missing. */
export const DEFAULT_PRODUCT_CATEGORIES: ReadonlyArray<{
  name: string;
  shellPercentMin: number;
  shellPercentMax: number;
  defaultShellPercent: number;
  shopKind: ShopKind;
}> = [
  { name: "moulded",   shellPercentMin: 15, shellPercentMax: 50,  defaultShellPercent: 37, shopKind: "moulded" },
  { name: "enrobed",   shellPercentMin: 0,  shellPercentMax: 100, defaultShellPercent: 20, shopKind: "enrobed" },
  { name: "snack bar", shellPercentMin: 15, shellPercentMax: 50,  defaultShellPercent: 37, shopKind: "snack-bar" },
  { name: "bar",       shellPercentMin: 0,  shellPercentMax: 100, defaultShellPercent: 50, shopKind: "bar" },
];

export type FillMode = "percentage" | "grams";
export const FILL_MODES: readonly FillMode[] = ["percentage", "grams"];

export const DEFAULT_COATINGS = ["dark", "milk", "white", "vegan white", "vegan milk", "caramel"] as const;

export const DEFAULT_FILLING_STATUSES = ["to try", "testing", "confirmed"] as const;
/** @deprecated Use DEFAULT_FILLING_STATUSES — kept for backward compat */
export const FILLING_STATUSES = DEFAULT_FILLING_STATUSES;
export type FillingStatus = string;

// Filling is a standalone, reusable entity — the core component of a product
export interface Filling {
  id?: string;
  name: string;
  category: string;
  subcategory?: string; // legacy field — no longer used in UI
  source: string; // e.g. book name, website, "original"
  description: string;
  allergens: string[]; // auto-aggregated from ingredients
  instructions: string;
  status?: FillingStatus;
  shelfLifeWeeks?: number; // shelf life in weeks — relevant for shelf-stable categories (Pralines, Fruit-Based)
  /** Measured cooked yield in grams — what the pan weighs after cooking, tare subtracted.
   *  When set, rescaling math uses this as the base instead of the raw ingredient sum,
   *  so "produce 600 g of filling" means 600 g on the scale after reducing. Optional —
   *  fillings without cook-loss (ganaches, pralinés) can leave this undefined. */
  measuredYieldG?: number;
  // Versioning fields
  rootId?: string;        // undefined for unforked fillings; set to v1.id once any fork is made
  version?: number;       // 1-indexed; undefined = legacy unforked filling (treat as v1)
  createdAt?: Date;       // when this version was created
  supersededAt?: Date;    // set when a newer version is forked; undefined = current version
  versionNotes?: string;  // optional notes describing what changed in this version
  archived?: boolean;     // soft-delete: hidden from lists, preserved for production history
}

// Tracks which filling version was used in a product and when it was swapped out
export interface ProductFillingHistory {
  id?: string;
  productId: string;
  fillingId: string;            // the old (superseded) filling version id
  replacedByFillingId: string;  // the new filling version id
  fillPercentage: number;
  sortOrder: number;
  replacedAt: Date;
}

export interface CategoryDef {
  name: string;
}

export const FILLING_CATEGORIES: CategoryDef[] = [
  { name: "Ganaches (Emulsions)" },
  { name: "Pralines & Giandujas (Nut-Based)" },
  { name: "Caramels & Syrups (Sugar-Based)" },
  { name: "Fruit-Based (Pectins & Acids)" },
  { name: "Croustillants & Biscuits (The \"Crunch\" Filling)" },
];

/** Configurable filling category record. The `name` is the link key —
 *  `Filling.category` stores the same string. Renames cascade. */
export interface FillingCategory {
  id?: string;
  name: string;
  /** When true, the production wizard prompts the user for a batch multiplier
   *  instead of scaling the recipe to fit the cavities. */
  shelfStable: boolean;
  archived?: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/** Initial seed for the fillingCategories table. Names match FILLING_CATEGORIES;
 *  Pralines and Fruit-Based default to shelfStable=true to preserve prior behavior. */
export const DEFAULT_FILLING_CATEGORIES: { name: string; shelfStable: boolean }[] = [
  { name: "Ganaches (Emulsions)", shelfStable: false },
  { name: "Pralines & Giandujas (Nut-Based)", shelfStable: true },
  { name: "Caramels & Syrups (Sugar-Based)", shelfStable: false },
  { name: "Fruit-Based (Pectins & Acids)", shelfStable: true },
  { name: "Croustillants & Biscuits (The \"Crunch\" Filling)", shelfStable: false },
];

// Join table: which fillings belong to which product, and in what order
export interface ProductFilling {
  id?: string;
  productId: string;
  fillingId: string;
  sortOrder: number;
  /** Percentage of the fill volume this filling occupies (0–100). Must sum to 100 across
   *  all fillings for a product. Used when `Product.fillMode === "percentage"` (the default). */
  fillPercentage: number;
  /** Exact grams of this filling per cavity. Used when `Product.fillMode === "grams"`.
   *  Shell weight is derived as cavity weight minus the sum of all fillGrams (÷ density). */
  fillGrams?: number;
}

export interface FillingIngredient {
  id?: string;
  fillingId: string;
  ingredientId: string;
  amount: number;
  unit: string;
  sortOrder?: number;
  note?: string;
}

// Key-value settings store for user-extendable option lists
/** @deprecated Use UserPreferences instead — AppSetting used `key` as primary key
 *  which prevented Dexie Cloud sync. Kept for backward-compatible backup import. */
export interface AppSetting {
  key: string; // e.g. "coatings", "marketRegion", "currency"
  value: string; // JSON-encoded value
}

/**
 * Single-record preferences table that syncs across devices via Dexie Cloud.
 * Replaces the old key-value `settings` table (which used `key` as primary key
 * and therefore stayed device-local).
 */
export interface UserPreferences {
  id?: string;
  marketRegion: MarketRegion;
  currency: CurrencyCode;
  defaultFillMode: FillMode;
  facilityMayContain: string[];
  coatings: string[];
  /** Last app version for which the user saw (or was seeded past) the "What's new" banner. */
  lastSeenVersion?: string;
  updatedAt: Date;
}

export interface Mould {
  id?: string;
  name: string;
  productNumber?: string;
  brand?: string;
  cavityWeightG: number;          // manufacturer's stated weight of a fully filled solid cavity (g)
  numberOfCavities: number;
  fillingGramsPerCavity?: number; // net filling weight per cavity in grams (excluding shell + cap)
  quantityOwned?: number; // how many physical copies of this mould the user owns
  photo?: string; // base64 encoded image
  notes?: string;
  archived?: boolean;
}

// --- Production Planning ---

/** One shelf-stable filling entry sourced from a prior batch rather than made fresh */
export interface FillingPreviousBatch {
  madeAt: string;            // ISO date string — when the previous batch was made
  shelfLifeWeeks?: number;   // shelf life of that filling in weeks (optional — omitted when unknown)
  fillingName?: string;      // captured at plan-creation time for the batch summary
  /** When true, frozen FillingStock entries are eligible for consumption alongside
   *  available ones. Any frozen entry touched is implicitly defrosted. */
  includeFrozen?: boolean;
}

export interface ProductionPlan {
  id?: string;
  batchNumber?: string; // e.g. "20260322-001" — assigned on creation, never changes
  name: string;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  status: "draft" | "active" | "done";
  notes?: string;
  // JSON-encoded Record<fillingId, multiplier> for shelf-stable fillings (Fruit & Acid, Nut-Based)
  fillingOverrides?: string;
  // JSON-encoded Record<fillingId, FillingPreviousBatch> — fillings sourced from a prior batch
  fillingPreviousBatches?: string;
  // Plain-text snapshot generated when the batch is marked done — used for recall tracing
  batchSummary?: string;
}

/** @deprecated Shelf-stability is now a per-category flag stored on `fillingCategories.shelfStable`.
 *  Kept as a legacy fallback (used only when the FillingCategory record is missing). */
export const SHELF_STABLE_CATEGORIES = ["Fruit-Based (Pectins & Acids)", "Pralines & Giandujas (Nut-Based)"] as const;

/** Additional mould entry for a plan product — used for the rare case where a
 *  user pours the same product into more than one mould type, or wants to fill
 *  only part of a mould. Populated from the "Alternative mould setup" disclosure
 *  in the new-plan wizard; undefined/empty for the default single-mould path. */
export interface PlanProductAdditionalMould {
  mouldId: string;
  /** Number of physical moulds to fill at full capacity. Ignored when `partialCavities` is set. */
  quantity: number;
  /** When set, fill exactly this many cavities (overrides quantity × numberOfCavities). */
  partialCavities?: number;
}

export interface PlanProduct {
  id?: string;
  planId: string;
  productId: string;
  mouldId: string;
  quantity: number; // number of moulds used
  /** When set, only fill this many cavities of the primary mould (overrides
   *  quantity × numberOfCavities for cavity/volume math). Undefined = full fill. */
  partialCavities?: number;
  /** Extra mould types used for the same product. Summed into total cavity count. */
  additionalMoulds?: PlanProductAdditionalMould[];
  sortOrder: number;
  notes?: string;
  stockStatus?: "low" | "gone"; // undefined = in stock
  actualYield?: number; // products added to stock after unmoulding (default = quantity × cavities)
  /** Current pieces remaining in stock for this batch. Defaults to `actualYield` until
   *  a manual count adjusts it. `updateProductStockCount` mutates this FIFO across batches. */
  currentStock?: number;
  /** Pieces in the freezer for this batch. Tracked separately from `currentStock` —
   *  frozen pieces don't count toward low-stock alerts and are skipped by manual
   *  stock-count reconciliation. */
  frozenQty?: number;
  /** Timestamp of the most recent freeze action (ms). Undefined when `frozenQty === 0`. */
  frozenAt?: number;
  /** Days of shelf life captured at the time of freezing — applied from `defrostedAt`
   *  to compute the new sell-by date once defrosted. User-editable in the freeze modal
   *  (defaults to the remaining shelf life at freeze time). */
  preservedShelfLifeDays?: number;
  /** Timestamp of the most recent defrost (ms). Sell-by date for defrosted pieces
   *  becomes `defrostedAt + preservedShelfLifeDays`. */
  defrostedAt?: number;
}

// Step completion is keyed by a deterministic string derived at runtime.
// stepKey formats:
//   "color-{mouldId}"                 — colour/brush mould
//   "shell-{mouldId}"                 — shell mould
//   "filling-{planProductId}-{fillingId}" — make a filling (product-driven)
//   "planfilling-{planFillingId}"    — make a standalone filling batch (filling-only / hybrid plans)
//   "fill-{planProductId}"            — fill shells for a product
//   "cap-{mouldId}"                   — cap mould
export interface PlanStepStatus {
  id?: string;
  planId: string;
  stepKey: string;
  done: boolean;
  doneAt?: Date;
}

/** A standalone filling batch scheduled in a production plan.
 *  Produces FillingStock on completion. Coexists with PlanProduct in the same
 *  plan — a plan with PlanProducts only is "full", PlanFillings only is
 *  "fillings-only", both is "hybrid". The mode is derived, not stored. */
export interface PlanFilling {
  id?: string;
  planId: string;
  fillingId: string;
  /** Target weight of this batch in grams. Multiplier vs the recipe's base
   *  total grams is derived for display. Free-form so users can top up stock
   *  to any amount. */
  targetGrams: number;
  sortOrder: number;
  notes?: string;
  /** Actual yield captured at finalize-time. When the plan is marked done,
   *  a FillingStock row is written with remainingG = actualYieldG ?? targetGrams. */
  actualYieldG?: number;
  /** Ingredient stock status for this filling's recipe — shown in the plan
   *  warning summary the same way PlanProduct.stockStatus does. */
  stockStatus?: "low" | "gone";
}

// --- Filling Stock (leftover filling) ---

export interface FillingStock {
  id?: string;
  fillingId: string;
  remainingG: number;    // grams of filling left
  planId?: string;       // which production plan created this stock (optional — can be added manually)
  madeAt: string;        // ISO date string — when this filling was made
  notes?: string;
  createdAt: number;     // Date.now()
  /** When true, this stock is in the freezer — not available for use without defrosting.
   *  Freshness calculation uses `preservedShelfLifeDays` from `defrostedAt` once thawed. */
  frozen?: boolean;
  /** Timestamp of the most recent freeze (ms). */
  frozenAt?: number;
  /** Days of shelf life captured at freeze time — applied from `defrostedAt` once thawed. */
  preservedShelfLifeDays?: number;
  /** Timestamp of the most recent defrost (ms). */
  defrostedAt?: number;
}

// --- Cost tracking ---

/** One entry in the cost breakdown for a single product cavity */
export interface BreakdownEntry {
  label: string;           // e.g. "Dark ganache — cream 35%" or "Shell (dark)"
  grams: number;
  costPerGram: number;
  subtotal: number;
  kind: "filling_ingredient" | "shell" | "cap";
  ingredientId?: string;
  fillingId?: string;
}

/** Append-only log of cost-per-gram changes for an ingredient */
export interface IngredientPriceHistory {
  id?: string;
  ingredientId: string;
  costPerGram: number;
  recordedAt: Date;
  purchaseCost?: number;
  purchaseQty?: number;
  purchaseUnit?: string;
  gramsPerUnit?: number;
  note?: string;
}

/** Time-series record of which chocolate ingredient maps to a coating name */
export interface CoatingChocolateMapping {
  id?: string;
  coatingName: string;      // e.g. "dark", "milk"
  ingredientId: string;     // must be category = "Chocolate"
  effectiveFrom: Date;
  note?: string;
  seedTempering?: boolean;  // true = hand temper using seeding method; drives chocolate amount calc in production
}

/** Point-in-time cost per product (1 cavity) snapshot */
export interface ProductCostSnapshot {
  id?: string;
  productId: string;
  costPerProduct: number;
  breakdown: string;        // JSON: BreakdownEntry[]
  recordedAt: Date;
  triggerType: "ingredient_price" | "filling_version" | "mould_change" | "coating_change" | "shell_change" | "manual";
  triggerDetail: string;    // human-readable reason
  mouldId?: string;
  coatingName?: string;
}

// --- Product Lab (experiments / formulation sandbox) ---

export const GANACHE_TYPES = ["dark", "milk", "white"] as const;
export type GanacheType = (typeof GANACHE_TYPES)[number];


/**
 * Universal target ranges used by the Product Lab balance checker.
 * These are type-agnostic guidelines drawn from Wybauw (Fine Chocolates Gold),
 * Mel Ogmen's whitepaper published on ganachemaster.com, and Lizi Vermaas-Viola's formulation notes.
 * The water/sugar and total-fat relationships are enforced as correlation
 * warnings rather than hard per-component limits.
 */
export const UNIVERSAL_GANACHE_RANGES: GanacheRanges = {
  water:     { min: 19, max: 22 },
  sugar:     { min: 29, max: 35 },
  cacaoFat:  { min: 15, max: 23 },
  milkFat:   { min: 15, max: 23 },
  otherFats: { min:  0, max: 20 },
  solids:    { min:  3, max: 14 },
};

export interface GanacheComponentRange {
  min: number;
  max: number;
}

export interface GanacheRanges {
  sugar: GanacheComponentRange;        // Total sugars
  cacaoFat: GanacheComponentRange;     // Cocoa butter
  milkFat: GanacheComponentRange;      // Dairy / milk fat
  otherFats: GanacheComponentRange;    // Non-dairy fats (coconut oil, nut fats, etc.)
  solids: GanacheComponentRange;       // Cocoa solids (dry mass)
  water: GanacheComponentRange;        // Water content
}


export interface Experiment {
  id?: string;
  name: string;
  ganacheType?: GanacheType;
  applicationType?: "moulded" | "coated";
  notes?: string;
  sourceFillingId?: string; // if cloned from an existing filling
  // Versioning — mirrors the Filling versioning pattern
  rootId?: string;       // undefined for v1; set to root experiment's id once any fork is made
  version?: number;      // 1-indexed; undefined = unforked (treat as v1)
  supersededAt?: Date;   // set when a newer version is forked; undefined = current version
  // Batch run outcome
  status?: "to_improve" | "promoted"; // undefined = in-progress experiment
  promotedFillingId?: string;          // set when promoted to a filling
  tasteFeedback?: number;              // 1–5 rating from test batch
  textureFeedback?: number;            // 1–5 rating from test batch
  batchNotes?: string;                 // free-text notes from test batch
  createdAt: Date;
  updatedAt: Date;
}

export interface ExperimentIngredient {
  id?: string;
  experimentId: string;
  ingredientId: string;
  amount: number; // always grams
  sortOrder?: number;
}

export interface AllergenInfo {
  id: string;
  label: string;
  group?: string;   // "nuts" = this is a nut subtype
  hint?: string;    // clarifying examples
}

/** Shared tree nut subtypes — reused across all regions.
 *  Canada requires pine nuts as a priority tree nut (Health Canada lists 9); EU/UK (8), US
 *  (FALCPA, pine nut optional but commonly declared) and AU don't mandate it but users may
 *  still tick it for cross-market labelling. */
const TREE_NUTS: AllergenInfo[] = [
  { id: "nuts_almonds",    label: "Almonds",                      group: "nuts" },
  { id: "nuts_hazelnuts",  label: "Hazelnuts",                    group: "nuts" },
  { id: "nuts_walnuts",    label: "Walnuts",                      group: "nuts" },
  { id: "nuts_cashews",    label: "Cashews",                      group: "nuts" },
  { id: "nuts_pecans",     label: "Pecan nuts",                   group: "nuts" },
  { id: "nuts_brazil",     label: "Brazil nuts",                  group: "nuts" },
  { id: "nuts_pistachios", label: "Pistachio nuts",               group: "nuts" },
  { id: "nuts_macadamia",  label: "Macadamia / Queensland nuts",  group: "nuts" },
  { id: "nuts_pine",       label: "Pine nuts",                    group: "nuts" },
];

/** All 14 EU FIC allergens (Regulation 1169/2011), with tree nuts expanded to individual subtypes */
export const EU_ALLERGENS: AllergenInfo[] = [
  { id: "gluten",       label: "Cereals containing gluten", hint: "wheat, rye, barley, oats, spelt, kamut" },
  { id: "crustaceans",  label: "Crustaceans",               hint: "shrimp, prawns, crab, lobster" },
  { id: "eggs",         label: "Eggs" },
  { id: "fish",         label: "Fish" },
  { id: "peanuts",      label: "Peanuts" },
  { id: "soybeans",     label: "Soybeans" },
  { id: "milk",         label: "Milk",                      hint: "including lactose" },
  ...TREE_NUTS,
  { id: "celery",       label: "Celery",                    hint: "including celeriac" },
  { id: "mustard",      label: "Mustard" },
  { id: "sesame",       label: "Sesame seeds" },
  { id: "sulphites",    label: "Sulphur dioxide & sulphites", hint: ">10 mg/kg or 10 mg/litre expressed as SO₂" },
  { id: "lupin",        label: "Lupin",                     hint: "including lupin flour and seeds" },
  { id: "molluscs",     label: "Molluscs",                  hint: "clams, mussels, oysters, scallops, snails, squid" },
];

/** UK — same 14 EU allergens (Assimilated FIC + Natasha's Law 2021).
 *  Natasha's Law: prepacked-for-direct-sale foods must show full ingredient list with allergens emphasised. */
export const UK_ALLERGENS: AllergenInfo[] = EU_ALLERGENS;

/** 9 major food allergens under US FALCPA 2004 + FASTER Act 2023 */
export const US_ALLERGENS: AllergenInfo[] = [
  { id: "milk",       label: "Milk" },
  { id: "eggs",       label: "Eggs" },
  { id: "fish",       label: "Fish",       hint: "specify type e.g. salmon, tuna, tilapia" },
  { id: "shellfish",  label: "Shellfish",  hint: "specify type e.g. shrimp, crab, lobster" },
  ...TREE_NUTS,
  { id: "wheat",      label: "Wheat" },
  { id: "peanuts",    label: "Peanuts" },
  { id: "soybeans",   label: "Soybeans" },
  { id: "sesame",     label: "Sesame seeds", hint: "FASTER Act, mandatory from Jan 1 2023" },
];

/** Australia / New Zealand — PEAL (Plain English Allergen Labelling), full force 25 Feb 2024.
 *  Drops celery, lupin, mustard vs EU. Each nut and mollusc must be named individually.
 *  Mandatory "Contains:" summary statement. Gluten + wheat must both appear in summary. */
export const AU_ALLERGENS: AllergenInfo[] = [
  { id: "gluten",       label: "Gluten",                    hint: "wheat, rye, barley, oats — each cereal named in ingredients, 'gluten' in Contains summary" },
  { id: "crustaceans",  label: "Crustaceans",               hint: "specify type e.g. prawn, crab, lobster" },
  { id: "eggs",         label: "Eggs" },
  { id: "fish",         label: "Fish",                      hint: "specify type e.g. salmon, tuna" },
  { id: "peanuts",      label: "Peanuts" },
  { id: "soybeans",     label: "Soybeans" },
  { id: "milk",         label: "Milk" },
  ...TREE_NUTS,
  { id: "sesame",       label: "Sesame seeds" },
  { id: "sulphites",    label: "Sulphur dioxide & sulphites", hint: ">10 mg/kg or 10 mg/litre expressed as SO₂" },
  { id: "molluscs",     label: "Molluscs",                  hint: "specify type e.g. oyster, mussel, squid — each must be named individually" },
];

/** Canada — Health Canada / CFIA (Food and Drugs Act, Safe Food for Canadians Act).
 *  11 priority allergens + gluten sources (barley, rye, oats, triticale — declared separately from wheat)
 *  + added sulphites. Each tree nut must be named individually (like AU). Bold emphasis is NOT required.
 *  Labels must be bilingual (English + French) — relevant once label printing is supported. */
export const CA_ALLERGENS: AllergenInfo[] = [
  { id: "wheat",        label: "Wheat",                      hint: "wheat & triticale — named in ingredients and Contains statement" },
  { id: "gluten",       label: "Gluten sources",             hint: "barley, rye, oats — declared separately from wheat" },
  { id: "crustaceans",  label: "Crustaceans",                hint: "specify type e.g. shrimp, crab, lobster" },
  { id: "molluscs",     label: "Molluscs",                   hint: "specify type e.g. oyster, mussel, squid" },
  { id: "eggs",         label: "Eggs" },
  { id: "fish",         label: "Fish",                       hint: "specify type e.g. salmon, tuna" },
  { id: "peanuts",      label: "Peanuts" },
  { id: "soybeans",     label: "Soy" },
  { id: "milk",         label: "Milk" },
  ...TREE_NUTS,
  { id: "sesame",       label: "Sesame seeds" },
  { id: "mustard",      label: "Mustard" },
  { id: "sulphites",    label: "Sulphites",                  hint: "≥10 ppm declared as added sulphites" },
];

export type MarketRegion = "EU" | "UK" | "US" | "AU" | "CA";

/** Label formatting rules per market */
export interface MarketLabelRules {
  /** Display name for the market */
  label: string;
  /** Short description of the governing regulation */
  regulation: string;
  /** Whether a separate "Contains: ..." summary statement is mandatory */
  requiresContainsSummary: boolean;
  /** Whether allergens must be emphasised (bold/underline) in the ingredients list */
  requiresEmphasisInIngredients: boolean;
  /** Additional notes for the label output (e.g. Natasha's Law) */
  notes?: string;
}

export const MARKET_LABEL_RULES: Record<MarketRegion, MarketLabelRules> = {
  EU: {
    label: "European Union",
    regulation: "FIC Regulation 1169/2011",
    requiresContainsSummary: false,
    requiresEmphasisInIngredients: true,
  },
  UK: {
    label: "United Kingdom",
    regulation: "Assimilated FIC + Natasha's Law 2021",
    requiresContainsSummary: false,
    requiresEmphasisInIngredients: true,
    notes: "Natasha's Law: prepacked-for-direct-sale requires full ingredient list with allergens emphasised",
  },
  US: {
    label: "United States",
    regulation: "FALCPA 2004 + FASTER Act 2023",
    requiresContainsSummary: false,
    requiresEmphasisInIngredients: false,
  },
  AU: {
    label: "Australia / New Zealand",
    regulation: "PEAL / Food Standards Code (25 Feb 2024)",
    requiresContainsSummary: true,
    requiresEmphasisInIngredients: true,
    notes: "Each nut and mollusc must be named individually. Gluten + wheat must both appear in Contains summary.",
  },
  CA: {
    label: "Canada",
    regulation: "Health Canada / CFIA — Food and Drugs Act",
    requiresContainsSummary: false,
    requiresEmphasisInIngredients: false,
    notes: "Bilingual labels (English + French) are mandatory. Each tree nut must be named individually. Gluten sources (barley, rye, oats) declared separately from wheat.",
  },
};

// --- Currency ---

export const SUPPORTED_CURRENCIES = ["EUR", "USD", "CAD", "GBP", "CHF", "AUD", "NZD"] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export interface CurrencyInfo {
  code: CurrencyCode;
  symbol: string;
  label: string;
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: "EUR", symbol: "€", label: "Euro (€)" },
  { code: "USD", symbol: "$", label: "US Dollar ($)" },
  { code: "CAD", symbol: "CA$", label: "Canadian Dollar (CA$)" },
  { code: "GBP", symbol: "£", label: "British Pound (£)" },
  { code: "CHF", symbol: "CHF", label: "Swiss Franc (CHF)" },
  { code: "AUD", symbol: "A$", label: "Australian Dollar (A$)" },
  { code: "NZD", symbol: "NZ$", label: "New Zealand Dollar (NZ$)" },
];

export function getCurrencySymbol(code: CurrencyCode): string {
  return CURRENCIES.find(c => c.code === code)?.symbol ?? "€";
}

export function getAllergensByRegion(region: MarketRegion): AllergenInfo[] {
  switch (region) {
    case "US": return US_ALLERGENS;
    case "AU": return AU_ALLERGENS;
    case "CA": return CA_ALLERGENS;
    case "UK": return UK_ALLERGENS;
    default:   return EU_ALLERGENS;
  }
}

/** Flat list of valid allergen IDs (all regions + legacy IDs for backward compat) */
export const ALLERGEN_LIST = [
  ...EU_ALLERGENS.map(a => a.id),
  ...US_ALLERGENS.map(a => a.id),
  // Legacy IDs kept so old DB records still pass validation
  "lactose",
  "nuts",
] as const;

export const DIET_LIST = [
  "vegan",
] as const;

export type Allergen = (typeof EU_ALLERGENS)[number]["id"];
export type Diet = (typeof DIET_LIST)[number];

/** Maps old 3-value allergen IDs to their new EU equivalents */
export const LEGACY_ALLERGEN_MAP: Record<string, string[]> = {
  lactose: ["milk"],
  nuts: ["nuts_almonds", "nuts_hazelnuts", "nuts_walnuts", "nuts_cashews", "nuts_pecans", "nuts_brazil", "nuts_pistachios", "nuts_macadamia", "nuts_pine"],
};

// All known allergens across all regions, for label lookup
const ALL_KNOWN_ALLERGENS: AllergenInfo[] = [
  ...EU_ALLERGENS,
  // US-only entries not already covered by EU list
  { id: "shellfish", label: "Shellfish" },
  { id: "wheat",     label: "Wheat" },
];

/** Resolve any allergen ID (any region, including legacy) to its display label */
export function allergenLabel(id: string): string {
  const found = ALL_KNOWN_ALLERGENS.find(a => a.id === id);
  if (found) return found.label;
  if (id === "lactose") return "Milk (lactose)";
  if (id === "nuts") return "Tree nuts";
  return id;
}

/** Migrate legacy allergen IDs to new EU IDs. Deduplicates. */
export function migrateAllergens(allergens: string[]): string[] {
  const result = new Set<string>();
  for (const a of allergens) {
    const mapped = LEGACY_ALLERGEN_MAP[a];
    if (mapped) {
      mapped.forEach(m => result.add(m));
    } else {
      result.add(a);
    }
  }
  return Array.from(result);
}

export const COMPOSITION_FIELDS = [
  { key: "cacaoFat", label: "Cacao fat" },
  { key: "sugar", label: "Sugar" },
  { key: "milkFat", label: "Milk fat" },
  { key: "water", label: "Water" },
  { key: "solids", label: "Solids" },
  { key: "otherFats", label: "Other fats" },
  { key: "alcohol", label: "Alcohol" },
] as const;

export type CompositionKey = (typeof COMPOSITION_FIELDS)[number]["key"];

// --- Packaging ---

/**
 * What kind of products a packaging holds. Different physical formats:
 *   - "bonbon"    — multi-cavity gift box for moulded + enrobed bonbons
 *                    (snack bars are too big to fit alongside regular bonbons)
 *   - "bar"       — single-bar wrapper (capacity = 1)
 *   - "snack-bar" — multi-pack of snack bars (typical 2 / 3 / 4 per pack)
 *
 * The Shop palettes filter products by this kind so the operator can't drop
 * a snack-bar into a regular gift box. Defaults to "bonbon" for legacy rows
 * via the v11 migration (which also marks any capacity-1 row as "bar").
 */
export type PackagingKind = "bonbon" | "bar" | "snack-bar";

export interface Packaging {
  id?: string;
  name: string;           // e.g. "Box of 9 with natural inserts"
  capacity: number;       // how many products fit per unit
  /** What kind of product this packaging holds. Drives palette filtering in
   *  the Shop and give-away flows. Optional for backward compatibility — the
   *  v11 migration backfills existing rows by capacity heuristic. */
  productKind?: PackagingKind;
  /** Optional cavity layout for divider-frame boxes used in the Shop feature.
   *  When both `rows` and `cols` are set, `rows * cols` must equal `capacity`.
   *  When unset, the Shop derives a near-square grid from `capacity`. */
  rows?: number;
  cols?: number;
  manufacturer?: string;  // free-text
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
  archived?: boolean;
  // Shopping / restock tracking
  lowStock?: boolean;
  lowStockSince?: number;
  lowStockOrdered?: boolean;
  outOfStock?: boolean;       // true = completely out, higher urgency than lowStock
}

/** Map a packaging's productKind to the set of `ShopKind`s its cavities can
 *  hold. Bonbon packaging (gift boxes) takes mixed moulded + enrobed; bar and
 *  snack-bar packaging take only their own kind. Pure helper — no React. */
export function shopKindsForPackaging(kind: PackagingKind | undefined): ReadonlySet<ShopKind> {
  switch (kind ?? "bonbon") {
    case "bonbon":    return new Set<ShopKind>(["moulded", "enrobed"]);
    case "bar":       return new Set<ShopKind>(["bar"]);
    case "snack-bar": return new Set<ShopKind>(["snack-bar"]);
  }
}

export interface PackagingOrder {
  id?: string;
  packagingId: string;
  quantity: number;       // units received in this order (e.g. 1500 boxes)
  pricePerUnit: number;   // cost per unit (e.g. 1.99)
  supplier?: string;      // free-text, e.g. "Keylink"
  orderedAt: Date;        // date of order / receipt
  notes?: string;
}

// --- Shopping list ---

export const SHOPPING_ITEM_CATEGORIES = [
  "Ingredient",
  "Packaging",
  "Equipment",
  "Other",
] as const;

/** Free-text shopping list item for things not tracked as ingredients or packaging */
export interface ShoppingItem {
  id?: string;
  name: string;
  category?: string; // from SHOPPING_ITEM_CATEGORIES
  note?: string;
  addedAt: number;      // Date.now()
  orderedAt?: number;   // set when marked as ordered
}

// --- Decoration materials (cocoa butters, lustre dusts, chocolate, transfer sheets, other) ---

export const DECORATION_MATERIAL_TYPES = ["cocoa_butter", "lustre_dust", "chocolate", "transfer_sheet", "other"] as const;
export type DecorationMaterialType = (typeof DECORATION_MATERIAL_TYPES)[number];

export const COCOA_BUTTER_TYPES = ["Type A", "Type B", "Type C", "Type D"] as const;
export type CocoaButterType = (typeof COCOA_BUTTER_TYPES)[number];

export const DECORATION_MATERIAL_TYPE_LABELS: Record<DecorationMaterialType, string> = {
  cocoa_butter: "Cocoa Butter",
  lustre_dust: "Lustre Dust",
  chocolate: "Chocolate",
  transfer_sheet: "Transfer Sheet",
  other: "Other",
};

/** A coloured decoration material used in shell design (cocoa butters, lustre dusts, chocolate, transfer sheets, other).
 *  Tracked separately from filling ingredients — never used in fillings or experiments. */
export interface DecorationMaterial {
  id?: string;
  name: string;                        // e.g. "Gold Shimmer", "Ivory CB"
  type: DecorationMaterialType;        // "cocoa_butter" | "lustre_dust" | "chocolate" | "transfer_sheet" | "other"
  cocoaButterType?: CocoaButterType;   // only relevant when type === "cocoa_butter"
  color?: string;                      // CSS color for swatch (hex or named)
  manufacturer?: string;
  vendor?: string;                     // where purchased (e.g. "Keylink") — free-text with suggestions
  source?: string;                     // Supplier / where to buy
  notes?: string;
  // Stock tracking
  lowStock?: boolean;
  lowStockSince?: number;              // Date.now() when flagged
  lowStockOrdered?: boolean;
  outOfStock?: boolean;
  archived?: boolean;                  // soft-delete: hidden from lists, preserved for shell design history
  createdAt?: Date;
  updatedAt?: Date;
}

// --- Decoration Categories (configurable material types) ---

/** A user-configurable category for decoration materials (replaces the old hardcoded DECORATION_MATERIAL_TYPES).
 *  The `slug` field matches the legacy `DecorationMaterial.type` string for backward compat. */
export interface DecorationCategory {
  id?: string;
  name: string;           // display name: "Cocoa Butter", "Lustre Dust", etc.
  slug: string;           // machine key matching DecorationMaterial.type: "cocoa_butter", etc.
  archived?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Default seeded decoration categories — mirrors the original DECORATION_MATERIAL_TYPES (minus "chocolate"). */
export const DEFAULT_DECORATION_CATEGORIES: ReadonlyArray<{ name: string; slug: string }> = [
  { name: "Cocoa Butter",    slug: "cocoa_butter" },
  { name: "Lustre Dust",     slug: "lustre_dust" },
  { name: "Transfer Sheet",  slug: "transfer_sheet" },
  { name: "Other",           slug: "other" },
];

// --- Shell Designs (configurable decoration techniques) ---

/** A user-configurable shell decoration technique (replaces the old hardcoded SHELL_TECHNIQUES).
 *  The `name` field matches the legacy `ShellDesignStep.technique` string for backward compat. */
export interface ShellDesign {
  id?: string;
  name: string;                          // e.g. "Airbrushing", "Transfer Sheet"
  defaultApplyAt?: ShellDesignApplyAt;   // "on_mould" | "after_cap" — default phase in production
  archived?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

/** Default seeded shell designs — mirrors the original SHELL_TECHNIQUES. */
export const DEFAULT_SHELL_DESIGNS: ReadonlyArray<{ name: string; defaultApplyAt: ShellDesignApplyAt }> = [
  { name: "Airbrushing",              defaultApplyAt: "colour" },
  { name: "Brushing",                 defaultApplyAt: "colour" },
  { name: "Droplet / Water Spotting", defaultApplyAt: "colour" },
  { name: "Dual-Tone Swirling",       defaultApplyAt: "colour" },
  { name: "Finger Painting",          defaultApplyAt: "colour" },
  { name: "Layered Scratch-Back",     defaultApplyAt: "colour" },
  { name: "Masking / Taping",         defaultApplyAt: "colour" },
  { name: "Piping (Inside the Mould)", defaultApplyAt: "colour" },
  { name: "Splattering / Speckling",  defaultApplyAt: "colour" },
  { name: "Spin & Drip",              defaultApplyAt: "colour" },
  { name: "Sponging",                 defaultApplyAt: "colour" },
  { name: "Stamping",                 defaultApplyAt: "colour" },
  { name: "Stenciling",               defaultApplyAt: "colour" },
  { name: "Transfer Sheet",           defaultApplyAt: "cap" },
];

// --- Collections ---

/**
 * A curated set of products for a season, event, or permanent range.
 * startDate = when the collection first goes on offer.
 * endDate = undefined means it runs indefinitely (e.g. "standard" range).
 */
export interface Collection {
  id?: string;
  name: string;
  description?: string;
  startDate: string; // ISO date string, e.g. "2025-01-01"
  endDate?: string;  // ISO date string; undefined = ongoing / no end date
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Join table: which products belong to which collection, and in what order */
export interface CollectionProduct {
  id?: string;
  collectionId: string;
  productId: string;
  sortOrder: number;
}

/** Links a collection to a packaging option with the retail sell price for that box */
export interface CollectionPackaging {
  id?: string;
  collectionId: string;
  packagingId: string;
  sellPrice: number;      // retail price for this box configuration (e.g. €24.95)
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * A point-in-time snapshot of the margin for one (collection, packaging) combination.
 * Created when the sell price is changed, when ingredient/coating/packaging costs change,
 * or on manual recalculation. Used to draw the pricing history chart.
 */
export interface CollectionPricingSnapshot {
  id?: string;
  collectionId: string;
  packagingId: string;
  /** Average product material cost at time of snapshot */
  avgProductCost: number;
  /** Packaging unit cost at time of snapshot */
  packagingUnitCost: number;
  /** Total box cost = avgProductCost × capacity + packagingUnitCost */
  totalCost: number;
  /** Retail sell price at time of snapshot */
  sellPrice: number;
  /** Gross margin % = (sellPrice − totalCost) / sellPrice × 100 */
  marginPercent: number;
  recordedAt: Date;
  /** What caused this snapshot */
  triggerType: "sell_price_change" | "ingredient_price" | "coating_change" | "packaging_cost" | "manual";
  /** Human-readable description, e.g. "Sell price updated to €15.95" */
  triggerDetail: string;
}

// --- Shop / Sales ---

/** Lifecycle of a Shop sale. `prepared` = the operator has filled a box in
 *  advance; stock has already been decremented, but it is not yet counted
 *  toward revenue. `sold` = a customer has paid; counts in KPIs. */
export type SaleStatus = "prepared" | "sold";

/**
 * One box-sale record from the Shop counter flow.
 *
 * Pricing is taken from the `CollectionPackaging` row identified by
 * `(collectionId, packagingId)` — no per-bonbon retail price exists on
 * `Product`. The price is snapshotted into `price` at prep time so later
 * edits to the collection do not rewrite history.
 *
 * `cells` is ordered row-major across the packaging's cavity grid and
 * has exactly `packaging.capacity` entries. A `null` entry means that
 * cavity is empty (only valid pre-sale; a `sold` sale typically has
 * every cavity filled, but this isn't enforced at the type level).
 */
export interface Sale {
  id?: string;
  collectionId: string;
  packagingId: string;
  cells: (string | null)[];    // productId per cavity, row-major
  price: number;               // captured from CollectionPackaging.sellPrice at prep time
  status: SaleStatus;
  preparedAt: Date;
  soldAt?: Date;
  customerNote?: string;
}

// --- Give-aways ---
//
// Chocolate that leaves the workshop without a sale: samples for buyers,
// charity donations, friends/family, marketing, etc. Visually demoted vs the
// paid-sale flow (lilac accent vs cocoa, "given" verb vs "sold", no price chip).
//
// Four shapes the give-away can take, picked via a segmented control on the
// log screen. Each shape has its own composition data; the discriminating
// `kind` mirrors `ShopKind` for the bonbons but adds a packaging dimension
// ("box" — multi-cavity gift box, "snack" — 4-piece enrobed stick).

/** Why a give-away left the workshop. Fixed taxonomy for now; can be made
 *  user-editable later if needed (mirrors the categories pattern).
 *
 *  Historical records may carry reason values that are no longer in this
 *  union (e.g. legacy "charity" / "influencer" / "comp" rows). The reason
 *  picker only shows the current options; render code falls back to the raw
 *  value for orphaned entries so timelines still read correctly. */
export type GiveAwayReason = "sample" | "friends" | "marketing" | "staff";

export const GIVE_AWAY_REASONS: ReadonlyArray<{ value: GiveAwayReason; label: string }> = [
  { value: "sample",    label: "Sample" },
  { value: "friends",   label: "Friends/family" },
  { value: "marketing", label: "Marketing" },
  { value: "staff",     label: "Staff" },
];

/** The four shapes a give-away can take. Each is a discriminated union member
 *  carrying just the data relevant to that shape — no spurious empty fields.
 *
 *  Snack-bars are an individual product format (a moulded bonbon in a larger
 *  single-piece shape), so the snack shape is a productId → count map just
 *  like loose/bar — not a multi-cavity stick.
 */
export type GiveAwayShape =
  | { kind: "box";   packagingId: string; cells: (string | null)[] }   // cells[i] = productId in cavity i
  | { kind: "loose"; counts: Record<string, number> }                  // productId → count
  | { kind: "bar";   counts: Record<string, number> }                  // productId → count (bars only)
  | { kind: "snack"; counts: Record<string, number> };                 // productId → count (snack-bars only)

/**
 * One give-away log entry. `pieceCount` and `ingredientCost` are derived from
 * `shape` at log time and persisted so reporting doesn't have to re-walk the
 * shape (and so renames/category changes don't rewrite history).
 *
 * `fromStock=true` means we decrement product stock at log time (same FIFO path
 * the paid sale flow uses). `fromStock=false` means the chocolate was made fresh
 * for the give-away and never entered finished stock — only the ingredient cost
 * is recorded.
 */
export interface GiveAwayRecord {
  id?: string;
  /** Wall-clock time the give-away was logged. */
  at: Date;
  reason: GiveAwayReason;
  fromStock: boolean;
  shape: GiveAwayShape;
  /** Optional free-text recipient (useful for "Influencer" or "Charity"). */
  recipient?: string;
  /** Optional free-text note. */
  note?: string;
  /** Total pieces given away — sum across the shape's productId entries. */
  pieceCount: number;
  /** Sum of `costPerProduct × pieces` at log time, in the user's currency. */
  ingredientCost: number;
}
