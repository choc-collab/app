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

// Helper: create a filling and wait for detail page to stabilise in read mode
async function createFillingAndSave(page: Page, name: string) {
  await page.goto("/fillings");
  await page.getByRole("button", { name: "Add filling" }).click();
  await page.getByRole("textbox", { name: "Filling name" }).fill(name);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/fillings\/.+/);
  // Save exits edit mode and strips ?new=1 via router.replace
  await page.getByRole("button", { name: "Save" }).click();
  // Wait for read mode to stabilise (Edit filling button appears once re-render is done)
  await page.getByRole("button", { name: "Edit filling" }).waitFor({ timeout: 30000 });
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

test.describe("Unsaved changes — Fillings", () => {
  test("warns when navigating away via Back with unsaved changes", async ({ page }) => {
    test.setTimeout(60000);
    await createFillingAndSave(page, "Guard Test Filling");

    // Re-enter editing mode
    await page.getByRole("button", { name: "Edit filling" }).click();
    // Modify a field without saving
    await page.getByPlaceholder("Notes…").fill("Unsaved note");

    // Attempt to go Back — dialog should appear; dismiss (stay)
    const { didSee } = await expectGuardAndStay(page);
    await page.getByRole("button", { name: "Back", exact: true }).click();
    expect(didSee()).toBe(true);

    // Should still be on the detail page
    await expect(page).toHaveURL(/\/fillings\/.+/);
  });

  test("no warning when navigating away after saving", async ({ page }) => {
    test.setTimeout(60000);
    await createFillingAndSave(page, "Clean Save Filling");

    let dialogSeen = false;
    page.on("dialog", () => { dialogSeen = true; });

    await page.getByRole("button", { name: "Back", exact: true }).click();

    // Should have navigated without a dialog
    expect(dialogSeen).toBe(false);
    await expect(page).toHaveURL("/fillings/");
  });

  test("allows leaving when user confirms discard", async ({ page }) => {
    test.setTimeout(60000);
    await createFillingAndSave(page, "Discard Test Filling");

    await page.getByRole("button", { name: "Edit filling" }).click();
    await page.getByPlaceholder("Notes…").fill("Will be discarded");

    await expectGuardAndLeave(page);
    await page.getByRole("button", { name: "Back", exact: true }).click();

    await expect(page).toHaveURL("/fillings/");
  });

  test("warns when clicking side nav with unsaved changes", async ({ page }) => {
    test.setTimeout(60000);
    await createFillingAndSave(page, "Side Nav Test Filling");

    await page.getByRole("button", { name: "Edit filling" }).click();
    await page.getByPlaceholder("Notes…").fill("Changed for nav test");

    const { didSee } = await expectGuardAndStay(page);
    await page.getByRole("link", { name: "Products" }).click();
    expect(didSee()).toBe(true);

    // Should still be on the filling detail page
    await expect(page).toHaveURL(/\/fillings\/.+/);
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
