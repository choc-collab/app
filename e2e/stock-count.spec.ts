import { test, expect } from "./fixtures";
import { seedShopFixtures } from "./shop-fixtures";
import type { Page } from "@playwright/test";

/**
 * Bulk stocktake (`/stock/count`) and the dashboard reminder that links to it.
 *
 * `seedShopFixtures` gives us two products with 10 pieces each on a completed
 * plan — the cheapest way to get real product stock without driving the whole
 * production wizard.
 */

/** Backdate the seeded plan and stamp/clear per-product count timestamps, so
 *  the reminder's age arithmetic has something to bite on. */
async function ageSeededStock(
  page: Page,
  opts: { planCompletedDaysAgo: number; countedDaysAgo?: number },
) {
  await page.evaluate(({ planCompletedDaysAgo, countedDaysAgo }) => {
    const DAY = 24 * 60 * 60 * 1000;
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("ChocolatierDB");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(["productionPlans", "products"], "readwrite");
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = () => reject(tx.error);

        const plans = tx.objectStore("productionPlans");
        const planReq = plans.get("fix-plan-1");
        planReq.onsuccess = () => {
          const plan = planReq.result;
          if (plan) {
            plan.completedAt = new Date(Date.now() - planCompletedDaysAgo * DAY);
            plans.put(plan);
          }
        };

        const products = tx.objectStore("products");
        for (const id of ["fix-p-1", "fix-p-2"]) {
          const r = products.get(id);
          r.onsuccess = () => {
            const p = r.result;
            if (!p) return;
            if (countedDaysAgo === undefined) delete p.stockCountedAt;
            else p.stockCountedAt = Date.now() - countedDaysAgo * DAY;
            products.put(p);
          };
        }
      };
    });
  }, opts);
}

/** Assert the sticky tally panel's three readouts. Each is a labelled group,
 *  so "0 changed" and "0 net" can't be confused for one another. */
async function expectTally(
  page: Page,
  expected: { included: string; changed: string; net: string },
) {
  const tally = page.getByRole("region", { name: "Stocktake tally" });
  await expect(tally.getByRole("group", { name: "Included" })).toHaveText(new RegExp(`^${expected.included}`));
  await expect(tally.getByRole("group", { name: "Changed" })).toHaveText(new RegExp(`^${expected.changed.replace("+", "\\+")}`));
  await expect(tally.getByRole("group", { name: "Net" })).toHaveText(new RegExp(`^${expected.net.replace("+", "\\+")}`));
}

test.describe("Stocktake", () => {
  test("counts every product in one pass, confirming batches that empty", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/stock");
    await seedShopFixtures(page);

    // The shortcut sits at the top of the Stock page's Products tab.
    await page.goto("/stock");
    await page.getByRole("link", { name: "Stocktake" }).click();
    await expect(page).toHaveURL(/\/stock\/count\/?$/);
    await expect(page.getByRole("heading", { name: "Stocktake" })).toBeVisible();

    const alpha = page.getByLabel("Counted pieces of Alpha Praline");
    const beta = page.getByLabel("Counted pieces of Beta Ganache");

    // Both fields start at the recorded total, so an untouched pass is a
    // pure confirmation — nothing changed, everything counted.
    await expect(alpha).toHaveValue("10");
    await expect(beta).toHaveValue("10");
    await expectTally(page, { included: "2/2", changed: "0", net: "0" });
    await expect(page.getByText("2 unchanged")).toBeVisible();

    // Count Alpha down to 4 and Beta up to 12.
    await alpha.fill("4");
    await beta.fill("12");
    await expect(page.getByText("-6 pcs", { exact: true })).toBeVisible();
    await expect(page.getByText("+2 pcs", { exact: true })).toBeVisible();
    await expectTally(page, { included: "2/2", changed: "2", net: "-4" });

    // Review is a distinct step, and no batch empties yet at 4 pcs.
    await page.getByRole("button", { name: "Review & save" }).click();
    await expect(page.getByRole("button", { name: /Save — mark 2 counted/ })).toBeVisible();
    await expect(page.getByText(/mark .* as gone/)).toHaveCount(0);

    // Editing after review drops back out of the review step.
    await page.getByRole("button", { name: "Back" }).click();
    await alpha.fill("0");
    await page.getByRole("button", { name: "Review & save" }).click();

    // Zeroing Alpha empties its only batch — that must be confirmed explicitly.
    await expect(page.getByText(/This will empty 1 batch/)).toBeVisible();
    await expect(page.getByText("Seed plan")).toBeVisible();

    await page.getByRole("button", { name: /Save — mark 2 counted/ }).click();

    // Saving returns to the stock list with the new numbers applied.
    await expect(page).toHaveURL(/\/stock\/?$/);
    await expect(page.getByText("Beta Ganache")).toBeVisible();
    await expect(page.getByText("12 pcs").first()).toBeVisible();
    // Alpha's only batch was emptied, so it drops off the in-stock list.
    await expect(page.getByText("Alpha Praline")).toHaveCount(0);
  });

  test("a cleared field means 'not counted' and is left untouched", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/stock");
    await seedShopFixtures(page);
    await ageSeededStock(page, { planCompletedDaysAgo: 3, countedDaysAgo: 30 });

    await page.goto("/stock/count");
    const alpha = page.getByLabel("Counted pieces of Alpha Praline");
    const beta = page.getByLabel("Counted pieces of Beta Ganache");

    await alpha.fill("");
    await expect(page.getByText("Not counted — left as is")).toBeVisible();
    await beta.fill("7");
    await expectTally(page, { included: "1/2", changed: "1", net: "-3" });
    await expect(page.getByText("1 not counted")).toBeVisible();

    await page.getByRole("button", { name: "Review & save" }).click();
    await page.getByRole("button", { name: /Save — mark 1 counted/ }).click();
    await expect(page).toHaveURL(/\/stock\/?$/);

    // Beta moved; Alpha kept both its pieces and its stale count timestamp.
    await page.goto("/stock/count");
    await expect(page.getByLabel("Counted pieces of Alpha Praline")).toHaveValue("10");
    await expect(page.getByLabel("Counted pieces of Beta Ganache")).toHaveValue("7");
    await expect(page.getByText(/Alpha Praline/)).toBeVisible();
    await expect(page.getByText(/counted 30 days ago/)).toBeVisible();
    await expect(page.getByText(/counted today/)).toBeVisible();
  });

  test("the + and − steppers adjust a count", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/stock");
    await seedShopFixtures(page);
    await page.goto("/stock/count");

    const alpha = page.getByLabel("Counted pieces of Alpha Praline");
    await page.getByRole("button", { name: "One more Alpha Praline" }).click();
    await expect(alpha).toHaveValue("11");
    await page.getByRole("button", { name: "One fewer Alpha Praline" }).click();
    await page.getByRole("button", { name: "One fewer Alpha Praline" }).click();
    await expect(alpha).toHaveValue("9");
    await expect(page.getByText("-1 pcs", { exact: true })).toBeVisible();
    await expectTally(page, { included: "2/2", changed: "1", net: "-1" });
  });

  test("Reset fields puts every field back to the recorded total", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/stock");
    await seedShopFixtures(page);
    await page.goto("/stock/count");

    await page.getByLabel("Counted pieces of Alpha Praline").fill("3");
    await page.getByRole("button", { name: "Clear all" }).click();
    await expect(page.getByLabel("Counted pieces of Alpha Praline")).toHaveValue("");
    await expect(page.getByRole("button", { name: "Review & save" })).toBeDisabled();
    await expect(page.getByText("Nothing counted yet — every field is blank.")).toBeVisible();
    await expectTally(page, { included: "0/2", changed: "0", net: "0" });

    await page.getByRole("button", { name: "Reset fields" }).click();
    await expect(page.getByLabel("Counted pieces of Alpha Praline")).toHaveValue("10");
    await expectTally(page, { included: "2/2", changed: "0", net: "0" });
  });
});

