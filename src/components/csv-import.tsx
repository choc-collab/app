"use client";

/**
 * Reusable CSV Import component.
 *
 * Renders a self-contained flow:
 *   1. Download template + choose file
 *   2. Preview parsed rows with per-row validation
 *   3. Confirm and commit
 *
 * Parameterised by a CSVImportConfig<T> — one component, many entity types.
 */

import { useRef, useState, useCallback, useMemo } from "react";
import { Download, Upload, AlertTriangle, CheckCircle, X, FileSpreadsheet } from "lucide-react";
import { parseCSV } from "@/lib/csv";
import type { CSVImportConfig, CSVParseResult, CSVImportResult, ParsedRow, CSVImportOptions } from "@/lib/csv-import";
import { parseCSVImport, commitCSVImport, downloadTemplate } from "@/lib/csv-import";
import { writeSafetySnapshot } from "@/lib/backup";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImportPhase = "idle" | "preview" | "confirmDelete" | "importing" | "done" | "error";

interface CSVImportProps<T> {
  config: CSVImportConfig<T>;
  /** Load existing records as a key → id map. Called when a file is parsed and again on commit. */
  getExistingIndex: () => Promise<Map<string, string>>;
  /** Preview columns to show in the table (subset of templateColumns). */
  previewColumns: { key: string; label: string; accessor: (data: T) => string }[];
  /** Optional description shown above the upload area. */
  description?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CSVImport<T>({ config, getExistingIndex, previewColumns, description }: CSVImportProps<T>) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [parseResult, setParseResult] = useState<CSVParseResult<T> | null>(null);
  const [existingIndex, setExistingIndex] = useState<Map<string, string> | null>(null);
  const [importResult, setImportResult] = useState<CSVImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [fileName, setFileName] = useState("");
  const [updateExisting, setUpdateExisting] = useState(false);
  const [removeUnreferencedMissing, setRemoveUnreferencedMissing] = useState(false);

  const canUpsert = Boolean(config.updateOne);
  const canRemove = Boolean(config.removeUnreferenced);

  const handleFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setFileName(file.name);
      e.target.value = "";

