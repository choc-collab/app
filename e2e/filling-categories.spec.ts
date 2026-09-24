import { test, expect } from "./fixtures";

/**
 * Filling categories — tab strip on /fillings + categories CRUD coverage.
 *
 * Note: ensureDefaultFillingCategories() runs on every page load via the seed
 * loader, so each fresh test context already has the 5 seeded categories.
 */

test.describe("Fillings — Tabs", () => {
  test("shows 2 tabs: Fillings, Categories", async ({ page }) => {
    await page.goto("/fillings");
    await expect(page.getByRole("heading", { name: "Fillings" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Fillings$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Categories$/ })).toBeVisible();
  });

  test("Fillings tab is active by default", async ({ page }) => {
    await page.goto("/fillings");
    await expect(page.getByRole("button", { name: /Add filling$/i })).toBeVisible();
  });

  test("switching to Categories tab shows seeded categories", async ({ page }) => {
    await page.goto("/fillings");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    await expect(page.getByText("Ganaches (Emulsions)")).toBeVisible();
    await expect(page.getByText("Pralines & Giandujas (Nut-Based)")).toBeVisible();
    await expect(page.getByText("Fruit-Based (Pectins & Acids)")).toBeVisible();
  });

  test("seeded shelf-stable categories are flagged", async ({ page }) => {
    await page.goto("/fillings");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    const table = page.getByRole("table", { name: "Filling categories" });
    const shelfStableCells = table.getByText("Yes", { exact: true });
    // Auto-retry: seed loader inserts categories async — Pralines may arrive
    // before Fruit-Based. `toHaveCount` polls until the DOM settles.
    await expect(shelfStableCells).toHaveCount(2);
  });
});

