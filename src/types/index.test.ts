import { describe, it, expect } from "vitest";
import { costPerGram, allergenLabel, migrateAllergens, getAllergensByRegion, EU_ALLERGENS, UK_ALLERGENS, US_ALLERGENS, AU_ALLERGENS, CA_ALLERGENS, getCurrencySymbol, CURRENCIES, MARKET_LABEL_RULES, normalizeApplyAt, DECORATION_APPLY_AT_OPTIONS } from "./index";
import type { Ingredient } from "./index";

function makeIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
  return {
    name: "Test",
    manufacturer: "",
    source: "",
    cost: 0,
    notes: "",
    cacaoFat: 0,
    sugar: 0,
    milkFat: 0,
    water: 0,
    solids: 0,
    otherFats: 0,
    allergens: [],
    ...overrides,
  };
}

describe("costPerGram", () => {
  it("returns null when no purchase data is set", () => {
    expect(costPerGram(makeIngredient())).toBeNull();
  });

  it("returns null when purchaseCost is missing", () => {
    expect(costPerGram(makeIngredient({ purchaseQty: 1, gramsPerUnit: 1000 }))).toBeNull();
  });

  it("calculates correctly when purchaseQty is missing (defaults to 1)", () => {
    // €10 / (1 × 1000 g) = €0.01/g
    const result = costPerGram(makeIngredient({ purchaseCost: 10, gramsPerUnit: 1000 }));
    expect(result).toBeCloseTo(0.01);
  });

  it("returns null when gramsPerUnit is missing", () => {
    expect(costPerGram(makeIngredient({ purchaseCost: 10, purchaseQty: 1 }))).toBeNull();
  });

  it("returns null when total grams is zero", () => {
    expect(costPerGram(makeIngredient({ purchaseCost: 10, purchaseQty: 0, gramsPerUnit: 1000 }))).toBeNull();
  });

  it("calculates cost per gram correctly for 1 kg bag at €10", () => {
    // €10 / (1 kg × 1000 g/kg) = €0.01/g
    const result = costPerGram(makeIngredient({ purchaseCost: 10, purchaseQty: 1, gramsPerUnit: 1000 }));
    expect(result).toBeCloseTo(0.01);
  });

  it("calculates cost per gram for 2.5 kg at €37.50", () => {
    // €37.50 / (2.5 × 1000) = €0.015/g
    const result = costPerGram(makeIngredient({ purchaseCost: 37.5, purchaseQty: 2.5, gramsPerUnit: 1000 }));
    expect(result).toBeCloseTo(0.015);
  });

  it("calculates cost per gram for pcs with custom gramsPerUnit", () => {
    // 6 pcs at €12, each piece = 250g → €12 / (6 × 250) = €0.008/g
    const result = costPerGram(makeIngredient({ purchaseCost: 12, purchaseQty: 6, gramsPerUnit: 250 }));
    expect(result).toBeCloseTo(0.008);
  });

  it("returns 0 (not null) when pricingIrrelevant is true, even without purchase data", () => {
    expect(costPerGram(makeIngredient({ pricingIrrelevant: true }))).toBe(0);
  });

  it("returns 0 when pricingIrrelevant is true even if purchase data is present", () => {
    expect(costPerGram(makeIngredient({ pricingIrrelevant: true, purchaseCost: 10, gramsPerUnit: 1000 }))).toBe(0);
  });

  it("returns null (not 0) for an ingredient without pricing data and pricingIrrelevant not set", () => {
    expect(costPerGram(makeIngredient({ pricingIrrelevant: false }))).toBeNull();
  });
});

