import { describe, it, expect } from "vitest";
import { mapIngredientRow, validateIngredientRow, INGREDIENT_TEMPLATE_COLUMNS } from "./csv-import-ingredients";

// ---------------------------------------------------------------------------
// mapIngredientRow
// ---------------------------------------------------------------------------

describe("mapIngredientRow", () => {
  it("maps a minimal row with just a name", () => {
    const row: Record<string, string> = { name: "Test Chocolate" };
    const result = mapIngredientRow(row);

    expect(result.name).toBe("Test Chocolate");
    expect(result.manufacturer).toBe("");
    expect(result.cost).toBe(0);
    expect(result.cacaoFat).toBe(0);
    expect(result.allergens).toEqual([]);
    expect(result.nutrition).toBeUndefined();
  });

  it("maps purchase fields", () => {
    const row: Record<string, string> = {
      name: "Butter",
      purchaseCost: "12.50",
      purchaseQty: "2",
      purchaseUnit: "kg",
      gramsPerUnit: "1000",
    };
    const result = mapIngredientRow(row);

    expect(result.purchaseCost).toBe(12.5);
    expect(result.purchaseQty).toBe(2);
    expect(result.purchaseUnit).toBe("kg");
    expect(result.gramsPerUnit).toBe(1000);
  });

  it("maps composition fields", () => {
    const row: Record<string, string> = {
      name: "Dark Couverture",
      cacaoFat: "38",
      sugar: "28",
      milkFat: "0",
      water: "1",
      solids: "15",
      otherFats: "18",
      alcohol: "0",
    };
    const result = mapIngredientRow(row);

    expect(result.cacaoFat).toBe(38);
    expect(result.sugar).toBe(28);
    expect(result.solids).toBe(15);
    expect(result.otherFats).toBe(18);
  });

  it("maps allergen boolean columns", () => {
    const row: Record<string, string> = {
      name: "Milk Chocolate",
      allergen_milk: "true",
      allergen_soybeans: "1",
      allergen_nuts_hazelnuts: "yes",
      allergen_gluten: "",
      allergen_eggs: "false",
    };
    const result = mapIngredientRow(row);

    expect(result.allergens).toEqual(["milk", "soybeans", "nuts_hazelnuts"]);
  });

  it("maps nutrition columns", () => {
    const row: Record<string, string> = {
      name: "Sugar",
      nut_energyKcal: "400",
      nut_carbohydrate: "100",
      nut_sugars: "100",
    };
    const result = mapIngredientRow(row);

    expect(result.nutrition).toEqual({
      energyKcal: 400,
      carbohydrate: 100,
      sugars: 100,
    });
  });

  it("returns undefined nutrition when no nut_ columns are set", () => {
    const row: Record<string, string> = { name: "Water" };
    const result = mapIngredientRow(row);
    expect(result.nutrition).toBeUndefined();
  });

  it("maps boolean flags", () => {
    const row: Record<string, string> = {
      name: "Water",
      pricingIrrelevant: "true",
      shellCapable: "false",
    };
    const result = mapIngredientRow(row);
    expect(result.pricingIrrelevant).toBe(true);
    expect(result.shellCapable).toBe(false);
  });

  it("maps optional string fields", () => {
    const row: Record<string, string> = {
      name: "Guanaja",
      commercialName: "Guanaja 70%",
      brand: "Valrhona",
      vendor: "Keylink",
      purchaseDate: "2025-03-01",
    };
    const result = mapIngredientRow(row);
    expect(result.commercialName).toBe("Guanaja 70%");
    expect(result.brand).toBe("Valrhona");
    expect(result.vendor).toBe("Keylink");
    expect(result.purchaseDate).toBe("2025-03-01");
  });
});

// ---------------------------------------------------------------------------
// validateIngredientRow
// ---------------------------------------------------------------------------

