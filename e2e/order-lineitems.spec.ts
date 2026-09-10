import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

// ─── Order line items & per-product batch allocations ────────────────────────
// Covers: line item CRUD + fulfillment chips; refining a batch link into
// per-product allocations with the "of ~N" denominator and the soft
// over-allocation warning; last-allocation downgrade to a bare link.

/** ISO date `days` from today (local timezone). */
function isoFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Create an order via quick-add and land on its (autosaving) detail page. */
async function createOrder(page: Page, title: string) {
  await page.goto("/orders?tab=orders");
  await page.getByRole("button", { name: "Add order" }).click();
  await page.getByLabel("Order title").fill(title);
  await page.getByLabel("Event date").fill(isoFromToday(30));
  await page.getByRole("button", { name: "Create Order" }).click();
  await expect(page).toHaveURL(/\/orders\/[^/?]+\/?$/);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
}

// Data-setup helpers — mirror production-leftover.spec.ts by convention.
async function createIngredient(page: Page, name: string) {
  await page.goto("/ingredients");
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByRole("textbox", { name: "Ingredient name" }).fill(name);
  await page.getByRole("button", { name: "Create Ingredient" }).click();
  await expect(page).toHaveURL(/\/ingredients\/.+/);
}

async function createFilling(page: Page, name: string, ingredientName: string) {
  await page.goto("/fillings");
  await page.getByRole("button", { name: "Add filling" }).click();
  await page.getByRole("textbox", { name: "Filling name" }).fill(name);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/fillings\/.+/);
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByPlaceholder("Search ingredient…").fill(ingredientName);
  await page.getByRole("button", { name: ingredientName }).click();
  await page.locator("form").getByRole("spinbutton").fill("100");
  await page.locator("form").getByRole("button", { name: "Add" }).click();
}

async function createProductWithFilling(page: Page, productName: string, fillingName: string) {
  await page.goto("/products");
  await page.getByRole("button", { name: "Add new product" }).click();
  await page.getByRole("textbox", { name: "Product name" }).fill(productName);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/products\/.+/);
  await page.getByRole("button", { name: "Add filling" }).click();
  await page.getByPlaceholder("Search fillings to assign...").fill(fillingName);
  await page.getByRole("button", { name: fillingName }).click();
}

/** Create a mould with cavity weight 10 g and 15 cavities → plans yield ~15 pcs. */
async function createMould(page: Page, name: string) {
  await page.goto("/moulds");
  await page.getByRole("button", { name: "Add mould" }).click();
  await page.getByPlaceholder("Mould name *").fill(name);
  await page.getByRole("button", { name: "Create Mould" }).click();
  await expect(page).toHaveURL(/\/moulds\/.+/);
  await page.getByLabel("Cavity weight").fill("10");
  await page.getByLabel("Cavity weight").blur();
  await page.getByLabel("Number of cavities").fill("15");
  await page.getByLabel("Number of cavities").blur();
}

/** Full moulded-product plan via the wizard (~15 pieces of `productName`). */
async function createFullPlan(page: Page, productName: string, mouldName: string) {
  await page.goto("/production/new?mode=full");
  await page.getByText(productName).click();
  await page.getByRole("button", { name: /Continue.*selected/ }).click();
  const mouldVal = await page.locator("select.input option", { hasText: mouldName }).getAttribute("value");
  await page.locator("select.input").selectOption(mouldVal!);
  // No batch-sizes step — the filling isn't shelf-stable, so "Create plan"
  // appears directly after mould selection.
  await page.getByRole("button", { name: "Create plan" }).click();
  await expect(page).toHaveURL(/\/production\/.+/, { timeout: 30_000 });
}

/** Product + everything it needs (ingredient, filling), no mould/plan. */
async function createBareProduct(page: Page, productName: string) {
  await createIngredient(page, "Line Sugar");
  await createFilling(page, "Line Caramel", "Line Sugar");
  await createProductWithFilling(page, productName, "Line Caramel");
}

test.describe("Order line items", () => {
  test("add, inline-edit quantity (into the thousands), and two-step remove a typed line item", async ({ page }) => {
    test.setTimeout(90_000);
    await createBareProduct(page, "Line Product");
    await createOrder(page, "Line item order");

    // Add: 40 × Line Product
    await page.getByLabel("Line item quantity").fill("40");
    await page.getByLabel("Line item product").selectOption({ label: "Line Product" });
    await page.getByRole("button", { name: "Add line item" }).click();
    await expect(page.getByLabel("Quantity for Line Product")).toHaveValue("40");
    // Typed line items show allocation from the start — zero until batches allocate
    await expect(page.getByText("0/40", { exact: true })).toBeVisible();

    // Inline quantity edit saves on blur — and a four-digit count fits the cell
    await page.getByLabel("Quantity for Line Product").fill("2500");
    await page.getByLabel("Quantity for Line Product").blur();
    await expect(page.getByLabel("Quantity for Line Product")).toHaveValue("2500");
    await expect(page.getByText("2,500 pieces · 1 line")).toBeVisible();
    await expect(page.getByText("0/2,500", { exact: true })).toBeVisible();
    const qtyCell = page.getByLabel("Quantity for Line Product");
    const clipped = await qtyCell.evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(clipped).toBe(false);

    // Two-step remove: cancel keeps, confirm deletes
    await page.getByRole("button", { name: "Remove line item Line Product" }).click();
    await expect(page.getByText(/Remove 2,500 × Line Product/)).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByLabel("Quantity for Line Product")).toBeVisible();
    await page.getByRole("button", { name: "Remove line item Line Product" }).click();
    await page.getByRole("button", { name: "Yes, remove" }).click();
    await expect(page.getByText("Nothing itemised yet", { exact: false })).toBeVisible();
  });

  test("an untyped line firms up into a product in place", async ({ page }) => {
    test.setTimeout(90_000);
    await createBareProduct(page, "Line Product");
    await createOrder(page, "Vague order");
    await page.getByLabel("Line item quantity").fill("40");
    await page.getByLabel("Line item note").fill("mix TBD, nut-free option");
    await page.getByRole("button", { name: "Add line item" }).click();
    // Untyped: the note is the row's name, nothing to allocate against yet
    await expect(page.getByLabel("Note for mix TBD, nut-free option")).toHaveValue("mix TBD, nut-free option");
    await expect(page.getByText("0/40", { exact: true })).toHaveCount(0);
    // Pick a product on the existing row — the line keeps its quantity and note
    await page.getByLabel("Product for mix TBD, nut-free option").selectOption({ label: "Line Product" });
    await expect(page.getByLabel("Quantity for Line Product")).toHaveValue("40");
    await expect(page.getByLabel("Note for Line Product")).toHaveValue("mix TBD, nut-free option");
    await expect(page.getByText("0/40", { exact: true })).toBeVisible();
  });
});

