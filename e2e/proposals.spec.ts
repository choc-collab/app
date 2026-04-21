import { test, expect } from "./fixtures";

// ─── Prototype page — exercises the in-memory clickable preview ──────────────
// Backed by /proposals/nested-components which uses React state only, no Dexie
// writes. These tests lock the prototype UX so design intent survives refactors
// before the feature is actually built.
test.describe("Proposals — nested components prototype", () => {
  test("index page links to the prototype", async ({ page }) => {
    await page.goto("/proposals");
    await expect(page.getByRole("heading", { name: "Proposals" })).toBeVisible();
    await page.getByRole("link", { name: /Nested components/ }).click();
    await expect(page).toHaveURL(/\/proposals\/nested-components/);
    await expect(page.getByRole("heading", { name: /Nested components & filling-only plans/ })).toBeVisible();
  });

  test("switching between the two proposal tabs", async ({ page }) => {
    await page.goto("/proposals/nested-components");
    await expect(page.getByRole("button", { name: /Filling-in-filling/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /Filling-only plan/ }).click();
    await expect(page.getByRole("button", { name: /Filling-only plan/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Plan type", { exact: false })).toBeVisible();
  });

  // ─── Filling-in-filling tab ────────────────────────────────────────────────
  test.describe("Filling-in-filling", () => {
    test("expanding a nested filling row reveals its inner components", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      // Default host is "Dark caramel ganache" which contains the "Salted caramel base" filling
      const expandBtn = page.getByRole("button", { name: /Expand Salted caramel base/ });
      await expect(expandBtn).toBeVisible();
      await expandBtn.click();
      // Nested preview header appears
      await expect(page.getByText(/Inside Salted caramel base/)).toBeVisible();
      // Nested ingredients from caramel base are visible
      await expect(page.getByText("Caster sugar")).toBeVisible();
    });

    test("aggregate panel bubbles allergens up from nested fillings", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      // Dark caramel ganache uses Cream (milk) and Dark 70% (soy) directly,
      // plus the Caramel base which adds butter (milk again).
      const panel = page.locator("section", { hasText: "Aggregate · recursive" });
      await expect(panel.getByText("milk", { exact: true })).toBeVisible();
      await expect(panel.getByText("soy", { exact: true })).toBeVisible();
    });

    test("add-component picker switches between Ingredient and Filling sub-tabs", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      await page.getByRole("button", { name: /Add component/ }).click();
      // Ingredient is the default
      await expect(page.getByPlaceholder("Search ingredients…")).toBeVisible();
      await page.getByRole("button", { name: "Filling", exact: true }).click();
      await expect(page.getByPlaceholder("Search fillings…")).toBeVisible();
    });

    test("filling picker disables options that would create a cycle", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      // Host = Dark caramel ganache. Caramel base is already inside it, so adding
      // "Dark caramel ganache" to itself would cycle. Switch host to demonstrate —
      // pick "Salted caramel base", which would cycle if we tried to add a filling
      // that already references it.
      await page.getByLabel("Demo filling").selectOption({ label: "Salted caramel base" });
      await page.getByRole("button", { name: /Add component/ }).click();
      await page.getByRole("button", { name: "Filling", exact: true }).click();
      // Self-reference is blocked
      const selfOption = page.locator("button", { hasText: "Salted caramel base" }).last();
      await expect(selfOption).toBeDisabled();
      await expect(selfOption).toContainText(/Cycle/);
    });

    test("cycle-detection demo shows the destructive warning panel", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      await page.getByRole("button", { name: "Show demo" }).click();
      await expect(page.getByText("Would create a cycle")).toBeVisible();
      await page.getByRole("button", { name: "Hide demo" }).click();
      await expect(page.getByText("Would create a cycle")).not.toBeVisible();
    });

    test("component removal uses two-step inline confirmation", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      const firstRow = page.locator("div.divide-y").first().locator("> div").first();
      await firstRow.getByRole("button", { name: "Remove component" }).click();
      await expect(firstRow.getByText("Remove?")).toBeVisible();
      await firstRow.getByRole("button", { name: "Cancel" }).click();
      await expect(firstRow.getByText("Remove?")).not.toBeVisible();
    });

    test("adding an ingredient shows up in the component list and updates totals", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      // Caramel base starts with 4 components
      await page.getByLabel("Demo filling").selectOption({ label: "Salted caramel base" });
      await expect(page.getByText("Components (4)")).toBeVisible();
      await page.getByRole("button", { name: /Add component/ }).click();
      await page.getByPlaceholder("Search ingredients…").fill("hazel");
      await page.getByRole("button", { name: /Hazelnut praline/ }).click();
      await expect(page.getByText("Components (5)")).toBeVisible();
    });
  });

  // ─── Filling-only plan tab ─────────────────────────────────────────────────
  test.describe("Filling-only plan", () => {
    test("plan-type cards toggle the output form", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      await page.getByRole("button", { name: /Filling-only plan/ }).click();
      // Fillings-only is selected by default in the prototype
      const output = page.getByText("Filling batches");
      await expect(output).toBeVisible();
      await page.getByRole("button", { name: /Full production/ }).click();
      await expect(output).not.toBeVisible();
      await page.getByRole("button", { name: /Fillings only/ }).click();
      await expect(output).toBeVisible();
    });

    test("batch counts roll up into the total yield summary", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      await page.getByRole("button", { name: /Filling-only plan/ }).click();
      // Default rows: 2× caramel base + 1× dark caramel ganache → 3 batches, 1500g
      const summary = page.locator("section", { hasText: "Output" });
      await expect(summary.getByText("3", { exact: true })).toBeVisible();
      await expect(summary.getByText("1500g")).toBeVisible();
      // Bump caramel base from 2 → 5 batches
      const caramelInput = page.getByRole("spinbutton", { name: "Batches of Salted caramel base" });
      await caramelInput.fill("5");
      await caramelInput.blur();
      await expect(summary.getByText("6", { exact: true })).toBeVisible();
      await expect(summary.getByText("3000g")).toBeVisible();
    });

    test("adding a filling appends a row and removes it again", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      await page.getByRole("button", { name: /Filling-only plan/ }).click();
      await expect(page.getByText(/Fillings to make \(2\)/)).toBeVisible();
      await page.getByRole("button", { name: /Add filling/ }).click();
      await page.getByRole("button", { name: /Hazelnut praline/ }).click();
      await expect(page.getByText(/Fillings to make \(3\)/)).toBeVisible();
      // Remove it
      await page.getByRole("button", { name: "Remove Hazelnut praline" }).click();
      await expect(page.getByText(/Fillings to make \(2\)/)).toBeVisible();
    });
  });
});

// ─── Scope for the filling-in-filling feature (Feature A, not yet shipped) ──
// Skipped today — names serve as the contract for Feature A's E2E suite.
// Filling-only production (Feature B) ships with its own dedicated spec at
// e2e/production-fillings-only.spec.ts.
test.describe.skip("Filling-in-filling — shipping scope", () => {
  test("adding a filling to a filling persists across reload", async () => { /* */ });
  test("cost-per-100g recalculates when the nested filling is edited", async () => { /* */ });
  test("allergens propagate when a nested filling gains a new allergen", async () => { /* */ });
  test("save rejects cycles (self-ref, 2-hop, 3-hop)", async () => { /* */ });
  test("archiving a filling still in use as a nested component is blocked or cascades with confirmation", async () => { /* */ });
  test("forking a nested filling does NOT fork the host automatically", async () => { /* */ });
  test("production planner schedules nested-filling batches before the host", async () => { /* */ });
  test("nutrition engine aggregates nested fillings with correct per-g weighting", async () => { /* */ });
  test("backup/restore round-trips fillings with nested references intact", async () => { /* */ });
  test("import validates polymorphic refs and reports unknown filling IDs", async () => { /* */ });
});
