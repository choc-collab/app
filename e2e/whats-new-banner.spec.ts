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

  test("an upgrade that crosses v0.8.0 calls out the Pantry autosave change", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/fillings/");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Autosave Upgrader");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Autosave Upgrader").first()).toBeVisible({ timeout: 15000 });

    // Coming from 0.7.x, the pencil and Save button vanish from every detail
    // page — a control the user had learned to look for, so the banner says so.
    await setLastSeenVersion(page, "0.7.0");
    await page.reload();

    await expect(page.locator(BANNER)).toBeVisible({ timeout: 10000 });
    await expect(page.locator(BANNER)).toContainText(/the Pantry saves as you type/);
    // The Orders callout belongs to 0.7.0, which this upgrade does not cross.
    await expect(page.locator(BANNER)).not.toContainText(/meet\s+Orders/);
  });

  test("an upgrade that crosses v0.9.0 introduces the Log, without re-announcing older releases", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/fillings/");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Log Upgrader");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Log Upgrader").first()).toBeVisible({ timeout: 15000 });

    // Coming from 0.8.x: only the Log is new to this user.
    await setLastSeenVersion(page, "0.8.0");
    await page.reload();

    await expect(page.locator(BANNER)).toBeVisible({ timeout: 10000 });
    await expect(page.locator(BANNER)).toContainText(/meet the\s+Log/);
    await expect(page.locator(BANNER)).not.toContainText(/the Pantry saves as you type/);
    await expect(page.locator(BANNER)).not.toContainText(/meet\s+Orders/);
    // The callout links to the new section
    await page.locator(BANNER).getByRole("link", { name: "Log", exact: true }).click();
    await expect(page).toHaveURL(/\/log\/?$/);
  });

  test("an upgrade that does not reach the current release omits every callout", async ({ page }) => {
    test.setTimeout(60000);
    await page.goto("/fillings/");
    await page.getByRole("button", { name: "Add filling" }).click();
    await page.getByRole("textbox", { name: "Filling name" }).fill("Already Current");
    await page.keyboard.press("Enter");
    await expect(page.getByText("Already Current").first()).toBeVisible({ timeout: 15000 });

    // Already on the current release — no banner at all, so no callout.
    await setLastSeenVersion(page, "0.9.0");
    await page.reload();
    await expect(page.getByText("Already Current").first()).toBeVisible({ timeout: 15000 });
    await expect(page.locator(BANNER)).toHaveCount(0);
  });
});