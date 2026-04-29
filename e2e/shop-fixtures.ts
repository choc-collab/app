import type { Page } from "@playwright/test";

/**
 * Seed the minimum Shop fixtures directly into IndexedDB, bypassing the UI.
 *
 * The page must have already visited an app route so Dexie opens the DB and
 * runs its version-8 migration. Raw IDB `put` doesn't invoke Dexie `creating`
 * hooks, so every row must carry an explicit `id`.
 *
 * Seeds:
 *   - 1 collection
 *   - 1 packaging (2×2, capacity 4)
 *   - 1 collectionPackaging (price 12.00)
 *   - 2 products
 *   - 1 done production plan with 2 planProducts (stock 10 each)
 *
 * Returns the primary-key ids so tests can navigate straight to the fill
 * screen: `/shop/new/${cpId}`.
 */
export interface ShopFixtureIds {
  collectionId: string;
  packagingId: string;
  collectionPackagingId: string;
  product1Id: string;
  product2Id: string;
  planId: string;
}

export async function seedShopFixtures(page: Page): Promise<ShopFixtureIds> {
  const ids: ShopFixtureIds = {
    collectionId: "fix-col-1",
    packagingId: "fix-pkg-1",
    collectionPackagingId: "fix-cp-1",
    product1Id: "fix-p-1",
    product2Id: "fix-p-2",
    planId: "fix-plan-1",
  };

  // Wait for the app to finish booting before touching IDB. Without this,
  // Next.js client hydration can still be navigating when we evaluate, which
  // tears down the execution context mid-promise.
  await page.waitForLoadState("networkidle");

  await page.evaluate((ids) => {
    const NOW = Date.now();
    const ISO = new Date(NOW).toISOString().slice(0, 10);
    return new Promise<void>((resolve, reject) => {
      const req = indexedDB.open("ChocolatierDB");
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const stores = [
          "collections",
          "packaging",
          "collectionPackagings",
          "products",
          "productionPlans",
          "planProducts",
        ];
        const tx = db.transaction(stores, "readwrite");
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);

        tx.objectStore("collections").put({
          id: ids.collectionId,
          name: "Spring Test",
          startDate: ISO,
          createdAt: new Date(NOW),
          updatedAt: new Date(NOW),
        });

        tx.objectStore("packaging").put({
          id: ids.packagingId,
          name: "Window box 4",
          capacity: 4,
          rows: 2,
          cols: 2,
          createdAt: new Date(NOW),
          updatedAt: new Date(NOW),
        });

        tx.objectStore("collectionPackagings").put({
          id: ids.collectionPackagingId,
          collectionId: ids.collectionId,
          packagingId: ids.packagingId,
          sellPrice: 12,
          createdAt: new Date(NOW),
          updatedAt: new Date(NOW),
        });

        tx.objectStore("products").put({
          id: ids.product1Id,
          name: "Alpha Praline",
          shopColor: "#c24e64",
          createdAt: new Date(NOW),
          updatedAt: new Date(NOW),
        });
        tx.objectStore("products").put({
          id: ids.product2Id,
          name: "Beta Ganache",
          createdAt: new Date(NOW),
          updatedAt: new Date(NOW),
        });

        tx.objectStore("productionPlans").put({
          id: ids.planId,
          name: "Seed plan",
          status: "done",
          createdAt: new Date(NOW),
          updatedAt: new Date(NOW),
          completedAt: new Date(NOW),
        });

        tx.objectStore("planProducts").put({
          id: "fix-pp-1",
          planId: ids.planId,
          productId: ids.product1Id,
          mouldId: "fix-mould-x",
          quantity: 1,
          sortOrder: 0,
          actualYield: 10,
          currentStock: 10,
        });
        tx.objectStore("planProducts").put({
          id: "fix-pp-2",
          planId: ids.planId,
          productId: ids.product2Id,
          mouldId: "fix-mould-x",
          quantity: 1,
          sortOrder: 1,
          actualYield: 10,
          currentStock: 10,
        });
      };
    });
  }, ids);

  return ids;
}
