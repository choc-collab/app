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

  test("detail page allows editing purchase cost", async ({ page }) => {
    test.setTimeout(60000);
    // Create ingredient — lands on edit form (?new=1 = editing mode)
    await page.goto("/ingredients");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("textbox", { name: "Ingredient name" }).fill("Dark Chocolate");
    await page.getByRole("button", { name: "Create Ingredient" }).click();
    await expect(page).toHaveURL(/\/ingredients\/.+/);

    // Switch to Pricing tab — the cost field is in the pricing section
    await page.getByRole("button", { name: "Pricing" }).click();

    // Fill in purchase cost (fill() auto-waits for the element up to the test timeout)
    const costInput = page.getByPlaceholder("0.00");
    await costInput.fill("12.50");
    await page.getByRole("button", { name: "Update" }).click();

    // Now in view mode on Pricing tab — verify the saved cost is visible (symbol depends on currency setting)
    await expect(page.getByText(/12\.5/)).toBeVisible();
  });

  test("Shell tab appears live when category is set to Chocolate before save", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/ingredients");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("textbox", { name: "Ingredient name" }).fill("Live Shell Test");
    await page.getByRole("button", { name: "Create Ingredient" }).click();
    await expect(page).toHaveURL(/\/ingredients\/.+/);

    // On arrival the page is in editing mode (?new=1). No category selected, so Shell tab must not be present.
    await expect(page.getByRole("button", { name: /^Shell$/ })).toHaveCount(0);

    // Pick "Chocolate" in the in-form category dropdown — without saving.
    const categorySelect = page.locator("select").filter({ has: page.locator("option", { hasText: "Chocolate" }) }).first();
    await categorySelect.selectOption("Chocolate");

    // The Shell tab should now appear immediately, driven by form state (not DB).
    await expect(page.getByRole("button", { name: /^Shell$/ })).toBeVisible();

    // Clicking it swaps the form section to the shell controls.
    await page.getByRole("button", { name: /^Shell$/ }).click();
    await expect(page.getByText("Can be used as shell chocolate")).toBeVisible();

    // Flipping category away from Chocolate hides the tab again, also without saving.
    // (The category dropdown lives in the Details section, so step back there first.)
    await page.getByRole("button", { name: "Details" }).click();
    await categorySelect.selectOption("");
    await expect(page.getByRole("button", { name: /^Shell$/ })).toHaveCount(0);
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
});
