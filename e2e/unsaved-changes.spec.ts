import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

// Helper: an ingredient that can act as a product shell.
async function createShellChocolateIngredient(page: Page) {
  await page.goto("/ingredients");
  await page.getByRole("button", { name: /Add ingredient/i }).click();
  await page.getByPlaceholder(/Ingredient name/).fill("Test Dark 70%");
  await page.getByRole("button", { name: "Create Ingredient" }).click();
  await expect(page).toHaveURL(/\/ingredients\/.+/);
  // The ingredient detail page autosaves — the category select commits on
  // change, which makes the Shell tab appear.
  await page.getByLabel("Category").selectOption("Chocolate");
  await page.getByRole("button", { name: /^Shell$/ }).click();
  await page.getByRole("checkbox", { name: /Can be used as shell chocolate/ }).click();
  await expect(page.getByRole("checkbox", { name: /Can be used as shell chocolate/ })).toBeChecked();
}

async function createProductAndSave(page: Page, name: string) {
  // Ensure a shell-capable ingredient exists
  await createShellChocolateIngredient(page);

  await page.goto("/products");
  await page.getByRole("button", { name: "Add new product" }).click();
  await page.getByRole("textbox", { name: "Product name" }).fill(name);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/products\/.+/);
  // Category and shell chocolate live in the Configuration card, which keeps a
  // scoped Save because the planner reads the group and a half-edited
  // combination is invalid.
  await page.getByLabel("Category *").selectOption({ index: 1 });
  await page.getByLabel("Shell chocolate").selectOption({ index: 1 });
  await page.getByRole("button", { name: "Save configuration" }).click();
  await expect(page.getByText("Saved")).toBeVisible({ timeout: 30000 });
}

// ── Fillings ─────────────────────────────────────────────────────────────────
//
// The Fillings detail page has no page-level "Edit mode"/Save step — every
// field autosaves individually as it's changed (see fillings.spec.ts), so
// there's no "unsaved changes" state to guard here at all. This is a
// deliberate divergence from every other detail page in the app (Products
// included, below), not a gap: confirm no warning dialog ever appears.

test.describe("Unsaved changes — Fillings (autosave, no guard expected)", () => {
  test("never warns when navigating away, since every field autosaves", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/fillings");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("No Guard Filling");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fillings\/.+/);

    await page.getByPlaceholder("Tasting notes, substitutions, what to try next time…").fill("Changed but never explicitly saved");

    let dialogSeen = false;
    page.on("dialog", () => { dialogSeen = true; });

    await page.getByRole("button", { name: "Fillings", exact: true }).click();

    expect(dialogSeen).toBe(false);
    await expect(page).toHaveURL("/fillings/");
  });
});

// Packaging and Ingredients moved to the same autosave model as Fillings, so
// their navigation guards are gone too. Same assertion: no dialog, ever.

test.describe("Unsaved changes — Packaging (autosave, no guard expected)", () => {
  test("never warns when navigating away, since every field autosaves", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/packaging");
    await page.getByRole("button", { name: "Add packaging" }).click();
    await page.getByPlaceholder("Packaging name *").fill("No Guard Box");
    await page.getByRole("button", { name: "Create Packaging" }).click();
    await expect(page).toHaveURL(/\/packaging\/.+/);

    await page.getByLabel("Notes", { exact: true }).fill("Changed but never explicitly saved");

    let dialogSeen = false;
    page.on("dialog", () => { dialogSeen = true; });

    await page.getByRole("link", { name: "Packaging" }).first().click();

    expect(dialogSeen).toBe(false);
    await expect(page).toHaveURL(/\/packaging\/?$/);
  });
});

test.describe("Unsaved changes — Ingredients (autosave, no guard expected)", () => {
  test("never warns when navigating away, since every field autosaves", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/ingredients");
    await page.getByRole("button", { name: /Add ingredient/i }).click();
    await page.getByPlaceholder(/Ingredient name/).fill("No Guard Ingredient");
    await page.getByRole("button", { name: "Create Ingredient" }).click();
    await expect(page).toHaveURL(/\/ingredients\/.+/);

    await page.getByLabel("Notes", { exact: true }).fill("Changed but never explicitly saved");

    let dialogSeen = false;
    page.on("dialog", () => { dialogSeen = true; });

    await page.getByRole("link", { name: "Ingredients" }).first().click();

    expect(dialogSeen).toBe(false);
    await expect(page).toHaveURL(/\/ingredients\/?$/);
  });
});

