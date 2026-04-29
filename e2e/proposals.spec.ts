import { test, expect } from "./fixtures";

// ─── Prototype page — exercises the in-memory clickable preview ──────────────
// Backed by /proposals/nested-components which uses React state only, no Dexie
// writes. These tests lock the prototype UX so design intent survives refactors
// before the feature is actually built.
test.describe("Proposals — nested components prototype", () => {
  test("index page links to the prototype", async ({ page }) => {
    await page.goto("/proposals");
    await expect(page.getByRole("heading", { name: "Proposals" })).toBeVisible();
    await page.getByRole("link", { name: /Nested components/ }).click();
    await expect(page).toHaveURL(/\/proposals\/nested-components/);
    await expect(page.getByRole("heading", { name: /Nested components & filling-only plans/ })).toBeVisible();
  });

  test("switching between the two proposal tabs", async ({ page }) => {
    await page.goto("/proposals/nested-components");
    await expect(page.getByRole("button", { name: /Filling-in-filling/ })).toHaveAttribute("aria-pressed", "true");
    await page.getByRole("button", { name: /Filling-only plan/ }).click();
    await expect(page.getByRole("button", { name: /Filling-only plan/ })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByText("Plan type", { exact: false })).toBeVisible();
  });

  // ─── Filling-in-filling tab ────────────────────────────────────────────────
  test.describe("Filling-in-filling", () => {
    test("expanding a nested filling row reveals its inner components", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      // Default host is "Dark caramel ganache" which contains the "Salted caramel base" filling
      const expandBtn = page.getByRole("button", { name: /Expand Salted caramel base/ });
      await expect(expandBtn).toBeVisible();
      await expandBtn.click();
      // Nested preview header appears
      await expect(page.getByText(/Inside Salted caramel base/)).toBeVisible();
      // Nested ingredients from caramel base are visible
      await expect(page.getByText("Caster sugar")).toBeVisible();
    });

    test("aggregate panel bubbles allergens up from nested fillings", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      // Dark caramel ganache uses Cream (milk) and Dark 70% (soy) directly,
      // plus the Caramel base which adds butter (milk again).
      const panel = page.locator("section", { hasText: "Aggregate · recursive" });
      await expect(panel.getByText("milk", { exact: true })).toBeVisible();
      await expect(panel.getByText("soy", { exact: true })).toBeVisible();
    });

    test("add-component picker switches between Ingredient and Filling sub-tabs", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      await page.getByRole("button", { name: /Add component/ }).click();
      // Ingredient is the default
      await expect(page.getByPlaceholder("Search ingredients…")).toBeVisible();
      await page.getByRole("button", { name: "Filling", exact: true }).click();
      await expect(page.getByPlaceholder("Search fillings…")).toBeVisible();
    });

    test("filling picker disables options that would create a cycle", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      // Host = Dark caramel ganache. Caramel base is already inside it, so adding
      // "Dark caramel ganache" to itself would cycle. Switch host to demonstrate —
      // pick "Salted caramel base", which would cycle if we tried to add a filling
      // that already references it.
      await page.getByLabel("Demo filling").selectOption({ label: "Salted caramel base" });
      await page.getByRole("button", { name: /Add component/ }).click();
      await page.getByRole("button", { name: "Filling", exact: true }).click();
      // Self-reference is blocked
      const selfOption = page.locator("button", { hasText: "Salted caramel base" }).last();
      await expect(selfOption).toBeDisabled();
      await expect(selfOption).toContainText(/Cycle/);
    });

    test("cycle-detection demo shows the destructive warning panel", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      await page.getByRole("button", { name: "Show demo" }).click();
      await expect(page.getByText("Would create a cycle")).toBeVisible();
      await page.getByRole("button", { name: "Hide demo" }).click();
      await expect(page.getByText("Would create a cycle")).not.toBeVisible();
    });

    test("component removal uses two-step inline confirmation", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      const firstRow = page.locator("div.divide-y").first().locator("> div").first();
      await firstRow.getByRole("button", { name: "Remove component" }).click();
      await expect(firstRow.getByText("Remove?")).toBeVisible();
      await firstRow.getByRole("button", { name: "Cancel" }).click();
      await expect(firstRow.getByText("Remove?")).not.toBeVisible();
    });

    test("adding an ingredient shows up in the component list and updates totals", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      // Caramel base starts with 4 components
      await page.getByLabel("Demo filling").selectOption({ label: "Salted caramel base" });
      await expect(page.getByText("Components (4)")).toBeVisible();
      await page.getByRole("button", { name: /Add component/ }).click();
      await page.getByPlaceholder("Search ingredients…").fill("hazel");
      await page.getByRole("button", { name: /Hazelnut praline/ }).click();
      await expect(page.getByText("Components (5)")).toBeVisible();
    });
  });

  // ─── Filling-only plan tab ─────────────────────────────────────────────────
  test.describe("Filling-only plan", () => {
    test("plan-type cards toggle the output form", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      await page.getByRole("button", { name: /Filling-only plan/ }).click();
      // Fillings-only is selected by default in the prototype
      const output = page.getByText("Filling batches");
      await expect(output).toBeVisible();
      await page.getByRole("button", { name: /Full production/ }).click();
      await expect(output).not.toBeVisible();
      await page.getByRole("button", { name: /Fillings only/ }).click();
      await expect(output).toBeVisible();
    });

    test("batch counts roll up into the total yield summary", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      await page.getByRole("button", { name: /Filling-only plan/ }).click();
      // Default rows: 2× caramel base + 1× dark caramel ganache → 3 batches, 1500g
      const summary = page.locator("section", { hasText: "Output" });
      await expect(summary.getByText("3", { exact: true })).toBeVisible();
      await expect(summary.getByText("1500g")).toBeVisible();
      // Bump caramel base from 2 → 5 batches
      const caramelInput = page.getByRole("spinbutton", { name: "Batches of Salted caramel base" });
      await caramelInput.fill("5");
      await caramelInput.blur();
      await expect(summary.getByText("6", { exact: true })).toBeVisible();
      await expect(summary.getByText("3000g")).toBeVisible();
    });

    test("adding a filling appends a row and removes it again", async ({ page }) => {
      await page.goto("/proposals/nested-components");
      await page.getByRole("button", { name: /Filling-only plan/ }).click();
      await expect(page.getByText(/Fillings to make \(2\)/)).toBeVisible();
      await page.getByRole("button", { name: /Add filling/ }).click();
      await page.getByRole("button", { name: /Hazelnut praline/ }).click();
      await expect(page.getByText(/Fillings to make \(3\)/)).toBeVisible();
      // Remove it
      await page.getByRole("button", { name: "Remove Hazelnut praline" }).click();
      await expect(page.getByText(/Fillings to make \(2\)/)).toBeVisible();
    });
  });
});

