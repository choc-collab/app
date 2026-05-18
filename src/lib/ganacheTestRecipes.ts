/**
 * Curated ganache recipe fixtures for the Lab balance engine.
 *
 * Ingredient composition values use industry-typical figures for the named
 * category (cream 35%, dark chocolate 65%, white couverture, butter 82%,
 * glucose syrup, invert sugar, sorbitol, citrus puree, kirsch, etc.). Specific
 * branded products will vary slightly; the engine is robust to small drift.
 *
 * Empirical Aw anchors are loose observations of comparable recipes published
 * across multiple chocolatier study materials. Tolerance is intentionally
 * generous (±0.04–0.05) because Aw depends on the actual ingredient batch and
 * the storage environment.
 *
 * Single-author empirical reference compilations (Aw measurement tables tied
 * to specific recipes) are NOT bundled here — those live in *.private.json
 * fixtures next to this file and are gitignored.
 */

export type RecipeComposition = {
  water: number;
  cacaoFat: number;
  sugar: number;
  milkFat: number;
  otherFats: number;
  solids: number;
  alcohol: number;
};

export type RecipeIngredient = {
  name: string;
  grams: number;
  composition: RecipeComposition;
};

export type ShelfLifeBand = "short" | "medium" | "long" | "very_long";

export type RecipeIntent =
  | "molded_dark"
  | "molded_milk"
  | "molded_white"
  | "coated_dark"
  | "piped"
  | "dairy_free"
  | "alcohol_stabilized"
  | "unstable_baseline";

export type GanacheRecipeFixture = {
  id: string;
  name: string;
  intent: RecipeIntent;
  ingredients: RecipeIngredient[];
  expected: RecipeComposition & { totalWeight: number };
  /** Soft Aw anchor for the Aw estimator regression — generous tolerance. */
  empiricalAw?: { value: number; tolerance: number };
  /** Consensus shelf-life band — buckets, not single-author numbers. */
  shelfLifeBand?: ShelfLifeBand;
  notes?: string;
};

const zero: RecipeComposition = {
  water: 0, cacaoFat: 0, sugar: 0, milkFat: 0, otherFats: 0, solids: 0, alcohol: 0,
};

const c = (partial: Partial<RecipeComposition>): RecipeComposition => ({ ...zero, ...partial });

export const TEST_COMPOSITIONS = {
  cream35:           c({ water: 65, milkFat: 35 }),
  butter82:          c({ water: 18, milkFat: 82 }),
  darkChoc65:        c({ cacaoFat: 42, sugar: 34, solids: 24 }),
  darkChoc70:        c({ cacaoFat: 40, sugar: 30, solids: 30 }),
  whiteChoc33:       c({ cacaoFat: 33, sugar: 46, milkFat: 21 }),
  whiteVeganChoc38:  c({ cacaoFat: 33, sugar: 46, solids: 21 }),
  cocoaButter:       c({ cacaoFat: 100 }),
  glucoseDE43:       c({ sugar: 80, water: 20 }),
  invertSugar:       c({ sugar: 78, water: 22 }),
  sorbitolPowder:    c({ sugar: 100 }),
  fruitPureeCitrus:  c({ water: 88, sugar: 12 }),
  kirsch:            c({ water: 55, alcohol: 45 }),
} as const satisfies Record<string, RecipeComposition>;

