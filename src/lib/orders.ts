import type { Order, OrderStatus } from "@/types";

// Pure selectors and date math for the Orders & Events feature. Everything
// here takes `todayISO` as a parameter (never calls `new Date()` internally)
// so the functions stay deterministic and unit-testable.

/** Statuses that count as "still happening" — shown in upcoming lists and on
 *  the Today tile. Fulfilled/cancelled orders are done and demoted to the
 *  past section of the list page. */
export const ACTIVE_ORDER_STATUSES: ReadonlyArray<OrderStatus> = ["lead", "confirmed", "in_production"];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  lead: "Lead",
  confirmed: "Confirmed",
  in_production: "In production",
  fulfilled: "Fulfilled",
  cancelled: "Cancelled",
};

export const ORDER_STATUS_STYLE: Record<OrderStatus, string> = {
  lead: "bg-muted text-muted-foreground",
  confirmed: "bg-success-muted text-success",
  in_production: "bg-warning-muted text-warning",
  fulfilled: "bg-muted text-muted-foreground",
  cancelled: "bg-status-alert-bg text-status-alert",
};

// Fixed EN month names — rendering dates via toLocaleDateString would make
// the statically-built HTML depend on the build machine's locale and mismatch
// the client on hydration.
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;

const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "20 Dec 2026" from an ISO date string. Pure string math — no Date, no locale. */
export function formatISODate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTH_NAMES_SHORT[m - 1]} ${y}`;
}

/** "December 2026" section header for a list grouped by month. */
export function monthLabel(iso: string): string {
  const [y, m] = iso.split("-").map(Number);
  return `${MONTH_NAMES[m - 1]} ${y}`;
}

/** Whole days from `todayISO` to `iso` (positive = future). Both are ISO date
 *  strings; parsed at local midnight so DST offsets can't skew the count. */
export function daysUntil(iso: string, todayISO: string): number {
  const [y1, m1, d1] = todayISO.split("-").map(Number);
  const [y2, m2, d2] = iso.split("-").map(Number);
  const a = new Date(y1, m1 - 1, d1);
  const b = new Date(y2, m2 - 1, d2);
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** Compact human distance: "today", "tomorrow", "in 5 days", "in 3 weeks",
 *  "in 4 months" — or "3 days ago" style for the past. */
export function relativeToToday(iso: string, todayISO: string): string {
  const days = daysUntil(iso, todayISO);
  if (days === 0) return "today";
  if (days === 1) return "tomorrow";
  if (days === -1) return "yesterday";
  const abs = Math.abs(days);
  let phrase: string;
  if (abs < 14) phrase = `${abs} days`;
  else if (abs < 61) phrase = `${Math.round(abs / 7)} weeks`;
  else phrase = `${Math.round(abs / 30.44)} months`;
  return days > 0 ? `in ${phrase}` : `${phrase} ago`;
}

/** Case-insensitive, whitespace-collapsed key for deduping customer names —
 *  used by the v18 migration to fold "Gemeente  Westerveld " and
 *  "gemeente westerveld" into one Customer row. */
export function normalizeCustomerKey(name: string): string {
  return name.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Local-timezone YYYY-MM-DD. Deliberately NOT `toISOString()`, which converts
 *  to UTC first and can shift the calendar day for anyone east of Greenwich. */
export function toISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function byDateAscThenTitle(a: Order, b: Order): number {
  return a.eventDate.localeCompare(b.eventDate) || a.title.localeCompare(b.title);
}

function isUpcoming(o: Order, todayISO: string): boolean {
  return ACTIVE_ORDER_STATUSES.includes(o.status) && o.eventDate >= todayISO;
}

/** Active orders on or after `todayISO`, soonest first. Used by the Today
 *  tile (with a limit) and the list page's upcoming section (without). */
export function upcomingOrders(orders: Order[], todayISO: string, limit?: number): Order[] {
  const upcoming = orders.filter((o) => isUpcoming(o, todayISO)).sort(byDateAscThenTitle);
  return limit != null ? upcoming.slice(0, limit) : upcoming;
}

/** Split for the list page: `upcoming` = active statuses with a date on or
 *  after today (soonest first); `past` = everything else — fulfilled,
 *  cancelled, or a date that has passed (most recent first). */
export function groupOrdersForList(orders: Order[], todayISO: string): { upcoming: Order[]; past: Order[] } {
  const upcoming: Order[] = [];
  const past: Order[] = [];
  for (const o of orders) {
    (isUpcoming(o, todayISO) ? upcoming : past).push(o);
  }
  upcoming.sort(byDateAscThenTitle);
  past.sort((a, b) => b.eventDate.localeCompare(a.eventDate) || a.title.localeCompare(b.title));
  return { upcoming, past };
}

/** The ISO dates that make up a month-grid view: from the Monday of the week
 *  containing the 1st through the Sunday of the week containing the last day
 *  of the month (Monday-start weeks; result length is always a multiple of 7).
 *  `month` is 0-based, matching `Date`. */
export function monthGridDays(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  // getDay(): 0 = Sunday … 6 = Saturday. Days back to the previous Monday:
  const backToMonday = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - backToMonday);
  const last = new Date(year, month + 1, 0);
  const forwardToSunday = (7 - last.getDay()) % 7;
  const end = new Date(year, month, last.getDate() + forwardToSunday);

  const days: string[] = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    days.push(toISODate(d));
  }
  return days;
}

/** Orders keyed by their eventDate, for O(1) lookup per calendar cell. */
export function ordersByDate(orders: Order[]): Map<string, Order[]> {
  const map = new Map<string, Order[]>();
  for (const o of orders) {
    const list = map.get(o.eventDate);
    if (list) list.push(o);
    else map.set(o.eventDate, [o]);
  }
  return map;
}

/** Month navigation with year rollover. `month` is 0-based. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}
