import { describe, it, expect } from "vitest";
import {
  isoDayOf,
  shiftISODate,
  formatLongDate,
  formatShortDate,
  relativeDayLabel,
  parseStepKey,
  computeDigestIndex,
  computeDayDigest,
  digestHeadline,
  emptyDigest,
  entriesByDate,
  logDayByDate,
  formatConditions,
  logDaysForList,
  groupLogDaysByMonth,
  parseConditionValue,
  LOG_AREAS,
  LOG_AREA_LABEL,
  type LogSources,
} from "./dailyLog";
import type {
  Customer, Experiment, Filling, FillingStock, GiveAwayRecord, Ingredient, IngredientPriceHistory,
  LogDay, LogEntry, Mould, Order, Packaging, PackagingOrder, PlanFilling, PlanProduct, PlanStepStatus,
  Product, ProductionPlan, Sale, ShoppingItem,
} from "@/types";

// Fixed local timestamps — the digest keys on the *local* calendar day.
const DAY = "2026-09-09";
const at = (iso: string, h = 10) => {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d, h, 0, 0);
};

// ─── Dates ───────────────────────────────────────────────────────────────────

describe("isoDayOf", () => {
  it("passes ISO dates through untouched", () => {
    expect(isoDayOf("2026-09-09")).toBe("2026-09-09");
  });
  it("buckets Date objects and ms numbers on the local day", () => {
    expect(isoDayOf(at(DAY, 23))).toBe(DAY);
    expect(isoDayOf(at(DAY, 0).getTime())).toBe(DAY);
  });
  it("parses ISO date-time strings", () => {
    expect(isoDayOf(at(DAY, 15).toISOString())).toBe(DAY);
  });
  it("returns null for missing or garbage input", () => {
    expect(isoDayOf(undefined)).toBeNull();
    expect(isoDayOf(null)).toBeNull();
    expect(isoDayOf("not a date")).toBeNull();
    expect(isoDayOf(new Date("nope"))).toBeNull();
  });
});

