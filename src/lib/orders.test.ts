import { describe, it, expect } from "vitest";
import {
  toISODate,
  upcomingOrders,
  groupOrdersForList,
  monthGridDays,
  ordersByDate,
  shiftMonth,
  formatISODate,
  monthLabel,
  daysUntil,
  relativeToToday,
  normalizeCustomerKey,
  groupLinksByPlan,
  allocatedByProduct,
  lineItemFulfillment,
  isWithinPeriod,
  orderProgress,
  orderProgressByOrder,
  orderEndDate,
  isMultiDay,
  eventLengthDays,
  eventDayOf,
  formatEventDates,
  eventRelative,
  orderWithinPeriod,
  progressSegments,
  formatPieces,
  PICKUP_VENUE,
  isPickupVenue,
  venueSuggestions,
  productsNeededForUpcomingOrders,
} from "./orders";
import type { Order, OrderStatus, OrderProductionLink, OrderLineItem } from "@/types";

const TODAY = "2026-09-02";

function order(overrides: Partial<Order>): Order {
  return {
    id: "o1",
    title: "Order",
    eventDate: "2026-12-20",
    status: "lead" as OrderStatus,
    createdAt: new Date("2026-09-01T10:00:00"),
    updatedAt: new Date("2026-09-01T10:00:00"),
    ...overrides,
  };
}

