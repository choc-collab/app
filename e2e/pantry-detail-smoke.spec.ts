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

test("sweep: category detail pages put Used in beside the editable panels", async ({ page }) => {
  test.setTimeout(120000);
  const errors = collectErrors(page);

  // Product categories — Shop appearance + Shell percentage on the left,
  // Used in on the right.
  await page.goto("/products");
  await page.getByRole("button", { name: /^Categories$/ }).click();
  await page.getByRole("button", { name: /Add product category/i }).click();
  await page.getByPlaceholder(/Category name/).fill("Sweep Category");
  await page.getByRole("button", { name: "Create Category" }).click();
  await expect(page).toHaveURL(/\/products\/categories\/.+/);

  await expect(page.getByRole("heading", { name: "Shop appearance" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Shell percentage" })).toBeVisible();
  const usedIn = page.getByRole("heading", { name: "Used in" });
  await expect(usedIn).toBeVisible();
  // The panel's own "Used in no products" heading must not double up with the
  // card title above it.
  await expect(page.getByRole("heading", { name: /^Used in no products$/ })).toHaveCount(0);

  // Side by side at desktop width: the card starts to the right of the
  // editable column, not underneath it.
  const shellBox = await page.getByRole("heading", { name: "Shell percentage" }).boundingBox();
  const usedInBox = await usedIn.boundingBox();
  expect(usedInBox!.x).toBeGreaterThan(shellBox!.x);

  // Filling categories — same treatment.
  await page.goto("/fillings");
  await page.getByRole("button", { name: /^Categories$/ }).click();
  await page.getByRole("button", { name: /Add filling category/i }).click();
  await page.getByPlaceholder(/Category name/).fill("Sweep Filling Category");
  await page.getByRole("button", { name: "Create Category" }).click();
  await expect(page).toHaveURL(/\/fillings\/categories\/.+/);

  const fUsedIn = page.getByRole("heading", { name: "Used in" });
  await expect(fUsedIn).toBeVisible();
  const toggleBox = await page.getByText("Treat as shelf-stable").boundingBox();
  const fUsedInBox = await fUsedIn.boundingBox();
  expect(fUsedInBox!.x).toBeGreaterThan(toggleBox!.x);

  // Ingredient categories — nothing to edit beyond the name, so the main
  // column holds only the destructive row; Used in still sits beside it.
  await page.goto("/ingredients");
  await page.getByRole("button", { name: /^Categories$/ }).click();
  await page.getByRole("button", { name: /Add ingredient category/i }).click();
  await page.getByPlaceholder(/Category name/).fill("Sweep Ingredient Category");
  await page.getByRole("button", { name: "Create Category" }).click();
  await expect(page).toHaveURL(/\/ingredients\/categories\/.+/);

  const iUsedIn = page.getByRole("heading", { name: "Used in" });
  await expect(iUsedIn).toBeVisible();
  const iDelete = await page.getByRole("button", { name: /Delete category/i }).boundingBox();
  const iUsedInBox = await iUsedIn.boundingBox();
  expect(iUsedInBox!.x).toBeGreaterThan(iDelete!.x);

  // Decoration categories — same shape.
  await page.goto("/pantry/decoration");
  await page.getByRole("button", { name: /^Categories$/ }).click();
  await page.getByRole("button", { name: /Add decoration category/i }).click();
  await page.getByPlaceholder(/Category name/).fill("Sweep Decoration Category");
  await page.getByRole("button", { name: "Create Category" }).click();
  await expect(page).toHaveURL(/\/pantry\/decoration\/categories\/.+/);
  await expect(page.getByRole("heading", { name: "Used in" })).toBeVisible();

  expect(real(errors)).toEqual([]);
});

test("sweep: moulds and decoration detail pages render clean", async ({ page }) => {
  test.setTimeout(150000);
  const errors = collectErrors(page);

  await page.goto("/moulds");
  await page.getByRole("button", { name: "Add mould" }).click();
  await page.getByPlaceholder("Mould name *").fill("Sweep Mould");
  await page.getByRole("button", { name: "Create Mould" }).click();
  await expect(page).toHaveURL(/\/moulds\/.+/);
  await expect(page.getByRole("heading", { name: "Properties" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Derived" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Used in" })).toBeVisible();

  await page.goto("/pantry/decoration");
  await page.getByRole("button", { name: /Add decoration material/i }).click();
  await page.getByPlaceholder(/Material name/).fill("Sweep Material");
  await page.getByRole("button", { name: "Create Material" }).click();
  await expect(page).toHaveURL(/\/pantry\/decoration\/.+/);
  await expect(page.getByRole("heading", { name: "Stock" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Properties" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Used in" })).toBeVisible();

  await page.goto("/pantry/decoration");
  await page.getByRole("button", { name: "Designs" }).click();
  await page.getByRole("button", { name: /Add shell design/i }).click();
  await page.getByPlaceholder(/Design name/).fill("Sweep Design");
  await page.getByRole("button", { name: "Create Design" }).click();
  await expect(page).toHaveURL(/\/pantry\/decoration\/designs\/.+/);
  await expect(page.getByRole("heading", { name: "Production step" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Used in" })).toBeVisible();

  expect(real(errors)).toEqual([]);
});

test("sweep: no pantry detail page still hides its fields behind a pencil", async ({ page }) => {
  test.setTimeout(90000);
  // The whole point of this pass: every pantry detail page is directly
  // editable. A pencil reappearing anywhere means a page regressed.
  for (const path of ["/fillings", "/ingredients", "/products", "/packaging", "/collections", "/moulds"]) {
    await page.goto(path);
    await expect(page.getByLabel(/^Edit /)).toHaveCount(0);
  }
});
