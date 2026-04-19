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
    await expect(page.getByText("shell 15%–50%")).toBeVisible();   // moulded
    await expect(page.getByText("shell 0%–100%")).toBeVisible();   // bar
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

  test("edits the shell range from the detail page", async ({ page }) => {
    test.setTimeout(60000);
    await openCategoriesTab(page);
    await page.getByRole("button", { name: /Add product category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Editable");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/products\/categories\/.+/);

    await page.getByLabel("Shell % min").fill("20");
    await page.getByLabel("Shell % max").fill("60");
    await page.getByLabel("Default shell %").fill("40");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("20%–60%")).toBeVisible();
    await expect(page.getByText("40%", { exact: true })).toBeVisible();
  });

  test("rejects invalid range with an inline error and does not save", async ({ page }) => {
    test.setTimeout(60000);
    await openCategoriesTab(page);
    await page.getByRole("button", { name: /Add product category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Bad Range");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/products\/categories\/.+/);

    await page.getByLabel("Shell % min").fill("10");
    await page.getByLabel("Shell % max").fill("20");
    await page.getByLabel("Default shell %").fill("99");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText(/Default shell % must lie within the min–max range/)).toBeVisible();
    await expect(page.getByLabel("Shell % min")).toBeVisible();
  });

  test("deletes an unused category from the detail page", async ({ page }) => {
    test.setTimeout(60000);
    await openCategoriesTab(page);
    await page.getByRole("button", { name: /Add product category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Delete Me");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/products\/categories\/.+/);

    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: /Delete category/i }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();

    await expect(page).toHaveURL(/\/products(\?tab=categories)?$/);
    await expect(page.getByText("Delete Me")).not.toBeVisible();
  });
});
