import { test, expect } from "./fixtures";
import type { Page } from "@playwright/test";

const BANNER = '[data-testid="whats-new-banner"]';

async function setLastSeenVersion(page: Page, version: string | null) {
  await page.evaluate(async (v) => {
    await new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("ChocolatierDB");
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction("userPreferences", "readwrite");
        const store = tx.objectStore("userPreferences");
        const getAll = store.getAll();
        getAll.onsuccess = () => {
          const rows = getAll.result as Array<{ id?: string; lastSeenVersion?: string }>;
          const existing = rows[0];
          if (existing) {
            if (v === null) {
              delete existing.lastSeenVersion;
            } else {
              existing.lastSeenVersion = v;
            }
            store.put(existing);
          } else if (v !== null) {
            store.add({
              id: "prefs-" + Math.random().toString(36).slice(2),
              marketRegion: "EU",
              currency: "EUR",
              defaultFillMode: "percentage",
              facilityMayContain: [],
              coatings: [],
              lastSeenVersion: v,
              updatedAt: new Date(),
            });
          }
        };
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
      req.onerror = () => reject(req.error);
    });
  }, version);
}

test.describe("What's new banner", () => {
  test("does not appear on a fresh install (no user data)", async ({ page }) => {
    await page.goto("/fillings/");
    // Give React a tick to render; the banner must stay absent.
    await expect(page.locator(BANNER)).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(page.locator(BANNER)).toHaveCount(0);
  });

  test("shows for an upgrading user and stays dismissed after reload", async ({ page }) => {
    // Step 1: create user-authored data so the banner's fresh-install
    // heuristic doesn't silently seed lastSeenVersion.
    await page.goto("/fillings/");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Upgrader Ganache");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Upgrader Ganache").first()).toBeVisible({ timeout: 15000 });

    // Step 2: simulate a pre-v0.2 user whose preferences row predates the
    // banner by pinning lastSeenVersion to an older release.
    await setLastSeenVersion(page, "0.1.0");
    await page.reload();

    // Banner should appear referencing the older version.
    await expect(page.locator(BANNER)).toBeVisible({ timeout: 10000 });
    await expect(page.locator(BANNER)).toContainText(/What.?s new in v/);
    await expect(page.locator(BANNER)).toContainText(/since v0\.1\.0/);

    // Step 3: dismiss → banner disappears immediately.
    await page.locator(BANNER).getByRole("button", { name: "Dismiss what's new banner" }).click();
    await expect(page.locator(BANNER)).toHaveCount(0);

    // Step 4: persistence — dismiss writes lastSeenVersion, reload must not bring it back.
    await page.reload();
    await expect(page.getByText("Upgrader Ganache").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator(BANNER)).toHaveCount(0);
  });
});
