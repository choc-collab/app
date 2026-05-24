import { test, expect } from "./fixtures";

// Freezer workflow for leftover filling stock. Products-side freezing requires
// a completed production plan which is expensive to set up in E2E; the filling
// path exercises the same FreezeModal / DefrostConfirmModal components and
// hooks, so this covers the user-facing flow end-to-end.

test.describe("Stock — Freezer", () => {
  test("freeze filling, filter, then defrost with confirmation", async ({ page }) => {
    test.setTimeout(180000);

    // Create a filling so we can register leftover stock against it.
    await page.goto("/fillings");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Freezer Test Praline");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fillings\/.+/);
    await page.locator("select.input").first().selectOption("Pralines & Giandujas (Nut-Based)");
    await page.getByRole("button", { name: "Save" }).click();

    // Register leftover stock (500g)
    await page.goto("/stock");
    await page.getByRole("button", { name: "Fillings" }).click();
    await page.getByRole("button", { name: "Add filling stock" }).click();
    await page.getByLabel("Select filling").selectOption({ label: "Freezer Test Praline" });
    await page.getByPlaceholder("Amount in grams").fill("500");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.locator("text=500g").first()).toBeVisible();

    // Click Freeze on the row
    await page.getByRole("button", { name: /Freeze/ }).first().click();

    // Modal opens with pre-filled quantity (500) and some shelf-life days.
    // Freeze 200g only (partial freeze — the row should split).
    const modal = page.locator('h3:has-text("Freeze filling")').locator("xpath=ancestor::*[contains(@class,'rounded-2xl')]");
    await modal.locator('input[type=number]').first().fill("200");
    await modal.getByRole("button", { name: "Freeze", exact: true }).click();

    // After partial freeze: a "In freezer" row for 200g + remaining 300g available.
    await expect(page.getByText("In freezer").first()).toBeVisible();
    await expect(page.locator("text=200g").first()).toBeVisible();
    await expect(page.locator("text=300g").first()).toBeVisible();

    // Segmented tab: Frozen — should hide the 300g available row.
    await page.getByRole("tab", { name: /Frozen/ }).click();
    await expect(page.locator("text=300g")).toHaveCount(0);
    await expect(page.locator("text=200g").first()).toBeVisible();

    // In stock tab shows only the non-frozen row.
    await page.getByRole("tab", { name: /In stock/ }).click();
    await expect(page.locator("text=300g").first()).toBeVisible();
    await expect(page.locator("text=In freezer")).toHaveCount(0);

    // Back to All and defrost.
    await page.getByRole("tab", { name: /All/ }).click();
    await page.getByRole("button", { name: "Defrost" }).click();

    // Confirmation modal
    await expect(page.getByText(/Defrost Freezer Test Praline/i)).toBeVisible();
    await page.getByRole("button", { name: "Yes, defrost" }).click();

    // After defrost, no "In freezer" badge remains. Switching to the
    // Frozen tab should show the empty state.
    await expect(page.locator("text=In freezer")).toHaveCount(0);
    await page.getByRole("tab", { name: /Frozen/ }).click();
    await expect(page.getByText("No fillings match your search")).toBeVisible();
  });
});
