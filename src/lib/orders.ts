import type { Order, OrderStatus, OrderProductionLink, OrderLineItem } from "@/types";

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

// ─── Venues ──────────────────────────────────────────────────────────────────

/** The standing venue for orders nobody travels to — a private person or a
 *  shop collecting a box. Stored as plain venue text so it needs no field of
 *  its own, and matched case-insensitively so "pick-up"/"Pickup" count too. */
export const PICKUP_VENUE = "Pick-up";

export function isPickupVenue(venue: string | undefined): boolean {
  if (!venue) return false;
  const key = venue.trim().toLowerCase().replace(/[\s-]+/g, "");
  return key === "pickup" || key === "inshoppickup" || key === "shoppickup";
}

/** Suggestions for the venue field: Pick-up first, then every distinct venue
 *  already used on an order, sorted case-insensitively. Derived from the
 *  records themselves — there is no venue list to maintain. */
export function venueSuggestions(orders: ReadonlyArray<Pick<Order, "venue">>): string[] {
  const seen = new Map<string, string>(); // lower-case key → first spelling seen
  for (const o of orders) {
    const v = o.venue?.trim();
    if (!v || isPickupVenue(v)) continue;
    const key = v.toLowerCase();
    if (!seen.has(key)) seen.set(key, v);
  }
  const rest = [...seen.values()].sort((a, b) => a.localeCompare(b, "en", { sensitivity: "base" }));
  return [PICKUP_VENUE, ...rest];
}

// ─── Multi-day events ────────────────────────────────────────────────────────

/** The event's last day: `endDate` when it's set and after the start, else
 *  the start itself. A stray `endDate` before `eventDate` is treated as
 *  single-day rather than producing a negative-length event. */
export function orderEndDate(o: Pick<Order, "eventDate" | "endDate">): string {
  return o.endDate && o.endDate > o.eventDate ? o.endDate : o.eventDate;
}

export function isMultiDay(o: Pick<Order, "eventDate" | "endDate">): boolean {
  return orderEndDate(o) !== o.eventDate;
}

/** Number of calendar days the event spans (1 for a single day). */
export function eventLengthDays(o: Pick<Order, "eventDate" | "endDate">): number {
  return daysUntil(orderEndDate(o), o.eventDate) + 1;
}

/** Which day of the event `iso` is — `{ day: 2, total: 3 }` — or null when
 *  `iso` falls outside the event. Single-day events give `{ 1, 1 }`. */
export function eventDayOf(
  o: Pick<Order, "eventDate" | "endDate">,
  iso: string,
): { day: number; total: number } | null {
  const end = orderEndDate(o);
  if (iso < o.eventDate || iso > end) return null;
  return { day: daysUntil(iso, o.eventDate) + 1, total: eventLengthDays(o) };
}

/** Human date(s) for an event, collapsing shared parts of a range:
 *  "20 Dec 2026" · "20–21 Dec 2026" · "30 Nov – 1 Dec 2026" ·
 *  "30 Dec 2026 – 2 Jan 2027". `year: false` drops the year(s) for compact
 *  spots like the Today tile ("20–21 Dec"). Pure string math, no locale. */
export function formatEventDates(
  o: Pick<Order, "eventDate" | "endDate">,
  { year = true }: { year?: boolean } = {},
): string {
  const [y1, m1, d1] = o.eventDate.split("-").map(Number);
  const end = orderEndDate(o);
  const [y2, m2, d2] = end.split("-").map(Number);
  const yr = (y: number) => (year ? ` ${y}` : "");
  if (end === o.eventDate) return `${d1} ${MONTH_NAMES_SHORT[m1 - 1]}${yr(y1)}`;
  if (y1 === y2 && m1 === m2) return `${d1}–${d2} ${MONTH_NAMES_SHORT[m1 - 1]}${yr(y1)}`;
  if (y1 === y2) return `${d1} ${MONTH_NAMES_SHORT[m1 - 1]} – ${d2} ${MONTH_NAMES_SHORT[m2 - 1]}${yr(y1)}`;
  return `${d1} ${MONTH_NAMES_SHORT[m1 - 1]}${yr(y1)} – ${d2} ${MONTH_NAMES_SHORT[m2 - 1]}${yr(y2)}`;
}