describe("toISODate", () => {
  it("formats a local date as YYYY-MM-DD", () => {
    expect(toISODate(new Date(2026, 11, 20))).toBe("2026-12-20");
  });

  it("pads single-digit month and day", () => {
    expect(toISODate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });

  it("keeps the local calendar day late in the evening (no UTC shift)", () => {
    // 23:30 local on Dec 20 — toISOString() would report Dec 20 22:30 UTC or
    // later depending on zone; the local day must stay the 20th regardless.
    expect(toISODate(new Date(2026, 11, 20, 23, 30))).toBe("2026-12-20");
  });
});

describe("upcomingOrders", () => {
  it("keeps active statuses on/after today, sorted soonest first", () => {
    const orders = [
      order({ id: "a", title: "December popup", eventDate: "2026-12-20" }),
      order({ id: "b", title: "October market", eventDate: "2026-10-03", status: "confirmed" }),
      order({ id: "c", title: "November tasting", eventDate: "2026-11-11", status: "in_production" }),
    ];
    expect(upcomingOrders(orders, TODAY).map((o) => o.id)).toEqual(["b", "c", "a"]);
  });

  it("excludes fulfilled and cancelled orders even with future dates", () => {
    const orders = [
      order({ id: "a", eventDate: "2026-12-20", status: "fulfilled" }),
      order({ id: "b", eventDate: "2026-12-21", status: "cancelled" }),
      order({ id: "c", eventDate: "2026-12-22", status: "lead" }),
    ];
    expect(upcomingOrders(orders, TODAY).map((o) => o.id)).toEqual(["c"]);
  });

  it("excludes past dates but includes today", () => {
    const orders = [
      order({ id: "past", eventDate: "2026-09-01" }),
      order({ id: "today", eventDate: TODAY }),
    ];
    expect(upcomingOrders(orders, TODAY).map((o) => o.id)).toEqual(["today"]);
  });

  it("respects the limit", () => {
    const orders = [
      order({ id: "a", eventDate: "2026-10-01" }),
      order({ id: "b", eventDate: "2026-10-02" }),
      order({ id: "c", eventDate: "2026-10-03" }),
    ];
    expect(upcomingOrders(orders, TODAY, 2).map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("breaks same-day ties by title", () => {
    const orders = [
      order({ id: "z", title: "Zebra gala", eventDate: "2026-10-01" }),
      order({ id: "a", title: "Autumn fair", eventDate: "2026-10-01" }),
    ];
    expect(upcomingOrders(orders, TODAY).map((o) => o.id)).toEqual(["a", "z"]);
  });
});

describe("groupOrdersForList", () => {
  it("sends fulfilled orders to past even with a future date", () => {
    const { upcoming, past } = groupOrdersForList(
      [order({ id: "a", eventDate: "2026-12-20", status: "fulfilled" })],
      TODAY,
    );
    expect(upcoming).toHaveLength(0);
    expect(past.map((o) => o.id)).toEqual(["a"]);
  });

  it("sends active orders with passed dates to past", () => {
    const { upcoming, past } = groupOrdersForList(
      [order({ id: "a", eventDate: "2026-08-30", status: "confirmed" })],
      TODAY,
    );
    expect(upcoming).toHaveLength(0);
    expect(past.map((o) => o.id)).toEqual(["a"]);
  });

  it("sorts upcoming ascending and past descending", () => {
    const { upcoming, past } = groupOrdersForList(
      [
        order({ id: "u2", eventDate: "2026-11-01" }),
        order({ id: "u1", eventDate: "2026-10-01" }),
        order({ id: "p1", eventDate: "2026-05-01", status: "fulfilled" }),
        order({ id: "p2", eventDate: "2026-07-01", status: "fulfilled" }),
      ],
      TODAY,
    );
    expect(upcoming.map((o) => o.id)).toEqual(["u1", "u2"]);
    expect(past.map((o) => o.id)).toEqual(["p2", "p1"]);
  });
});

describe("monthGridDays", () => {
  it("always returns whole weeks", () => {
    for (let m = 0; m < 12; m++) {
      expect(monthGridDays(2026, m).length % 7).toBe(0);
    }
  });

  it("contains every day of the month", () => {
    const days = monthGridDays(2026, 8); // September 2026
    for (let d = 1; d <= 30; d++) {
      expect(days).toContain(`2026-09-${String(d).padStart(2, "0")}`);
    }
  });

  it("starts on a Monday", () => {
    for (let m = 0; m < 12; m++) {
      const first = monthGridDays(2026, m)[0];
      const [y, mo, d] = first.split("-").map(Number);
      expect(new Date(y, mo - 1, d).getDay()).toBe(1); // Monday
    }
  });

  it("pads a month starting on Sunday with six leading days (Mar 2026)", () => {
    // 1 Mar 2026 is a Sunday → week starts Mon 23 Feb.
    const days = monthGridDays(2026, 2);
    expect(days[0]).toBe("2026-02-23");
    expect(days[6]).toBe("2026-03-01");
  });

  it("has no leading pad for a month starting on Monday (Jun 2026)", () => {
    const days = monthGridDays(2026, 5);
    expect(days[0]).toBe("2026-06-01");
  });

  it("handles non-leap February (2026)", () => {
    const days = monthGridDays(2026, 1);
    expect(days).toContain("2026-02-28");
    expect(days.filter((d) => d.startsWith("2026-02-")).length).toBe(28);
  });

  it("handles leap February (2028)", () => {
    const days = monthGridDays(2028, 1);
    expect(days).toContain("2028-02-29");
  });

  it("crosses the year boundary for December", () => {
    // 31 Dec 2026 is a Thursday → grid runs through Sun 3 Jan 2027.
    const days = monthGridDays(2026, 11);
    expect(days[days.length - 1]).toBe("2027-01-03");
  });
});

describe("ordersByDate", () => {
  it("groups multiple orders on the same day", () => {
    const map = ordersByDate([
      order({ id: "a", eventDate: "2026-12-20" }),
      order({ id: "b", eventDate: "2026-12-20" }),
      order({ id: "c", eventDate: "2026-12-21" }),
    ]);
    expect(map.get("2026-12-20")?.map((o) => o.id)).toEqual(["a", "b"]);
    expect(map.get("2026-12-21")?.map((o) => o.id)).toEqual(["c"]);
    expect(map.get("2026-12-22")).toBeUndefined();
  });
});

describe("date display helpers", () => {
  it("formatISODate renders '20 Dec 2026'", () => {
    expect(formatISODate("2026-12-20")).toBe("20 Dec 2026");
    expect(formatISODate("2026-01-05")).toBe("5 Jan 2026");
  });

  it("monthLabel renders 'December 2026'", () => {
    expect(monthLabel("2026-12-20")).toBe("December 2026");
  });

  it("daysUntil counts whole days in both directions", () => {
    expect(daysUntil("2026-09-02", TODAY)).toBe(0);
    expect(daysUntil("2026-09-05", TODAY)).toBe(3);
    expect(daysUntil("2026-08-30", TODAY)).toBe(-3);
    expect(daysUntil("2026-12-20", TODAY)).toBe(109);
  });

  it("relativeToToday picks sensible units", () => {
    expect(relativeToToday("2026-09-02", TODAY)).toBe("today");
    expect(relativeToToday("2026-09-03", TODAY)).toBe("tomorrow");
    expect(relativeToToday("2026-09-01", TODAY)).toBe("yesterday");
    expect(relativeToToday("2026-09-07", TODAY)).toBe("in 5 days");
    expect(relativeToToday("2026-09-23", TODAY)).toBe("in 3 weeks");
    expect(relativeToToday("2026-12-20", TODAY)).toBe("in 4 months");
    expect(relativeToToday("2026-08-28", TODAY)).toBe("5 days ago");
  });
});

function link(overrides: Partial<OrderProductionLink>): OrderProductionLink {
  return { id: "l1", orderId: "o1", planId: "p1", ...overrides };
}

function lineItem(overrides: Partial<OrderLineItem>): OrderLineItem {
  return { id: "li1", orderId: "o1", quantity: 40, sortOrder: 0, ...overrides };
}

describe("isWithinPeriod", () => {
  it("always passes for 'all'", () => {
    expect(isWithinPeriod("2030-01-01", TODAY, "all")).toBe(true);
    expect(isWithinPeriod("2020-01-01", TODAY, "all")).toBe(true);
  });

  it("bounds the window symmetrically around today", () => {
    expect(isWithinPeriod("2026-09-30", TODAY, "30d")).toBe(true);   // +28 days
    expect(isWithinPeriod("2026-10-15", TODAY, "30d")).toBe(false);  // +43 days
    expect(isWithinPeriod("2026-08-10", TODAY, "30d")).toBe(true);   // -23 days
    expect(isWithinPeriod("2026-07-01", TODAY, "30d")).toBe(false);  // -63 days
  });

  it("treats the boundary day as inside", () => {
    expect(isWithinPeriod("2026-10-02", TODAY, "30d")).toBe(true);   // exactly +30
    expect(isWithinPeriod("2026-12-01", TODAY, "90d")).toBe(true);   // exactly +90
  });

  it("uses 365 days for '12mo'", () => {
    expect(isWithinPeriod("2027-08-01", TODAY, "12mo")).toBe(true);
    expect(isWithinPeriod("2027-09-15", TODAY, "12mo")).toBe(false);
  });
});

describe("groupLinksByPlan", () => {
  it("returns an empty map for no links", () => {
    expect(groupLinksByPlan([]).size).toBe(0);
  });

  it("groups rows by plan, keeping bare and allocation rows together", () => {
    const groups = groupLinksByPlan([
      link({ id: "a", planId: "p1" }), // bare
      link({ id: "b", planId: "p1", productId: "prodA", quantity: 20 }),
      link({ id: "c", planId: "p2", productId: "prodB", quantity: 10 }),
    ]);
    expect(groups.size).toBe(2);
    expect(groups.get("p1")?.map((l) => l.id)).toEqual(["a", "b"]);
    expect(groups.get("p2")?.map((l) => l.id)).toEqual(["c"]);
  });
});

describe("allocatedByProduct", () => {
  it("ignores bare rows and rows without a quantity", () => {
    const map = allocatedByProduct([
      link({ id: "a" }), // bare
      link({ id: "b", productId: "prodA" }), // no quantity
      link({ id: "c", productId: "prodA", quantity: 20 }),
    ]);
    expect(map.get("prodA")).toBe(20);
    expect(map.size).toBe(1);
  });

  it("sums the same product across multiple plans", () => {
    const map = allocatedByProduct([
      link({ id: "a", planId: "p1", productId: "prodA", quantity: 20 }),
      link({ id: "b", planId: "p2", productId: "prodA", quantity: 15 }),
      link({ id: "c", planId: "p1", productId: "prodB", quantity: 5 }),
    ]);
    expect(map.get("prodA")).toBe(35);
    expect(map.get("prodB")).toBe(5);
  });
});

describe("lineItemFulfillment", () => {
  const allocated = new Map([["prodA", 10]]);

  it("returns null for untyped line items", () => {
    expect(lineItemFulfillment(lineItem({}), allocated)).toBeNull();
  });

  it("reports partial fulfillment", () => {
    expect(lineItemFulfillment(lineItem({ productId: "prodA", quantity: 40 }), allocated))
      .toEqual({ allocated: 10, needed: 40 });
  });

  it("reports complete and over fulfillment", () => {
    const full = new Map([["prodA", 40]]);
    expect(lineItemFulfillment(lineItem({ productId: "prodA", quantity: 40 }), full))
      .toEqual({ allocated: 40, needed: 40 });
    const over = new Map([["prodA", 50]]);
    expect(lineItemFulfillment(lineItem({ productId: "prodA", quantity: 40 }), over))
      .toEqual({ allocated: 50, needed: 40 });
  });

  it("reports zero when the product has no allocations", () => {
    expect(lineItemFulfillment(lineItem({ productId: "prodX", quantity: 40 }), allocated))
      .toEqual({ allocated: 0, needed: 40 });
  });
});

describe("productsNeededForUpcomingOrders", () => {
  it("flags a product needed by an order within the default 14-day window", () => {
    const orders = [order({ id: "o1", title: "Market", eventDate: "2026-09-10", status: "confirmed" })];
    const items = [lineItem({ orderId: "o1", productId: "prodA", quantity: 40 })];
    const map = productsNeededForUpcomingOrders(orders, items, [], TODAY);
    expect(map.get("prodA")).toEqual({ quantity: 40, nearestEventDate: "2026-09-10", orderTitles: ["Market"] });
  });

  it("excludes orders further out than the window", () => {
    const orders = [order({ id: "o1", eventDate: "2026-10-01", status: "confirmed" })]; // 29 days out
    const items = [lineItem({ orderId: "o1", productId: "prodA", quantity: 40 })];
    expect(productsNeededForUpcomingOrders(orders, items, [], TODAY).size).toBe(0);
  });

  it("respects a custom windowDays", () => {
    const orders = [order({ id: "o1", eventDate: "2026-10-01", status: "confirmed" })]; // 29 days out
    const items = [lineItem({ orderId: "o1", productId: "prodA", quantity: 40 })];
    expect(productsNeededForUpcomingOrders(orders, items, [], TODAY, 30).get("prodA")?.quantity).toBe(40);
  });

  it("excludes fulfilled and cancelled orders", () => {
    const orders = [
      order({ id: "o1", eventDate: "2026-09-05", status: "fulfilled" }),
      order({ id: "o2", eventDate: "2026-09-06", status: "cancelled" }),
    ];
    const items = [
      lineItem({ orderId: "o1", productId: "prodA", quantity: 40 }),
      lineItem({ orderId: "o2", productId: "prodA", quantity: 10 }),
    ];
    expect(productsNeededForUpcomingOrders(orders, items, [], TODAY).size).toBe(0);
  });

  it("includes a multi-day event already under way even though eventDate is in the past", () => {
    const orders = [order({ id: "o1", eventDate: "2026-08-30", endDate: "2026-09-03", status: "confirmed" })];
    const items = [lineItem({ orderId: "o1", productId: "prodA", quantity: 40 })];
    expect(productsNeededForUpcomingOrders(orders, items, [], TODAY).get("prodA")?.quantity).toBe(40);
  });

  it("excludes an event that has fully ended", () => {
    const orders = [order({ id: "o1", eventDate: "2026-08-25", endDate: "2026-08-30", status: "confirmed" })];
    const items = [lineItem({ orderId: "o1", productId: "prodA", quantity: 40 })];
    expect(productsNeededForUpcomingOrders(orders, items, [], TODAY).size).toBe(0);
  });

  it("skips line items with no product typed yet", () => {
    const orders = [order({ id: "o1", eventDate: "2026-09-10", status: "lead" })];
    const items = [lineItem({ orderId: "o1", quantity: 40 })]; // no productId
    expect(productsNeededForUpcomingOrders(orders, items, [], TODAY).size).toBe(0);
  });

  it("nets out quantity already allocated to a linked batch", () => {
    const orders = [order({ id: "o1", eventDate: "2026-09-10", status: "confirmed" })];
    const items = [lineItem({ orderId: "o1", productId: "prodA", quantity: 40 })];
    const links = [link({ orderId: "o1", planId: "p1", productId: "prodA", quantity: 25 })];
    expect(productsNeededForUpcomingOrders(orders, items, links, TODAY).get("prodA")?.quantity).toBe(15);
  });

  it("drops a product once its allocation fully covers the line item", () => {
    const orders = [order({ id: "o1", eventDate: "2026-09-10", status: "confirmed" })];
    const items = [lineItem({ orderId: "o1", productId: "prodA", quantity: 40 })];
    const links = [link({ orderId: "o1", planId: "p1", productId: "prodA", quantity: 40 })];
    expect(productsNeededForUpcomingOrders(orders, items, links, TODAY).size).toBe(0);
  });

  it("aggregates the same product across multiple upcoming orders, keeping the soonest date", () => {
    const orders = [
      order({ id: "o1", title: "Later fair", eventDate: "2026-09-14", status: "confirmed" }),
      order({ id: "o2", title: "Sooner market", eventDate: "2026-09-05", status: "lead" }),
    ];
    const items = [
      lineItem({ id: "li1", orderId: "o1", productId: "prodA", quantity: 20 }),
      lineItem({ id: "li2", orderId: "o2", productId: "prodA", quantity: 10 }),
    ];
    const result = productsNeededForUpcomingOrders(orders, items, [], TODAY).get("prodA");
    expect(result).toEqual({
      quantity: 30,
      nearestEventDate: "2026-09-05",
      orderTitles: ["Later fair", "Sooner market"],
    });
  });
});

describe("normalizeCustomerKey", () => {
  it("trims, collapses inner whitespace, and lowercases", () => {
    expect(normalizeCustomerKey("  Gemeente  Westerveld ")).toBe("gemeente westerveld");
    expect(normalizeCustomerKey("gemeente westerveld")).toBe("gemeente westerveld");
  });

  it("keeps an empty string empty", () => {
    expect(normalizeCustomerKey("")).toBe("");
    expect(normalizeCustomerKey("   ")).toBe("");
  });
});

describe("shiftMonth", () => {
  it("rolls December forward into January of the next year", () => {
    expect(shiftMonth(2026, 11, 1)).toEqual({ year: 2027, month: 0 });
  });

  it("rolls January back into December of the prior year", () => {
    expect(shiftMonth(2026, 0, -1)).toEqual({ year: 2025, month: 11 });
  });

  it("moves within a year", () => {
    expect(shiftMonth(2026, 5, 2)).toEqual({ year: 2026, month: 7 });
  });

  it("handles jumps of more than a year", () => {
    expect(shiftMonth(2026, 10, 14)).toEqual({ year: 2028, month: 0 });
  });
});

describe("orderProgress", () => {
  const status = new Map<string, "draft" | "active" | "done">([
    ["done1", "done"],
    ["active1", "active"],
    ["draft1", "draft"],
  ]);

  it("sums every line item into needed, typed or not", () => {
    const p = orderProgress(
      [lineItem({ id: "a", quantity: 40 }), lineItem({ id: "b", productId: "prodA", quantity: 1200 })],
      [],
      status,
    );
    expect(p).toEqual({ needed: 1240, made: 0, planned: 0 });
  });

  it("splits allocations into made (done batches) and planned (everything else)", () => {
    const p = orderProgress(
      [lineItem({ quantity: 100 })],
      [
        link({ id: "l1", planId: "done1", productId: "prodA", quantity: 30 }),
        link({ id: "l2", planId: "active1", productId: "prodB", quantity: 20 }),
        link({ id: "l3", planId: "draft1", productId: "prodA", quantity: 10 }),
      ],
      status,
    );
    expect(p).toEqual({ needed: 100, made: 30, planned: 30 });
  });

  it("ignores bare links and allocations without a positive quantity", () => {
    const p = orderProgress(
      [lineItem({ quantity: 10 })],
      [
        link({ id: "l1", planId: "done1" }), // bare
        link({ id: "l2", planId: "done1", productId: "prodA" }), // no quantity
        link({ id: "l3", planId: "done1", productId: "prodA", quantity: 0 }),
      ],
      status,
    );
    expect(p).toEqual({ needed: 10, made: 0, planned: 0 });
  });

  it("treats an allocation whose plan is unknown as planned, not lost", () => {
    const p = orderProgress(
      [lineItem({ quantity: 10 })],
      [link({ id: "l1", planId: "gone", productId: "prodA", quantity: 5 })],
      status,
    );
    expect(p.planned).toBe(5);
    expect(p.made).toBe(0);
  });

  it("does not let a negative or missing quantity reduce needed", () => {
    const p = orderProgress(
      [lineItem({ id: "a", quantity: 10 }), lineItem({ id: "b", quantity: -5 }), lineItem({ id: "c", quantity: NaN })],
      [],
      status,
    );
    expect(p.needed).toBe(10);
  });
});

describe("orderProgressByOrder", () => {
  const status = new Map<string, "draft" | "active" | "done">([["done1", "done"], ["active1", "active"]]);

  it("buckets line items and links by order and returns one entry per order", () => {
    const orders = [order({ id: "o1" }), order({ id: "o2" }), order({ id: "o3" })];
    const items = [
      lineItem({ id: "a", orderId: "o1", quantity: 40 }),
      lineItem({ id: "b", orderId: "o1", quantity: 60 }),
      lineItem({ id: "c", orderId: "o2", quantity: 500 }),
    ];
    const links = [
      link({ id: "l1", orderId: "o1", planId: "done1", productId: "p", quantity: 100 }),
      link({ id: "l2", orderId: "o2", planId: "active1", productId: "p", quantity: 200 }),
    ];
    const map = orderProgressByOrder(orders, items, links, status);
    expect(map.get("o1")).toEqual({ needed: 100, made: 100, planned: 0 });
    expect(map.get("o2")).toEqual({ needed: 500, made: 0, planned: 200 });
    expect(map.get("o3")).toEqual({ needed: 0, made: 0, planned: 0 });
    expect(map.size).toBe(3);
  });

  it("ignores rows for orders that are not in the list", () => {
    const map = orderProgressByOrder(
      [order({ id: "o1" })],
      [lineItem({ orderId: "deleted", quantity: 10 })],
      [link({ orderId: "deleted", planId: "done1", productId: "p", quantity: 10 })],
      status,
    );
    expect(map.get("o1")).toEqual({ needed: 0, made: 0, planned: 0 });
    expect(map.has("deleted")).toBe(false);
  });
});

describe("progressSegments", () => {
  it("returns an empty bar when nothing is needed, whatever was allocated", () => {
    expect(progressSegments({ needed: 0, made: 50, planned: 20 })).toEqual({ madePct: 0, plannedPct: 0 });
  });

  it("scales made and planned against needed", () => {
    expect(progressSegments({ needed: 200, made: 50, planned: 100 })).toEqual({ madePct: 25, plannedPct: 50 });
  });

  it("clamps so the two segments never exceed the track", () => {
    expect(progressSegments({ needed: 100, made: 80, planned: 50 })).toEqual({ madePct: 80, plannedPct: 20 });
    expect(progressSegments({ needed: 100, made: 150, planned: 50 })).toEqual({ madePct: 100, plannedPct: 0 });
  });
});

describe("formatPieces", () => {
  it("groups thousands and drops fractions", () => {
    expect(formatPieces(1240)).toBe("1,240");
    expect(formatPieces(40)).toBe("40");
    expect(formatPieces(12345.6)).toBe("12,346");
    expect(formatPieces(0)).toBe("0");
  });
});

describe("multi-day events", () => {
  const single = { eventDate: "2026-12-20" };
  const weekend = { eventDate: "2026-12-19", endDate: "2026-12-20" };
  const monthSpan = { eventDate: "2026-11-30", endDate: "2026-12-01" };
  const yearSpan = { eventDate: "2026-12-30", endDate: "2027-01-02" };

  it("orderEndDate falls back to the start, and ignores an end before the start", () => {
    expect(orderEndDate(single)).toBe("2026-12-20");
    expect(orderEndDate(weekend)).toBe("2026-12-20");
    expect(orderEndDate({ eventDate: "2026-12-20", endDate: "2026-12-10" })).toBe("2026-12-20");
    expect(isMultiDay(single)).toBe(false);
    expect(isMultiDay(weekend)).toBe(true);
  });

  it("eventLengthDays counts inclusive calendar days", () => {
    expect(eventLengthDays(single)).toBe(1);
    expect(eventLengthDays(weekend)).toBe(2);
    expect(eventLengthDays(yearSpan)).toBe(4);
  });

  it("eventDayOf locates a day inside the event and rejects days outside it", () => {
    expect(eventDayOf(weekend, "2026-12-19")).toEqual({ day: 1, total: 2 });
    expect(eventDayOf(weekend, "2026-12-20")).toEqual({ day: 2, total: 2 });
    expect(eventDayOf(weekend, "2026-12-21")).toBeNull();
    expect(eventDayOf(weekend, "2026-12-18")).toBeNull();
    expect(eventDayOf(single, "2026-12-20")).toEqual({ day: 1, total: 1 });
  });

  it("formatEventDates collapses shared month and year", () => {
    expect(formatEventDates(single)).toBe("20 Dec 2026");
    expect(formatEventDates(weekend)).toBe("19–20 Dec 2026");
    expect(formatEventDates(monthSpan)).toBe("30 Nov – 1 Dec 2026");
    expect(formatEventDates(yearSpan)).toBe("30 Dec 2026 – 2 Jan 2027");
  });

  it("formatEventDates can drop the year for compact spots", () => {
    expect(formatEventDates(single, { year: false })).toBe("20 Dec");
    expect(formatEventDates(weekend, { year: false })).toBe("19–20 Dec");
    expect(formatEventDates(monthSpan, { year: false })).toBe("30 Nov – 1 Dec");
    expect(formatEventDates(yearSpan, { year: false })).toBe("30 Dec – 2 Jan");
  });

  it("eventRelative counts down to the start, reports the day during, and counts from the end after", () => {
    expect(eventRelative(weekend, "2026-12-12")).toBe("in 7 days");
    expect(eventRelative(weekend, "2026-12-19")).toBe("day 1 of 2");
    expect(eventRelative(weekend, "2026-12-20")).toBe("day 2 of 2");
    expect(eventRelative(weekend, "2026-12-21")).toBe("yesterday");
    expect(eventRelative(single, "2026-12-20")).toBe("today");
    expect(eventRelative(single, "2026-12-19")).toBe("tomorrow");
  });

  it("a multi-day event stays upcoming through its last day", () => {
    const o = order({ eventDate: "2026-09-01", endDate: "2026-09-03", status: "confirmed" });
    expect(upcomingOrders([o], "2026-09-02")).toHaveLength(1);
    expect(upcomingOrders([o], "2026-09-03")).toHaveLength(1);
    expect(upcomingOrders([o], "2026-09-04")).toHaveLength(0);
    expect(groupOrdersForList([o], "2026-09-03").upcoming).toHaveLength(1);
    expect(groupOrdersForList([o], "2026-09-04").past).toHaveLength(1);
  });

  it("ordersByDate lists a multi-day event under every day it occupies", () => {
    const o = order({ id: "w", eventDate: "2026-11-30", endDate: "2026-12-02" });
    const map = ordersByDate([o]);
    expect(map.get("2026-11-30")).toEqual([o]);
    expect(map.get("2026-12-01")).toEqual([o]);
    expect(map.get("2026-12-02")).toEqual([o]);
    expect(map.has("2026-12-03")).toBe(false);
    expect(map.has("2026-11-29")).toBe(false);
  });

  it("orderWithinPeriod matches when any day of the event is in the window", () => {
    const today = "2026-09-02";
    const straddles = { eventDate: "2026-10-01", endDate: "2026-10-05" }; // starts day 29, ends day 33
    expect(orderWithinPeriod(straddles, today, "30d")).toBe(true);
    expect(orderWithinPeriod({ eventDate: "2026-10-03", endDate: "2026-10-05" }, today, "30d")).toBe(false);
    // Recent past: ended 29 days ago but started 35 days ago → still within 30d
    expect(orderWithinPeriod({ eventDate: "2026-07-29", endDate: "2026-08-04" }, today, "30d")).toBe(true);
    expect(orderWithinPeriod({ eventDate: "2026-07-20", endDate: "2026-07-25" }, today, "30d")).toBe(false);
    expect(orderWithinPeriod(straddles, today, "all")).toBe(true);
  });
});

describe("venues", () => {
  it("isPickupVenue matches the standing value and common spellings, case-insensitively", () => {
    expect(isPickupVenue(PICKUP_VENUE)).toBe(true);
    expect(isPickupVenue("pickup")).toBe(true);
    expect(isPickupVenue("Pick up")).toBe(true);
    expect(isPickupVenue("In-shop pick-up")).toBe(true);
    expect(isPickupVenue("Brink, Dwingeloo")).toBe(false);
    expect(isPickupVenue(undefined)).toBe(false);
    expect(isPickupVenue("")).toBe(false);
  });

  it("venueSuggestions puts Pick-up first, then distinct venues sorted case-insensitively", () => {
    const list = venueSuggestions([
      { venue: "Wittelte" },
      { venue: "brink, Dwingeloo" },
      { venue: " Wittelte " }, // duplicate after trim
      { venue: "WITTELTE" }, // duplicate by case — first spelling wins
      { venue: "Pick-up" }, // never listed twice
      { venue: undefined },
      { venue: "" },
      { venue: "Assen" },
    ]);
    expect(list).toEqual([PICKUP_VENUE, "Assen", "brink, Dwingeloo", "Wittelte"]);
  });

  it("venueSuggestions offers Pick-up even with no orders", () => {
    expect(venueSuggestions([])).toEqual([PICKUP_VENUE]);
  });
});
