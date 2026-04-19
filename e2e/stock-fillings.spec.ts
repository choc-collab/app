import { test, expect } from "./fixtures";

test.describe("Stock — Fillings tab", () => {
  test("shows empty state on Fillings tab", async ({ page }) => {
    await page.goto("/stock");
    await page.getByRole("button", { name: "Fillings" }).click();
    await expect(page.getByText("No leftover fillings tracked")).toBeVisible();
  });

  test("manually add filling stock and it appears in list", async ({ page }) => {
    test.setTimeout(60000);

    // First create a shelf-stable filling
    await page.goto("/fillings");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Test Praline");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fillings\/.+/);

    // Set category to shelf-stable (Pralines & Giandujas)
    await page.locator("select.input").first().selectOption("Pralines & Giandujas (Nut-Based)");
    await page.getByRole("button", { name: "Save" }).click();

    // Go to stock page, Fillings tab
    await page.goto("/stock");
    await page.getByRole("button", { name: "Fillings" }).click();

    // Click add button
    await page.getByRole("button", { name: "Add filling stock" }).click();

    // Select filling and fill amount
    await page.getByRole("combobox").selectOption({ label: "Test Praline" });
    await page.getByPlaceholder("Amount in grams").fill("250");
    await page.getByRole("button", { name: "Add", exact: true }).click();

    // Verify it appears in the stock list (not in the combobox option)
    await expect(page.getByRole("paragraph").filter({ hasText: "Test Praline" })).toBeVisible();
    await expect(page.locator("text=250g").first()).toBeVisible();
  });

  test("adjust filling stock amount", async ({ page }) => {
    test.setTimeout(60000);

    // Create filling + stock
    await page.goto("/fillings");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Adjust Test");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fillings\/.+/);
    await page.locator("select.input").first().selectOption("Pralines & Giandujas (Nut-Based)");
    await page.getByRole("button", { name: "Save" }).click();

    await page.goto("/stock");
    await page.getByRole("button", { name: "Fillings" }).click();
    await page.getByRole("button", { name: "Add filling stock" }).click();
    await page.getByRole("combobox").selectOption({ label: "Adjust Test" });
    await page.getByPlaceholder("Amount in grams").fill("300");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.locator("text=300g").first()).toBeVisible();

    // Click Adjust
    await page.getByRole("button", { name: "Adjust" }).click();
    // Clear and type new value
    await page.locator("input[type=number]").last().fill("180");
    await page.getByRole("button", { name: "Save" }).click();

    // Verify updated
    await expect(page.locator("text=180g").first()).toBeVisible();
  });

  test("discard filling stock with confirmation", async ({ page }) => {
    test.setTimeout(60000);

    // Create filling + stock
    await page.goto("/fillings");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Discard Test");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fillings\/.+/);
    await page.locator("select.input").first().selectOption("Pralines & Giandujas (Nut-Based)");
    await page.getByRole("button", { name: "Save" }).click();

    await page.goto("/stock");
    await page.getByRole("button", { name: "Fillings" }).click();
    await page.getByRole("button", { name: "Add filling stock" }).click();
    await page.getByRole("combobox").selectOption({ label: "Discard Test" });
    await page.getByPlaceholder("Amount in grams").fill("100");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("Discard Test")).toBeVisible();

    // Click Discard — confirmation appears
    await page.getByRole("button", { name: "Discard" }).click();
    await expect(page.getByText("Discard this stock?")).toBeVisible();

    // Cancel first
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator("text=100g").first()).toBeVisible();

    // Discard for real
    await page.getByRole("button", { name: "Discard" }).click();
    await page.getByRole("button", { name: "Yes" }).click();

    // Should show empty state again
    await expect(page.getByText("No leftover fillings tracked")).toBeVisible();
  });

  test("search filters filling stock", async ({ page }) => {
    test.setTimeout(60000);

    // Create two shelf-stable fillings with stock
    for (const name of ["Hazelnut Praline", "Mango Gel"]) {
      await page.goto("/fillings");
      await page.getByRole("button", { name: "Add filling" }).click();
      await page.getByRole("textbox", { name: "Filling name" }).fill(name);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/fillings\/.+/);
      const cat = name.includes("Praline")
        ? "Pralines & Giandujas (Nut-Based)"
        : "Fruit-Based (Pectins & Acids)";
      await page.locator("select.input").first().selectOption(cat);
      await page.getByRole("button", { name: "Save" }).click();
    }

    await page.goto("/stock");
    await page.getByRole("button", { name: "Fillings" }).click();

    // Add stock for both
    for (const name of ["Hazelnut Praline", "Mango Gel"]) {
      await page.getByRole("button", { name: "Add filling stock" }).click();
      await page.getByRole("combobox").selectOption({ label: name });
      await page.getByPlaceholder("Amount in grams").fill("200");
      await page.getByRole("button", { name: "Add", exact: true }).click();
    }

    // Both visible in stock list (use paragraph locator to avoid matching select options)
    await expect(page.locator("p.font-semibold", { hasText: "Hazelnut Praline" })).toBeVisible();
    await expect(page.locator("p.font-semibold", { hasText: "Mango Gel" })).toBeVisible();

    // Search for one
    await page.getByLabel("Search filling stock").fill("Mango");
    await expect(page.locator("p.font-semibold", { hasText: "Mango Gel" })).toBeVisible();
    await expect(page.locator("p.font-semibold", { hasText: "Hazelnut Praline" })).not.toBeVisible();
  });
});
