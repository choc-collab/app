import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

// ─── Log — daily journal ─────────────────────────────────────────────────────
// Covers: empty state → day page with notes (add, autosave edit, two-step
// delete) and workshop conditions → table rows grouped by month → calendar
// markers → automatic digest lines derived from other tables (an order created
// today) → the Today dashboard tile with its quick-note box → nav entry.

/** Data rows of the Log table (the header row has no link). */
const logRows = (page: Page) => page.getByRole("table", { name: "Log" }).locator('[role="row"] a');

/** Local ISO date `days` from today. */
function isoFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

test.describe("Log — list & empty state", () => {
  test("empty state on a fresh database, with a nav entry", async ({ page }) => {
    await page.goto("/today");
    await page.getByRole("link", { name: "Log", exact: true }).click();
    await expect(page).toHaveURL(/\/log\/?$/);
    await expect(page.getByRole("heading", { name: "Log" })).toBeVisible();
    await expect(page.getByText(/Nothing logged yet/)).toBeVisible();
  });

  test("the + button opens today's day page", async ({ page }) => {
    await page.goto("/log");
    await page.getByRole("button", { name: "Write a note for today" }).click();
    await expect(page).toHaveURL(new RegExp(`/log/${isoFromToday(0)}/?$`));
    // Scoped to main — the side nav has a "Today" link too
    await expect(page.getByRole("main").getByText("Today", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Notes" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What happened" })).toBeVisible();
  });
});

