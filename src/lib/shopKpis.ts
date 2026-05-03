/**
 * Shop landing KPIs — pure computation over an array of Sale rows.
 *
 * Given the full sales list and a reference `now`, returns the metrics
 * displayed on the Shop landing dashboard:
 *   - boxesSoldToday / revenueToday / bonbonsToday: sold sales whose
 *     `soldAt` falls within today's local-time window.
 *   - avgBox7Day: average price per sold box over the last 7 calendar
 *     days (today + previous 6). `null` when there are no sales in window.
 *   - preparedCount: how many prepared boxes are waiting to sell.
 *     Independent of the time window.
 *
 * "Today" and the 7-day window use the caller's local timezone, derived
 * from the `now` Date. No React, no DB.
 */

import type { Sale } from "@/types";

export interface ShopKpis {
  boxesSoldToday: number;
  revenueToday: number;
  bonbonsToday: number;
  avgBox7Day: number | null;
  preparedCount: number;
}

export const EMPTY_SHOP_KPIS: ShopKpis = {
  boxesSoldToday: 0,
  revenueToday: 0,
  bonbonsToday: 0,
  avgBox7Day: null,
  preparedCount: 0,
};

export function computeShopKpis(sales: readonly Sale[], now: Date): ShopKpis {
  const todayStart = startOfLocalDay(now).getTime();
  const todayEnd = todayStart + DAY_MS;
  // Window is "today + previous 6 days" → 7 calendar days inclusive.
  const weekStart = todayStart - 6 * DAY_MS;

  let boxesSoldToday = 0;
  let revenueToday = 0;
  let bonbonsToday = 0;
  let weekRevenue = 0;
  let weekBoxes = 0;
  let preparedCount = 0;

  for (const sale of sales) {
    if (sale.status === "prepared") {
      preparedCount++;
      continue;
    }
    // status === "sold" from here on
    const soldAtMs = sale.soldAt ? new Date(sale.soldAt).getTime() : NaN;
    if (!Number.isFinite(soldAtMs)) continue;

    if (soldAtMs >= todayStart && soldAtMs < todayEnd) {
      boxesSoldToday++;
      revenueToday += sale.price;
      bonbonsToday += countFilledCells(sale.cells);
    }
    if (soldAtMs >= weekStart && soldAtMs < todayEnd) {
      weekBoxes++;
      weekRevenue += sale.price;
    }
  }

  return {
    boxesSoldToday,
    revenueToday,
    bonbonsToday,
    avgBox7Day: weekBoxes > 0 ? weekRevenue / weekBoxes : null,
    preparedCount,
  };
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfLocalDay(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

function countFilledCells(cells: readonly (string | null)[]): number {
  let n = 0;
  for (const c of cells) if (c) n++;
  return n;
}
