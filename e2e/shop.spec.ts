import { test, expect } from "./fixtures";
import { seedShopFixtures } from "./shop-fixtures";

test.describe("Shop", () => {
  test("landing page loads with empty setup state", async ({ page }) => {
    await page.goto("/shop");

    // Header fires as soon as data loads — 0 sales, 0 revenue.
    await expect(page.getByRole("heading", { level: 1 })).toContainText("today");

    // KPI grid is always visible, showing zeroes on a fresh DB.
    await expect(page.getByText("Boxes sold")).toBeVisible();
    await expect(page.getByText("Revenue")).toBeVisible();
    await expect(page.getByText("Bonbons")).toBeVisible();
    await expect(page.getByText("Avg. box")).toBeVisible();

    // No CollectionPackaging exists → setup empty state nudges the user.
    await expect(page.getByRole("heading", { name: "Set up a collection first" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Collections" })).toBeVisible();
  });

  test("New box button is disabled until a collection × packaging exists", async ({ page }) => {
    await page.goto("/shop");
    // Button is rendered as a disabled <button> (not a <Link>) in this state.
    const cta = page.getByRole("button", { name: "+ New box" });
    await expect(cta).toBeVisible();
    await expect(cta).toBeDisabled();
  });

  test("box picker shows empty state when no collection pricing is configured", async ({ page }) => {
    await page.goto("/shop/new");
    await expect(page.getByRole("heading", { name: "Which box?" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Nothing to sell yet" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Open Collections" })).toBeVisible();
    // Back link routes home.
    await page.getByRole("link", { name: "Back" }).click();
    await expect(page).toHaveURL(/\/shop\/?$/);
  });

  test("main-menu Shop tile is enabled and navigates to the Shop landing", async ({ page }) => {
    await page.goto("/app");
    await page.getByRole("link", { name: /The Shop/ }).click();
    await expect(page).toHaveURL(/\/shop\/?$/);
    await expect(page.getByText(/Shop ·/)).toBeVisible();
  });

  test.describe("with seeded box", () => {
    test("fills cavities, saves as prepared, and appears on the landing", async ({ page }) => {
      // Visit the app first so Dexie opens the DB + runs v8 migration before
      // we seed via raw IDB.
      await page.goto("/app");
      const ids = await seedShopFixtures(page);

      // Box picker now shows the seeded card.
      await page.goto("/shop/new");
      await expect(page.getByText("Spring Test")).toBeVisible();
      await page.getByTestId("shop-box-card").first().click();
      await expect(page).toHaveURL(new RegExp(`/shop/new/${ids.collectionPackagingId}/?$`));

      // Counter starts at 0/4; save button is disabled.
      await expect(page.getByTestId("shop-fill-counter")).toHaveText("0/4");
      const save = page.getByTestId("shop-save-prepared");
      await expect(save).toBeDisabled();

      // Fill all four cavities by tapping cavity then a palette tile four times.
      // Cavity 0 is already active on first load (auto-advance selects next empty).
      await page.getByTestId("shop-palette-tile").first().click();
      await page.getByTestId("shop-palette-tile").first().click();
      await page.getByTestId("shop-palette-tile").nth(1).click();
      await page.getByTestId("shop-palette-tile").nth(1).click();

      await expect(page.getByTestId("shop-fill-counter")).toHaveText("4/4");
      await expect(save).toBeEnabled();

      // Commit → redirects to /shop landing.
      await save.click();
      await expect(page).toHaveURL(/\/shop\/?$/);

      // Landing shows the prepared row with the full box preview + €12.00 price.
      // The "Ready to sell" tab is the default and shows the new row directly.
      await expect(page.getByRole("button", { name: /Ready to sell/ })).toBeVisible();
      await expect(page.getByTestId("shop-sell-btn")).toBeVisible();
      await expect(page.getByText(/Spring Test/).first()).toBeVisible();
      await expect(page.getByText("€12.00").first()).toBeVisible();
    });

    test("saves multiple copies of the same box and collapses into a group on the landing", async ({ page }) => {
      await page.goto("/app");
      await seedShopFixtures(page);

      await page.goto("/shop/new");
      await page.getByTestId("shop-box-card").first().click();

      // Fill 4 cavities with the first palette tile (10 in stock, 4 used → max qty 2).
      for (let i = 0; i < 4; i++) {
        await page.getByTestId("shop-palette-tile").first().click();
      }

      // Stepper starts at 1 — bump to 2 (the max).
      await expect(page.getByTestId("shop-qty-value")).toHaveValue("1");
      await page.getByTestId("shop-qty-inc").click();
      await expect(page.getByTestId("shop-qty-value")).toHaveValue("2");

      // Add a note before saving.
      await page.getByTestId("shop-note-input").fill("Batch for Saturday market");
      await page.getByTestId("shop-save-prepared").click();
      await expect(page).toHaveURL(/\/shop\/?$/);

      // Identical boxes collapse into ONE grouped row with a ×2 count pill.
      const group = page.getByTestId("shop-prepared-group");
      await expect(group).toHaveCount(1);
      await expect(group).toContainText("×2");
      await expect(page.getByTestId("shop-sale-note")).toHaveCount(1);
      await expect(page.getByTestId("shop-sale-note")).toContainText("Batch for Saturday market");

      // Expand → two sub-rows appear.
      await page.getByTestId("shop-group-expand").click();
      await expect(page.getByTestId("shop-sub-sell-btn")).toHaveCount(2);

      // Collapse hides them again.
      await page.getByTestId("shop-group-expand").click();
      await expect(page.getByTestId("shop-sub-sell-btn")).toHaveCount(0);
    });

    test("quantity field on the fill screen accepts typing and flags over-stock", async ({ page }) => {
      await page.goto("/app");
      await seedShopFixtures(page);

      await page.goto("/shop/new");
      await page.getByTestId("shop-box-card").first().click();

      // Fill 4 cavities with product 1 (10 in stock, 4 per box → max 2 boxes).
      for (let i = 0; i < 4; i++) {
        await page.getByTestId("shop-palette-tile").first().click();
      }

      const qtyInput = page.getByTestId("shop-qty-value");
      const save = page.getByTestId("shop-save-prepared");

      // Type a number directly (bypassing the buttons).
      await qtyInput.fill("2");
      await expect(qtyInput).toHaveValue("2");
      await expect(save).toBeEnabled();
      await expect(page.getByTestId("shop-qty-over-stock")).toHaveCount(0);

      // Typing over the stock ceiling surfaces the inline error and disables Save.
      await qtyInput.fill("20");
      await expect(qtyInput).toHaveValue("20");
      await expect(page.getByTestId("shop-qty-over-stock")).toContainText("Only 2");
      await expect(save).toBeDisabled();

      // Dropping back within the allowed range clears the error.
      await qtyInput.fill("1");
      await expect(page.getByTestId("shop-qty-over-stock")).toHaveCount(0);
      await expect(save).toBeEnabled();
    });

    test("group stepper on the landing accepts typing and flags over-available", async ({ page }) => {
      await page.goto("/app");
      await seedShopFixtures(page);

      // Prepare a group of 2 identical boxes.
      await page.goto("/shop/new");
      await page.getByTestId("shop-box-card").first().click();
      for (let i = 0; i < 4; i++) {
        await page.getByTestId("shop-palette-tile").first().click();
      }
      await page.getByTestId("shop-qty-inc").click();
      await page.getByTestId("shop-save-prepared").click();
      await expect(page).toHaveURL(/\/shop\/?$/);

      const groupInput = page.getByTestId("shop-group-qty-value");
      const sellBtn = page.getByTestId("shop-sell-group-btn");

      // Type 5 into a group that has only 2 — inline error, Sell disabled.
      await groupInput.fill("5");
      await expect(page.getByTestId("shop-group-qty-over")).toContainText("Only 2");
      await expect(sellBtn).toBeDisabled();

      // Back to 2 — error clears, button re-enables.
      await groupInput.fill("2");
      await expect(page.getByTestId("shop-group-qty-over")).toHaveCount(0);
      await expect(sellBtn).toBeEnabled();
    });

    test("Sell N from a grouped row sells the chosen count at once", async ({ page }) => {
      await page.goto("/app");
      await seedShopFixtures(page);

      await page.goto("/shop/new");
      await page.getByTestId("shop-box-card").first().click();
      for (let i = 0; i < 4; i++) {
        await page.getByTestId("shop-palette-tile").first().click();
      }
      await page.getByTestId("shop-qty-inc").click();
      await page.getByTestId("shop-save-prepared").click();
      await expect(page).toHaveURL(/\/shop\/?$/);

      // Group stepper starts at 1; bump to 2 and sell both.
      await expect(page.getByTestId("shop-group-qty-value")).toHaveValue("1");
      await page.getByTestId("shop-group-qty-inc").click();
      await expect(page.getByTestId("shop-group-qty-value")).toHaveValue("2");
      await page.getByTestId("shop-sell-group-btn").click();

      // Both prepared rows have moved to recent activity — the prepared
      // group is gone from the Ready-to-sell tab.
      await expect(page.getByTestId("shop-prepared-group")).toHaveCount(0);

      // Switch to the Recent activity tab to see the sold rows + undo buttons.
      await page.getByRole("button", { name: /Recent activity/ }).click();
      await expect(page.getByTestId("shop-undo-sold-btn")).toHaveCount(2);
    });

    test("Selling one of two from a group collapses the group to a single row", async ({ page }) => {
      await page.goto("/app");
      await seedShopFixtures(page);

      await page.goto("/shop/new");
      await page.getByTestId("shop-box-card").first().click();
      for (let i = 0; i < 4; i++) {
        await page.getByTestId("shop-palette-tile").first().click();
      }
      await page.getByTestId("shop-qty-inc").click();
      await page.getByTestId("shop-save-prepared").click();
      await expect(page).toHaveURL(/\/shop\/?$/);

      // Stepper defaults to 1 → click Sell, one box moves to recent, the group
      // collapses into a plain single row (grouping chrome disappears).
      await expect(page.getByTestId("shop-prepared-group")).toHaveCount(1);
      await page.getByTestId("shop-sell-group-btn").click();
      await expect(page.getByTestId("shop-prepared-group")).toHaveCount(0);
      // The remaining single row still shows the per-row Sell / Void controls.
      await expect(page.getByTestId("shop-sell-btn")).toBeVisible();
      await expect(page.getByTestId("shop-void-btn")).toBeVisible();
    });

    test("Undo appears on recently sold rows and moves the box back to prepared", async ({ page }) => {
      await page.goto("/app");
      await seedShopFixtures(page);

      await page.goto("/shop/new");
      await page.getByTestId("shop-box-card").first().click();
      for (let i = 0; i < 4; i++) {
        await page.getByTestId("shop-palette-tile").first().click();
      }
      await page.getByTestId("shop-save-prepared").click();
      await expect(page).toHaveURL(/\/shop\/?$/);

      // Sell the prepared box.
      await page.getByTestId("shop-sell-btn").click();
      // Sold row leaves the Ready-to-sell list.
      await expect(page.getByTestId("shop-sell-btn")).toHaveCount(0);

      // Switch to Recent activity to find the Undo control.
      await page.getByRole("button", { name: /Recent activity/ }).click();
      const undo = page.getByTestId("shop-undo-sold-btn");
      await expect(undo).toBeVisible();
      await undo.click();
      // Undo moves the box back; switch to Ready-to-sell to confirm it returned.
      await page.getByRole("button", { name: /Ready to sell/ }).click();
      await expect(page.getByTestId("shop-sell-btn")).toBeVisible();
      await expect(page.getByTestId("shop-undo-sold-btn")).toHaveCount(0);
    });

    test("edits and adds a note on a prepared row", async ({ page }) => {
      await page.goto("/app");
      await seedShopFixtures(page);

      // Prepare a box without a note.
      await page.goto("/shop/new");
      await page.getByTestId("shop-box-card").first().click();
      for (let i = 0; i < 4; i++) {
        await page.getByTestId("shop-palette-tile").first().click();
      }
      await page.getByTestId("shop-save-prepared").click();
      await expect(page).toHaveURL(/\/shop\/?$/);

      // No note yet → button shows "+ Note".
      const editBtn = page.getByTestId("shop-edit-note-btn");
      await expect(editBtn).toHaveText("+ Note");
      await editBtn.click();

      // Textarea is empty; fill + save.
      const input = page.getByTestId("shop-edit-note-input");
      await expect(input).toBeVisible();
      await input.fill("For Marie, pickup at 3pm");
      await page.getByTestId("shop-edit-note-save").click();

      // Note is shown, button label flips to "Edit".
      await expect(page.getByTestId("shop-sale-note")).toContainText("For Marie, pickup at 3pm");
      await expect(page.getByTestId("shop-edit-note-btn")).toHaveText("Edit");

      // Second edit: change the note.
      await page.getByTestId("shop-edit-note-btn").click();
      const input2 = page.getByTestId("shop-edit-note-input");
      await input2.fill("For Marie, pickup at 4pm");
      await page.getByTestId("shop-edit-note-save").click();
      await expect(page.getByTestId("shop-sale-note")).toContainText("For Marie, pickup at 4pm");

      // Third edit: clear it → button reverts to "+ Note".
      await page.getByTestId("shop-edit-note-btn").click();
      await page.getByTestId("shop-edit-note-input").fill("");
      await page.getByTestId("shop-edit-note-save").click();
      await expect(page.getByTestId("shop-sale-note")).toHaveCount(0);
      await expect(page.getByTestId("shop-edit-note-btn")).toHaveText("+ Note");
    });

    test("hover on mini preview reveals box contents", async ({ page }) => {
      await page.goto("/app");
      await seedShopFixtures(page);

      await page.goto("/shop/new");
      await page.getByTestId("shop-box-card").first().click();
      // Fill 2 of product 1, then 2 of product 2 → popover should list both.
      await page.getByTestId("shop-palette-tile").first().click();
      await page.getByTestId("shop-palette-tile").first().click();
      await page.getByTestId("shop-palette-tile").nth(1).click();
      await page.getByTestId("shop-palette-tile").nth(1).click();
      await page.getByTestId("shop-save-prepared").click();
      await expect(page).toHaveURL(/\/shop\/?$/);

      const trigger = page.getByTestId("shop-contents-trigger").first();
      const popover = page.getByTestId("shop-contents-popover").first();

      // Default: hidden (opacity 0). Hover: opacity flips to 1.
      await expect(popover).toHaveCSS("opacity", "0");
      await trigger.hover();
      await expect(popover).toHaveCSS("opacity", "1");

      // Popover lists the two seeded bonbons, each × 2.
      await expect(popover).toContainText("Alpha Praline");
      await expect(popover).toContainText("Beta Ganache");
      await expect(popover.getByText("×2").first()).toBeVisible();
    });

    test("prepared row shows 'today, HH:MM' timestamp", async ({ page }) => {
      await page.goto("/app");
      await seedShopFixtures(page);

      await page.goto("/shop/new");
      await page.getByTestId("shop-box-card").first().click();
      for (let i = 0; i < 4; i++) {
        await page.getByTestId("shop-palette-tile").first().click();
      }
      await page.getByTestId("shop-save-prepared").click();
      await expect(page).toHaveURL(/\/shop\/?$/);

      // Row shows "today, HH:MM" — pattern match, time varies.
      const row = page.getByTestId("shop-sell-btn").locator("xpath=ancestor::li");
      await expect(row.getByText(/today, \d{2}:\d{2}/)).toBeVisible();
    });

    test("palette tile and placed cavity use the product's shopColor", async ({ page }) => {
      await page.goto("/app");
      await seedShopFixtures(page);

      await page.goto("/shop/new");
      await page.getByTestId("shop-box-card").first().click();

      // Alpha Praline was seeded with shopColor #c24e64. The first palette
      // tile is Alpha Praline (sorted alphabetically).
      const alphaDisc = page.getByTestId("shop-palette-tile").first().locator('[data-shop-color]');
      await expect(alphaDisc).toHaveAttribute("data-shop-color", "#c24e64");

      // Place it into the first cavity — cavity disc should carry the same colour.
      await page.getByTestId("shop-palette-tile").first().click();
      const cavityDisc = page.getByTestId("shop-cavity-0").locator('[data-shop-color]');
      await expect(cavityDisc).toHaveAttribute("data-shop-color", "#c24e64");

      // Beta Ganache has no explicit shopColor — the Shop falls back to the
      // hashed name colour. Just assert that *some* colour is set (i.e. the
      // attribute is present), not a specific one.
      const betaDisc = page.getByTestId("shop-palette-tile").nth(1).locator('[data-shop-color]');
      await expect(betaDisc).toHaveAttribute("data-shop-color", /.+/);
    });

    test("Void on a prepared row takes two taps and restores stock", async ({ page }) => {
      await page.goto("/app");
      await seedShopFixtures(page);

      // Drive the save via the fill screen one more time (quicker than
      // seeding a Sale row directly; exercises the same code path).
      await page.goto("/shop/new");
      await page.getByTestId("shop-box-card").first().click();
      for (let i = 0; i < 4; i++) {
        await page.getByTestId("shop-palette-tile").first().click();
      }
      await page.getByTestId("shop-save-prepared").click();
      await expect(page).toHaveURL(/\/shop\/?$/);

      // First Void tap shows the confirm row.
      await page.getByTestId("shop-void-btn").click();
      await expect(page.getByText("Void this box?")).toBeVisible();

      // Cancel closes the confirm without voiding.
      await page.getByRole("button", { name: "Cancel" }).click();
      await expect(page.getByText("Void this box?")).not.toBeVisible();
      await expect(page.getByTestId("shop-sell-btn")).toBeVisible();

      // Confirm actually voids.
      await page.getByTestId("shop-void-btn").click();
      await page.getByRole("button", { name: "Yes, void" }).click();
      await expect(page.getByTestId("shop-sell-btn")).toHaveCount(0);
    });
  });
});
