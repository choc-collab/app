import { describe, it, expect } from "vitest";
import { toNum, toNumOpt, toStrOpt, toBoolOpt, parseCSVImport, commitCSVImport } from "./csv-import";
import type { CSVImportConfig, RowIssue } from "./csv-import";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

describe("toNum", () => {
  it("returns 0 for empty/undefined", () => {
    expect(toNum("")).toBe(0);
    expect(toNum(undefined)).toBe(0);
  });
  it("parses valid numbers", () => {
    expect(toNum("42")).toBe(42);
    expect(toNum("3.14")).toBe(3.14);
  });
  it("returns 0 for NaN", () => {
    expect(toNum("abc")).toBe(0);
  });
});

describe("toNumOpt", () => {
  it("returns undefined for empty/undefined", () => {
    expect(toNumOpt("")).toBeUndefined();
    expect(toNumOpt(undefined)).toBeUndefined();
  });
  it("parses valid numbers", () => {
    expect(toNumOpt("42")).toBe(42);
  });
  it("returns undefined for NaN", () => {
    expect(toNumOpt("abc")).toBeUndefined();
  });
});

describe("toStrOpt", () => {
  it("returns undefined for empty/undefined", () => {
    expect(toStrOpt("")).toBeUndefined();
    expect(toStrOpt(undefined)).toBeUndefined();
  });
  it("trims whitespace", () => {
    expect(toStrOpt("  hello  ")).toBe("hello");
  });
});