export const TEST_RECIPES: GanacheRecipeFixture[] = [
  {
    id: "r1-classic-1to1-unstable",
    name: "Classic 1:1 dark + cream (intentionally unstable)",
    intent: "unstable_baseline",
    ingredients: [
      { name: "Cream 35%",        grams: 100, composition: TEST_COMPOSITIONS.cream35 },
      { name: "Dark chocolate 65%", grams: 100, composition: TEST_COMPOSITIONS.darkChoc65 },
    ],
    expected: {
      totalWeight: 200,
      water:     32.5,
      cacaoFat:  21.0,
      sugar:     17.0,
      milkFat:   17.5,
      otherFats:  0,
      solids:    12.0,
      alcohol:    0,
    },
    empiricalAw:   { value: 0.91, tolerance: 0.04 },
    shelfLifeBand: "short",
    notes: "Used to demonstrate water/sugar imbalance — water 32.5% with sugar only 17%.",
  },

  {
    id: "r2-dark-molded-balanced",
    name: "Balanced dark moulded ganache",
    intent: "molded_dark",
    ingredients: [
      { name: "Cream 35%",          grams: 130, composition: TEST_COMPOSITIONS.cream35 },
      { name: "Glucose DE43",       grams:  85, composition: TEST_COMPOSITIONS.glucoseDE43 },
      { name: "Invert sugar",       grams:  60, composition: TEST_COMPOSITIONS.invertSugar },
      { name: "Dark chocolate 65%", grams: 240, composition: TEST_COMPOSITIONS.darkChoc65 },
      { name: "Butter 82%",         grams: 100, composition: TEST_COMPOSITIONS.butter82 },
    ],
    expected: {
      totalWeight: 615,
      water:    21.58,
      cacaoFat: 16.39,
      sugar:    31.94,
      milkFat:  20.73,
      otherFats: 0,
      solids:    9.37,
      alcohol:   0,
    },
    empiricalAw:   { value: 0.80, tolerance: 0.04 },
    shelfLifeBand: "medium",
    notes: "Engineered to sit cleanly inside the universal ranges and pass the water/sugar correlation check.",
  },

  {
    id: "r3-white-molded-with-cb",
    name: "White moulded ganache with added cocoa butter",
    intent: "molded_white",
    ingredients: [
      { name: "Cream 35%",            grams:  75, composition: TEST_COMPOSITIONS.cream35 },
      { name: "Glucose DE43",         grams:  15, composition: TEST_COMPOSITIONS.glucoseDE43 },
      { name: "Invert sugar",         grams:  15, composition: TEST_COMPOSITIONS.invertSugar },
      { name: "White couverture 33%", grams: 160, composition: TEST_COMPOSITIONS.whiteChoc33 },
      { name: "Butter 82%",           grams:  40, composition: TEST_COMPOSITIONS.butter82 },
      { name: "Cocoa butter",         grams:  20, composition: TEST_COMPOSITIONS.cocoaButter },
    ],
    expected: {
      totalWeight: 325,
      water:    19.15,
      cacaoFat: 22.40,
      sugar:    29.94,
      milkFat:  28.51,
      otherFats: 0,
      solids:    0,
      alcohol:   0,
    },
    empiricalAw:   { value: 0.83, tolerance: 0.05 },
    shelfLifeBand: "medium",
    notes: "Demonstrates 0% solids (white) and high total fat — expected and fine for white chocolate.",
  },

  {
    id: "r4-dairy-free-fruit-puree",
    name: "Dairy-free citrus ganache with sorbitol",
    intent: "dairy_free",
    ingredients: [
      { name: "Citrus puree",            grams: 112, composition: TEST_COMPOSITIONS.fruitPureeCitrus },
      { name: "Glucose DE43",            grams:  12, composition: TEST_COMPOSITIONS.glucoseDE43 },
      { name: "Sorbitol powder",         grams:  25, composition: TEST_COMPOSITIONS.sorbitolPowder },
      { name: "Invert sugar",            grams:  12, composition: TEST_COMPOSITIONS.invertSugar },
      { name: "White vegan chocolate",   grams: 337, composition: TEST_COMPOSITIONS.whiteVeganChoc38 },
    ],
    expected: {
      totalWeight: 498,
      water:    20.80,
      cacaoFat: 22.33,
      sugar:    42.65,
      milkFat:   0,
      otherFats: 0,
      solids:   14.21,
      alcohol:   0,
    },
    empiricalAw:   { value: 0.85, tolerance: 0.05 },
    shelfLifeBand: "medium",
    notes: "High sugar + sorbitol compensate for citrus puree's water load.",
  },

  {
    id: "r5-large-batch-dark",
    name: "Larger dark moulded batch",
    intent: "molded_dark",
    ingredients: [
      { name: "Cream 35%",          grams: 170, composition: TEST_COMPOSITIONS.cream35 },
      { name: "Glucose DE43",       grams:  90, composition: TEST_COMPOSITIONS.glucoseDE43 },
      { name: "Invert sugar",       grams:  55, composition: TEST_COMPOSITIONS.invertSugar },
      { name: "Dark chocolate 65%", grams: 315, composition: TEST_COMPOSITIONS.darkChoc65 },
      { name: "Butter 82%",         grams:  80, composition: TEST_COMPOSITIONS.butter82 },
    ],
    expected: {
      totalWeight: 710,
      water:    21.83,
      cacaoFat: 18.63,
      sugar:    31.27,
      milkFat:  17.62,
      otherFats: 0,
      solids:   10.65,
      alcohol:   0,
    },
    shelfLifeBand: "medium",
    notes: "Same proportions can scale; the engine should yield identical percentages at any total weight.",
  },

  {
    id: "r6-kirsch-stabilized-dark",
    name: "Dark ganache stabilised with kirsch",
    intent: "alcohol_stabilized",
    ingredients: [
      { name: "Cream 35%",          grams:  60, composition: TEST_COMPOSITIONS.cream35 },
      { name: "Kirsch 45%",         grams:  60, composition: TEST_COMPOSITIONS.kirsch },
      { name: "Glucose DE43",       grams:  50, composition: TEST_COMPOSITIONS.glucoseDE43 },
      { name: "Invert sugar",       grams:  40, composition: TEST_COMPOSITIONS.invertSugar },
      { name: "Dark chocolate 65%", grams: 220, composition: TEST_COMPOSITIONS.darkChoc65 },
      { name: "Butter 82%",         grams:  60, composition: TEST_COMPOSITIONS.butter82 },
    ],
    expected: {
      totalWeight: 490,
      water:    20.73,
      cacaoFat: 18.86,
      sugar:    29.80,
      milkFat:  14.33,
      otherFats: 0,
      solids:   10.78,
      alcohol:   5.51,
    },
    shelfLifeBand: "long",
    notes: "Alcohol >5% in water phase lowers Aw and extends shelf life beyond the dairy-only equivalent.",
  },
];
