import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

// ─── Orders & Events — capture layer ─────────────────────────────────────────
// Covers: quick-add → autosaving detail page → lifecycle pills → grouped
// table with pieces/progress → two-step delete → Today tile.
// (The calendar view moved to /schedule — see e2e/schedule.spec.ts.)

/** Create an order through the UI quick-add and land on its detail page. The
 *  page has no edit mode — the record exists as soon as it lands. */
async function createOrder(page: Page, { title, date }: { title: string; date?: string }) {
  // Explicit ?tab=orders: a previous step may have persisted the Customers tab.
  await page.goto("/orders?tab=orders");
  await page.getByRole("button", { name: "Add order" }).click();
  await page.getByLabel("Order title").fill(title);
  if (date) await page.getByLabel("Event date").fill(date);
  await page.getByRole("button", { name: "Create Order" }).click();
  await expect(page).toHaveURL(/\/orders\/[^/?]+\/?$/);
  await expect(page.getByText(title, { exact: true })).toBeVisible();
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

  test("quick-add lands on an autosaving detail page — no edit mode, no Save", async ({ page }) => {
    await createOrder(page, { title: "Popup in Wittelte", date: isoFromToday(30) });
    await expect(page).not.toHaveURL(/new=1/);
    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Edit order" })).toHaveCount(0);
    // Sidebar cards of the shared detail layout
    await expect(page.getByRole("heading", { name: "Status" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Properties" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Production" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Line items" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Linked batches" })).toBeVisible();
    // Back link is named for the list (scoped to main — the side nav has one too)
    await expect(page.getByRole("main").getByRole("link", { name: "Orders" })).toBeVisible();
  });

  test("created order appears as a table row with its status badge under a month group", async ({ page }) => {
    await createOrder(page, { title: "Corp gift boxes", date: isoFromToday(45) });
    await page.goto("/orders");
    const table = page.getByRole("table", { name: "Orders" });
    await expect(table).toBeVisible();
    // Column heads of the shared table chrome
    await expect(table.getByRole("columnheader", { name: "Order", exact: true })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Venue" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Order size" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Made" })).toBeVisible();
    const row = table.getByRole("link", { name: /Corp gift boxes/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("Lead")).toBeVisible();
    // Month group header is collapsible (locate by the aria-expanded attribute
    // itself, so the locator keeps matching after the value flips)
    const groupToggle = table.locator("button[aria-expanded]").first();
    await expect(groupToggle).toHaveAttribute("aria-expanded", "true");
    await groupToggle.click();
    await expect(row).not.toBeVisible();
    await expect(groupToggle).toHaveAttribute("aria-expanded", "false");
    await groupToggle.click();
    await expect(row).toBeVisible();
  });

  test("table shows pieces needed and a made/needed progress bar per order", async ({ page }) => {
    await createOrder(page, { title: "Big corporate order", date: isoFromToday(40) });
    // Two line items — one in the thousands, so the qty cell has to hold it
    await page.getByLabel("Line item quantity").fill("1200");
    await page.getByRole("button", { name: "Add line item" }).click();
    await expect(page.getByLabel("Quantity for (unspecified)")).toHaveValue("1200");
    await page.getByLabel("Line item quantity").fill("300");
    await page.getByLabel("Line item note").fill("nut-free");
    await page.getByRole("button", { name: "Add line item" }).click();
    await expect(page.getByText("1,500 pieces · 2 lines")).toBeVisible();
    // Sidebar Production card mirrors the totals
    await expect(page.getByText("0 of 1,500 made")).toBeVisible();

    await page.goto("/orders");
    const row = page.getByRole("link", { name: /Big corporate order/ });
    await expect(row).toBeVisible();
    await expect(row.getByText("1,500", { exact: true })).toBeVisible();
    const bar = row.getByRole("progressbar");
    await expect(bar).toBeVisible();
    await expect(bar).toHaveAttribute("aria-valuemax", "1500");
    await expect(bar).toHaveAttribute("aria-valuenow", "0");
    await expect(row.getByText(/0.*\/ 1,500/)).toBeVisible();
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

test.describe("Orders — multi-day events", () => {
  test("a two-day market is one order: range in the header and table; Ends is editable", async ({ page }) => {
    // Pin the event to the 10th–11th of the current month — arbitrary, just
    // keeps the dates predictable across a month boundary.
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    const start = `${ym}-10`;
    const end = `${ym}-11`;

    await page.goto("/orders?tab=orders");
    await page.getByRole("button", { name: "Add order" }).click();
    await page.getByLabel("Order title").fill("Weekend market");
    await page.getByLabel("Event date").fill(start);
    await page.getByLabel("Multi-day event").check();
    // Both dates are labelled once the toggle is on, and Create waits for an end
    await expect(page.getByText("Starts", { exact: true })).toBeVisible();
    await expect(page.getByText("Ends", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Create Order" })).toBeDisabled();
    await page.getByLabel("End date").fill(end);
    await page.getByRole("button", { name: "Create Order" }).click();
    await expect(page).toHaveURL(/\/orders\/[^/?]+\/?$/);

    // Header subtitle shows the collapsed range; the sidebar holds both dates
    await expect(page.getByText(/^10–11 [A-Z][a-z]{2} \d{4} · /)).toBeVisible();
    await expect(page.getByLabel("Event date")).toHaveValue(start);
    await expect(page.getByLabel("End date")).toHaveValue(end);
    await expect(page.getByText("Starts", { exact: true })).toBeVisible();

    // The table's date column carries the same range (past or upcoming, the
    // order is in the current month, so show closed orders to be safe)
    await page.goto("/orders?tab=orders");
    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByRole("button", { name: "Show", exact: true }).click();
    const row = page.getByRole("link", { name: /Weekend market/ });
    await expect(row).toBeVisible();
    await expect(row.getByText(/10–11 [A-Z][a-z]{2} \d{4}/)).toBeVisible();

    // Clearing Ends on the detail page collapses it back to a single day
    await row.click();
    await expect(page).toHaveURL(/\/orders\/[^/?]+\/?$/);
    await page.getByLabel("End date").fill("");
    await expect(page.getByText("Event date", { exact: true })).toBeVisible();
    await expect(page.getByText(/^10 [A-Z][a-z]{2} \d{4} · /)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("End date")).toHaveValue("");
  });
});

test.describe("Orders — detail page", () => {
  test("properties autosave field by field and survive a reload", async ({ page }) => {
    await createOrder(page, { title: "Winter fair", date: isoFromToday(60) });
    // Quick-create a customer straight from the sidebar picker
    await page.getByLabel("Customer").selectOption("__new__");
    await page.getByLabel("New customer name").fill("Gemeente Westerveld");
    await page.getByLabel("New customer name").press("Enter");
    // Customer renders as a link to its detail page in the header subtitle
    await expect(page.getByRole("link", { name: "Gemeente Westerveld" })).toBeVisible();
    await expect(page.getByLabel("Customer")).toHaveValue(/.+/);

    // Venue: the Pick-up chip is offered while empty; typing a venue hides it
    await expect(page.getByRole("button", { name: "Pick-up" })).toBeVisible();
    await page.getByLabel("Venue").fill("Wittelte");
    await page.getByLabel("Venue").blur();
    await expect(page.getByRole("button", { name: "Pick-up" })).toHaveCount(0);
    // Previously used venues (and Pick-up) feed the datalist suggestions
    await expect(page.locator("#order-venue-list option[value='Pick-up']")).toHaveCount(1);
    await page.getByLabel("Type").selectOption("market");
    await page.getByLabel("Notes").fill("40 bonbons, mix TBD, one nut-free option");
    await page.getByLabel("Notes").blur();
    await expect(page.getByText(/Wittelte · Market/)).toBeVisible();

    await page.reload();
    await expect(page.getByLabel("Venue")).toHaveValue("Wittelte");
    await expect(page.getByLabel("Type")).toHaveValue("market");
    await expect(page.getByLabel("Notes")).toHaveValue("40 bonbons, mix TBD, one nut-free option");
    await expect(page.getByRole("link", { name: "Gemeente Westerveld" })).toBeVisible();
  });

  test("venue suggests earlier venues; the Pick-up chip sets it in one tap", async ({ page }) => {
    await createOrder(page, { title: "First market", date: isoFromToday(20) });
    await page.getByLabel("Venue").fill("Brink, Dwingeloo");
    await page.getByLabel("Venue").blur();

    await createOrder(page, { title: "Box for a neighbour", date: isoFromToday(3) });
    // The earlier venue is now a suggestion on this order
    await expect(page.locator("#order-venue-list option[value='Brink, Dwingeloo']")).toHaveCount(1);
    await page.getByRole("button", { name: "Pick-up" }).click();
    await expect(page.getByLabel("Venue")).toHaveValue("Pick-up");
    await expect(page.getByText(/· Pick-up/)).toBeVisible();

    // The list's Venue column shows the chip for this one and the text for the other
    await page.goto("/orders?tab=orders");
    const row = page.getByRole("link", { name: /Box for a neighbour/ });
    await expect(row.getByText("Pick-up", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: /First market/ }).getByText("Brink, Dwingeloo")).toBeVisible();
  });

  test("title renames inline and the change reaches the list", async ({ page }) => {
    await createOrder(page, { title: "Draft title", date: isoFromToday(12) });
    await page.getByRole("button", { name: "Rename" }).click();
    const input = page.getByRole("textbox").first();
    await input.fill("Final title");
    await input.press("Enter");
    await expect(page.getByText("Final title", { exact: true })).toBeVisible();
    await page.goto("/orders");
    await expect(page.getByRole("link", { name: /Final title/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Draft title/ })).toHaveCount(0);
  });

  test("status pills advance the lifecycle and update the header badge", async ({ page }) => {
    await createOrder(page, { title: "Hotel order", date: isoFromToday(10) });
    await page.getByRole("button", { name: "Confirmed" }).click();
    await expect(page.getByRole("button", { name: "Confirmed" })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: "In production" }).click();
    await expect(page.getByRole("button", { name: "In production" })).toHaveAttribute("aria-pressed", "true");
    // Header badge follows (pill + badge = two "In production" texts)
    await expect(page.getByText("In production", { exact: true })).toHaveCount(2);
  });

  test("a missing order shows the not-found state, not a spinner", async ({ page }) => {
    await page.goto("/orders/does-not-exist");
    await expect(page.getByText("This order doesn’t exist.")).toBeVisible();
    await page.getByRole("link", { name: "Back to Orders" }).click();
    await expect(page).toHaveURL(/\/orders\/?(\?tab=orders)?$/);
  });

  test("two-step delete requires confirmation and returns to the list", async ({ page }) => {
    await createOrder(page, { title: "Cancelled gig", date: isoFromToday(15) });
    await page.getByRole("button", { name: "Delete order" }).click();
    // First step: confirmation panel appears, nothing deleted yet
    await expect(page.getByText("Delete this order?")).toBeVisible();
    // Cancel backs out
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(page.getByText("Delete this order?")).not.toBeVisible();
    // Do it again and confirm
    await page.getByRole("button", { name: "Delete order" }).click();
    await page.getByRole("button", { name: "Yes, delete order" }).click();
    await expect(page).toHaveURL(/\/orders\/?(\?tab=orders)?$/);
    await expect(page.getByText("No orders yet", { exact: false })).toBeVisible();
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
    await expect(page.getByText("Tile test popup", { exact: true })).toBeVisible();
  });

  test("tile shows the empty state with a link to the Orders page", async ({ page }) => {
    await page.goto("/today");
    await expect(page.getByText("Nothing planned — add an order →")).toBeVisible();
    await page.getByRole("link", { name: "Nothing planned — add an order →" }).click();
    await expect(page).toHaveURL(/\/orders\/?$/);
  });
});

test.describe("Orders — filter panel", () => {
  test("past orders are hidden by default; filters reveal them and bound the period", async ({ page }) => {
    await createOrder(page, { title: "Past popup", date: isoFromToday(-10) });
    await createOrder(page, { title: "Near event", date: isoFromToday(5) });
    await createOrder(page, { title: "Far event", date: isoFromToday(200) });
    await page.goto("/orders");

    // Default: open orders only — the past order is invisible
    await expect(page.getByRole("link", { name: /Near event/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Far event/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Past popup/ })).not.toBeVisible();
    await expect(page.getByRole("button", { name: /Past & closed/ })).toHaveCount(0);

    // Show past & closed via the filter panel — they join the table as a
    // dimmed group at the bottom
    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByRole("button", { name: "Show", exact: true }).click();
    await expect(page.getByRole("button", { name: /Past & closed/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Past popup/ })).toBeVisible();

    // Bound the window: the far-future order drops out, near + recent past stay
    await page.getByRole("button", { name: "Within 30 days" }).click();
    await expect(page.getByRole("link", { name: /Far event/ })).not.toBeVisible();
    await expect(page.getByRole("link", { name: /Near event/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Past popup/ })).toBeVisible();

    // Clear all filters → defaults restored (past hidden, all dates)
    await page.getByRole("button", { name: "Clear all filters" }).click();
    await expect(page.getByRole("link", { name: /Far event/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Past popup/ })).not.toBeVisible();
  });

  test("customer filter narrows the list to that customer's orders", async ({ page }) => {
    // Create a customer via the Customers tab quick-add
    await page.goto("/orders?tab=customers");
    await page.getByRole("button", { name: "Add customer" }).click();
    await page.getByLabel("Customer name").fill("Filter Klant");
    await page.getByRole("button", { name: "Create Customer" }).click();
    await expect(page).toHaveURL(/\/orders\/customers\/[^/]+\/?\?new=1/);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("button", { name: "Edit customer" })).toBeVisible();

    // One order assigned to the customer (via the sidebar picker), one without
    await createOrder(page, { title: "Assigned order", date: isoFromToday(7) });
    await page.getByLabel("Customer").selectOption({ label: "Filter Klant" });
    await expect(page.getByRole("link", { name: "Filter Klant" })).toBeVisible();
    await createOrder(page, { title: "Unassigned order", date: isoFromToday(8) });

    await page.goto("/orders");
    await page.getByRole("button", { name: "Filters" }).click();
    await page.getByLabel("Filter by customer").selectOption({ label: "Filter Klant" });
    await expect(page.getByRole("link", { name: /Assigned order/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /Unassigned order/ })).not.toBeVisible();

    // Selecting "All customers" restores the full list
    await page.getByLabel("Filter by customer").selectOption({ label: "All customers" });
    await expect(page.getByRole("link", { name: /Unassigned order/ })).toBeVisible();
  });
});