describe("shiftISODate", () => {
  it("moves across month and year boundaries", () => {
    expect(shiftISODate("2026-09-30", 1)).toBe("2026-10-01");
    expect(shiftISODate("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftISODate(DAY, 0)).toBe(DAY);
  });
});

describe("formatLongDate / formatShortDate / relativeDayLabel", () => {
  it("renders fixed EN names", () => {
    expect(formatLongDate("2026-09-09")).toBe("Wednesday 9 September 2026");
    expect(formatShortDate("2026-09-09")).toBe("Wed 9 Sep");
    expect(formatLongDate("2026-01-01")).toBe("Thursday 1 January 2026");
  });
  it("labels today and yesterday only", () => {
    expect(relativeDayLabel(DAY, DAY)).toBe("Today");
    expect(relativeDayLabel("2026-09-08", DAY)).toBe("Yesterday");
    expect(relativeDayLabel("2026-09-07", DAY)).toBeNull();
    expect(relativeDayLabel("2026-09-10", DAY)).toBeNull();
  });
});

// ─── Step keys ───────────────────────────────────────────────────────────────

describe("parseStepKey", () => {
  const pbIds = ["aaaa-1111", "bbbb-2222"];
  const planFillings = new Map<string, PlanFilling>([
    ["pf-1", { id: "pf-1", planId: "p", fillingId: "fill-x", multiplier: 1, targetGrams: 500, sortOrder: 0 } as PlanFilling],
  ]);
  it("resolves phase steps to their plan product, with and without a slot suffix", () => {
    expect(parseStepKey("shell-aaaa-1111", pbIds, planFillings)).toEqual({ phase: "shell", planProductId: "aaaa-1111" });
    expect(parseStepKey("color-bbbb-2222-slot2-0", pbIds, planFillings)).toEqual({ phase: "color", planProductId: "bbbb-2222" });
    expect(parseStepKey("unmould-aaaa-1111", pbIds, planFillings)).toEqual({ phase: "unmould", planProductId: "aaaa-1111" });
    expect(parseStepKey("package-aaaa-1111", pbIds, planFillings)).toEqual({ phase: "package", planProductId: "aaaa-1111" });
  });
  it("resolves filling steps, direct and via a standalone plan filling", () => {
    expect(parseStepKey("filling-fill-x", pbIds, planFillings)).toEqual({ phase: "filling", fillingId: "fill-x" });
    expect(parseStepKey("planfilling-pf-1", pbIds, planFillings)).toEqual({ phase: "filling", fillingId: "fill-x" });
    expect(parseStepKey("planfilling-unknown", pbIds, planFillings)).toBeNull();
  });
  it("ignores decoration and unknown steps", () => {
    expect(parseStepKey("shell-after-aaaa-1111-0", pbIds, planFillings)).toBeNull();
    expect(parseStepKey("cap-cccc-3333", pbIds, planFillings)).toBeNull();
    expect(parseStepKey("nonsense", pbIds, planFillings)).toBeNull();
    expect(parseStepKey("filling-", pbIds, planFillings)).toBeNull();
  });
});

// ─── Digest ──────────────────────────────────────────────────────────────────

function workshopFixture(): LogSources {
  const mould = { id: "m1", name: "Rect 21", numberOfCavities: 21, cavityWeightG: 12 } as Mould;
  const plan: ProductionPlan = {
    id: "plan1", name: "Autumn batch", batchNumber: "20260909-001", status: "done",
    createdAt: at(DAY, 8), updatedAt: at("2026-09-10"), completedAt: at("2026-09-10", 17),
  };
  const pb1 = { id: "pb1", planId: "plan1", productId: "prod1", mouldId: "m1", quantity: 4, sortOrder: 0 } as PlanProduct;
  const pb2 = { id: "pb2", planId: "plan1", productId: "prod2", mouldId: "m1", quantity: 2, sortOrder: 1, actualYield: 40 } as PlanProduct;
  const steps: PlanStepStatus[] = [
    // Two colour steps for the same plan product on the same day count once.
    { id: "s1", planId: "plan1", stepKey: "color-pb1-0", done: true, doneAt: at(DAY, 9) },
    { id: "s2", planId: "plan1", stepKey: "color-pb1-1", done: true, doneAt: at(DAY, 9) },
    { id: "s3", planId: "plan1", stepKey: "color-pb2", done: true, doneAt: at(DAY, 9) },
    { id: "s4", planId: "plan1", stepKey: "shell-pb1", done: true, doneAt: at(DAY, 11) },
    { id: "s5", planId: "plan1", stepKey: "filling-fillA", done: true, doneAt: at(DAY, 12) },
    { id: "s6", planId: "plan1", stepKey: "planfilling-pf1", done: true, doneAt: at(DAY, 12) },
    // Next day: fill, cap, unmould.
    { id: "s7", planId: "plan1", stepKey: "fill-pb1", done: true, doneAt: at("2026-09-10", 9) },
    { id: "s8", planId: "plan1", stepKey: "cap-pb1", done: true, doneAt: at("2026-09-10", 10) },
    { id: "s9", planId: "plan1", stepKey: "unmould-pb1", done: true, doneAt: at("2026-09-10", 15) },
    { id: "s10", planId: "plan1", stepKey: "unmould-pb2", done: true, doneAt: at("2026-09-10", 15) },
    // Not done, or decoration → ignored.
    { id: "s11", planId: "plan1", stepKey: "cap-pb2", done: false },
    { id: "s12", planId: "plan1", stepKey: "shell-after-pb1-0", done: true, doneAt: at(DAY, 11) },
  ];
  return {
    plans: [plan],
    planProducts: [pb1, pb2],
    planFillings: [{ id: "pf1", planId: "plan1", fillingId: "fillB", multiplier: 1, targetGrams: 300, sortOrder: 0 } as PlanFilling],
    stepStatuses: steps,
    moulds: [mould],
    products: [
      { id: "prod1", name: "Salted caramel", createdAt: at("2026-08-01"), updatedAt: at("2026-08-01") } as Product,
      { id: "prod2", name: "Praline", createdAt: at("2026-08-01"), updatedAt: at("2026-08-01") } as Product,
    ],
    fillings: [
      { id: "fillA", name: "Caramel", category: "Caramels", createdAt: at("2026-08-01") } as Filling,
      { id: "fillB", name: "Gianduja", category: "Pralines", createdAt: at("2026-08-02"), version: 2 } as Filling,
    ],
  };
}

describe("computeDigestIndex — workshop", () => {
  it("aggregates completed steps per day and plan, counting each plan product once per phase", () => {
    const index = computeDigestIndex(workshopFixture());
    const day = index.get(DAY)!;
    const texts = day.lines.filter((l) => l.area === "workshop").map((l) => l.text);
    expect(texts).toEqual([
      "Started batch Autumn batch",
      "Made 2 fillings",
      "Coloured 6 moulds",       // pb1 (4) + pb2 (2), colour steps deduped per product
      "Cast shells in 4 moulds", // pb1 only
    ]);
    const colour = day.lines.find((l) => l.text === "Coloured 6 moulds")!;
    expect(colour.detail).toBe("Salted caramel, Praline · Autumn batch · 20260909-001");
    expect(colour.href).toBe("/production/plan1");
    const fillings = day.lines.find((l) => l.text === "Made 2 fillings")!;
    expect(fillings.detail).toContain("Caramel");
    expect(fillings.detail).toContain("Gianduja");
  });

  it("reports pieces for unmould using actualYield when set, else mould cavities, and the finished batch", () => {
    const index = computeDigestIndex(workshopFixture());
    const next = index.get("2026-09-10")!;
    const texts = next.lines.map((l) => l.text);
    expect(texts).toContain("Filled 4 moulds");
    expect(texts).toContain("Capped 4 moulds");
    // pb1: 4 × 21 = 84 cavities; pb2: actualYield 40 → 124
    expect(texts).toContain("Unmoulded 124 pieces");
    const done = next.lines.find((l) => l.text === "Finished batch Autumn batch")!;
    expect(done.detail).toBe("124 pieces into stock · 20260909-001");
    // Finished comes after the step lines.
    expect(texts.indexOf("Finished batch Autumn batch")).toBeGreaterThan(texts.indexOf("Unmoulded 124 pieces"));
  });

  it("skips steps whose plan is missing, and counts per area", () => {
    const src = workshopFixture();
    src.stepStatuses = [...(src.stepStatuses ?? []), { id: "x", planId: "ghost", stepKey: "shell-pb1", done: true, doneAt: at(DAY) }];
    const day = computeDigestIndex(src).get(DAY)!;
    expect(day.counts.workshop).toBe(4);
    expect(day.counts.shop).toBe(0);
    expect(day.lines.every((l) => l.area === "workshop")).toBe(true);
  });

  it("records freezer moves on product batches and filling stock, and hand-recorded filling stock", () => {
    const src = workshopFixture();
    src.planProducts = [
      { ...src.planProducts![0], frozenQty: 30, frozenAt: at("2026-09-11").getTime(), defrostedAt: at("2026-09-12").getTime() },
    ];
    src.fillingStock = [
      { id: "fs1", fillingId: "fillA", remainingG: 250.4, madeAt: "2026-09-11", createdAt: 0 } as FillingStock,        // manual
      { id: "fs2", fillingId: "fillB", remainingG: 100, madeAt: "2026-09-11", planId: "plan1", createdAt: 0, frozenAt: at("2026-09-12").getTime() } as FillingStock, // from plan
    ];
    const index = computeDigestIndex(src);
    const d11 = index.get("2026-09-11")!.lines.map((l) => l.text);
    expect(d11).toContain("Froze Salted caramel");
    expect(index.get("2026-09-11")!.lines.find((l) => l.text === "Froze Salted caramel")!.detail).toBe("30 pieces");
    expect(d11).toContain("Recorded Caramel stock");
    expect(d11).not.toContain("Recorded Gianduja stock"); // plan-made stock is covered by the step line
    const d12 = index.get("2026-09-12")!.lines.map((l) => l.text);
    expect(d12).toContain("Defrosted Salted caramel");
    expect(d12).toContain("Froze Gianduja");
  });
});

describe("computeDigestIndex — shop", () => {
  const sales: Sale[] = [
    { id: "s1", collectionId: "c", packagingId: "p", cells: ["a", "b", null], price: 12.5, status: "sold", preparedAt: at(DAY, 9), soldAt: at(DAY, 14) },
    { id: "s2", collectionId: "c", packagingId: "p", cells: ["a", "b", "c"], price: 15, status: "sold", preparedAt: at("2026-09-08"), soldAt: at(DAY, 16) },
    { id: "s3", collectionId: "c", packagingId: "p", cells: ["a"], price: 5, status: "prepared", preparedAt: at(DAY, 9) },
  ];
  const giveaways: GiveAwayRecord[] = [
    { id: "g1", at: at(DAY), reason: "sample", fromStock: true, shape: { kind: "loose", items: [] } as unknown as GiveAwayRecord["shape"], pieceCount: 3, ingredientCost: 1 },
    { id: "g2", at: at(DAY), reason: "marketing", fromStock: true, shape: { kind: "loose", items: [] } as unknown as GiveAwayRecord["shape"], pieceCount: 2, ingredientCost: 1 },
  ];

  it("counts boxes prepared and sold with pieces and revenue, and give-aways by reason", () => {
    const day = computeDigestIndex({ sales, giveaways, currencySymbol: "€" }).get(DAY)!;
    const prepared = day.lines.find((l) => l.key === "sales-prepared")!;
    expect(prepared.text).toBe("Prepared 2 boxes");
    expect(prepared.detail).toBe("3 pieces");
    const sold = day.lines.find((l) => l.key === "sales-sold")!;
    expect(sold.text).toBe("Sold 2 boxes");
    expect(sold.detail).toBe("5 pieces · €27.50");
    const gave = day.lines.find((l) => l.key === "giveaways")!;
    expect(gave.text).toBe("Gave away 5 pieces");
    expect(gave.detail).toContain("Sample");
    expect(gave.href).toBe("/shop/giveaways");
    expect(day.counts.shop).toBe(3);
    // The earlier prepared-only day has just the prepared line.
    expect(computeDigestIndex({ sales }).get("2026-09-08")!.lines.map((l) => l.text)).toEqual(["Prepared 1 box"]);
  });

  it("singularises", () => {
    const day = computeDigestIndex({ sales: [sales[2]] }).get(DAY)!;
    expect(day.lines[0].text).toBe("Prepared 1 box");
    expect(day.lines[0].detail).toBe("1 piece");
  });
});

describe("computeDigestIndex — orders, lab, pantry", () => {
  it("logs new orders on creation day and events on every day they occupy, skipping cancelled events", () => {
    const orders: Order[] = [
      { id: "o1", title: "Market", eventDate: "2026-09-19", endDate: "2026-09-20", status: "confirmed", createdAt: at(DAY), updatedAt: at(DAY) },
      { id: "o2", title: "Cancelled fair", eventDate: "2026-09-19", status: "cancelled", createdAt: at(DAY), updatedAt: at(DAY) },
    ];
    const index = computeDigestIndex({ orders });
    const created = index.get(DAY)!.lines;
    expect(created.map((l) => l.text)).toEqual(["New order: Market", "New order: Cancelled fair"]);
    expect(created[0].detail).toBe("Confirmed");
    expect(created[0].href).toBe("/orders/o1");
    const d1 = index.get("2026-09-19")!.lines;
    expect(d1.map((l) => l.text)).toEqual(["Event: Market"]);
    expect(d1[0].detail).toBe("Day 1 of 2 · Confirmed");
    expect(index.get("2026-09-20")!.lines[0].detail).toBe("Day 2 of 2 · Confirmed");
    expect(index.get("2026-09-21")).toBeUndefined();
  });

  it("logs new customers and experiments (forks named as such)", () => {
    const customers: Customer[] = [{ id: "c1", name: "Grand Café", createdAt: at(DAY), updatedAt: at(DAY) }];
    const experiments: Experiment[] = [
      { id: "e1", name: "Yuzu ganache", createdAt: at(DAY), updatedAt: at(DAY) },
      { id: "e2", name: "Yuzu ganache", version: 2, rootId: "e1", createdAt: at(DAY), updatedAt: at(DAY) },
    ];
    const day = computeDigestIndex({ customers, experiments }).get(DAY)!;
    expect(day.lines.map((l) => l.text)).toEqual([
      "New customer: Grand Café",
      "New experiment: Yuzu ganache",
      "Forked experiment: Yuzu ganache",
    ]);
    expect(day.lines[2].detail).toBe("Version 2");
    expect(day.lines[1].href).toBe("/calculator/e1");
    expect(day.counts.orders).toBe(1);
    expect(day.counts.lab).toBe(2);
  });

  it("logs pantry activity: recipes, products, stock counts, moulds, purchases, prices, packaging, shopping", () => {
    const fillings = [
      { id: "f1", name: "Caramel", category: "Caramels", createdAt: at(DAY) } as Filling,
      { id: "f2", name: "Caramel", category: "Caramels", version: 3, createdAt: at(DAY) } as Filling,
      { id: "f3", name: "Legacy", category: "x" } as Filling, // no createdAt → not attributable
    ];
    const products = [
      { id: "p1", name: "Dark bar", createdAt: at(DAY), updatedAt: at(DAY), stockCountedAt: at(DAY, 18).getTime() } as Product,
      { id: "p2", name: "Milk bar", createdAt: at("2026-01-01"), updatedAt: at(DAY), stockCountedAt: at(DAY, 18).getTime() } as Product,
    ];
    const moulds = [{ id: "m1", name: "Heart 24", createdAt: at(DAY) } as Mould];
    const ingredients = [
      { id: "i1", name: "Cream 35%", purchaseDate: DAY } as Ingredient,
      { id: "i2", name: "Glucose" } as Ingredient,
    ];
    const priceHistory: IngredientPriceHistory[] = [
      { id: "h1", ingredientId: "i1", costPerGram: 0.003, recordedAt: at(DAY) },
      { id: "h2", ingredientId: "i1", costPerGram: 0.0031, recordedAt: at(DAY, 12) },
      { id: "h3", ingredientId: "i2", costPerGram: 0.002, recordedAt: at(DAY) },
    ];
    const packaging = [{ id: "pk1", name: "Box of 9", capacity: 9 } as Packaging];
    const packagingOrders: PackagingOrder[] = [{ id: "po1", packagingId: "pk1", quantity: 250, pricePerUnit: 1.2, supplier: "Keylink", orderedAt: at(DAY) }];
    const shoppingItems: ShoppingItem[] = [
      { id: "sh1", name: "Cocoa butter", addedAt: at(DAY).getTime(), orderedAt: at("2026-09-10").getTime() },
      { id: "sh2", name: "Gold dust", addedAt: at(DAY).getTime() },
    ];
    const index = computeDigestIndex({ fillings, products, moulds, ingredients, priceHistory, packaging, packagingOrders, shoppingItems });
    const day = index.get(DAY)!;
    expect(day.lines.map((l) => l.text)).toEqual([
      "New filling recipe: Caramel",
      "New version of Caramel",
      "New product: Dark bar",
      "Counted stock of 2 products",
      "New mould: Heart 24",
      "Bought 1 ingredient",
      "Updated 2 ingredient prices",
      "Ordered 250 × Box of 9",
      "Added 2 items to the shopping list",
    ]);
    expect(day.lines.find((l) => l.key === "prices")!.detail).toBe("Cream 35%, Glucose");
    expect(day.lines.find((l) => l.key === "packaging-order-po1")!.detail).toBe("Keylink");
    expect(day.lines.find((l) => l.key === "packaging-order-po1")!.href).toBe("/packaging/pk1");
    expect(day.counts.pantry).toBe(9);
    expect(index.get("2026-09-10")!.lines.map((l) => l.text)).toEqual(["Ordered 1 shopping item"]);
  });

  it("orders lines by area, then rank", () => {
    const src: LogSources = {
      ...workshopFixture(),
      orders: [{ id: "o1", title: "Popup", eventDate: "2026-12-01", status: "lead", createdAt: at(DAY), updatedAt: at(DAY) }],
      sales: [{ id: "s1", collectionId: "c", packagingId: "p", cells: ["a"], price: 5, status: "prepared", preparedAt: at(DAY) }],
    };
    const areas = computeDigestIndex(src).get(DAY)!.lines.map((l) => l.area);
    const firstIdx = (a: string) => areas.indexOf(a as never);
    expect(firstIdx("workshop")).toBeLessThan(firstIdx("shop"));
    expect(firstIdx("shop")).toBeLessThan(firstIdx("orders"));
    expect(LOG_AREAS.map((a) => LOG_AREA_LABEL[a])).toEqual(["Workshop", "Shop", "Orders", "Lab", "Pantry"]);
  });

  it("truncates long name lists", () => {
    const products = ["A", "B", "C", "D", "E"].map((n, i) => ({ id: `p${i}`, name: n, createdAt: at("2026-01-01"), updatedAt: at(DAY), stockCountedAt: at(DAY).getTime() } as Product));
    const line = computeDigestIndex({ products }).get(DAY)!.lines.find((l) => l.key === "stock-count")!;
    expect(line.detail).toBe("A, B, C +2 more");
  });
});

describe("computeDayDigest / digestHeadline / emptyDigest", () => {
  it("returns an empty digest for a quiet day", () => {
    const d = computeDayDigest("2020-01-01", workshopFixture());
    expect(d).toEqual(emptyDigest("2020-01-01"));
    expect(digestHeadline(d)).toBe("");
  });
  it("joins the first lines and counts the rest", () => {
    const d = computeDayDigest(DAY, workshopFixture());
    expect(digestHeadline(d, 2)).toBe("Started batch Autumn batch · Made 2 fillings · +2 more");
    expect(digestHeadline(d, 10)).toBe("Started batch Autumn batch · Made 2 fillings · Coloured 6 moulds · Cast shells in 4 moulds");
  });
});

// ─── Entries & days ──────────────────────────────────────────────────────────

const entry = (id: string, date: string, body: string, h = 10): LogEntry => ({
  id, date, body, createdAt: at(date, h), updatedAt: at(date, h),
});

describe("entriesByDate / logDayByDate / formatConditions", () => {
  it("groups entries by day, oldest first within a day", () => {
    const map = entriesByDate([entry("b", DAY, "evening", 18), entry("a", DAY, "morning", 8), entry("c", "2026-09-08", "x")]);
    expect(map.get(DAY)!.map((e) => e.id)).toEqual(["a", "b"]);
    expect(map.get("2026-09-08")!.length).toBe(1);
  });
  it("keeps the most recently updated LogDay when a date is duplicated", () => {
    const days: LogDay[] = [
      { id: "1", date: DAY, ambientTempC: 20, updatedAt: at(DAY, 9) },
      { id: "2", date: DAY, ambientTempC: 22, updatedAt: at(DAY, 12) },
    ];
    expect(logDayByDate(days).get(DAY)!.ambientTempC).toBe(22);
  });
  it("formats conditions, tolerating partial data", () => {
    expect(formatConditions({ ambientTempC: 21, humidityPct: 55 })).toBe("21°C · 55% RH");
    expect(formatConditions({ ambientTempC: 21 })).toBe("21°C");
    expect(formatConditions({ humidityPct: 0 })).toBe("0% RH");
    expect(formatConditions({})).toBeNull();
    expect(formatConditions(undefined)).toBeNull();
  });
});

describe("logDaysForList", () => {
  const digests = computeDigestIndex({
    ...workshopFixture(),
    orders: [{ id: "o1", title: "Xmas market", eventDate: "2026-12-20", status: "lead", createdAt: at("2026-06-01"), updatedAt: at("2026-06-01") }],
  });
  const entries = [entry("e1", "2026-09-10", "Tempering went better at 31.5°C"), entry("e2", "2026-05-01", "Old note")];
  const days: LogDay[] = [{ id: "d1", date: "2026-09-12", humidityPct: 60, updatedAt: at("2026-09-12") }];

  it("unions activity days, note days and condition days, newest first — never future days", () => {
    const list = logDaysForList(digests, entries, days, { todayISO: "2026-09-15" });
    // 2026-08-01/02 come from the fixture's product + filling creation dates.
    // The order's event day (2026-12-20) is in the future and stays out.
    expect(list.map((d) => d.date)).toEqual(["2026-09-12", "2026-09-10", DAY, "2026-08-02", "2026-08-01", "2026-06-01", "2026-05-01"]);
    // …until it arrives.
    expect(logDaysForList(digests, entries, days, { todayISO: "2026-12-20", period: "30d" }).map((d) => d.date)).toEqual(["2026-12-20"]);
    expect(list.find((d) => d.date === "2026-09-10")!.entries.length).toBe(1);
    expect(list.find((d) => d.date === "2026-09-12")!.day?.humidityPct).toBe(60);
  });
  it("applies the period window", () => {
    const list = logDaysForList(digests, entries, days, { todayISO: "2026-09-15", period: "30d" });
    expect(list.map((d) => d.date)).toEqual(["2026-09-12", "2026-09-10", DAY]);
  });
  it("filters to days with notes, and searches note bodies and digest text", () => {
    expect(logDaysForList(digests, entries, days, { todayISO: "2026-09-15", notesOnly: true }).map((d) => d.date)).toEqual(["2026-09-10", "2026-05-01"]);
    expect(logDaysForList(digests, entries, days, { todayISO: "2026-09-15", search: "tempering" }).map((d) => d.date)).toEqual(["2026-09-10"]);
    expect(logDaysForList(digests, entries, days, { todayISO: "2026-09-15", search: "coloured" }).map((d) => d.date)).toEqual([DAY]);
    expect(logDaysForList(digests, entries, days, { todayISO: "2026-09-15", search: "20260909-001" }).map((d) => d.date)).toEqual(["2026-09-10", DAY]);
    expect(logDaysForList(digests, entries, days, { todayISO: "2026-09-15", search: "zzz" })).toEqual([]);
  });
  it("drops a LogDay row that carries no conditions", () => {
    const list = logDaysForList(new Map(), [], [{ id: "x", date: "2026-09-01", updatedAt: at("2026-09-01") }], { todayISO: "2026-09-15" });
    expect(list).toEqual([]);
  });
});

describe("groupLogDaysByMonth", () => {
  it("sections consecutive days by month with a label", () => {
    const list = logDaysForList(computeDigestIndex(workshopFixture()), [entry("e", "2026-08-30", "x")], [], { todayISO: "2026-09-15" });
    const groups = groupLogDaysByMonth(list);
    expect(groups.map((g) => [g.key, g.label, g.days.length])).toEqual([
      ["2026-09", "September 2026", 2],
      ["2026-08", "August 2026", 3], // the note + the fixture's product/filling creation days
    ]);
  });
});

describe("parseConditionValue", () => {
  it("accepts decimals with comma or dot and rejects blanks and garbage", () => {
    expect(parseConditionValue("21")).toBe(21);
    expect(parseConditionValue(" 21,5 ")).toBe(21.5);
    expect(parseConditionValue("21.5")).toBe(21.5);
    expect(parseConditionValue("")).toBeUndefined();
    expect(parseConditionValue("warm")).toBeUndefined();
  });
});
