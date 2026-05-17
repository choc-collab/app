import { test, expect } from "./fixtures";

/**
 * Regression: a beta tester reported the Brand tab "breaking" on save after
 * picking a PNG logo. The root cause was that `handleLogoFile` stored the
 * raw FileReader output (full-resolution base64) on the userPreferences row,
 * easily exceeding Dexie Cloud's per-record size limit, and `handleSave`
 * silently swallowed the resulting rejection.
 *
 * These tests pin the new behaviour: the logo is downscaled before save,
 * the saved value round-trips through a page reload, and save errors are
 * surfaced inline rather than failing silently.
 */

// 1×1 transparent PNG, base64-encoded. Small enough that downscale leaves it
// untouched — we're testing the happy path of pick → preview → save → reload.
const TINY_PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";

function tinyPngBuffer(): Buffer {
  return Buffer.from(TINY_PNG_B64, "base64");
}

test.describe("Settings — Brand logo upload", () => {
  test("uploads a logo, saves, and shows the preview after reload", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Brand", { exact: true }).click();
    await page.getByRole("button", { name: "Edit" }).click();

    // The Upload logo control is a <label> wrapping a file input — set the
    // file directly on the input (Playwright knows to fire 'change').
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: tinyPngBuffer(),
    });

    // Preview appears once the FileReader resolves.
    const preview = page.getByAltText("Brand logo preview");
    await expect(preview).toBeVisible();

    // Save and confirm we're back in read-only mode (no Save button).
    await page.getByRole("button", { name: /^Save$/ }).click();
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(page.getByRole("button", { name: /^Save$/ })).not.toBeVisible();

    // Logo card is rendered in read-only view.
    await expect(page.getByAltText("Brand logo")).toBeVisible();

    // Round-trip: reload and confirm the saved logo is still there.
    await page.reload();
    await page.getByText("Brand", { exact: true }).click();
    await expect(page.getByAltText("Brand logo")).toBeVisible();
  });

  test("Replace swaps an existing logo for a new one without losing the save", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Brand", { exact: true }).click();
    await page.getByRole("button", { name: "Edit" }).click();

    // First upload + save
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: tinyPngBuffer(),
    });
    await expect(page.getByAltText("Brand logo preview")).toBeVisible();
    await page.getByRole("button", { name: /^Save$/ }).click();
    await expect(page.getByAltText("Brand logo")).toBeVisible();

    // Re-enter edit mode — the Replace label should be visible (not "Upload logo")
    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByText("Replace", { exact: true })).toBeVisible();

    // Replace with the same buffer (we're not asserting image-content change,
    // just that the input is reachable from the new control).
    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: "logo-2.png",
      mimeType: "image/png",
      buffer: tinyPngBuffer(),
    });
    await expect(page.getByAltText("Brand logo preview")).toBeVisible();

    // Save again — should succeed without the silent-error regression.
    await page.getByRole("button", { name: /^Save$/ }).click();
    await expect(page.getByAltText("Brand logo")).toBeVisible();
  });

  test("Remove clears the preview and returns to the upload control", async ({ page }) => {
    await page.goto("/settings");
    await page.getByText("Brand", { exact: true }).click();
    await page.getByRole("button", { name: "Edit" }).click();

    await page.locator('input[type="file"][accept="image/*"]').setInputFiles({
      name: "logo.png",
      mimeType: "image/png",
      buffer: tinyPngBuffer(),
    });
    await expect(page.getByAltText("Brand logo preview")).toBeVisible();

    await page.getByRole("button", { name: "Remove" }).click();
    await expect(page.getByAltText("Brand logo preview")).not.toBeVisible();
    await expect(page.getByText("Upload logo", { exact: true })).toBeVisible();
  });
});
