"use client";

import { useEffect, useRef, useState } from "react";
import { Package } from "lucide-react";

export type YieldEntry = {
  planProductId: string;
  productName: string;
  totalProducts: number;
  yield: number;
};

export function YieldModal({ entries, mode = "batch", onConfirm, onCancel, cancelLabel }: {
  entries: YieldEntry[];
  mode?: "single" | "batch";
  onConfirm: (entries: YieldEntry[]) => void;
  onCancel: () => void;
  cancelLabel?: string;
}) {
  const [localEntries, setLocalEntries] = useState<YieldEntry[]>(entries);
  const [inputStrs, setInputStrs] = useState<Record<string, string>>({});
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
    firstInputRef.current?.select();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  function updateYield(planProductId: string, value: number) {
    setLocalEntries((prev) =>
      prev.map((e) => e.planProductId === planProductId ? { ...e, yield: value } : e)
    );
  }

  const totalYield = localEntries.reduce((sum, e) => sum + e.yield, 0);
  const totalMax = localEntries.reduce((sum, e) => sum + e.totalProducts, 0);
  const setAside = totalMax - totalYield;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onCancel} />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
        {/* Header with warm accent */}
        <div className="bg-gradient-to-b from-amber-50 to-card px-5 pt-5 pb-3">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                {mode === "single" ? "Fresh from the mould!" : "Batch complete!"}
              </h3>
              <p className="text-xs text-muted-foreground">
                How many made it to the finish line?
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-3 space-y-3">
          {localEntries.map((entry, idx) => {
            const diff = entry.totalProducts - entry.yield;
            return (
              <div key={entry.planProductId} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium text-foreground">{entry.productName}</label>
                  <span className="text-[10px] text-muted-foreground font-mono">
                    max {entry.totalProducts}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => updateYield(entry.planProductId, Math.max(0, entry.yield - 1))}
                    className="w-8 h-8 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors text-lg font-medium"
                  >
                    &minus;
                  </button>
                  <input
                    ref={idx === 0 ? firstInputRef : undefined}
                    type="number"
                    min={0}
                    max={entry.totalProducts}
                    value={inputStrs[entry.planProductId] ?? entry.yield}
                    onChange={(e) => {
                      setInputStrs((prev) => ({ ...prev, [entry.planProductId]: e.target.value }));
                    }}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value, 10);
                      const clamped = isNaN(val) ? entry.totalProducts : Math.max(0, Math.min(val, entry.totalProducts));
                      updateYield(entry.planProductId, clamped);
                      setInputStrs((prev) => {
                        const next = { ...prev };
                        delete next[entry.planProductId];
                        return next;
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        (e.target as HTMLInputElement).blur();
                        if (localEntries.length === 1) onConfirm(localEntries);
                      }
                    }}
                    className="flex-1 h-8 rounded-lg border border-border bg-card text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <button
                    onClick={() => updateYield(entry.planProductId, Math.min(entry.totalProducts, entry.yield + 1))}
                    className="w-8 h-8 rounded-full border border-border bg-card flex items-center justify-center text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors text-lg font-medium"
                  >
                    +
                  </button>
                </div>
                {diff > 0 && (
                  <p className="text-[11px] text-muted-foreground italic pl-0.5">
                    {diff} set aside — for tasting, photos, or quality check
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Summary line */}
        {localEntries.length > 1 && (
          <div className="px-5 py-2 border-t border-border/50 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">Total to stock</span>
            <span className="text-sm font-semibold tabular-nums">
              {totalYield}
              {setAside > 0 && (
                <span className="text-muted-foreground font-normal ml-1.5">
                  ({setAside} aside)
                </span>
              )}
            </span>
          </div>
        )}

        {/* Actions */}
        <div className="px-5 py-4 border-t border-border flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            {cancelLabel ?? "Cancel"}
          </button>
          <button
            onClick={() => onConfirm(localEntries)}
            className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Add to stock
          </button>
        </div>
      </div>
    </div>
  );
}