test.describe("Per-product batch allocations", () => {
  test("allocate a subset of a batch; fulfillment chip and over-allocation warning", async ({ page }) => {
    test.setTimeout(120_000);
    await createIngredient(page, "Alloc Sugar");
    await createFilling(page, "Alloc Caramel", "Alloc Sugar");
    await createProductWithFilling(page, "Alloc Product", "Alloc Caramel");
    await createMould(page, "Alloc Mould");
    await createFullPlan(page, "Alloc Product", "Alloc Mould"); // ~15 pcs
    await createOrder(page, "Allocation order");

    // Line item: 10 × Alloc Product
    await page.getByLabel("Line item quantity").fill("10");
    await page.getByLabel("Line item product").selectOption({ label: "Alloc Product" });
    await page.getByRole("button", { name: "Add line item" }).click();
    await expect(page.getByText("0 of 10 made")).toBeVisible();

    // Link the batch — bare association
    await page.getByLabel("Link a batch").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Link", exact: true }).click();
    await expect(page.getByRole("button", { name: /Unlink/ })).toBeVisible();

    // Allocate 10 of Alloc Product from the batch
    await page.getByLabel(/Allocate a product from/).selectOption({ index: 1 });
    await page.getByLabel(/Allocation quantity for/).fill("10");
    await page.locator("form").filter({ has: page.getByLabel(/Allocation quantity for/) })
      .getByRole("button", { name: "Add", exact: true }).click();

    // Allocation row with the batch denominator, allocated column complete
    await expect(page.getByText("of ~15")).toBeVisible();
    await expect(page.getByText("10/10", { exact: true })).toBeVisible();
    await expect(page.getByText("over batch yield")).not.toBeVisible();
    // The batch hasn't been made yet, so the sidebar counts it as in production
    await expect(page.getByText("+10 in production")).toBeVisible();
    await expect(page.getByText("0 of 10 made")).toBeVisible();

    // Re-allocating the same product updates the quantity (upsert) — over-allocate
    await page.getByLabel(/Allocate a product from/).selectOption({ index: 1 });
    await page.getByLabel(/Allocation quantity for/).fill("20");
    await page.locator("form").filter({ has: page.getByLabel(/Allocation quantity for/) })
      .getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("over batch yield")).toBeVisible();
    await expect(page.getByText("20/10", { exact: true })).toBeVisible();

    // The list's progress column reflects the same numbers: nothing made yet,
    // 10 needed, with the planned pieces filling the bar behind
    await page.goto("/orders?tab=orders");
    const row = page.getByRole("link", { name: /Allocation order/ });
    await expect(row.getByText("10", { exact: true })).toBeVisible();
    const bar = row.getByRole("progressbar");
    await expect(bar).toHaveAttribute("aria-valuenow", "0");
    await expect(bar).toHaveAttribute("aria-valuetext", /20 in production/);
  });

  test("removing the last allocation keeps the batch linked; unlink removes the group", async ({ page }) => {
    test.setTimeout(120_000);
    await createIngredient(page, "Down Sugar");
    await createFilling(page, "Down Caramel", "Down Sugar");
    await createProductWithFilling(page, "Down Product", "Down Caramel");
    await createMould(page, "Down Mould");
    await createFullPlan(page, "Down Product", "Down Mould");
    await createOrder(page, "Downgrade order");

    await page.getByLabel("Link a batch").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Link", exact: true }).click();

    await page.getByLabel(/Allocate a product from/).selectOption({ index: 1 });
    await page.getByLabel(/Allocation quantity for/).fill("5");
    await page.locator("form").filter({ has: page.getByLabel(/Allocation quantity for/) })
      .getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.getByText("of ~15")).toBeVisible();

    // Remove the only allocation → downgraded to a bare link, batch stays
    await page.getByRole("button", { name: /Remove allocation/ }).click();
    await page.getByRole("button", { name: "Yes", exact: true }).click();
    await expect(page.getByText("of ~15")).not.toBeVisible();
    await expect(page.getByRole("button", { name: /Unlink/ })).toBeVisible();
    // The plan stays excluded from the link picker (its group still exists)
    await expect(page.getByLabel("Link a batch")).not.toBeVisible();

    // Unlink the batch entirely — two-step
    await page.getByRole("button", { name: /Unlink/ }).click();
    await expect(page.getByText("Remove?")).toBeVisible();
    await page.getByRole("button", { name: "Yes", exact: true }).click();
    await expect(page.getByText("No batches linked yet", { exact: false })).toBeVisible();
  });
});
