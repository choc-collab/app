import { describe, it, expect } from "vitest";
import {
  buildScheduleItems, weekDays, stalePhaseDateIds, collapsePhasesForCalendar, compareScheduleItems,
  cascadePhaseDateChange,
} from "./schedule";
import type { Order, OrderStatus, PlanPhaseDate, ProductionPlan, PrepTask } from "@/types";

function order(overrides: Partial<Order>): Order {
  return {
    id: "o1",
    title: "Order",
    eventDate: "2026-09-19",
    status: "lead" as OrderStatus,
    createdAt: new Date("2026-09-01T10:00:00"),
    updatedAt: new Date("2026-09-01T10:00:00"),
    ...overrides,
  };
}

function plan(overrides: Partial<ProductionPlan>): ProductionPlan {
  return {
    id: "p1",
    name: "Batch #41",
    createdAt: new Date("2026-09-01T10:00:00"),
    updatedAt: new Date("2026-09-01T10:00:00"),
    status: "draft",
    ...overrides,
  };
}

function phaseDate(overrides: Partial<PlanPhaseDate>): PlanPhaseDate {
  return {
    id: "pd1",
    planId: "p1",
    // A phase that isn't split by chocolate type, so the common case needs no
    // coating; shell/cap fixtures below set one, as real rows always do.
    phase: "filling",
    scheduledDate: "2026-09-14",
    ...overrides,
  };
}

function task(overrides: Partial<PrepTask>): PrepTask {
  return {
    id: "t1",
    title: "Print allergen labels",
    scheduledDate: "2026-09-17",
    done: false,
    ...overrides,
  };
}

describe("buildScheduleItems", () => {
  it("returns an empty list when everything is empty", () => {
    expect(buildScheduleItems([], [], [], [])).toEqual([]);
  });

  it("expands a multi-day order into one item per day, with a day-of-total subtitle", () => {
    const o = order({ id: "o1", title: "Autumn Market — Ghent", eventDate: "2026-09-19", endDate: "2026-09-20" });
    const items = buildScheduleItems([o], [], [], []);
    expect(items).toHaveLength(2);
    expect(items.map((i) => i.date)).toEqual(["2026-09-19", "2026-09-20"]);
    for (const i of items) {
      expect(i.type).toBe("order");
      expect(i.title).toBe("Autumn Market — Ghent");
      expect(i.href).toBe("/orders/o1");
    }
    expect(items[0].subtitle).toBe("day 1 of 2");
    expect(items[1].subtitle).toBe("day 2 of 2");
  });

  it("gives a single-day order no subtitle", () => {
    const items = buildScheduleItems([order({ eventDate: "2026-09-19" })], [], [], []);
    expect(items).toHaveLength(1);
    expect(items[0].subtitle).toBeUndefined();
  });

  it("resolves a phase item's title from the plan name and phase label, linking to the plan's tab", () => {
    const items = buildScheduleItems(
      [],
      [phaseDate({ planId: "p1", phase: "shell", coating: "dark", scheduledDate: "2026-09-14" })],
      [plan({ id: "p1", name: "Batch #41" })],
      [],
    );
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      date: "2026-09-14",
      type: "phase",
      title: "Batch #41 — Shell · dark",
      href: "/production/p1?tab=shell",
      sourceId: "pd1",
    });
  });

  it("falls back to a generic label when the phase date's plan can't be found", () => {
    const items = buildScheduleItems([], [phaseDate({ planId: "missing" })], [], []);
    expect(items[0].title).toBe("Batch — Fillings");
  });

  it("links a task to its order when both an order and a plan are set", () => {
    const items = buildScheduleItems([], [], [], [task({ orderId: "o1", planId: "p1" })]);
    expect(items[0].href).toBe("/orders/o1");
  });

  it("links a task to its plan when only a plan is set", () => {
    const items = buildScheduleItems([], [], [], [task({ orderId: undefined, planId: "p1" })]);
    expect(items[0].href).toBe("/production/p1");
  });

  it("ignores a coating-less shell/cap row — a leftover from before those split by chocolate type", () => {
    const items = buildScheduleItems([], [
      phaseDate({ id: "legacy", phase: "cap", coating: undefined }),
      phaseDate({ id: "real", phase: "cap", coating: "dark" }),
      phaseDate({ id: "plain", phase: "unmould", coating: undefined }),
    ], [plan({ id: "p1" })], []);
    // The cap row without a coating is dropped; unmould never splits, so its
    // coating-less row is the normal shape and stays.
    expect(items.map((i) => i.sourceId).sort()).toEqual(["plain", "real"]);
  });

  it("gives a standalone task (no order, no plan) no href, and carries its done state", () => {
    const items = buildScheduleItems([], [], [], [task({ orderId: undefined, planId: undefined, done: true })]);
    expect(items[0].href).toBeUndefined();
    expect(items[0].done).toBe(true);
    expect(items[0].sourceId).toBe("t1");
  });
});

