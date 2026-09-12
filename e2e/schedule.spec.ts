import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

// ─── Schedule — the one calendar overlaying Orders, production phase dates,
// and prep tasks ──────────────────────────────────────────────────────────
// Covers: nav entry → order chip on the calendar → filter panel toggling a
// type → a plan's phase date showing up and linking back → adding/checking/
// removing a prep task → the Today "Scheduled today" tile.

/** Local ISO date `days` from today. */
function isoFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}
function isoToday(): string {
  return isoFromToday(0);
}

async function createOrder(page: Page, title: string, date: string) {
  await page.goto("/orders?tab=orders");
  await page.getByRole("button", { name: "Add order" }).click();
  await page.getByLabel("Order title").fill(title);
  await page.getByLabel("Event date").fill(date);
  await page.getByRole("button", { name: "Create Order" }).click();
  await expect(page).toHaveURL(/\/orders\/[^/?]+\/?$/);
}

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

/** Fillings-only plans need no product/mould setup, so they're the fastest
 *  path to a real draft plan with a phase tab to schedule. */
async function createFillingsOnlyPlan(page: Page, fillingName: string) {
  await page.goto("/production/new?mode=fillings-only");
  await page.getByRole("button", { name: /Add filling/ }).click();
  await page.getByPlaceholder("Search fillings…").fill(fillingName);
  await page.getByRole("button", { name: new RegExp(fillingName) }).click();
  await page.getByRole("button", { name: /Create plan/ }).click();
  // Not just /production/.+ — that still matches the wizard's own
  // /production/new, so callers could act before the detail page lands.
  await expect(page).toHaveURL(/\/production\/(?!new)[^/?]+/, { timeout: 30_000 });
  await expect(page.getByRole("button", { name: /^Fillings/ })).toBeVisible();
}

