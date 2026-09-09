import { test, expect } from "./fixtures";

test.describe("Packaging", () => {
  test("shows empty state on fresh database", async ({ page }) => {
    await page.goto("/packaging");
    await expect(page.getByRole("heading", { name: "Packaging" })).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(0);
  });

  test("creates new packaging and lands on detail page", async ({ page }) => {
    await page.goto("/packaging");
    await page.getByRole("button", { name: "Add packaging" }).click();
    await page.getByPlaceholder("Packaging name *").fill("Gift Box 9");
    await page.getByRole("button", { name: "Create Packaging" }).click();
    await expect(page).toHaveURL(/\/packaging\/.+/);
  });

  test("packaging appears in list after creation", async ({ page }) => {
    await page.goto("/packaging");
    await page.getByRole("button", { name: "Add packaging" }).click();
    await page.getByPlaceholder("Packaging name *").fill("Kraft Sleeve");
    await page.getByRole("button", { name: "Create Packaging" }).click();
    await expect(page).toHaveURL(/\/packaging\/.+/);

    await page.goto("/packaging");
    await expect(page.getByText("Kraft Sleeve")).toBeVisible();
  });

  test("search filters packaging by name", async ({ page }) => {
    for (const name of ["White Box 4", "Black Tray 16"]) {
      await page.goto("/packaging");
      await page.getByRole("button", { name: "Add packaging" }).click();
      await page.getByPlaceholder("Packaging name *").fill(name);
      await page.getByRole("button", { name: "Create Packaging" }).click();
      await expect(page).toHaveURL(/\/packaging\/.+/);
    }

    await page.goto("/packaging");
    await page.getByPlaceholder("Search name or manufacturer…").fill("White");
    await expect(page.getByText("White Box 4")).toBeVisible();
    await expect(page.getByText("Black Tray 16")).not.toBeVisible();
  });

  test("list renders as a table with column headers", async ({ page }) => {
    await page.goto("/packaging");
    await page.getByRole("button", { name: "Add packaging" }).click();
    await page.getByPlaceholder("Packaging name *").fill("Truffle Tray 12");
    await page.getByRole("button", { name: "Create Packaging" }).click();
    await expect(page).toHaveURL(/\/packaging\/.+/);

    await page.goto("/packaging");
    const table = page.getByRole("table", { name: "Packaging" });
    await expect(table).toBeVisible();
    for (const header of ["Packaging", "Stock", "Capacity", "Manufacturer", "Price/unit", "Updated"]) {
      await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
    }
    await expect(page.getByText("Truffle Tray 12")).toBeVisible();

    await page.getByText("Truffle Tray 12").click();
    await expect(page).toHaveURL(/\/packaging\/.+/);
  });

  test("cancel add form hides without creating", async ({ page }) => {
    await page.goto("/packaging");
    await page.getByRole("button", { name: "Add packaging" }).click();
    await page.getByPlaceholder("Packaging name *").fill("Should Not Exist");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByPlaceholder("Packaging name *")).not.toBeVisible();
    await expect(page.getByText("Should Not Exist")).not.toBeVisible();
  });
});

/** Create one packaging and land on its detail page. */
async function createPackaging(page: import("@playwright/test").Page, name: string) {
  await page.goto("/packaging");
  await page.getByRole("button", { name: "Add packaging" }).click();
  await page.getByPlaceholder("Packaging name *").fill(name);
  await page.getByRole("button", { name: "Create Packaging" }).click();
  await expect(page).toHaveURL(/\/packaging\/.+/);
}