// ─── Scope for the filling-in-filling feature (Feature A) ───────────────────
// Phase 1 ships the foundation: schema + add/remove UI + cycle-detection on
// save. The first two contract tests below run for real today. The rest stay
// skipped — they're the contract for later phases.
//
// Filling-only production (Feature B) ships with its own dedicated spec at
// e2e/production-fillings-only.spec.ts.

async function createFilling(page: import("@playwright/test").Page, name: string) {
  await page.goto("/fillings");
  await page.getByRole("button", { name: "Add filling" }).click();
  await page.getByRole("textbox", { name: "Filling name" }).fill(name);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/\/fillings\/.+/);
  return page.url().split("?")[0];
}

test.describe("Filling-in-filling — Phase 1 (foundation)", () => {
  test("adding a filling to a filling persists across reload", async ({ page }) => {
    test.setTimeout(60000);
    // Two fillings: "Caramel base" (the child) and "Caramel ganache" (the host).
    await createFilling(page, "Caramel base");
    const hostUrl = await createFilling(page, "Caramel ganache");

    // Host page should land in edit mode (?new=1). Add the child as a nested
    // component.
    await page.getByTestId("add-filling-component-btn").click();
    await page.getByTestId("add-filling-component-search").fill("Caramel base");
    await page.getByRole("button", { name: "Caramel base" }).click();
    await page.getByTestId("add-filling-component-amount").fill("50");
    await page.getByTestId("add-filling-component-submit").click();

    // The form closes after save.
    await expect(page.getByTestId("add-filling-component-form")).toHaveCount(0);

    // Row appears with the child name + amount.
    const row = page.getByTestId("nested-filling-row").first();
    await expect(row).toContainText("Caramel base");
    await expect(row).toContainText("50g");

    // Reload — the row is still there, sourced from IndexedDB.
    await page.goto(hostUrl);
    await expect(page.getByTestId("nested-filling-row").first()).toContainText("Caramel base");
  });

  test("save rejects cycles (self-ref, 2-hop, 3-hop)", async ({ page }) => {
    test.setTimeout(60000);
    // Build the chain a → b → c. Then verify that the picker for `c` shows
    // each option with the right disabled reason.
    const aUrl = await createFilling(page, "Filling A");
    const bUrl = await createFilling(page, "Filling B");
    const cUrl = await createFilling(page, "Filling C");

    async function enterEditMode() {
      // The detail page lands in view mode for non-new visits; flip to edit
      // before touching the nested-filling controls. Wait for the toggle
      // (state can take a tick to hydrate after navigation).
      const editBtn = page.getByRole("button", { name: "Edit filling" });
      await editBtn.waitFor({ state: "visible" });
      await editBtn.click();
    }

    // b contains c (b → c)
    await page.goto(bUrl);
    await enterEditMode();
    await page.getByTestId("add-filling-component-btn").click();
    await page.getByTestId("add-filling-component-search").fill("Filling C");
    await page.getByRole("button", { name: "Filling C" }).click();
    await page.getByTestId("add-filling-component-amount").fill("10");
    await page.getByTestId("add-filling-component-submit").click();
    await expect(page.getByTestId("add-filling-component-form")).toHaveCount(0);

    // a contains b (a → b → c)
    await page.goto(aUrl);
    await enterEditMode();
    await page.getByTestId("add-filling-component-btn").click();
    await page.getByTestId("add-filling-component-search").fill("Filling B");
    await page.getByRole("button", { name: "Filling B" }).click();
    await page.getByTestId("add-filling-component-amount").fill("10");
    await page.getByTestId("add-filling-component-submit").click();
    await expect(page.getByTestId("add-filling-component-form")).toHaveCount(0);

    // In C's picker: A and B should both be cycle-disabled. (C → A would
    // close C → A → B → C; C → B would close C → B → C.) C itself is "Self".
    await page.goto(cUrl);
    await enterEditMode();
    await page.getByTestId("add-filling-component-btn").click();

    // Picker shows all three; each is disabled with the right reason.
    const optionA = page.getByRole("button", { name: /Filling A/ });
    const optionB = page.getByRole("button", { name: /Filling B/ });
    const optionC = page.getByRole("button", { name: /Filling C/ });
    await expect(optionA).toBeDisabled();
    await expect(optionA).toContainText("Cycle");
    await expect(optionB).toBeDisabled();
    await expect(optionB).toContainText("Cycle");
    await expect(optionC).toBeDisabled();
    await expect(optionC).toContainText("Self");
  });
});

