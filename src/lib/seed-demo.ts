/**
 * Demo data loader for the product cost calculation feature.
 *
 * Story:
 *   A chocolatier launches three products in January 2026 using Callebaut couverture.
 *   In mid-February they upgrade their shells and caps to premium Felchlin chocolates
 *   (Leggero 36% milk, Maracaibo 65% dark). This nearly doubles the coating cost but
 *   the quality uplift justifies a higher retail price.
 *
 *   Meanwhile, cream prices rise in March and a poor Piedmont hazelnut harvest pushes
 *   hazelnut costs up in mid-March — both visible in the cost histories.
 *
 * Products:
 *   1. Milk Chocolate Ganache   (coating: milk,  moulded)
 *   2. Salted Caramel           (coating: dark,  moulded)
 *   3. Hazelnut Praline         (coating: milk,  moulded, shelf-stable filling)
 *
 * Run from: Settings → Demo Data → Load Demo Data
 */

import { db } from "@/lib/db";
import type {
  Ingredient, Filling, Product, ProductFilling, FillingIngredient, Mould,
  IngredientPriceHistory, CoatingChocolateMapping, ProductCostSnapshot,
  Experiment, ExperimentIngredient,
  ProductionPlan, PlanProduct, PlanStepStatus,
  Packaging, PackagingOrder, Collection, CollectionProduct, CollectionPackaging,
  CollectionPricingSnapshot, DecorationMaterial, FillingStock,
  Sale,
} from "@/types";

// Sentinel ingredient name to detect duplicate loads
const SENTINEL = "Callebaut 823 Milk Chocolate 33.6%";

export async function isDemoDataLoaded(): Promise<boolean> {
  const found = await db.ingredients.where("name").equals(SENTINEL).first();
  return !!found;
}

