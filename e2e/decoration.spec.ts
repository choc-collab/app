import { test, expect } from "./fixtures";

/**
 * Decoration page — tabs, materials, categories, and designs coverage.
 *
 * Note: ensureDefaultDecorationCategories() and ensureDefaultShellDesigns()
 * run on every page load via the seed loader, so each fresh test context
 * already has the 5 seeded categories and 14 seeded designs present.
 */

test.describe("Decoration — Tabs", () => {
  test("shows 3 tabs: Materials, Categories, Designs", async ({ page }) => {
    await page.goto("/pantry/decoration");
    await expect(page.getByRole("heading", { name: "Decoration" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Materials" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Categories" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Designs" })).toBeVisible();
  });

  test("Materials tab is active by default", async ({ page }) => {
    await page.goto("/pantry/decoration");
    // Materials tab should show the add material button
    await expect(page.getByRole("button", { name: /Add decoration material/i })).toBeVisible();
  });

  test("switching to Categories tab shows seeded categories", async ({ page }) => {
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: "Categories" }).click();
    // Should show the 5 seeded categories
    await expect(page.getByText("Cocoa Butter")).toBeVisible();
    await expect(page.getByText("Transfer Sheet")).toBeVisible();
  });

  test("switching to Designs tab shows seeded designs", async ({ page }) => {
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: "Designs" }).click();
    // Should show some of the 14 seeded designs
    await expect(page.getByText("Airbrushing")).toBeVisible();
  });
});

test.describe("Decoration — Materials", () => {
  test("shows empty state on fresh database", async ({ page }) => {
    await page.goto("/pantry/decoration");
    await expect(page.getByRole("heading", { name: "Decoration" })).toBeVisible();
    await expect(page.getByText(/No decoration materials yet/)).toBeVisible();
  });

  test("creates a new material and lands on detail page", async ({ page }) => {
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: /Add decoration material/i }).click();
    await page.getByPlaceholder(/Material name/).fill("Gold Shimmer");
    await page.getByRole("button", { name: "Create Material" }).click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/.+/);
  });

  test("material appears in list after creation", async ({ page }) => {
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: /Add decoration material/i }).click();
    await page.getByPlaceholder(/Material name/).fill("Ruby Red");
    await page.getByRole("button", { name: "Create Material" }).click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/.+/);

    await page.goto("/pantry/decoration");
    await expect(page.getByText("Ruby Red")).toBeVisible();
  });

  test("cancel add form hides without creating", async ({ page }) => {
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: /Add decoration material/i }).click();
    await page.getByPlaceholder(/Material name/).fill("Should Not Exist");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByPlaceholder(/Material name/)).not.toBeVisible();
    await expect(page.getByText("Should Not Exist")).not.toBeVisible();
  });

  test("list renders as a table with column headers", async ({ page }) => {
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: /Add decoration material/i }).click();
    await page.getByPlaceholder(/Material name/).fill("Cocoa Red");
    await page.getByRole("button", { name: "Create Material" }).click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/.+/);

    await page.goto("/pantry/decoration");
    const table = page.getByRole("table", { name: "Decoration materials" });
    await expect(table).toBeVisible();
    for (const header of ["Material", "Stock", "Manufacturer", "Used in", "Colour", "Updated"]) {
      await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
    }
    await expect(page.getByText("Cocoa Red")).toBeVisible();

    await page.getByText("Cocoa Red").click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/.+/);
  });

  test("delete material from detail page returns to list", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: /Add decoration material/i }).click();
    await page.getByPlaceholder(/Material name/).fill("Delete Me");
    await page.getByRole("button", { name: "Create Material" }).click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/.+/);

    await page.getByRole("button", { name: /Delete material/i }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();

    await expect(page).toHaveURL("/pantry/decoration/");
    await expect(page.getByText("Delete Me")).not.toBeVisible();
  });

  test("material detail autosaves properties and notes with no Save button", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: /Add decoration material/i }).click();
    await page.getByPlaceholder(/Material name/).fill("Autosave Lustre");
    await page.getByRole("button", { name: "Create Material" }).click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/.+/);

    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);

    await page.getByLabel("Manufacturer").fill("I Shud Koko");
    await page.getByLabel("Manufacturer").blur();
    await page.getByLabel("Vendor").fill("Keylink");
    await page.getByLabel("Vendor").blur();
    await page.getByLabel("Notes", { exact: true }).fill("Warm before spraying");
    await page.getByLabel("Notes", { exact: true }).blur();

    await page.reload();
    await expect(page.getByLabel("Manufacturer")).toHaveValue("I Shud Koko");
    await expect(page.getByLabel("Vendor")).toHaveValue("Keylink");
    await expect(page.getByLabel("Notes", { exact: true })).toHaveValue("Warm before spraying");
  });

  test("cocoa butter type row appears only for the cocoa butter type", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: /Add decoration material/i }).click();
    await page.getByPlaceholder(/Material name/).fill("Type Switcher");
    await page.getByRole("button", { name: "Create Material" }).click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/.+/);

    await page.getByLabel("Type", { exact: true }).selectOption("cocoa_butter");
    await expect(page.getByLabel("Cocoa butter type")).toBeVisible();
    await page.getByLabel("Cocoa butter type").selectOption("Type B");

    await page.reload();
    await expect(page.getByLabel("Cocoa butter type")).toHaveValue("Type B");

    // Switching away hides the row — it is meaningless for other types.
    await page.getByLabel("Type", { exact: true }).selectOption("lustre_dust");
    await expect(page.getByLabel("Cocoa butter type")).toHaveCount(0);
  });

  test("shows a distinct not-found state for a missing material", async ({ page }) => {
    await page.goto("/pantry/decoration/does-not-exist");
    await expect(page.getByText(/This decoration material doesn.t exist\./)).toBeVisible();
    await expect(page.getByText("Loading…")).toHaveCount(0);
  });
});

