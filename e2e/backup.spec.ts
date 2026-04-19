import { test, expect } from "./fixtures";

// All tables that must appear in every export
const ALL_TABLES = [
  "ingredients",
  "products",
  "productCategories",
  "fillings",
  "productFillings",
  "fillingIngredients",
  "moulds",
  "productionPlans",
  "planProducts",
  "planStepStatus",
  "settings",
  "userPreferences",
  "productFillingHistory",
  "ingredientPriceHistory",
  "coatingChocolateMappings",
  "productCostSnapshots",
  "packaging",
  "packagingOrders",
  "decorationMaterials",
  "decorationCategories",
  "shellDesigns",
  "experiments",
  "experimentIngredients",
  "shoppingItems",
  "collections",
  "collectionProducts",
  "collectionPackagings",
  "collectionPricingSnapshots",
  "fillingStock",
  "fillingCategories",
];

test.describe("Backup & Restore", () => {
  test.setTimeout(60000);

  test("export JSON contains all expected table keys", async ({ page }) => {
    await page.goto("/settings");

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export backup" }).click(),
    ]);

    const stream = await download.createReadStream();
    const chunks: Buffer[] = [];
    for await (const chunk of stream) chunks.push(Buffer.from(chunk));
    const json = JSON.parse(Buffer.concat(chunks).toString("utf-8"));

    expect(json.version).toBeDefined();
    expect(json.exportedAt).toBeDefined();

    for (const table of ALL_TABLES) {
      expect(json, `table "${table}" missing from backup JSON`).toHaveProperty(table);
      expect(Array.isArray(json[table]), `"${table}" should be an array`).toBe(true);
    }
  });

  test("round-trip: data survives export then import in same context", async ({ page }) => {
    // Create a product
    await page.goto("/products");
    await page.getByRole("button", { name: "Add new product" }).click();
    await page.getByRole("textbox", { name: "Product name" }).fill("Backup Test Product");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/\/products\/.+/, { timeout: 30000 });

    // Create a shopping item (exercises shoppingItems table)
    await page.goto("/shopping");
    await page.getByRole("button", { name: /Add an item/i }).click();
    await page.getByPlaceholder("Item name…").fill("Backup Test Item");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Backup Test Item")).toBeVisible();

    // Export backup and capture the file
    await page.goto("/settings");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export backup" }).click(),
    ]);
    const backupPath = await download.path();
    expect(backupPath).toBeTruthy();

    // Import the backup (clears all data then reimports from file)
    await page.locator('input[type="file"][accept=".json,application/json"]').setInputFiles(backupPath!);
    await page.getByRole("button", { name: "Yes, replace all data" }).click();
    await expect(page.getByText("Restore complete")).toBeVisible({ timeout: 15000 });

    // Reload as instructed by the UI
    await page.reload();

    // Verify product survived
    await page.goto("/products");
    await expect(page.getByText("Backup Test Product")).toBeVisible();

    // Verify shopping item survived (exercises shoppingItems restore)
    await page.goto("/shopping");
    await expect(page.getByText("Backup Test Item")).toBeVisible();
  });

  test("import overwrites existing data with backup contents", async ({ page }) => {
    // Create original data
    await page.goto("/shopping");
    await page.getByRole("button", { name: /Add an item/i }).click();
    await page.getByPlaceholder("Item name…").fill("Original Item");
    await page.getByRole("button", { name: "Add" }).click();
    await expect(page.getByText("Original Item")).toBeVisible();

    // Export (only has "Original Item")
    await page.goto("/settings");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export backup" }).click(),
    ]);
    const backupPath = await download.path();

    // Insert a second item directly into IndexedDB (avoids re-render instability from navigating
    // back to /shopping while Dexie LiveQuery is still settling after the export round-trip)
    await page.evaluate(() => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("ChocolatierDB");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction("shoppingItems", "readwrite");
          tx.objectStore("shoppingItems").put({ id: "post-backup-item", name: "Post-Backup Item", addedAt: Date.now() });
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
        };
        req.onerror = () => reject(req.error);
      });
    });

    // Restore from the earlier backup
    await page.goto("/settings");
    await page.locator('input[type="file"][accept=".json,application/json"]').setInputFiles(backupPath!);
    await page.getByRole("button", { name: "Yes, replace all data" }).click();
    await expect(page.getByText("Restore complete")).toBeVisible({ timeout: 15000 });
    await page.reload();

    // Original item should be back; post-backup item should be gone
    await page.goto("/shopping");
    await expect(page.getByText("Original Item")).toBeVisible();
    await expect(page.getByText("Post-Backup Item")).not.toBeVisible();
  });
});
