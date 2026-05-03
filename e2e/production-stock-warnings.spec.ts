/**
 * E2E tests for stock-awareness in the new production batch wizard.
 *
 * Covers:
 * - Ingredient low-stock warning appears on product card in the select phase
 * - Ingredient out-of-stock warning appears on product card in the select phase
 * - Warning row expands to reveal the culprit ingredient name and status label
 * - Ingredient in "ordered" state shows the correct status label
 * - Products with stock issues sort above products with no issues
 */

import { test, expect } from "./fixtures";

/**
 * Creates an ingredient and returns the URL (which contains the id).
 * Leaves the browser on the ingredient detail page.
 */
async function createIngredient(page: import("@playwright/test").Page, name: string) {
  await page.goto("/ingredients");
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByRole("textbox", { name: "Ingredient name" }).fill(name);
  await page.getByRole("button", { name: "Create Ingredient" }).click();
  await expect(page).toHaveURL(/\/ingredients\/.+/);
  // Strip ?new=1 so revisiting lands in view mode (not edit mode)
  return page.url().split("?")[0];
}

/**
 * Creates a filling and returns its URL.
 * Leaves the browser on the filling detail page (edit mode exited).
 */
async function createFilling(page: import("@playwright/test").Page, name: string) {
  await page.goto("/fillings");
  await page.getByRole("button", { name: "Add filling" }).click();
  await page.getByRole("textbox", { name: "Filling name" }).fill(name);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/fillings\/.+/);
  // Stay in edit mode — addIngredientToFilling needs it
  return page.url();
}

/**
 * Adds an ingredient (by name) to the currently-open filling detail page.
 * Assumes the page is already in edit mode.
 */
async function addIngredientToFilling(page: import("@playwright/test").Page, ingredientName: string) {
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByPlaceholder("Search ingredient…").fill(ingredientName);
  await page.getByRole("button", { name: ingredientName }).click();
  await page.locator("form").getByRole("spinbutton").fill("100");
  // Click the "Add" submit button inside the ingredient form
  await page.locator("form").getByRole("button", { name: "Add" }).click();
  // After save, the AddFillingIngredient form closes — wait until the
  // "Search ingredient…" placeholder is gone so the saveFillingIngredient
  // Dexie write has actually committed before the next step runs.
  await expect(page.getByPlaceholder("Search ingredient…")).toHaveCount(0);
}

/**
 * Creates a product and assigns a filling to it.
 * Leaves the browser on the product detail page.
 */
async function createProductWithFilling(page: import("@playwright/test").Page, productName: string, fillingName: string) {
  await page.goto("/products");
  await page.getByRole("button", { name: "Add new product" }).click();
  await page.getByRole("textbox", { name: "Product name" }).fill(productName);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/products\/.+/);

  // Assign the filling
  await page.getByRole("button", { name: "Assign filling" }).click();
  await page.getByPlaceholder("Search fillings to assign...").fill(fillingName);
  await page.getByRole("button", { name: fillingName }).click();
}