describe("allergenLabel", () => {
  it("resolves EU allergen IDs to their full labels", () => {
    expect(allergenLabel("gluten")).toBe("Cereals containing gluten");
    expect(allergenLabel("milk")).toBe("Milk");
    expect(allergenLabel("crustaceans")).toBe("Crustaceans");
    expect(allergenLabel("sulphites")).toBe("Sulphur dioxide & sulphites");
    expect(allergenLabel("molluscs")).toBe("Molluscs");
    expect(allergenLabel("celery")).toBe("Celery");
    expect(allergenLabel("lupin")).toBe("Lupin");
  });

  it("resolves tree nut subtype IDs", () => {
    expect(allergenLabel("nuts_almonds")).toBe("Almonds");
    expect(allergenLabel("nuts_hazelnuts")).toBe("Hazelnuts");
    expect(allergenLabel("nuts_macadamia")).toBe("Macadamia / Queensland nuts");
    expect(allergenLabel("nuts_pistachios")).toBe("Pistachio nuts");
  });

  it("resolves US-only allergen IDs", () => {
    expect(allergenLabel("shellfish")).toBe("Shellfish");
    expect(allergenLabel("wheat")).toBe("Wheat");
  });

  it("resolves legacy allergen IDs gracefully", () => {
    expect(allergenLabel("lactose")).toBe("Milk (lactose)");
    expect(allergenLabel("nuts")).toBe("Tree nuts");
  });

  it("falls back to the raw ID for unknown values", () => {
    expect(allergenLabel("something_unknown")).toBe("something_unknown");
  });
});

describe("migrateAllergens", () => {
  it("passes through current EU IDs unchanged", () => {
    const input = ["gluten", "milk", "eggs"];
    expect(migrateAllergens(input)).toEqual(["gluten", "milk", "eggs"]);
  });

  it("maps legacy 'lactose' to 'milk'", () => {
    expect(migrateAllergens(["lactose"])).toEqual(["milk"]);
  });

  it("maps legacy 'nuts' to all nine tree nut subtypes (incl. pine for Canada)", () => {
    const result = migrateAllergens(["nuts"]);
    expect(result).toContain("nuts_almonds");
    expect(result).toContain("nuts_hazelnuts");
    expect(result).toContain("nuts_walnuts");
    expect(result).toContain("nuts_cashews");
    expect(result).toContain("nuts_pecans");
    expect(result).toContain("nuts_brazil");
    expect(result).toContain("nuts_pistachios");
    expect(result).toContain("nuts_macadamia");
    expect(result).toContain("nuts_pine");
    expect(result).toHaveLength(9);
  });

  it("deduplicates when legacy and new IDs overlap", () => {
    // lactose → milk, and milk is already present
    const result = migrateAllergens(["lactose", "milk"]);
    expect(result.filter(a => a === "milk")).toHaveLength(1);
  });

  it("handles mixed legacy and current IDs", () => {
    const result = migrateAllergens(["gluten", "lactose", "eggs"]);
    expect(result).toContain("gluten");
    expect(result).toContain("milk");
    expect(result).toContain("eggs");
    expect(result).not.toContain("lactose");
  });

  it("returns empty array for empty input", () => {
    expect(migrateAllergens([])).toEqual([]);
  });
});

