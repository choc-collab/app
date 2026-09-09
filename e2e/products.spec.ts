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
    // The record already exists on arrival — nothing to save.
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

    // Click duplicate — opens the impact panel
    await page.getByRole("button", { name: /Duplicate product/i }).click();
    await expect(page.getByText(/A new product will be created/)).toBeVisible();
    // Confirm inside the panel
    await page.getByRole("button", { name: "Duplicate product" }).click();

    await expect(page).toHaveURL(/\/products\/.+/);
    await expect(page.getByText("Original Product (copy)").first()).toBeVisible({ timeout: 30000 });
  });

  test("list renders as a table with column headers and group collapse", async ({ page }) => {
    test.setTimeout(60000);

    await page.goto("/products");
    for (const name of ["Milk Praline", "Dark Caramel"]) {
      await page.getByRole("button", { name: "Add new product" }).click();
      await page.getByRole("textbox", { name: "Product name" }).fill(name);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/products\/.+/);
      await page.goto("/products");
    }

    const table = page.getByRole("table", { name: "Products" });
    await expect(table).toBeVisible();
    for (const header of ["Product", "Coating", "Fillings", "Tags", "Stock", "Last batch", "Popularity", "Updated"]) {
      await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
    }
    await expect(page.getByText("Milk Praline")).toBeVisible();
    await expect(page.getByText("Dark Caramel")).toBeVisible();

    // Both products land in "Uncategorised" since neither was assigned a category
    await page.getByRole("button", { name: "Collapse all" }).click();
    await expect(page.getByText("Milk Praline")).not.toBeVisible();
    await page.getByRole("button", { name: "Expand all" }).click();
    await expect(page.getByText("Milk Praline")).toBeVisible();

    await page.getByText("Dark Caramel").click();
    await expect(page).toHaveURL(/\/products\/.+/);
  });

  test("delete product from detail page returns to list", async ({ page }) => {
    await page.goto("/products");
    await page.getByRole("button", { name: "Add new product" }).click();
    await page.getByRole("textbox", { name: "Product name" }).fill("To Delete");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/products\/.+/);

    await page.getByRole("button", { name: /Delete product/i }).click();
    await page.getByRole("button", { name: /Yes, delete product/i }).click();

    await expect(page).toHaveURL("/products/");
    await expect(page.getByText("To Delete")).not.toBeVisible();
  });

  test("detail page autosaves notes, properties and tags with no Save button", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/products");
    await page.getByRole("button", { name: "Add new product" }).click();
    await page.getByRole("textbox", { name: "Product name" }).fill("Autosave Bonbon");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/products\/.+/);

    // Only the Configuration card keeps a Save, and it is named for its scope.
    await expect(page.getByRole("button", { name: "Save", exact: true })).toHaveCount(0);

    await page.getByLabel("Notes", { exact: true }).fill("Pipe at 28°C");
    await page.getByLabel("Notes", { exact: true }).blur();
    await page.getByLabel("Batch quantity").fill("3");
    await page.getByLabel("Batch quantity").blur();
    await page.getByLabel("Shelf life").fill("6");
    await page.getByLabel("Shelf life").blur();
    await page.getByLabel("Low-stock threshold").fill("12");
    await page.getByLabel("Low-stock threshold").blur();
    await page.getByLabel("Add tag").fill("easter");
    await page.getByLabel("Add tag").press("Enter");

    await page.reload();
    await expect(page.getByLabel("Notes", { exact: true })).toHaveValue("Pipe at 28°C");
    await expect(page.getByLabel("Batch quantity")).toHaveValue("3");
    await expect(page.getByLabel("Shelf life")).toHaveValue("6");
    await expect(page.getByLabel("Low-stock threshold")).toHaveValue("12");
    await expect(page.getByText("easter")).toBeVisible();
  });

  test("Configuration keeps a scoped Save and blocks an invalid combination", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/products");
    await page.getByRole("button", { name: "Add new product" }).click();
    await page.getByRole("textbox", { name: "Product name" }).fill("Config Guard");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/products\/.+/);

    // Shell % above 0 with no shell chocolate is refused, and nothing is written.
    await page.getByLabel("Shell %").fill("40");
    await page.getByRole("button", { name: "Save configuration" }).click();
    await expect(page.getByText(/Shell chocolate is required/)).toBeVisible();
    await expect(page.getByText("Category is required.")).toBeVisible();

    await page.reload();
    // The rejected value was never persisted.
    await expect(page.getByLabel("Shell %")).not.toHaveValue("40");
  });

  test("cost and batch tabs render full width, without the sidebar", async ({ page }) => {
    test.setTimeout(90000);
    await page.goto("/products");
    await page.getByRole("button", { name: "Add new product" }).click();
    await page.getByRole("textbox", { name: "Product name" }).fill("Wide Tabs");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/products\/.+/);

    await expect(page.getByRole("heading", { name: "Properties" })).toBeVisible();

    await page.getByRole("button", { name: "Cost", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Properties" })).toHaveCount(0);

    await page.getByRole("button", { name: "Product", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Properties" })).toBeVisible();
  });

  test("shows a distinct not-found state for a missing product", async ({ page }) => {
    await page.goto("/products/does-not-exist");
    await expect(page.getByText(/This product doesn.t exist\./)).toBeVisible();
    await expect(page.getByText("Loading…")).toHaveCount(0);
  });
  test("clearing shelf life, threshold and tags persists", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/products");
    await page.getByRole("button", { name: "Add new product" }).click();
    await page.getByRole("textbox", { name: "Product name" }).fill("Clear Product");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/products\/.+/);

    await page.getByLabel("Shelf life").fill("8");
    await page.getByLabel("Shelf life").blur();
    await page.getByLabel("Low-stock threshold").fill("20");
    await page.getByLabel("Low-stock threshold").blur();
    await page.getByLabel("Add tag").fill("winter");
    await page.getByLabel("Add tag").press("Enter");
    await page.reload();
    await expect(page.getByLabel("Shelf life")).toHaveValue("8");
    await expect(page.getByLabel("Low-stock threshold")).toHaveValue("20");
    await expect(page.getByText("winter")).toBeVisible();

    await page.getByLabel("Shelf life").fill("");
    await page.getByLabel("Shelf life").blur();
    await page.getByLabel("Low-stock threshold").fill("");
    await page.getByLabel("Low-stock threshold").blur();
    await page.getByRole("button", { name: "Remove tag winter" }).click();
    await page.reload();
    await expect(page.getByLabel("Shelf life")).toHaveValue("");
    await expect(page.getByLabel("Low-stock threshold")).toHaveValue("");
    await expect(page.getByText("winter")).toHaveCount(0);
  });

  test("shell design steps and shop colour autosave", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/products");
    await page.getByRole("button", { name: "Add new product" }).click();
    await page.getByRole("textbox", { name: "Product name" }).fill("Shell Design Product");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/products\/.+/);

    await page.getByRole("button", { name: "Shell design", exact: true }).click();

    // Shop colour: switching from auto to custom persists without a Save.
    await page.getByTestId("shop-color-override").click();
    await expect(page.getByTestId("shop-color-input")).toBeVisible();

    // A decoration step persists too — this editor used to be Save-gated.
    await page.getByRole("button", { name: /Add decoration step/i }).click();

    await page.reload();
    await page.getByRole("button", { name: "Shell design", exact: true }).click();
    await expect(page.getByTestId("shop-color-input")).toBeVisible();
    await expect(page.getByRole("button", { name: /Add decoration step/i })).toBeVisible();
    await expect(page.getByText("No shell design steps recorded yet.")).toHaveCount(0);
  });

  test("removing the product photo persists", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/products");
    await page.getByRole("button", { name: "Add new product" }).click();
    await page.getByRole("textbox", { name: "Product name" }).fill("Photo Product");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/products\/.+/);

    // A 1x1 PNG is enough — the field stores a base64 data URL.
    await page.setInputFiles('input[type="file"]', {
      name: "pic.png",
      mimeType: "image/png",
      buffer: Buffer.from(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
        "base64",
      ),
    });
    await expect(page.getByRole("button", { name: "Replace photo" })).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Replace photo" })).toBeVisible();

    // Two-step inline confirm, then the clear must survive a reload.
    await page.getByRole("button", { name: "Remove photo" }).click();
    await page.getByRole("button", { name: "Yes" }).click();
    await expect(page.getByRole("button", { name: "Add photo" }).first()).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: "Add photo" }).first()).toBeVisible();
  });
});