test.describe("Production wizard — stock warnings", () => {
  test("shows no ingredient warnings for a clean product", async ({ page }) => {
    test.setTimeout(60000);
    await createIngredient(page, "Pure Cream");
    await createFilling(page, "Fresh Ganache");
    await addIngredientToFilling(page, "Pure Cream");
    await createProductWithFilling(page, "Simple Truffle", "Fresh Ganache");

    await page.goto("/production/new?mode=full");
    await expect(page.getByText("Simple Truffle")).toBeVisible();
    // No warning strip should be present on this card
    await expect(page.getByText(/ingredient stock alert/i)).not.toBeVisible();
    await expect(page.getByText(/out of stock/i)).not.toBeVisible();
  });

  test("shows low-stock warning on product card when an ingredient is flagged low", async ({ page }) => {
    test.setTimeout(60000);
    const ingUrl = await createIngredient(page, "Hazelnut Paste");
    await createFilling(page, "Praline Filling");
    await addIngredientToFilling(page, "Hazelnut Paste");
    await createProductWithFilling(page, "Hazelnut Product", "Praline Filling");

    // Flag the ingredient as low stock
    await page.goto(ingUrl);
    await page.getByRole("button", { name: "Flag as low stock" }).click();
    await page.getByText("Yes, add to list").click();
    await expect(page.getByText(/Low stock/i)).toBeVisible();

    // Navigate to production wizard select phase
    await page.goto("/production/new?mode=full");
    await expect(page.getByText("Hazelnut Product")).toBeVisible();

    // Warning strip should appear
    await expect(page.getByText(/ingredient stock alert/i)).toBeVisible();
  });

  test("shows out-of-stock warning on product card when an ingredient is marked out of stock", async ({ page }) => {
    test.setTimeout(60000);
    const ingUrl = await createIngredient(page, "Dark Couverture");
    await createFilling(page, "Dark Shell Mix");
    await addIngredientToFilling(page, "Dark Couverture");
    await createProductWithFilling(page, "Dark Shell Product", "Dark Shell Mix");

    // Mark ingredient as out of stock
    await page.goto(ingUrl);
    await page.getByRole("button", { name: "Mark out of stock" }).click();
    // Confirm the two-step action
    await page.getByText("Yes, add to list").click();
    await expect(page.getByText(/Out of stock — on shopping list/i)).toBeVisible();

    // Navigate to production wizard
    await page.goto("/production/new?mode=full");
    await expect(page.getByText("Dark Shell Product")).toBeVisible();

    // Out-of-stock warning strip should appear
    await expect(page.getByText(/out of stock/i)).toBeVisible();
  });

  test("expanding the warning row reveals the culprit ingredient name", async ({ page }) => {
    test.setTimeout(60000);
    const ingUrl = await createIngredient(page, "Milk Powder");
    await createFilling(page, "Milk Ganache Filling");
    await addIngredientToFilling(page, "Milk Powder");
    await createProductWithFilling(page, "Milk Ganache Product", "Milk Ganache Filling");

    // Flag the ingredient
    await page.goto(ingUrl);
    await page.getByRole("button", { name: "Flag as low stock" }).click();
    await page.getByText("Yes, add to list").click();

    // Go to wizard and expand the warning
    await page.goto("/production/new?mode=full");
    await expect(page.getByText("Milk Ganache Product")).toBeVisible();

    const warningToggle = page.getByRole("button", { name: /ingredient stock alert/i });
    await warningToggle.click();

    // Ingredient name and status should now be visible
    await expect(page.getByText("Milk Powder")).toBeVisible();
    await expect(page.getByText("Running low")).toBeVisible();
  });

  test("expanding the warning shows 'Out of stock' label for out-of-stock ingredient", async ({ page }) => {
    test.setTimeout(60000);
    const ingUrl = await createIngredient(page, "Cocoa Butter Bloc");
    await createFilling(page, "White Shell Base");
    await addIngredientToFilling(page, "Cocoa Butter Bloc");
    await createProductWithFilling(page, "White Shell Product", "White Shell Base");

    await page.goto(ingUrl);
    await page.getByRole("button", { name: "Mark out of stock" }).click();
    await page.getByText("Yes, add to list").click();

    await page.goto("/production/new?mode=full");
    await expect(page.getByText("White Shell Product")).toBeVisible();

    const warningToggle = page.getByRole("button", { name: /ingredient.*out of stock/i });
    await warningToggle.click();

    await expect(page.getByText("Cocoa Butter Bloc")).toBeVisible();
    await expect(page.getByText("Out of stock", { exact: true })).toBeVisible();
  });

  test("ordered ingredient shows 'Ordered' label in expanded warning", async ({ page }) => {
    test.setTimeout(60000);
    const ingUrl = await createIngredient(page, "Tahitian Vanilla");
    await createFilling(page, "Vanilla Caramel Filling");
    await addIngredientToFilling(page, "Tahitian Vanilla");
    await createProductWithFilling(page, "Vanilla Caramel Product", "Vanilla Caramel Filling");

    // Flag low stock then mark as ordered
    await page.goto(ingUrl);
    await page.getByRole("button", { name: "Flag as low stock" }).click();
    await page.getByText("Yes, add to list").click();
    await expect(page.getByText(/Low stock/i)).toBeVisible();
    await page.getByRole("button", { name: "Mark ordered" }).click();
    await expect(page.getByText(/Ordered/i)).toBeVisible();

    // Wizard — expand warning and check label
    await page.goto("/production/new?mode=full");
    await expect(page.getByText("Vanilla Caramel Product")).toBeVisible();

    const warningToggle = page.getByRole("button", { name: /ingredient stock alert/i });
    await warningToggle.click();

    await expect(page.getByText("Tahitian Vanilla")).toBeVisible();
    await expect(page.getByText("Ordered")).toBeVisible();
  });

  test("product with ingredient issue sorts above a clean product", async ({ page }) => {
    test.setTimeout(60000);
    // Create a clean product (no issues)
    await createIngredient(page, "Plain Glucose");
    await createFilling(page, "Neutral Filling");
    await addIngredientToFilling(page, "Plain Glucose");
    await createProductWithFilling(page, "AAA Clean Product", "Neutral Filling");

    // Create a product with a flagged ingredient
    const ingUrl = await createIngredient(page, "Rare Spice");
    await createFilling(page, "Spiced Filling");
    await addIngredientToFilling(page, "Rare Spice");
    await createProductWithFilling(page, "ZZZ Spiced Product", "Spiced Filling");

    // Flag the ingredient
    await page.goto(ingUrl);
    await page.getByRole("button", { name: "Flag as low stock" }).click();
    await page.getByText("Yes, add to list").click();

    // In the wizard, the flagged product ("ZZZ Spiced Product") should appear before
    // the clean product ("AAA Clean Product") despite sorting lower alphabetically
    await page.goto("/production/new?mode=full");
    const items = page.getByRole("listitem");
    await expect(items.first()).toContainText("ZZZ Spiced Product");
  });
});