describe("getAllergensByRegion", () => {
  it("returns EU_ALLERGENS for region 'EU'", () => {
    expect(getAllergensByRegion("EU")).toBe(EU_ALLERGENS);
  });

  it("returns US_ALLERGENS for region 'US'", () => {
    expect(getAllergensByRegion("US")).toBe(US_ALLERGENS);
  });

  it("EU list contains 14 allergen entries (gluten-containing cereals counts as one)", () => {
    // 13 non-nut entries + shared TREE_NUTS (9 subtypes incl. pine for Canada)
    expect(EU_ALLERGENS.filter(a => !a.group)).toHaveLength(13); // 14 declared allergens minus nuts (expanded)
    expect(EU_ALLERGENS.filter(a => a.group === "nuts")).toHaveLength(9);
  });

  it("EU list includes allergens absent from US list (celery, mustard, lupin, molluscs, sulphites)", () => {
    const euIds = new Set(EU_ALLERGENS.map(a => a.id));
    expect(euIds.has("celery")).toBe(true);
    expect(euIds.has("mustard")).toBe(true);
    expect(euIds.has("lupin")).toBe(true);
    expect(euIds.has("molluscs")).toBe(true);
    expect(euIds.has("sulphites")).toBe(true);
  });

  it("US list uses 'shellfish' (not separate crustaceans/molluscs) and 'wheat' (not gluten)", () => {
    const usIds = new Set(US_ALLERGENS.map(a => a.id));
    expect(usIds.has("shellfish")).toBe(true);
    expect(usIds.has("wheat")).toBe(true);
    expect(usIds.has("crustaceans")).toBe(false);
    expect(usIds.has("molluscs")).toBe(false);
    expect(usIds.has("gluten")).toBe(false);
  });

  it("US list includes sesame (FASTER Act 2023)", () => {
    const sesame = US_ALLERGENS.find(a => a.id === "sesame");
    expect(sesame).toBeDefined();
    expect(sesame?.hint).toContain("FASTER Act");
  });

  it("all four regions share the same 8 tree nut subtypes", () => {
    const euNuts = EU_ALLERGENS.filter(a => a.group === "nuts").map(a => a.id).sort();
    const usNuts = US_ALLERGENS.filter(a => a.group === "nuts").map(a => a.id).sort();
    const ukNuts = UK_ALLERGENS.filter(a => a.group === "nuts").map(a => a.id).sort();
    const auNuts = AU_ALLERGENS.filter(a => a.group === "nuts").map(a => a.id).sort();
    const caNuts = CA_ALLERGENS.filter(a => a.group === "nuts").map(a => a.id).sort();
    expect(euNuts).toEqual(usNuts);
    expect(euNuts).toEqual(ukNuts);
    expect(euNuts).toEqual(auNuts);
    expect(euNuts).toEqual(caNuts);
  });

  // --- UK ---

  it("returns UK_ALLERGENS for region 'UK'", () => {
    expect(getAllergensByRegion("UK")).toBe(UK_ALLERGENS);
  });

  it("UK allergen list is identical to EU (same 14 allergens)", () => {
    expect(UK_ALLERGENS).toBe(EU_ALLERGENS);
  });

  // --- AU ---

  it("returns AU_ALLERGENS for region 'AU'", () => {
    expect(getAllergensByRegion("AU")).toBe(AU_ALLERGENS);
  });

  it("AU list excludes celery, lupin, and mustard (EU-only)", () => {
    const auIds = new Set(AU_ALLERGENS.map(a => a.id));
    expect(auIds.has("celery")).toBe(false);
    expect(auIds.has("lupin")).toBe(false);
    expect(auIds.has("mustard")).toBe(false);
  });

  it("AU list includes gluten, crustaceans, molluscs, and sulphites", () => {
    const auIds = new Set(AU_ALLERGENS.map(a => a.id));
    expect(auIds.has("gluten")).toBe(true);
    expect(auIds.has("crustaceans")).toBe(true);
    expect(auIds.has("molluscs")).toBe(true);
    expect(auIds.has("sulphites")).toBe(true);
  });

  // --- CA ---

  it("returns CA_ALLERGENS for region 'CA'", () => {
    expect(getAllergensByRegion("CA")).toBe(CA_ALLERGENS);
  });

  it("CA list includes wheat and gluten as separate entries (gluten sources declared separately)", () => {
    const caIds = new Set(CA_ALLERGENS.map(a => a.id));
    expect(caIds.has("wheat")).toBe(true);
    expect(caIds.has("gluten")).toBe(true);
  });

  it("CA list includes mustard and sulphites but excludes celery and lupin", () => {
    const caIds = new Set(CA_ALLERGENS.map(a => a.id));
    expect(caIds.has("mustard")).toBe(true);
    expect(caIds.has("sulphites")).toBe(true);
    expect(caIds.has("celery")).toBe(false);
    expect(caIds.has("lupin")).toBe(false);
  });

  it("CA lists crustaceans and molluscs separately (not grouped as shellfish)", () => {
    const caIds = new Set(CA_ALLERGENS.map(a => a.id));
    expect(caIds.has("crustaceans")).toBe(true);
    expect(caIds.has("molluscs")).toBe(true);
    expect(caIds.has("shellfish")).toBe(false);
  });

  // --- Market label rules ---

  it("AU market requires mandatory Contains summary", () => {
    expect(MARKET_LABEL_RULES.AU.requiresContainsSummary).toBe(true);
  });

  it("EU, UK, US, and CA do not require mandatory Contains summary", () => {
    expect(MARKET_LABEL_RULES.EU.requiresContainsSummary).toBe(false);
    expect(MARKET_LABEL_RULES.UK.requiresContainsSummary).toBe(false);
    expect(MARKET_LABEL_RULES.US.requiresContainsSummary).toBe(false);
    expect(MARKET_LABEL_RULES.CA.requiresContainsSummary).toBe(false);
  });

  it("EU, UK, and AU require emphasis in ingredients list; US and CA do not", () => {
    expect(MARKET_LABEL_RULES.EU.requiresEmphasisInIngredients).toBe(true);
    expect(MARKET_LABEL_RULES.UK.requiresEmphasisInIngredients).toBe(true);
    expect(MARKET_LABEL_RULES.AU.requiresEmphasisInIngredients).toBe(true);
    expect(MARKET_LABEL_RULES.US.requiresEmphasisInIngredients).toBe(false);
    expect(MARKET_LABEL_RULES.CA.requiresEmphasisInIngredients).toBe(false);
  });

  it("CA market notes mention bilingual labelling", () => {
    expect(MARKET_LABEL_RULES.CA.notes?.toLowerCase()).toContain("bilingual");
  });

  it("all five markets have a regulation string", () => {
    for (const key of ["EU", "UK", "US", "AU", "CA"] as const) {
      expect(MARKET_LABEL_RULES[key].regulation).toBeTruthy();
      expect(MARKET_LABEL_RULES[key].label).toBeTruthy();
    }
  });
});

