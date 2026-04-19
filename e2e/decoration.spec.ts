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

  test("delete material from detail page returns to list", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: /Add decoration material/i }).click();
    await page.getByPlaceholder(/Material name/).fill("Delete Me");
    await page.getByRole("button", { name: "Create Material" }).click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/.+/);

    // Exit edit mode first — delete is only visible in read mode
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: /Delete material/i }).click();
    await page.getByRole("button", { name: "Yes, delete" }).click();

    await expect(page).toHaveURL("/pantry/decoration/");
    await expect(page.getByText("Delete Me")).not.toBeVisible();
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

  test("deletes an unused design from the detail page", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: "Designs" }).click();
    await page.getByRole("button", { name: /Add shell design/i }).click();
    await page.getByPlaceholder(/Design name/).fill("Delete Me Design");
    await page.getByRole("button", { name: "Create Design" }).click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/designs\/.+/);

    // Save exits edit mode — delete is only in read mode
    await page.getByRole("button", { name: "Save" }).click();
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

    // Save to exit edit mode
    await page.getByRole("button", { name: "Save" }).click();

    // Read view should show the production step info
    await expect(page.getByText("Cap")).toBeVisible();
  });
});
