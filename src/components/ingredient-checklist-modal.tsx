"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { X, ShoppingCart } from "lucide-react";
import { LowStockFlagButton } from "@/components/pantry";
import {
  formatChecklistAmount, groupChecklistByCategory, type ChecklistRow,
} from "@/lib/ingredientChecklist";

/**
 * "Do I have what this batch needs?" — the plan's fillings rolled up to one row
 * per ingredient, ticked off against the pantry.
 *
 * Ticks persist per plan (`planIngredientChecks`), because checking a batch's
 * ingredients means walking back and forth to the shelves; anything unticked
 * can be pushed straight onto the shopping list carrying its amount.
 */
export function IngredientChecklistModal({
  batchName,
  rows,
  checkedIds,
  flaggedIds,
  onToggleCheck,
  onFlag,
  onUnflag,
  onClose,
}: {
  batchName: string;
  rows: ChecklistRow[];
  /** Ingredient ids the chocolatier has confirmed they have. */
  checkedIds: ReadonlySet<string>;
  /** Ingredient ids already on the shopping list. */
  flaggedIds: ReadonlySet<string>;
  onToggleCheck: (ingredientId: string, have: boolean) => void;
  onFlag: (row: ChecklistRow) => Promise<void> | void;
  onUnflag: (row: ChecklistRow) => Promise<void> | void;
  onClose: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const groups = useMemo(() => groupChecklistByCategory(rows), [rows]);
  const checkedCount = useMemo(
    () => rows.filter((r) => checkedIds.has(r.ingredientId)).length,
    [rows, checkedIds],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Ingredient checklist"
        className="relative w-full max-w-lg mx-4 mb-4 sm:mb-0 rounded-2xl border border-border bg-card shadow-xl overflow-hidden flex flex-col max-h-[85vh]"
      >
        <div className="px-4 py-3 border-b border-border flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-base">Ingredient checklist</h2>
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              Everything the fillings in {batchName} need
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-full hover:bg-muted text-muted-foreground shrink-0"
            aria-label="Close checklist"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {rows.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              No filling ingredients in this batch yet.
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Add products or filling batches and their recipes will roll up here.
            </p>
          </div>
        ) : (
          <>
            <div className="px-4 py-2 border-b border-border bg-muted/40">
              <p className="mono-label text-muted-foreground">
                {checkedCount} of {rows.length} checked
              </p>
            </div>

            <div className="overflow-y-auto px-4 py-3 space-y-4">
              {groups.map((group) => (
                <div key={group.category}>
                  {/* A lone heading classifies nothing — only label the groups
                      when there's more than one to tell apart. */}
                  {groups.length > 1 && (
                    <p className="mono-label text-muted-foreground mb-1.5">{group.category}</p>
                  )}
                  <ul className="space-y-1.5">
                    {group.rows.map((row) => {
                      const checked = checkedIds.has(row.ingredientId);
                      return (
                        <li
                          key={`${row.ingredientId}-${row.unit}`}
                          className="flex items-start gap-2.5 rounded-lg border border-border p-2"
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleCheck(row.ingredientId, !checked)}
                            className="mt-1 shrink-0"
                            aria-label={`I have ${row.name}`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-baseline justify-between gap-2">
                              <Link
                                href={`/ingredients/${encodeURIComponent(row.ingredientId)}`}
                                className={`text-sm font-medium hover:underline truncate ${checked ? "text-muted-foreground" : ""}`}
                              >
                                {row.name}
                              </Link>
                              <span
                                className={`text-sm tabular-nums shrink-0 ${checked ? "text-muted-foreground" : "font-semibold"}`}
                              >
                                {formatChecklistAmount(row.amount, row.unit)}
                              </span>
                            </div>
                            {/* The "why" behind the number — without it a total
                                is impossible to sanity-check against a recipe.
                                A single filling accounts for the whole row, so
                                repeating its amount would just restate the
                                total; the breakdown only earns its place once
                                two fillings share the ingredient. */}
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">
                              {row.usedBy.length === 1
                                ? row.usedBy[0].fillingName
                                : row.usedBy
                                    .map((u) => `${u.fillingName} ${formatChecklistAmount(u.amount, row.unit)}`)
                                    .join(" · ")}
                            </p>
                          </div>
                          <div className="shrink-0 pt-0.5">
                            <LowStockFlagButton
                              flagged={flaggedIds.has(row.ingredientId)}
                              itemName={row.name}
                              onFlag={() => onFlag(row)}
                              onUnflag={() => onUnflag(row)}
                              size="sm"
                            />
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>

            <div className="px-4 py-2.5 border-t border-border flex items-center justify-between gap-2">
              <Link
                href="/shopping"
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <ShoppingCart className="w-3.5 h-3.5" /> Shopping list
              </Link>
              <button type="button" onClick={onClose} className="btn-secondary px-4 py-1.5 text-sm">
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
