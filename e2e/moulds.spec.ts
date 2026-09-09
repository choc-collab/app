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

  test("list renders as a table with column headers", async ({ page }) => {
    await page.goto("/moulds");
    await page.getByRole("button", { name: "Add mould" }).click();
    await page.getByPlaceholder("Mould name *").fill("Bonbon Frame");
    await page.getByRole("button", { name: "Create Mould" }).click();
    await expect(page).toHaveURL(/\/moulds\/.+/);

    await page.goto("/moulds");
    const table = page.getByRole("table", { name: "Moulds" });
    await expect(table).toBeVisible();
    for (const header of ["Mould", "Brand", "Cavity weight & count", "Owned", "Updated"]) {
      await expect(table.getByRole("columnheader", { name: header })).toBeVisible();
    }
    await expect(page.getByText("Bonbon Frame")).toBeVisible();

    await page.getByText("Bonbon Frame").click();
    await expect(page).toHaveURL(/\/moulds\/.+/);
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

/** Create one mould and land on its detail page. */
async function createMould(page: import("@playwright/test").Page, name: string) {
  await page.goto("/moulds");
  await page.getByRole("button", { name: "Add mould" }).click();
  await page.getByPlaceholder("Mould name *").fill(name);
  await page.getByRole("button", { name: "Create Mould" }).click();
  await expect(page).toHaveURL(/\/moulds\/.+/);
}

test.describe("Mould detail", () => {
  test("autosaves properties and notes with no Save button", async ({ page }) => {
    test.setTimeout(90000);
    await createMould(page, "Polycarbonate 24");

    await expect(page.getByRole("button", { name: "Save" })).toHaveCount(0);

    await page.getByLabel("Product number").fill("MA1234");
    await page.getByLabel("Product number").blur();
    await page.getByLabel("Brand").fill("Martellato");
    await page.getByLabel("Brand").blur();
    await page.getByLabel("Cavity weight").fill("12.5");
    await page.getByLabel("Cavity weight").blur();
    await page.getByLabel("Number of cavities").fill("24");
    await page.getByLabel("Number of cavities").blur();
    await page.getByLabel("Moulds owned").fill("3");
    await page.getByLabel("Moulds owned").blur();
    await page.getByLabel("Notes", { exact: true }).fill("Warms fast — temper cool");
    await page.getByLabel("Notes", { exact: true }).blur();

    await page.reload();
    await expect(page.getByLabel("Product number")).toHaveValue("MA1234");
    await expect(page.getByLabel("Brand")).toHaveValue("Martellato");
    await expect(page.getByLabel("Cavity weight")).toHaveValue("12.5");
    await expect(page.getByLabel("Number of cavities")).toHaveValue("24");
    await expect(page.getByLabel("Moulds owned")).toHaveValue("3");
    await expect(page.getByLabel("Notes", { exact: true })).toHaveValue("Warms fast — temper cool");
  });

  test("derives total weight and filling per cavity, and lets the fill be overridden", async ({ page }) => {
    test.setTimeout(90000);
    await createMould(page, "Derived Mould");

    await page.getByLabel("Cavity weight").fill("10");
    await page.getByLabel("Cavity weight").blur();
    await page.getByLabel("Number of cavities").fill("15");
    await page.getByLabel("Number of cavities").blur();

    // 10 × 15 = 150 g total; filling defaults to the app-wide fill factor.
    await expect(page.getByText("150 g")).toBeVisible();
    await expect(page.getByText(/Derived from the cavity weight/)).toBeVisible();

    // An explicit value replaces the derived one, and the hint goes away.
    await page.getByLabel("Filling per cavity").fill("6");
    await page.getByLabel("Filling per cavity").blur();
    await expect(page.getByText(/Derived from the cavity weight/)).toHaveCount(0);

    await page.reload();
    await expect(page.getByLabel("Filling per cavity")).toHaveValue("6");

    // Clearing it restores the derived value rather than storing zero.
    await page.getByLabel("Filling per cavity").fill("");
    await page.getByLabel("Filling per cavity").blur();
    await page.reload();
    await expect(page.getByLabel("Filling per cavity")).toHaveValue("");
    await expect(page.getByText(/Derived from the cavity weight/)).toBeVisible();
  });

  test("rejects a zero cavity weight rather than writing it", async ({ page }) => {
    test.setTimeout(90000);
    await createMould(page, "Guarded Mould");

    await page.getByLabel("Cavity weight").fill("10");
    await page.getByLabel("Cavity weight").blur();

    // Cavity weight drives every downstream weight, so 0 is refused and the
    // field snaps back to the stored value.
    await page.getByLabel("Cavity weight").fill("0");
    await page.getByLabel("Cavity weight").blur();
    await expect(page.getByLabel("Cavity weight")).toHaveValue("10");
  });

  test("shows a distinct not-found state for a missing mould", async ({ page }) => {
    await page.goto("/moulds/does-not-exist");
    await expect(page.getByText(/This mould doesn.t exist\./)).toBeVisible();
    await expect(page.getByText("Loading…")).toHaveCount(0);
  });
});
