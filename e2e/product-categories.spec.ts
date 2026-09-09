import { test, expect } from "./fixtures";

/**
 * Product Categories — Categories tab on /products + detail page coverage.
 *
 * Note: ensureDefaultProductCategories() runs on every page load via the seed
 * loader, so each fresh test browser context will already have the two seeded
 * categories ("moulded" and "bar") present. Tests that need an "empty" view
 * therefore look at the search-filtered empty state, not at the truly-empty one.
 */

async function openCategoriesTab(page: import("@playwright/test").Page) {
  await page.goto("/products");
  await page.getByRole("button", { name: /^Categories$/ }).click();
}

test.describe("Product Categories", () => {
  test("tab strip shows Products and Categories", async ({ page }) => {
    await page.goto("/products");
    await expect(page.getByRole("button", { name: /^Products$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Categories$/ })).toBeVisible();
  });

  test("seeds the two default categories on a fresh database", async ({ page }) => {
    await openCategoriesTab(page);
    await expect(page.getByText("moulded", { exact: true })).toBeVisible();
    await expect(page.getByText("bar", { exact: true })).toBeVisible();
  });

  test("seeded categories show their range and default", async ({ page }) => {
    await openCategoriesTab(page);
    // "15%–50%" matches both `moulded` and `snack bar` rows; scope to
    // the moulded link so the assertion is unambiguous.
    await expect(page.getByRole("link", { name: /^moulded\b.*15%–50%/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^bar\b.*0%–100%/ })).toBeVisible();
  });

  test("list renders as a table with column headers", async ({ page }) => {
    await openCategoriesTab(page);
    const table = page.getByRole("table", { name: "Product categories" });
    await expect(table).toBeVisible();
    for (const header of ["Category", "Shell range", "Default %", "Products", "Updated"]) {
      await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
    }
    await expect(page.getByText("moulded", { exact: true })).toBeVisible();
  });

  test("creates a new category and lands on the detail page", async ({ page }) => {
    await openCategoriesTab(page);
    await page.getByRole("button", { name: /Add product category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Truffle");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/products\/categories\/.+/);
  });

  test("created category appears in the list", async ({ page }) => {
    await openCategoriesTab(page);
    await page.getByRole("button", { name: /Add product category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Pâte de Fruit");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/products\/categories\/.+/);

    await openCategoriesTab(page);
    await expect(page.getByText("Pâte de Fruit")).toBeVisible();
  });

  test("cancel add form hides without creating", async ({ page }) => {
    await openCategoriesTab(page);
    await page.getByRole("button", { name: /Add product category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Should Not Exist");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByPlaceholder(/Category name/)).not.toBeVisible();
    await expect(page.getByText("Should Not Exist")).not.toBeVisible();
  });

  test("autosaves the shell range with no Save button", async ({ page }) => {
    test.setTimeout(60000);
    await openCategoriesTab(page);
    await page.getByRole("button", { name: /Add product category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Editable");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/products\/categories\/.+/);

    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);

    // Min and max commit on blur, independently of each other.
    await page.getByLabel("Shell % min").fill("20");
    await page.getByLabel("Shell % min").blur();
    await page.getByLabel("Shell % max").fill("60");
    await page.getByLabel("Shell % max").blur();
    await page.getByLabel("Default shell %").fill("40");
    await page.getByLabel("Default shell %").blur();

    await page.reload();
    await expect(page.getByLabel("Shell % min")).toHaveValue("20");
    await expect(page.getByLabel("Shell % max")).toHaveValue("60");
    await expect(page.getByLabel("Default shell %")).toHaveValue("40");
  });

  test("shop appearance autosaves on change", async ({ page }) => {
    test.setTimeout(60000);
    await openCategoriesTab(page);
    await page.getByRole("button", { name: /Add product category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Barred");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/products\/categories\/.+/);

    await page.getByLabel("Shop appearance").selectOption("bar");
    await expect(page.getByText(/Long horizontal segment/)).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Shop appearance")).toHaveValue("bar");
  });

  test("a default outside the range is refused inline and never written", async ({ page }) => {
    test.setTimeout(60000);
    await openCategoriesTab(page);
    await page.getByRole("button", { name: /Add product category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Bad Range");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/products\/categories\/.+/);

    await page.getByLabel("Shell % min").fill("10");
    await page.getByLabel("Shell % min").blur();
    await page.getByLabel("Shell % max").fill("20");
    await page.getByLabel("Shell % max").blur();

    await page.getByLabel("Default shell %").fill("99");
    await page.getByLabel("Default shell %").blur();

    // Error names the bound and the value that is still stored; the typed value
    // stays in the input so it can be corrected rather than retyped.
    // Scoped to the field's own alert — Next renders a route announcer with role=alert too.
    await expect(page.locator('p[role="alert"]')).toContainText("Must sit between 10 and 20");
    await expect(page.getByLabel("Default shell %")).toHaveValue("99");

    // The record was untouched.
    await page.reload();
    await expect(page.getByLabel("Default shell %")).not.toHaveValue("99");

    // Correcting it saves.
    await page.getByLabel("Default shell %").fill("15");
    await page.getByLabel("Default shell %").blur();
    await page.reload();
    await expect(page.getByLabel("Default shell %")).toHaveValue("15");
  });

  test("min and max move independently, and an out-of-range saved default is flagged", async ({ page }) => {
    test.setTimeout(60000);
    await openCategoriesTab(page);
    await page.getByRole("button", { name: /Add product category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Shifting Range");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/products\/categories\/.+/);

    // Created at 15–50 / default 30. Moving the whole range upwards has no
    // valid single-field order, so min and max must write regardless — leaving
    // the stored default temporarily outside, which the page has to surface.
    await page.getByLabel("Shell % min").fill("60");
    await page.getByLabel("Shell % min").blur();
    await page.getByLabel("Shell % max").fill("80");
    await page.getByLabel("Shell % max").blur();

    await expect(page.getByText(/now sits outside/)).toBeVisible();

    await page.getByLabel("Default shell %").fill("70");
    await page.getByLabel("Default shell %").blur();
    await expect(page.getByText(/now sits outside/)).toHaveCount(0);

    await page.reload();
    await expect(page.getByLabel("Shell % min")).toHaveValue("60");
    await expect(page.getByLabel("Shell % max")).toHaveValue("80");
    await expect(page.getByLabel("Default shell %")).toHaveValue("70");
  });

  test("deletes an unused category from the detail page", async ({ page }) => {
    test.setTimeout(60000);
    await openCategoriesTab(page);
    await page.getByRole("button", { name: /Add product category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Delete Me");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/products\/categories\/.+/);

    await page.getByRole("button", { name: /Delete category/i }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();

    await expect(page).toHaveURL(/\/products\/?(\?tab=categories)?$/);
    await expect(page.getByText("Delete Me")).not.toBeVisible();
  });

  test("shows a distinct not-found state for a missing category", async ({ page }) => {
    await page.goto("/products/categories/does-not-exist");
    await expect(page.getByText(/This product category doesn.t exist\./)).toBeVisible();
    await expect(page.getByText("Loading…")).toHaveCount(0);
  });
});
