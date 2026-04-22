import { test, expect } from "./fixtures";

// Helpers — mirrors the pattern in production-leftover.spec.ts
async function createIngredient(page: import("@playwright/test").Page, name: string) {
  await page.goto("/ingredients");
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByRole("textbox", { name: "Ingredient name" }).fill(name);
  await page.getByRole("button", { name: "Create Ingredient" }).click();
  await expect(page).toHaveURL(/\/ingredients\/.+/);
}

async function createFilling(page: import("@playwright/test").Page, name: string, ingredientName: string) {
  await page.goto("/fillings");
  await page.getByRole("button", { name: "Add filling" }).click();
  await page.getByRole("textbox", { name: "Filling name" }).fill(name);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/fillings\/.+/);
  // Add an ingredient so the recipe has a non-zero base weight
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByPlaceholder("Search ingredient…").fill(ingredientName);
  await page.getByRole("button", { name: ingredientName }).click();
  await page.locator("form").getByRole("spinbutton").fill("100");
  await page.locator("form").getByRole("button", { name: "Add" }).click();
  await page.getByRole("button", { name: "Save" }).click();
}

test.describe("Fillings-only production plans", () => {
  test("plan-type picker creates a fillings-only plan and skips mould + product selection", async ({ page }) => {
    test.setTimeout(90_000);
    await createIngredient(page, "Sugar");
    await createFilling(page, "Salted caramel", "Sugar");

    await page.goto("/production/new");
    await page.getByRole("button", { name: /Fillings only/ }).click();
    await expect(page.getByText(/Fillings to make/)).toBeVisible();

    // Plan name is pre-filled; add a filling target
    await page.getByRole("button", { name: /Add filling/ }).click();
    await page.getByPlaceholder("Search fillings…").fill("Salted");
    await page.getByRole("button", { name: /Salted caramel/ }).click();

    // Default target is 500g — the row shows it
    await expect(page.getByLabel(/Target grams for Salted caramel/)).toHaveValue("500");

    // Create the plan
    await page.getByRole("button", { name: /Create plan/ }).click();
    await expect(page).toHaveURL(/\/production\/.+/, { timeout: 30_000 });

    // Plan detail shows ONLY the Fillings phase tab (no colour/shell/fill/cap/unmould)
    await expect(page.getByRole("button", { name: /^Fillings/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Colour/ })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /^Shell/ })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /^Unmould/ })).not.toBeVisible();

    // The standalone filling batch step is listed with its target grams
    await expect(page.getByText(/Make Salted caramel — batch for stock/)).toBeVisible();
    await expect(page.getByText(/500g/).first()).toBeVisible();
  });

  test("completing a fillings-only plan writes a FillingStock row with plan back-ref", async ({ page }) => {
    test.setTimeout(120_000);
    await createIngredient(page, "Cream");
    await createFilling(page, "Dark ganache", "Cream");

    await page.goto("/production/new?mode=fillings-only");
    await page.getByRole("button", { name: /Add filling/ }).click();
    await page.getByRole("button", { name: /Dark ganache/ }).click();
    await page.getByLabel(/Target grams for Dark ganache/).fill("750");
    await page.getByRole("button", { name: /Create plan/ }).click();
    await expect(page).toHaveURL(/\/production\/.+/, { timeout: 30_000 });

    // Mark the batch as done — completing all steps triggers completePlan,
    // which writes the FillingStock row.
    await page.getByRole("button", { name: /Make Dark ganache — batch for stock/ }).click();

    // Navigate to stock → fillings tab to verify FillingStock row appeared
    await page.goto("/stock");
    await page.getByRole("button", { name: "Fillings", exact: true }).click();
    await expect(page.getByText("Dark ganache")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/750\s*g/).first()).toBeVisible();
  });

  test("batch summary emits FILLING BATCHES and omits PRODUCTS PRODUCED", async ({ page }) => {
    test.setTimeout(120_000);
    await createIngredient(page, "Butter");
    await createFilling(page, "Praline paste", "Butter");

    await page.goto("/production/new?mode=fillings-only");
    await page.getByRole("button", { name: /Add filling/ }).click();
    await page.getByRole("button", { name: /Praline paste/ }).click();
    await page.getByLabel(/Target grams for Praline paste/).fill("400");

    // Log as past batch — completes immediately and generates the batch summary
    await page.getByRole("button", { name: /Log past batch/ }).click();
    await page.getByRole("button", { name: /Log completed batch/ }).click();
    await expect(page).toHaveURL(/\/production\/.+\/summary/, { timeout: 30_000 });

    const pre = page.locator("pre");
    await expect(pre).toContainText("FILLING BATCHES");
    await expect(pre).toContainText("Praline paste");
    await expect(pre).toContainText("400g");
    // No products section
    const summaryText = await pre.textContent();
    expect(summaryText).not.toContain("PRODUCTS PRODUCED");
  });

  test("plan index shows a 'Fillings only' badge for filling-only plans", async ({ page }) => {
    test.setTimeout(90_000);
    await createIngredient(page, "Milk");
    await createFilling(page, "Milk ganache", "Milk");

    await page.goto("/production/new?mode=fillings-only");
    await page.getByRole("button", { name: /Add filling/ }).click();
    await page.getByRole("button", { name: /Milk ganache/ }).click();
    await page.getByRole("button", { name: /Create plan/ }).click();
    await expect(page).toHaveURL(/\/production\/.+/, { timeout: 30_000 });

    await page.goto("/production");
    await expect(page.getByText("Fillings only").first()).toBeVisible();
  });

  test("scaled-recipes page renders the standalone batch's ingredient amounts", async ({ page }) => {
    test.setTimeout(120_000);
    await createIngredient(page, "Honey");
    await createFilling(page, "Honey caramel", "Honey"); // 100g base recipe

    await page.goto("/production/new?mode=fillings-only");
    await page.getByRole("button", { name: /Add filling/ }).click();
    await page.getByRole("button", { name: /Honey caramel/ }).click();
    // Target 300g → ×3 the base → ingredient scales to 300g of Honey.
    await page.getByLabel(/Target grams for Honey caramel/).fill("300");
    await page.getByRole("button", { name: /Create plan/ }).click();
    await expect(page).toHaveURL(/\/production\/.+/, { timeout: 30_000 });

    // "Scaled recipes" link is visible on the Fillings tab for fillings-only plans
    const scaledLink = page.getByRole("link", { name: /Scaled recipes/ });
    await expect(scaledLink).toBeVisible();
    await scaledLink.click();
    await expect(page).toHaveURL(/\/production\/.+\/products/);

    // The batch's card is rendered with its name, category ("Standalone batch…"),
    // total weight and the scaled ingredient row.
    await expect(page.getByRole("heading", { name: "Scaled recipes" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Honey caramel" })).toBeVisible();
    await expect(page.getByText("Standalone batch for stock")).toBeVisible();
    await expect(page.getByText("Honey", { exact: true })).toBeVisible();
    // Scaled amount: 100g base × 3 = 300g
    await expect(page.getByText("300g").first()).toBeVisible();
  });

  test("Fillings-only card on plan-type picker is keyboard accessible", async ({ page }) => {
    await page.goto("/production/new");
    const fillingsOnly = page.getByRole("button", { name: /Fillings only/ });
    await fillingsOnly.focus();
    await expect(fillingsOnly).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.getByText(/Fillings to make/)).toBeVisible();
  });
});

