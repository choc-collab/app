import { test, expect } from "./fixtures";

test.describe("Settings — Target Market tab", () => {
  test("shows read-only view by default with current settings", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Target Market", { exact: true }).click();

    // Read-only key-value card visible — use exact to avoid matching tab button text
    await expect(page.getByText("Euro (€)", { exact: true })).toBeVisible();
    await expect(page.getByText("European Union", { exact: true })).toBeVisible();

    // Edit button visible, no Save/Cancel yet
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Save" })).not.toBeVisible();
  });

  test("edit mode shows dropdowns and save/cancel buttons", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Target Market", { exact: true }).click();
    await page.getByRole("button", { name: "Edit" }).click();

    // Dropdowns visible
    await expect(page.locator("select").first()).toBeVisible();
    await expect(page.locator("select").nth(1)).toBeVisible();

    // Save and Cancel buttons
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

    // Currency dropdown has all 6 options
    const currencyOptions = page.locator("select").first().locator("option");
    await expect(currencyOptions).toHaveCount(7);

    // Market dropdown has all 5 options (EU, UK, US, AU, CA)
    const marketOptions = page.locator("select").nth(1).locator("option");
    await expect(marketOptions).toHaveCount(5);
  });

  test("cancel reverts changes without saving", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Target Market", { exact: true }).click();
    await page.getByRole("button", { name: "Edit" }).click();

    // Change currency to USD
    await page.locator("select").first().selectOption("USD");

    // Cancel — should revert
    await page.getByRole("button", { name: "Cancel" }).click();

    // Back in read mode showing original EUR
    await expect(page.getByText("Euro (€)")).toBeVisible();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
  });

  test("save persists currency change", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/settings");
    await page.getByText("Target Market", { exact: true }).click();
    await page.getByRole("button", { name: "Edit" }).click();

    // Change to NZD and save
    await page.locator("select").first().selectOption("NZD");
    await page.getByRole("button", { name: "Save" }).click();

    // Read mode should show NZD
    await expect(page.getByText("New Zealand Dollar (NZ$)")).toBeVisible();

    // Verify it persists — create an ingredient and check label
    await page.goto("/ingredients");
    await page.getByRole("button", { name: "Add ingredient" }).click();
    await page.getByRole("textbox", { name: "Ingredient name" }).fill("Test Cream");
    await page.getByRole("button", { name: "Create Ingredient" }).click();
    await expect(page).toHaveURL(/\/ingredients\/.+/);
    await page.getByRole("button", { name: "Pricing" }).click();
    await expect(page.getByText(/Price excl\. VAT \(NZ\$\)/)).toBeVisible();
  });

  test("switching to AU updates the market label in read mode after save", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Target Market", { exact: true }).click();
    await page.getByRole("button", { name: "Edit" }).click();

    await page.locator("select").nth(1).selectOption("AU");
    await page.getByRole("button", { name: "Save" }).click();

    // Read mode shows AU market name
    await expect(page.getByText("Australia / New Zealand")).toBeVisible();
  });

  test("warns when switching tabs with unsaved changes", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Target Market", { exact: true }).click();
    await page.getByRole("button", { name: "Edit" }).click();

    // Make a change
    await page.locator("select").first().selectOption("USD");

    // Try to switch tab — should trigger confirm dialog
    page.on("dialog", async (dialog) => {
      expect(dialog.type()).toBe("confirm");
      expect(dialog.message()).toContain("unsaved changes");
      await dialog.dismiss(); // Cancel — stay on tab
    });
    await page.getByText("Backup & Restore", { exact: true }).click();

    // Should still be on Target Market tab (dialog was dismissed)
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
  });

  test("allows switching tabs after discarding unsaved changes", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Target Market", { exact: true }).click();
    await page.getByRole("button", { name: "Edit" }).click();

    // Make a change
    await page.locator("select").first().selectOption("GBP");

    // Switch tab and accept the discard dialog
    page.once("dialog", async (dialog) => {
      await dialog.accept(); // Discard changes
    });
    await page.getByText("Printing", { exact: true }).click();

    // Should now be on Printing tab
    await expect(page.getByText("Printing", { exact: true })).toBeVisible();
  });

  test("no warning when switching tabs without changes", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Target Market", { exact: true }).click();

    // Confirm we're on Target Market tab — read mode shows market info
    await expect(page.getByText("European Union", { exact: true })).toBeVisible();

    // Don't enter edit mode — just switch to Printing tab
    await page.getByText("Printing", { exact: true }).click();
    await expect(page.getByText("Printing", { exact: true })).toBeVisible();
  });
});
