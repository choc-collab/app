import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

// ─── Customers & order↔batch links ───────────────────────────────────────────
// Covers the Customers tab, customer detail (contacts + order history +
// three-way delete), assigning customers to orders, and linking orders to
// production batches.

/** ISO date `days` from today (local timezone). */
function isoFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Create an order via the Orders tab quick-add, land on detail, save. */
async function createOrder(page: Page, { title, date }: { title: string; date: string }) {
  await page.goto("/orders?tab=orders");
  await page.getByRole("button", { name: "Add order" }).click();
  await page.getByLabel("Order title").fill(title);
  await page.getByLabel("Event date").fill(date);
  await page.getByRole("button", { name: "Create Order" }).click();
  await expect(page).toHaveURL(/\/orders\/[^/]+\/?\?new=1/);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit order" })).toBeVisible();
}

/** Create a customer via the Customers tab quick-add, land on detail, save. */
async function createCustomer(page: Page, name: string) {
  await page.goto("/orders?tab=customers");
  await page.getByRole("button", { name: "Add customer" }).click();
  await page.getByLabel("Customer name").fill(name);
  await page.getByRole("button", { name: "Create Customer" }).click();
  await expect(page).toHaveURL(/\/orders\/customers\/[^/]+\/?\?new=1/);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Edit customer" })).toBeVisible();
}

/** Assign an existing customer to an existing order via the order's edit form.
 *  Assumes the page is currently on that order's read view. */
async function assignCustomer(page: Page, customerName: string) {
  await page.getByRole("button", { name: "Edit order" }).click();
  await page.getByLabel("Customer").selectOption({ label: customerName });
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("link", { name: customerName })).toBeVisible();
}

// Helpers for the batch-link test — mirrors production-fillings-only.spec.ts
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

/** Create a minimal fillings-only production plan; returns after landing on
 *  its detail page. */
async function createMinimalPlan(page: Page) {
  await createIngredient(page, "Sugar");
  await createFilling(page, "Salted caramel", "Sugar");
  await page.goto("/production/new");
  await page.getByRole("button", { name: /Fillings only/ }).click();
  await page.getByRole("button", { name: /Add filling/ }).click();
  await page.getByPlaceholder("Search fillings…").fill("Salted");
  await page.getByRole("button", { name: /Salted caramel/ }).click();
  await page.getByRole("button", { name: /Create plan/ }).click();
  await expect(page).toHaveURL(/\/production\/.+/, { timeout: 30_000 });
}

