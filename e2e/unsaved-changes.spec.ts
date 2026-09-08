import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

// Helper: accept (dismiss = stay, accept = leave)
async function expectGuardAndStay(page: Page) {
  let dialogSeen = false;
  page.once("dialog", async (dialog) => {
    dialogSeen = true;
    expect(dialog.message()).toContain("unsaved changes");
    await dialog.dismiss(); // "Cancel" — stay on the page
  });
  return { didSee: () => dialogSeen };
}

async function expectGuardAndLeave(page: Page) {
  page.once("dialog", async (dialog) => {
    await dialog.accept(); // "OK" — leave anyway
  });
}

// Helper: create a product and wait for detail page to stabilise in read mode
async function createShellChocolateIngredient(page: Page) {
  await page.goto("/ingredients");
  await page.getByRole("button", { name: /Add ingredient/i }).click();
  await page.getByPlaceholder(/Ingredient name/).fill("Test Dark 70%");
  await page.getByRole("button", { name: "Create Ingredient" }).click();
  await expect(page).toHaveURL(/\/ingredients\/.+/);
  // Set category to Chocolate (select is inside the Details tab, which is active by default on ?new=1)
  // The label has no htmlFor, so use the select option text to locate the right dropdown
  const categorySelect = page.locator("select").filter({ has: page.locator("option", { hasText: "Chocolate" }) }).first();
  await categorySelect.selectOption("Chocolate");
  // Save to commit category, then switch to the Shell tab that appeared
  await page.getByRole("button", { name: "Update" }).click();
  await page.getByRole("button", { name: /^Shell$/ }).click();
  // Enter edit mode on the Shell tab (pencil button in the header, not the inline "Edit ingredient" helper link)
  await page.getByLabel("Edit ingredient").click();
  // Check the "shell capable" checkbox
  await page.getByText("Can be used as shell chocolate").click();
  await page.getByRole("button", { name: "Update" }).click();
}

async function createProductAndSave(page: Page, name: string) {
  // Ensure a shell-capable ingredient exists
  await createShellChocolateIngredient(page);

  await page.goto("/products");
  await page.getByRole("button", { name: "Add new product" }).click();
  await page.getByRole("textbox", { name: "Product name" }).fill(name);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/products\/.+/);
  // Category and shell chocolate are required — select the first available option
  // Labels have no htmlFor, so locate select elements by their surrounding text
  const categorySelect = page.locator("select").filter({ has: page.locator("option", { hasText: "moulded" }) });
  await categorySelect.selectOption({ index: 1 });
  const shellSelect = page.locator("select").filter({ has: page.locator("option", { hasText: "Test Dark 70%" }) });
  await shellSelect.selectOption({ index: 1 });
  await page.getByRole("button", { name: "Save" }).click();
  // Wait for read mode to stabilise (Edit product button appears once re-render is done)
  await page.getByRole("button", { name: "Edit product" }).waitFor({ timeout: 30000 });
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

    await page.getByRole("button", { name: "Back", exact: true }).click();

    expect(dialogSeen).toBe(false);
    await expect(page).toHaveURL("/fillings/");
  });
});

// ── Products ─────────────────────────────────────────────────────────────────

test.describe("Unsaved changes — Products", () => {
  test("warns when navigating away via Back with unsaved changes", async ({ page }) => {
    test.setTimeout(60000);
    await createProductAndSave(page, "Guard Test Product");

    await page.getByRole("button", { name: "Edit product" }).click();
    await page.getByPlaceholder("Tasting notes, storage tips, variations…").fill("Unsaved product note");

    const { didSee } = await expectGuardAndStay(page);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    expect(didSee()).toBe(true);

    await expect(page).toHaveURL(/\/products\/.+/);
  });
});