// --- getCurrencySymbol ---

describe("getCurrencySymbol", () => {
  it("returns € for EUR", () => {
    expect(getCurrencySymbol("EUR")).toBe("€");
  });

  it("returns $ for USD", () => {
    expect(getCurrencySymbol("USD")).toBe("$");
  });

  it("returns CA$ for CAD", () => {
    expect(getCurrencySymbol("CAD")).toBe("CA$");
  });

  it("returns £ for GBP", () => {
    expect(getCurrencySymbol("GBP")).toBe("£");
  });

  it("returns CHF for CHF", () => {
    expect(getCurrencySymbol("CHF")).toBe("CHF");
  });

  it("returns A$ for AUD", () => {
    expect(getCurrencySymbol("AUD")).toBe("A$");
  });

  it("returns NZ$ for NZD", () => {
    expect(getCurrencySymbol("NZD")).toBe("NZ$");
  });

  it("all supported currencies have entries in CURRENCIES", () => {
    expect(CURRENCIES.length).toBeGreaterThanOrEqual(7);
    for (const c of CURRENCIES) {
      expect(c.code).toBeTruthy();
      expect(c.symbol).toBeTruthy();
      expect(c.label).toBeTruthy();
    }
  });
});

// ── normalizeApplyAt ────────────────────────────────────────────────────────

describe("normalizeApplyAt", () => {
  it("maps legacy 'on_mould' to 'colour'", () => {
    expect(normalizeApplyAt("on_mould")).toBe("colour");
  });

  it("maps legacy 'after_cap' to 'cap'", () => {
    expect(normalizeApplyAt("after_cap")).toBe("cap");
  });

  it("passes through canonical phase values unchanged", () => {
    expect(normalizeApplyAt("colour")).toBe("colour");
    expect(normalizeApplyAt("shell")).toBe("shell");
    expect(normalizeApplyAt("fill")).toBe("fill");
    expect(normalizeApplyAt("cap")).toBe("cap");
    expect(normalizeApplyAt("unmould")).toBe("unmould");
  });

  it("defaults undefined to 'colour'", () => {
    expect(normalizeApplyAt(undefined)).toBe("colour");
  });

  it("defaults unknown strings to 'colour'", () => {
    expect(normalizeApplyAt("nonsense")).toBe("colour");
  });
});

// ── DECORATION_APPLY_AT_OPTIONS ─────────────────────────────────────────────

describe("DECORATION_APPLY_AT_OPTIONS", () => {
  it("contains all production phases except filling", () => {
    const values = DECORATION_APPLY_AT_OPTIONS.map((o) => o.value);
    expect(values).toEqual(["colour", "shell", "fill", "cap", "unmould"]);
    expect(values).not.toContain("filling");
  });

  it("every option has a label", () => {
    for (const o of DECORATION_APPLY_AT_OPTIONS) {
      expect(o.label).toBeTruthy();
    }
  });
});
