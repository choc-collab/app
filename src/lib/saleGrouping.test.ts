import { describe, it, expect } from "vitest";
import { groupPreparedSales, firstNSaleIds } from "./saleGrouping";
import type { Sale } from "@/types";

function sale(
  id: string,
  overrides: Partial<Sale> = {},
): Sale {
  return {
    id,
    collectionId: "col-1",
    packagingId: "pkg-1",
    cells: ["p1", "p2", "p3", "p4"],
    price: 12,
    status: "prepared",
    preparedAt: new Date(2026, 3, 23, 10, 0, 0),
    ...overrides,
  };
}

describe("groupPreparedSales", () => {
  it("returns one group per unique (collection, packaging, cells, note)", () => {
    const groups = groupPreparedSales([
      sale("a"),
      sale("b"),
      sale("c"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
  });

  it("separates by packaging", () => {
    const groups = groupPreparedSales([
      sale("a", { packagingId: "pkg-1" }),
      sale("b", { packagingId: "pkg-2" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("separates by collection", () => {
    const groups = groupPreparedSales([
      sale("a", { collectionId: "col-1" }),
      sale("b", { collectionId: "col-2" }),
    ]);
    expect(groups).toHaveLength(2);
  });

  it("separates by cells order", () => {
    const groups = groupPreparedSales([
      sale("a", { cells: ["p1", "p2", "p3", "p4"] }),
      sale("b", { cells: ["p2", "p1", "p3", "p4"] }),  // same multiset, different order
    ]);
    expect(groups).toHaveLength(2);
  });

  it("separates by customerNote", () => {
    const groups = groupPreparedSales([
      sale("a", { customerNote: "For Marie" }),
      sale("b", { customerNote: "For Jean" }),
      sale("c"),  // no note
    ]);
    expect(groups).toHaveLength(3);
  });

  it("groups undefined and missing note the same (both = empty-note bucket)", () => {
    const groups = groupPreparedSales([
      sale("a"),
      sale("b", { customerNote: undefined }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(2);
  });

  it("sorts sales within a group oldest first (FIFO)", () => {
    const t1 = new Date(2026, 3, 23, 9, 0, 0);
    const t2 = new Date(2026, 3, 23, 14, 0, 0);
    const t3 = new Date(2026, 3, 23, 11, 0, 0);
    const groups = groupPreparedSales([
      sale("latest", { preparedAt: t2 }),
      sale("oldest", { preparedAt: t1 }),
      sale("middle", { preparedAt: t3 }),
    ]);
    expect(groups[0].sales.map((s) => s.id)).toEqual(["oldest", "middle", "latest"]);
    expect(groups[0].representative.id).toBe("oldest");
    expect(groups[0].earliestPreparedAt).toEqual(t1);
    expect(groups[0].latestPreparedAt).toEqual(t2);
  });

  it("sorts groups by most recent preparedAt, desc", () => {
    const t1 = new Date(2026, 3, 23, 9, 0, 0);
    const t2 = new Date(2026, 3, 23, 14, 0, 0);
    const groups = groupPreparedSales([
      sale("a", { packagingId: "pkg-1", preparedAt: t1 }),
      sale("b", { packagingId: "pkg-2", preparedAt: t2 }),
    ]);
    expect(groups[0].representative.packagingId).toBe("pkg-2");
    expect(groups[1].representative.packagingId).toBe("pkg-1");
  });

  it("accepts ISO-string preparedAt values", () => {
    const groups = groupPreparedSales([
      sale("a", { preparedAt: "2026-04-23T09:00:00.000Z" as unknown as Date }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].earliestPreparedAt.getTime()).toBe(
      new Date("2026-04-23T09:00:00.000Z").getTime(),
    );
  });

  it("returns an empty array for no input", () => {
    expect(groupPreparedSales([])).toEqual([]);
  });
});

describe("firstNSaleIds", () => {
  const g = groupPreparedSales([
    sale("oldest", { preparedAt: new Date(2026, 3, 23, 9, 0, 0) }),
    sale("middle", { preparedAt: new Date(2026, 3, 23, 10, 0, 0) }),
    sale("newest", { preparedAt: new Date(2026, 3, 23, 11, 0, 0) }),
  ])[0];

  it("returns the N oldest ids", () => {
    expect(firstNSaleIds(g, 1)).toEqual(["oldest"]);
    expect(firstNSaleIds(g, 2)).toEqual(["oldest", "middle"]);
    expect(firstNSaleIds(g, 3)).toEqual(["oldest", "middle", "newest"]);
  });

  it("caps at the group size", () => {
    expect(firstNSaleIds(g, 99)).toEqual(["oldest", "middle", "newest"]);
  });

  it("clamps negative / non-integer N to 0 / floor", () => {
    expect(firstNSaleIds(g, -1)).toEqual([]);
    expect(firstNSaleIds(g, 0)).toEqual([]);
    expect(firstNSaleIds(g, 2.9)).toEqual(["oldest", "middle"]);
  });
});
