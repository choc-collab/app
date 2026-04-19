/**
 * Captures screenshots used by the Getting Started guide
 * (src/app/(public)/getting-started/page.tsx).
 *
 * Run with: npm run docs:screenshots
 *
 * This is NOT part of the regular test suite — it's a generation script
 * that happens to use Playwright. It writes PNGs to public/docs/screenshots/
 * and is intended to be re-run whenever the UI changes.
 *
 * OS-level shots (iOS Share sheet, Android install banner) cannot be
 * captured here and must be taken manually.
 */
import { test, expect } from "./fixtures";
import path from "path";
import fs from "fs/promises";

const OUT = path.resolve(process.cwd(), "public", "docs", "screenshots");
const VIEWPORT = { width: 1440, height: 900 };

async function openFirstCardUnder(
  page: import("@playwright/test").Page,
  listUrl: string,
  detailUrlPattern: RegExp,
) {
  await page.goto(listUrl);
  const first = page
    .locator("main a")
    .filter({ has: page.locator("h3") })
    .first();
  await first.waitFor({ state: "visible" });
  await first.click();
  await page.waitForURL(detailUrlPattern, { timeout: 10_000 });
  // Small settle delay for client-rendered content
  await page.waitForTimeout(400);
}

test.describe.configure({ mode: "serial" });

test.use({ viewport: VIEWPORT });

test.beforeAll(async () => {
  await fs.mkdir(OUT, { recursive: true });
});

test("capture all getting-started screenshots", async ({ page }) => {
  test.setTimeout(120_000);

  // ── 01 · Settings → Demo Mode tab (before loading) ─────────────────────
  await page.goto("/settings");
  await page.getByRole("button", { name: "Demo Mode", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Demo Data" })).toBeVisible();
  await page.screenshot({ path: path.join(OUT, "settings-demo.png") });

  // ── Load demo data so subsequent pages have real content ───────────────
  await page.getByRole("button", { name: "Load demo data" }).click();
  await page.waitForSelector("text=/Demo data loaded|already loaded/i", { timeout: 20_000 });

  // ── 02 · Ingredient edit form ──────────────────────────────────────────
  await openFirstCardUnder(page, "/ingredients", /\/ingredients\/[^/]+$/);
  await page.screenshot({ path: path.join(OUT, "ingredient-edit.png") });

  // ── 03 · Filling editor ────────────────────────────────────────────────
  await openFirstCardUnder(page, "/fillings", /\/fillings\/[^/]+$/);
  await page.screenshot({ path: path.join(OUT, "filling-editor.png") });

  // ── 04 · Product detail — composition tab ──────────────────────────────
  await openFirstCardUnder(page, "/products", /\/products\/[^/]+$/);
  await page.screenshot({ path: path.join(OUT, "product-composition.png") });

  // ── 05 · Production list (entry to the wizard) ─────────────────────────
  await page.goto("/production");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "production-wizard.png") });

  // ── 06 · Stock page ────────────────────────────────────────────────────
  await page.goto("/stock");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, "stock-products.png") });

  // ── 07 · Collection detail ─────────────────────────────────────────────
  await openFirstCardUnder(page, "/collections", /\/collections\/[^/]+$/);
  await page.screenshot({ path: path.join(OUT, "collection-pricing.png") });

  const files = await fs.readdir(OUT);
  console.log("Captured screenshots:", files.sort());
});
