import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

/**
 * Smoke sweep for the pantry detail pages.
 *
 * Visits every detail page and every tab, failing on any console error, page
 * error or unhandled rejection. The per-page specs assert behaviour; this one
 * catches the class of problem they can't — a React warning, a crashed render
 * in a tab nothing else opens, or a layout that overflows on a phone.
 */

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console: ${m.text()}`);
  });
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  return errors;
}

const IGNORE = [
  /Download the React DevTools/i,
  /\[HMR\]/i,
  /dexie-cloud/i,
  /Failed to load resource/i,
];
const real = (errs: string[]) => errs.filter((e) => !IGNORE.some((r) => r.test(e)));

test("sweep: packaging detail renders clean", async ({ page }) => {
  test.setTimeout(90000);
  const errors = collectErrors(page);
  await page.goto("/packaging");
  await page.getByRole("button", { name: "Add packaging" }).click();
  await page.getByPlaceholder("Packaging name *").fill("Sweep Box");
  await page.getByRole("button", { name: "Create Packaging" }).click();
  await expect(page).toHaveURL(/\/packaging\/.+/);
  await expect(page.getByRole("heading", { name: "Properties" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Derived" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Stock" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Purchase history" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
  expect(real(errors)).toEqual([]);
});

test("sweep: ingredient detail renders every tab clean", async ({ page }) => {
  test.setTimeout(120000);
  const errors = collectErrors(page);
  await page.goto("/ingredients");
  await page.getByRole("button", { name: /Add ingredient/i }).click();
  await page.getByPlaceholder(/Ingredient name/).fill("Sweep Ingredient");
  await page.getByRole("button", { name: "Create Ingredient" }).click();
  await expect(page).toHaveURL(/\/ingredients\/.+/);

  await page.getByLabel("Category").selectOption("Chocolate");
  for (const tab of ["Details", "Shell", "Composition", "Allergens", "Pricing", "Nutrition"]) {
    await page.getByRole("button", { name: new RegExp(`^${tab}$`) }).click();
    await expect(page.getByRole("heading", { name: "Properties" })).toBeVisible();
  }
  expect(real(errors)).toEqual([]);
});

test("sweep: collection detail renders both tabs clean", async ({ page }) => {
  test.setTimeout(90000);
  const errors = collectErrors(page);
  await page.goto("/collections");
  await page.getByRole("button", { name: "Add collection" }).click();
  await page.getByPlaceholder("Collection name *").fill("Sweep Collection");
  await page.getByRole("button", { name: "Create Collection" }).click();
  await expect(page).toHaveURL(/\/collections\/.+/);
  await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
  await page.getByRole("button", { name: "Pricing & margins" }).click();
  await expect(page.getByRole("heading", { name: "Boxes" })).toBeVisible();
  await page.getByRole("button", { name: "Collection", exact: true }).click();
  expect(real(errors)).toEqual([]);
});

test("sweep: product detail renders every tab clean", async ({ page }) => {
  test.setTimeout(120000);
  const errors = collectErrors(page);
  await page.goto("/products");
  await page.getByRole("button", { name: "Add new product" }).click();
  await page.getByRole("textbox", { name: "Product name" }).fill("Sweep Product");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/products\/.+/);

  for (const tab of ["Product", "Shell design", "Filling history", "Batches", "Cost", "Nutrition"]) {
    await page.getByRole("button", { name: tab, exact: true }).click();
    await page.waitForTimeout(250);
  }
  await page.getByRole("button", { name: "Product", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Configuration" })).toBeVisible();
  expect(real(errors)).toEqual([]);
});

test("sweep: filling detail still renders clean", async ({ page }) => {
  test.setTimeout(90000);
  const errors = collectErrors(page);
  await page.goto("/fillings");
  await page.getByRole("button", { name: "Add filling" }).click();
  await page.getByRole("textbox", { name: "Filling name" }).fill("Sweep Filling");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/fillings\/.+/);
  await expect(page.getByRole("heading", { name: "Properties" })).toBeVisible();
  expect(real(errors)).toEqual([]);
});

test("sweep: narrow viewport collapses every detail page to one column", async ({ page }) => {
  test.setTimeout(120000);
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = collectErrors(page);

  await page.goto("/packaging");
  await page.getByRole("button", { name: "Add packaging" }).click();
  await page.getByPlaceholder("Packaging name *").fill("Narrow Box");
  await page.getByRole("button", { name: "Create Packaging" }).click();
  await expect(page).toHaveURL(/\/packaging\/.+/);

  // Nothing may overflow the viewport horizontally.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(0);
  expect(real(errors)).toEqual([]);
});
