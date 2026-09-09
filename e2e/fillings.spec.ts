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

  test("detail page autosaves notes as you type, no Save button", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/fillings");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Caramel Filling");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fillings\/.+/);

    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);

    await page.getByPlaceholder("Tasting notes, substitutions, what to try next time…").fill("Rich buttery caramel with sea salt");
    await page.getByPlaceholder("Tasting notes, substitutions, what to try next time…").blur();

    // Persists without ever clicking a Save button
    await page.reload();
    await expect(page.getByPlaceholder("Tasting notes, substitutions, what to try next time…")).toHaveValue("Rich buttery caramel with sea salt");
  });

  test("detail page autosaves properties, method, and ingredients with no Save button", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/fillings");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Nougat");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fillings\/.+/);

    // Sidebar Properties — Status autosaves on blur
    const statusInput = page.getByPlaceholder("e.g. testing");
    await statusInput.fill("testing");
    await statusInput.blur();

    // Method — starts empty ("No steps yet."); click Add step, then fill the
    // new row. Step text lives in a textarea's value, not rendered text.
    await page.getByRole("button", { name: "Add step" }).click();
    const stepInput = page.getByPlaceholder("Describe this step…");
    await stepInput.fill("Whisk egg whites to soft peaks.");
    await stepInput.blur();

    await page.reload();
    await expect(page.getByPlaceholder("e.g. testing")).toHaveValue("testing");
    await expect(page.getByPlaceholder("Describe this step…")).toHaveValue("Whisk egg whites to soft peaks.");
  });

  test("duplicate filling creates a copy and lands on new detail page", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/fillings");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Original Filling");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fillings\/.+/);

    // Click duplicate — no Save button to click first, actions are always available
    await page.getByRole("button", { name: /Duplicate filling/i }).click();

    // Should land on new filling detail page. The duplicated name opens
    // pre-focused in the (still autosaving) rename input — commit it to see
    // the plain text. Target the input directly (rather than a blind global
    // keypress) since it needs a moment to mount past the loading skeleton.
    await expect(page).toHaveURL(/\/fillings\/.+/);
    const nameInput = page.locator('input[value*="(copy)"]');
    await nameInput.waitFor({ timeout: 30000 });
    await nameInput.press("Enter");
    await expect(page.getByText("Original Filling (copy)").first()).toBeVisible({ timeout: 30000 });
  });

  test("list renders as a table with column headers and group collapse", async ({ page }) => {
    test.setTimeout(60000);

    // Create two fillings in different categories so the list has two groups
    for (const [name, category] of [
      ["Hazelnut Praline", "Pralines & Giandujas (Nut-Based)"],
      ["Mango Gel", "Fruit-Based (Pectins & Acids)"],
    ] as const) {
      await page.goto("/fillings");
      await page.getByRole("button", { name: "Add filling" }).click();
      await page.getByRole("textbox", { name: "Filling name" }).fill(name);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/fillings\/.+/);
      // Category lives in the sidebar Properties card and autosaves on change.
      await page.locator("select").first().selectOption(category);
    }

    await page.goto("/fillings");
    const table = page.getByRole("table", { name: "Fillings" });
    await expect(table).toBeVisible();
    for (const header of ["Filling", "Status", "In stock", "Used in", "Last made", "Updated"]) {
      await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
    }
    await expect(page.getByText("Hazelnut Praline")).toBeVisible();
    await expect(page.getByText("Mango Gel")).toBeVisible();

    // Both rows show "0" used-in since neither is on a product yet
    await expect(table.getByText("0", { exact: true }).first()).toBeVisible();

    // Collapsing all groups hides both rows; expanding restores them
    await page.getByRole("button", { name: "Collapse all" }).click();
    await expect(page.getByText("Hazelnut Praline")).not.toBeVisible();
    await expect(page.getByText("Mango Gel")).not.toBeVisible();
    await page.getByRole("button", { name: "Expand all" }).click();
    await expect(page.getByText("Hazelnut Praline")).toBeVisible();
    await expect(page.getByText("Mango Gel")).toBeVisible();

    // Clicking a row navigates to its detail page
    await page.getByText("Hazelnut Praline").click();
    await expect(page).toHaveURL(/\/fillings\/.+/);
  });

  test("group collapse state persists across navigation and reload", async ({ page }) => {
    test.setTimeout(60000);

    for (const [name, category] of [
      ["Hazelnut Praline", "Pralines & Giandujas (Nut-Based)"],
      ["Mango Gel", "Fruit-Based (Pectins & Acids)"],
    ] as const) {
      await page.goto("/fillings");
      await page.getByRole("button", { name: "Add filling" }).click();
      await page.getByRole("textbox", { name: "Filling name" }).fill(name);
      await page.keyboard.press("Enter");
      await expect(page).toHaveURL(/\/fillings\/.+/);
      // Category lives in the sidebar Properties card and autosaves on change.
      await page.locator("select").first().selectOption(category);
    }

    await page.goto("/fillings");
    // Collapse just the Pralines group (leave Fruit-Based expanded)
    await page.getByRole("button", { name: /Pralines/ }).click();
    await expect(page.getByText("Hazelnut Praline")).not.toBeVisible();
    await expect(page.getByText("Mango Gel")).toBeVisible();

    // Navigate to a detail page and back — collapse state should survive
    await page.getByText("Mango Gel").click();
    await expect(page).toHaveURL(/\/fillings\/.+/);
    await page.goBack();
    await expect(page.getByText("Hazelnut Praline")).not.toBeVisible();
    await expect(page.getByText("Mango Gel")).toBeVisible();

    // Reloading the page should also preserve it (sessionStorage, not component state)
    await page.reload();
    await expect(page.getByText("Hazelnut Praline")).not.toBeVisible();
    await expect(page.getByText("Mango Gel")).toBeVisible();
  });

  test("delete filling from detail page returns to list", async ({ page }) => {
    await page.goto("/fillings");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Delete Me");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fillings\/.+/);

    await page.getByRole("button", { name: /Delete filling/i }).click();
    await page.getByRole("button", { name: /Yes, delete filling/i }).click();

    await expect(page).toHaveURL("/fillings/");
    await expect(page.getByText("Delete Me")).not.toBeVisible();
  });

  test("stock card and Batches tab surface filling stock and when it was last made", async ({ page }) => {
    test.setTimeout(90000);

    // Create a shelf-stable filling, then register two stock batches against it
    // via the Stock page (the same path production uses).
    await page.goto("/fillings");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Batch History Praline");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fillings\/.+/);
    const fillingUrl = page.url().split("?")[0];
    await page.locator("select").first().selectOption("Pralines & Giandujas (Nut-Based)");

    await page.goto("/stock");
    await page.getByRole("button", { name: "Fillings" }).click();
    await page.getByRole("button", { name: "Add filling stock" }).click();
    await page.getByLabel("Select filling").selectOption({ label: "Batch History Praline" });
    await page.getByPlaceholder("Amount in grams").fill("450");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.locator("text=450g").first()).toBeVisible();

    // Back on the filling: the sidebar Stock card totals it, and a Batches tab appears.
    await page.goto(fillingUrl);
    await expect(page.getByText("Available", { exact: true })).toBeVisible();
    await expect(page.getByText("450g", { exact: true })).toBeVisible();
    await expect(page.getByText("Last made", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Batches" }).click();
    await expect(page.getByText("450g left")).toBeVisible();
  });

  test("filling with no stock shows an empty stock card and no Batches tab", async ({ page }) => {
    await page.goto("/fillings");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Never Made");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/fillings\/.+/);

    await expect(page.getByText("None in stock or freezer.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Batches" })).toHaveCount(0);
  });

  test("shows a distinct not-found state for a missing filling, not the loading string", async ({ page }) => {
    await page.goto("/fillings/does-not-exist");
    await expect(page.getByText(/This filling doesn.t exist\./)).toBeVisible();
    await expect(page.getByText("Loading…")).not.toBeVisible();
    await page.getByRole("link", { name: "Back to Fillings" }).click();
    await expect(page).toHaveURL(/\/fillings\/?$/);
  });
});