test.describe("Fillings — Categories CRUD", () => {
  test("creates a new category and lands on detail page", async ({ page }) => {
    await page.goto("/fillings");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    await page.getByRole("button", { name: /Add filling category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Marmalades");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/fillings\/categories\/.+/);
  });

  test("created category appears in the list", async ({ page }) => {
    await page.goto("/fillings");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    await page.getByRole("button", { name: /Add filling category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Spiced Pastes");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/fillings\/categories\/.+/);

    await page.goto("/fillings");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    await expect(page.getByText("Spiced Pastes")).toBeVisible();
  });

  test("toggling shelf-stable on a category persists across reload", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/fillings");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    await page.getByRole("button", { name: /Add filling category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Confits");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/fillings\/categories\/.+/);

    // Click the shelf-stable checkbox on the detail page (the label is "Treat as shelf-stable").
    // Use click() rather than check() because the controlled-checkbox state updates via a live
    // Dexie query, which Playwright's check() can race with.
    const cb = page.getByLabel(/Treat as shelf-stable/i);
    await cb.click();

    // Badge should appear on the detail page header once the live query refreshes
    await expect(page.getByText("Shelf-stable", { exact: true })).toBeVisible({ timeout: 10000 });

    // Persist across a hard reload
    await page.reload();
    await expect(page.getByText("Shelf-stable", { exact: true })).toBeVisible();
  });

  test("list renders as a table with column headers", async ({ page }) => {
    await page.goto("/fillings");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    const table = page.getByRole("table", { name: "Filling categories" });
    await expect(table).toBeVisible();
    for (const header of ["Category", "Shelf-stable", "Colour", "Fillings", "Updated"]) {
      await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
    }
    await expect(page.getByText("Ganaches (Emulsions)")).toBeVisible();

    await page.getByText("Ganaches (Emulsions)").click();
    await expect(page).toHaveURL(/\/fillings\/categories\/.+/);
  });

  test("cancel add form hides without creating", async ({ page }) => {
    await page.goto("/fillings");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    await page.getByRole("button", { name: /Add filling category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Should Not Exist");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByPlaceholder(/Category name/)).not.toBeVisible();
    await expect(page.getByText("Should Not Exist")).not.toBeVisible();
  });

  test("deletes an unused category from the detail page", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/fillings");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    await page.getByRole("button", { name: /Add filling category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Delete Me Cat");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/fillings\/categories\/.+/);

    await page.getByRole("button", { name: /Delete category/i }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();

    await expect(page).toHaveURL(/\/fillings\/?(\?tab=categories)?$/);
  });
});

/**
 * Duplicate categories — issue #171.
 *
 * Before v0.9.2, seeding could run before the initial cloud sync and insert a
 * second full set of the defaults. The in-use guard counts fillings by category
 * NAME, which every copy shares, so the duplicates were permanently undeletable.
 *
 * Rows go in through raw IDB (the shop-fixtures pattern) because the race that
 * creates duplicates can't be reproduced through the UI, and because the whole
 * point is a state the app will not produce on its own. Raw `put` skips Dexie's
 * `creating` hook, so every row carries an explicit id.
 */
test.describe("Fillings — duplicate categories", () => {
  const CATEGORY = "Ganaches (Emulsions)";

  async function openCategoriesTab(page: import("@playwright/test").Page) {
    await page.goto("/fillings");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    // The seed loader inserts the defaults asynchronously.
    await expect(page.getByText(CATEGORY)).toBeVisible();
    await page.waitForLoadState("networkidle");
  }

  /** Write rows straight into IndexedDB. Returns once the transaction commits. */
  async function putRows(
    page: import("@playwright/test").Page,
    rows: { store: string; row: Record<string, unknown> }[],
  ) {
    await page.evaluate((rows) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("ChocolatierDB");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const stores = [...new Set(rows.map((r) => r.store))];
          const tx = db.transaction(stores, "readwrite");
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
          for (const { store, row } of rows) {
            tx.objectStore(store).put({ ...row, createdAt: new Date(), updatedAt: new Date() });
          }
        };
      });
    }, rows);
  }

  /** Ids of every category row carrying this exact name. */
  async function categoryIdsNamed(page: import("@playwright/test").Page, name: string): Promise<string[]> {
    return page.evaluate((name) => {
      return new Promise<string[]>((resolve, reject) => {
        const req = indexedDB.open("ChocolatierDB");
        req.onerror = () => reject(req.error);
        req.onsuccess = () => {
          const db = req.result;
          const store = db.transaction("fillingCategories", "readonly").objectStore("fillingCategories");
          const all = store.getAll();
          all.onerror = () => reject(all.error);
          all.onsuccess = () => {
            db.close();
            resolve((all.result as { id: string; name: string }[])
              .filter((c) => c.name === name)
              .map((c) => c.id));
          };
        };
      });
    }, name);
  }

  test("a category that is the only holder of its name still cannot be deleted while in use", async ({ page }) => {
    test.setTimeout(60000);
    await openCategoriesTab(page);
    await putRows(page, [
      { store: "fillings", row: { id: "dup-fill-1", name: "Test Ganache", category: CATEGORY } },
    ]);

    const [onlyId] = await categoryIdsNamed(page, CATEGORY);
    await page.goto(`/fillings/categories/${onlyId}`);

    await expect(page.getByRole("button", { name: /Archive category/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Delete category/i })).toHaveCount(0);
  });

  test("a duplicate of an in-use category can be deleted, and the original survives", async ({ page }) => {
    test.setTimeout(60000);
    await openCategoriesTab(page);
    await putRows(page, [
      { store: "fillings", row: { id: "dup-fill-1", name: "Test Ganache", category: CATEGORY } },
      { store: "fillingCategories", row: { id: "dup-cat-1", name: CATEGORY, shelfStable: false, color: "#0072B2" } },
    ]);

    await page.goto("/fillings/categories/dup-cat-1");

    // Delete is offered even though a filling references the name, because the
    // other copy goes on answering to it.
    await page.getByRole("button", { name: /Delete category/i }).click();
    await expect(page.getByText(/2 copies of this category share the name/)).toBeVisible();
    await page.getByRole("button", { name: "Yes, delete" }).click();
    await expect(page).toHaveURL(/\/fillings\/?(\?tab=categories)?$/);

    // Exactly one row keeps the name, and it is not the one we deleted.
    const remaining = await categoryIdsNamed(page, CATEGORY);
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).not.toBe("dup-cat-1");
  });
});
