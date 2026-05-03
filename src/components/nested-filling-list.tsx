"use client";

import { useState } from "react";
import { Trash2, Layers } from "lucide-react";
import { deleteFillingComponent, saveFillingComponent } from "@/lib/hooks";
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
  /** Total grams of the host filling (own ingredients + nested components),
   *  used to render the per-row percentage. Optional — when missing/zero the
   *  % column is hidden, matching `FillingIngredientRow`. */
  totalGrams?: number;
}

/**
 * Read-only / editable list of nested filling components for a host filling.
 * Layout mirrors `FillingIngredientRow` so a nested filling reads as just
 * another row in the recipe: percentage of the total mass, editable amount
 * in grams, and an editable note. The leading Layers glyph distinguishes
 * components from ingredients without splitting them into a separate column.
 */
export function NestedFillingList({ components, fillingsById, editable, totalGrams }: NestedFillingListProps) {
  if (components.length === 0) return null;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border bg-card px-3" data-testid="nested-filling-list">
      {components.map((c) => {
        const child = fillingsById.get(c.childFillingId);
        const pct = totalGrams != null && totalGrams > 0 ? (c.amount / totalGrams) * 100 : undefined;
        return (
          <NestedFillingRow
            key={c.id}
            component={c}
            child={child}
            editable={editable}
            pct={pct}
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
  pct,
}: {
  component: FillingComponent;
  child: Filling | undefined;
  editable: boolean;
  pct?: number;
}) {
  const [amount, setAmount] = useState(String(component.amount));
  const [note, setNote] = useState(component.note ?? "");
  const [pendingRemove, setPendingRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAmountBlur() {
    const next = parseFloat(amount) || 0;
    if (next === component.amount) return;
    try {
      await saveFillingComponent({ ...component, amount: next });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setAmount(String(component.amount));
    }
  }

  async function handleNoteBlur() {
    const trimmed = note.trim();
    if (trimmed === (component.note ?? "")) return;
    try {
      await saveFillingComponent({ ...component, note: trimmed || undefined });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Save failed");
      setNote(component.note ?? "");
    }
  }

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
    <li className="flex items-center gap-2 py-1 list-none" data-testid="nested-filling-row">
      <Layers aria-hidden="true" className="w-3.5 h-3.5 text-muted-foreground/60 shrink-0" />
      <span className="flex-1 text-sm truncate">
        {child?.name ?? <span className="text-muted-foreground italic">Unknown filling</span>}
      </span>
      {pct != null && (
        <span className="text-xs text-muted-foreground w-10 text-right shrink-0">
          {pct.toFixed(1)}%
        </span>
      )}
      {editable ? (
        <>
          <div className="flex items-center gap-1">
            <input
              type="number"
              step="0.1"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              onBlur={handleAmountBlur}
              aria-label="Amount in grams"
              data-testid="nested-filling-amount"
              className="w-20 rounded-md border border-border bg-card px-2 py-1 text-sm text-right focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="text-sm text-muted-foreground">g</span>
          </div>
          <input
            type="text"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={handleNoteBlur}
            placeholder="note…"
            aria-label="Note"
            data-testid="nested-filling-note"
            className="w-28 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-muted-foreground placeholder:text-muted-foreground/40 hover:border-border focus:border-border focus:outline-none focus:ring-2 focus:ring-primary"
          />
          {pendingRemove ? (
            <span className="flex items-center gap-1.5 text-xs">
              {error && <span className="text-destructive">{error}</span>}
              <span className="text-muted-foreground">Remove?</span>
              <button
                type="button"
                onClick={() => { handleConfirmDelete(); setPendingRemove(false); }}
                disabled={busy}
                className="text-red-600 font-medium hover:underline disabled:opacity-50"
                data-testid="nested-filling-confirm-remove"
              >
                {busy ? "Removing…" : "Yes"}
              </button>
              <button
                type="button"
                onClick={() => { setPendingRemove(false); setError(null); }}
                disabled={busy}
                className="text-muted-foreground hover:underline disabled:opacity-50"
              >
                Cancel
              </button>
            </span>
          ) : (
            <button
              type="button"
              onClick={() => setPendingRemove(true)}
              className="p-1 rounded-full hover:bg-muted transition-colors"
              aria-label="Remove nested filling"
              data-testid="nested-filling-remove-btn"
            >
              <Trash2 className="w-3.5 h-3.5 text-muted-foreground" />
            </button>
          )}
        </>
      ) : (
        <>
          <span className="w-24 text-sm text-right text-muted-foreground">{component.amount}{component.unit}</span>
          <span className="w-28 text-xs text-muted-foreground truncate" title={component.note || undefined}>
            {component.note ?? ""}
          </span>
        </>
      )}
    </li>
  );
}