export async function loadDemoData(): Promise<{ success: boolean; message: string }> {
  if (await isDemoDataLoaded()) {
    return { success: false, message: "Demo data is already loaded." };
  }

  // ── Resolve the seeded "moulded" product category (used by all demo products) ──
  // ensureDefaultProductCategories has already run via seed-loader, so this lookup
  // should always succeed; create a fallback just in case.
  const { ensureDefaultProductCategories } = await import("@/lib/hooks");
  await ensureDefaultProductCategories();
  const mouldedCategory =
    (await db.productCategories.where("name").equals("moulded").first()) ??
    (await db.productCategories.toArray()).find((c) => c.name.toLowerCase() === "moulded");
  const mouldedCategoryId = mouldedCategory?.id;
  if (!mouldedCategoryId) {
    return { success: false, message: "Could not resolve the default 'moulded' category." };
  }

  // ── Dates (all relative to today, so the demo never goes stale) ───────────
  //
  // The story runs over roughly the last ~15 weeks:
  //
  //   launchDate       (~15 wks ago) — initial launch with Callebaut couverture
  //   creamPriceDate   (~12 wks ago) — dairy cost increase
  //   felchlinSwitch   (~8 wks ago)  — upgraded shells to Felchlin Sao Palme
  //   hazelnutShortage (~4 wks ago)  — Piedmont harvest shortage
  //   activeBatch      (3 days ago)  — today's in-progress production
  //
  // Every ingredient/price/plan/snapshot below references one of these anchors.
  const DAY_MS = 86400000;
  const NOW = Date.now();
  const daysAgo = (n: number) => new Date(NOW - n * DAY_MS);
  const isoDate = (date: Date) => date.toISOString().slice(0, 10);

  const launchDate          = daysAgo(104); // initial launch, all prices set
  const valentinesPrep      = daysAgo(90);  // first batch — pre-holiday push
  const creamPriceDate      = daysAgo(85);  // dairy cost increase
  const easterConfigured    = daysAgo(73);  // Easter collection pricing set
  const felchlinSwitch      = daysAgo(59);  // shells upgraded to Felchlin Sao Palme
  const barsStarted         = daysAgo(54);  // bean-to-bar tablets added to range
  const firstFelchlinBatch  = daysAgo(52);  // first production with Felchlin shells
  const ganacheFrozenAt     = daysAgo(46);  // ganache leftovers frozen
  const creamPurchaseDate   = daysAgo(45);  // most recent cream purchase
  const packagingPriceDate  = daysAgo(41);  // supplier re-order, unit price up
  const pralineBulkDate     = daysAgo(38);  // bulk praline batch
  const hazelnutShortage    = daysAgo(31);  // Piedmont hazelnut price jump
  const pralineFreezeDate   = daysAgo(30);  // froze part of the praline batch
  const weekendMixedDate    = daysAgo(26);  // weekend mixed batch
  const recentSnapshotAnchor = daysAgo(14); // secondary cost snapshots for newer SKUs
  const activeBatch         = daysAgo(3);   // in-progress production today

  // Back-compat aliases for the original story variable names — referenced by
  // breakdown snapshots and production plan records below.
  const jan01 = launchDate;
  const jan20 = creamPriceDate;
  const feb15 = felchlinSwitch;
  const mar15 = hazelnutShortage;

  // ── Ingredients ────────────────────────────────────────────────────────────

  // Chocolates — Callebaut (initial, still used in praline filling)
  const callebaut823Id = await db.ingredients.add({
    name: "Callebaut 823 Milk Chocolate 33.6%",
    manufacturer: "Callebaut",
    source: "Dobla wholesale",
    cost: 0,
    notes: "Belgian milk couverture. Balanced caramel-milky profile. Used in praline filling.",
    category: "Chocolate",
    shellCapable: true,
    purchaseCost: 8.50,
    purchaseQty: 1,
    purchaseUnit: "kg",
    gramsPerUnit: 1000,
    purchaseDate: isoDate(launchDate),
    cacaoFat: 20, sugar: 44, milkFat: 5, water: 0, solids: 22, otherFats: 9,
    allergens: ["lactose"],
    nutrition: { energyKcal: 544, fat: 33.6, saturatedFat: 20.2, carbohydrate: 54.1, sugars: 50.5, fibre: 2.1, protein: 6.3, salt: 0.22, sodium: 88, transFat: 0.1, cholesterolMg: 8 },
  } as Ingredient) as string;

  // Chocolates — Callebaut dark (initial shell/cap for dark-coated products)
  const callebaut811Id = await db.ingredients.add({
    name: "Callebaut 811 Dark Chocolate 54.5%",
    manufacturer: "Callebaut",
    source: "Dobla wholesale",
    cost: 0,
    notes: "Belgian dark couverture. Classic bittersweet profile. Used as initial dark shell.",
    category: "Chocolate",
    shellCapable: true,
    purchaseCost: 8.20,
    purchaseQty: 1,
    purchaseUnit: "kg",
    gramsPerUnit: 1000,
    purchaseDate: isoDate(launchDate),
    cacaoFat: 31, sugar: 36, milkFat: 0, water: 0, solids: 27, otherFats: 6,
    allergens: [],
    nutrition: { energyKcal: 519, fat: 31.8, saturatedFat: 19.0, carbohydrate: 50.4, sugars: 46.3, fibre: 7.2, protein: 7.8, salt: 0.02, sodium: 8, transFat: 0, cholesterolMg: 0, ironMg: 8.0, potassiumMg: 500 },
  } as Ingredient) as string;

  // Chocolates — Felchlin (premium switch, Feb 2026)
  const felchlinLeggeroId = await db.ingredients.add({
    name: "Felchlin Sao Palme 43% Milk",
    manufacturer: "Felchlin",
    source: "Felchlin importer CH",
    cost: 0,
    notes: "Swiss single-origin milk couverture. Floral and caramel notes. Current milk shell chocolate.",
    category: "Chocolate",
    shellCapable: true,
    purchaseCost: 14.50,
    purchaseQty: 1,
    purchaseUnit: "kg",
    gramsPerUnit: 1000,
    purchaseDate: isoDate(felchlinSwitch),
    cacaoFat: 22, sugar: 40, milkFat: 5, water: 0, solids: 24, otherFats: 9,
    allergens: ["lactose"],
    nutrition: { energyKcal: 556, fat: 36.0, saturatedFat: 21.8, carbohydrate: 50.2, sugars: 48.0, fibre: 1.8, protein: 6.8, salt: 0.20, sodium: 80, transFat: 0.1, cholesterolMg: 10 },
  } as Ingredient) as string;

  const felchlinMaracaiboId = await db.ingredients.add({
    name: "Felchlin Sao Palme 75% Dark",
    manufacturer: "Felchlin",
    source: "Felchlin importer CH",
    cost: 0,
    notes: "Venezuelan single-origin dark couverture. Complex fruit and tobacco notes. Current dark shell chocolate.",
    category: "Chocolate",
    shellCapable: true,
    purchaseCost: 16.80,
    purchaseQty: 1,
    purchaseUnit: "kg",
    gramsPerUnit: 1000,
    purchaseDate: isoDate(felchlinSwitch),
    cacaoFat: 42, sugar: 34, milkFat: 0, water: 0, solids: 24, otherFats: 0,
    allergens: [],
    nutrition: { energyKcal: 560, fat: 40.0, saturatedFat: 24.5, carbohydrate: 40.0, sugars: 34.0, fibre: 9.5, protein: 9.2, salt: 0.01, sodium: 4, transFat: 0, cholesterolMg: 0, ironMg: 10.5, potassiumMg: 650 },
  } as Ingredient) as string;

  // Other ingredients (current prices, after any increases)
  const cream35Id = await db.ingredients.add({
    name: "Heavy Cream 35%",
    manufacturer: "",
    source: "local dairy co-op",
    cost: 0,
    notes: "Full-fat whipping cream, 35% fat. Base for ganaches and caramels.",
    category: "Liquids",
    purchaseCost: 2.20,          // current price (up from 1.80 since March)
    purchaseQty: 1,
    purchaseUnit: "kg",
    gramsPerUnit: 1000,
    purchaseDate: isoDate(creamPurchaseDate),
    cacaoFat: 0, sugar: 3.1, milkFat: 35, water: 61.9, solids: 0, otherFats: 0,
    allergens: ["lactose"],
    nutrition: { energyKcal: 337, fat: 35.0, saturatedFat: 23.0, carbohydrate: 3.1, sugars: 3.1, fibre: 0, protein: 2.1, salt: 0.10, sodium: 40, transFat: 1.1, cholesterolMg: 137, calciumMg: 96, potassiumMg: 130 },
  } as Ingredient) as string;

  const glucoseId = await db.ingredients.add({
    name: "Glucose Syrup DE42",
    manufacturer: "",
    source: "Puratos",
    cost: 0,
    notes: "Dextrose equivalent 42. Prevents crystallisation and extends shelf life.",
    category: "Sugars",
    purchaseCost: 2.20,
    purchaseQty: 1,
    purchaseUnit: "kg",
    gramsPerUnit: 1000,
    purchaseDate: isoDate(launchDate),
    cacaoFat: 0, sugar: 80, milkFat: 0, water: 20, solids: 0, otherFats: 0,
    allergens: [],
    nutrition: { energyKcal: 320, fat: 0, saturatedFat: 0, carbohydrate: 80.0, sugars: 36.0, addedSugars: 36.0, fibre: 0, protein: 0, salt: 0.10, sodium: 40, transFat: 0, cholesterolMg: 0 },
  } as Ingredient) as string;

  const invertSugarId = await db.ingredients.add({
    name: "Invert Sugar",
    manufacturer: "",
    source: "Puratos",
    cost: 0,
    notes: "50/50 glucose-fructose syrup. Higher hygroscopicity than glucose — improves shelf life and texture.",
    category: "Sugars",
    purchaseCost: 2.10,
    purchaseQty: 1,
    purchaseUnit: "kg",
    gramsPerUnit: 1000,
    purchaseDate: isoDate(launchDate),
    cacaoFat: 0, sugar: 80, milkFat: 0, water: 20, solids: 0, otherFats: 0,
    allergens: [],
    nutrition: { energyKcal: 320, fat: 0, saturatedFat: 0, carbohydrate: 80.0, sugars: 48.0, addedSugars: 48.0, fibre: 0, protein: 0, salt: 0.05, sodium: 20, transFat: 0, cholesterolMg: 0 },
  } as Ingredient) as string;

  const butterId = await db.ingredients.add({
    name: "Unsalted Butter 82% fat",
    manufacturer: "",
    source: "local dairy co-op",
    cost: 0,
    notes: "European-style unsalted butter, 82% fat.",
    category: "Fats",
    purchaseCost: 1.45,
    purchaseQty: 250,
    purchaseUnit: "g",
    gramsPerUnit: 1,
    purchaseDate: isoDate(launchDate),
    cacaoFat: 0, sugar: 0, milkFat: 82, water: 18, solids: 0, otherFats: 0,
    allergens: ["lactose"],
    nutrition: { energyKcal: 744, fat: 82.0, saturatedFat: 52.0, carbohydrate: 0.6, sugars: 0.6, fibre: 0, protein: 0.8, salt: 0.02, sodium: 8, transFat: 3.3, cholesterolMg: 215, vitaminDMcg: 1.5, calciumMg: 24 },
  } as Ingredient) as string;

  const sugarId = await db.ingredients.add({
    name: "Caster Sugar",
    manufacturer: "",
    source: "wholesale",
    cost: 0,
    notes: "Fine white caster sugar.",
    category: "Sugars",
    purchaseCost: 0.95,
    purchaseQty: 1,
    purchaseUnit: "kg",
    gramsPerUnit: 1000,
    purchaseDate: isoDate(launchDate),
    cacaoFat: 0, sugar: 100, milkFat: 0, water: 0, solids: 0, otherFats: 0,
    allergens: [],
    nutrition: { energyKcal: 400, fat: 0, saturatedFat: 0, carbohydrate: 100.0, sugars: 100.0, addedSugars: 100.0, fibre: 0, protein: 0, salt: 0, sodium: 0, transFat: 0, cholesterolMg: 0 },
  } as Ingredient) as string;

  const fleurDeSelId = await db.ingredients.add({
    name: "Fleur de Sel de Guérande",
    manufacturer: "",
    source: "Le Guérandais",
    cost: 0,
    notes: "Hand-harvested French sea salt. The signature ingredient of the salted caramel.",
    category: "Flavors & Additives",
    purchaseCost: 4.50,
    purchaseQty: 250,
    purchaseUnit: "g",
    gramsPerUnit: 1,
    purchaseDate: isoDate(launchDate),
    cacaoFat: 0, sugar: 0, milkFat: 0, water: 0, solids: 100, otherFats: 0,
    allergens: [],
    nutrition: { energyKcal: 0, fat: 0, saturatedFat: 0, carbohydrate: 0, sugars: 0, fibre: 0, protein: 0, salt: 97.5, sodium: 39000, transFat: 0, cholesterolMg: 0, calciumMg: 40, potassiumMg: 80, ironMg: 0.3 },
  } as Ingredient) as string;

  const hazelnutsId = await db.ingredients.add({
    name: "Roasted Piedmont Hazelnuts",
    manufacturer: "",
    source: "Agrimontana",
    cost: 0,
    notes: "PGI Piedmont hazelnuts, dry-roasted. Rich, sweet flavour. Price increased March 2026 (poor harvest).",
    category: "Nuts / Nut Pastes / Pralines",
    purchaseCost: 6.75,          // current price (up from 5.50 since March)
    purchaseQty: 500,
    purchaseUnit: "g",
    gramsPerUnit: 1,
    purchaseDate: isoDate(hazelnutShortage),
    cacaoFat: 0, sugar: 5, milkFat: 0, water: 5, solids: 17, otherFats: 63,
    allergens: ["nuts"],
    nutrition: { energyKcal: 646, fat: 62.4, saturatedFat: 4.5, carbohydrate: 6.5, sugars: 4.3, fibre: 9.4, protein: 15.0, salt: 0.01, sodium: 4, transFat: 0, cholesterolMg: 0, calciumMg: 114, ironMg: 4.7, potassiumMg: 680, vitaminDMcg: 0 },
  } as Ingredient) as string;

  // ── Mould ──────────────────────────────────────────────────────────────────

  const mouldId = await db.moulds.add({
    name: "Martellato Square 28-cavity",
    productNumber: "MA1995",
    brand: "Martellato",
    cavityWeightG: 8,
    numberOfCavities: 28,
    fillingGramsPerCavity: 6,
    quantityOwned: 3,
  } as Mould) as string;

  await db.moulds.add({
    name: "Chocolate World Dome 30mm (24-cavity)",
    productNumber: "CW1818",
    brand: "Chocolate World",
    cavityWeightG: 9,
    numberOfCavities: 24,
    fillingGramsPerCavity: 6,
    quantityOwned: 2,
  } as Mould);

  // ── Decoration Materials ────────────────────────────────────────────────────

  const foolsGoldId = await db.decorationMaterials.add({
    name: "Fool's Gold",
    type: "cocoa_butter",
    color: "#cfb53b",
    manufacturer: "I Shud Koko",
    notes: "Warm, shimmering old-gold cocoa butter. Spectacular brushed over dark backgrounds.",
  } as DecorationMaterial) as string;

  const midnightGalaxyId = await db.decorationMaterials.add({
    name: "Midnight Galaxy",
    type: "cocoa_butter",
    color: "#1a0a3c",
    manufacturer: "I Shud Koko",
    notes: "Deep violet-black cocoa butter. Rich base coat that makes gold accents pop.",
  } as DecorationMaterial) as string;

  const fuchsiaRomanceId = await db.decorationMaterials.add({
    name: "Fuchsia Romance",
    type: "cocoa_butter",
    color: "#cc2277",
    manufacturer: "I Shud Koko",
    notes: "Vivid fuchsia cocoa butter. Perfect signal colour for fruit-based fillings.",
  } as DecorationMaterial) as string;

  const redHeartsId = await db.decorationMaterials.add({
    name: "Red Hearts",
    type: "transfer_sheet",
    manufacturer: "Chocolate World",
    notes: "Red heart pattern transfer sheet. Applied immediately after capping while chocolate is still soft.",
  } as DecorationMaterial) as string;

  // ── Fillings ─────────────────────────────────────────────────────────────────

  const ganacheFillingId = await db.fillings.add({
    name: "Milk Chocolate Ganache",
    category: "Ganaches (Emulsions)",
    source: "original",
    description: "Classic milk chocolate ganache. Silky, sweet, and rich with a smooth melt.",
    allergens: ["lactose"],
    instructions: [
      "1. Heat cream and glucose to 85°C.",
      "2. Pour over chopped chocolate in 3 additions, emulsifying after each.",
      "3. At 40°C, add cold cubed butter and blend until glossy.",
      "4. Frame or pipe at 27–28°C. Crystallise 12h at 17°C.",
    ].join("\n"),
    status: "confirmed",
    shelfLifeWeeks: 3,
    version: 1,
    createdAt: jan01,
  } as Filling) as string;

  const caramelFillingId = await db.fillings.add({
    name: "Salted Caramel",
    category: "Caramels & Syrups (Sugar-Based)",
    source: "original",
    description: "Dry caramel with warm cream, butter and Fleur de Sel. Balanced sweet-salty finish.",
    allergens: ["lactose"],
    instructions: [
      "1. Dry caramelise sugar and glucose together to amber (175°C).",
      "2. Carefully deglaze with warm cream — stand back.",
      "3. At 80°C stir in cold butter until smooth.",
      "4. Add Fleur de Sel. Frame at 26°C.",
    ].join("\n"),
    status: "confirmed",
    shelfLifeWeeks: 4,
    version: 1,
    createdAt: jan01,
  } as Filling) as string;

  const pralineFillingId = await db.fillings.add({
    name: "Hazelnut Praline",
    category: "Pralines & Giandujas (Nut-Based)",
    source: "original",
    description: "Classic Piedmont hazelnut praline. Nutty, caramelised, with a fine, melt-in-the-mouth texture.",
    allergens: ["lactose", "nuts"],
    instructions: [
      "1. Cook sugar and glucose to amber caramel.",
      "2. Add roasted hazelnuts and stir to coat. Pour onto Silpat.",
      "3. Once cool, process in food processor to smooth paste (~10 min).",
      "4. Fold in tempered Callebaut 823. Spread into frame at 24°C.",
    ].join("\n"),
    status: "confirmed",
    shelfLifeWeeks: 8,
    version: 1,
    createdAt: jan01,
  } as Filling) as string;

  // ── Products ────────────────────────────────────────────────────────────────

  const ganacheProductId = await db.products.add({
    name: "Milk Chocolate Ganache",
    productCategoryId: mouldedCategoryId,
    shellIngredientId: felchlinLeggeroId,
    shellPercentage: 37,
    coating: "milk",
    defaultMouldId: mouldId,
    defaultBatchQty: 1,
    popularity: 5,
    notes: "Our bestseller. A timeless classic — deceptively simple, technically demanding.",
    tags: ["bestseller", "classic"],
    shelfLifeWeeks: "3",
    createdAt: jan01,
    updatedAt: jan01,
  } as Product) as string;

  const caramelProductId = await db.products.add({
    name: "Salted Caramel",
    productCategoryId: mouldedCategoryId,
    shellIngredientId: felchlinMaracaiboId,
    shellPercentage: 37,
    coating: "dark",
    defaultMouldId: mouldId,
    defaultBatchQty: 1,
    popularity: 4,
    notes: "The Fleur de Sel from Guérande makes all the difference. Dark Felchlin shell cuts through the sweetness perfectly.",
    tags: ["signature"],
    shelfLifeWeeks: "3",
    createdAt: jan01,
    updatedAt: jan01,
  } as Product) as string;

  const pralineProductId = await db.products.add({
    name: "Hazelnut Praline",
    productCategoryId: mouldedCategoryId,
    shellIngredientId: felchlinLeggeroId,
    shellPercentage: 37,
    coating: "milk",
    defaultMouldId: mouldId,
    defaultBatchQty: 1,
    popularity: 4,
    notes: "PGI Piedmont hazelnuts only. The filling is made in larger batches and used across several days.",
    tags: ["nut-based"],
    shelfLifeWeeks: "6",
    shellDesign: [
      { technique: "Airbrushing", materialIds: [midnightGalaxyId], notes: "Full base coat — dark violet-black across all cavities." },
      { technique: "Brushing", materialIds: [foolsGoldId], notes: "Dry-brush gold over the dome — lets the midnight base show through for depth." },
      { technique: "Transfer Sheet", materialIds: [redHeartsId], applyAt: "after_cap", notes: "Press onto cap immediately after closing while chocolate is still soft." },
    ],
    createdAt: jan01,
    updatedAt: jan01,
  } as Product) as string;

  // ── Product–Filling links ─────────────────────────────────────────────────────

  await db.productFillings.add({
    productId: ganacheProductId, fillingId: ganacheFillingId, sortOrder: 0, fillPercentage: 100,
  } as ProductFilling);
  await db.productFillings.add({
    productId: caramelProductId, fillingId: caramelFillingId, sortOrder: 0, fillPercentage: 100,
  } as ProductFilling);
  await db.productFillings.add({
    productId: pralineProductId, fillingId: pralineFillingId, sortOrder: 0, fillPercentage: 100,
  } as ProductFilling);

  // ── Filling Ingredients ──────────────────────────────────────────────────────

  // Milk Chocolate Ganache: total 215g per batch
  await db.fillingIngredients.add({ fillingId: ganacheFillingId, ingredientId: callebaut823Id, amount: 100, unit: "g", sortOrder: 0 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: ganacheFillingId, ingredientId: cream35Id,      amount: 80,  unit: "g", sortOrder: 1 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: ganacheFillingId, ingredientId: glucoseId,      amount: 20,  unit: "g", sortOrder: 2 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: ganacheFillingId, ingredientId: butterId,       amount: 15,  unit: "g", sortOrder: 3 } as FillingIngredient);

  // Salted Caramel: total 233g per batch
  await db.fillingIngredients.add({ fillingId: caramelFillingId, ingredientId: sugarId,      amount: 100, unit: "g", sortOrder: 0 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: caramelFillingId, ingredientId: cream35Id,    amount: 80,  unit: "g", sortOrder: 1 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: caramelFillingId, ingredientId: butterId,     amount: 30,  unit: "g", sortOrder: 2 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: caramelFillingId, ingredientId: glucoseId,    amount: 20,  unit: "g", sortOrder: 3 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: caramelFillingId, ingredientId: fleurDeSelId, amount: 3,   unit: "g", sortOrder: 4 } as FillingIngredient);

  // Hazelnut Praline: total 180g per batch (shelf-stable)
  await db.fillingIngredients.add({ fillingId: pralineFillingId, ingredientId: hazelnutsId,   amount: 100, unit: "g", sortOrder: 0 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: pralineFillingId, ingredientId: sugarId,       amount: 50,  unit: "g", sortOrder: 1 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: pralineFillingId, ingredientId: callebaut823Id, amount: 30, unit: "g", sortOrder: 2 } as FillingIngredient);

  // ── Ingredient Price Histories (backdated) ─────────────────────────────────
  // These represent the log of cost changes over time.

  // Callebaut 823 — stable price since Jan
  await db.ingredientPriceHistory.add({ ingredientId: callebaut823Id, costPerGram: 0.0085, recordedAt: jan01, purchaseCost: 8.50, purchaseQty: 1, purchaseUnit: "kg", gramsPerUnit: 1000, note: "Initial purchase — Callebaut wholesale" } as IngredientPriceHistory);

  // Callebaut 811 — stable since Jan
  await db.ingredientPriceHistory.add({ ingredientId: callebaut811Id, costPerGram: 0.0082, recordedAt: jan01, purchaseCost: 8.20, purchaseQty: 1, purchaseUnit: "kg", gramsPerUnit: 1000, note: "Initial purchase — Callebaut wholesale" } as IngredientPriceHistory);

  // Felchlin Sao Palme 43% — first purchase Feb 15 (switch)
  await db.ingredientPriceHistory.add({ ingredientId: felchlinLeggeroId, costPerGram: 0.0145, recordedAt: feb15, purchaseCost: 14.50, purchaseQty: 1, purchaseUnit: "kg", gramsPerUnit: 1000, note: "First purchase — upgrading milk shell to Felchlin" } as IngredientPriceHistory);

  // Felchlin Sao Palme 75% — first purchase Feb 15 (switch)
  await db.ingredientPriceHistory.add({ ingredientId: felchlinMaracaiboId, costPerGram: 0.0168, recordedAt: feb15, purchaseCost: 16.80, purchaseQty: 1, purchaseUnit: "kg", gramsPerUnit: 1000, note: "First purchase — upgrading dark shell to Felchlin" } as IngredientPriceHistory);

  // Cream — Jan 01 original, then Mar 01 increase
  await db.ingredientPriceHistory.add({ ingredientId: cream35Id, costPerGram: 0.0018, recordedAt: jan01, purchaseCost: 1.80, purchaseQty: 1, purchaseUnit: "kg", gramsPerUnit: 1000, note: "Initial price" } as IngredientPriceHistory);
  await db.ingredientPriceHistory.add({ ingredientId: cream35Id, costPerGram: 0.0022, recordedAt: creamPurchaseDate, purchaseCost: 2.20, purchaseQty: 1, purchaseUnit: "kg", gramsPerUnit: 1000, note: "Dairy price increase — spring 2026" } as IngredientPriceHistory);

  // Glucose — stable
  await db.ingredientPriceHistory.add({ ingredientId: glucoseId, costPerGram: 0.0022, recordedAt: jan01, purchaseCost: 2.20, purchaseQty: 1, purchaseUnit: "kg", gramsPerUnit: 1000, note: "Initial price" } as IngredientPriceHistory);

  // Butter — stable
  await db.ingredientPriceHistory.add({ ingredientId: butterId, costPerGram: 0.0058, recordedAt: jan01, purchaseCost: 1.45, purchaseQty: 250, purchaseUnit: "g", gramsPerUnit: 1, note: "Initial price" } as IngredientPriceHistory);

  // Sugar — stable
  await db.ingredientPriceHistory.add({ ingredientId: sugarId, costPerGram: 0.00095, recordedAt: jan01, purchaseCost: 0.95, purchaseQty: 1, purchaseUnit: "kg", gramsPerUnit: 1000, note: "Initial price" } as IngredientPriceHistory);

  // Fleur de Sel — stable
  await db.ingredientPriceHistory.add({ ingredientId: fleurDeSelId, costPerGram: 0.018, recordedAt: jan01, purchaseCost: 4.50, purchaseQty: 250, purchaseUnit: "g", gramsPerUnit: 1, note: "Initial price" } as IngredientPriceHistory);

  // Hazelnuts — Jan original, then Mar 15 shortage increase
  await db.ingredientPriceHistory.add({ ingredientId: hazelnutsId, costPerGram: 0.011, recordedAt: jan01, purchaseCost: 5.50, purchaseQty: 500, purchaseUnit: "g", gramsPerUnit: 1, note: "Initial price" } as IngredientPriceHistory);
  await db.ingredientPriceHistory.add({ ingredientId: hazelnutsId, costPerGram: 0.0135, recordedAt: mar15, purchaseCost: 6.75, purchaseQty: 500, purchaseUnit: "g", gramsPerUnit: 1, note: "Harvest shortage — Piedmont 2025 season poor yield" } as IngredientPriceHistory);

  // ── Coating Chocolate Mappings (time-series) ───────────────────────────────

  // Jan 01: Callebaut for both milk and dark
  await db.coatingChocolateMappings.add({ coatingName: "milk", ingredientId: callebaut823Id, effectiveFrom: jan01, note: "Initial setup — Callebaut 823" } as CoatingChocolateMapping);
  await db.coatingChocolateMappings.add({ coatingName: "dark", ingredientId: callebaut811Id, effectiveFrom: jan01, note: "Initial setup — Callebaut 811" } as CoatingChocolateMapping);

  // Feb 15: switch to Felchlin (the key demo moment)
  await db.coatingChocolateMappings.add({ coatingName: "milk", ingredientId: felchlinLeggeroId, effectiveFrom: feb15, note: "Upgraded to Felchlin Sao Palme 43% — premium positioning" } as CoatingChocolateMapping);
  await db.coatingChocolateMappings.add({ coatingName: "dark", ingredientId: felchlinMaracaiboId, effectiveFrom: feb15, note: "Upgraded to Felchlin Sao Palme 75% — premium positioning" } as CoatingChocolateMapping);

  // ── Product Cost Snapshots (pre-computed, backdated) ────────────────────────
  //
  // Mould geometry (cavityWeightG = 8):
  //   FILL_FACTOR=0.63  → fill weight/cavity   = 8×0.63 = 5.04g
  //   SHELL_FACTOR=0.30 → shell weight/cavity  = 8×0.30 = 2.40g
  //   CAP_FACTOR=0.07   → cap weight/cavity    = 8×0.07 = 0.56g

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. MILK CHOCOLATE GANACHE
  //    Filling: Callebaut(100) + Cream(80) + Glucose(20) + Butter(15) = 215g
  //    Per-cavity scale = 6.048/215 = 0.02813
  // ═══════════════════════════════════════════════════════════════════════════

  // Jan 01 — Callebaut shells
  await db.productCostSnapshots.add({
    productId: ganacheProductId,
    costPerProduct: 0.06184,
    breakdown: JSON.stringify([
      { label: "Milk Chocolate Ganache — Callebaut 823 Milk Chocolate 33.6%", grams: 2.813, costPerGram: 0.0085, subtotal: 0.02391, kind: "filling_ingredient", ingredientId: callebaut823Id, fillingId: ganacheFillingId },
      { label: "Milk Chocolate Ganache — Heavy Cream 35%",                    grams: 2.250, costPerGram: 0.0018, subtotal: 0.00405, kind: "filling_ingredient", ingredientId: cream35Id,      fillingId: ganacheFillingId },
      { label: "Milk Chocolate Ganache — Glucose Syrup DE42",                 grams: 0.563, costPerGram: 0.0022, subtotal: 0.00124, kind: "filling_ingredient", ingredientId: glucoseId,      fillingId: ganacheFillingId },
      { label: "Milk Chocolate Ganache — Unsalted Butter 82% fat",            grams: 0.422, costPerGram: 0.0058, subtotal: 0.00245, kind: "filling_ingredient", ingredientId: butterId,       fillingId: ganacheFillingId },
      { label: "Shell (milk)",  grams: 2.880, costPerGram: 0.0085, subtotal: 0.02448, kind: "shell" },
      { label: "Cap (milk)",    grams: 0.672, costPerGram: 0.0085, subtotal: 0.00571, kind: "cap"   },
    ]),
    recordedAt: jan01,
    triggerType: "manual",
    triggerDetail: "Initial cost calculation",
    mouldId,
    coatingName: "milk",
  } as ProductCostSnapshot);

  // Jan 20 — cream price increase (€0.0018 → €0.0022)
  await db.productCostSnapshots.add({
    productId: ganacheProductId,
    costPerProduct: 0.06274,
    breakdown: JSON.stringify([
      { label: "Milk Chocolate Ganache — Callebaut 823 Milk Chocolate 33.6%", grams: 2.813, costPerGram: 0.0085, subtotal: 0.02391, kind: "filling_ingredient", ingredientId: callebaut823Id, fillingId: ganacheFillingId },
      { label: "Milk Chocolate Ganache — Heavy Cream 35%",                    grams: 2.250, costPerGram: 0.0022, subtotal: 0.00495, kind: "filling_ingredient", ingredientId: cream35Id,      fillingId: ganacheFillingId },
      { label: "Milk Chocolate Ganache — Glucose Syrup DE42",                 grams: 0.563, costPerGram: 0.0022, subtotal: 0.00124, kind: "filling_ingredient", ingredientId: glucoseId,      fillingId: ganacheFillingId },
      { label: "Milk Chocolate Ganache — Unsalted Butter 82% fat",            grams: 0.422, costPerGram: 0.0058, subtotal: 0.00245, kind: "filling_ingredient", ingredientId: butterId,       fillingId: ganacheFillingId },
      { label: "Shell (milk)",  grams: 2.880, costPerGram: 0.0085, subtotal: 0.02448, kind: "shell" },
      { label: "Cap (milk)",    grams: 0.672, costPerGram: 0.0085, subtotal: 0.00571, kind: "cap"   },
    ]),
    recordedAt: jan20,
    triggerType: "ingredient_price",
    triggerDetail: "Heavy Cream 35% price updated",
    mouldId,
    coatingName: "milk",
  } as ProductCostSnapshot);

  // Feb 15 — switch to Felchlin milk shell (€0.0085 → €0.0145)
  await db.productCostSnapshots.add({
    productId: ganacheProductId,
    costPerProduct: 0.08405,
    breakdown: JSON.stringify([
      { label: "Milk Chocolate Ganache — Callebaut 823 Milk Chocolate 33.6%", grams: 2.813, costPerGram: 0.0085, subtotal: 0.02391, kind: "filling_ingredient", ingredientId: callebaut823Id, fillingId: ganacheFillingId },
      { label: "Milk Chocolate Ganache — Heavy Cream 35%",                    grams: 2.250, costPerGram: 0.0022, subtotal: 0.00495, kind: "filling_ingredient", ingredientId: cream35Id,      fillingId: ganacheFillingId },
      { label: "Milk Chocolate Ganache — Glucose Syrup DE42",                 grams: 0.563, costPerGram: 0.0022, subtotal: 0.00124, kind: "filling_ingredient", ingredientId: glucoseId,      fillingId: ganacheFillingId },
      { label: "Milk Chocolate Ganache — Unsalted Butter 82% fat",            grams: 0.422, costPerGram: 0.0058, subtotal: 0.00245, kind: "filling_ingredient", ingredientId: butterId,       fillingId: ganacheFillingId },
      { label: "Shell (milk)",  grams: 2.880, costPerGram: 0.0145, subtotal: 0.04176, kind: "shell" },
      { label: "Cap (milk)",    grams: 0.672, costPerGram: 0.0145, subtotal: 0.00974, kind: "cap"   },
    ]),
    recordedAt: feb15,
    triggerType: "coating_change",
    triggerDetail: "Coating chocolate for \"milk\" updated",
    mouldId,
    coatingName: "milk",
  } as ProductCostSnapshot);

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. SALTED CARAMEL
  //    Filling: Sugar(100) + Cream(80) + Butter(30) + Glucose(20) + Salt(3) = 233g
  //    Per-cavity scale = 6.048/233 = 0.025963
  // ═══════════════════════════════════════════════════════════════════════════

  // Jan 01
  await db.productCostSnapshots.add({
    productId: caramelProductId,
    costPerProduct: 0.04241,
    breakdown: JSON.stringify([
      { label: "Salted Caramel — Caster Sugar",               grams: 2.596, costPerGram: 0.00095, subtotal: 0.00247, kind: "filling_ingredient", ingredientId: sugarId,      fillingId: caramelFillingId },
      { label: "Salted Caramel — Heavy Cream 35%",            grams: 2.077, costPerGram: 0.00180, subtotal: 0.00374, kind: "filling_ingredient", ingredientId: cream35Id,    fillingId: caramelFillingId },
      { label: "Salted Caramel — Unsalted Butter 82% fat",    grams: 0.779, costPerGram: 0.00580, subtotal: 0.00452, kind: "filling_ingredient", ingredientId: butterId,     fillingId: caramelFillingId },
      { label: "Salted Caramel — Glucose Syrup DE42",         grams: 0.519, costPerGram: 0.00220, subtotal: 0.00114, kind: "filling_ingredient", ingredientId: glucoseId,    fillingId: caramelFillingId },
      { label: "Salted Caramel — Fleur de Sel de Guérande",   grams: 0.078, costPerGram: 0.01800, subtotal: 0.00140, kind: "filling_ingredient", ingredientId: fleurDeSelId, fillingId: caramelFillingId },
      { label: "Shell (dark)",  grams: 2.880, costPerGram: 0.0082, subtotal: 0.02362, kind: "shell" },
      { label: "Cap (dark)",    grams: 0.672, costPerGram: 0.0082, subtotal: 0.00551, kind: "cap"   },
    ]),
    recordedAt: jan01,
    triggerType: "manual",
    triggerDetail: "Initial cost calculation",
    mouldId,
    coatingName: "dark",
  } as ProductCostSnapshot);

  // Jan 20 — cream increase
  await db.productCostSnapshots.add({
    productId: caramelProductId,
    costPerProduct: 0.04324,
    breakdown: JSON.stringify([
      { label: "Salted Caramel — Caster Sugar",               grams: 2.596, costPerGram: 0.00095, subtotal: 0.00247, kind: "filling_ingredient", ingredientId: sugarId,      fillingId: caramelFillingId },
      { label: "Salted Caramel — Heavy Cream 35%",            grams: 2.077, costPerGram: 0.00220, subtotal: 0.00457, kind: "filling_ingredient", ingredientId: cream35Id,    fillingId: caramelFillingId },
      { label: "Salted Caramel — Unsalted Butter 82% fat",    grams: 0.779, costPerGram: 0.00580, subtotal: 0.00452, kind: "filling_ingredient", ingredientId: butterId,     fillingId: caramelFillingId },
      { label: "Salted Caramel — Glucose Syrup DE42",         grams: 0.519, costPerGram: 0.00220, subtotal: 0.00114, kind: "filling_ingredient", ingredientId: glucoseId,    fillingId: caramelFillingId },
      { label: "Salted Caramel — Fleur de Sel de Guérande",   grams: 0.078, costPerGram: 0.01800, subtotal: 0.00140, kind: "filling_ingredient", ingredientId: fleurDeSelId, fillingId: caramelFillingId },
      { label: "Shell (dark)",  grams: 2.880, costPerGram: 0.0082, subtotal: 0.02362, kind: "shell" },
      { label: "Cap (dark)",    grams: 0.672, costPerGram: 0.0082, subtotal: 0.00551, kind: "cap"   },
    ]),
    recordedAt: jan20,
    triggerType: "ingredient_price",
    triggerDetail: "Heavy Cream 35% price updated",
    mouldId,
    coatingName: "dark",
  } as ProductCostSnapshot);

  // Feb 15 — Felchlin Sao Palme 75% dark shell (€0.0082 → €0.0168)
  await db.productCostSnapshots.add({
    productId: caramelProductId,
    costPerProduct: 0.07378,
    breakdown: JSON.stringify([
      { label: "Salted Caramel — Caster Sugar",               grams: 2.596, costPerGram: 0.00095, subtotal: 0.00247, kind: "filling_ingredient", ingredientId: sugarId,      fillingId: caramelFillingId },
      { label: "Salted Caramel — Heavy Cream 35%",            grams: 2.077, costPerGram: 0.00220, subtotal: 0.00457, kind: "filling_ingredient", ingredientId: cream35Id,    fillingId: caramelFillingId },
      { label: "Salted Caramel — Unsalted Butter 82% fat",    grams: 0.779, costPerGram: 0.00580, subtotal: 0.00452, kind: "filling_ingredient", ingredientId: butterId,     fillingId: caramelFillingId },
      { label: "Salted Caramel — Glucose Syrup DE42",         grams: 0.519, costPerGram: 0.00220, subtotal: 0.00114, kind: "filling_ingredient", ingredientId: glucoseId,    fillingId: caramelFillingId },
      { label: "Salted Caramel — Fleur de Sel de Guérande",   grams: 0.078, costPerGram: 0.01800, subtotal: 0.00140, kind: "filling_ingredient", ingredientId: fleurDeSelId, fillingId: caramelFillingId },
      { label: "Shell (dark)",  grams: 2.880, costPerGram: 0.0168, subtotal: 0.04838, kind: "shell" },
      { label: "Cap (dark)",    grams: 0.672, costPerGram: 0.0168, subtotal: 0.01129, kind: "cap"   },
    ]),
    recordedAt: feb15,
    triggerType: "coating_change",
    triggerDetail: "Coating chocolate for \"dark\" updated",
    mouldId,
    coatingName: "dark",
  } as ProductCostSnapshot);

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. HAZELNUT PRALINE  (shelf-stable filling)
  //    Filling: Hazelnuts(100) + Sugar(50) + Callebaut(30) = 180g
  //    Per-cavity scale = 6.048/180 = 0.033600
  //    Note: Callebaut 823 in the filling stays even after coating switch to Felchlin —
  //          only the shell/cap changes. This is the key demo talking point.
  // ═══════════════════════════════════════════════════════════════════════════

  // Jan 01
  await db.productCostSnapshots.add({
    productId: pralineProductId,
    costPerProduct: 0.07732,
    breakdown: JSON.stringify([
      { label: "Hazelnut Praline — Roasted Piedmont Hazelnuts",          grams: 3.360, costPerGram: 0.01100, subtotal: 0.03696, kind: "filling_ingredient", ingredientId: hazelnutsId,   fillingId: pralineFillingId },
      { label: "Hazelnut Praline — Caster Sugar",                        grams: 1.680, costPerGram: 0.00095, subtotal: 0.00160, kind: "filling_ingredient", ingredientId: sugarId,       fillingId: pralineFillingId },
      { label: "Hazelnut Praline — Callebaut 823 Milk Chocolate 33.6%",  grams: 1.008, costPerGram: 0.00850, subtotal: 0.00857, kind: "filling_ingredient", ingredientId: callebaut823Id, fillingId: pralineFillingId },
      { label: "Shell (milk)",  grams: 2.880, costPerGram: 0.0085, subtotal: 0.02448, kind: "shell" },
      { label: "Cap (milk)",    grams: 0.672, costPerGram: 0.0085, subtotal: 0.00571, kind: "cap"   },
    ]),
    recordedAt: jan01,
    triggerType: "manual",
    triggerDetail: "Initial cost calculation",
    mouldId,
    coatingName: "milk",
  } as ProductCostSnapshot);

  // Feb 15 — Felchlin milk shell. Callebaut in filling stays the same.
  await db.productCostSnapshots.add({
    productId: pralineProductId,
    costPerProduct: 0.09863,
    breakdown: JSON.stringify([
      { label: "Hazelnut Praline — Roasted Piedmont Hazelnuts",          grams: 3.360, costPerGram: 0.01100, subtotal: 0.03696, kind: "filling_ingredient", ingredientId: hazelnutsId,   fillingId: pralineFillingId },
      { label: "Hazelnut Praline — Caster Sugar",                        grams: 1.680, costPerGram: 0.00095, subtotal: 0.00160, kind: "filling_ingredient", ingredientId: sugarId,       fillingId: pralineFillingId },
      { label: "Hazelnut Praline — Callebaut 823 Milk Chocolate 33.6%",  grams: 1.008, costPerGram: 0.00850, subtotal: 0.00857, kind: "filling_ingredient", ingredientId: callebaut823Id, fillingId: pralineFillingId },
      { label: "Shell (milk)",  grams: 2.880, costPerGram: 0.0145, subtotal: 0.04176, kind: "shell" },
      { label: "Cap (milk)",    grams: 0.672, costPerGram: 0.0145, subtotal: 0.00974, kind: "cap"   },
    ]),
    recordedAt: feb15,
    triggerType: "coating_change",
    triggerDetail: "Coating chocolate for \"milk\" updated",
    mouldId,
    coatingName: "milk",
  } as ProductCostSnapshot);

  // Mar 15 — hazelnut price increase (€0.011 → €0.0135)
  await db.productCostSnapshots.add({
    productId: pralineProductId,
    costPerProduct: 0.10703,
    breakdown: JSON.stringify([
      { label: "Hazelnut Praline — Roasted Piedmont Hazelnuts",          grams: 3.360, costPerGram: 0.01350, subtotal: 0.04536, kind: "filling_ingredient", ingredientId: hazelnutsId,   fillingId: pralineFillingId },
      { label: "Hazelnut Praline — Caster Sugar",                        grams: 1.680, costPerGram: 0.00095, subtotal: 0.00160, kind: "filling_ingredient", ingredientId: sugarId,       fillingId: pralineFillingId },
      { label: "Hazelnut Praline — Callebaut 823 Milk Chocolate 33.6%",  grams: 1.008, costPerGram: 0.00850, subtotal: 0.00857, kind: "filling_ingredient", ingredientId: callebaut823Id, fillingId: pralineFillingId },
      { label: "Shell (milk)",  grams: 2.880, costPerGram: 0.0145, subtotal: 0.04176, kind: "shell" },
      { label: "Cap (milk)",    grams: 0.672, costPerGram: 0.0145, subtotal: 0.00974, kind: "cap"   },
    ]),
    recordedAt: mar15,
    triggerType: "ingredient_price",
    triggerDetail: "Roasted Piedmont Hazelnuts price updated",
    mouldId,
    coatingName: "milk",
  } as ProductCostSnapshot);

  // ── Experiments ────────────────────────────────────────────────────────────

  const milkExpId = await db.experiments.add({
    name: "Milk Chocolate Ganache (moulded)",
    ganacheType: "milk",
    notes: "Reference formulation for the milk ganache product. Uses Callebaut 823 + cream + glucose + butter.",
    createdAt: jan01,
    updatedAt: jan01,
  } as Experiment) as string;
  await db.experimentIngredients.bulkAdd([
    { experimentId: milkExpId, ingredientId: callebaut823Id, amount: 100, sortOrder: 0 } as ExperimentIngredient,
    { experimentId: milkExpId, ingredientId: cream35Id,      amount: 80,  sortOrder: 1 } as ExperimentIngredient,
    { experimentId: milkExpId, ingredientId: glucoseId,      amount: 20,  sortOrder: 2 } as ExperimentIngredient,
    { experimentId: milkExpId, ingredientId: butterId,       amount: 15,  sortOrder: 3 } as ExperimentIngredient,
  ]);

  const darkExpId = await db.experiments.add({
    name: "Dark Chocolate Ganache",
    ganacheType: "dark",
    notes: "Demo product. Expected balance: water ≈22.15%, sugar ≈30.02%, cocoa fat ≈16.66%, milk fat ≈21.65%, solids ≈9.52%.",
    createdAt: feb15,
    updatedAt: feb15,
  } as Experiment) as string;
  await db.experimentIngredients.bulkAdd([
    { experimentId: darkExpId, ingredientId: cream35Id,           amount: 140, sortOrder: 0 } as ExperimentIngredient,
    { experimentId: darkExpId, ingredientId: glucoseId,           amount: 70,  sortOrder: 1 } as ExperimentIngredient,
    { experimentId: darkExpId, ingredientId: invertSugarId,       amount: 55,  sortOrder: 2 } as ExperimentIngredient,
    { experimentId: darkExpId, ingredientId: felchlinMaracaiboId, amount: 240, sortOrder: 3 } as ExperimentIngredient,
    { experimentId: darkExpId, ingredientId: butterId,            amount: 100, sortOrder: 4 } as ExperimentIngredient,
  ]);

  // ── Production Plans ───────────────────────────────────────────────────────
  //
  // Scenario:
  //   Batch 1 (Jan 15) — Valentine's prep, all sold out
  //   Batch 2 (Feb 22) — first Felchlin batch, all sold out
  //   Batch 3 (Mar 8)  — Hazelnut Praline bulk (shelf-stable, still in stock)
  //   Batch 4 (Mar 20) — Mixed weekend batch (partially in stock, ganache running low)
  //   Batch 5 (Mar 27) — Today's Friday batch, in progress (shells done, filling in progress)

  // Legacy aliases kept for the production-plan block below.
  const jan15 = valentinesPrep;
  const feb22 = firstFelchlinBatch;
  const mar08 = pralineBulkDate;
  const mar20 = weekendMixedDate;
  const mar27 = activeBatch;

  // Batch 1 — Valentine's prep (all sold)
  const plan1Id = await db.productionPlans.add({
    name: "Valentine's Prep",
    status: "done",
    batchNumber: "20260115-001",
    notes: "Pre-Valentine rush — all three flavours. Sold out in 4 days.",
    batchSummary: "Valentine's Prep · 3 moulds each · 252 products total · all sold",
    createdAt: jan15,
    updatedAt: jan15,
    completedAt: jan15,
  } as ProductionPlan) as string;

  // A few pieces set aside for QC / small cosmetic defects on each batch.
  await db.planProducts.add({ planId: plan1Id, productId: ganacheProductId, mouldId, quantity: 2, sortOrder: 0, stockStatus: "gone", actualYield: 53 } as PlanProduct);
  await db.planProducts.add({ planId: plan1Id, productId: caramelProductId, mouldId, quantity: 2, sortOrder: 1, stockStatus: "gone", actualYield: 55 } as PlanProduct);
  await db.planProducts.add({ planId: plan1Id, productId: pralineProductId, mouldId, quantity: 1, sortOrder: 2, stockStatus: "gone", actualYield: 27 } as PlanProduct);

  // Batch 2 — First Felchlin batch (all sold)
  const plan2Id = await db.productionPlans.add({
    name: "First Felchlin Batch",
    status: "done",
    batchNumber: "20260222-001",
    notes: "First run with Felchlin shells. Noticeably better snap and gloss. Worth the premium.",
    batchSummary: "First Felchlin Batch · Milk Ganache × 2, Salted Caramel × 2 · 112 products total · all sold",
    createdAt: feb22,
    updatedAt: feb22,
    completedAt: feb22,
  } as ProductionPlan) as string;

  await db.planProducts.add({ planId: plan2Id, productId: ganacheProductId, mouldId, quantity: 2, sortOrder: 0, stockStatus: "gone", actualYield: 54 } as PlanProduct);
  await db.planProducts.add({ planId: plan2Id, productId: caramelProductId, mouldId, quantity: 2, sortOrder: 1, stockStatus: "gone", actualYield: 54 } as PlanProduct);

  // Batch 3 — Hazelnut Praline bulk (still in stock — shelf-stable)
  const plan3Id = await db.productionPlans.add({
    name: "Hazelnut Praline Bulk",
    status: "done",
    batchNumber: "20260308-001",
    notes: "Made a larger run before the hazelnut harvest shortage pushed prices up. 6-week shelf life.",
    batchSummary: "Hazelnut Praline Bulk · 3 moulds · 84 products",
    createdAt: mar08,
    updatedAt: mar08,
    completedAt: mar08,
  } as ProductionPlan) as string;

  // 84 pieces produced (3 moulds × 28 cavities); 24 have been frozen since mid-March
  // to extend their shelf life through Easter. preservedShelfLifeDays captures the
  // remaining shelf life at freeze time (6-week shelf life, frozen ~1 week after make).
  await db.planProducts.add({
    planId: plan3Id, productId: pralineProductId, mouldId, quantity: 3, sortOrder: 0,
    actualYield: 84, currentStock: 60,
    frozenQty: 24,
    frozenAt: pralineFreezeDate.getTime(),
    preservedShelfLifeDays: 35,
  } as PlanProduct);

  // Batch 4 — Mixed weekend batch (partially in stock)
  const plan4Id = await db.productionPlans.add({
    name: "Weekend Mixed Batch",
    status: "done",
    batchNumber: "20260320-001",
    notes: "",
    batchSummary: "Weekend Mixed Batch · Milk Ganache × 2, Salted Caramel × 1, Hazelnut Praline × 1 · 140 products",
    createdAt: mar20,
    updatedAt: mar20,
    completedAt: mar20,
  } as ProductionPlan) as string;

  await db.planProducts.add({ planId: plan4Id, productId: ganacheProductId, mouldId, quantity: 2, sortOrder: 0, stockStatus: "low", actualYield: 55, currentStock: 8, notes: "Nearly sold out — running low." } as PlanProduct);
  await db.planProducts.add({ planId: plan4Id, productId: caramelProductId, mouldId, quantity: 1, sortOrder: 1, actualYield: 27 } as PlanProduct);
  await db.planProducts.add({ planId: plan4Id, productId: pralineProductId, mouldId, quantity: 1, sortOrder: 2, actualYield: 27 } as PlanProduct);

  // Batch 5 — Today's batch, in progress (Milk Ganache: filled; Salted Caramel: shell done)
  const plan5Id = await db.productionPlans.add({
    name: "Friday Easter Batch",
    status: "active",
    batchNumber: "20260327-001",
    notes: "Easter weekend — stocking up on bestsellers.",
    createdAt: mar27,
    updatedAt: mar27,
  } as ProductionPlan) as string;

  const pb5aId = await db.planProducts.add({ planId: plan5Id, productId: ganacheProductId, mouldId, quantity: 3, sortOrder: 0 } as PlanProduct) as string;
  const pb5bId = await db.planProducts.add({ planId: plan5Id, productId: caramelProductId, mouldId, quantity: 2, sortOrder: 1 } as PlanProduct) as string;

  // Step statuses: Milk Ganache is filled and capped; Salted Caramel shell is done
  await db.planStepStatus.bulkAdd([
    { planId: plan5Id, stepKey: `color-${pb5aId}`,                   done: true, doneAt: mar27 } as PlanStepStatus,
    { planId: plan5Id, stepKey: `shell-${pb5aId}`,                   done: true, doneAt: mar27 } as PlanStepStatus,
    { planId: plan5Id, stepKey: `filling-${pb5aId}-${ganacheFillingId}`, done: true, doneAt: mar27 } as PlanStepStatus,
    { planId: plan5Id, stepKey: `fill-${pb5aId}`,                    done: true, doneAt: mar27 } as PlanStepStatus,
    { planId: plan5Id, stepKey: `cap-${pb5aId}`,                     done: true, doneAt: mar27 } as PlanStepStatus,
    { planId: plan5Id, stepKey: `color-${pb5bId}`,                   done: true, doneAt: mar27 } as PlanStepStatus,
    { planId: plan5Id, stepKey: `shell-${pb5bId}`,                   done: true, doneAt: mar27 } as PlanStepStatus,
  ]);

  // ── Packaging ──────────────────────────────────────────────────────────────
  //
  // Two box formats: a 4-piece gift box and a 9-piece luxury box.
  // Each has a short order history so the pricing page can pick up the latest unit cost.

  const box4Id = await db.packaging.add({
    name: "Signature Gift Box (4 pcs)",
    capacity: 4,
    manufacturer: "Keylink",
    notes: "Matte black with gold foil stamp. Magnetic closure. Fits 4 products in a 2×2 insert.",
    createdAt: jan01,
    updatedAt: jan01,
  } as Packaging) as string;

  const box9Id = await db.packaging.add({
    name: "Luxury Box (9 pcs)",
    capacity: 9,
    manufacturer: "Keylink",
    notes: "Large matte black box with ribbon. 3×3 insert. Our flagship presentation.",
    createdAt: jan01,
    updatedAt: jan01,
  } as Packaging) as string;

  // Packaging order history — prices went up slightly between Jan and March
  await db.packagingOrders.add({ packagingId: box4Id, quantity: 500, pricePerUnit: 1.65, supplier: "Keylink", orderedAt: jan01, notes: "Initial order — launch stock" } as PackagingOrder);
  await db.packagingOrders.add({ packagingId: box4Id, quantity: 300, pricePerUnit: 1.85, supplier: "Keylink", orderedAt: packagingPriceDate, notes: "Re-order — price increase from supplier" } as PackagingOrder);

  await db.packagingOrders.add({ packagingId: box9Id, quantity: 300, pricePerUnit: 2.40, supplier: "Keylink", orderedAt: jan01, notes: "Initial order — launch stock" } as PackagingOrder);
  await db.packagingOrders.add({ packagingId: box9Id, quantity: 200, pricePerUnit: 2.60, supplier: "Keylink", orderedAt: packagingPriceDate, notes: "Re-order — price increase from supplier" } as PackagingOrder);

  // ── Collections ───────────────────────────────────────────────────────────
  //
  // Three collections to demonstrate different profitability profiles:
  //
  //   1. "Standard Line" — ongoing, all 3 products, moderate pricing.
  //      The margins here have been squeezed by the Felchlin switch + ingredient
  //      price increases. Demonstrates the "do we need to raise prices?" question.
  //
  //   2. "Easter 2026" — seasonal (Mar 15 – Apr 21), all 3 products, premium pricing.
  //      Higher sell prices justify the premium ingredients. Healthy margins.
  //
  //   3. "Wholesale / B2B" — ongoing, only Milk Ganache + Salted Caramel (lower cost),
  //      but tight pricing for cafés and restaurants. Thin margins that need monitoring.

  const standardCollId = await db.collections.add({
    name: "Standard Line",
    description: "Our year-round collection. Available in-store and online.",
    startDate: isoDate(launchDate),
    // no endDate → ongoing / permanent
    notes: "Pricing set at launch in January. May need revisiting after the Felchlin switch pushed costs up.",
    createdAt: jan01,
    updatedAt: jan01,
  } as Collection) as string;

  const easterCollId = await db.collections.add({
    name: "Easter 2026",
    description: "Limited-edition spring collection with all three signature products.",
    startDate: isoDate(hazelnutShortage),
    endDate: isoDate(daysAgo(-36)), // ~5 weeks from today — Easter window stays in the future
    notes: "Premium packaging + higher price point. Includes the Hazelnut Praline which has a higher ingredient cost.",
    createdAt: easterConfigured,
    updatedAt: easterConfigured,
  } as Collection) as string;

  const wholesaleCollId = await db.collections.add({
    name: "Wholesale / B2B",
    description: "Café and restaurant supply. Milk Ganache and Salted Caramel only.",
    startDate: isoDate(valentinesPrep),
    // no endDate → ongoing
    notes: "Tight pricing agreed with three local cafés. Review margins quarterly — the Felchlin switch was not priced in.",
    createdAt: valentinesPrep,
    updatedAt: valentinesPrep,
  } as Collection) as string;

  // ── Collection → Product assignments ───────────────────────────────────────

  // Standard Line: all 3
  await db.collectionProducts.add({ collectionId: standardCollId, productId: ganacheProductId, sortOrder: 0 } as CollectionProduct);
  await db.collectionProducts.add({ collectionId: standardCollId, productId: caramelProductId, sortOrder: 1 } as CollectionProduct);
  await db.collectionProducts.add({ collectionId: standardCollId, productId: pralineProductId, sortOrder: 2 } as CollectionProduct);

  // Easter 2026: all 3
  await db.collectionProducts.add({ collectionId: easterCollId, productId: ganacheProductId, sortOrder: 0 } as CollectionProduct);
  await db.collectionProducts.add({ collectionId: easterCollId, productId: caramelProductId, sortOrder: 1 } as CollectionProduct);
  await db.collectionProducts.add({ collectionId: easterCollId, productId: pralineProductId, sortOrder: 2 } as CollectionProduct);

  // Wholesale: only the two lower-cost products
  await db.collectionProducts.add({ collectionId: wholesaleCollId, productId: ganacheProductId, sortOrder: 0 } as CollectionProduct);
  await db.collectionProducts.add({ collectionId: wholesaleCollId, productId: caramelProductId, sortOrder: 1 } as CollectionProduct);

  // ── Collection Packagings (box offerings + sell prices) ───────────────────
  //
  // Latest product costs (from final snapshots):
  //   Milk Ganache:    €0.084/pc
  //   Salted Caramel:  €0.074/pc
  //   Hazelnut Praline: €0.107/pc
  //
  // Average (all 3):     €0.088/pc
  // Average (ganache+caramel): €0.079/pc
  //
  // Latest packaging costs: Box of 4 = €1.85, Box of 9 = €2.60
  //
  // Standard Line — moderate pricing, set pre-Felchlin, now feeling the squeeze:
  //   Box of 4 @ €12.50 → cost ≈ 4×0.088 + 1.85 = €2.20 → margin €10.30 (82.4%)
  //   Box of 9 @ €25.00 → cost ≈ 9×0.088 + 2.60 = €3.39 → margin €21.61 (86.4%)
  //
  // Easter 2026 — premium seasonal pricing:
  //   Box of 4 @ €15.95 → cost ≈ €2.20 → margin €13.75 (86.2%)
  //   Box of 9 @ €34.50 → cost ≈ €3.39 → margin €31.11 (90.2%)
  //
  // Wholesale — tight B2B pricing, designed to show thinner margins:
  //   Box of 9 @ €5.90 → cost ≈ 9×0.079 + 2.60 = €3.31 → margin €2.59 (43.9%) — barely healthy
  //   Box of 4 @ €2.95 → cost ≈ 4×0.079 + 1.85 = €2.17 → margin €0.78 (26.4%) — thin!

  // Standard Line
  await db.collectionPackagings.add({ collectionId: standardCollId, packagingId: box4Id, sellPrice: 12.50, createdAt: jan01, updatedAt: jan01 } as CollectionPackaging);
  await db.collectionPackagings.add({ collectionId: standardCollId, packagingId: box9Id, sellPrice: 25.00, createdAt: jan01, updatedAt: jan01 } as CollectionPackaging);

  // Easter 2026
  await db.collectionPackagings.add({ collectionId: easterCollId, packagingId: box4Id, sellPrice: 15.95, createdAt: easterConfigured, updatedAt: easterConfigured } as CollectionPackaging);
  await db.collectionPackagings.add({ collectionId: easterCollId, packagingId: box9Id, sellPrice: 34.50, createdAt: easterConfigured, updatedAt: easterConfigured } as CollectionPackaging);

  // Wholesale — tight pricing that makes margins visible
  await db.collectionPackagings.add({ collectionId: wholesaleCollId, packagingId: box4Id, sellPrice: 2.95, createdAt: valentinesPrep, updatedAt: valentinesPrep } as CollectionPackaging);
  await db.collectionPackagings.add({ collectionId: wholesaleCollId, packagingId: box9Id, sellPrice: 5.90, createdAt: valentinesPrep, updatedAt: valentinesPrep } as CollectionPackaging);

  // ── Collection Pricing Snapshots (margin history) ─────────────────────────
  //
  // Pre-computed snapshots at each cost-changing event so the history chart
  // shows a meaningful trend from launch through to today.
  //
  // Events captured:
  //   Jan 01 / Jan 15 — initial box pricing configured
  //   Jan 20          — cream price increase (ingredient_price)
  //   Feb 01          — Easter collection pricing configured
  //   Feb 15          — Felchlin coating switch (coating_change) — big jump
  //   Mar 05          — packaging supplier price increase (packaging_cost)
  //   Mar 15          — hazelnut harvest shortage (ingredient_price)
  //
  // Avg product costs per collection at each event:
  //   Standard / Easter (all 3):   Jan01=0.0605 Jan20=0.0611 Feb15=0.0855 Mar15=0.0883
  //   Wholesale (ganache+caramel): Jan15=0.0521 Jan20=0.0530 Feb15=0.0789
  //
  // Packaging unit costs: Box4 = 1.65 until Mar05, then 1.85
  //                       Box9 = 2.40 until Mar05, then 2.60
  //
  // Helper: (sellPrice - totalCost) / sellPrice * 100

  const feb01 = easterConfigured;
  const mar05 = packagingPriceDate;

  // ── Standard Line — Box of 4 (sell €12.50) ─────────────────────────────────
  await db.collectionPricingSnapshots.add({ collectionId: standardCollId, packagingId: box4Id, avgProductCost: 0.06052, packagingUnitCost: 1.65, totalCost: 1.871, sellPrice: 12.50, marginPercent: 85.03, recordedAt: jan01, triggerType: "sell_price_change", triggerDetail: "Box pricing configured at €12.50" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: standardCollId, packagingId: box4Id, avgProductCost: 0.06110, packagingUnitCost: 1.65, totalCost: 1.894, sellPrice: 12.50, marginPercent: 84.85, recordedAt: jan20, triggerType: "ingredient_price", triggerDetail: "Heavy Cream 35% price updated" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: standardCollId, packagingId: box4Id, avgProductCost: 0.08549, packagingUnitCost: 1.65, totalCost: 1.992, sellPrice: 12.50, marginPercent: 84.07, recordedAt: feb15, triggerType: "coating_change", triggerDetail: "Upgraded to Felchlin couverture" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: standardCollId, packagingId: box4Id, avgProductCost: 0.08549, packagingUnitCost: 1.85, totalCost: 2.192, sellPrice: 12.50, marginPercent: 82.46, recordedAt: mar05, triggerType: "packaging_cost", triggerDetail: "Keylink re-order — price increase" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: standardCollId, packagingId: box4Id, avgProductCost: 0.08829, packagingUnitCost: 1.85, totalCost: 2.202, sellPrice: 12.50, marginPercent: 82.38, recordedAt: mar15, triggerType: "ingredient_price", triggerDetail: "Roasted Piedmont Hazelnuts price updated" } as CollectionPricingSnapshot);

  // ── Standard Line — Box of 9 (sell €25.00) ─────────────────────────────────
  await db.collectionPricingSnapshots.add({ collectionId: standardCollId, packagingId: box9Id, avgProductCost: 0.06052, packagingUnitCost: 2.40, totalCost: 2.947, sellPrice: 25.00, marginPercent: 88.21, recordedAt: jan01, triggerType: "sell_price_change", triggerDetail: "Box pricing configured at €25.00" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: standardCollId, packagingId: box9Id, avgProductCost: 0.06110, packagingUnitCost: 2.40, totalCost: 2.950, sellPrice: 25.00, marginPercent: 88.20, recordedAt: jan20, triggerType: "ingredient_price", triggerDetail: "Heavy Cream 35% price updated" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: standardCollId, packagingId: box9Id, avgProductCost: 0.08549, packagingUnitCost: 2.40, totalCost: 3.169, sellPrice: 25.00, marginPercent: 87.32, recordedAt: feb15, triggerType: "coating_change", triggerDetail: "Upgraded to Felchlin couverture" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: standardCollId, packagingId: box9Id, avgProductCost: 0.08549, packagingUnitCost: 2.60, totalCost: 3.369, sellPrice: 25.00, marginPercent: 86.52, recordedAt: mar05, triggerType: "packaging_cost", triggerDetail: "Keylink re-order — price increase" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: standardCollId, packagingId: box9Id, avgProductCost: 0.08829, packagingUnitCost: 2.60, totalCost: 3.395, sellPrice: 25.00, marginPercent: 86.42, recordedAt: mar15, triggerType: "ingredient_price", triggerDetail: "Roasted Piedmont Hazelnuts price updated" } as CollectionPricingSnapshot);

  // ── Easter 2026 — Box of 4 (sell €15.95) ───────────────────────────────────
  await db.collectionPricingSnapshots.add({ collectionId: easterCollId, packagingId: box4Id, avgProductCost: 0.06110, packagingUnitCost: 1.65, totalCost: 1.894, sellPrice: 15.95, marginPercent: 88.13, recordedAt: feb01, triggerType: "sell_price_change", triggerDetail: "Easter 2026 box pricing configured at €15.95" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: easterCollId, packagingId: box4Id, avgProductCost: 0.08549, packagingUnitCost: 1.65, totalCost: 1.992, sellPrice: 15.95, marginPercent: 87.51, recordedAt: feb15, triggerType: "coating_change", triggerDetail: "Upgraded to Felchlin couverture" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: easterCollId, packagingId: box4Id, avgProductCost: 0.08549, packagingUnitCost: 1.85, totalCost: 2.192, sellPrice: 15.95, marginPercent: 86.26, recordedAt: mar05, triggerType: "packaging_cost", triggerDetail: "Keylink re-order — price increase" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: easterCollId, packagingId: box4Id, avgProductCost: 0.08829, packagingUnitCost: 1.85, totalCost: 2.202, sellPrice: 15.95, marginPercent: 86.20, recordedAt: mar15, triggerType: "ingredient_price", triggerDetail: "Roasted Piedmont Hazelnuts price updated" } as CollectionPricingSnapshot);

  // ── Easter 2026 — Box of 9 (sell €34.50) ───────────────────────────────────
  await db.collectionPricingSnapshots.add({ collectionId: easterCollId, packagingId: box9Id, avgProductCost: 0.06110, packagingUnitCost: 2.40, totalCost: 2.950, sellPrice: 34.50, marginPercent: 91.45, recordedAt: feb01, triggerType: "sell_price_change", triggerDetail: "Easter 2026 box pricing configured at €34.50" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: easterCollId, packagingId: box9Id, avgProductCost: 0.08549, packagingUnitCost: 2.40, totalCost: 3.169, sellPrice: 34.50, marginPercent: 90.81, recordedAt: feb15, triggerType: "coating_change", triggerDetail: "Upgraded to Felchlin couverture" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: easterCollId, packagingId: box9Id, avgProductCost: 0.08549, packagingUnitCost: 2.60, totalCost: 3.369, sellPrice: 34.50, marginPercent: 90.23, recordedAt: mar05, triggerType: "packaging_cost", triggerDetail: "Keylink re-order — price increase" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: easterCollId, packagingId: box9Id, avgProductCost: 0.08829, packagingUnitCost: 2.60, totalCost: 3.395, sellPrice: 34.50, marginPercent: 90.16, recordedAt: mar15, triggerType: "ingredient_price", triggerDetail: "Roasted Piedmont Hazelnuts price updated" } as CollectionPricingSnapshot);

  // ── Wholesale — Box of 4 (sell €2.95) — thin margins, telling the squeeze story
  await db.collectionPricingSnapshots.add({ collectionId: wholesaleCollId, packagingId: box4Id, avgProductCost: 0.05213, packagingUnitCost: 1.65, totalCost: 1.860, sellPrice: 2.95, marginPercent: 36.95, recordedAt: valentinesPrep, triggerType: "sell_price_change", triggerDetail: "Wholesale box pricing configured at €2.95" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: wholesaleCollId, packagingId: box4Id, avgProductCost: 0.05299, packagingUnitCost: 1.65, totalCost: 1.862, sellPrice: 2.95, marginPercent: 36.88, recordedAt: jan20, triggerType: "ingredient_price", triggerDetail: "Heavy Cream 35% price updated" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: wholesaleCollId, packagingId: box4Id, avgProductCost: 0.07892, packagingUnitCost: 1.65, totalCost: 1.967, sellPrice: 2.95, marginPercent: 33.32, recordedAt: feb15, triggerType: "coating_change", triggerDetail: "Upgraded to Felchlin couverture" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: wholesaleCollId, packagingId: box4Id, avgProductCost: 0.07892, packagingUnitCost: 1.85, totalCost: 2.167, sellPrice: 2.95, marginPercent: 26.54, recordedAt: mar05, triggerType: "packaging_cost", triggerDetail: "Keylink re-order — price increase" } as CollectionPricingSnapshot);

  // ── Wholesale — Box of 9 (sell €5.90) ──────────────────────────────────────
  await db.collectionPricingSnapshots.add({ collectionId: wholesaleCollId, packagingId: box9Id, avgProductCost: 0.05213, packagingUnitCost: 2.40, totalCost: 2.869, sellPrice: 5.90, marginPercent: 51.37, recordedAt: valentinesPrep, triggerType: "sell_price_change", triggerDetail: "Wholesale box pricing configured at €5.90" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: wholesaleCollId, packagingId: box9Id, avgProductCost: 0.05299, packagingUnitCost: 2.40, totalCost: 2.877, sellPrice: 5.90, marginPercent: 51.23, recordedAt: jan20, triggerType: "ingredient_price", triggerDetail: "Heavy Cream 35% price updated" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: wholesaleCollId, packagingId: box9Id, avgProductCost: 0.07892, packagingUnitCost: 2.40, totalCost: 3.110, sellPrice: 5.90, marginPercent: 47.29, recordedAt: feb15, triggerType: "coating_change", triggerDetail: "Upgraded to Felchlin couverture" } as CollectionPricingSnapshot);
  await db.collectionPricingSnapshots.add({ collectionId: wholesaleCollId, packagingId: box9Id, avgProductCost: 0.07892, packagingUnitCost: 2.60, totalCost: 3.310, sellPrice: 5.90, marginPercent: 43.90, recordedAt: mar05, triggerType: "packaging_cost", triggerDetail: "Keylink re-order — price increase" } as CollectionPricingSnapshot);

  // ═══════════════════════════════════════════════════════════════════════════
  // ADDITIONAL PRODUCTS — for Product Cost Analysis demo
  //
  // Adds 4 more moulded products covering all 5 filling categories:
  //   4. Dark Ganache            — Ganaches,            dark coating  → ~€0.091
  //   5. Raspberry Ganache       — Ganaches,            milk coating  → ~€0.084
  //   6. Gianduja                — Pralines & Giandujas, milk coating → ~€0.108
  //   7. Caramel Crunch          — Caramels + Croustillants (2 fillings), milk → ~€0.081
  //
  // All use the same Martellato Square mould (shell=2.880g, cap=0.672g, fill=6.048g).
  // Current prices apply (post Mar-15: Felchlin shells, higher cream + hazelnut costs).
  // ═══════════════════════════════════════════════════════════════════════════

  const apr01 = recentSnapshotAnchor;

  // ── Additional ingredients ─────────────────────────────────────────────────

  const raspberryPureeId = await db.ingredients.add({
    name: "Raspberry Purée (10% sugar)",
    manufacturer: "",
    source: "Ravifruit",
    cost: 0,
    notes: "Aseptic raspberry purée with 10% added sugar. Bright, tart flavour.",
    category: "Liquids",
    purchaseCost: 3.50,
    purchaseQty: 1,
    purchaseUnit: "kg",
    gramsPerUnit: 1000,
    purchaseDate: isoDate(launchDate),
    cacaoFat: 0, sugar: 10, milkFat: 0, water: 85, solids: 5, otherFats: 0,
    allergens: [],
  } as Ingredient) as string;

  const hazelnutPasteId = await db.ingredients.add({
    name: "Hazelnut Praline Paste 50%",
    manufacturer: "",
    source: "Agrimontana",
    cost: 0,
    notes: "50% Piedmont hazelnuts + 50% caramelised sugar. Ready-made praline for crunch bases.",
    category: "Nuts / Nut Pastes / Pralines",
    purchaseCost: 10.00,
    purchaseQty: 1,
    purchaseUnit: "kg",
    gramsPerUnit: 1000,
    purchaseDate: isoDate(launchDate),
    cacaoFat: 0, sugar: 50, milkFat: 0, water: 2, solids: 10, otherFats: 38,
    allergens: ["nuts"],
  } as Ingredient) as string;

  const feuilletineId = await db.ingredients.add({
    name: "Feuilletine Flakes",
    manufacturer: "Barry Callebaut",
    source: "Dobla wholesale",
    cost: 0,
    notes: "Crispy caramelised crêpe flakes. Adds crunch to praline bases without moisture migration.",
    category: "Extra",
    purchaseCost: 8.00,
    purchaseQty: 1,
    purchaseUnit: "kg",
    gramsPerUnit: 1000,
    purchaseDate: isoDate(launchDate),
    cacaoFat: 0, sugar: 55, milkFat: 5, water: 2, solids: 8, otherFats: 30,
    allergens: ["gluten", "lactose"],
  } as Ingredient) as string;

  // ── Additional fillings ──────────────────────────────────────────────────────

  // Dark Chocolate Ganache: Callebaut 811(120) + Cream(90) + Glucose(20) + InvertSugar(20) + Butter(10) = 260g
  const darkGanacheFillingId = await db.fillings.add({
    name: "Dark Chocolate Ganache",
    category: "Ganaches (Emulsions)",
    source: "original",
    description: "Full-flavoured dark ganache. Callebaut 811 gives clean bitterness; invert sugar extends shelf life and smoothens texture.",
    allergens: ["lactose"],
    instructions: [
      "1. Bring cream and glucose to 85°C.",
      "2. Add invert sugar, stir to dissolve.",
      "3. Pour over finely chopped Callebaut 811 in three additions, emulsifying between each.",
      "4. At 35°C blend in cold cubed butter until glossy.",
      "5. Frame or pipe at 27°C. Crystallise 12h at 17°C.",
    ].join("\n"),
    status: "confirmed",
    shelfLifeWeeks: 4,
    version: 1,
    createdAt: jan01,
  } as Filling) as string;

  // Raspberry Ganache: Callebaut 823(80) + RaspberryPurée(100) + Glucose(20) + Butter(15) = 215g
  const raspberryGanacheFillingId = await db.fillings.add({
    name: "Raspberry Ganache",
    category: "Ganaches (Emulsions)",
    source: "original",
    description: "Bright, fruity ganache. Raspberry purée replaces part of the cream for natural acidity without losing emulsion stability.",
    allergens: ["lactose"],
    instructions: [
      "1. Warm raspberry purée and glucose to 70°C — do not boil.",
      "2. Pour over chopped Callebaut 823 in two additions, emulsifying after each.",
      "3. At 35°C blend in cold cubed butter.",
      "4. Pipe at 26–27°C into shells. Set 8h at 17°C.",
    ].join("\n"),
    status: "confirmed",
    shelfLifeWeeks: 2,
    version: 1,
    createdAt: jan01,
  } as Filling) as string;

  // Gianduja: Hazelnuts(100) + Callebaut 823(100) + Butter(20) + Sugar(30) = 250g
  const giandujaFillingId = await db.fillings.add({
    name: "Gianduja",
    category: "Pralines & Giandujas (Nut-Based)",
    source: "original",
    description: "Classic Italian-style gianduja. Equal parts roasted Piedmont hazelnut paste and milk chocolate, with a whisper of butter for shine.",
    allergens: ["lactose", "nuts"],
    instructions: [
      "1. Process roasted hazelnuts with sugar to a smooth paste.",
      "2. Fold into melted and tempered Callebaut 823.",
      "3. Add softened butter, mix until uniform.",
      "4. Spread to 8mm in a frame. Crystallise 24h at 16°C before cutting.",
    ].join("\n"),
    status: "confirmed",
    shelfLifeWeeks: 10,
    version: 1,
    createdAt: jan01,
  } as Filling) as string;

  // Feuilletine Crunch: Feuilletine(50) + Callebaut 823(30) + HazelnutPaste(20) = 100g
  const crunchFillingId = await db.fillings.add({
    name: "Feuilletine Crunch",
    category: 'Croustillants & Biscuits (The "Crunch" Filling)',
    source: "original",
    description: "Crispy praline base. Feuilletine flakes folded into tempered milk chocolate and praline paste. Stays crunchy for 4+ weeks.",
    allergens: ["gluten", "lactose", "nuts"],
    instructions: [
      "1. Melt and temper Callebaut 823.",
      "2. Stir in hazelnut praline paste until smooth.",
      "3. Fold in feuilletine flakes gently — do not crush.",
      "4. Spread immediately to 4mm and allow to set at 17°C.",
    ].join("\n"),
    status: "confirmed",
    shelfLifeWeeks: 6,
    version: 1,
    createdAt: jan01,
  } as Filling) as string;

  // ── Filling ingredients for new fillings ──────────────────────────────────────

  await db.fillingIngredients.add({ fillingId: darkGanacheFillingId, ingredientId: callebaut811Id,  amount: 120, unit: "g", sortOrder: 0 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: darkGanacheFillingId, ingredientId: cream35Id,       amount: 90,  unit: "g", sortOrder: 1 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: darkGanacheFillingId, ingredientId: glucoseId,       amount: 20,  unit: "g", sortOrder: 2 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: darkGanacheFillingId, ingredientId: invertSugarId,   amount: 20,  unit: "g", sortOrder: 3 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: darkGanacheFillingId, ingredientId: butterId,        amount: 10,  unit: "g", sortOrder: 4 } as FillingIngredient);

  await db.fillingIngredients.add({ fillingId: raspberryGanacheFillingId, ingredientId: callebaut823Id,   amount: 80,  unit: "g", sortOrder: 0 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: raspberryGanacheFillingId, ingredientId: raspberryPureeId, amount: 100, unit: "g", sortOrder: 1 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: raspberryGanacheFillingId, ingredientId: glucoseId,        amount: 20,  unit: "g", sortOrder: 2 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: raspberryGanacheFillingId, ingredientId: butterId,         amount: 15,  unit: "g", sortOrder: 3 } as FillingIngredient);

  await db.fillingIngredients.add({ fillingId: giandujaFillingId, ingredientId: hazelnutsId,   amount: 100, unit: "g", sortOrder: 0 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: giandujaFillingId, ingredientId: callebaut823Id, amount: 100, unit: "g", sortOrder: 1 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: giandujaFillingId, ingredientId: butterId,       amount: 20,  unit: "g", sortOrder: 2 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: giandujaFillingId, ingredientId: sugarId,        amount: 30,  unit: "g", sortOrder: 3 } as FillingIngredient);

  await db.fillingIngredients.add({ fillingId: crunchFillingId, ingredientId: feuilletineId,    amount: 50, unit: "g", sortOrder: 0 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: crunchFillingId, ingredientId: callebaut823Id,   amount: 30, unit: "g", sortOrder: 1 } as FillingIngredient);
  await db.fillingIngredients.add({ fillingId: crunchFillingId, ingredientId: hazelnutPasteId,  amount: 20, unit: "g", sortOrder: 2 } as FillingIngredient);

  // ── Additional products ─────────────────────────────────────────────────────

  const darkGanacheProductId = await db.products.add({
    name: "Dark Ganache",
    productCategoryId: mouldedCategoryId,
    shellIngredientId: felchlinMaracaiboId,
    shellPercentage: 37,
    coating: "dark",
    defaultMouldId: mouldId,
    defaultBatchQty: 1,
    popularity: 4,
    notes: "Elegant and intense. Callebaut 811 filling in a Felchlin Sao Palme 75% shell — a study in bittersweet complexity.",
    tags: ["dark", "classic"],
    shelfLifeWeeks: "3",
    createdAt: jan01,
    updatedAt: jan01,
  } as Product) as string;

  const raspberryProductId = await db.products.add({
    name: "Raspberry Ganache",
    productCategoryId: mouldedCategoryId,
    shellIngredientId: felchlinLeggeroId,
    shellPercentage: 37,
    coating: "milk",
    defaultMouldId: mouldId,
    defaultBatchQty: 1,
    popularity: 4,
    notes: "The Ravifruit purée gives a clean, natural raspberry hit. Felchlin Sao Palme 43% shell softens the tartness beautifully.",
    tags: ["fruity", "signature"],
    shelfLifeWeeks: "3",
    shellDesign: [
      { technique: "Airbrushing", materialIds: [fuchsiaRomanceId], notes: "Full-coverage airbrushing — vivid fuchsia that instantly signals the raspberry filling." },
    ],
    createdAt: jan01,
    updatedAt: jan01,
  } as Product) as string;

  const giandujaProductId = await db.products.add({
    name: "Gianduja",
    productCategoryId: mouldedCategoryId,
    shellIngredientId: felchlinLeggeroId,
    shellPercentage: 37,
    coating: "milk",
    defaultMouldId: mouldId,
    defaultBatchQty: 1,
    popularity: 5,
    notes: "Our most indulgent product. Made only with PGI Piedmont hazelnuts — the price has risen since March but it remains worth it.",
    tags: ["nut-based", "bestseller"],
    shelfLifeWeeks: "5",
    createdAt: jan01,
    updatedAt: jan01,
  } as Product) as string;

  const caramelCrunchProductId = await db.products.add({
    name: "Caramel Crunch",
    productCategoryId: mouldedCategoryId,
    shellIngredientId: felchlinLeggeroId,
    shellPercentage: 37,
    coating: "milk",
    defaultMouldId: mouldId,
    defaultBatchQty: 1,
    popularity: 4,
    notes: "Two-filling product: feuilletine crunch base (40%) topped with salted caramel (60%). Textural contrast is the whole point.",
    tags: ["two-filling", "signature"],
    shelfLifeWeeks: "4",
    createdAt: jan01,
    updatedAt: jan01,
  } as Product) as string;

  // ── Product–Filling links ─────────────────────────────────────────────────────

  await db.productFillings.add({ productId: darkGanacheProductId,    fillingId: darkGanacheFillingId,     sortOrder: 0, fillPercentage: 100 } as ProductFilling);
  await db.productFillings.add({ productId: raspberryProductId,      fillingId: raspberryGanacheFillingId, sortOrder: 0, fillPercentage: 100 } as ProductFilling);
  await db.productFillings.add({ productId: giandujaProductId,       fillingId: giandujaFillingId,         sortOrder: 0, fillPercentage: 100 } as ProductFilling);
  // Caramel Crunch: crunch on bottom (sort 0, 40%), caramel on top (sort 1, 60%)
  await db.productFillings.add({ productId: caramelCrunchProductId,  fillingId: crunchFillingId,      sortOrder: 0, fillPercentage: 40 } as ProductFilling);
  await db.productFillings.add({ productId: caramelCrunchProductId,  fillingId: caramelFillingId,     sortOrder: 1, fillPercentage: 60 } as ProductFilling);

  // ── Ingredient price history for new ingredients ───────────────────────────

  await db.ingredientPriceHistory.add({ ingredientId: raspberryPureeId, costPerGram: 0.0035, recordedAt: jan01, purchaseCost: 3.50, purchaseQty: 1, purchaseUnit: "kg", gramsPerUnit: 1000, note: "Initial price — Ravifruit" } as IngredientPriceHistory);
  await db.ingredientPriceHistory.add({ ingredientId: hazelnutPasteId,  costPerGram: 0.010,  recordedAt: jan01, purchaseCost: 10.00, purchaseQty: 1, purchaseUnit: "kg", gramsPerUnit: 1000, note: "Initial price" } as IngredientPriceHistory);
  await db.ingredientPriceHistory.add({ ingredientId: feuilletineId,    costPerGram: 0.008,  recordedAt: jan01, purchaseCost: 8.00,  purchaseQty: 1, purchaseUnit: "kg", gramsPerUnit: 1000, note: "Initial price" } as IngredientPriceHistory);

  // ── Product Cost Snapshots for new products ─────────────────────────────────
  //
  // Mould geometry (same as above): fill=6.048g, shell=2.880g, cap=0.672g.
  // All at current prices (post Mar-15 hazelnut increase, Felchlin shells).
  //
  // ── 4. DARK GANACHE
  //    Filling: Callebaut811(120)+Cream(90)+Glucose(20)+InvertSugar(20)+Butter(10) = 260g
  //    Fill scale = 6.048/260 = 0.023262
  // ─────────────────────────────────────────────────────────────────────────
  await db.productCostSnapshots.add({
    productId: darkGanacheProductId,
    costPerProduct: 0.09052,
    breakdown: JSON.stringify([
      { label: "Dark Chocolate Ganache — Callebaut 811 Dark Chocolate 54.5%", grams: 2.791, costPerGram: 0.0082, subtotal: 0.02289, kind: "filling_ingredient", ingredientId: callebaut811Id,  fillingId: darkGanacheFillingId },
      { label: "Dark Chocolate Ganache — Heavy Cream 35%",                   grams: 2.094, costPerGram: 0.0022, subtotal: 0.00461, kind: "filling_ingredient", ingredientId: cream35Id,       fillingId: darkGanacheFillingId },
      { label: "Dark Chocolate Ganache — Glucose Syrup DE42",                grams: 0.465, costPerGram: 0.0022, subtotal: 0.00102, kind: "filling_ingredient", ingredientId: glucoseId,       fillingId: darkGanacheFillingId },
      { label: "Dark Chocolate Ganache — Invert Sugar",                      grams: 0.465, costPerGram: 0.0021, subtotal: 0.00098, kind: "filling_ingredient", ingredientId: invertSugarId,   fillingId: darkGanacheFillingId },
      { label: "Dark Chocolate Ganache — Unsalted Butter 82% fat",           grams: 0.233, costPerGram: 0.0058, subtotal: 0.00135, kind: "filling_ingredient", ingredientId: butterId,        fillingId: darkGanacheFillingId },
      { label: "Shell (dark)",  grams: 2.880, costPerGram: 0.0168, subtotal: 0.04838, kind: "shell" },
      { label: "Cap (dark)",    grams: 0.672, costPerGram: 0.0168, subtotal: 0.01129, kind: "cap"   },
    ]),
    recordedAt: apr01,
    triggerType: "manual",
    triggerDetail: "Initial cost calculation",
    mouldId,
    coatingName: "dark",
  } as ProductCostSnapshot);

  // ── 5. RASPBERRY GANACHE
  //    Filling: Callebaut823(80)+RaspberryPurée(100)+Glucose(20)+Butter(15) = 215g
  //    Fill scale = 6.048/215 = 0.028130
  // ─────────────────────────────────────────────────────────────────────────
  await db.productCostSnapshots.add({
    productId: raspberryProductId,
    costPerProduct: 0.08417,
    breakdown: JSON.stringify([
      { label: "Raspberry Ganache — Callebaut 823 Milk Chocolate 33.6%", grams: 2.250, costPerGram: 0.0085, subtotal: 0.01913, kind: "filling_ingredient", ingredientId: callebaut823Id,   fillingId: raspberryGanacheFillingId },
      { label: "Raspberry Ganache — Raspberry Purée (10% sugar)",        grams: 2.813, costPerGram: 0.0035, subtotal: 0.00985, kind: "filling_ingredient", ingredientId: raspberryPureeId, fillingId: raspberryGanacheFillingId },
      { label: "Raspberry Ganache — Glucose Syrup DE42",                 grams: 0.563, costPerGram: 0.0022, subtotal: 0.00124, kind: "filling_ingredient", ingredientId: glucoseId,        fillingId: raspberryGanacheFillingId },
      { label: "Raspberry Ganache — Unsalted Butter 82% fat",            grams: 0.422, costPerGram: 0.0058, subtotal: 0.00245, kind: "filling_ingredient", ingredientId: butterId,         fillingId: raspberryGanacheFillingId },
      { label: "Shell (milk)",  grams: 2.880, costPerGram: 0.0145, subtotal: 0.04176, kind: "shell" },
      { label: "Cap (milk)",    grams: 0.672, costPerGram: 0.0145, subtotal: 0.00974, kind: "cap"   },
    ]),
    recordedAt: apr01,
    triggerType: "manual",
    triggerDetail: "Initial cost calculation",
    mouldId,
    coatingName: "milk",
  } as ProductCostSnapshot);

  // ── 6. GIANDUJA
  //    Filling: Hazelnuts(100)+Callebaut823(100)+Butter(20)+Sugar(30) = 250g
  //    Fill scale = 6.048/250 = 0.024192
  // ─────────────────────────────────────────────────────────────────────────
  await db.productCostSnapshots.add({
    productId: giandujaProductId,
    costPerProduct: 0.10822,
    breakdown: JSON.stringify([
      { label: "Gianduja — Roasted Piedmont Hazelnuts",          grams: 2.419, costPerGram: 0.0135, subtotal: 0.03266, kind: "filling_ingredient", ingredientId: hazelnutsId,   fillingId: giandujaFillingId },
      { label: "Gianduja — Callebaut 823 Milk Chocolate 33.6%", grams: 2.419, costPerGram: 0.0085, subtotal: 0.02056, kind: "filling_ingredient", ingredientId: callebaut823Id, fillingId: giandujaFillingId },
      { label: "Gianduja — Unsalted Butter 82% fat",            grams: 0.484, costPerGram: 0.0058, subtotal: 0.00281, kind: "filling_ingredient", ingredientId: butterId,       fillingId: giandujaFillingId },
      { label: "Gianduja — Caster Sugar",                       grams: 0.726, costPerGram: 0.00095, subtotal: 0.00069, kind: "filling_ingredient", ingredientId: sugarId,      fillingId: giandujaFillingId },
      { label: "Shell (milk)",  grams: 2.880, costPerGram: 0.0145, subtotal: 0.04176, kind: "shell" },
      { label: "Cap (milk)",    grams: 0.672, costPerGram: 0.0145, subtotal: 0.00974, kind: "cap"   },
    ]),
    recordedAt: apr01,
    triggerType: "manual",
    triggerDetail: "Initial cost calculation",
    mouldId,
    coatingName: "milk",
  } as ProductCostSnapshot);

  // ── 7. CARAMEL CRUNCH (two fillings: Crunch 40% + Salted Caramel 60%)
  //    Crunch fill:  6.048 × 0.40 = 2.419g  — Feuilletine(50)+Cal823(30)+HazelnutPaste(20) = 100g → scale 0.024192
  //    Caramel fill: 6.048 × 0.60 = 3.629g  — Sugar(100)+Cream(80)+Butter(30)+Glucose(20)+Salt(3) = 233g → scale 0.015575
  // ─────────────────────────────────────────────────────────────────────────
  await db.productCostSnapshots.add({
    productId: caramelCrunchProductId,
    costPerProduct: 0.08066,
    breakdown: JSON.stringify([
      { label: "Feuilletine Crunch — Feuilletine Flakes",             grams: 1.210, costPerGram: 0.0080,  subtotal: 0.00968, kind: "filling_ingredient", ingredientId: feuilletineId,   fillingId: crunchFillingId },
      { label: "Feuilletine Crunch — Callebaut 823 Milk Chocolate",   grams: 0.726, costPerGram: 0.0085,  subtotal: 0.00617, kind: "filling_ingredient", ingredientId: callebaut823Id,  fillingId: crunchFillingId },
      { label: "Feuilletine Crunch — Hazelnut Praline Paste 50%",     grams: 0.484, costPerGram: 0.0100,  subtotal: 0.00484, kind: "filling_ingredient", ingredientId: hazelnutPasteId, fillingId: crunchFillingId },
      { label: "Salted Caramel — Caster Sugar",                       grams: 1.558, costPerGram: 0.00095, subtotal: 0.00148, kind: "filling_ingredient", ingredientId: sugarId,         fillingId: caramelFillingId },
      { label: "Salted Caramel — Heavy Cream 35%",                    grams: 1.246, costPerGram: 0.0022,  subtotal: 0.00274, kind: "filling_ingredient", ingredientId: cream35Id,       fillingId: caramelFillingId },
      { label: "Salted Caramel — Unsalted Butter 82% fat",            grams: 0.467, costPerGram: 0.0058,  subtotal: 0.00271, kind: "filling_ingredient", ingredientId: butterId,        fillingId: caramelFillingId },
      { label: "Salted Caramel — Glucose Syrup DE42",                 grams: 0.312, costPerGram: 0.0022,  subtotal: 0.00069, kind: "filling_ingredient", ingredientId: glucoseId,       fillingId: caramelFillingId },
      { label: "Salted Caramel — Fleur de Sel de Guérande",           grams: 0.047, costPerGram: 0.0180,  subtotal: 0.00085, kind: "filling_ingredient", ingredientId: fleurDeSelId,   fillingId: caramelFillingId },
      { label: "Shell (milk)",  grams: 2.880, costPerGram: 0.0145, subtotal: 0.04176, kind: "shell" },
      { label: "Cap (milk)",    grams: 0.672, costPerGram: 0.0145, subtotal: 0.00974, kind: "cap"   },
    ]),
    recordedAt: apr01,
    triggerType: "manual",
    triggerDetail: "Initial cost calculation",
    mouldId,
    coatingName: "milk",
  } as ProductCostSnapshot);

  // ── Filling Stock (leftover filling) ─────────────────────────────────────────
  // Hazelnut Praline: 120g left over from the bulk batch (made Mar 8, 8-week shelf life → ~3 wks left)
  await db.fillingStock.add({
    fillingId: pralineFillingId,
    remainingG: 120,
    planId: plan3Id,
    madeAt: mar08.toISOString(),
    createdAt: mar08.getTime(),
  } as FillingStock);

  // Gianduja: 85g left over from weekend mixed batch (made Mar 20, 10-week shelf life → ~7 wks left)
  await db.fillingStock.add({
    fillingId: giandujaFillingId,
    remainingG: 85,
    planId: plan4Id,
    madeAt: mar20.toISOString(),
    createdAt: mar20.getTime(),
  } as FillingStock);

  // ── Frozen Filling Stock ────────────────────────────────────────────────────
  //
  // Two frozen leftovers to exercise the freezer workflow on the stock page:
  //
  //  · Milk Chocolate Ganache — 95g leftover from the Feb 22 Felchlin batch.
  //    Ganache isn't shelf-stable, so freezing was the only way to save it.
  //    Preserved ~14 days of shelf life (3-week filling, frozen a week after making).
  //
  //  · Gianduja — 60g from the weekend mixed batch (Mar 20), frozen the same
  //    day as a hedge against Easter demand spikes. Shelf-stable, so this is
  //    a "batch the extra for later" rather than a rescue.
  const feb28 = ganacheFrozenAt;
  await db.fillingStock.add({
    fillingId: ganacheFillingId,
    remainingG: 95,
    planId: plan2Id,
    madeAt: feb22.toISOString(),
    createdAt: feb22.getTime(),
    frozen: true,
    frozenAt: feb28.getTime(),
    preservedShelfLifeDays: 14,
    notes: "Frozen within a week of making — emergency stash for Easter.",
  } as FillingStock);

  await db.fillingStock.add({
    fillingId: giandujaFillingId,
    remainingG: 60,
    planId: plan4Id,
    madeAt: mar20.toISOString(),
    createdAt: mar20.getTime(),
    frozen: true,
    frozenAt: mar20.getTime(),
    preservedShelfLifeDays: 60,
    notes: "Flash-frozen the day it was made — held back for Easter bar production.",
  } as FillingStock);

  // ═══════════════════════════════════════════════════════════════════════════
  // BARS — bean-to-bar tablets (100% shell) + one filled bar
  //
  //   8. Madagascar 72% Bar   — shellPercentage 100, bean-to-bar single-origin dark
  //   9. Vietnam 36% Milk Bar — shellPercentage 100, Felchlin Sao Palme 43% milk
  //  10. Gianduja Bar         — shellPercentage 55, filled with Gianduja
  //
  // Uses a new 3-cavity 100g bar mould (Chocolate World CW2000 style).
  // ═══════════════════════════════════════════════════════════════════════════

  // Resolve the seeded "bar" product category (seeded alongside "moulded")
  const { ensureDefaultProductCategories: _ensureCats } = await import("@/lib/hooks");
  await _ensureCats();
  const barCategory =
    (await db.productCategories.where("name").equals("bar").first()) ??
    (await db.productCategories.toArray()).find((c) => c.name.toLowerCase() === "bar");
  const barCategoryId = barCategory?.id;
  if (!barCategoryId) {
    return { success: false, message: "Could not resolve the default 'bar' category." };
  }

  // Bean-to-bar single-origin couverture — made in-house from Madagascar beans.
  const madagascarChocId = await db.ingredients.add({
    name: "House Bean-to-Bar Madagascar 72%",
    manufacturer: "In-house",
    source: "Akesson's Estate beans",
    cost: 0,
    notes: "Single-origin dark couverture, made in-house from Akesson's Madagascar beans. Bright red-fruit acidity, long cocoa finish. Used in the Madagascar 72% Bar.",
    category: "Chocolate",
    shellCapable: true,
    purchaseCost: 22.00, // higher cost reflects bean-to-bar labour + single-origin premium
    purchaseQty: 1,
    purchaseUnit: "kg",
    gramsPerUnit: 1000,
    purchaseDate: isoDate(barsStarted),
    cacaoFat: 44, sugar: 28, milkFat: 0, water: 0, solids: 28, otherFats: 0,
    allergens: [],
    nutrition: { energyKcal: 575, fat: 44.0, saturatedFat: 26.8, carbohydrate: 34.0, sugars: 28.0, fibre: 10.5, protein: 9.5, salt: 0.01, sodium: 4, transFat: 0, cholesterolMg: 0, ironMg: 11.0, potassiumMg: 700 },
  } as Ingredient) as string;

  await db.ingredientPriceHistory.add({
    ingredientId: madagascarChocId, costPerGram: 0.022, recordedAt: barsStarted,
    purchaseCost: 22.00, purchaseQty: 1, purchaseUnit: "kg", gramsPerUnit: 1000,
    note: "First in-house batch — bean-to-bar Madagascar 72%",
  } as IngredientPriceHistory);

  // Bar mould — 3 × 100g tablets per mould.
  const barMouldId = await db.moulds.add({
    name: "Chocolate World Bar 100g (3-cavity)",
    productNumber: "CW2000",
    brand: "Chocolate World",
    cavityWeightG: 100,
    numberOfCavities: 3,
    fillingGramsPerCavity: 45, // only relevant for filled bars
    quantityOwned: 4,
  } as Mould) as string;

  // ── 8. Madagascar 72% Bar (pure dark, no filling) ──────────────────────────
  const madagascarBarId = await db.products.add({
    name: "Madagascar 72% Bar",
    productCategoryId: barCategoryId,
    shellIngredientId: madagascarChocId,
    shellPercentage: 100,
    coating: "dark",
    defaultMouldId: barMouldId,
    defaultBatchQty: 1,
    popularity: 5,
    notes: "Single-origin bean-to-bar tablet. No filling — just pure chocolate showing off the Madagascar terroir.",
    tags: ["bean-to-bar", "single-origin", "bar"],
    shelfLifeWeeks: "52",
    createdAt: barsStarted,
    updatedAt: barsStarted,
  } as Product) as string;

  // ── 9. Vietnam-style Milk 36% Bar (pure milk, no filling) ──────────────────
  const milkBarId = await db.products.add({
    name: "Milk 36% Bar",
    productCategoryId: barCategoryId,
    shellIngredientId: felchlinLeggeroId,
    shellPercentage: 100,
    coating: "milk",
    defaultMouldId: barMouldId,
    defaultBatchQty: 1,
    popularity: 4,
    notes: "Felchlin Sao Palme 43% 36% moulded into a simple tablet — floral, caramel milk chocolate at its most direct.",
    tags: ["bar", "milk"],
    shelfLifeWeeks: "40",
    createdAt: barsStarted,
    updatedAt: barsStarted,
  } as Product) as string;

  // ── 10. Gianduja Bar (filled bar — 55% shell + 45% gianduja) ───────────────
  const giandujaBarId = await db.products.add({
    name: "Gianduja Bar",
    productCategoryId: barCategoryId,
    shellIngredientId: felchlinLeggeroId,
    shellPercentage: 55,
    coating: "milk",
    defaultMouldId: barMouldId,
    defaultBatchQty: 1,
    popularity: 5,
    notes: "Filled bar: thin Felchlin Sao Palme 43% shell enclosing a generous gianduja centre. Best eaten cool — the filling softens at room temperature.",
    tags: ["bar", "filled", "nut-based"],
    shelfLifeWeeks: "8",
    createdAt: barsStarted,
    updatedAt: barsStarted,
  } as Product) as string;

  await db.productFillings.add({
    productId: giandujaBarId, fillingId: giandujaFillingId, sortOrder: 0, fillPercentage: 100,
  } as ProductFilling);

  // ── Cost snapshots for the three bars ──────────────────────────────────────
  //
  // Bar mould: cavityWeightG = 100g.
  //   Madagascar 72% Bar  — shell = 100 × 1.00 = 100g × €0.022  = €2.200
  //   Milk 36% Bar        — shell = 100 × 1.00 = 100g × €0.0145 = €1.450
  //   Gianduja Bar        — shell = 100 × 0.55 = 55g  × €0.0145 = €0.79750
  //                         fill  = 100 × 0.45 × 1.2 = 54g gianduja
  //                         gianduja cost/g = (100×0.0135 + 100×0.0085 + 20×0.0058 + 30×0.00095) / 250
  //                                         = (1.35 + 0.85 + 0.116 + 0.0285) / 250 = €0.009378/g
  //                         filling ingredient scale = 54/250 = 0.216
  //                           hazelnuts: 21.6g × 0.0135 = €0.2916
  //                           Callebaut 823: 21.6g × 0.0085 = €0.18360
  //                           butter: 4.32g × 0.0058 = €0.02506
  //                           sugar: 6.48g × 0.00095 = €0.006156
  //                         total filling = €0.50641
  //                         bar total = 0.79750 + 0.50641 = €1.30391

  await db.productCostSnapshots.add({
    productId: madagascarBarId,
    costPerProduct: 2.20,
    breakdown: JSON.stringify([
      { label: "Shell (dark)", grams: 100.000, costPerGram: 0.022, subtotal: 2.200, kind: "shell" },
    ]),
    recordedAt: barsStarted,
    triggerType: "manual",
    triggerDetail: "Initial cost calculation — bean-to-bar bar",
    mouldId: barMouldId,
    coatingName: "dark",
  } as ProductCostSnapshot);

  await db.productCostSnapshots.add({
    productId: milkBarId,
    costPerProduct: 1.45,
    breakdown: JSON.stringify([
      { label: "Shell (milk)", grams: 100.000, costPerGram: 0.0145, subtotal: 1.450, kind: "shell" },
    ]),
    recordedAt: barsStarted,
    triggerType: "manual",
    triggerDetail: "Initial cost calculation — milk bar",
    mouldId: barMouldId,
    coatingName: "milk",
  } as ProductCostSnapshot);

  await db.productCostSnapshots.add({
    productId: giandujaBarId,
    costPerProduct: 1.30391,
    breakdown: JSON.stringify([
      { label: "Gianduja — Roasted Piedmont Hazelnuts",         grams: 21.600, costPerGram: 0.01350,  subtotal: 0.29160, kind: "filling_ingredient", ingredientId: hazelnutsId,    fillingId: giandujaFillingId },
      { label: "Gianduja — Callebaut 823 Milk Chocolate 33.6%", grams: 21.600, costPerGram: 0.00850,  subtotal: 0.18360, kind: "filling_ingredient", ingredientId: callebaut823Id, fillingId: giandujaFillingId },
      { label: "Gianduja — Unsalted Butter 82% fat",            grams:  4.320, costPerGram: 0.00580,  subtotal: 0.02506, kind: "filling_ingredient", ingredientId: butterId,       fillingId: giandujaFillingId },
      { label: "Gianduja — Caster Sugar",                       grams:  6.480, costPerGram: 0.00095,  subtotal: 0.00616, kind: "filling_ingredient", ingredientId: sugarId,        fillingId: giandujaFillingId },
      { label: "Shell (milk)",                                  grams: 55.000, costPerGram: 0.01450,  subtotal: 0.79750, kind: "shell" },
    ]),
    recordedAt: apr01,
    triggerType: "manual",
    triggerDetail: "Initial cost calculation — filled bar",
    mouldId: barMouldId,
    coatingName: "milk",
  } as ProductCostSnapshot);

  // ── Add the Madagascar Bar to the Easter collection ────────────────────────
  // Showcases a bar alongside the moulded products.
  await db.collectionProducts.add({
    collectionId: easterCollId, productId: madagascarBarId, sortOrder: 3,
  } as CollectionProduct);

  // ── Shop counter — ~12 weeks of sold boxes ────────────────────────────────
  //
  // Populates the Shop landing "Recent sales" + the Observatory's "Shop
  // Insights" page. Designed to tell a legible story at a glance:
  //
  //   • Salted Caramel is the hero bonbon (≈45% of cells)
  //   • Milk Ganache is the reliable second (≈35%)
  //   • Hazelnut Praline is the niche third (≈20%)
  //   • Standard Retail carries the bulk; Easter ramps up in the last ~30 days
  //   • Wholesale shows up as occasional bulk drops (every ~10 days)
  //   • Box of 4 outsells Box of 9 in unit count, but Box of 9 wins on revenue
  //
  // Generated day-by-day across a real weekly rhythm (closed Monday, busy
  // Sat/Sun) so the weekly chart has visible peaks. Fully deterministic — no
  // randomness — so two demo loads produce identical histories.

  const box4Cap = 4;
  const box9Cap = 9;

  // Pre-baked cell arrays, named by intent so the story stays readable.
  // Each entry is row-major and has exactly `capacity` product IDs.
  const B4_RETAIL_CLASSIC  = [caramelProductId, caramelProductId, ganacheProductId, pralineProductId];
  const B4_RETAIL_GANACHE  = [ganacheProductId, ganacheProductId, caramelProductId, pralineProductId];
  const B4_RETAIL_PRALINE  = [pralineProductId, pralineProductId, caramelProductId, ganacheProductId];
  const B4_EASTER_CLASSIC  = [caramelProductId, pralineProductId, ganacheProductId, caramelProductId];
  const B4_EASTER_PRALINE  = [pralineProductId, pralineProductId, ganacheProductId, caramelProductId];
  const B4_WHOLESALE       = [caramelProductId, caramelProductId, ganacheProductId, ganacheProductId];
  const B9_RETAIL_EVEN     = [caramelProductId, ganacheProductId, pralineProductId,
                              caramelProductId, ganacheProductId, pralineProductId,
                              caramelProductId, ganacheProductId, pralineProductId];
  const B9_RETAIL_CARAMEL  = [caramelProductId, caramelProductId, ganacheProductId,
                              caramelProductId, caramelProductId, ganacheProductId,
                              pralineProductId, ganacheProductId, pralineProductId];
  const B9_EASTER_SIGNATURE = [pralineProductId, caramelProductId, pralineProductId,
                               caramelProductId, ganacheProductId, caramelProductId,
                               pralineProductId, ganacheProductId, pralineProductId];
  const B9_WHOLESALE       = [caramelProductId, caramelProductId, caramelProductId,
                              caramelProductId, ganacheProductId, ganacheProductId,
                              ganacheProductId, ganacheProductId, ganacheProductId];

  // Deterministic cycle over template lists — avoids Math.random so the demo
  // is reproducible across loads. `idx` mixes day offset + variant to keep
  // consecutive days visually different without being truly random.
  function pick<T>(arr: T[], idx: number): T {
    return arr[((idx % arr.length) + arr.length) % arr.length];
  }

  const retailBox4Variants = [B4_RETAIL_CLASSIC, B4_RETAIL_GANACHE, B4_RETAIL_CLASSIC, B4_RETAIL_PRALINE];
  const retailBox9Variants = [B9_RETAIL_EVEN, B9_RETAIL_CARAMEL, B9_RETAIL_EVEN];
  const easterBox4Variants = [B4_EASTER_CLASSIC, B4_EASTER_PRALINE, B4_EASTER_CLASSIC];
  const easterBox9Variants = [B9_EASTER_SIGNATURE, B9_EASTER_SIGNATURE];

  // Day-of-week pattern — rough shop cadence. dayIndex 0=Monday.
  // Each entry is [retailBox4, retailBox9, easterBox4, easterBox9] — how many
  // boxes get sold that day. Easter values are only applied within the last
  // ~30 days (ramp-up block below).
  const dayPattern: Array<[number, number, number, number]> = [
    [0, 0, 0, 0], // Monday — closed
    [2, 1, 0, 0], // Tuesday
    [3, 1, 0, 0], // Wednesday
    [3, 2, 0, 0], // Thursday
    [5, 3, 0, 0], // Friday
    [7, 4, 0, 0], // Saturday — peak
    [3, 2, 0, 0], // Sunday
  ];

  // Convert Date → 0..6 where 0 = Monday (JS Date: 0 = Sunday).
  function mondayIndex(d: Date): number {
    const js = d.getDay();
    return js === 0 ? 6 : js - 1;
  }

  // Timestamp helper — clamps the sold hour to business hours (10:00–18:00)
  // so the "today, 14:23" format on the Shop landing reads naturally.
  function atHour(day: Date, hour: number, minute: number): Date {
    const d = new Date(day);
    d.setHours(hour, minute, 0, 0);
    return d;
  }

  async function addSoldSale(
    collectionId: string,
    packagingId: string,
    cells: string[],
    price: number,
    capacity: number,
    soldAt: Date,
    preparedAt?: Date,
  ): Promise<void> {
    // Pad with nulls if a caller's template is too short — defensive, the
    // templates above are already sized.
    const padded: (string | null)[] = cells.slice(0, capacity);
    while (padded.length < capacity) padded.push(null);
    await db.sales.add({
      collectionId,
      packagingId,
      cells: padded,
      price,
      status: "sold",
      preparedAt: preparedAt ?? new Date(soldAt.getTime() - 10 * 60_000),
      soldAt,
    } as Sale);
  }

  // Walk every day from 82 days ago up to 2 days ago and emit sold sales.
  const WEEKS_BACK = 12; // ~84 days
  const SHOP_START = daysAgo(WEEKS_BACK * 7 - 2);
  const SHOP_END   = daysAgo(2);
  let salesCursor = new Date(SHOP_START);
  salesCursor.setHours(0, 0, 0, 0);

  let dayCounter = 0;
  let retailB4Counter = 0;
  let retailB9Counter = 0;
  let easterB4Counter = 0;
  let easterB9Counter = 0;

  while (salesCursor <= SHOP_END) {
    const dow = mondayIndex(salesCursor);
    const [r4, r9, _e4Placeholder, _e9Placeholder] = dayPattern[dow];
    void _e4Placeholder;
    void _e9Placeholder;
    const daysFromEnd = Math.round((SHOP_END.getTime() - salesCursor.getTime()) / DAY_MS);

    // Easter ramp — last 30 days ramps from 0 up to peak in the final week.
    // Before that, Easter doesn't exist at the counter.
    const inEasterWindow = daysFromEnd <= 30;
    const easterRamp = inEasterWindow ? Math.max(0, 1 - daysFromEnd / 30) : 0; // 0..1
    const e4Target = inEasterWindow
      ? Math.round((dow >= 3 ? 3 : dow >= 1 ? 1 : 0) * (0.3 + 0.7 * easterRamp))
      : 0;
    const e9Target = inEasterWindow
      ? Math.round((dow >= 4 ? 2 : dow >= 2 ? 1 : 0) * (0.3 + 0.7 * easterRamp))
      : 0;

    // Retail Box 4
    for (let i = 0; i < r4; i++) {
      const soldAt = atHour(salesCursor, 11 + (i % 7), (dayCounter * 7 + i * 13) % 60);
      await addSoldSale(
        standardCollId,
        box4Id,
        pick(retailBox4Variants, retailB4Counter),
        12.50,
        box4Cap,
        soldAt,
      );
      retailB4Counter++;
    }

    // Retail Box 9 — fewer, slightly later in the day
    for (let i = 0; i < r9; i++) {
      const soldAt = atHour(salesCursor, 13 + (i % 5), (dayCounter * 11 + i * 17) % 60);
      await addSoldSale(
        standardCollId,
        box9Id,
        pick(retailBox9Variants, retailB9Counter),
        25.00,
        box9Cap,
        soldAt,
      );
      retailB9Counter++;
    }

    // Easter Box 4
    for (let i = 0; i < e4Target; i++) {
      const soldAt = atHour(salesCursor, 12 + (i % 6), (dayCounter * 5 + i * 19) % 60);
      await addSoldSale(
        easterCollId,
        box4Id,
        pick(easterBox4Variants, easterB4Counter),
        15.95,
        box4Cap,
        soldAt,
      );
      easterB4Counter++;
    }

    // Easter Box 9
    for (let i = 0; i < e9Target; i++) {
      const soldAt = atHour(salesCursor, 14 + (i % 4), (dayCounter * 3 + i * 23) % 60);
      await addSoldSale(
        easterCollId,
        box9Id,
        pick(easterBox9Variants, easterB9Counter),
        34.50,
        box9Cap,
        soldAt,
      );
      easterB9Counter++;
    }

    // Wholesale — every ~10 days, a bulk order of 6 box4s and 3 box9s, all at
    // the same prep time so they group naturally on the Shop landing.
    if (dayCounter > 0 && dayCounter % 10 === 0 && dow !== 0) {
      const wholesalePreparedAt = atHour(salesCursor, 9, 15);
      const wholesaleSoldAt = atHour(salesCursor, 9, 30);
      for (let i = 0; i < 6; i++) {
        await addSoldSale(
          wholesaleCollId,
          box4Id,
          B4_WHOLESALE,
          2.95,
          box4Cap,
          new Date(wholesaleSoldAt.getTime() + i),
          wholesalePreparedAt,
        );
      }
      for (let i = 0; i < 3; i++) {
        await addSoldSale(
          wholesaleCollId,
          box9Id,
          B9_WHOLESALE,
          5.90,
          box9Cap,
          new Date(wholesaleSoldAt.getTime() + 10_000 + i),
          wholesalePreparedAt,
        );
      }
    }

    dayCounter++;
    salesCursor = new Date(salesCursor.getTime() + DAY_MS);
  }

  // A handful of still-prepared (not yet sold) boxes so the Shop landing's
  // "Ready to sell" list isn't empty on a fresh demo load.
  const preppedToday = atHour(daysAgo(0), 9, 30);
  for (let i = 0; i < 3; i++) {
    await db.sales.add({
      collectionId: standardCollId,
      packagingId: box9Id,
      cells: B9_RETAIL_EVEN,
      price: 25.00,
      status: "prepared",
      preparedAt: new Date(preppedToday.getTime() + i * 15 * 60_000),
    } as Sale);
  }
  for (let i = 0; i < 2; i++) {
    await db.sales.add({
      collectionId: easterCollId,
      packagingId: box4Id,
      cells: B4_EASTER_CLASSIC,
      price: 15.95,
      status: "prepared",
      preparedAt: new Date(preppedToday.getTime() + (3 + i) * 15 * 60_000),
    } as Sale);
  }

  return { success: true, message: `Demo data loaded: 10 products (7 moulded + 3 bars — 2 pure bean-to-bar + 1 filled), 13 ingredients (incl. house bean-to-bar Madagascar 72%), 2 lab experiments, 5 production batches (incl. a partially-frozen praline batch), 3 packaging + 3 collections with full pricing history, 4 decoration materials, 3 moulds (incl. a 100g bar mould), 4 filling stock entries (2 available + 2 frozen). Exercises all five filling categories, 100%-shell bars, filled bars, and the freezer workflow on both fillings and finished pieces.` };
}