test.describe("Log — day page notes", () => {
  test("add a note, edit it with autosave, reload, then delete with confirmation", async ({ page }) => {
    const today = isoFromToday(0);
    await page.goto(`/log/${today}`);
    await expect(page.getByText("No notes for this day yet.")).toBeVisible();

    await page.getByLabel("New note").fill("Tempering held at 31.5°C — much better");
    await page.getByRole("button", { name: "Add note" }).click();
    const note = page.locator('[data-testid="log-note"]');
    await expect(note).toHaveCount(1);
    await expect(note.locator("textarea")).toHaveValue("Tempering held at 31.5°C — much better");
    // The add box clears for the next note
    await expect(page.getByLabel("New note")).toHaveValue("");

    // Edit in place — debounced autosave, flushed on blur
    await note.locator("textarea").fill("Tempering held at 31.5°C — keep the room cooler");
    await note.locator("textarea").blur();
    await page.reload();
    await expect(page.locator('[data-testid="log-note"] textarea')).toHaveValue("Tempering held at 31.5°C — keep the room cooler");

    // Two-step delete
    await page.getByRole("button", { name: "Delete note" }).click();
    await expect(page.getByText("Delete this note?")).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.locator('[data-testid="log-note"]')).toHaveCount(1);
    await page.getByRole("button", { name: "Delete note" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(page.locator('[data-testid="log-note"]')).toHaveCount(0);
    await expect(page.getByText("No notes for this day yet.")).toBeVisible();
  });

  test("several notes on one day keep their own cards; Cmd/Ctrl+Enter adds", async ({ page }) => {
    await page.goto(`/log/${isoFromToday(0)}`);
    await page.getByLabel("New note").fill("Morning: sprayed the hearts");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.locator('[data-testid="log-note"]')).toHaveCount(1);
    await page.getByLabel("New note").fill("Evening: sold out at the market");
    await page.getByLabel("New note").press("ControlOrMeta+Enter");
    await expect(page.locator('[data-testid="log-note"]')).toHaveCount(2);
    await expect(page.getByText(/2 notes/)).toBeVisible();
  });

  test("workshop conditions save on blur and show on the list card", async ({ page }) => {
    const today = isoFromToday(0);
    await page.goto(`/log/${today}`);
    await page.getByLabel("Workshop temperature (°C)").fill("21");
    await page.getByLabel("Workshop temperature (°C)").blur();
    await page.getByLabel("Workshop humidity (%)").fill("55");
    await page.getByLabel("Workshop humidity (%)").press("Enter");
    await page.reload();
    await expect(page.getByLabel("Workshop temperature (°C)")).toHaveValue("21");
    await expect(page.getByLabel("Workshop humidity (%)")).toHaveValue("55");

    await page.goto("/log");
    const row = logRows(page).first();
    await expect(row).toContainText("21°C · 55% RH");
    await expect(row).toContainText("Today");
    // Table chrome, like Orders and the pantry
    const table = page.getByRole("table", { name: "Log" });
    await expect(table.getByRole("columnheader", { name: "Day" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "What happened" })).toBeVisible();
    await expect(table.getByRole("columnheader", { name: "Conditions" })).toBeVisible();
  });

  test("previous / next day navigation and an unparseable day", async ({ page }) => {
    const today = isoFromToday(0);
    await page.goto(`/log/${today}`);
    await page.getByRole("link", { name: "Previous day" }).click();
    await expect(page).toHaveURL(new RegExp(`/log/${isoFromToday(-1)}/?$`));
    await expect(page.getByText("Yesterday", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Next day" }).click();
    await expect(page).toHaveURL(new RegExp(`/log/${today}/?$`));
    await page.goto("/log/not-a-day");
    await expect(page.getByText(/isn.t a day the log understands/)).toBeVisible();
  });
});

test.describe("Log — automatic digest", () => {
  test("creating an order today shows up as a line on today's log, linking back to the order", async ({ page }) => {
    await page.goto("/orders?tab=orders");
    await page.getByRole("button", { name: "Add order" }).click();
    await page.getByLabel("Order title").fill("Log digest popup");
    await page.getByLabel("Event date").fill(isoFromToday(40));
    await page.getByRole("button", { name: "Create Order" }).click();
    await expect(page).toHaveURL(/\/orders\/[^/?]+\/?$/);

    await page.goto(`/log/${isoFromToday(0)}`);
    const digest = page.locator('[data-testid="digest-list"]');
    await expect(digest.getByRole("link", { name: /New order: Log digest popup/ })).toBeVisible();
    await expect(digest.getByText("Orders", { exact: true })).toBeVisible();
    // Sidebar tally
    await expect(page.getByText("Activity")).toBeVisible();
    // The line links back to the order
    await digest.getByRole("link", { name: /New order: Log digest popup/ }).click();
    await expect(page).toHaveURL(/\/orders\/[^/?]+\/?$/);
    // The future event day is not listed — the Log only shows days that have happened
    await page.goto("/log");
    await expect(logRows(page)).toHaveCount(1);
    await expect(logRows(page).first()).toContainText("Today");
    await expect(logRows(page).first()).toContainText("New order: Log digest popup");
    // …and from today there is no "next day" to step into
    await page.goto(`/log/${isoFromToday(0)}`);
    await expect(page.getByRole("link", { name: "Previous day" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Next day" })).toHaveCount(0);
  });

  test("list view is a table grouped by month with the activity headline and note", async ({ page }) => {
    await page.goto(`/log/${isoFromToday(0)}`);
    await page.getByLabel("New note").fill("First card note");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.locator('[data-testid="log-note"]')).toHaveCount(1);

    await page.goto("/log");
    const row = logRows(page).first();
    await expect(row).toContainText("First card note");
    await expect(row).toContainText("1 note");
    // Month group header (e.g. "September 2026") is a collapsible button
    const header = page.getByRole("button", { name: /(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}/ }).first();
    await expect(header).toBeVisible();
    await header.click();
    await expect(logRows(page)).toHaveCount(0);
    await header.click();
    await expect(logRows(page)).toHaveCount(1);
    // Search narrows to matching notes
    await page.getByLabel("Search log").fill("zzz-no-match");
    await expect(page.getByText("No days match your search or filters.")).toBeVisible();
    await page.getByLabel("Search log").fill("first card");
    await expect(logRows(page)).toHaveCount(1);
    // Clicking the row opens the day
    await logRows(page).first().click();
    await expect(page).toHaveURL(new RegExp(`/log/${isoFromToday(0)}/?$`));
  });
});

test.describe("Log — calendar view", () => {
  test("a day with a note shows a marker; clicking it opens the day; month navigation works", async ({ page }) => {
    // Put the note on the 1st of the current month: always inside the visible
    // grid, and never in the future (the calendar hides markers on future days).
    const now = new Date();
    const iso = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
    await page.goto(`/log/${iso}`);
    await page.getByLabel("New note").fill("Calendar marker note");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.locator('[data-testid="log-note"]')).toHaveCount(1);

    await page.goto("/log");
    await page.getByRole("button", { name: "Calendar" }).click();
    const marker = page.getByRole("link", { name: /Log for .*1 note/ });
    await expect(marker).toBeVisible();
    await page.getByRole("button", { name: "Next month" }).click();
    await expect(marker).not.toBeVisible();
    await page.getByRole("button", { name: "Today", exact: true }).click();
    await expect(marker).toBeVisible();
    await marker.click();
    await expect(page).toHaveURL(new RegExp(`/log/${iso}/?$`));
    // View preference persists within the session
    await page.goto("/log");
    await expect(page.getByRole("button", { name: "Calendar" })).toHaveAttribute("aria-pressed", "true");
  });
});

test.describe("Log — Today dashboard tile", () => {
  test("quick note from the tile lands on today's log", async ({ page }) => {
    await page.goto("/today");
    const tile = page.locator('[data-testid="log-tile"]');
    await expect(tile).toBeVisible();
    await expect(tile).toContainText("Nothing recorded yet today");
    await tile.getByLabel("New note").fill("Dashboard quick note");
    await tile.getByRole("button", { name: "Add note" }).click();
    await expect(tile).toContainText("1 note");
    await tile.getByRole("link", { name: /Open today.s log/ }).click();
    await expect(page).toHaveURL(new RegExp(`/log/${isoFromToday(0)}/?$`));
    await expect(page.locator('[data-testid="log-note"] textarea')).toHaveValue("Dashboard quick note");
  });
});
