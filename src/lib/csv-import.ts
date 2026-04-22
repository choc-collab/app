/**
 * CSV Import — pure logic layer.
 *
 * Reusable across entity types. Each entity provides a `CSVImportConfig<T>`
 * that describes how to map CSV columns → entity fields and how to validate.
 */

import { parseCSV } from "@/lib/csv";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** A single validation issue on one row. */
export interface RowIssue {
  field: string;
  message: string;
  severity: "error" | "warning";
}

/** A parsed + validated row, ready for preview. */
export interface ParsedRow<T> {
  /** 0-based index in the CSV (excluding header). */
  rowIndex: number;
  /** The parsed entity object (may be incomplete if errors exist). */
  data: T;
  /** Validation issues — rows with any severity:"error" are skipped on import. */
  issues: RowIssue[];
}

/** Result of parsing an entire CSV file. */
export interface CSVParseResult<T> {
  rows: ParsedRow<T>[];
  /** Column names found in the file header. */
  headerColumns: string[];
  /** Columns from the template that are missing in the file. */
  missingColumns: string[];
  /** Columns in the file that don't match any template column. */
  unknownColumns: string[];
}

/** Import outcome after committing. */
export interface CSVImportResult {
  imported: number;
  /** Existing rows matched by dedupKey and updated in-place (only when options.updateExisting). */
  updated: number;
  skipped: number;
  /** Rows matching existing records that were skipped (only when options.updateExisting is false). */
  duplicates: number;
  /** Existing records removed because they were missing from the CSV (only when options.removeUnreferencedMissing). */
  removed: number;
  /** Existing records kept despite being missing from the CSV because they're referenced elsewhere. */
  removalsSkipped: number;
}

/** Runtime options for commitCSVImport — toggle upsert and delete-missing behaviors. */
export interface CSVImportOptions {
  /** When true, rows matching an existing dedupKey are updated instead of skipped as duplicates. */
  updateExisting?: boolean;
  /**
   * When true, existing records whose dedupKey is NOT present in the CSV are removed —
   * but only if the config's removeUnreferenced hook reports them safe to delete.
   * Ignored unless updateExisting is also true (otherwise "missing from CSV" is meaningless).
   */
  removeUnreferencedMissing?: boolean;
}

/**
 * Configuration for importing a specific entity type from CSV.
 * Implement one of these per entity (ingredients, moulds, etc.)
 */
export interface CSVImportConfig<T> {
  /** Human-readable entity name (e.g. "ingredient"). */
  entityName: string;
  /** Expected column names in order (used for template download + header validation). */
  templateColumns: string[];
  /** URL of the template CSV file. */
  templateUrl: string;
  /** Map a single CSV row (Record<string, string>) to a typed entity object. */
  mapRow: (row: Record<string, string>) => T;
  /** Validate a mapped entity, returning any issues. */
  validateRow: (data: T, rowIndex: number) => RowIssue[];
  /** Extract the dedup key from an entity (typically the name, lowercased). */
  dedupKey: (data: T) => string;
  /** Commit a batch of valid NEW entities to the database. Returns count imported. */
  commitBatch: (items: T[]) => Promise<number>;
  /** Update an existing entity by id. Required when updateExisting is enabled. */
  updateOne?: (id: string, data: T) => Promise<void>;
  /**
   * Delete the given ids, but only those that are unreferenced by other tables.
   * Returns counts of actually-removed vs kept-because-referenced.
   * Required when removeUnreferencedMissing is enabled.
   */
  removeUnreferenced?: (ids: string[]) => Promise<{ removed: number; keptReferenced: number }>;
}

// ---------------------------------------------------------------------------
// Helpers — shared parsing utils (same signatures as seed.ts but exported)
// ---------------------------------------------------------------------------

export function toNum(val: string | undefined): number {
  if (!val || val === "") return 0;
  const n = parseFloat(val);
  return isNaN(n) ? 0 : n;
}

export function toNumOpt(val: string | undefined): number | undefined {
  if (!val || val === "") return undefined;
  const n = parseFloat(val);
  return isNaN(n) ? undefined : n;
}

export function toStrOpt(val: string | undefined): string | undefined {
  if (!val || val === "") return undefined;
  return val.trim();
}

export function toBoolOpt(val: string | undefined): boolean | undefined {
  if (!val || val === "") return undefined;
  const v = val.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return undefined;
}