      const reader = new FileReader();
      reader.onload = async () => {
        try {
          const text = reader.result as string;

          // Quick sanity: does the file parse at all?
          const rawRows = parseCSV(text);
          if (rawRows.length === 0) {
            setErrorMessage("The file is empty or contains only headers.");
            setPhase("error");
            return;
          }

          const result = parseCSVImport(text, config);
          // Load existing index up-front so the preview can show accurate update/remove counts.
          const index = await getExistingIndex();
          setParseResult(result);
          setExistingIndex(index);
          setPhase("preview");
          setErrorMessage("");
        } catch (err) {
          setErrorMessage(err instanceof Error ? err.message : "Failed to parse CSV.");
          setPhase("error");
        }
      };
      reader.onerror = () => {
        setErrorMessage("Failed to read file.");
        setPhase("error");
      };
      reader.readAsText(file);
    },
    [config, getExistingIndex],
  );

  // Pre-commit analysis — derived from existingIndex + parsed CSV keys
  const analysis = useMemo(() => {
    if (!parseResult || !existingIndex) return null;
    const csvKeys = new Set<string>();
    let willInsert = 0;
    let willUpdateOrDup = 0;
    for (const row of parseResult.rows) {
      const hasError = row.issues.some((i) => i.severity === "error");
      if (hasError) continue;
      const key = config.dedupKey(row.data);
      if (csvKeys.has(key)) continue; // intra-file dup
      csvKeys.add(key);
      if (existingIndex.has(key)) willUpdateOrDup++;
      else willInsert++;
    }
    let missingCount = 0;
    for (const key of existingIndex.keys()) {
      if (!csvKeys.has(key)) missingCount++;
    }
    return { willInsert, willUpdateOrDup, missingCount };
  }, [parseResult, existingIndex, config]);

  const runCommit = useCallback(async () => {
    if (!parseResult || !existingIndex) return;
    setPhase("importing");
    try {
      // Safety snapshot before any destructive operation (removal flow only).
      if (updateExisting && removeUnreferencedMissing && canRemove && (analysis?.missingCount ?? 0) > 0) {
        await writeSafetySnapshot("choc-collab-snapshot-before-csv-import");
      }
      const options: CSVImportOptions = {
        updateExisting: updateExisting && canUpsert,
        removeUnreferencedMissing: updateExisting && removeUnreferencedMissing && canRemove,
      };
      const result = await commitCSVImport(parseResult, config, existingIndex, options);
      setImportResult(result);
      setPhase("done");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Import failed.");
      setPhase("error");
    }
  }, [parseResult, existingIndex, config, updateExisting, removeUnreferencedMissing, canUpsert, canRemove, analysis]);

  const handleImportClick = useCallback(() => {
    // Two-step confirmation required when the import will (potentially) delete records.
    const willDelete =
      updateExisting && removeUnreferencedMissing && canRemove && (analysis?.missingCount ?? 0) > 0;
    if (willDelete) {
      setPhase("confirmDelete");
      return;
    }
    void runCommit();
  }, [updateExisting, removeUnreferencedMissing, canRemove, analysis, runCommit]);

  const handleReset = useCallback(() => {
    setPhase("idle");
    setParseResult(null);
    setExistingIndex(null);
    setImportResult(null);
    setErrorMessage("");
    setFileName("");
    setUpdateExisting(false);
    setRemoveUnreferencedMissing(false);
  }, []);

  // Counts for the preview summary
  const errorCount = parseResult?.rows.filter((r) => r.issues.some((i) => i.severity === "error")).length ?? 0;
  const warningCount = parseResult?.rows.filter((r) => r.issues.length > 0 && !r.issues.some((i) => i.severity === "error")).length ?? 0;
  const validCount = (parseResult?.rows.length ?? 0) - errorCount;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <FileSpreadsheet className="w-5 h-5 text-primary shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            Import {config.entityName}s from CSV
          </p>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
          )}
        </div>
      </div>

      {/* Phase: idle — template download + file picker */}
      {(phase === "idle" || phase === "error") && (
        <div className="space-y-3">
          {/* Template download */}
          <button
            onClick={() => downloadTemplate(config as CSVImportConfig<unknown>)}
            className="flex items-center gap-2 text-sm text-primary hover:underline"
          >
            <Download className="w-3.5 h-3.5" />
            Download CSV template
          </button>

          {/* File picker */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full rounded-full border border-border py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            <span className="flex items-center justify-center gap-2">
              <Upload className="w-4 h-4" />
              Choose CSV file…
            </span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleFileSelected}
          />

          {phase === "error" && (
            <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
              <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive">{errorMessage}</p>
            </div>
          )}
        </div>
      )}

      {/* Phase: preview — table + confirm */}
      {phase === "preview" && parseResult && (
        <div className="space-y-4">
          {/* File info + column warnings */}
          <div className="rounded-md border border-border bg-card px-3 py-2 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">{fileName}</p>
              <button onClick={handleReset} className="text-muted-foreground hover:text-foreground" title="Cancel">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              <span className="text-muted-foreground">{parseResult.rows.length} rows</span>
              <span className="text-status-ok">{validCount} valid</span>
              {errorCount > 0 && <span className="text-destructive">{errorCount} with errors (will skip)</span>}
              {warningCount > 0 && <span className="text-status-warn">{warningCount} with warnings</span>}
            </div>

            {parseResult.missingColumns.length > 0 && (
              <div className="flex items-start gap-2 rounded-md bg-status-warn-bg border border-status-warn-edge px-2 py-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-status-warn shrink-0 mt-0.5" />
                <p className="text-xs text-status-warn">
                  Missing columns: {parseResult.missingColumns.slice(0, 5).join(", ")}
                  {parseResult.missingColumns.length > 5 && ` and ${parseResult.missingColumns.length - 5} more`}
                </p>
              </div>
            )}

            {parseResult.unknownColumns.length > 0 && (
              <p className="text-xs text-muted-foreground">
                Ignored columns: {parseResult.unknownColumns.slice(0, 5).join(", ")}
                {parseResult.unknownColumns.length > 5 && ` and ${parseResult.unknownColumns.length - 5} more`}
              </p>
            )}
          </div>

          {/* Sync options */}
          {(canUpsert || canRemove) && (
            <div className="rounded-md border border-border bg-card px-3 py-2 space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Sync options</p>
              {canUpsert && (
                <label className="flex items-start gap-2 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updateExisting}
                    onChange={(e) => {
                      setUpdateExisting(e.target.checked);
                      if (!e.target.checked) setRemoveUnreferencedMissing(false);
                    }}
                    className="mt-0.5 accent-[var(--color-primary)]"
                  />
                  <span>
                    <span className="font-medium text-foreground">Update existing {config.entityName}s</span>
                    <span className="text-muted-foreground">
                      {" "}— rows matching an existing record (by name + manufacturer) overwrite that record instead of being skipped.
                    </span>
                  </span>
                </label>
              )}
              {canRemove && (
                <label className={`flex items-start gap-2 text-xs cursor-pointer ${!updateExisting ? "opacity-50" : ""}`}>
                  <input
                    type="checkbox"
                    checked={removeUnreferencedMissing}
                    disabled={!updateExisting}
                    onChange={(e) => setRemoveUnreferencedMissing(e.target.checked)}
                    className="mt-0.5 accent-[var(--color-primary)]"
                  />
                  <span>
                    <span className="font-medium text-foreground">Remove {config.entityName}s not in this file</span>
                    <span className="text-muted-foreground">
                      {" "}— only if they aren&apos;t referenced anywhere (fillings, shells, coating mappings). Referenced ones are kept. A safety snapshot is auto-downloaded first.
                    </span>
                  </span>
                </label>
              )}

              {/* Live sync summary */}
              {analysis && (
                <div className="pt-1 mt-1 border-t border-border flex flex-wrap gap-x-3 gap-y-0.5 text-xs">
                  <span className="text-status-ok">{analysis.willInsert} new</span>
                  {updateExisting ? (
                    <span className="text-primary">{analysis.willUpdateOrDup} will update existing</span>
                  ) : (
                    <span className="text-muted-foreground">{analysis.willUpdateOrDup} already exist (will skip)</span>
                  )}
                  {updateExisting && removeUnreferencedMissing && (
                    <span className="text-destructive">
                      {analysis.missingCount} not in file (removed if unreferenced)
                    </span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Preview table */}
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground w-8">#</th>
                  {previewColumns.map((col) => (
                    <th key={col.key} className="px-2 py-1.5 text-left font-medium text-muted-foreground">
                      {col.label}
                    </th>
                  ))}
                  <th className="px-2 py-1.5 text-left font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {parseResult.rows.map((row) => (
                  <PreviewRow
                    key={row.rowIndex}
                    row={row}
                    previewColumns={previewColumns}
                  />
                ))}
              </tbody>
            </table>
          </div>

          {/* Action bar */}
          <div className="flex gap-2">
            {validCount > 0 ? (
              <button
                onClick={handleImportClick}
                className="flex-1 rounded-full bg-primary text-primary-foreground py-2 text-sm font-medium"
              >
                {buildImportButtonLabel(config.entityName, analysis, updateExisting, removeUnreferencedMissing && canRemove)}
              </button>
            ) : (
              <div className="flex-1 text-sm text-destructive text-center py-2">
                No valid rows to import
              </div>
            )}
            <button
              onClick={handleReset}
              className="rounded-full border border-border px-4 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Phase: confirmDelete — explicit two-step for destructive path */}
      {phase === "confirmDelete" && analysis && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
          <p className="text-sm font-medium text-destructive">Confirm sync with deletion</p>
          <p className="text-xs text-muted-foreground">
            This will import <strong>{analysis.willInsert}</strong> new {config.entityName}
            {analysis.willInsert !== 1 ? "s" : ""}, update <strong>{analysis.willUpdateOrDup}</strong> existing,
            and delete up to <strong>{analysis.missingCount}</strong> {config.entityName}
            {analysis.missingCount !== 1 ? "s" : ""} that aren&apos;t in this file. Referenced records are kept automatically.
          </p>
          <p className="text-xs text-muted-foreground">
            A safety snapshot of your current data will download before anything is changed.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => void runCommit()}
              className="inline-flex items-center justify-center rounded-full bg-destructive text-white px-4 py-2 text-sm font-medium transition-colors hover:bg-destructive/90"
            >
              Yes, sync and delete
            </button>
            <button onClick={() => setPhase("preview")} className="rounded-full border border-border px-4 py-2 text-sm">
              Back
            </button>
          </div>
        </div>
      )}

      {/* Phase: importing */}
      {phase === "importing" && (
        <div className="py-3 text-center text-sm text-muted-foreground">Importing…</div>
      )}

      {/* Phase: done */}
      {phase === "done" && importResult && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-md bg-status-ok-bg border border-status-ok-edge px-3 py-2">
            <CheckCircle className="w-4 h-4 text-status-ok shrink-0 mt-0.5" />
            <div className="text-xs text-status-ok space-y-0.5">
              {importResult.imported > 0 && (
                <p>
                  <strong>{importResult.imported}</strong> {config.entityName}
                  {importResult.imported !== 1 ? "s" : ""} imported.
                </p>
              )}
              {importResult.updated > 0 && (
                <p>
                  <strong>{importResult.updated}</strong> {config.entityName}
                  {importResult.updated !== 1 ? "s" : ""} updated.
                </p>
              )}
              {importResult.removed > 0 && (
                <p>
                  <strong>{importResult.removed}</strong> {config.entityName}
                  {importResult.removed !== 1 ? "s" : ""} removed.
                </p>
              )}
              {importResult.removalsSkipped > 0 && (
                <p>{importResult.removalsSkipped} kept because they&apos;re still referenced.</p>
              )}
              {importResult.skipped > 0 && (
                <p>{importResult.skipped} skipped (validation errors).</p>
              )}
              {importResult.duplicates > 0 && (
                <p>{importResult.duplicates} skipped (already exist).</p>
              )}
              {importResult.imported === 0 &&
                importResult.updated === 0 &&
                importResult.removed === 0 &&
                importResult.skipped === 0 &&
                importResult.duplicates === 0 && <p>No changes.</p>}
            </div>
          </div>
          <button
            onClick={handleReset}
            className="w-full rounded-full border border-border py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Import more
          </button>
        </div>
      )}

      {/* Phase: error (during import) */}
      {phase === "error" && parseResult && (
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-md bg-destructive/10 border border-destructive/20 px-3 py-2">
            <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
            <p className="text-xs text-destructive">{errorMessage}</p>
          </div>
          <button
            onClick={handleReset}
            className="w-full rounded-full border border-border py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

function buildImportButtonLabel(
  entityName: string,
  analysis: { willInsert: number; willUpdateOrDup: number; missingCount: number } | null,
  updateExisting: boolean,
  willRemove: boolean,
): string {
  if (!analysis) return `Import ${entityName}s`;
  const willUpdate = updateExisting && analysis.willUpdateOrDup > 0;
  const willDelete = willRemove && analysis.missingCount > 0;

  // Common case — only inserting new rows, no sync options. Keep the concise
  // "Import N entityName(s)" label; this is what e2e/csv-import.spec.ts asserts.
  if (!willUpdate && !willDelete) {
    const n = analysis.willInsert;
    if (n === 0) return `Import ${entityName}s`;
    return `Import ${n} ${entityName}${n === 1 ? "" : "s"}`;
  }

  // Compound case — multiple actions. Join them into one label.
  const parts: string[] = [];
  if (analysis.willInsert > 0) parts.push(`import ${analysis.willInsert}`);
  if (willUpdate) parts.push(`update ${analysis.willUpdateOrDup}`);
  if (willDelete) parts.push(`review ${analysis.missingCount} for deletion`);
  if (parts.length === 0) return `Import ${entityName}s`;
  const joined = parts.join(", ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

// ---------------------------------------------------------------------------
// Preview row
// ---------------------------------------------------------------------------

function PreviewRow<T>({
  row,
  previewColumns,
}: {
  row: ParsedRow<T>;
  previewColumns: { key: string; label: string; accessor: (data: T) => string }[];
}) {
  const hasError = row.issues.some((i) => i.severity === "error");
  const hasWarning = row.issues.some((i) => i.severity === "warning");
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className={`${hasError ? "bg-destructive/5" : hasWarning ? "bg-status-warn-bg/50" : ""} cursor-pointer hover:bg-muted/30`}
        onClick={() => row.issues.length > 0 && setExpanded(!expanded)}
      >
        <td className="px-2 py-1.5 text-muted-foreground">{row.rowIndex + 1}</td>
        {previewColumns.map((col) => (
          <td key={col.key} className="px-2 py-1.5 max-w-[180px] truncate">
            {col.accessor(row.data)}
          </td>
        ))}
        <td className="px-2 py-1.5">
          {hasError ? (
            <span className="inline-flex items-center gap-1 text-destructive">
              <AlertTriangle className="w-3 h-3" /> Error
            </span>
          ) : hasWarning ? (
            <span className="inline-flex items-center gap-1 text-status-warn">
              <AlertTriangle className="w-3 h-3" /> Warning
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-status-ok">
              <CheckCircle className="w-3 h-3" /> OK
            </span>
          )}
        </td>
      </tr>
      {expanded && row.issues.length > 0 && (
        <tr className={hasError ? "bg-destructive/5" : "bg-status-warn-bg/30"}>
          <td />
          <td colSpan={previewColumns.length + 1} className="px-2 py-1.5">
            <ul className="space-y-0.5">
              {row.issues.map((issue, i) => (
                <li key={i} className={`text-xs ${issue.severity === "error" ? "text-destructive" : "text-status-warn"}`}>
                  <span className="font-medium">{issue.field}:</span> {issue.message}
                </li>
              ))}
            </ul>
          </td>
        </tr>
      )}
    </>
  );
}