describe("toBoolOpt", () => {
  it("returns undefined for empty/undefined", () => {
    expect(toBoolOpt("")).toBeUndefined();
    expect(toBoolOpt(undefined)).toBeUndefined();
  });
  it("recognises truthy values", () => {
    expect(toBoolOpt("true")).toBe(true);
    expect(toBoolOpt("TRUE")).toBe(true);
    expect(toBoolOpt("1")).toBe(true);
    expect(toBoolOpt("yes")).toBe(true);
    expect(toBoolOpt("Yes")).toBe(true);
  });
  it("recognises falsy values", () => {
    expect(toBoolOpt("false")).toBe(false);
    expect(toBoolOpt("0")).toBe(false);
    expect(toBoolOpt("no")).toBe(false);
  });
  it("returns undefined for unknown strings", () => {
    expect(toBoolOpt("maybe")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// parseCSVImport
// ---------------------------------------------------------------------------

interface TestEntity {
  name: string;
  value: number;
}

const testConfig: CSVImportConfig<TestEntity> = {
  entityName: "widget",
  templateColumns: ["name", "value"],
  templateUrl: "/test.csv",
  mapRow: (row) => ({
    name: (row.name ?? "").trim(),
    value: toNum(row.value),
  }),
  validateRow: (data) => {
    const issues: RowIssue[] = [];
    if (!data.name) issues.push({ field: "name", message: "Name is required", severity: "error" });
    if (data.value < 0) issues.push({ field: "value", message: "Value must be non-negative", severity: "warning" });
    return issues;
  },
  dedupKey: (data) => data.name.toLowerCase(),
  commitBatch: async (items) => items.length,
};

describe("parseCSVImport", () => {
  it("parses valid rows with no issues", () => {
    const csv = "name,value\nAlpha,10\nBeta,20\n";
    const result = parseCSVImport(csv, testConfig);

    expect(result.rows).toHaveLength(2);
    expect(result.rows[0].data).toEqual({ name: "Alpha", value: 10 });
    expect(result.rows[0].issues).toEqual([]);
    expect(result.rows[1].data).toEqual({ name: "Beta", value: 20 });
    expect(result.headerColumns).toEqual(["name", "value"]);
    expect(result.missingColumns).toEqual([]);
    expect(result.unknownColumns).toEqual([]);
  });

  it("detects missing columns", () => {
    const csv = "name\nAlpha\n";
    const result = parseCSVImport(csv, testConfig);

    expect(result.missingColumns).toEqual(["value"]);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].data.value).toBe(0); // toNum default
  });

  it("detects unknown columns", () => {
    const csv = "name,value,extra\nAlpha,10,foo\n";
    const result = parseCSVImport(csv, testConfig);

    expect(result.unknownColumns).toEqual(["extra"]);
  });

  it("reports validation errors on rows", () => {
    const csv = "name,value\n,10\nBeta,-5\n";
    const result = parseCSVImport(csv, testConfig);

    expect(result.rows[0].issues).toHaveLength(1);
    expect(result.rows[0].issues[0].severity).toBe("error");
    expect(result.rows[0].issues[0].field).toBe("name");

    expect(result.rows[1].issues).toHaveLength(1);
    expect(result.rows[1].issues[0].severity).toBe("warning");
  });

  it("assigns sequential rowIndex starting from 0", () => {
    const csv = "name,value\nA,1\nB,2\nC,3\n";
    const result = parseCSVImport(csv, testConfig);
    expect(result.rows.map((r) => r.rowIndex)).toEqual([0, 1, 2]);
  });
});

// ---------------------------------------------------------------------------
// commitCSVImport — modes: default (skip), updateExisting, removeUnreferencedMissing
// ---------------------------------------------------------------------------

function makeMockStore() {
  // Simulates the DB: key → { id, value }
  const store = new Map<string, { id: string; value: number }>();
  const removedIds: string[] = [];
  const updatedIds: string[] = [];
  const inserted: TestEntity[] = [];

  const index = () => {
    const m = new Map<string, string>();
    for (const [key, v] of store) m.set(key, v.id);
    return m;
  };

  let nextId = 100;
  const config: CSVImportConfig<TestEntity> = {
    ...testConfig,
    commitBatch: async (items) => {
      for (const item of items) {
        const id = String(nextId++);
        store.set(item.name.toLowerCase(), { id, value: item.value });
        inserted.push(item);
      }
      return items.length;
    },
    updateOne: async (id, data) => {
      updatedIds.push(id);
      store.set(data.name.toLowerCase(), { id, value: data.value });
    },
    removeUnreferenced: async (ids) => {
      // Simulate: ids starting with "ref" are referenced elsewhere
      let removed = 0;
      let keptReferenced = 0;
      for (const id of ids) {
        if (id.startsWith("ref")) {
          keptReferenced++;
        } else {
          removedIds.push(id);
          // Remove from store
          for (const [key, v] of store) if (v.id === id) store.delete(key);
          removed++;
        }
      }
      return { removed, keptReferenced };
    },
  };

  return { store, removedIds, updatedIds, inserted, index, config };
}

describe("commitCSVImport — default mode (no options)", () => {
  it("inserts new rows and skips matching existing rows as duplicates", async () => {
    const m = makeMockStore();
    m.store.set("alpha", { id: "1", value: 999 });

    const parsed = parseCSVImport("name,value\nAlpha,10\nBeta,20\n", m.config);
    const result = await commitCSVImport(parsed, m.config, m.index());

    expect(result.imported).toBe(1);
    expect(result.duplicates).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.removed).toBe(0);
    expect(m.updatedIds).toEqual([]);
    // The existing "alpha" value remains untouched
    expect(m.store.get("alpha")!.value).toBe(999);
  });

  it("skips error rows without counting them as duplicates", async () => {
    const m = makeMockStore();
    const parsed = parseCSVImport("name,value\n,10\nBeta,20\n", m.config);
    const result = await commitCSVImport(parsed, m.config, m.index());

    expect(result.imported).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.duplicates).toBe(0);
  });

  it("counts intra-file duplicates regardless of mode", async () => {
    const m = makeMockStore();
    const parsed = parseCSVImport("name,value\nAlpha,10\nalpha,20\n", m.config);
    const result = await commitCSVImport(parsed, m.config, m.index());

    expect(result.imported).toBe(1);
    expect(result.duplicates).toBe(1);
  });
});

describe("commitCSVImport — updateExisting", () => {
  it("updates existing rows instead of skipping them", async () => {
    const m = makeMockStore();
    m.store.set("alpha", { id: "1", value: 999 });

    const parsed = parseCSVImport("name,value\nAlpha,10\nBeta,20\n", m.config);
    const result = await commitCSVImport(parsed, m.config, m.index(), { updateExisting: true });

    expect(result.imported).toBe(1);
    expect(result.updated).toBe(1);
    expect(result.duplicates).toBe(0);
    expect(m.updatedIds).toEqual(["1"]);
    expect(m.store.get("alpha")!.value).toBe(10);
  });

  it("throws when updateOne is not defined on the config", async () => {
    const m = makeMockStore();
    m.store.set("alpha", { id: "1", value: 999 });
    const badConfig: CSVImportConfig<TestEntity> = { ...m.config, updateOne: undefined };

    const parsed = parseCSVImport("name,value\nAlpha,10\n", badConfig);
    await expect(commitCSVImport(parsed, badConfig, m.index(), { updateExisting: true })).rejects.toThrow(
      /updateOne/,
    );
  });
});

describe("commitCSVImport — removeUnreferencedMissing", () => {
  it("removes existing records not present in the CSV, keeping referenced ones", async () => {
    const m = makeMockStore();
    m.store.set("alpha", { id: "1", value: 1 });       // in CSV → updated
    m.store.set("beta", { id: "2", value: 2 });        // missing → deletable
    m.store.set("gamma", { id: "ref-3", value: 3 });   // missing, but referenced → kept
    m.store.set("delta", { id: "4", value: 4 });       // missing → deletable

    const parsed = parseCSVImport("name,value\nAlpha,99\n", m.config);
    const result = await commitCSVImport(parsed, m.config, m.index(), {
      updateExisting: true,
      removeUnreferencedMissing: true,
    });

    expect(result.imported).toBe(0);
    expect(result.updated).toBe(1);
    expect(result.removed).toBe(2);
    expect(result.removalsSkipped).toBe(1);
    expect(m.removedIds.sort()).toEqual(["2", "4"]);
  });

  it("is ignored when updateExisting is false", async () => {
    const m = makeMockStore();
    m.store.set("alpha", { id: "1", value: 1 });
    m.store.set("beta", { id: "2", value: 2 });

    const parsed = parseCSVImport("name,value\nAlpha,10\n", m.config);
    const result = await commitCSVImport(parsed, m.config, m.index(), {
      updateExisting: false,
      removeUnreferencedMissing: true, // should be no-op without updateExisting
    });

    expect(result.removed).toBe(0);
    expect(result.removalsSkipped).toBe(0);
    expect(m.removedIds).toEqual([]);
    // And existing "alpha" is preserved as a duplicate (not updated)
    expect(result.duplicates).toBe(1);
  });

  it("throws when removeUnreferenced is not defined on the config", async () => {
    const m = makeMockStore();
    m.store.set("beta", { id: "2", value: 2 });
    const badConfig: CSVImportConfig<TestEntity> = { ...m.config, removeUnreferenced: undefined };

    const parsed = parseCSVImport("name,value\nAlpha,10\n", badConfig);
    await expect(
      commitCSVImport(parsed, badConfig, m.index(), {
        updateExisting: true,
        removeUnreferencedMissing: true,
      }),
    ).rejects.toThrow(/removeUnreferenced/);
  });
});