test.describe("Customers — tab & detail", () => {
  test("empty state on a fresh database", async ({ page }) => {
    await page.goto("/orders?tab=customers");
    await expect(page.getByText("No customers yet. Tap + to add your first.")).toBeVisible();
  });

  test("quick-add lands on detail in edit mode; contacts save to the read view", async ({ page }) => {
    await page.goto("/orders?tab=customers");
    await page.getByRole("button", { name: "Add customer" }).click();
    await page.getByLabel("Customer name").fill("Bakkerij Jansen");
    await page.getByRole("button", { name: "Create Customer" }).click();
    await expect(page).toHaveURL(/\/orders\/customers\/[^/]+\/?\?new=1/);
    await expect(page.getByLabel("Name")).toHaveValue("Bakkerij Jansen");
    await page.getByLabel("Email").fill("info@bakkerijjansen.nl");
    await page.getByLabel("Phone").fill("+31 6 12345678");
    await page.getByLabel("Address").fill("Dorpsstraat 12\n7991 AB Dwingeloo");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Bakkerij Jansen" })).toBeVisible();
    await expect(page.getByText("info@bakkerijjansen.nl")).toBeVisible();
    await expect(page.getByText("+31 6 12345678")).toBeVisible();
    // Multi-line address renders with line breaks preserved
    await expect(page.getByText(/Dorpsstraat 12\s+7991 AB Dwingeloo/)).toBeVisible();
    // And it shows on the customers tab list
    await page.goto("/orders?tab=customers");
    await expect(page.getByRole("link", { name: /Bakkerij Jansen/ })).toBeVisible();
  });

  test("assigning a customer to an order shows on order read view and list card", async ({ page }) => {
    await createCustomer(page, "Hotel De Wijk");
    await createOrder(page, { title: "Petit fours order", date: isoFromToday(21) });
    await assignCustomer(page, "Hotel De Wijk");
    // Orders list card subtitle carries the customer name
    await page.goto("/orders?tab=orders");
    const card = page.getByRole("link", { name: /Petit fours order/ });
    await expect(card).toBeVisible();
    await expect(card.getByText(/Hotel De Wijk/)).toBeVisible();
    // Search by customer name finds the order
    await page.getByLabel("Search orders").fill("De Wijk");
    await expect(page.getByRole("link", { name: /Petit fours order/ })).toBeVisible();
  });

  test("customer detail lists that customer's orders", async ({ page }) => {
    await createCustomer(page, "Restaurant Vled");
    await createOrder(page, { title: "Spring tasting", date: isoFromToday(30) });
    await assignCustomer(page, "Restaurant Vled");
    await createOrder(page, { title: "Summer terrace", date: isoFromToday(90) });
    await assignCustomer(page, "Restaurant Vled");
    // Open the customer via the order's customer link
    await page.getByRole("link", { name: "Restaurant Vled" }).click();
    await expect(page.getByRole("heading", { name: "Restaurant Vled" })).toBeVisible();
    await expect(page.getByText("Orders (2)")).toBeVisible();
    await expect(page.getByRole("link", { name: /Spring tasting/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Summer terrace/ })).toBeVisible();
  });

  test("customer with orders offers Archive instead of delete", async ({ page }) => {
    await createCustomer(page, "Cafe Ruinen");
    await createOrder(page, { title: "Bonbon box", date: isoFromToday(14) });
    await assignCustomer(page, "Cafe Ruinen");
    await page.getByRole("link", { name: "Cafe Ruinen" }).click();
    await page.getByRole("button", { name: "Archive customer" }).click();
    await expect(page.getByText("Archive this customer?")).toBeVisible();
    await expect(page.getByText(/1 order references/)).toBeVisible();
    await page.getByRole("button", { name: "Archive customer", exact: true }).last().click();
    await expect(page).toHaveURL(/\/orders\/?\?tab=customers/);
    // Hidden from the default (non-archived) list
    await expect(page.getByRole("link", { name: /Cafe Ruinen/ })).not.toBeVisible();
  });

  test("unused customer two-step deletes", async ({ page }) => {
    await createCustomer(page, "Typo Customer");
    await page.getByRole("button", { name: "Delete customer" }).click();
    await expect(page.getByText("Delete this customer?")).toBeVisible();
    // Cancel keeps it
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText("Delete this customer?")).not.toBeVisible();
    // Confirm removes it
    await page.getByRole("button", { name: "Delete customer" }).click();
    await page.getByRole("button", { name: "Yes, delete customer" }).click();
    await expect(page).toHaveURL(/\/orders\/?\?tab=customers/);
    await expect(page.getByText("No customers yet", { exact: false })).toBeVisible();
  });
});

test.describe("Orders — linked production batches", () => {
  test("link a batch to an order, then unlink with two-step confirm", async ({ page }) => {
    test.setTimeout(90_000);
    await createMinimalPlan(page);
    await createOrder(page, { title: "Batch-linked order", date: isoFromToday(10) });

    // Link the plan
    await page.getByLabel("Link a batch").selectOption({ index: 1 });
    await page.getByRole("button", { name: "Link", exact: true }).click();
    // Row appears with an unlink control and a plan status badge
    await expect(page.getByRole("button", { name: /Unlink/ })).toBeVisible();
    await expect(page.getByText(/Not yet started|In progress|Done/).first()).toBeVisible();

    // Unlink: two-step
    await page.getByRole("button", { name: /Unlink/ }).click();
    await expect(page.getByText("Remove?")).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText("Remove?")).not.toBeVisible();
    await page.getByRole("button", { name: /Unlink/ }).click();
    await page.getByRole("button", { name: "Yes", exact: true }).click();
    await expect(page.getByText("No batches linked yet", { exact: false })).toBeVisible();
  });
});
