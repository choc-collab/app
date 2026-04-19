import { test, expect } from "./fixtures";

test.describe("Products", () => {
  test("shows empty state on fresh database", async ({ page }) => {
    await page.goto("/products");
    await expect(page.getByRole("heading", { name: "Products" })).toBeVisible();
    await expect(page.getByRole("listitem")).toHaveCount(0);
  });

  test("creates a new product and lands on detail page", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/products");
    await page.getByRole("button", { name: "Add new product" }).click();

    const input = page.getByRole("textbox", { name: "Product name" });
    await expect(input).toBeVisible();
    await input.fill("Salted Caramel");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/products\/.+/);
    // New product lands in edit mode — save to see the heading
    await page.getByRole("button", { name: "Save" }).click();
    // Product name renders as a span in InlineNameEditor, not an h1
    await expect(page.getByText("Salted Caramel").first()).toBeVisible({ timeout: 30000 });
  });

  test("product appears in list after creation", async ({ page }) => {
    await page.goto("/products");
    await page.getByRole("button", { name: "Add new product" }).click();
    await page.getByRole("textbox", { name: "Product name" }).fill("Dark Truffle");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/products\/.+/);

    await page.goto("/products");
    await expect(page.getByText("Dark Truffle")).toBeVisible();
  });

  test("search filters products by name", async ({ page }) => {
    await page.goto("/products");

    for (const name of ["Milk Praline", "Dark Caramel"]) {
      await page.getByRole("button", { name: "Add new product" }).click();
      await page.getByRole("textbox", { name: "Product name" }).fill(name);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/products\/.+/);
      await page.goto("/products");
    }

    await page.getByRole("textbox", { name: "Search products" }).fill("Milk");
    await expect(page.getByText("Milk Praline")).toBeVisible();
    await expect(page.getByText("Dark Caramel")).not.toBeVisible();
  });

  test("detail page allows editing the product name", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/products");
    await page.getByRole("button", { name: "Add new product" }).click();
    await page.getByRole("textbox", { name: "Product name" }).fill("Temp Name");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/products\/.+/);

    // Save the new product first, then rename via the inline name editor
    await page.getByRole("button", { name: "Save" }).click();
    await page.getByRole("button", { name: "Rename" }).click();
    const nameInput = page.getByRole("textbox").first();
    await nameInput.fill("Raspberry Ganache");
    await nameInput.press("Enter");

    // Product name renders as a span in InlineNameEditor
    await expect(page.getByText("Raspberry Ganache").first()).toBeVisible({ timeout: 30000 });
  });

  test("duplicate product creates a copy and lands on new detail page", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/products");
    await page.getByRole("button", { name: "Add new product" }).click();
    await page.getByRole("textbox", { name: "Product name" }).fill("Original Product");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/products\/.+/);

    // Exit edit mode
    await page.getByRole("button", { name: "Cancel" }).click();

    // Click duplicate — opens confirmation panel
    await page.getByRole("button", { name: /Duplicate product/i }).click();
    await expect(page.getByText(/A new product will be created/)).toBeVisible();
    // Click the confirm button inside the panel
    await page.getByRole("button", { name: "Duplicate product" }).click();

    // Should land on new product detail page
    await expect(page).toHaveURL(/\/products\/.+/);

    // New product name should contain "(copy)"
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Original Product (copy)").first()).toBeVisible({ timeout: 30000 });
  });

  test("delete product from detail page returns to list", async ({ page }) => {
    await page.goto("/products");
    await page.getByRole("button", { name: "Add new product" }).click();
    await page.getByRole("textbox", { name: "Product name" }).fill("To Delete");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/products\/.+/);

    // Exit edit mode first — delete is only in view mode
    await page.getByRole("button", { name: "Cancel" }).click();
    await page.getByRole("button", { name: /Delete product/i }).click();
    await page.getByRole("button", { name: /Yes, delete product/i }).click();

    await expect(page).toHaveURL("/products");
    await expect(page.getByText("To Delete")).not.toBeVisible();
  });
});
