import { test, expect } from "./fixtures";

test.describe("Navigation", () => {
  test("legacy /app URL redirects to the Today dashboard", async ({ page }) => {
    await page.goto("/app");
    await expect(page).toHaveURL(/\/today\/?$/);
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
  });

  test("Today dashboard shows the tile row", async ({ page }) => {
    await page.goto("/today");
    await expect(page.getByText(/Shopping list/i)).toBeVisible();
    await expect(page.getByText(/In progress/i).first()).toBeVisible();
    await expect(page.getByText(/Experiments brewing/i)).toBeVisible();
    await expect(page.getByText(/Week sales/i)).toBeVisible();
  });

  test("side nav navigates to Pantry", async ({ page }) => {
    await page.goto("/today");
    await page.getByRole("link", { name: "Pantry" }).first().click();
    await expect(page).toHaveURL("/pantry/");
  });

  test("landing page shows welcome tiles", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("link", { name: /Open the app/i }).first()).toBeVisible();
    await expect(page.getByRole("link", { name: /Getting started/i }).first()).toBeVisible();
  });

  test("navigates to Products from side nav", async ({ page }) => {
    await page.goto("/products");
    await expect(page.getByRole("link", { name: "Products" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  });

  test("navigates to Fillings from side nav", async ({ page }) => {
    await page.goto("/fillings");
    await expect(page.getByRole("heading", { name: "Fillings" })).toBeVisible();
  });

  test("navigates to Ingredients from side nav", async ({ page }) => {
    await page.goto("/ingredients");
    await expect(page.getByRole("heading", { name: "Ingredients" })).toBeVisible();
  });

  test("navigates to Moulds", async ({ page }) => {
    await page.goto("/moulds");
    await expect(page.getByRole("heading", { name: "Moulds" })).toBeVisible();
  });

  test("navigates to Production", async ({ page }) => {
    await page.goto("/production");
    await expect(page.getByRole("heading", { name: "Production" })).toBeVisible();
  });

  // Lab feature is currently disabled — skip until re-enabled
  test.skip("navigates to Calculator (Lab)", async ({ page }) => {
    await page.goto("/calculator");
    await expect(page.getByRole("heading", { name: /Product Lab|Experiments/i })).toBeVisible();
  });

  test("navigates to Settings", async ({ page }) => {
    await page.goto("/settings");
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  test("navigates to Shopping", async ({ page }) => {
    await page.goto("/shopping");
    await expect(page.getByRole("heading", { name: "Shopping" })).toBeVisible();
  });

  test("navigates to Pantry", async ({ page }) => {
    await page.goto("/pantry");
    await expect(page.getByRole("heading", { name: "The Pantry" })).toBeVisible();
  });

  test("navigates to Observatory", async ({ page }) => {
    await page.goto("/observatory");
    await expect(page.getByRole("heading", { name: "The Observatory" })).toBeVisible();
  });

  test("navigates to Stock", async ({ page }) => {
    await page.goto("/stock");
    await expect(page.getByRole("heading", { name: "Stock" })).toBeVisible();
  });

  test("side nav Home link returns to the Today dashboard", async ({ page }) => {
    await page.goto("/products");
    await page.getByRole("link", { name: /^Today$/ }).first().click();
    await expect(page).toHaveURL("/today/");
  });
});
