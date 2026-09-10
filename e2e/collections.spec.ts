import { test, expect } from "./fixtures";

test.describe("Collections", () => {
  test("shows empty state on fresh database", async ({ page }) => {
    await page.goto("/collections");
    await expect(page.getByRole("heading", { name: "Collections" })).toBeVisible();
    await expect(page.getByText("No collections yet.")).toBeVisible();
  });

  test("creates a new collection and lands on detail page", async ({ page }) => {
    await page.goto("/collections");
    await page.getByRole("button", { name: "Add collection" }).click();
    await page.getByPlaceholder("Collection name *").fill("Christmas 2025");
    await page.getByRole("button", { name: "Create Collection" }).click();
    await expect(page).toHaveURL(/\/collections\/.+/);
  });

  test("collection appears in list after creation", async ({ page }) => {
    await page.goto("/collections");
    await page.getByRole("button", { name: "Add collection" }).click();
    await page.getByPlaceholder("Collection name *").fill("Easter Selection");
    await page.getByRole("button", { name: "Create Collection" }).click();
    await expect(page).toHaveURL(/\/collections\/.+/);

    await page.goto("/collections");
    await expect(page.getByText("Easter Selection")).toBeVisible();
  });

  test("search filters collections by name", async ({ page }) => {
    for (const name of ["Winter Warmers", "Summer Treats"]) {
      await page.goto("/collections");
      await page.getByRole("button", { name: "Add collection" }).click();
      await page.getByPlaceholder("Collection name *").fill(name);
      await page.getByRole("button", { name: "Create Collection" }).click();
      await expect(page).toHaveURL(/\/collections\/.+/);
    }

    await page.goto("/collections");
    await page.getByPlaceholder("Search collections…").fill("Winter");
    await expect(page.getByText("Winter Warmers")).toBeVisible();
    await expect(page.getByText("Summer Treats")).not.toBeVisible();
  });

  test("list renders as a table with column headers", async ({ page }) => {
    await page.goto("/collections");
    await page.getByRole("button", { name: "Add collection" }).click();
    await page.getByPlaceholder("Collection name *").fill("Valentine Box");
    await page.getByRole("button", { name: "Create Collection" }).click();
    await expect(page).toHaveURL(/\/collections\/.+/);

    await page.goto("/collections");
    const table = page.getByRole("table", { name: "Collections" });
    await expect(table).toBeVisible();
    for (const header of ["Collection", "Status", "Date range", "Products", "Description", "Updated"]) {
      await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
    }
    await expect(page.getByText("Valentine Box")).toBeVisible();

    await page.getByText("Valentine Box").click();
    await expect(page).toHaveURL(/\/collections\/.+/);
  });

  test("cancel add form hides without creating", async ({ page }) => {
    await page.goto("/collections");
    await page.getByRole("button", { name: "Add collection" }).click();
    await page.getByPlaceholder("Collection name *").fill("Should Not Exist");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByPlaceholder("Collection name *")).not.toBeVisible();
    await expect(page.getByText("Should Not Exist")).not.toBeVisible();
  });
});

/** Create one collection and land on its detail page. */
async function createCollection(page: import("@playwright/test").Page, name: string) {
  await page.goto("/collections");
  await page.getByRole("button", { name: "Add collection" }).click();
  await page.getByPlaceholder("Collection name *").fill(name);
  await page.getByRole("button", { name: "Create Collection" }).click();
  await expect(page).toHaveURL(/\/collections\/.+/);
}

test.describe("Collection detail", () => {
  test("autosaves description, notes and dates with no Save button", async ({ page }) => {
    test.setTimeout(60000);
    await createCollection(page, "Autumn Box");

    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);

    await page.getByLabel("Description").fill("Nine-piece autumn selection");
    await page.getByLabel("Description").blur();
    await page.getByLabel("Notes", { exact: true }).fill("Reuse last year's inserts");
    await page.getByLabel("Notes", { exact: true }).blur();
    await page.getByLabel("End date", { exact: true }).fill("2026-11-30");

    await page.reload();
    await expect(page.getByLabel("Description")).toHaveValue("Nine-piece autumn selection");
    await expect(page.getByLabel("Notes", { exact: true })).toHaveValue("Reuse last year's inserts");
    await expect(page.getByLabel("End date", { exact: true })).toHaveValue("2026-11-30");
  });

  test("clearing the end date returns the collection to ongoing, and it stays cleared", async ({ page }) => {
    test.setTimeout(90000);
    await createCollection(page, "Ongoing Range");

    await page.getByLabel("End date", { exact: true }).fill("2026-12-24");
    await page.reload();
    await expect(page.getByLabel("End date", { exact: true })).toHaveValue("2026-12-24");

    await page.getByRole("button", { name: "Clear end date" }).click();
    await expect(page.getByLabel("End date", { exact: true })).toHaveValue("");
    await expect(page.getByText("no end date")).toBeVisible();

    // Clearing writes `undefined`, which only sticks if Dexie's update() treats
    // that as a delete rather than a no-op — so it has to survive a reload.
    await page.reload();
    await expect(page.getByLabel("End date", { exact: true })).toHaveValue("");
  });

  test("adds and removes a product, with two-step inline confirmation", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/products");
    await page.getByRole("button", { name: "Add new product" }).click();
    await page.getByRole("textbox", { name: "Product name" }).fill("Sea Salt Caramel");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/products\/.+/);

    await createCollection(page, "Gift Range");

    await page.getByLabel("Search products to add").fill("Sea Salt");
    await page.getByRole("button", { name: /^Sea Salt Caramel/ }).click();
    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByRole("link", { name: "Sea Salt Caramel" })).toBeVisible();

    // Nothing is removed until the second step is taken.
    await page.getByLabel("Remove Sea Salt Caramel from collection").click();
    await page.getByRole("button", { name: "Cancel" }).click();
    await expect(page.getByRole("link", { name: "Sea Salt Caramel" })).toBeVisible();

    await page.getByLabel("Remove Sea Salt Caramel from collection").click();
    await page.getByRole("button", { name: "Yes" }).click();
    await expect(page.getByRole("link", { name: "Sea Salt Caramel" })).toHaveCount(0);
  });

  test("Pricing & margins is a separate full-width tab", async ({ page }) => {
    test.setTimeout(60000);
    await createCollection(page, "Tabbed Collection");

    // Collection tab shows the sidebar cards.
    await expect(page.getByRole("heading", { name: "Properties" })).toBeVisible();

    await page.getByRole("button", { name: "Pricing & margins" }).click();
    await expect(page.getByText("No box pricing configured yet.")).toBeVisible();
    // Full width — the sidebar is gone on this tab.
    await expect(page.getByRole("heading", { name: "Properties" })).toHaveCount(0);

    await page.getByRole("button", { name: "Collection", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Properties" })).toBeVisible();
  });

  test("shows a distinct not-found state for a missing collection", async ({ page }) => {
    await page.goto("/collections/does-not-exist");
    await expect(page.getByText(/This collection doesn.t exist\./)).toBeVisible();
    await expect(page.getByText("Loading...")).toHaveCount(0);
  });
});