// ─── Phase 2: aggregation propagation ───────────────────────────────────────
//
// Cost and nutrition flow recursively through nested fillings; allergens
// cascade up the parent edges when a leaf changes. The first three contract
// tests assert that the wiring is right end-to-end. They drive setup
// directly via IndexedDB to keep the run cheap — the same DB the app reads.

interface Phase2Ids {
  innerFillingId: string;
  outerFillingId: string;
  ingredientId: string;
}

async function seedPhase2NestedFilling(page: import("@playwright/test").Page): Promise<Phase2Ids> {
  // App must be loaded once so Dexie has run its migrations before we touch
  // raw IDB. Without this, the first put would land in a v0 db with no stores.
  await page.goto("/ingredients");
  // Touch a Dexie-backed list so the DB is fully open at the latest version
  // before we drop into raw IDB. Otherwise the v12 stores (fillingComponents)
  // may not exist yet — Dexie migrations run lazily on first read.
  await page.getByRole("button", { name: "Add ingredient" }).waitFor({ state: "visible" });
  await page.waitForLoadState("networkidle");

  const ids: Phase2Ids = {
    innerFillingId: "p2-filling-inner",
    outerFillingId: "p2-filling-outer",
    ingredientId: "p2-ingredient",
  };

  await page.evaluate((ids) => {
    const NOW = Date.now();
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("ChocolatierDB");
      req.onsuccess = () => {
        const db = req.result;
        const stores = ["ingredients", "fillings", "fillingIngredients", "fillingComponents"];
        const tx = db.transaction(stores, "readwrite");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);

        // Leaf ingredient — no allergens, has a unit price.
        tx.objectStore("ingredients").put({
          id: ids.ingredientId,
          name: "Phase2 Ingredient",
          manufacturer: "",
          source: "",
          cost: 0,
          notes: "",
          cacaoFat: 0,
          sugar: 0,
          milkFat: 0,
          water: 0,
          solids: 0,
          otherFats: 0,
          allergens: [],
          updatedAt: new Date(NOW),
        });

        // Inner filling: 100g of the leaf ingredient.
        tx.objectStore("fillings").put({
          id: ids.innerFillingId,
          name: "Phase2 Inner",
          category: "",
          source: "",
          description: "",
          allergens: [],
          instructions: "",
        });
        tx.objectStore("fillingIngredients").put({
          id: "p2-li-1",
          fillingId: ids.innerFillingId,
          ingredientId: ids.ingredientId,
          amount: 100,
          unit: "g",
          sortOrder: 0,
        });

        // Outer filling: nests Inner (50g).
        tx.objectStore("fillings").put({
          id: ids.outerFillingId,
          name: "Phase2 Outer",
          category: "",
          source: "",
          description: "",
          allergens: [],
          instructions: "",
        });
        tx.objectStore("fillingComponents").put({
          id: "p2-comp-1",
          fillingId: ids.outerFillingId,
          childFillingId: ids.innerFillingId,
          amount: 50,
          unit: "g",
          sortOrder: 0,
        });
      };
      req.onerror = () => reject(req.error);
    });
  }, ids);

  return ids;
}

