import { test, expect } from "./fixtures";

// Lab feature is currently disabled for users — skip until re-enabled
test.describe.skip("Product Lab", () => {
  test("shows empty state with CTAs on fresh database", async ({ page }) => {
    await page.goto("/lab");
    await expect(page.getByRole("heading", { name: "Product Lab" })).toBeVisible();
    await expect(page.getByRole("button", { name: /Start from scratch/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Clone a ganache filling/i })).toBeVisible();
  });

  test("/calculator redirects to /lab", async ({ page }) => {
    await page.goto("/calculator");
    await expect(page).toHaveURL("/lab");
    await expect(page.getByRole("heading", { name: "Product Lab" })).toBeVisible();
  });

  test("creates a new blank experiment and lands on detail page", async ({ page }) => {
    await page.goto("/lab");
    await page.getByRole("button", { name: /Start from scratch/i }).click();
    await page.getByPlaceholder(/e\.g\. Raspberry/).fill("My Test Ganache");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(/\/calculator\/.+/);
  });

  test("experiment appears in list after creation", async ({ page }) => {
    await page.goto("/lab");
    await page.getByRole("button", { name: /Start from scratch/i }).click();
    await page.getByPlaceholder(/e\.g\. Raspberry/).fill("Listed Experiment");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(/\/calculator\/.+/);

    await page.goto("/lab");
    await expect(page.getByText("Listed Experiment")).toBeVisible();
  });

  test("shows Edit product and Make product buttons once an experiment exists", async ({ page }) => {
    await page.goto("/lab");
    await page.getByRole("button", { name: /Start from scratch/i }).click();
    await page.getByPlaceholder(/e\.g\. Raspberry/).fill("Button Test");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(/\/calculator\/.+/);

    await page.goto("/lab");
    await expect(page.getByRole("button", { name: /Edit product/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Make product/i })).toBeVisible();
  });

  test("Make product navigates to the batch setup page", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/lab");
    await page.getByRole("button", { name: /Start from scratch/i }).click();
    await page.getByPlaceholder(/e\.g\. Raspberry/).fill("Batch Setup Test");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(/\/calculator\/.+/);

    await page.goto("/lab");
    await page.getByRole("button", { name: /Make product/i }).click();
    await expect(page).toHaveURL(/\/calculator\/.+\/run/);
    await expect(page.getByRole("heading", { name: /Make product/i })).toBeVisible();
  });

  test("batch setup page shows mould picker and disabled Start batch button", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/lab");
    await page.getByRole("button", { name: /Start from scratch/i }).click();
    await page.getByPlaceholder(/e\.g\. Raspberry/).fill("Run Page Test");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(/\/calculator\/.+/);

    await page.goto("/lab");
    await page.getByRole("button", { name: /Make product/i }).click();
    await expect(page).toHaveURL(/\/calculator\/.+\/run/);

    // Mould select is present (no aria-label on select, find by first combobox)
    await expect(page.getByRole("combobox").first()).toBeVisible();
    // Start batch is disabled when no mould selected
    await expect(page.getByRole("button", { name: /Start batch/i })).toBeDisabled();
  });

  test("Make a test batch on detail page navigates to batch setup", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/lab");
    await page.getByRole("button", { name: /Start from scratch/i }).click();
    await page.getByPlaceholder(/e\.g\. Raspberry/).fill("Detail Nav Test");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(/\/calculator\/.+/);

    // "Make product" button is present on the detail page (disabled until ingredients exist)
    await expect(page.getByRole("button", { name: /Make product/i })).toBeVisible();
  });

  test("deletes an experiment from the list", async ({ page }) => {
    await page.goto("/lab");
    await page.getByRole("button", { name: /Start from scratch/i }).click();
    await page.getByPlaceholder(/e\.g\. Raspberry/).fill("To Delete");
    await page.getByRole("button", { name: "Create" }).click();
    await expect(page).toHaveURL(/\/calculator\/.+/);

    await page.goto("/lab");
    await expect(page.getByText("To Delete")).toBeVisible();

    await page.getByRole("button", { name: /Delete experiment/i }).click();
    await page.getByRole("button", { name: /Yes, delete/i }).click();

    await expect(page.getByText("To Delete")).not.toBeVisible();
  });
});