describe("collapsePhasesForCalendar", () => {
  const plans = [plan({ id: "p1", name: "Batch #41" }), plan({ id: "p2", name: "Batch #42" })];

  /** Phase items for the calendar, as `buildScheduleItems` would produce them. */
  function phaseItems(rows: PlanPhaseDate[]) {
    return buildScheduleItems([], rows, plans, []);
  }

  it("pools the same task across batches into one chip", () => {
    const items = phaseItems([
      phaseDate({ id: "a", planId: "p1", phase: "filling", scheduledDate: "2026-09-16" }),
      phaseDate({ id: "b", planId: "p2", phase: "filling", scheduledDate: "2026-09-16" }),
    ]);
    const collapsed = collapsePhasesForCalendar(items);
    expect(collapsed).toHaveLength(1);
    expect(collapsed[0].title).toBe("Fillings · 2 batches");
    expect(collapsed[0].subtitle).toBe("Batch #41, Batch #42");
    // No longer a single row, so it stops deep-linking to one batch.
    expect(collapsed[0].href).toBe("/production");
    expect(collapsed[0].sourceId).toBeUndefined();
  });

  it("keeps shelling separate per chocolate type — they're separate tempering sessions", () => {
    const items = phaseItems([
      phaseDate({ id: "a", planId: "p1", phase: "shell", coating: "dark", scheduledDate: "2026-09-14" }),
      phaseDate({ id: "b", planId: "p2", phase: "shell", coating: "dark", scheduledDate: "2026-09-14" }),
      phaseDate({ id: "c", planId: "p1", phase: "shell", coating: "milk", scheduledDate: "2026-09-14" }),
    ]);
    const collapsed = collapsePhasesForCalendar(items);
    expect(collapsed.map((i) => i.title).sort()).toEqual([
      "Shell · dark · 2 batches",
      "Shell · milk · 1 batch",
    ]);
  });

  it("keeps the deep link when a chip still stands for exactly one batch", () => {
    const items = phaseItems([phaseDate({ id: "a", planId: "p1", phase: "cap", coating: "dark" })]);
    const collapsed = collapsePhasesForCalendar(items);
    expect(collapsed[0].title).toBe("Cap · dark · 1 batch");
    expect(collapsed[0].href).toBe("/production/p1?tab=cap");
  });

  it("only counts a pooled chip as done when every batch in it is", () => {
    const partly = collapsePhasesForCalendar(phaseItems([
      phaseDate({ id: "a", planId: "p1", phase: "filling", done: true }),
      phaseDate({ id: "b", planId: "p2", phase: "filling", done: false }),
    ]));
    expect(partly[0].done).toBe(false);

    const fully = collapsePhasesForCalendar(phaseItems([
      phaseDate({ id: "a", planId: "p1", phase: "filling", done: true }),
      phaseDate({ id: "b", planId: "p2", phase: "filling", done: true }),
    ]));
    expect(fully[0].done).toBe(true);
  });

  it("never pools across days", () => {
    const items = phaseItems([
      phaseDate({ id: "a", planId: "p1", phase: "filling", scheduledDate: "2026-09-16" }),
      phaseDate({ id: "b", planId: "p2", phase: "filling", scheduledDate: "2026-09-17" }),
    ]);
    expect(collapsePhasesForCalendar(items)).toHaveLength(2);
  });

  it("leaves orders and tasks untouched", () => {
    const items = buildScheduleItems(
      [order({ id: "o1", title: "Market", eventDate: "2026-09-19" })],
      [],
      plans,
      [task({ id: "t1", scheduledDate: "2026-09-19" })],
    );
    expect(collapsePhasesForCalendar(items)).toEqual(items);
  });
});