// ── Products ─────────────────────────────────────────────────────────────────

test.describe("Unsaved changes — Products (autosave, no guard expected)", () => {
  test("never warns when navigating away, since every field autosaves", async ({ page }) => {
    test.setTimeout(90000);
    await createProductAndSave(page, "Guard Test Product");

    await page.getByPlaceholder("Tasting notes, storage tips, variations…").fill("Unsaved product note");

    let dialogSeen = false;
    page.on("dialog", () => { dialogSeen = true; });

    await page.getByRole("link", { name: "Products" }).first().click();

    expect(dialogSeen).toBe(false);
    await expect(page).toHaveURL(/\/products\/?$/);
  });
});

// Product categories carry the pantry's one genuinely blocking rule (the default
// shell % must sit inside min–max), and it is enforced inline on the field
// rather than by a guard on the way out.

test.describe("Unsaved changes — Product categories (autosave, no guard expected)", () => {
  test("never warns when navigating away, even with a refused value in the field", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/products");
    await page.getByRole("button", { name: /^Categories$/ }).click();
    await page.getByRole("button", { name: /Add product category/i }).click();
    await page.getByPlaceholder(/Category name/).fill("No Guard Category");
    await page.getByRole("button", { name: "Create Category" }).click();
    await expect(page).toHaveURL(/\/products\/categories\/.+/);

    // Leave an invalid value sitting in the input — still no dialog.
    await page.getByLabel("Default shell %").fill("99");
    await page.getByLabel("Default shell %").blur();
    await expect(page.locator('p[role="alert"]')).toBeVisible();

    let dialogSeen = false;
    page.on("dialog", () => { dialogSeen = true; });

    await page.getByRole("link", { name: "Product categories" }).first().click();

    expect(dialogSeen).toBe(false);
    await expect(page).toHaveURL(/\/products/);
  });
});

// The last three pages to move off Edit → Save/Cancel. With those gone, no
// pantry detail page holds unsaved state, so none of them can warn.

test.describe("Unsaved changes — Moulds (autosave, no guard expected)", () => {
  test("never warns when navigating away, since every field autosaves", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/moulds");
    await page.getByRole("button", { name: "Add mould" }).click();
    await page.getByPlaceholder("Mould name *").fill("No Guard Mould");
    await page.getByRole("button", { name: "Create Mould" }).click();
    await expect(page).toHaveURL(/\/moulds\/.+/);

    await page.getByLabel("Notes", { exact: true }).fill("Changed but never explicitly saved");

    let dialogSeen = false;
    page.on("dialog", () => { dialogSeen = true; });

    await page.getByRole("link", { name: "Moulds" }).first().click();

    expect(dialogSeen).toBe(false);
    await expect(page).toHaveURL(/\/moulds\/?$/);
  });
});

test.describe("Unsaved changes — Decoration (autosave, no guard expected)", () => {
  test("never warns when navigating away from a material", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: /Add decoration material/i }).click();
    await page.getByPlaceholder(/Material name/).fill("No Guard Material");
    await page.getByRole("button", { name: "Create Material" }).click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/.+/);

    await page.getByLabel("Notes", { exact: true }).fill("Changed but never explicitly saved");

    let dialogSeen = false;
    page.on("dialog", () => { dialogSeen = true; });

    await page.getByRole("link", { name: "Decoration materials" }).first().click();

    expect(dialogSeen).toBe(false);
    await expect(page).toHaveURL("/pantry/decoration/");
  });

  test("never warns when navigating away from a shell design", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/pantry/decoration");
    await page.getByRole("button", { name: "Designs" }).click();
    await page.getByRole("button", { name: /Add shell design/i }).click();
    await page.getByPlaceholder(/Design name/).fill("No Guard Design");
    await page.getByRole("button", { name: "Create Design" }).click();
    await expect(page).toHaveURL(/\/pantry\/decoration\/designs\/.+/);

    await page.getByLabel("Production step").selectOption("cap");

    let dialogSeen = false;
    page.on("dialog", () => { dialogSeen = true; });

    await page.getByRole("link", { name: "Decoration" }).first().click();

    expect(dialogSeen).toBe(false);
    await expect(page).toHaveURL("/pantry/decoration/");
  });
});
