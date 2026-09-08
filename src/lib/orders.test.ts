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
