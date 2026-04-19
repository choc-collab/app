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
  skipped: number;
  duplicates: number;
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
  /** Commit a batch of valid entities to the database. Returns count imported. */
  commitBatch: (items: T[]) => Promise<number>;
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
 * Commit parsed rows, skipping those with errors and deduplicating by name.
 * `existingKeys` is the set of dedup keys already in the DB.
 */
export async function commitCSVImport<T>(
  parsed: CSVParseResult<T>,
  config: CSVImportConfig<T>,
  existingKeys: Set<string>,
): Promise<CSVImportResult> {
  let duplicates = 0;
  let skipped = 0;

  const toImport: T[] = [];

  // Track keys we've already seen in this batch to avoid intra-file duplicates
  const seenKeys = new Set<string>();

  for (const row of parsed.rows) {
    const hasError = row.issues.some((i) => i.severity === "error");
    if (hasError) {
      skipped++;
      continue;
    }

    const key = config.dedupKey(row.data);
    if (existingKeys.has(key) || seenKeys.has(key)) {
      duplicates++;
      continue;
    }

    seenKeys.add(key);
    toImport.push(row.data);
  }

  const imported = toImport.length > 0 ? await config.commitBatch(toImport) : 0;

  return { imported, skipped, duplicates };
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
