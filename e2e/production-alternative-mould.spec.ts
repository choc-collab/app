/**
 * E2E test for the "Alternative mould setup" disclosure in the new-plan wizard.
 *
 * Covers the rare-path feature where a plan product is poured into more than one
 * mould type or uses a partial-cavity count:
 * - Disclosure button is hidden by default and expands on click
 * - Adding an additional mould grows the "= N products" total
 * - The resulting plan shows a per-slot shell step (one per mould) while the
 *   unmould step stays aggregated for yield capture
 * - The plan list row lists every mould used for the product
 */

import { test, expect } from "./fixtures";

async function createIngredient(page: import("@playwright/test").Page, name: string) {
  await page.goto("/ingredients");
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByRole("textbox", { name: "Ingredient name" }).fill(name);
  await page.getByRole("button", { name: "Create Ingredient" }).click();
  await expect(page).toHaveURL(/\/ingredients\/.+/);
}

async function createFillingWithIngredient(
  page: import("@playwright/test").Page,
  fillingName: string,
  ingredientName: string,
) {
  await page.goto("/fillings");
  await page.getByRole("button", { name: "Add filling" }).click();
  await page.getByRole("textbox", { name: "Filling name" }).fill(fillingName);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/fillings\/.+/);

  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByPlaceholder("Search ingredient…").fill(ingredientName);
  await page.getByRole("button", { name: ingredientName }).click();
  await page.locator("form").getByRole("spinbutton").fill("100");
  await page.locator("form").getByRole("button", { name: "Add" }).click();

  await page.getByRole("button", { name: "Save" }).click();
}

async function createProductWithFilling(
  page: import("@playwright/test").Page,
  productName: string,
  fillingName: string,
) {
  await page.goto("/products");
  await page.getByRole("button", { name: "Add new product" }).click();
  await page.getByRole("textbox", { name: "Product name" }).fill(productName);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/products\/.+/);

  await page.getByRole("button", { name: "Assign filling" }).click();
  await page.getByPlaceholder("Search fillings to assign...").fill(fillingName);
  await page.getByRole("button", { name: fillingName }).click();
}

async function createMould(
  page: import("@playwright/test").Page,
  name: string,
  cavityWeightG: string,
  numberOfCavities: string,
) {
  await page.goto("/moulds");
  await page.getByRole("button", { name: "Add mould" }).click();
  await page.getByPlaceholder("Mould name *").fill(name);
  await page.getByRole("button", { name: "Create Mould" }).click();
  await expect(page).toHaveURL(/\/moulds\/.+/);

  await page.getByPlaceholder("e.g. 12.5").fill(cavityWeightG);
  await page.getByPlaceholder("e.g. 24").fill(numberOfCavities);
  await page.getByRole("button", { name: "Save" }).click();
}

test.describe("Production wizard — alternative mould setup", () => {
  test("user can add a second mould and the product total updates", async ({ page }) => {
    test.setTimeout(120000);

    await createIngredient(page, "Dark chocolate");
    await createFillingWithIngredient(page, "Dark ganache", "Dark chocolate");
    await createProductWithFilling(page, "Alt Truffle", "Dark ganache");
    await createMould(page, "Alt Rect 15", "10", "15");
    await createMould(page, "Alt Heart 24", "8", "24");

    await page.goto("/production/new");
    await page.getByText("Alt Truffle").click();
    await page.getByRole("button", { name: /Continue.*selected/ }).click();

    // Primary mould — pick "Alt Rect 15" by resolving its option value first,
    // matching the pattern used in the other production e2e tests.
    const rectVal = await page.locator("select.input option", { hasText: "Alt Rect 15" }).first().getAttribute("value");
    await page.locator("select.input").first().selectOption(rectVal!);

    // Default single-mould total: 1 × 15 = 15 products
    await expect(page.getByText("= 15 products")).toBeVisible();

    // Disclosure should be hidden by default — button visible, fields not
    await expect(page.getByRole("button", { name: "Alternative mould setup" })).toBeVisible();
    await expect(page.getByText("Fill only part of this mould")).not.toBeVisible();

    // Open the disclosure
    await page.getByRole("button", { name: "Alternative mould setup" }).click();
    await expect(page.getByText("Fill only part of this mould")).toBeVisible();

    // Add an additional mould
    await page.getByRole("button", { name: "Add mould", exact: true }).click();
    // The new mould select starts with the first unused mould (Alt Heart 24).
    // Total should now be 15 + 24 = 39 products.
    await expect(page.getByText("= 39 products")).toBeVisible();

    // Create the plan
    await page.getByRole("button", { name: "Create plan" }).click();
    await expect(page).toHaveURL(/\/production\/.+/, { timeout: 30000 });

    // Shell tab — per-slot steps should appear, each labelled with its mould name
    await page.getByRole("button", { name: /^Shell \d/ }).click();
    await expect(page.getByText(/Shell: Alt Truffle \(Alt Rect 15\)/)).toBeVisible();
    await expect(page.getByText(/Shell: Alt Truffle \(Alt Heart 24\)/)).toBeVisible();

    // Unmould tab — single row for the product, detail lists both moulds + 39 products
    await page.getByRole("button", { name: /^Unmould \d/ }).click();
    await expect(page.getByText("Unmould: Alt Truffle")).toBeVisible();
    await expect(page.getByText(/1× Alt Rect 15 \+ 1× Alt Heart 24 · 39 products/)).toBeVisible();

    // Plan list row — back to the production list, should show both moulds
    await page.goto("/production");
    await expect(page.getByText(/1× Alt Rect 15 \+ 1× Alt Heart 24/)).toBeVisible();
  });
});
