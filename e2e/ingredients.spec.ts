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

  test("cost per gram preview updates live and saves exactly one price-history entry", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/ingredients");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("textbox", { name: "Ingredient name" }).fill("Callebaut 823");
    await page.getByRole("button", { name: "Create Ingredient" }).click();
    await expect(page).toHaveURL(/\/ingredients\/.+/);

    await page.getByRole("button", { name: "Pricing" }).click();

    // Enter the same values the user reported: 2500 g bag at €65. Unit=g, so
    // `g per unit` is locked to 1 and the user cannot type 2500 into it.
    // Qty and price inputs are identified by their placeholders (no label htmlFor).
    await page.getByPlaceholder("1", { exact: true }).fill("2500");

    // The `g per unit` input is locked for unit=g — readonly with value 1.
    await expect(page.locator('input[readonly][value="1"]')).toHaveCount(1);

    await page.getByPlaceholder("0.00").fill("65");

    // Preview box should appear with the correct value — 65 / (2500 × 1) = 0.026.
    await expect(page.getByText(/Cost per gram:/)).toBeVisible();
    await expect(page.getByText(/0\.026\/g/).first()).toBeVisible();

    // Save — single click, no double-submit.
    await page.getByRole("button", { name: "Update" }).click();

    // Read view: cost per gram shows the same value.
    await expect(page.getByText(/0\.026\/g/).first()).toBeVisible();

    // Expand price history — exactly one entry, at 0.026.
    await page.getByRole("button", { name: /Price history/ }).click();
    await expect(page.locator("ul li").filter({ hasText: /0\.026\/g/ })).toHaveCount(1);
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
