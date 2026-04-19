/**
 * E2E tests for the leftover filling flow in production plans.
 *
 * Covers:
 * - Leftover modal appears when completing a fill step for a shelf-stable filling
 * - Leftover modal saves stock when confirmed
 *
 * Uses the full UI flow to set up data (filling → ingredient → product → mould → plan).
 */

import { test, expect } from "./fixtures";

/** Create an ingredient via the UI, return the URL */
async function createIngredient(page: import("@playwright/test").Page, name: string) {
  await page.goto("/ingredients");
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByRole("textbox", { name: "Ingredient name" }).fill(name);
  await page.getByRole("button", { name: "Create Ingredient" }).click();
  await expect(page).toHaveURL(/\/ingredients\/.+/);
}

/** Create a filling, set category to shelf-stable, add an ingredient. Returns filling URL. */
async function createShelfStableFilling(page: import("@playwright/test").Page, fillingName: string, ingredientName: string) {
  await page.goto("/fillings");
  await page.getByRole("button", { name: "Add filling" }).click();
  await page.getByRole("textbox", { name: "Filling name" }).fill(fillingName);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/fillings\/.+/);

  // Set category to Pralines & Giandujas (shelf-stable)
  await page.locator("select.input").first().selectOption("Pralines & Giandujas (Nut-Based)");

  // Add ingredient
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByPlaceholder("Search ingredient…").fill(ingredientName);
  await page.getByRole("button", { name: ingredientName }).click();
  await page.locator("form").getByRole("spinbutton").fill("200");
  await page.locator("form").getByRole("button", { name: "Add" }).click();

  await page.getByRole("button", { name: "Save" }).click();
}

/** Create a product and assign a filling */
async function createProductWithFilling(page: import("@playwright/test").Page, productName: string, fillingName: string) {
  await page.goto("/products");
  await page.getByRole("button", { name: "Add new product" }).click();
  await page.getByRole("textbox", { name: "Product name" }).fill(productName);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/products\/.+/);

  await page.getByRole("button", { name: "Assign filling" }).click();
  await page.getByPlaceholder("Search fillings to assign...").fill(fillingName);
  await page.getByRole("button", { name: fillingName }).click();
}

/** Create a mould with known cavity data */
async function createMould(page: import("@playwright/test").Page, name: string) {
  await page.goto("/moulds");
  await page.getByRole("button", { name: "Add mould" }).click();
  await page.getByPlaceholder("Mould name *").fill(name);
  await page.getByRole("button", { name: "Create Mould" }).click();
  await expect(page).toHaveURL(/\/moulds\/.+/);

  // Lands in edit mode (?new=1) — fill cavity weight and count
  await page.getByPlaceholder("e.g. 12.5").fill("10");
  await page.getByPlaceholder("e.g. 24").fill("15");
  await page.getByRole("button", { name: "Save" }).click();
}

test.describe("Production — leftover filling", () => {
  test("leftover modal appears when completing fill step for shelf-stable filling", async ({ page }) => {
    test.setTimeout(120000);

    // Set up data: ingredient → filling (shelf-stable) → product → mould
    await createIngredient(page, "Test Hazelnuts");
    await createShelfStableFilling(page, "Test Praline", "Test Hazelnuts");
    await createProductWithFilling(page, "Praline Product", "Test Praline");
    await createMould(page, "Test Sphere Mould");

    // Create production plan via wizard
    await page.goto("/production/new");
    await page.getByText("Praline Product").click();
    // Continue to configure phase
    await page.getByRole("button", { name: /Continue.*selected/ }).click();
    // Select mould (option text includes cavity info)
    const mouldVal1 = await page.locator("select.input option", { hasText: "Test Sphere Mould" }).getAttribute("value");
    await page.locator("select.input").selectOption(mouldVal1!);
    // Continue to batch sizes (shelf-stable filling detected)
    await page.getByRole("button", { name: /Continue/ }).click();
    // Create the plan
    await page.getByRole("button", { name: "Create plan" }).click();
    await expect(page).toHaveURL(/\/production\/.+/, { timeout: 30000 });

    // Navigate to Fill tab
    await page.getByRole("button", { name: /^Fill \d/ }).click();

    // Complete the fill step
    await page.getByText("Fill: Praline Product").click();

    // Leftover modal should appear
    await expect(page.getByText("Any leftover filling?")).toBeVisible({ timeout: 15000 });
    await expect(page.getByText("Test Praline")).toBeVisible();

    // Skip
    await page.getByRole("button", { name: "No leftover" }).click();
    await expect(page.getByText("Any leftover filling?")).not.toBeVisible();
  });

  test("leftover modal saves stock when confirmed", async ({ page }) => {
    test.setTimeout(120000);

    await createIngredient(page, "Almonds");
    await createShelfStableFilling(page, "Almond Praline", "Almonds");
    await createProductWithFilling(page, "Almond Product", "Almond Praline");
    await createMould(page, "Diamond Mould");

    await page.goto("/production/new");
    await page.getByText("Almond Product").click();
    await page.getByRole("button", { name: /Continue.*selected/ }).click();
    const mouldVal2 = await page.locator("select.input option", { hasText: "Diamond Mould" }).getAttribute("value");
    await page.locator("select.input").selectOption(mouldVal2!);
    await page.getByRole("button", { name: /Continue/ }).click();
    await page.getByRole("button", { name: "Create plan" }).click();
    await expect(page).toHaveURL(/\/production\/.+/, { timeout: 30000 });

    await page.getByRole("button", { name: /^Fill \d/ }).click();
    await page.getByText("Fill: Almond Product").click();

    await expect(page.getByText("Any leftover filling?")).toBeVisible({ timeout: 15000 });

    // Enter amount and save
    await page.locator("input[type=number]").fill("50");
    await page.locator("input[type=number]").blur();
    await page.getByRole("button", { name: "Save leftover" }).click();
    await expect(page.getByText("Any leftover filling?")).not.toBeVisible();

    // Verify on stock page — leftover was saved
    await page.goto("/stock");
    await page.getByRole("button", { name: "Fillings" }).click();
    await expect(page.getByText("Almond Praline")).toBeVisible({ timeout: 15000 });
    // The saved stock entry should exist (filling name visible means remainingG > 0)
    await expect(page.getByText("No leftover fillings tracked")).not.toBeVisible();
  });
});