test.describe("Stocktake reminder on the dashboard", () => {
  test("appears when the last count is over a week old and links to the stocktake", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/stock");
    await seedShopFixtures(page);
    await ageSeededStock(page, { planCompletedDaysAgo: 20, countedDaysAgo: 9 });

    await page.goto("/today");
    await expect(page.getByText("Time for a stocktake")).toBeVisible();
    await expect(page.getByText("Last counted 9 days ago")).toBeVisible();

    await page.getByRole("link", { name: /Time for a stocktake/ }).click();
    await expect(page).toHaveURL(/\/stock\/count\/?$/);
  });

  test("stays quiet when stock was counted this week", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/stock");
    await seedShopFixtures(page);
    await ageSeededStock(page, { planCompletedDaysAgo: 20, countedDaysAgo: 2 });

    await page.goto("/today");
    await expect(page.getByText("Stock overview").or(page.getByRole("heading", { name: "Today" }))).toBeVisible();
    await expect(page.getByText("Time for a stocktake")).toHaveCount(0);
  });

  test("nudges about never-counted stock only once the stock itself is old", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/stock");
    await seedShopFixtures(page);

    // Fresh, never-counted stock: no nagging.
    await ageSeededStock(page, { planCompletedDaysAgo: 2, countedDaysAgo: undefined });
    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.getByText("Time for a stocktake")).toHaveCount(0);

    // Same stock, three weeks old and still never counted: nudge.
    await ageSeededStock(page, { planCompletedDaysAgo: 21, countedDaysAgo: undefined });
    await page.goto("/today");
    await expect(page.getByText("Time for a stocktake")).toBeVisible();
    await expect(page.getByText("2 products have never been counted")).toBeVisible();
  });

  test("a completed stocktake clears the reminder", async ({ page }) => {
    test.setTimeout(120000);
    await page.goto("/stock");
    await seedShopFixtures(page);
    await ageSeededStock(page, { planCompletedDaysAgo: 30, countedDaysAgo: 15 });

    await page.goto("/today");
    await expect(page.getByText("Time for a stocktake")).toBeVisible();

    // Confirm both products without changing a number — this alone should
    // be enough to clear the reminder.
    await page.getByRole("link", { name: /Time for a stocktake/ }).click();
    await expectTally(page, { included: "2/2", changed: "0", net: "0" });
    await page.getByRole("button", { name: "Review & save" }).click();
    await page.getByRole("button", { name: /Save — mark 2 counted/ }).click();
    await expect(page).toHaveURL(/\/stock\/?$/);

    await page.goto("/today");
    await expect(page.getByRole("heading", { name: "Today" })).toBeVisible();
    await expect(page.getByText("Time for a stocktake")).toHaveCount(0);
  });
});
