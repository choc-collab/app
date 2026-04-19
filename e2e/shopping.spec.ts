import { test, expect } from "./fixtures";

test.describe("Shopping List", () => {
  test("shows empty state on fresh database", async ({ page }) => {
    await page.goto("/shopping");
    await expect(page.getByRole("heading", { name: "Shopping List" })).toBeVisible();
    await expect(page.getByText("Nothing to order")).toBeVisible();
  });

  test("adds a free-text item and it appears in the list", async ({ page }) => {
    await page.goto("/shopping");
    await page.getByRole("button", { name: /Add an item/i }).click();

    await page.getByPlaceholder("Item name…").fill("Cocoa Butter Blocks");
    await page.getByRole("button", { name: "Add" }).click();

    await expect(page.getByText("Cocoa Butter Blocks")).toBeVisible();
    await expect(page.getByText(/Needs ordering/i)).toBeVisible();
  });

  test("marks a free-text item as ordered", async ({ page }) => {
    await page.goto("/shopping");
    await page.getByRole("button", { name: /Add an item/i }).click();
    await page.getByPlaceholder("Item name…").fill("Foil Wrappers");
    await page.getByRole("button", { name: "Add" }).click();

    await expect(page.getByText("Foil Wrappers")).toBeVisible();

    // Mark as ordered
    await page.getByTitle("Mark as ordered").click();

    // Item moves to the "Ordered" section (collapsed by default)
    await expect(page.getByText(/Ordered.*awaiting delivery/i)).toBeVisible();
  });

  test("deletes a free-text item from the list", async ({ page }) => {
    await page.goto("/shopping");
    await page.getByRole("button", { name: /Add an item/i }).click();
    await page.getByPlaceholder("Item name…").fill("Twist Ties");
    await page.getByRole("button", { name: "Add" }).click();

    await expect(page.getByText("Twist Ties")).toBeVisible();

    // Delete via X button — first click shows inline confirmation
    await page.getByTitle("Delete").click();
    await page.getByRole("button", { name: "Yes" }).click();

    await expect(page.getByText("Twist Ties")).not.toBeVisible();
  });

  test("cancel add form hides without adding", async ({ page }) => {
    await page.goto("/shopping");
    await page.getByRole("button", { name: /Add an item/i }).click();
    await page.getByPlaceholder("Item name…").fill("Should Not Appear");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByPlaceholder("Item name…")).not.toBeVisible();
    await expect(page.getByText("Should Not Appear")).not.toBeVisible();
  });
});
