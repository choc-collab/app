import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

async function createIngredient(page: Page, name: string) {
  await page.goto("/ingredients");
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByRole("textbox", { name: "Ingredient name" }).fill(name);
  await page.getByRole("button", { name: "Create Ingredient" }).click();
  await expect(page).toHaveURL(/\/ingredients\/.+/);
}

async function addIngredientToFilling(page: Page, ingredientName: string, grams: string) {
  await page.getByRole("button", { name: "Add ingredient" }).click();
  await page.getByPlaceholder("Search ingredient…").fill(ingredientName);
  await page.getByRole("button", { name: ingredientName }).click();
  await page.locator("form").getByRole("spinbutton").fill(grams);
  await page.locator("form").getByRole("button", { name: "Add" }).click();
}

/** A fillings-only plan whose single recipe is 300 g sugar + 100 g cream.
 *  Scaled to a 2000 g target that's ×5, so the checklist should read
 *  1.5 kg sugar and 500 g cream — one row over the kg threshold, one under. */
async function createPlanWithFillingRecipe(page: Page) {
  await createIngredient(page, "Caster sugar");
  await createIngredient(page, "Cream 35%");

  await page.goto("/fillings");
  await page.getByRole("button", { name: "Add filling" }).click();
  await page.getByRole("textbox", { name: "Filling name" }).fill("Salted caramel");
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/fillings\/.+/);
  await addIngredientToFilling(page, "Caster sugar", "300");
  await addIngredientToFilling(page, "Cream 35%", "100");

  await page.goto("/production/new?mode=fillings-only");
  await page.getByRole("button", { name: /Add filling/ }).click();
  await page.getByRole("button", { name: /Salted caramel/ }).click();
  await page.getByLabel(/Target grams for Salted caramel/).fill("2000");
  await page.getByRole("button", { name: /Create plan/ }).click();
  await expect(page).toHaveURL(/\/production\/(?!new)[^/?]+/, { timeout: 30_000 });
}

const checklist = (page: Page) => page.getByRole("dialog", { name: "Ingredient checklist" });

test.describe("Plan ingredient checklist", () => {
  test("rolls the plan's fillings up to one row per ingredient, scaled to the batch", async ({ page }) => {
    test.setTimeout(120_000);
    await createPlanWithFillingRecipe(page);

    await page.getByRole("button", { name: "Ingredient checklist" }).click();
    const dialog = checklist(page);
    await expect(dialog).toBeVisible();

    // ×5 of the recipe — and grams roll up to kg once past a kilo.
    await expect(dialog.getByRole("listitem").filter({ hasText: "Caster sugar" })).toContainText("1.5 kg");
    await expect(dialog.getByRole("listitem").filter({ hasText: "Cream 35%" })).toContainText("500 g");
    // The "why" behind each number.
    await expect(dialog.getByRole("listitem").filter({ hasText: "Caster sugar" })).toContainText("Salted caramel");
    await expect(dialog.getByText("0 of 2 checked")).toBeVisible();
  });

  test("ticking an ingredient survives closing the modal and reloading", async ({ page }) => {
    test.setTimeout(120_000);
    await createPlanWithFillingRecipe(page);

    await page.getByRole("button", { name: "Ingredient checklist" }).click();
    // A plain click rather than `.check()` — the checkbox is controlled by a
    // live query, so it only flips once the write lands.
    await checklist(page).getByLabel("I have Caster sugar").click();
    await expect(checklist(page).getByText("1 of 2 checked")).toBeVisible();

    await checklist(page).getByRole("button", { name: "Close checklist" }).click();
    await expect(checklist(page)).toHaveCount(0);

    await page.reload();
    await page.getByRole("button", { name: "Ingredient checklist" }).click();
    await expect(checklist(page).getByLabel("I have Caster sugar")).toBeChecked();
    await expect(checklist(page).getByLabel("I have Cream 35%")).not.toBeChecked();
    await expect(checklist(page).getByText("1 of 2 checked")).toBeVisible();
  });

  test("sending an ingredient to the shopping list carries how much is needed", async ({ page }) => {
    test.setTimeout(120_000);
    await createPlanWithFillingRecipe(page);

    await page.getByRole("button", { name: "Ingredient checklist" }).click();
    const creamRow = checklist(page).getByRole("listitem").filter({ hasText: "Cream 35%" });
    await creamRow.getByRole("button", { name: "Flag as low stock" }).click();
    await creamRow.getByRole("button", { name: "Yes" }).click();

    await page.goto("/shopping");
    const shoppingRow = page.getByRole("listitem").filter({ hasText: "Cream 35%" });
    await expect(shoppingRow).toBeVisible();
    // The amount worked out on the plan page survives the trip to the shop.
    await expect(shoppingRow).toContainText("need 500 g");
    // Marking it restocked clears the note along with the flag.
    await expect(page.getByText("Caster sugar")).toHaveCount(0);
  });

  test("a finished batch offers no checklist — there is nothing left to shop for", async ({ page }) => {
    test.setTimeout(120_000);
    await createPlanWithFillingRecipe(page);
    await expect(page.getByRole("button", { name: "Ingredient checklist" })).toBeVisible();

    // Completing every step finishes the plan.
    await page.getByRole("button", { name: /Make Salted caramel — batch for stock/ }).click();
    await expect(page.getByRole("button", { name: "Ingredient checklist" })).toHaveCount(0);
  });
});