describe("validateIngredientRow", () => {
  it("returns error when name is empty", () => {
    const data = mapIngredientRow({ name: "" });
    const issues = validateIngredientRow(data);
    expect(issues).toHaveLength(1);
    expect(issues[0]).toEqual({ field: "name", message: "Name is required", severity: "error" });
  });

  it("returns no issues for valid minimal row", () => {
    const data = mapIngredientRow({ name: "Sugar" });
    const issues = validateIngredientRow(data);
    expect(issues).toEqual([]);
  });

  it("warns when composition doesn't sum to 100", () => {
    const data = mapIngredientRow({
      name: "Test",
      cacaoFat: "50",
      sugar: "30",
      milkFat: "0",
      water: "0",
      solids: "0",
      otherFats: "0",
    });
    const issues = validateIngredientRow(data);
    const compIssue = issues.find((i) => i.field === "composition");
    expect(compIssue).toBeDefined();
    expect(compIssue!.severity).toBe("warning");
    expect(compIssue!.message).toContain("80.0%");
  });

  it("accepts composition summing to 100", () => {
    const data = mapIngredientRow({
      name: "Test",
      cacaoFat: "40",
      sugar: "30",
      milkFat: "0",
      water: "10",
      solids: "10",
      otherFats: "10",
    });
    const issues = validateIngredientRow(data);
    expect(issues.find((i) => i.field === "composition")).toBeUndefined();
  });

  it("does not warn when all composition is zero (unfilled)", () => {
    const data = mapIngredientRow({ name: "Test" });
    const issues = validateIngredientRow(data);
    expect(issues.find((i) => i.field === "composition")).toBeUndefined();
  });

  it("warns for unknown category", () => {
    const data = mapIngredientRow({ name: "Test", category: "Made Up Category" });
    const issues = validateIngredientRow(data);
    const catIssue = issues.find((i) => i.field === "category");
    expect(catIssue).toBeDefined();
    expect(catIssue!.severity).toBe("warning");
  });

  it("no warning for valid category", () => {
    const data = mapIngredientRow({ name: "Test", category: "Chocolate" });
    const issues = validateIngredientRow(data);
    expect(issues.find((i) => i.field === "category")).toBeUndefined();
  });

  it("no warning for user-created category when passed in knownCategories", () => {
    // Regression: before fix, the validator only knew about the static seed list,
    // so user-defined categories like "Emulsifiers" were flagged as "Unknown".
    const data = mapIngredientRow({ name: "Lecithin", category: "Emulsifiers" });
    const known = new Set<string>(["Chocolate", "Fats", "Emulsifiers"]);
    const issues = validateIngredientRow(data, known);
    expect(issues.find((i) => i.field === "category")).toBeUndefined();
  });

  it("still warns for a category not in knownCategories", () => {
    const data = mapIngredientRow({ name: "Test", category: "Made Up" });
    const known = new Set<string>(["Chocolate"]);
    const issues = validateIngredientRow(data, known);
    expect(issues.find((i) => i.field === "category")?.severity).toBe("warning");
  });

  it("warns when purchaseCost set but gramsPerUnit missing", () => {
    const data = mapIngredientRow({ name: "Test", purchaseCost: "10" });
    const issues = validateIngredientRow(data);
    const issue = issues.find((i) => i.field === "gramsPerUnit");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warning");
  });

  it("warns when gramsPerUnit set but purchaseCost missing", () => {
    const data = mapIngredientRow({ name: "Test", gramsPerUnit: "1000" });
    const issues = validateIngredientRow(data);
    const issue = issues.find((i) => i.field === "purchaseCost");
    expect(issue).toBeDefined();
    expect(issue!.severity).toBe("warning");
  });
});

// ---------------------------------------------------------------------------
// Template columns
// ---------------------------------------------------------------------------

describe("INGREDIENT_TEMPLATE_COLUMNS", () => {
  it("includes all allergen columns", () => {
    const allergenCols = INGREDIENT_TEMPLATE_COLUMNS.filter((c) => c.startsWith("allergen_"));
    expect(allergenCols).toHaveLength(23);
  });

  it("includes all nutrition columns", () => {
    const nutCols = INGREDIENT_TEMPLATE_COLUMNS.filter((c) => c.startsWith("nut_"));
    expect(nutCols).toHaveLength(17);
  });

  it("starts with core fields", () => {
    expect(INGREDIENT_TEMPLATE_COLUMNS[0]).toBe("name");
    expect(INGREDIENT_TEMPLATE_COLUMNS).toContain("manufacturer");
    expect(INGREDIENT_TEMPLATE_COLUMNS).toContain("category");
  });
});
