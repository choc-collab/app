import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

// ─── Orders & Events — capture layer ─────────────────────────────────────────
// Covers the v1 slice: quick-add → detail edit → lifecycle pills → list
// grouping → calendar view → two-step delete → Today dashboard tile.

/** Create an order through the UI quick-add and land on its detail page
 *  (in edit mode via ?new=1), then save so the navigation guard disarms. */
async function createOrder(
  page: Page,
  { title, date, save = true }: { title: string; date?: string; save?: boolean },
) {
  await page.goto("/orders");
  await page.getByRole("button", { name: "Add order" }).click();
  await page.getByLabel("Order title").fill(title);
  if (date) await page.getByLabel("Event date").fill(date);
  await page.getByRole("button", { name: "Create Order" }).click();
  await expect(page).toHaveURL(/\/orders\/[^/]+\/?\?new=1/);
  if (save) {
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Edit order" })).toBeVisible();
  }
}

/** ISO date `days` from today (local timezone). */
function isoFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

test.describe("Orders — list & quick-add", () => {
  test("empty state on a fresh database", async ({ page }) => {
    await page.goto("/orders");
    await expect(page.getByRole("heading", { name: "Orders" })).toBeVisible();
    await expect(page.getByText("No orders yet. Tap + to capture your first order or event.")).toBeVisible();
  });

  test("quick-add lands on the detail page in edit mode and saves", async ({ page }) => {
    await createOrder(page, { title: "Popup in Wittelte", date: isoFromToday(30), save: false });
    // Edit mode: the title field is prefilled and Save is available
    await expect(page.getByLabel("Title")).toHaveValue("Popup in Wittelte");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    // Read view after save
    await expect(page.getByRole("heading", { name: "Popup in Wittelte" })).toBeVisible();
    await expect(page).not.toHaveURL(/new=1/);
  });

  test("created order appears in the list with its status badge and month header", async ({ page }) => {
    await createOrder(page, { title: "Corp gift boxes", date: isoFromToday(45) });
    await page.goto("/orders");
    const card = page.getByRole("link", { name: /Corp gift boxes/ });
    await expect(card).toBeVisible();
    await expect(card.getByText("Lead")).toBeVisible();
  });

  test("search filters the list", async ({ page }) => {
    await createOrder(page, { title: "December market", date: isoFromToday(20) });
    await createOrder(page, { title: "Restaurant tasting", date: isoFromToday(25) });
    await page.goto("/orders");
    await page.getByLabel("Search orders").fill("market");
    await expect(page.getByRole("link", { name: /December market/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Restaurant tasting/ })).not.toBeVisible();
  });
});

test.describe("Orders — detail page", () => {
  test("edit details and see them in the read view", async ({ page }) => {
    await createOrder(page, { title: "Winter fair", date: isoFromToday(60) });
    await page.getByRole("button", { name: "Edit order" }).click();
    // Quick-create a customer straight from the order form
    await page.getByLabel("Customer").selectOption("__new__");
    await page.getByLabel("New customer name").fill("Gemeente Westerveld");
    await page.getByLabel("Venue / location").fill("Wittelte");
    await page.getByLabel("Type").selectOption("market");
    await page.getByLabel("Notes").fill("40 bonbons, mix TBD, one nut-free option");
    await page.getByRole("button", { name: "Save", exact: true }).click();
    // Customer renders as a link to its detail page
    await expect(page.getByRole("link", { name: "Gemeente Westerveld" })).toBeVisible();
    await expect(page.getByText("Wittelte")).toBeVisible();
    await expect(page.getByText("Market", { exact: true })).toBeVisible();
    await expect(page.getByText("40 bonbons, mix TBD, one nut-free option")).toBeVisible();
  });

  test("status pills advance the lifecycle without entering edit mode", async ({ page }) => {
    await createOrder(page, { title: "Hotel order", date: isoFromToday(10) });
    // Badge next to the title starts as Lead
    await page.getByRole("button", { name: "Confirmed" }).click();
    await expect(page.getByRole("button", { name: "Confirmed" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "In production" }).click();
    await expect(page.getByRole("button", { name: "In production" })).toHaveAttribute("aria-pressed", "true");
  });

  test("two-step delete requires confirmation and returns to the list", async ({ page }) => {
    await createOrder(page, { title: "Cancelled gig", date: isoFromToday(15) });
    await page.getByRole("button", { name: "Delete order" }).click();
    // First step: confirmation strip appears, nothing deleted yet
    await expect(page.getByText("Delete this order?")).toBeVisible();
    // Cancel backs out
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText("Delete this order?")).not.toBeVisible();
    // Do it again and confirm
    await page.getByRole("button", { name: "Delete order" }).click();
    await page.getByRole("button", { name: "Yes, delete order" }).click();
    await expect(page).toHaveURL(/\/orders\/?$/);
    await expect(page.getByText("No orders yet", { exact: false })).toBeVisible();
  });
});

test.describe("Orders — calendar view", () => {
  test("order chip shows on its day and month navigation works", async ({ page }) => {
    // Put the order on the 15th of the current month so it's always inside
    // the visible grid regardless of today's date.
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-15`;
    await createOrder(page, { title: "Calendar test order", date: iso });
    await page.goto("/orders");
    await page.getByRole("button", { name: "Calendar" }).click();
    await expect(page.getByRole("link", { name: /Calendar test order/ })).toBeVisible();
    // Navigate away and back
    await page.getByRole("button", { name: "Next month" }).click();
    await expect(page.getByRole("link", { name: /Calendar test order/ })).not.toBeVisible();
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(page.getByRole("link", { name: /Calendar test order/ })).toBeVisible();
  });

  test("clicking a day opens the quick-add prefilled with that date", async ({ page }) => {
    await page.goto("/orders");
    await page.getByRole("button", { name: "Calendar" }).click();
    // Click the first day cell of the grid (its empty area)
    const grid = page.locator(".grid.grid-cols-7").last();
    await grid.locator("div").first().click();
    await expect(page.getByLabel("Order title")).toBeVisible();
    // Date input carries the clicked day, not necessarily today
    await expect(page.getByLabel("Event date")).not.toHaveValue("");
  });
});

test.describe("Orders — Today dashboard tile", () => {
  test("upcoming order appears on the tile and links to its detail page", async ({ page }) => {
    await createOrder(page, { title: "Tile test popup", date: isoFromToday(7) });
    await page.goto("/today");
    await expect(page.getByText("Upcoming orders")).toBeVisible();
    const link = page.getByRole("link", { name: /Tile test popup/ });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL(/\/orders\/[^/]+/);
    await expect(page.getByRole("heading", { name: "Tile test popup" })).toBeVisible();
  });

  test("tile shows the empty state with a link to the Orders page", async ({ page }) => {
    await page.goto("/today");
    await expect(page.getByText("Nothing planned — add an order →")).toBeVisible();
    await page.getByRole("link", { name: "Nothing planned — add an order →" }).click();
    await expect(page).toHaveURL(/\/orders\/?$/);
  });
});
