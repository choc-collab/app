import { test, expect } from "./fixtures";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

test.describe("CSV Import — Ingredients", () => {
  test.setTimeout(60000);

  /** Write a CSV string to a temp file and return its path. */
  function writeTempCSV(content: string): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "csv-import-"));
    const filePath = path.join(dir, "ingredients.csv");
    fs.writeFileSync(filePath, content, "utf-8");
    return filePath;
  }

  test("Settings page has Import tab", async ({ page }) => {
    await page.goto("/settings");
    const tab = page.getByRole("button", { name: "Import" });
    await expect(tab).toBeVisible();
  });

  test("Import tab shows template download and file picker", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Import" }).click();

    await expect(page.getByText("Import Data")).toBeVisible();
    await expect(page.getByText("Download CSV template")).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose CSV file…" })).toBeVisible();
  });

  test("download template triggers a CSV file download", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Import" }).click();

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByText("Download CSV template").click(),
    ]);

    expect(download.suggestedFilename()).toBe("ingredient-template.csv");
  });

  test("upload valid CSV shows preview and imports", async ({ page }) => {
    const csv = [
      "name,manufacturer,category,cacaoFat,sugar,milkFat,water,solids,otherFats",
      "Test Dark Chocolate,Valrhona,Chocolate,38,28,0,1,15,18",
      "Test Cream,Local Dairy,Liquids,0,0,35,60,0,5",
    ].join("\n");

    const filePath = writeTempCSV(csv);

    await page.goto("/settings");
    await page.getByRole("button", { name: "Import" }).click();

    // Upload the file
    await page.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles(filePath);

    // Preview should show
    await expect(page.getByText("2 rows")).toBeVisible();
    await expect(page.getByText("2 valid")).toBeVisible();
    await expect(page.getByText("Test Dark Chocolate")).toBeVisible();
    await expect(page.getByText("Test Cream")).toBeVisible();

    // Import
    await page.getByRole("button", { name: "Import 2 ingredients" }).click();
    await expect(page.getByText("2 ingredients imported")).toBeVisible();

    // Verify the ingredients exist
    await page.goto("/ingredients");
    await expect(page.getByText("Test Dark Chocolate")).toBeVisible();
    await expect(page.getByText("Test Cream")).toBeVisible();
  });

  test("shows validation errors for rows missing name", async ({ page }) => {
    const csv = [
      "name,manufacturer,category",
      ",Valrhona,Chocolate",
      "Valid Ingredient,,Liquids",
    ].join("\n");

    const filePath = writeTempCSV(csv);

    await page.goto("/settings");
    await page.getByRole("button", { name: "Import" }).click();

    await page.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles(filePath);

    // Should show 1 error row
    await expect(page.getByText("1 with errors")).toBeVisible();
    await expect(page.getByText("1 valid")).toBeVisible();
    await expect(page.getByRole("button", { name: "Import 1 ingredient" })).toBeVisible();
  });

  test("skips duplicate ingredients", async ({ page }) => {
    // First import
    const csv1 = "name,category\nDuplicate Test Ingredient,Sugars\n";
    const filePath1 = writeTempCSV(csv1);

    await page.goto("/settings");
    await page.getByRole("button", { name: "Import" }).click();
    await page.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles(filePath1);
    await page.getByRole("button", { name: "Import 1 ingredient" }).click();
    await expect(page.getByText("1 ingredient imported")).toBeVisible();

    // Second import — same name should be skipped
    await page.getByRole("button", { name: "Import more" }).click();
    const csv2 = "name,category\nDuplicate Test Ingredient,Sugars\nNew Ingredient,Fats\n";
    const filePath2 = writeTempCSV(csv2);
    await page.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles(filePath2);
    // Preview shows both rows as valid (dedup happens on commit)
    await page.getByRole("button", { name: "Import 2 ingredients" }).click();
    await expect(page.getByText("1 ingredient imported")).toBeVisible();
    await expect(page.getByText("1 skipped (already exist)")).toBeVisible();
  });

  test("empty CSV shows error", async ({ page }) => {
    const csv = "name,category\n";
    const filePath = writeTempCSV(csv);

    await page.goto("/settings");
    await page.getByRole("button", { name: "Import" }).click();
    await page.locator('input[type="file"][accept=".csv,text/csv"]').setInputFiles(filePath);

    await expect(page.getByText("empty or contains only headers")).toBeVisible();
  });
});