test.describe("Filling-in-filling — Phase 2 (aggregation propagation)", () => {
  test("allergens propagate when a nested filling gains a new allergen", async ({ page }) => {
    test.setTimeout(60000);
    const ids = await seedPhase2NestedFilling(page);

    // Outer filling currently has no allergens (Inner contributes none).
    await page.goto(`/fillings/${ids.outerFillingId}`);
    await expect(page.getByText("Phase2 Outer", { exact: true }).first()).toBeVisible();
    await expect(page.getByText("Milk", { exact: true })).toHaveCount(0);

    // Edit the leaf ingredient: tick the "Milk" allergen and save. Use the
    // aria-label-only Edit button (the page has another text-only button with
    // the same label inside the Allergens tab content). The submit button on
    // an existing ingredient reads "Update", not "Save".
    await page.goto(`/ingredients/${ids.ingredientId}`);
    await page.getByLabel("Edit ingredient", { exact: true }).first().click();
    await page.getByRole("button", { name: "Allergens" }).click();
    await page.getByLabel("Milk").check();
    await page.getByRole("button", { name: "Update" }).click();

    // Visit Outer again — the cascaded allergen pill should now be visible.
    // The cascade walks parent edges from the changed ingredient through
    // every host filling that nests it (directly or transitively).
    await page.goto(`/fillings/${ids.outerFillingId}`);
    await expect(page.getByText("Milk", { exact: true })).toBeVisible();
  });
});

// Phase 2 cost + nutrition propagation — pinned at the function boundary
// in `src/lib/costCalculation.test.ts` and `src/lib/nutrition.test.ts` rather
// than via E2E, since the math is what matters and the engines are pure.

// ─── Phase 3: lifecycle + planner ───────────────────────────────────────────

