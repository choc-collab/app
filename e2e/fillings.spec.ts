import { test, expect } from "./fixtures";

test.describe("Fillings", () => {
  test("shows empty state on fresh database", async ({ page }) => {
    await page.goto("/fillings");
    await expect(page.getByRole("heading", { name: "Fillings" })).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(0);
  });

  test("creates a new filling and lands on detail page", async ({ page }) => {
    await page.goto("/fillings");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Dark Ganache");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fillings\/.+/);
  });

  test("filling appears in list after creation", async ({ page }) => {
    await page.goto("/fillings");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Praline Base");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fillings\/.+/);

    await page.goto("/fillings");
    await page.getByRole("textbox", { name: "Search fillings" }).fill("Praline");
    await expect(page.getByText("Praline Base")).toBeVisible();
  });

  test("detail page allows editing filling notes", async ({ page }) => {
    test.setTimeout(60000);
    // Create filling — lands in editing mode (?new=1)
    await page.goto("/fillings");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Caramel Filling");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fillings\/.+/);

    // Edit form is open — fill Notes (fill() auto-waits for the element, up to test timeout)
    await page.getByPlaceholder("Notes…").fill("Rich buttery caramel with sea salt");
    await page.getByPlaceholder("Notes…").blur();
    await page.getByRole("button", { name: "Save" }).click();

    // Notes should be visible in non-editing view
    await expect(page.getByText("Rich buttery caramel with sea salt")).toBeVisible();
  });

  test("duplicate filling creates a copy and lands on new detail page", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/fillings");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Original Filling");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fillings\/.+/);

    // Save to exit edit mode
    await page.getByRole("button", { name: "Save" }).click();

    // Click duplicate — navigates immediately to new filling
    await page.getByRole("button", { name: /Duplicate filling/i }).click();

    // Should land on new filling detail page in edit mode
    await expect(page).toHaveURL(/\/fillings\/.+/);

    // New filling name should contain "(copy)"
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Original Filling (copy)").first()).toBeVisible({ timeout: 30000 });
  });

  test("delete filling from detail page returns to list", async ({ page }) => {
    await page.goto("/fillings");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Delete Me");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fillings\/.+/);

    // Click Done to exit editing mode without a full page reload
    await page.getByRole("button", { name: "Save" }).click();

    await page.getByRole("button", { name: /Delete filling/i }).click();
    await page.getByRole("button", { name: /Yes, delete filling/i }).click();

    await expect(page).toHaveURL("/fillings/");
    await expect(page.getByText("Delete Me")).not.toBeVisible();
  });
});