test.describe("Decoration — Categories", () => {
  test("creates a new category and lands on detail page", async ({ page }) => {
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: "Categories" }).click();
    await page.getByRole("button", { name: /Add decoration category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Metallic Pigments");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/categories\/.+/);
  });

  test("created category appears in the list", async ({ page }) => {
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: "Categories" }).click();
    await page.getByRole("button", { name: /Add decoration category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Pearl Finish");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/categories\/.+/);

    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: "Categories" }).click();
    await expect(page.getByText("Pearl Finish")).toBeVisible();
  });

  test("list renders as a table with column headers", async ({ page }) => {
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: "Categories" }).click();
    const table = page.getByRole("table", { name: "Decoration categories" });
    await expect(table).toBeVisible();
    for (const header of ["Category", "Materials", "Updated"]) {
      await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
    }
    await expect(page.getByText("Cocoa Butter")).toBeVisible();

    await page.getByText("Cocoa Butter").click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/categories\/.+/);
  });

  test("cancel add form hides without creating", async ({ page }) => {
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: "Categories" }).click();
    await page.getByRole("button", { name: /Add decoration category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Should Not Exist");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByPlaceholder(/Category name/)).not.toBeVisible();
    await expect(page.getByText("Should Not Exist")).not.toBeVisible();
  });

  test("deletes an unused category from the detail page", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: "Categories" }).click();
    await page.getByRole("button", { name: /Add decoration category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("Delete Me Cat");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/categories\/.+/);

    // No edit mode — delete is always visible in read view
    await page.getByRole("button", { name: /Delete category/i }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();

    await expect(page).toHaveURL("/pantry/decoration/");
  });
});

test.describe("Decoration — Designs", () => {
  test("creates a new design and lands on detail page", async ({ page }) => {
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: "Designs" }).click();
    await page.getByRole("button", { name: /Add shell design/i }).click();
    await page.getByPlaceholder(/Design name/).fill("Marble Swirl");
    await page.getByRole("button", { name: "Create Design" }).click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/designs\/.+/);
  });

  test("created design appears in the list", async ({ page }) => {
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: "Designs" }).click();
    await page.getByRole("button", { name: /Add shell design/i }).click();
    await page.getByPlaceholder(/Design name/).fill("Gold Drizzle");
    await page.getByRole("button", { name: "Create Design" }).click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/designs\/.+/);

    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: "Designs" }).click();
    await expect(page.getByText("Gold Drizzle")).toBeVisible();
  });

  test("cancel add form hides without creating", async ({ page }) => {
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: "Designs" }).click();
    await page.getByRole("button", { name: /Add shell design/i }).click();
    await page.getByPlaceholder(/Design name/).fill("Should Not Exist");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByPlaceholder(/Design name/)).not.toBeVisible();
    await expect(page.getByText("Should Not Exist")).not.toBeVisible();
  });

  test("list renders as a table with column headers", async ({ page }) => {
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: "Designs" }).click();
    await page.getByRole("button", { name: /Add shell design/i }).click();
    await page.getByPlaceholder(/Design name/).fill("Feather Swipe");
    await page.getByRole("button", { name: "Create Design" }).click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/designs\/.+/);

    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: "Designs" }).click();
    const table = page.getByRole("table", { name: "Shell designs" });
    await expect(table).toBeVisible();
    for (const header of ["Design", "Apply at", "Used in", "Updated"]) {
      await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
    }
    await expect(page.getByText("Feather Swipe")).toBeVisible();

    await page.getByText("Feather Swipe").click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/designs\/.+/);
  });

  test("deletes an unused design from the detail page", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: "Designs" }).click();
    await page.getByRole("button", { name: /Add shell design/i }).click();
    await page.getByPlaceholder(/Design name/).fill("Delete Me Design");
    await page.getByRole("button", { name: "Create Design" }).click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/designs\/.+/);

    await page.getByRole("button", { name: /Delete design/i }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();

    await expect(page).toHaveURL("/pantry/decoration/");
  });

  test("design detail shows the production step setting", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: "Designs" }).click();
    await page.getByRole("button", { name: /Add shell design/i }).click();
    await page.getByPlaceholder(/Design name/).fill("Step Test");
    // Select "Cap" before creating
    await page.getByLabel(/Production step/i).selectOption("cap");
    await page.getByRole("button", { name: "Create Design" }).click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/designs\/.+/);

    // The select reflects the stored value straight away — nothing to save.
    await expect(page.getByLabel("Production step")).toHaveValue("cap");
  });

  test("design detail autosaves the production step", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: "Designs" }).click();
    await page.getByRole("button", { name: /Add shell design/i }).click();
    await page.getByPlaceholder(/Design name/).fill("Autosave Design");
    await page.getByRole("button", { name: "Create Design" }).click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/designs\/.+/);

    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);

    await page.getByLabel("Production step").selectOption("cap");
    await page.reload();
    await expect(page.getByLabel("Production step")).toHaveValue("cap");
  });

  test("shows a distinct not-found state for a missing design", async ({ page }) => {
    await page.goto("/pantry/decoration/designs/does-not-exist");
    await expect(page.getByText(/This shell design doesn.t exist\./)).toBeVisible();
    await expect(page.getByText("Loading…")).toHaveCount(0);
  });
});