test.describe("Filling-in-filling — Phase 3 (lifecycle + planner)", () => {
  test("archiving a filling still in use as a nested component is blocked", async ({ page }) => {
    test.setTimeout(60000);
    // Create Inner and Outer; nest Inner inside Outer. Then attempt to archive
    // Inner — the panel shows the block, the Archive button is disabled, and
    // Inner is still findable in the fillings list afterwards.
    const innerUrl = await createFilling(page, "P3 Archive Inner");
    const outerUrl = await createFilling(page, "P3 Archive Outer");

    // Add Inner as a nested component of Outer. Visiting the bare URL lands
    // in view mode — flip to edit before touching the nested-filling
    // controls. waitFor is necessary because the toggle hydrates after nav.
    await page.goto(outerUrl);
    await page.getByRole("button", { name: "Edit filling" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Edit filling" }).click();
    await page.getByTestId("add-filling-component-btn").click();
    await page.getByTestId("add-filling-component-search").fill("P3 Archive Inner");
    await page.getByRole("button", { name: "P3 Archive Inner" }).click();
    await page.getByTestId("add-filling-component-amount").fill("50");
    await page.getByTestId("add-filling-component-submit").click();
    await expect(page.getByTestId("add-filling-component-form")).toHaveCount(0);

    // Mark Inner as produced so the Archive button shows up. `hasFillingBeenProduced`
    // walks productFillings → planProducts, so wire a minimal product +
    // productFilling + planProduct chain.
    // URL is `/fillings/<id>` or `/fillings/<id>/` — strip a trailing slash if any.
    const innerId = innerUrl.replace(/\/$/, "").split("/").pop()!;
    await page.evaluate((innerId) => {
      const NOW = Date.now();
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("ChocolatierDB");
        req.onsuccess = () => {
          const db = req.result;
          const stores = ["products", "productFillings", "productionPlans", "planProducts"];
          const tx = db.transaction(stores, "readwrite");
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
          tx.objectStore("products").put({
            id: "p3-archive-product",
            name: "P3 Archive Product",
            createdAt: new Date(NOW),
            updatedAt: new Date(NOW),
          });
          tx.objectStore("productFillings").put({
            id: "p3-archive-pf",
            productId: "p3-archive-product",
            fillingId: innerId,
            sortOrder: 0,
            fillPercentage: 100,
          });
          tx.objectStore("productionPlans").put({
            id: "p3-archive-plan",
            name: "P3 archive plan",
            status: "done",
            createdAt: new Date(NOW),
            updatedAt: new Date(NOW),
            completedAt: new Date(NOW),
          });
          tx.objectStore("planProducts").put({
            id: "p3-archive-pp",
            planId: "p3-archive-plan",
            productId: "p3-archive-product",
            quantity: 1,
            sortOrder: 0,
          });
        };
        req.onerror = () => reject(req.error);
      });
    }, innerId);

    // Reload so the page picks up the new production record.
    await page.goto(innerUrl);
    await page.getByRole("button", { name: "Archive filling" }).click();

    // The block message + the Archive button is disabled.
    await expect(page.getByTestId("archive-blocked-nested")).toBeVisible();
    await expect(page.getByTestId("archive-blocked-nested")).toContainText("P3 Archive Outer");
    // Two buttons named "Archive filling" — the trigger (in the panel header)
    // and the submit. Use the disabled one (the submit, btn-primary).
    const archiveSubmit = page.locator('button.btn-primary', { hasText: "Archive filling" });
    await expect(archiveSubmit).toBeDisabled();
  });

  test("forking a filling that's nested inside another shows a heads-up and leaves the host on the old version", async ({ page }) => {
    test.setTimeout(60000);
    // Inner gets nested inside Outer. Forking Inner creates Inner v2 — but
    // Outer's fillingComponent edge should still point at Inner v1. The fork
    // panel surfaces the "kept on old version" notice.
    const innerUrl = await createFilling(page, "P3 Fork Inner");
    const outerUrl = await createFilling(page, "P3 Fork Outer");

    // Outer nests Inner. Bare URL lands in view mode; flip to edit first.
    await page.goto(outerUrl);
    await page.getByRole("button", { name: "Edit filling" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Edit filling" }).click();
    await page.getByTestId("add-filling-component-btn").click();
    await page.getByTestId("add-filling-component-search").fill("P3 Fork Inner");
    await page.getByRole("button", { name: "P3 Fork Inner" }).click();
    await page.getByTestId("add-filling-component-amount").fill("40");
    await page.getByTestId("add-filling-component-submit").click();
    await expect(page.getByTestId("add-filling-component-form")).toHaveCount(0);

    // The fork panel only appears for confirmed fillings — set status manually.
    // URL is `/fillings/<id>` or `/fillings/<id>/` — strip a trailing slash if any.
    const innerId = innerUrl.replace(/\/$/, "").split("/").pop()!;
    await page.evaluate((innerId) => {
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("ChocolatierDB");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["fillings"], "readwrite");
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);
          tx.objectStore("fillings").get(innerId).onsuccess = (ev) => {
            const row = (ev.target as IDBRequest).result;
            if (!row) return;
            tx.objectStore("fillings").put({ ...row, status: "confirmed" });
          };
        };
        req.onerror = () => reject(req.error);
      });
    }, innerId);

    // Open the fork panel and verify the heads-up notice is present.
    await page.goto(innerUrl);
    await page.getByRole("button", { name: /Create new version/i }).click();
    const notice = page.getByTestId("fork-nested-hosts-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("P3 Fork Outer");
    await expect(notice).toContainText(/old version/i);

    // Capture Outer's fillingComponent edge BEFORE forking — note its child id.
    const outerComponentBefore = await page.evaluate((innerId) => {
      return new Promise<{ childFillingId: string } | null>((resolve, reject) => {
        const req = indexedDB.open("ChocolatierDB");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["fillingComponents"], "readonly");
          const store = tx.objectStore("fillingComponents");
          store.getAll().onsuccess = (ev) => {
            const rows = (ev.target as IDBRequest).result as Array<{ childFillingId: string }>;
            const row = rows.find((r) => r.childFillingId === innerId);
            db.close();
            resolve(row ? { childFillingId: row.childFillingId } : null);
          };
        };
        req.onerror = () => reject(req.error);
      });
    }, innerId);
    expect(outerComponentBefore?.childFillingId).toBe(innerId);

    // Confirm the fork. This navigates to the new version's URL (?forked=1).
    await page.getByRole("button", { name: "Create new version" }).click();
    await expect(page).toHaveURL(/\/fillings\/.+\?forked=1/);

    // Outer's fillingComponent edge should still point at the original
    // (Inner v1) — fork did NOT migrate the edge.
    const componentsAfter = await page.evaluate(() => {
      return new Promise<Array<{ childFillingId: string }>>((resolve, reject) => {
        const req = indexedDB.open("ChocolatierDB");
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(["fillingComponents"], "readonly");
          tx.objectStore("fillingComponents").getAll().onsuccess = (ev) => {
            db.close();
            resolve((ev.target as IDBRequest).result as Array<{ childFillingId: string }>);
          };
        };
        req.onerror = () => reject(req.error);
      });
    });
    const stillPointingAtOriginal = componentsAfter.some((c) => c.childFillingId === innerId);
    expect(stillPointingAtOriginal).toBe(true);
  });

  test("production planner schedules nested-filling batches before the host", async ({ page }) => {
    test.setTimeout(60000);
    // Seed a minimal plan with a product that uses host filling A; A nests
    // child B. The "Make A" / "Make B" steps should appear in the order
    // B first, then A.
    await page.goto("/ingredients");
    await page.getByRole("button", { name: "Add ingredient" }).waitFor({ state: "visible" });
    await page.waitForLoadState("networkidle");

    const ids = {
      mouldId: "p3-plan-mould",
      hostFillingId: "p3-plan-host",
      childFillingId: "p3-plan-child",
      productId: "p3-plan-product",
      ingredientId: "p3-plan-ingredient",
      planId: "p3-plan-plan",
      planProductId: "p3-plan-pp",
      productFillingId: "p3-plan-pf",
    };

    await page.evaluate((ids) => {
      const NOW = Date.now();
      return new Promise<void>((resolve, reject) => {
        const req = indexedDB.open("ChocolatierDB");
        req.onsuccess = () => {
          const db = req.result;
          const stores = ["ingredients", "moulds", "fillings", "fillingIngredients", "fillingComponents", "products", "productFillings", "productionPlans", "planProducts"];
          const tx = db.transaction(stores, "readwrite");
          tx.oncomplete = () => { db.close(); resolve(); };
          tx.onerror = () => reject(tx.error);

          tx.objectStore("ingredients").put({
            id: ids.ingredientId, name: "P3 Plan Sugar", manufacturer: "", source: "",
            cost: 0, notes: "", cacaoFat: 0, sugar: 0, milkFat: 0, water: 0, solids: 0,
            otherFats: 0, allergens: [], updatedAt: new Date(NOW),
          });
          tx.objectStore("moulds").put({
            id: ids.mouldId, name: "P3 Plan Mould", cavityWeightG: 10, numberOfCavities: 20,
            createdAt: new Date(NOW), updatedAt: new Date(NOW),
          });

          // Child filling — has its own ingredient (so it appears in the recipe).
          tx.objectStore("fillings").put({
            id: ids.childFillingId, name: "P3 Plan Child", category: "",
            source: "", description: "", allergens: [], instructions: "",
          });
          tx.objectStore("fillingIngredients").put({
            id: "p3-plan-li-child", fillingId: ids.childFillingId, ingredientId: ids.ingredientId,
            amount: 100, unit: "g", sortOrder: 0,
          });

          // Host filling — nests the child. No own ingredients so the recipe
          // is 100% the nested child.
          tx.objectStore("fillings").put({
            id: ids.hostFillingId, name: "P3 Plan Host", category: "",
            source: "", description: "", allergens: [], instructions: "",
          });
          tx.objectStore("fillingComponents").put({
            id: "p3-plan-comp", fillingId: ids.hostFillingId, childFillingId: ids.childFillingId,
            amount: 100, unit: "g", sortOrder: 0,
          });

          // Product uses the host filling.
          tx.objectStore("products").put({
            id: ids.productId, name: "P3 Plan Product", defaultMouldId: ids.mouldId,
            createdAt: new Date(NOW), updatedAt: new Date(NOW),
          });
          tx.objectStore("productFillings").put({
            id: ids.productFillingId, productId: ids.productId, fillingId: ids.hostFillingId,
            sortOrder: 0, fillPercentage: 100,
          });

          // Plan with one product on it. status='active' so the plan page
          // renders the step list.
          tx.objectStore("productionPlans").put({
            id: ids.planId, name: "P3 Plan", status: "active",
            createdAt: new Date(NOW), updatedAt: new Date(NOW),
          });
          tx.objectStore("planProducts").put({
            id: ids.planProductId, planId: ids.planId, productId: ids.productId,
            mouldId: ids.mouldId, quantity: 1, sortOrder: 0,
          });
        };
        req.onerror = () => reject(req.error);
      });
    }, ids);

    // Visit the plan page — the step list should include both fillings.
    await page.goto(`/production/${ids.planId}`);

    // Plan page groups steps by phase (Colour / Shell / Fillings / Fill / Cap /
    // Unmould). Switch to the Fillings tab — that's where "Make X" steps live.
    // The tab badge shows "0/2" because both nested + host fillings get steps.
    await page.getByRole("button", { name: /Fillings 0\/2/ }).click();

    // Find the two filling steps. Each step renders the filling name with
    // "Make" prefix. Read them in DOM order (the planner emits them in batch
    // order).
    const makeChild = page.getByText(/Make P3 Plan Child/);
    const makeHost = page.getByText(/Make P3 Plan Host/);
    await expect(makeChild).toBeVisible();
    await expect(makeHost).toBeVisible();

    // The child's "Make" step appears before the host's — the topo sort puts
    // children first. Compare bounding box positions to confirm DOM order.
    const childBox = await makeChild.boundingBox();
    const hostBox = await makeHost.boundingBox();
    expect(childBox).not.toBeNull();
    expect(hostBox).not.toBeNull();
    expect(childBox!.y).toBeLessThan(hostBox!.y);
  });
});

