import { test, expect } from "./fixtures";

test.describe("Packaging", () => {
  test("shows empty state on fresh database", async ({ page }) => {
    await page.goto("/packaging");
    await expect(page.getByRole("heading", { name: "Packaging" })).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(0);
  });

  test("creates new packaging and lands on detail page", async ({ page }) => {
    await page.goto("/packaging");
    await page.getByRole("button", { name: "Add packaging" }).click();
    await page.getByPlaceholder("Packaging name *").fill("Gift Box 9");
    await page.getByRole("button", { name: "Create Packaging" }).click();
    await expect(page).toHaveURL(/\/packaging\/.+/);
  });

  test("packaging appears in list after creation", async ({ page }) => {
    await page.goto("/packaging");
    await page.getByRole("button", { name: "Add packaging" }).click();
    await page.getByPlaceholder("Packaging name *").fill("Kraft Sleeve");
    await page.getByRole("button", { name: "Create Packaging" }).click();
    await expect(page).toHaveURL(/\/packaging\/.+/);

    await page.goto("/packaging");
    await expect(page.getByText("Kraft Sleeve")).toBeVisible();
  });

  test("search filters packaging by name", async ({ page }) => {
    for (const name of ["White Box 4", "Black Tray 16"]) {
      await page.goto("/packaging");
      await page.getByRole("button", { name: "Add packaging" }).click();
      await page.getByPlaceholder("Packaging name *").fill(name);
      await page.getByRole("button", { name: "Create Packaging" }).click();
      await expect(page).toHaveURL(/\/packaging\/.+/);
    }

    await page.goto("/packaging");
    await page.getByPlaceholder("Search name or manufacturer…").fill("White");
    await expect(page.getByText("White Box 4")).toBeVisible();
    await expect(page.getByText("Black Tray 16")).not.toBeVisible();
  });

  test("cancel add form hides without creating", async ({ page }) => {
    await page.goto("/packaging");
    await page.getByRole("button", { name: "Add packaging" }).click();
    await page.getByPlaceholder("Packaging name *").fill("Should Not Exist");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByPlaceholder("Packaging name *")).not.toBeVisible();
    await expect(page.getByText("Should Not Exist")).not.toBeVisible();
  });
});