test.describe("Packaging detail", () => {
  test("autosaves properties and notes with no Save button", async ({ page }) => {
    test.setTimeout(60000);
    await createPackaging(page, "Gift Box 9");

    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);

    await page.getByLabel("Capacity").fill("12");
    await page.getByLabel("Capacity").blur();
    await page.getByLabel("Manufacturer").fill("Keylink");
    await page.getByLabel("Manufacturer").blur();
    await page.getByLabel("Notes", { exact: true }).fill("Natural insert, matte lid");
    await page.getByLabel("Notes", { exact: true }).blur();

    await page.reload();
    await expect(page.getByLabel("Capacity")).toHaveValue("12");
    await expect(page.getByLabel("Manufacturer")).toHaveValue("Keylink");
    await expect(page.getByLabel("Notes", { exact: true })).toHaveValue("Natural insert, matte lid");
  });

  test("bar wrapper kind clamps capacity to 1 and disables the field", async ({ page }) => {
    test.setTimeout(60000);
    await createPackaging(page, "Single Bar Sleeve");

    await page.getByLabel("Capacity").fill("6");
    await page.getByLabel("Capacity").blur();
    await page.getByLabel("Kind").selectOption("bar");

    await expect(page.getByLabel("Capacity")).toHaveValue("1");
    await expect(page.getByLabel("Capacity")).toBeDisabled();

    await page.reload();
    await expect(page.getByLabel("Capacity")).toHaveValue("1");
  });

  test("logs a purchase and surfaces it in the derived card", async ({ page }) => {
    test.setTimeout(60000);
    await createPackaging(page, "Truffle Tray 12");

    await page.getByLabel("Purchase date").fill("2026-03-04");
    await page.getByLabel("Supplier").fill("Verpakkingshuis");
    await page.getByLabel("Quantity").fill("250");
    await page.getByLabel(/^Price per unit/).fill("1.24");
    await page.getByLabel("Order notes").fill("Bulk run");
    await page.getByRole("button", { name: "Log purchase" }).click();

    await expect(page.getByText("Verpakkingshuis")).toBeVisible();
    await expect(page.getByText("Bulk run")).toBeVisible();
    // 250 × 1.24 = 310.00
    await expect(page.getByText("€310.00", { exact: true })).toBeVisible();
    await expect(page.getByText("250 units · €310.00")).toBeVisible();
    await expect(page.getByText("Units ordered")).toBeVisible();
  });

  test("removing a purchase uses two-step inline confirmation", async ({ page }) => {
    test.setTimeout(60000);
    await createPackaging(page, "Kraft Sleeve 6");

    await page.getByLabel("Purchase date").fill("2026-02-01");
    await page.getByLabel("Quantity").fill("100");
    await page.getByLabel(/^Price per unit/).fill("0.50");
    await page.getByRole("button", { name: "Log purchase" }).click();
    await expect(page.getByText("100 units · €50.00")).toBeVisible();

    await page.getByLabel(/Delete 1 Feb 2026 entry/).click();
    // Nothing is destroyed until the second step is taken.
    await expect(page.getByText(/Remove the 1 Feb 2026 order/)).toBeVisible();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByText("100 units · €50.00")).toBeVisible();

    await page.getByLabel(/Delete 1 Feb 2026 entry/).click();
    await page.getByRole("button", { name: "Yes, remove" }).click();
    await expect(page.getByText("100 units · €50.00")).toHaveCount(0);
  });

  test("shows a distinct not-found state for missing packaging, not the loading string", async ({ page }) => {
    await page.goto("/packaging/does-not-exist");
    await expect(page.getByText(/This packaging doesn.t exist\./)).toBeVisible();
    await expect(page.getByText("Loading…")).toHaveCount(0);
  });
  test("clearing manufacturer persists as cleared", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/packaging");
    await page.getByRole("button", { name: "Add packaging" }).click();
    await page.getByPlaceholder("Packaging name *").fill("Clear Box");
    await page.getByRole("button", { name: "Create Packaging" }).click();
    await expect(page).toHaveURL(/\/packaging\/.+/);

    await page.getByLabel("Manufacturer").fill("Keylink");
    await page.getByLabel("Manufacturer").blur();
    await page.reload();
    await expect(page.getByLabel("Manufacturer")).toHaveValue("Keylink");

    await page.getByLabel("Manufacturer").fill("");
    await page.getByLabel("Manufacturer").blur();
    await page.reload();
    await expect(page.getByLabel("Manufacturer")).toHaveValue("");
  });
});

test.describe("Autosave failure feedback", () => {
  test("a failed write raises a destructive toast with a working retry", async ({ page }) => {
    test.setTimeout(90000);

    // Autosaving pages have no Save button to turn red, so a failed write is
    // invisible unless something says so. Force one at the IndexedDB layer and
    // assert the toast appears — and that Retry succeeds once writes work again.
    await page.addInitScript(() => {
      (window as unknown as { __failWrites: boolean }).__failWrites = false;
      const shouldFail = () => (window as unknown as { __failWrites: boolean }).__failWrites;
      const origPut = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function (this: IDBObjectStore, ...args: unknown[]) {
        if (shouldFail()) throw new Error("Simulated write failure");
        return (origPut as (...a: unknown[]) => IDBRequest).apply(this, args);
      } as typeof IDBObjectStore.prototype.put;
      const origCursorUpdate = IDBCursor.prototype.update;
      IDBCursor.prototype.update = function (this: IDBCursor, ...args: unknown[]) {
        if (shouldFail()) throw new Error("Simulated write failure");
        return (origCursorUpdate as (...a: unknown[]) => IDBRequest).apply(this, args);
      } as typeof IDBCursor.prototype.update;
    });

    await createPackaging(page, "Toast Box");

    await page.evaluate(() => { (window as unknown as { __failWrites: boolean }).__failWrites = true; });
    await page.getByLabel("Notes", { exact: true }).fill("This write will fail");
    await page.getByLabel("Notes", { exact: true }).blur();

    await expect(page.getByText("Notes wasn't saved.")).toBeVisible();

    // Let writes through, then retry — the toast clears and the value persists.
    await page.evaluate(() => { (window as unknown as { __failWrites: boolean }).__failWrites = false; });
    await page.getByRole("button", { name: "Retry" }).click();
    await expect(page.getByText("Notes wasn't saved.")).toHaveCount(0);

    await page.reload();
    await expect(page.getByLabel("Notes", { exact: true })).toHaveValue("This write will fail");
  });
});