// ─── Phase 4: backup/restore + import validation ────────────────────────────

test.describe("Filling-in-filling — Phase 4 (data portability)", () => {
  test("backup/restore round-trips fillings with nested references intact", async ({ page }) => {
    test.setTimeout(120000);
    // Create Inner + Outer (with Inner nested inside) so the export contains
    // a real fillingComponents row. Then export, import, reload, and verify
    // Outer still surfaces Inner in its nested-fillings list — that proves
    // the row survived the JSON roundtrip + the bulkAdd preserves the FK.
    await createFilling(page, "P4 Backup Inner");
    const outerUrl = await createFilling(page, "P4 Backup Outer");

    // Outer nests Inner.
    await page.goto(outerUrl);
    await page.getByRole("button", { name: "Edit filling" }).waitFor({ state: "visible" });
    await page.getByRole("button", { name: "Edit filling" }).click();
    await page.getByTestId("add-filling-component-btn").click();
    await page.getByTestId("add-filling-component-search").fill("P4 Backup Inner");
    await page.getByRole("button", { name: "P4 Backup Inner" }).click();
    await page.getByTestId("add-filling-component-amount").fill("75");
    await page.getByTestId("add-filling-component-submit").click();
    await expect(page.getByTestId("add-filling-component-form")).toHaveCount(0);

    // Export.
    await page.goto("/settings");
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Export backup" }).click(),
    ]);
    const backupPath = await download.path();
    expect(backupPath).toBeTruthy();

    // Import — clears the DB first, then reads the JSON.
    await page.locator('input[type="file"][accept=".json,application/json"]').setInputFiles(backupPath!);
    await page.getByRole("button", { name: "Yes, replace all data" }).click();
    await expect(page.getByText("Restore complete")).toBeVisible({ timeout: 15000 });

    // Reload as instructed.
    await page.reload();

    // Outer still shows Inner in its nested-fillings list.
    await page.goto(outerUrl);
    const row = page.getByTestId("nested-filling-row").first();
    await expect(row).toContainText("P4 Backup Inner");
    await expect(row).toContainText("75g");
  });

  test("import validates polymorphic refs and reports unknown filling IDs", async ({ page }) => {
    test.setTimeout(120000);
    // Hand-craft a backup JSON with one valid filling + one fillingComponents
    // row pointing at a missing filling id. The importer should drop the
    // bad row and surface the dropped id in the "import warnings" UI.

    // Open settings so the input is mounted.
    await page.goto("/settings");

    // Build the file in the page context to avoid Node File polyfill weirdness.
    const droppedId = "p4-import-missing";
    const validFillingId = "p4-import-valid";
    await page.evaluate(({ droppedId, validFillingId }) => {
      const data = {
        version: 1,
        exportedAt: new Date().toISOString(),
        ingredients: [],
        products: [],
        productCategories: [],
        fillings: [
          { id: validFillingId, name: "P4 Import Valid", category: "", source: "", description: "", allergens: [], instructions: "" },
        ],
        productFillings: [],
        fillingIngredients: [],
        // One row references a filling that's not in `fillings` — should drop.
        // One row would self-reference (cycle) — should also drop.
        fillingComponents: [
          { id: "fc-bad-ref", fillingId: validFillingId, childFillingId: droppedId, amount: 50, unit: "g", sortOrder: 0 },
          { id: "fc-self", fillingId: validFillingId, childFillingId: validFillingId, amount: 50, unit: "g", sortOrder: 1 },
        ],
        moulds: [],
        productionPlans: [],
        planProducts: [],
        planFillings: [],
        planStepStatus: [],
        userPreferences: [],
      };
      const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
      const file = new File([blob], "p4-import.json", { type: "application/json" });
      const dt = new DataTransfer();
      dt.items.add(file);
      const input = document.querySelector('input[type="file"][accept=".json,application/json"]') as HTMLInputElement;
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
    }, { droppedId, validFillingId });

    await page.getByRole("button", { name: "Yes, replace all data" }).click();
    await expect(page.getByText("Restore complete")).toBeVisible({ timeout: 15000 });

    // Warnings panel surfaces the dropped row + cycle.
    const warnings = page.getByTestId("import-result-warnings");
    await expect(warnings).toBeVisible();
    await expect(warnings).toContainText(droppedId);
    await expect(warnings).toContainText(/cycle/i);
  });
});
