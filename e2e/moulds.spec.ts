import { test, expect } from "./fixtures";

test.describe("Moulds", () => {
  test("shows empty state on fresh database", async ({ page }) => {
    await page.goto("/moulds");
    await expect(page.getByRole("heading", { name: "Moulds" })).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(0);
  });

  test("creates a new mould and lands on detail page", async ({ page }) => {
    await page.goto("/moulds");
    await page.getByRole("button", { name: "Add mould" }).click();
    await page.getByPlaceholder("Mould name *").fill("Polycarbonate 24-cavity");
    await page.getByRole("button", { name: "Create Mould" }).click();
    await expect(page).toHaveURL(/\/moulds\/.+/);
  });

  test("mould appears in list after creation", async ({ page }) => {
    await page.goto("/moulds");
    await page.getByRole("button", { name: "Add mould" }).click();
    await page.getByPlaceholder("Mould name *").fill("Silicone Sphere");
    await page.getByRole("button", { name: "Create Mould" }).click();
    await expect(page).toHaveURL(/\/moulds\/.+/);

    await page.goto("/moulds");
    await expect(page.getByText("Silicone Sphere")).toBeVisible();
  });

  test("search filters moulds by name", async ({ page }) => {
    for (const name of ["Oval Polycarbonate", "Heart Silicone"]) {
      await page.goto("/moulds");
      await page.getByRole("button", { name: "Add mould" }).click();
      await page.getByPlaceholder("Mould name *").fill(name);
      await page.getByRole("button", { name: "Create Mould" }).click();
      await expect(page).toHaveURL(/\/moulds\/.+/);
    }

    await page.goto("/moulds");
    await page.getByPlaceholder("Search name or brand…").fill("Oval");
    await expect(page.getByText("Oval Polycarbonate")).toBeVisible();
    await expect(page.getByText("Heart Silicone")).not.toBeVisible();
  });

  test("cancel add form hides without creating", async ({ page }) => {
    await page.goto("/moulds");
    await page.getByRole("button", { name: "Add mould" }).click();
    await page.getByPlaceholder("Mould name *").fill("Should Not Exist");
    await page.getByRole("button", { name: "Cancel" }).click();

    await expect(page.getByPlaceholder("Mould name *")).not.toBeVisible();
    await expect(page.getByText("Should Not Exist")).not.toBeVisible();
  });
});
