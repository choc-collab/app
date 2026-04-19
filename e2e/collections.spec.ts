import { test, expect } from "./fixtures";

test.describe("Collections", () => {
  test("shows empty state on fresh database", async ({ page }) => {
    await page.goto("/collections");
    await expect(page.getByRole("heading", { name: "Collections" })).toBeVisible();
    await expect(page.getByText("No collections yet.")).toBeVisible();
  });

  test("creates a new collection and lands on detail page", async ({ page }) => {
    await page.goto("/collections");
    await page.getByRole("button", { name: "Add collection" }).click();
    await page.getByPlaceholder("Collection name *").fill("Christmas 2025");
    await page.getByRole("button", { name: "Create Collection" }).click();
    await expect(page).toHaveURL(/\/collections\/.+/);
  });

  test("collection appears in list after creation", async ({ page }) => {
    await page.goto("/collections");
    await page.getByRole("button", { name: "Add collection" }).click();
    await page.getByPlaceholder("Collection name *").fill("Easter Selection");
    await page.getByRole("button", { name: "Create Collection" }).click();
    await expect(page).toHaveURL(/\/collections\/.+/);

    await page.goto("/collections");
    await expect(page.getByText("Easter Selection")).toBeVisible();
  });

  test("search filters collections by name", async ({ page }) => {
    for (const name of ["Winter Warmers", "Summer Treats"]) {
      await page.goto("/collections");
      await page.getByRole("button", { name: "Add collection" }).click();
      await page.getByPlaceholder("Collection name *").fill(name);
      await page.getByRole("button", { name: "Create Collection" }).click();
      await expect(page).toHaveURL(/\/collections\/.+/);
    }

    await page.goto("/collections");
    await page.getByPlaceholder("Search collections…").fill("Winter");
    await expect(page.getByText("Winter Warmers")).toBeVisible();
    await expect(page.getByText("Summer Treats")).not.toBeVisible();
  });

  test("cancel add form hides without creating", async ({ page }) => {
    await page.goto("/collections");
    await page.getByRole("button", { name: "Add collection" }).click();
    await page.getByPlaceholder("Collection name *").fill("Should Not Exist");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByPlaceholder("Collection name *")).not.toBeVisible();
    await expect(page.getByText("Should Not Exist")).not.toBeVisible();
  });
});