describe("compareScheduleItems", () => {
  it("puts orders first, then production work, then tasks", () => {
    const items = buildScheduleItems(
      [order({ id: "o1", title: "Market", eventDate: "2026-09-16" })],
      [phaseDate({ id: "pd1", planId: "p1", phase: "shell", coating: "dark", scheduledDate: "2026-09-16" })],
      [plan({ id: "p1" })],
      [task({ id: "t1", scheduledDate: "2026-09-16" })],
    );
    expect([...items].sort(compareScheduleItems).map((i) => i.type)).toEqual(["order", "phase", "task"]);
  });

  it("sinks finished work below whatever is still outstanding", () => {
    const items = buildScheduleItems(
      [],
      [phaseDate({ id: "pd1", planId: "p1", phase: "filling", done: true, scheduledDate: "2026-09-16" })],
      [plan({ id: "p1" })],
      [task({ id: "t1", scheduledDate: "2026-09-16", done: false })],
    );
    // Phases normally sort above tasks; being done demotes this one anyway.
    expect([...items].sort(compareScheduleItems).map((i) => i.type)).toEqual(["task", "phase"]);
  });

  it("orders production work the way the day actually runs, not alphabetically", () => {
    const items = buildScheduleItems([], [
      phaseDate({ id: "a", planId: "p1", phase: "unmould", scheduledDate: "2026-09-16" }),
      phaseDate({ id: "b", planId: "p1", phase: "shell", coating: "dark", scheduledDate: "2026-09-16" }),
      phaseDate({ id: "c", planId: "p1", phase: "cap", coating: "dark", scheduledDate: "2026-09-16" }),
    ], [plan({ id: "p1" })], []);
    expect([...items].sort(compareScheduleItems).map((i) => i.phase)).toEqual(["shell", "cap", "unmould"]);
  });
});

