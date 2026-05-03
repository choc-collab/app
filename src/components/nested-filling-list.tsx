"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { deleteFillingComponent } from "@/lib/hooks";
import type { Filling, FillingComponent } from "@/types";

interface NestedFillingListProps {
  components: ReadonlyArray<FillingComponent>;
  /** Lookup of fillingId → Filling for showing the child name. Components
   *  whose child is missing (deleted? not yet loaded?) render with a
   *  greyed-out placeholder so the row count still matches the data. */
  fillingsById: Map<string, Filling>;
  /** When false, renders a plain read-only list — no remove buttons, no
   *  two-step confirm. */
  editable: boolean;
}

/**
 * Read-only / editable list of nested filling components for a host filling.
 * The remove control uses a two-step confirm to mirror the rest of the app's
 * destructive-action UX (see filling category delete, void box, etc.).
 */
export function NestedFillingList({ components, fillingsById, editable }: NestedFillingListProps) {
  if (components.length === 0) return null;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card" data-testid="nested-filling-list">
      {components.map((c) => {
        const child = fillingsById.get(c.childFillingId);
        return (
          <NestedFillingRow
            key={c.id}
            component={c}
            child={child}
            editable={editable}
          />
        );
      })}
    </ul>
  );
}

function NestedFillingRow({
  component,
  child,
  editable,
}: {
  component: FillingComponent;
  child: Filling | undefined;
  editable: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirmDelete() {
    if (!component.id || busy) return;
    setBusy(true);
    setError(null);
    try {
      await deleteFillingComponent(component.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Remove failed");
      setBusy(false);
    }
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2 text-sm" data-testid="nested-filling-row">
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">
          {child?.name ?? <span className="text-muted-foreground italic">Unknown filling</span>}
        </div>
      </div>
      <div className="font-mono text-xs tabular-nums text-muted-foreground shrink-0">
        {component.amount}
        {component.unit}
      </div>
      {editable && (
        <div className="shrink-0">
          {confirming ? (
            <div className="flex items-center gap-2">
              {error && <span className="text-xs text-destructive">{error}</span>}
              <button
                type="button"
                onClick={() => {
                  setConfirming(false);
                  setError(null);
                }}
                disabled={busy}
                className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={busy}
                className="text-xs font-medium text-destructive hover:underline disabled:opacity-50"
                data-testid="nested-filling-confirm-remove"
              >
                {busy ? "Removing…" : "Yes, remove"}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirming(true)}
              className="text-xs text-muted-foreground hover:text-foreground p-1"
              aria-label="Remove nested filling"
              data-testid="nested-filling-remove-btn"
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>
      )}
    </li>
  );
}