// ---------------------------------------------------------------------------
// Core parse function
// ---------------------------------------------------------------------------

/**
 * Parse CSV text into validated rows using the given config.
 * Pure function — no side effects, no DB access.
 */
export function parseCSVImport<T>(
  csvText: string,
  config: CSVImportConfig<T>,
): CSVParseResult<T> {
  const rawRows = parseCSV(csvText);

  // Determine header columns from the CSV text (first line)
  const firstLine = csvText.trim().split(/\r?\n/)[0] ?? "";
  const headerColumns = firstLine.split(",").map((h) => h.trim().replace(/^"|"$/g, ""));

  const expectedSet = new Set(config.templateColumns);
  const actualSet = new Set(headerColumns);
  const missingColumns = config.templateColumns.filter((c) => !actualSet.has(c));
  const unknownColumns = headerColumns.filter((c) => c && !expectedSet.has(c));

  const rows: ParsedRow<T>[] = rawRows.map((raw, rowIndex) => {
    const data = config.mapRow(raw);
    const issues = config.validateRow(data, rowIndex);
    return { rowIndex, data, issues };
  });

  return { rows, headerColumns, missingColumns, unknownColumns };
}

// ---------------------------------------------------------------------------
// Commit with dedup
// ---------------------------------------------------------------------------

/**
 * Commit parsed rows. Existing records are identified via `existingIndex` (key → id).
 * Behavior varies by options:
 *   - default: matching keys are skipped as duplicates (preserves existing records)
 *   - updateExisting: matching keys are updated in-place via config.updateOne
 *   - removeUnreferencedMissing (requires updateExisting): existing records whose key is
 *     absent from the CSV are deleted if safe, via config.removeUnreferenced
 */
export async function commitCSVImport<T>(
  parsed: CSVParseResult<T>,
  config: CSVImportConfig<T>,
  existingIndex: Map<string, string>,
  options?: CSVImportOptions,
): Promise<CSVImportResult> {
  const updateExisting = options?.updateExisting === true;
  const removeMissing = updateExisting && options?.removeUnreferencedMissing === true;

  let duplicates = 0;
  let skipped = 0;

  const toInsert: T[] = [];
  const toUpdate: { id: string; data: T }[] = [];

  const seenKeys = new Set<string>();

  for (const row of parsed.rows) {
    const hasError = row.issues.some((i) => i.severity === "error");
    if (hasError) {
      skipped++;
      continue;
    }

    const key = config.dedupKey(row.data);
    if (seenKeys.has(key)) {
      // Intra-file duplicate — always skip, regardless of mode
      duplicates++;
      continue;
    }
    seenKeys.add(key);

    const existingId = existingIndex.get(key);
    if (existingId) {
      if (updateExisting) {
        toUpdate.push({ id: existingId, data: row.data });
      } else {
        duplicates++;
      }
    } else {
      toInsert.push(row.data);
    }
  }

  const imported = toInsert.length > 0 ? await config.commitBatch(toInsert) : 0;

  let updated = 0;
  if (toUpdate.length > 0) {
    if (!config.updateOne) {
      throw new Error("updateExisting requires config.updateOne to be defined");
    }
    for (const { id, data } of toUpdate) {
      await config.updateOne(id, data);
      updated++;
    }
  }

  let removed = 0;
  let removalsSkipped = 0;
  if (removeMissing) {
    if (!config.removeUnreferenced) {
      throw new Error("removeUnreferencedMissing requires config.removeUnreferenced to be defined");
    }
    const missingIds: string[] = [];
    for (const [key, id] of existingIndex) {
      if (!seenKeys.has(key)) missingIds.push(id);
    }
    if (missingIds.length > 0) {
      const res = await config.removeUnreferenced(missingIds);
      removed = res.removed;
      removalsSkipped = res.keptReferenced;
    }
  }

  return { imported, updated, skipped, duplicates, removed, removalsSkipped };
}

// ---------------------------------------------------------------------------
// Template download helper
// ---------------------------------------------------------------------------

/** Trigger a browser download of the template CSV. */
export function downloadTemplate(config: CSVImportConfig<unknown>): void {
  const header = config.templateColumns.join(",") + "\n";
  const blob = new Blob([header], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${config.entityName}-template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
