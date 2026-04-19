import { test, expect } from "./fixtures";

test.describe("Pantry", () => {
  test("loads the pantry home page", async ({ page }) => {
    await page.goto("/pantry");
    await expect(page.getByRole("heading", { name: "The Pantry" })).toBeVisible();
  });

  test("shows section cards for all pantry areas", async ({ page }) => {
    await page.goto("/pantry");
    // Check card descriptions which are unique to the main content (not in sidenav)
    await expect(page.getByText("Your product catalog — shells, fillings, and design.")).toBeVisible();
    await expect(page.getByText("Reusable fillings: ganaches, pralines, caramels, and more.")).toBeVisible();
    await expect(page.getByText("Your ingredient library with costs and composition.")).toBeVisible();
    await expect(page.getByText("Cocoa butters and lustre dusts for shell design.")).toBeVisible();
    await expect(page.getByText("Curated sets of products for seasonal or themed boxes.")).toBeVisible();
  });

  test("navigates to Decoration from Pantry", async ({ page }) => {
    await page.goto("/pantry");
    // Use the card link (last match, since sidenav may also link to Decoration)
    await page.locator('a[href="/pantry/decoration/"]').last().click();
    await expect(page).toHaveURL("/pantry/decoration/");
    await expect(page.getByRole("heading", { name: "Decoration" })).toBeVisible();
  });

  test("navigates to Collections from Pantry", async ({ page }) => {
    await page.goto("/pantry");
    // Use the card link (last match, since sidenav may also link to Collections)
    await page.locator('a[href="/collections/"]').last().click();
    await expect(page).toHaveURL("/collections/");
    await expect(page.getByRole("heading", { name: "Collections" })).toBeVisible();
  });
});
