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
  // Tolerate an optional trailing slash — Next 16 sometimes appends one even
  // when the link doesn't include it.
  await page.waitForURL((url) => detailUrlPattern.test(url.toString().replace(/\/$/, "")), {
    timeout: 10_000,
  });
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

  // ── 08 · Today dashboard — landing surface for daily ops ───────────────
  await page.goto("/today");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, "today-dashboard.png") });

  // ── 09 · Shop landing — Ready tab with prepared boxes ──────────────────
  await page.goto("/shop");
  await page.waitForLoadState("networkidle");
  await page.waitForTimeout(600);
  await page.screenshot({ path: path.join(OUT, "shop-landing.png") });

  // ── 10 · Label editor — Box of 9 full label, populated from demo data ──
  // Opens the demo "Box of 9 — full label" template, picks a box-of-9 source
  // so the preview populates with real demo data (brand block, ingredients,
  // allergens, boxed nutrition, dates, QR), and dials zoom down to 100% so
  // the whole 80×100 mm label fits in the viewport.
  await page.goto("/labels");
  await page.waitForLoadState("networkidle");
  const boxRow = page.getByRole("link", { name: /Box of 9.*full label/i }).first();
  await boxRow.waitFor({ state: "visible", timeout: 10_000 });
  await boxRow.click();
  await page.waitForURL((url) => /\/labels\/[^/]+$/.test(url.toString().replace(/\/$/, "")), {
    timeout: 10_000,
  });
  await page.waitForTimeout(500);

  // Pick the Standard Line × Luxury Box (9 pcs) source so the preview pulls
  // a real packed sale and renders populated ingredients / allergens /
  // nutrition.
  const sourceSelect = page.locator("select").first();
  await sourceSelect.waitFor({ state: "visible", timeout: 5_000 });
  const optionLabels = await sourceSelect.locator("option").allTextContents();
  const box9Idx = optionLabels.findIndex((t) => /Luxury Box \(9 pcs\)/.test(t));
  if (box9Idx > 0) await sourceSelect.selectOption({ index: box9Idx });

  // Dial zoom from default 300% down to 100% so the whole label is visible.
  // The minus button uses U+2212 (true minus sign); use exact-text matching
  // so we don't accidentally hit a hyphen-bearing button elsewhere.
  const zoomOut = page.locator('button:text-is("−")').first();
  for (let i = 0; i < 4; i++) {
    await zoomOut.click();
    await page.waitForTimeout(80);
  }

  // Settle the SVG preview + live query.
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(OUT, "label-editor-box.png") });

  const files = await fs.readdir(OUT);
  console.log("Captured screenshots:", files.sort());
});
