import { test, expect } from "./fixtures";

test.describe("Ingredients", () => {
  test("shows empty state on fresh database", async ({ page }) => {
    await page.goto("/ingredients");
    await expect(page.getByRole("heading", { name: "Ingredients" })).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(0);
  });

  test("creates a new ingredient and lands on detail page", async ({ page }) => {
    await page.goto("/ingredients");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("textbox", { name: "Ingredient name" }).fill("Heavy Cream");
    await page.getByRole("button", { name: "Create Ingredient" }).click();
    await expect(page).toHaveURL(/\/ingredients\/.+/);
  });

  test("ingredient appears in list after creation", async ({ page }) => {
    await page.goto("/ingredients");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("textbox", { name: "Ingredient name" }).fill("Butter");
    await page.getByRole("button", { name: "Create Ingredient" }).click();
    await expect(page).toHaveURL(/\/ingredients\/.+/);

    await page.goto("/ingredients");
    await page.getByRole("textbox", { name: "Search ingredients" }).fill("Butter");
    await expect(page.getByText("Butter")).toBeVisible();
  });

  test("list renders as a table with column headers", async ({ page }) => {
    await page.goto("/ingredients");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("textbox", { name: "Ingredient name" }).fill("Cocoa Butter");
    await page.getByRole("button", { name: "Create Ingredient" }).click();
    await expect(page).toHaveURL(/\/ingredients\/.+/);

    await page.goto("/ingredients");
    const table = page.getByRole("table", { name: "Ingredients" });
    await expect(table).toBeVisible();
    for (const header of ["Ingredient", "Stock", "Manufacturer", "Composition", "Fillings", "Cost/g", "Updated"]) {
      await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
    }
    await expect(page.getByText("Cocoa Butter")).toBeVisible();
    await expect(page.getByText("no composition")).toBeVisible();
    await expect(page.getByText("no pricing")).toBeVisible();

    await page.getByText("Cocoa Butter").click();
    await expect(page).toHaveURL(/\/ingredients\/.+/);
  });

  test("Fillings column counts the fillings using an ingredient, and Unused filters to the rest", async ({ page }) => {
    test.setTimeout(90000);

    // Two ingredients: one that ends up in a filling, one that never does.
    for (const name of ["Used Cream", "Orphan Powder"]) {
      await page.goto("/ingredients");
      await page.getByRole("button", { name: "Add ingredient" }).click();
      await page.getByRole("textbox", { name: "Ingredient name" }).fill(name);
      await page.getByRole("button", { name: "Create Ingredient" }).click();
      await expect(page).toHaveURL(/\/ingredients\/.+/);
    }

    await page.goto("/fillings");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Counting Ganache");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fillings\/.+/);
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByPlaceholder("Search ingredient…").fill("Used Cream");
    await page.getByRole("button", { name: "Used Cream" }).click();
    await page.locator("form").getByRole("spinbutton").fill("100");
    await page.locator("form").getByRole("button", { name: "Add" }).click();

    await page.goto("/ingredients");
    const table = page.getByRole("table", { name: "Ingredients" });
    const usedRow = table.getByRole("row").filter({ hasText: "Used Cream" });
    const orphanRow = table.getByRole("row").filter({ hasText: "Orphan Powder" });
    await expect(usedRow).toContainText("1");
    await expect(orphanRow).toContainText("unused");

    // The Unused filter isolates exactly the ingredients safe to clear out.
    await page.getByRole("button", { name: /Filters/i }).click();
    await page.getByRole("button", { name: "Unused", exact: true }).click();
    await expect(table.getByRole("row").filter({ hasText: "Orphan Powder" })).toBeVisible();
    await expect(table.getByRole("row").filter({ hasText: "Used Cream" })).toHaveCount(0);
  });

  test("detail page autosaves purchase pricing with no Save button", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/ingredients");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("textbox", { name: "Ingredient name" }).fill("Dark Chocolate");
    await page.getByRole("button", { name: "Create Ingredient" }).click();
    await expect(page).toHaveURL(/\/ingredients\/.+/);

    await expect(page.getByRole("button", { name: "Update" })).toHaveCount(0);

    await page.getByRole("button", { name: "Pricing" }).click();
    await page.getByPlaceholder("0.00").fill("12.50");
    // Pricing commits as a group when focus leaves the card.
    await page.getByRole("heading", { name: "Purchase pricing" }).click();

    await page.reload();
    await page.getByRole("button", { name: "Pricing" }).click();
    await expect(page.getByPlaceholder("0.00")).toHaveValue("12.5");
  });

  test("autosaves details, composition and allergens with no Save button", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/ingredients");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("textbox", { name: "Ingredient name" }).fill("Hazelnut Praline");
    await page.getByRole("button", { name: "Create Ingredient" }).click();
    await expect(page).toHaveURL(/\/ingredients\/.+/);

    // Properties autosave on blur.
    await page.getByLabel("Manufacturer").fill("Valrhona");
    await page.getByLabel("Manufacturer").blur();
    await page.getByLabel("Vendor").fill("Keylink");
    await page.getByLabel("Vendor").blur();
    await page.getByLabel("Notes", { exact: true }).fill("Roast before grinding");
    await page.getByLabel("Notes", { exact: true }).blur();

    // Composition is advisory — a partial total still saves.
    await page.getByRole("button", { name: "Composition" }).click();
    await page.getByLabel("Sugar").fill("35");
    await page.getByLabel("Sugar").blur();
    await expect(page.getByText("35.0% accounted for")).toBeVisible();

    // "Doesn't meaningfully affect shelf life" flag autosaves too.
    const awCheckbox = page.getByRole("checkbox", { name: /Doesn.t meaningfully affect shelf life/i });
    await awCheckbox.click();
    await expect(awCheckbox).toBeChecked();

    // Allergens write the whole array on each toggle.
    await page.getByRole("button", { name: "Allergens" }).click();
    // .click() rather than .check(): the box is driven by the Dexie live query,
    // so it repaints a tick after the write rather than synchronously.
    await page.getByRole("checkbox", { name: /Hazelnut/i }).first().click();
    await expect(page.getByRole("checkbox", { name: /Hazelnut/i }).first()).toBeChecked();

    await page.reload();
    await expect(page.getByLabel("Manufacturer")).toHaveValue("Valrhona");
    await expect(page.getByLabel("Vendor")).toHaveValue("Keylink");
    await expect(page.getByLabel("Notes", { exact: true })).toHaveValue("Roast before grinding");
    await page.getByRole("button", { name: "Composition" }).click();
    await expect(page.getByLabel("Sugar")).toHaveValue("35");
    await expect(page.getByRole("checkbox", { name: /Doesn.t meaningfully affect shelf life/i })).toBeChecked();
    await page.getByRole("button", { name: "Allergens" }).click();
    await expect(page.getByRole("checkbox", { name: /Hazelnut/i }).first()).toBeChecked();
  });

  test("Shell tab appears as soon as the category is set to Chocolate", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/ingredients");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("textbox", { name: "Ingredient name" }).fill("Live Shell Test");
    await page.getByRole("button", { name: "Create Ingredient" }).click();
    await expect(page).toHaveURL(/\/ingredients\/.+/);

    // No category yet, so the Shell tab must not be present.
    await expect(page.getByRole("button", { name: /^Shell$/ })).toHaveCount(0);

    // The category select autosaves on change — the tab follows the record.
    await page.getByLabel("Category").selectOption("Chocolate");
    await expect(page.getByRole("button", { name: /^Shell$/ })).toBeVisible();

    await page.getByRole("button", { name: /^Shell$/ }).click();
    await expect(page.getByText("Can be used as shell chocolate")).toBeVisible();

    // Category now lives in Properties, on the Details tab.
    await page.getByRole("button", { name: /^Details$/ }).click();

    // Clearing the category hides the tab again and falls back to Details.
    await page.getByLabel("Category").selectOption("");
    await expect(page.getByRole("button", { name: /^Shell$/ })).toHaveCount(0);
  });

  test("cost per gram updates live and banks exactly one price-history entry", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/ingredients");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("textbox", { name: "Ingredient name" }).fill("Callebaut 823");
    await page.getByRole("button", { name: "Create Ingredient" }).click();
    await expect(page).toHaveURL(/\/ingredients\/.+/);

    await page.getByRole("button", { name: "Pricing" }).click();

    // 2500 g bag at €65. Unit=g, so `g per unit` is locked to 1.
    await page.getByPlaceholder("1", { exact: true }).fill("2500");
    await expect(page.locator('input[readonly][value="1"]')).toHaveCount(1);
    await page.getByPlaceholder("0.00").fill("65");

    // Live preview in the card header — 65 / (2500 × 1) = 0.026.
    await expect(page.getByText(/0\.026\/g/).first()).toBeVisible();

    // Leaving the card commits the whole pricing group in one write. Editing
    // qty and price separately must NOT bank an intermediate price that never
    // existed, so exactly one history entry is expected.
    await page.getByRole("heading", { name: "Purchase pricing" }).click();

    await expect(page.getByRole("heading", { name: "Price history" })).toBeVisible();
    await expect(page.getByText(/0\.026\/g/)).toHaveCount(2); // header read-out + the single entry
  });

  test("g per unit is locked to 1 for g and 1000 for kg", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/ingredients");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("textbox", { name: "Ingredient name" }).fill("Unit Lock Test");
    await page.getByRole("button", { name: "Create Ingredient" }).click();
    await page.getByRole("button", { name: "Pricing" }).click();

    // Default unit is g — g per unit should be 1 and read-only.
    await expect(page.locator('input[readonly][value="1"]')).toHaveCount(1);

    // Switch to kg — g per unit should become 1000 and still read-only.
    const unitSelect = page.locator("select").filter({ has: page.locator("option[value='kg']") }).first();
    await unitSelect.selectOption("kg");
    await expect(page.locator('input[readonly][value="1000"]')).toHaveCount(1);

    // Switch to ml — g per unit becomes editable (no readonly attr).
    await unitSelect.selectOption("ml");
    await expect(page.locator('input[readonly]')).toHaveCount(0);
  });

  test("shows a distinct not-found state for a missing ingredient", async ({ page }) => {
    await page.goto("/ingredients/does-not-exist");
    await expect(page.getByText(/This ingredient doesn.t exist\./)).toBeVisible();
    await expect(page.getByText("Loading…")).toHaveCount(0);
  });

  test("search filters ingredients by name", async ({ page }) => {
    for (const name of ["Glucose Syrup", "Hazelnut Paste"]) {
      await page.goto("/ingredients");
      await page.getByRole("button", { name: "Add ingredient" }).click();
      await page.getByRole("textbox", { name: "Ingredient name" }).fill(name);
      await page.getByRole("button", { name: "Create Ingredient" }).click();
      await expect(page).toHaveURL(/\/ingredients\/.+/);
    }

    await page.goto("/ingredients");
    await page.getByRole("textbox", { name: "Search ingredients" }).fill("Glucose");
    // Scope to h3 list-item headings to avoid matching any other element that may contain these names
    await expect(page.getByRole("heading", { name: "Glucose Syrup" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Hazelnut Paste" })).not.toBeVisible();
  });

  test("shell capability, coating type and tempering autosave", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/ingredients");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("textbox", { name: "Ingredient name" }).fill("Couverture 70");
    await page.getByRole("button", { name: "Create Ingredient" }).click();
    await expect(page).toHaveURL(/\/ingredients\/.+/);

    await page.getByLabel("Category").selectOption("Chocolate");
    await page.getByRole("button", { name: /^Shell$/ }).click();

    await page.getByRole("checkbox", { name: /Can be used as shell chocolate/ }).click();
    await expect(page.getByRole("checkbox", { name: /Can be used as shell chocolate/ })).toBeChecked();

    // The coating name is not a field on the ingredient — it registers a
    // CoatingChocolateMapping, so it has to survive a reload to count.
    await page.getByLabel("Coating type").fill("dark");
    await page.getByLabel("Coating type").blur();
    await expect(page.getByRole("checkbox", { name: /Hand tempering/ })).toBeEnabled();
    await page.getByRole("checkbox", { name: /Hand tempering/ }).click();
    await expect(page.getByRole("checkbox", { name: /Hand tempering/ })).toBeChecked();

    await page.reload();
    await page.getByRole("button", { name: /^Shell$/ }).click();
    await expect(page.getByRole("checkbox", { name: /Can be used as shell chocolate/ })).toBeChecked();
    await expect(page.getByLabel("Coating type")).toHaveValue("dark");
    await expect(page.getByRole("checkbox", { name: /Hand tempering/ })).toBeChecked();
  });
  test("clearing brand and vendor persists as cleared", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/ingredients");
    await page.getByRole("button", { name: /Add ingredient/i }).click();
    await page.getByPlaceholder(/Ingredient name/).fill("Clear Ingredient");
    await page.getByRole("button", { name: "Create Ingredient" }).click();
    await expect(page).toHaveURL(/\/ingredients\/.+/);

    await page.getByLabel("Brand").fill("Guanaja");
    await page.getByLabel("Brand").blur();
    await page.getByLabel("Vendor").fill("Keylink");
    await page.getByLabel("Vendor").blur();
    await page.reload();
    await expect(page.getByLabel("Brand")).toHaveValue("Guanaja");
    await expect(page.getByLabel("Vendor")).toHaveValue("Keylink");

    await page.getByLabel("Brand").fill("");
    await page.getByLabel("Brand").blur();
    await page.getByLabel("Vendor").fill("");
    await page.getByLabel("Vendor").blur();
    await page.reload();
    await expect(page.getByLabel("Brand")).toHaveValue("");
    await expect(page.getByLabel("Vendor")).toHaveValue("");
  });
});

test.describe("Ingredients — Categories", () => {
  test("Categories tab list renders as a table and supports create", async ({ page }) => {
    await page.goto("/ingredients");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    await page.getByRole("button", { name: /Add ingredient category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Emulsifiers");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/ingredients\/categories\/.+/);

    await page.goto("/ingredients");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    const table = page.getByRole("table", { name: "Ingredient categories" });
    await expect(table).toBeVisible();
    for (const header of ["Category", "Ingredients", "Updated"]) {
      await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
    }
    await expect(page.getByText("Emulsifiers")).toBeVisible();

    await page.getByText("Emulsifiers").click();
    await expect(page).toHaveURL(/\/ingredients\/categories\/.+/);
  });
});