describe("cascadePhaseDateChange", () => {
  /** A batch running Mon→Thu: shell, fill, cap, unmould one day apart. */
  const chain: PlanPhaseDate[] = [
    phaseDate({ id: "shell", phase: "shell", scheduledDate: "2026-09-14" }),
    phaseDate({ id: "fill", phase: "fill", scheduledDate: "2026-09-15" }),
    phaseDate({ id: "cap", phase: "cap", scheduledDate: "2026-09-16" }),
    phaseDate({ id: "unmould", phase: "unmould", scheduledDate: "2026-09-17" }),
  ];

  it("drags the later phases along by the same shift, keeping the gaps", () => {
    const result = cascadePhaseDateChange(chain, { phase: "fill" }, "2026-09-17"); // +2 days
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.laterUpdates).toEqual([
      { id: "cap", scheduledDate: "2026-09-18" },
      { id: "unmould", scheduledDate: "2026-09-19" },
    ]);
  });

  it("leaves earlier phases alone", () => {
    const result = cascadePhaseDateChange(chain, { phase: "cap" }, "2026-09-18");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.laterUpdates.map((u) => u.id)).toEqual(["unmould"]);
  });

  it("refuses to put a phase before one that has to happen first", () => {
    // Unmoulding on the 15th, when capping is on the 16th.
    const result = cascadePhaseDateChange(chain, { phase: "unmould" }, "2026-09-15");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.conflict.phase).toBe("cap");
    expect(result.conflict.scheduledDate).toBe("2026-09-16");
  });

  it("names the binding constraint — the latest blocking phase, not the first found", () => {
    const result = cascadePhaseDateChange(chain, { phase: "unmould" }, "2026-09-13");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.conflict.phase).toBe("cap"); // the 16th, later than shell's 14th
  });

  it("allows moving a phase earlier when nothing precedes it that late", () => {
    const result = cascadePhaseDateChange(chain, { phase: "unmould" }, "2026-09-16");
    expect(result.ok).toBe(true);
  });

  it("treats coating variants of one phase as siblings, not a sequence", () => {
    const rows: PlanPhaseDate[] = [
      phaseDate({ id: "dark", phase: "shell", coating: "dark", scheduledDate: "2026-09-14" }),
      phaseDate({ id: "milk", phase: "shell", coating: "milk", scheduledDate: "2026-09-16" }),
      phaseDate({ id: "cap", phase: "cap", scheduledDate: "2026-09-17" }),
    ];
    // Milk shelling on the 16th doesn't block dark shelling on the 15th…
    const result = cascadePhaseDateChange(rows, { phase: "shell", coating: "dark" }, "2026-09-15");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // …and moving dark shifts cap, but not its milk sibling.
    expect(result.laterUpdates).toEqual([{ id: "cap", scheduledDate: "2026-09-18" }]);
  });

  it("does nothing when the date is unchanged", () => {
    const result = cascadePhaseDateChange(chain, { phase: "shell" }, "2026-09-14");
    expect(result).toEqual({ ok: true, laterUpdates: [] });
  });

  it("skips the shift when the slot had no date to move from", () => {
    const rows = chain.filter((r) => r.phase !== "fill");
    const result = cascadePhaseDateChange(rows, { phase: "fill" }, "2026-09-15");
    expect(result).toEqual({ ok: true, laterUpdates: [] });
  });
});

describe("weekDays", () => {
  it("returns Monday–Sunday of the week containing the anchor date", () => {
    // 2026-09-16 is a Wednesday
    expect(weekDays("2026-09-16")).toEqual([
      "2026-09-14", "2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20",
    ]);
  });

  it("treats a Monday anchor as the start of its own week", () => {
    expect(weekDays("2026-09-14")[0]).toBe("2026-09-14");
  });

  it("treats a Sunday anchor as the end of its own week", () => {
    expect(weekDays("2026-09-20")[6]).toBe("2026-09-20");
  });

  it("spans a month boundary correctly", () => {
    // 2026-09-30 is a Wednesday
    expect(weekDays("2026-09-30")).toEqual([
      "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04",
    ]);
  });
});

describe("stalePhaseDateIds", () => {
  it("returns nothing when every (planId, phase) pair is unique", () => {
    expect(stalePhaseDateIds([
      { id: "a", planId: "p1", phase: "shell" },
      { id: "b", planId: "p1", phase: "cap" },
      { id: "c", planId: "p2", phase: "shell" },
    ])).toEqual([]);
  });

  it("keeps the last row of each duplicated pair — the one the UI reads and writes", () => {
    expect(stalePhaseDateIds([
      { id: "a", planId: "p1", phase: "shell" },
      { id: "b", planId: "p1", phase: "shell" },
      { id: "c", planId: "p1", phase: "shell" },
    ])).toEqual(["a", "b"]);
  });

  it("dedupes each plan and phase independently", () => {
    expect(stalePhaseDateIds([
      { id: "a", planId: "p1", phase: "shell" },
      { id: "b", planId: "p2", phase: "shell" },
      { id: "c", planId: "p1", phase: "shell" },
      { id: "d", planId: "p1", phase: "cap" },
      { id: "e", planId: "p2", phase: "shell" },
    ])).toEqual(["a", "b"]);
  });

  it("ignores rows missing an id, planId or phase rather than dropping them", () => {
    expect(stalePhaseDateIds([
      { planId: "p1", phase: "shell" },
      { id: "b", phase: "shell" },
      { id: "c", planId: "p1" },
    ])).toEqual([]);
  });
});