test.describe("Schedule — nav and calendar overlay", () => {
  test("Schedule nav entry opens /schedule", async ({ page }) => {
    await page.goto("/today");
    await page.locator("nav").getByRole("link", { name: "Schedule", exact: true }).click();
    await expect(page).toHaveURL(/\/schedule\/?$/);
  });

  test("an order shows as a chip on its day, and the filter panel can hide/show it", async ({ page }) => {
    const today = isoToday();
    await createOrder(page, "Autumn Market", today);

    await page.goto("/schedule");
    // Both the calendar chip and the day-agenda row link to the order —
    // `.first()` picks whichever renders first; either is fine to assert on.
    const chip = page.getByRole("link", { name: /Autumn Market/ }).first();
    await expect(chip).toBeVisible();

    const ordersFilter = page.getByRole("button", { name: /^Orders \(/ });
    await ordersFilter.click();
    await expect(chip).not.toBeVisible();
    await ordersFilter.click();
    await expect(chip).toBeVisible();
  });

  test("Month/Week/Day toggle switches which calendar layout is shown", async ({ page }) => {
    await page.goto("/schedule");
    const viewGroup = page.getByRole("group", { name: "Schedule view" });
    await expect(page.getByRole("button", { name: "Previous month" })).toBeVisible();

    await viewGroup.getByRole("button", { name: "Week", exact: true }).click();
    await expect(page.getByRole("button", { name: "Previous week" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous month" })).toHaveCount(0);

    await viewGroup.getByRole("button", { name: "Day", exact: true }).click();
    await expect(page.getByRole("button", { name: "Previous day" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Previous week" })).toHaveCount(0);

    await viewGroup.getByRole("button", { name: "Month", exact: true }).click();
    await expect(page.getByRole("button", { name: "Previous month" })).toBeVisible();
  });

  test("an order created today shows on the Day view for today", async ({ page }) => {
    const today = isoToday();
    await createOrder(page, "Popup for today", today);

    await page.goto("/schedule");
    await page.getByRole("group", { name: "Schedule view" }).getByRole("button", { name: "Day", exact: true }).click();
    await expect(page.getByRole("link", { name: /Popup for today/ })).toBeVisible();
  });
});

test.describe("Schedule — production phase dates", () => {
  test("a new plan's phase defaults to today, shows on the calendar without any manual date entry, and links back to that plan", async ({ page }) => {
    test.setTimeout(90_000);
    const today = isoToday();
    await createIngredient(page, "Sugar");
    await createFilling(page, "Salted caramel", "Sugar");
    await createFillingsOnlyPlan(page, "Salted caramel");

    // Defaulted, not left blank — this is the whole point of the default.
    await expect(page.getByLabel("Scheduled for")).toHaveValue(today);

    await page.goto("/schedule");
    const chip = page.getByRole("link", { name: /Fillings/ }).first();
    await expect(chip).toBeVisible();
    await chip.click();
    await expect(page).toHaveURL(/\/production\/.+/);
  });

  test("revisiting a plan doesn't duplicate its phase chips on the calendar", async ({ page }) => {
    test.setTimeout(90_000);
    await createIngredient(page, "Sugar");
    await createFilling(page, "Salted caramel", "Sugar");
    await createFillingsOnlyPlan(page, "Salted caramel");

    // Each visit re-runs the phase-date defaulting; it used to add another row
    // every time, because an unresolved live query reads as "no rows yet".
    for (let i = 0; i < 3; i++) {
      await page.reload();
      await expect(page.getByLabel("Scheduled for")).toHaveValue(isoToday());
    }

    await page.goto("/schedule");
    await page.getByRole("group", { name: "Schedule view" }).getByRole("button", { name: "Week", exact: true }).click();
    // Scoped to today's column — the agenda panel lists the same item again.
    await expect(page.locator(`[data-date="${isoToday()}"]`).getByRole("link", { name: /Fillings/ })).toHaveCount(1);
  });

  test("moving a phase's date off today updates where it shows on the calendar", async ({ page }) => {
    test.setTimeout(90_000);
    await createIngredient(page, "Cream");
    await createFilling(page, "Dark ganache", "Cream");
    await createFillingsOnlyPlan(page, "Dark ganache");

    const nextWeek = isoFromToday(7);
    await page.getByLabel("Scheduled for").fill(nextWeek);
    await expect(page.getByLabel("Scheduled for")).toHaveValue(nextWeek);

    // Today's cell no longer carries it once moved.
    await page.goto("/schedule");
    await expect(page.locator(`[data-date="${isoToday()}"]`).getByRole("link", { name: /Fillings/ })).toHaveCount(0);
  });
});

/** A moulded product is what produces the full shell → cap → unmould chain;
 *  fillings-only plans collapse to a single phase. */
async function createMouldedPlan(page: Page) {
  await createIngredient(page, "Hazelnuts");
  await createFilling(page, "Praline", "Hazelnuts");

  await page.goto("/products");
  await page.getByRole("button", { name: "Add new product" }).click();
  await page.getByRole("textbox", { name: "Product name" }).fill("Praline bonbon");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/products\/.+/);
  await page.getByRole("button", { name: "Add filling" }).click();
  await page.getByPlaceholder("Search fillings to assign...").fill("Praline");
  await page.getByRole("button", { name: "Praline" }).click();

  await page.goto("/moulds");
  await page.getByRole("button", { name: "Add mould" }).click();
  await page.getByPlaceholder("Mould name *").fill("Sphere 15");
  await page.getByRole("button", { name: "Create Mould" }).click();
  await expect(page).toHaveURL(/\/moulds\/.+/);
  await page.getByLabel("Cavity weight").fill("10");
  await page.getByLabel("Cavity weight").blur();
  await page.getByLabel("Number of cavities").fill("15");
  await page.getByLabel("Number of cavities").blur();

  await page.goto("/production/new?mode=full");
  await page.getByText("Praline bonbon").click();
  await page.getByRole("button", { name: /Continue.*selected/ }).click();
  const mouldValue = await page.locator("select.input option", { hasText: "Sphere 15" }).getAttribute("value");
  await page.locator("select.input").selectOption(mouldValue!);
  // The wizard only inserts a batch-sizes step when a shelf-stable filling
  // is involved, so this one is conditional.
  const continueBtn = page.getByRole("button", { name: /^Continue/ });
  const hasBatchSizesStep = await continueBtn.first()
    .waitFor({ state: "visible", timeout: 3_000 }).then(() => true).catch(() => false);
  if (hasBatchSizesStep) await continueBtn.first().click();
  await page.getByRole("button", { name: /Create plan/ }).click();
  await expect(page).toHaveURL(/\/production\/(?!new)[^/?]+/, { timeout: 30_000 });
}

test.describe("Schedule — phases run in sequence", () => {
  test("moving a phase carries the later ones with it, and nothing can be scheduled before what precedes it", async ({ page }) => {
    test.setTimeout(150_000);
    await createMouldedPlan(page);

    // Everything starts on today; push filling out by three days.
    await page.getByRole("button", { name: /^Fill\b/ }).click();
    const fillDate = page.getByLabel("Scheduled for", { exact: true });
    await expect(fillDate).toHaveValue(isoToday());
    await fillDate.fill(isoFromToday(3));

    // Unmoulding happens after filling, so it moved along with it.
    await page.getByRole("button", { name: /^Unmould/ }).click();
    const unmouldDate = page.getByLabel("Scheduled for", { exact: true });
    await expect(unmouldDate).toHaveValue(isoFromToday(3));

    // …and it can't be dragged back before capping.
    await unmouldDate.fill(isoToday());
    await expect(page.getByText(/can't come before it/)).toBeVisible();
    await expect(unmouldDate).toHaveValue(isoFromToday(3));
  });
});

/** Rewrite a plan's rows for `phase` to look like the pre-coating build wrote
 *  them: no `coating` at all. Raw IndexedDB, since no current code path can
 *  produce that shape any more — it only exists in workshops that upgraded
 *  through the earlier builds. */
async function stripCoatingFromPhase(page: Page, phase: string) {
  await page.evaluate(async (targetPhase) => {
    const req = indexedDB.open("ChocolatierDB");
    const db: IDBDatabase = await new Promise((res, rej) => {
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    const rows: { id: string; phase: string; coating?: string }[] = await new Promise((res, rej) => {
      const tx = db.transaction("planPhaseDates", "readonly");
      const all = tx.objectStore("planPhaseDates").getAll();
      all.onsuccess = () => res(all.result);
      all.onerror = () => rej(all.error);
    });
    await new Promise<void>((res, rej) => {
      const tx = db.transaction("planPhaseDates", "readwrite");
      const store = tx.objectStore("planPhaseDates");
      for (const row of rows) {
        if (row.phase !== targetPhase) continue;
        delete row.coating;
        store.put(row);
      }
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  }, phase);
}

test.describe("Schedule — finished work", () => {
  test("completing a phase's steps greys it out on the calendar and sinks it below what's left", async ({ page }) => {
    test.setTimeout(150_000);
    await createMouldedPlan(page);

    await page.getByRole("button", { name: /^Shell/ }).click();
    await page.getByRole("button", { name: "Mark all done" }).click();

    // Week view: a full batch puts six phases on one day, past Month's
    // three-chip cap.
    await page.goto("/schedule");
    await page.getByRole("group", { name: "Schedule view" }).getByRole("button", { name: "Week", exact: true }).click();
    const todayCell = page.locator(`[data-date="${isoToday()}"]`);
    await expect(todayCell.getByText(/^Shell/)).toHaveClass(/line-through/);
    // Untouched phases stay live.
    await expect(todayCell.getByText(/^Fill ·/)).not.toHaveClass(/line-through/);
    // …and the finished one is last in the day.
    const chips = await todayCell.getByText(/· \d+ batch/).allTextContents();
    expect(chips[chips.length - 1]).toMatch(/^Shell/);
  });

  test("a done prep task greys out and sinks too", async ({ page }) => {
    await page.goto("/schedule");
    await page.locator(`[data-date="${isoToday()}"]`).click();
    await page.getByLabel("New task title").fill("Assemble market boxes");
    await page.getByRole("button", { name: "Add task" }).click();
    await page.getByLabel("New task title").fill("Print allergen labels");
    await page.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText("Print allergen labels").first()).toBeVisible();

    // "Assemble" sorts first alphabetically; ticking it should drop it last.
    await page.getByLabel('Mark "Assemble market boxes" done').click();
    await expect(page.getByText("Assemble market boxes").first()).toHaveClass(/line-through/);
    const todayCell = page.locator(`[data-date="${isoToday()}"]`);
    const chips = await todayCell.getByText(/labels|boxes/).allTextContents();
    expect(chips[chips.length - 1]).toBe("Assemble market boxes");
  });
});

test.describe("Schedule — upgrading data written before shell/cap split by chocolate type", () => {
  test("a coating-less cap row hands its date to the real one instead of stranding a chip", async ({ page }) => {
    test.setTimeout(150_000);
    await createMouldedPlan(page);
    const planUrl = page.url();

    // Push the chain out so capping sits on a distinctive day, not today.
    await page.getByRole("button", { name: /^Fill\b/ }).click();
    await page.getByLabel("Scheduled for", { exact: true }).fill(isoFromToday(6));
    await expect(page.getByLabel("Scheduled for", { exact: true })).toHaveValue(isoFromToday(6));

    await stripCoatingFromPhase(page, "cap");
    await page.goto(planUrl);
    await expect(page.getByLabel(/^Scheduled for/).first()).toBeVisible();

    await page.goto("/schedule");
    // One chip, on the day the legacy row held — not stranded there *and*
    // re-seeded onto today.
    await expect(page.locator(`[data-date="${isoFromToday(6)}"]`).getByText(/^Cap/)).toHaveCount(1);
    await expect(page.locator(`[data-date="${isoToday()}"]`).getByText(/^Cap/)).toHaveCount(0);
  });
});

test.describe("Schedule — shelling and capping per chocolate type", () => {
  test("Shell schedules per chocolate type, and the calendar pools each task across batches", async ({ page }) => {
    test.setTimeout(150_000);
    await createMouldedPlan(page);

    // Shell tab: the date field lives inside each chocolate-type section, and
    // defaults to today like every other phase.
    await page.getByRole("button", { name: /^Shell/ }).click();
    const shellDate = page.getByLabel(/^Scheduled for /);
    await expect(shellDate.first()).toHaveValue(isoToday());

    // Moving the dark shelling to another day leaves the rest where they are.
    const nextWeek = isoFromToday(7);
    await shellDate.first().fill(nextWeek);
    await expect(shellDate.first()).toHaveValue(nextWeek);

    // Month view shows both today and the moved-to day in one grid.
    await page.goto("/schedule");
    await expect(page.locator(`[data-date="${isoToday()}"]`).getByText(/^Shell/)).toHaveCount(0);
    const movedDay = page.locator(`[data-date="${nextWeek}"]`);
    await expect(movedDay.getByText(/^Shell · /)).toBeVisible();
    // Chips are one per task, counted in batches rather than repeated per batch.
    await expect(movedDay.getByText(/· 1 batch/).first()).toBeVisible();
  });
});

test.describe("Schedule — prep tasks", () => {
  test("adding a task on a day shows it there and on the Today tile", async ({ page }) => {
    const today = isoToday();
    await page.goto("/schedule");
    await page.locator(`[data-date="${today}"]`).click();
    await page.getByLabel("New task title").fill("Print allergen labels");
    await page.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText("Print allergen labels").first()).toBeVisible();

    await page.goto("/today");
    await expect(page.getByText("Scheduled today")).toBeVisible();
    await expect(page.getByRole("link", { name: /Print allergen labels/ })).toBeVisible();
  });

  test("checking a task strikes it through; two-step delete removes it", async ({ page }) => {
    const today = isoToday();
    await page.goto("/schedule");
    await page.locator(`[data-date="${today}"]`).click();
    await page.getByLabel("New task title").fill("Assemble market boxes");
    await page.getByRole("button", { name: "Add task" }).click();
    await expect(page.getByText("Assemble market boxes").first()).toBeVisible();

    // A plain click rather than `.check()` — the checkbox is controlled by
    // the live-query result, so it only flips once the async write resolves
    // and re-renders; `.check()`'s built-in post-click assertion is too eager.
    await page.getByLabel('Mark "Assemble market boxes" done').click();
    await expect(page.getByText("Assemble market boxes").first()).toHaveClass(/line-through/);

    await page.getByLabel('Remove "Assemble market boxes"').click();
    await expect(page.getByText("Remove?")).toBeVisible();
    await page.getByRole("button", { name: "Yes" }).click();
    await expect(page.getByText("Assemble market boxes")).toHaveCount(0);
  });
});