test.describe("Hybrid plans — adding extra filling batches from plan detail", () => {
  test("fillings-only plan: add a second batch via the Fillings tab panel", async ({ page }) => {
    test.setTimeout(120_000);
    await createIngredient(page, "Almond");
    await createFilling(page, "Almond praline", "Almond");
    await createIngredient(page, "Cocoa");
    await createFilling(page, "Cocoa nib crunch", "Cocoa");

    // Create a fillings-only plan with one batch
    await page.goto("/production/new?mode=fillings-only");
    await page.getByRole("button", { name: /Add filling/ }).click();
    await page.getByRole("button", { name: /Almond praline/ }).click();
    await page.getByRole("button", { name: /Create plan/ }).click();
    await expect(page).toHaveURL(/\/production\/.+/, { timeout: 30_000 });

    // Panel shows the initial batch
    const panel = page.getByText("Filling batches for stock").locator("..").locator("..");
    await expect(panel).toContainText("Almond praline");
    await expect(panel).toContainText("500g");

    // Add a second batch via the inline picker
    await page.getByRole("button", { name: /Add filling batch$/ }).click();
    const select = page.getByLabel("Filling");
    // The Fillings row categories are appended to the option text ("Filling · Category")
    const optionValue = await select.locator("option", { hasText: "Cocoa nib crunch" }).getAttribute("value");
    await select.selectOption(optionValue!);
    await page.getByLabel(/Target weight/).fill("250");
    await page.getByRole("button", { name: "Add batch", exact: true }).click();

    // Panel now has two rows, both listed with their grams
    await expect(panel).toContainText("Cocoa nib crunch");
    await expect(panel).toContainText("250g");
    // A new step appears in the checklist
    await expect(page.getByText(/Make Cocoa nib crunch — batch for stock/)).toBeVisible();
  });

  test("removing a not-yet-made batch uses two-step inline confirmation", async ({ page }) => {
    test.setTimeout(120_000);
    await createIngredient(page, "Vanilla");
    await createFilling(page, "Vanilla caramel", "Vanilla");

    await page.goto("/production/new?mode=fillings-only");
    await page.getByRole("button", { name: /Add filling/ }).click();
    await page.getByRole("button", { name: /Vanilla caramel/ }).click();
    await page.getByRole("button", { name: /Create plan/ }).click();
    await expect(page).toHaveURL(/\/production\/.+/, { timeout: 30_000 });

    // Row's trash button triggers inline confirmation — no silent delete
    const panel = page.getByText("Filling batches for stock").locator("..").locator("..");
    await page.getByRole("button", { name: /Remove Vanilla caramel batch/ }).click();
    await expect(panel.getByText("Remove?")).toBeVisible();
    // Cancel keeps the batch
    await panel.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(panel.getByText("Vanilla caramel")).toBeVisible();
    // Confirm actually deletes
    await page.getByRole("button", { name: /Remove Vanilla caramel batch/ }).click();
    await panel.getByRole("button", { name: "Yes", exact: true }).click();
    // Panel collapses back to the empty-state add button
    await expect(page.getByRole("button", { name: "Add filling batch for stock" })).toBeVisible();
    // No rows remain
    await expect(page.getByText("Vanilla caramel")).not.toBeVisible();
  });
});
