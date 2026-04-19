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

import { useRef, useState, useCallback } from "react";
import { Download, Upload, AlertTriangle, CheckCircle, X, FileSpreadsheet } from "lucide-react";
import { parseCSV } from "@/lib/csv";
import type { CSVImportConfig, CSVParseResult, CSVImportResult, ParsedRow } from "@/lib/csv-import";
import { parseCSVImport, commitCSVImport, downloadTemplate } from "@/lib/csv-import";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ImportPhase = "idle" | "preview" | "importing" | "done" | "error";

interface CSVImportProps<T> {
  config: CSVImportConfig<T>;
  /** Load existing dedup keys from the DB. Called once before commit. */
  getExistingKeys: () => Promise<Set<string>>;
  /** Preview columns to show in the table (subset of templateColumns). */
  previewColumns: { key: string; label: string; accessor: (data: T) => string }[];
  /** Optional description shown above the upload area. */
  description?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function CSVImport<T>({ config, getExistingKeys, previewColumns, description }: CSVImportProps<T>) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<ImportPhase>("idle");
  const [parseResult, setParseResult] = useState<CSVParseResult<T> | null>(null);
  const [importResult, setImportResult] = useState<CSVImportResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [fileName, setFileName] = useState("");

  const handleFileSelected = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setFileName(file.name);
      e.target.value = "";

      const reader = new FileReader();
      reader.onload = () => {
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
          setParseResult(result);
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
    [config],
  );

  const handleConfirmImport = useCallback(async () => {
    if (!parseResult) return;
    setPhase("importing");
    try {
      const existingKeys = await getExistingKeys();
      const result = await commitCSVImport(parseResult, config, existingKeys);
      setImportResult(result);
      setPhase("done");
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : "Import failed.");
      setPhase("error");
    }
  }, [parseResult, config, getExistingKeys]);

  const handleReset = useCallback(() => {
    setPhase("idle");
    setParseResult(null);
    setImportResult(null);
    setErrorMessage("");
    setFileName("");
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
                onClick={handleConfirmImport}
                className="flex-1 rounded-full bg-primary text-primary-foreground py-2 text-sm font-medium"
              >
                Import {validCount} {config.entityName}{validCount !== 1 ? "s" : ""}
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
              <p>
                <strong>{importResult.imported}</strong> {config.entityName}{importResult.imported !== 1 ? "s" : ""} imported.
              </p>
              {importResult.skipped > 0 && (
                <p>{importResult.skipped} skipped (validation errors).</p>
              )}
              {importResult.duplicates > 0 && (
                <p>{importResult.duplicates} skipped (already exist).</p>
              )}
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