/** Relative read-out that understands ranges: before the event it counts
 *  down to the first day ("in 3 weeks"); during a multi-day event it says
 *  "day 1 of 2" ("today" for a single day); afterwards it counts from the
 *  last day ("3 days ago"). */
export function eventRelative(o: Pick<Order, "eventDate" | "endDate">, todayISO: string): string {
  const within = eventDayOf(o, todayISO);
  if (within) return within.total === 1 ? "today" : `day ${within.day} of ${within.total}`;
  if (todayISO < o.eventDate) return relativeToToday(o.eventDate, todayISO);
  return relativeToToday(orderEndDate(o), todayISO);
}

function byDateAscThenTitle(a: Order, b: Order): number {
  return a.eventDate.localeCompare(b.eventDate) || a.title.localeCompare(b.title);
}

/** Active, and not yet over — a two-day market is still upcoming on its
 *  second morning. */
function isUpcoming(o: Order, todayISO: string): boolean {
  return ACTIVE_ORDER_STATUSES.includes(o.status) && orderEndDate(o) >= todayISO;
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

/** Longest event the calendar will fan out; anything beyond is almost
 *  certainly a typo'd year and would otherwise flood every cell. */
const MAX_EVENT_DAYS = 62;

/** Orders keyed by every day they occupy, for O(1) lookup per calendar
 *  cell. A multi-day event appears under each of its days. */
export function ordersByDate(orders: Order[]): Map<string, Order[]> {
  const map = new Map<string, Order[]>();
  for (const o of orders) {
    const days = Math.min(eventLengthDays(o), MAX_EVENT_DAYS);
    const [y, m, d] = o.eventDate.split("-").map(Number);
    for (let i = 0; i < days; i++) {
      const iso = toISODate(new Date(y, m - 1, d + i));
      const list = map.get(iso);
      if (list) list.push(o);
      else map.set(iso, [o]);
    }
  }
  return map;
}

/** Month navigation with year rollover. `month` is 0-based. */
export function shiftMonth(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + month + delta;
  return { year: Math.floor(total / 12), month: ((total % 12) + 12) % 12 };
}

/** Time-window options for the Orders list filter panel. Measured as
 *  distance from today in either direction, so "30d" shows events within
 *  the next 30 days — and, when past orders are shown, the last 30 too. */
export type OrderPeriod = "30d" | "90d" | "12mo" | "all";

const PERIOD_DAYS: Record<Exclude<OrderPeriod, "all">, number> = {
  "30d": 30,
  "90d": 90,
  "12mo": 365,
};

export function isWithinPeriod(eventDate: string, todayISO: string, period: OrderPeriod): boolean {
  if (period === "all") return true;
  return Math.abs(daysUntil(eventDate, todayISO)) <= PERIOD_DAYS[period];
}

/** `isWithinPeriod` for a whole event: true when any day of it falls inside
 *  the window — a fair that starts on day 29 and runs to day 31 is still
 *  "within 30 days". */
export function orderWithinPeriod(
  o: Pick<Order, "eventDate" | "endDate">,
  todayISO: string,
  period: OrderPeriod,
): boolean {
  if (period === "all") return true;
  const n = PERIOD_DAYS[period];
  return daysUntil(o.eventDate, todayISO) <= n && daysUntil(orderEndDate(o), todayISO) >= -n;
}

/** Link rows grouped by plan, preserving row order within each group. A
 *  group holds the plan's bare link and/or its per-product allocations. */
export function groupLinksByPlan(links: OrderProductionLink[]): Map<string, OrderProductionLink[]> {
  const map = new Map<string, OrderProductionLink[]>();
  for (const l of links) {
    const group = map.get(l.planId);
    if (group) group.push(l);
    else map.set(l.planId, [l]);
  }
  return map;
}

/** Total pieces allocated per product across all linked batches. Bare rows
 *  (no productId) and rows without a quantity are ignored. */
export function allocatedByProduct(links: OrderProductionLink[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const l of links) {
    if (!l.productId || l.quantity == null) continue;
    map.set(l.productId, (map.get(l.productId) ?? 0) + l.quantity);
  }
  return map;
}

/** Fulfillment progress for one line item, matched by product against the
 *  order's batch allocations. Null for untyped line items (no productId) —
 *  nothing to match yet. */
export function lineItemFulfillment(
  item: OrderLineItem,
  allocated: Map<string, number>,
): { allocated: number; needed: number } | null {
  if (!item.productId) return null;
  return { allocated: allocated.get(item.productId) ?? 0, needed: item.quantity };
}

// ─── Upcoming-order production demand ────────────────────────────────────────

/** How many days before an event its line items start surfacing as "to make"
 *  nudges on the Today dashboard — see `productsNeededForUpcomingOrders`. */
export const PRODUCE_FOR_ORDER_WINDOW_DAYS = 14;

export interface UpcomingOrderDemand {
  /** Pieces still unaccounted for by any linked batch, summed across every
   *  due order that needs this product. */
  quantity: number;
  /** Soonest event date among the orders contributing to `quantity`. */
  nearestEventDate: string;
  orderTitles: string[];
}

/** Per-product outstanding demand from orders whose event starts within
 *  `windowDays` (or is already under way) — "outstanding" meaning the line
 *  item's quantity minus whatever a linked batch already allocates to it, so
 *  a product doesn't keep nagging once a production plan exists for it.
 *  Line items with no product typed yet ("40 × mix TBD") can't be matched to
 *  a specific product and are skipped. */
export function productsNeededForUpcomingOrders(
  orders: ReadonlyArray<Order>,
  lineItems: ReadonlyArray<OrderLineItem>,
  links: ReadonlyArray<OrderProductionLink>,
  todayISO: string,
  windowDays: number = PRODUCE_FOR_ORDER_WINDOW_DAYS,
): Map<string, UpcomingOrderDemand> {
  const dueOrders = orders.filter((o) => {
    if (!o.id || !ACTIVE_ORDER_STATUSES.includes(o.status)) return false;
    if (orderEndDate(o) < todayISO) return false; // already over
    return daysUntil(o.eventDate, todayISO) <= windowDays;
  });
  if (dueOrders.length === 0) return new Map();
  const dueOrderIds = new Set(dueOrders.map((o) => o.id!));
  const orderById = new Map(dueOrders.map((o) => [o.id!, o]));

  const linksByOrder = new Map<string, OrderProductionLink[]>();
  for (const l of links) {
    if (!dueOrderIds.has(l.orderId)) continue;
    const group = linksByOrder.get(l.orderId);
    if (group) group.push(l);
    else linksByOrder.set(l.orderId, [l]);
  }
  const allocatedByOrder = new Map<string, Map<string, number>>();

  const out = new Map<string, UpcomingOrderDemand>();
  for (const item of lineItems) {
    if (!item.productId || !dueOrderIds.has(item.orderId)) continue;
    let allocated = allocatedByOrder.get(item.orderId);
    if (!allocated) {
      allocated = allocatedByProduct(linksByOrder.get(item.orderId) ?? []);
      allocatedByOrder.set(item.orderId, allocated);
    }
    const outstanding = Math.max(0, item.quantity - (allocated.get(item.productId) ?? 0));
    if (outstanding <= 0) continue;

    const order = orderById.get(item.orderId)!;
    const existing = out.get(item.productId);
    if (existing) {
      existing.quantity += outstanding;
      if (order.eventDate < existing.nearestEventDate) existing.nearestEventDate = order.eventDate;
      if (!existing.orderTitles.includes(order.title)) existing.orderTitles.push(order.title);
    } else {
      out.set(item.productId, { quantity: outstanding, nearestEventDate: order.eventDate, orderTitles: [order.title] });
    }
  }
  return out;
}

// ─── Production progress ─────────────────────────────────────────────────────

/** How far an order is from being made, in pieces.
 *
 *  `needed`  — every line item's quantity, typed or not: "40 × mix TBD" still
 *              means 40 pieces have to exist on the day.
 *  `made`    — pieces allocated from batches that are **done** (unmoulded and
 *              counted), so they physically exist.
 *  `planned` — pieces allocated from batches still in draft or in progress:
 *              spoken for, not yet made.
 *
 *  Allocations are summed across products rather than matched per line item,
 *  because line items are allowed to stay vague ("40 × mix TBD") while the
 *  batches that fulfil them are concrete (20 caramel + 20 ganache). Bare
 *  links (a batch associated with no quantity) contribute nothing. */
export interface OrderProgress {
  needed: number;
  made: number;
  planned: number;
}

export type PlanStatusLookup = ReadonlyMap<string, "draft" | "active" | "done">;

export function orderProgress(
  lineItems: ReadonlyArray<OrderLineItem>,
  links: ReadonlyArray<OrderProductionLink>,
  planStatusById: PlanStatusLookup,
): OrderProgress {
  let needed = 0;
  for (const li of lineItems) needed += Math.max(0, li.quantity || 0);

  let made = 0;
  let planned = 0;
  for (const l of links) {
    if (!l.productId || l.quantity == null || l.quantity <= 0) continue;
    // A link whose plan has been deleted (cleanup normally removes the row,
    // but sync can lag) counts as planned rather than vanishing — the user
    // sees a number they can go and investigate.
    if (planStatusById.get(l.planId) === "done") made += l.quantity;
    else planned += l.quantity;
  }
  return { needed, made, planned };
}

/** `orderProgress` for every order at once, for the list page. Line items and
 *  links are bucketed by order in one pass each, so the cost is linear in the
 *  number of rows rather than orders × rows. Orders with no line items and no
 *  allocations get `{ needed: 0, made: 0, planned: 0 }`. */
export function orderProgressByOrder(
  orders: ReadonlyArray<Order>,
  lineItems: ReadonlyArray<OrderLineItem>,
  links: ReadonlyArray<OrderProductionLink>,
  planStatusById: PlanStatusLookup,
): Map<string, OrderProgress> {
  const itemsByOrder = new Map<string, OrderLineItem[]>();
  for (const li of lineItems) {
    const list = itemsByOrder.get(li.orderId);
    if (list) list.push(li);
    else itemsByOrder.set(li.orderId, [li]);
  }
  const linksByOrder = new Map<string, OrderProductionLink[]>();
  for (const l of links) {
    const list = linksByOrder.get(l.orderId);
    if (list) list.push(l);
    else linksByOrder.set(l.orderId, [l]);
  }
  const out = new Map<string, OrderProgress>();
  for (const o of orders) {
    if (!o.id) continue;
    out.set(o.id, orderProgress(itemsByOrder.get(o.id) ?? [], linksByOrder.get(o.id) ?? [], planStatusById));
  }
  return out;
}

/** Bar geometry for a progress read-out: made and planned as percentages of
 *  needed, clamped so the two segments never overflow the track. With nothing
 *  needed there is nothing to fill, whatever has been allocated. */
export function progressSegments(p: OrderProgress): { madePct: number; plannedPct: number } {
  if (p.needed <= 0) return { madePct: 0, plannedPct: 0 };
  const madePct = Math.min(100, (p.made / p.needed) * 100);
  const plannedPct = Math.min(100 - madePct, (p.planned / p.needed) * 100);
  return { madePct, plannedPct };
}

/** "1,240" — pieces are counted, so they get thousands separators. Fixed
 *  en-US grouping keeps the pre-rendered HTML locale-independent. */
export function formatPieces(n: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 }).format(n);
}
