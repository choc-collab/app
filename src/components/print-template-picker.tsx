"use client";

import { useState } from "react";
import Link from "next/link";
import type { LabelTemplate } from "@/types";

/**
 * Modal that lets the user pick a label template before a print run. Shared
 * across every entry point that triggers labelPrint:
 *   - Production batches (product / filling labels at batch-done time)
 *   - Collection detail page (retail bonbon-box labels)
 *
 * The header copy is driven by `title` so each caller phrases the action in
 * the user's actual context ("Save product labels", "Save box labels", etc.).
 * Pre-selects `defaultId` (from Settings → Printing) when it matches one of
 * the available templates so power users don't have to choose twice.
 */
export function PrintTemplatePicker({
  title,
  description,
  templates,
  defaultId,
  onConfirm,
  onCancel,
}: {
  title: string;
  description?: string;
  templates: LabelTemplate[];
  defaultId: string;
  onConfirm: (template: LabelTemplate) => void;
  onCancel: () => void;
}) {
  const initial = defaultId && templates.some((t) => t.id === defaultId)
    ? defaultId
    : templates[0]?.id ?? "";
  const [selectedId, setSelectedId] = useState(initial);

  function onSave() {
    const t = templates.find((x) => x.id === selectedId);
    if (t) onConfirm(t);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="w-full max-w-sm rounded-lg bg-card border border-border shadow-lg p-4 space-y-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        {templates.length === 0 ? (
          <>
            <p className="text-sm text-muted-foreground">
              No label templates yet. Design one in the editor first.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onCancel}
                className="rounded-md px-3 py-1.5 text-sm hover:bg-muted"
              >
                Close
              </button>
              <Link
                href="/labels"
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90"
              >
                Open editor
              </Link>
            </div>
          </>
        ) : (
          <>
            {description && (
              <p className="text-xs text-muted-foreground">{description}</p>
            )}
            <div className="space-y-1 max-h-64 overflow-y-auto">
              {templates.map((t) => (
                <label
                  key={t.id}
                  className={`flex items-start gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors ${selectedId === t.id ? "border-primary bg-accent" : "border-border hover:bg-muted/40"}`}
                >
                  <input
                    type="radio"
                    name="label-template"
                    value={t.id}
                    checked={selectedId === t.id}
                    onChange={() => setSelectedId(t.id!)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{t.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {t.width}×{t.height}mm · {t.fields.length} field{t.fields.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={onCancel}
                className="rounded-md px-3 py-1.5 text-sm hover:bg-muted"
              >
                Cancel
              </button>
              <button
                onClick={onSave}
                disabled={!selectedId}
                className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                Save labels
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
