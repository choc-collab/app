"use client";

import { useEffect, useRef, useState } from "react";
import { Droplets, Snowflake } from "lucide-react";

export type LeftoverEntry = {
  fillingId: string;
  fillingName: string;
  category?: string;
  /** Pre-computed estimate: amount made minus amount needed */
  estimatedLeftoverG: number;
  /** Total grams actually made in this batch — hard upper bound on leftover entry.
   *  Users can't register more leftover than what was produced. */
  totalMadeG: number;
  /** Shelf life of the filling (weeks). Used as the "days preserved" default when
   *  the user chooses to freeze the leftover (just-made → full shelf life). */
  shelfLifeWeeks?: number;
  /** The plan that created this stock */
  planId?: string;
  /** When the filling was made (ISO date) */
  madeAt: string;
};

export type LeftoverResult = {
  fillingId: string;
  remainingG: number;
  madeAt: string;
  planId?: string;
  frozen?: boolean;
  preservedShelfLifeDays?: number;
};

export function LeftoverModal({ entries, onConfirm, onSkip }: {
  entries: LeftoverEntry[];
  /** Called with final gram values per filling (0 = no leftover to save) */
  onConfirm: (results: LeftoverResult[]) => void;
  /** Skip without registering any leftover */
  onSkip: () => void;
}) {
  const [localValues, setLocalValues] = useState<Record<string, number>>(
    () => Object.fromEntries(entries.map((e) => [e.fillingId, Math.max(0, Math.round(e.estimatedLeftoverG))]))
  );
  const [inputStrs, setInputStrs] = useState<Record<string, string>>({});
  const firstInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
    firstInputRef.current?.select();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onSkip();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onSkip]);

  function buildResults(freeze: boolean): LeftoverResult[] {
    return entries
      .filter((e) => (localValues[e.fillingId] ?? 0) > 0)
      .map((e) => {
        const base: LeftoverResult = {
          fillingId: e.fillingId,
          remainingG: localValues[e.fillingId],
          madeAt: e.madeAt,
          planId: e.planId,
        };
        if (freeze) {
          base.frozen = true;
          base.preservedShelfLifeDays = e.shelfLifeWeeks && e.shelfLifeWeeks > 0
            ? Math.round(e.shelfLifeWeeks * 7)
            : 0;
        }
        return base;
      });
  }

  function handleConfirm() {
    onConfirm(buildResults(false));
  }

  function handleFreeze() {
    onConfirm(buildResults(true));
  }

  const anyPositive = entries.some((e) => (localValues[e.fillingId] ?? 0) > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onSkip} />

      {/* Modal */}
      <div className="relative w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-b from-amber-50 to-card px-5 pt-5 pb-3">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Droplets className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                Any leftover filling?
              </h3>
              <p className="text-xs text-muted-foreground">
                Weigh what&apos;s left and we&apos;ll track it for next time
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="px-5 py-3 space-y-3">
          {entries.map((entry, idx) => {
            const value = localValues[entry.fillingId] ?? 0;
            return (
              <div key={entry.fillingId} className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium text-foreground">{entry.fillingName}</label>
                    {entry.category && (
                      <p className="text-[10px] text-muted-foreground">{entry.category}</p>
                    )}
                  </div>
                  {entry.estimatedLeftoverG > 0 && (
                    <span className="text-[10px] text-muted-foreground font-mono">
                      ~{Math.round(entry.estimatedLeftoverG)}g estimated
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    ref={idx === 0 ? firstInputRef : undefined}
                    type="number"
                    min={0}
                    max={entry.totalMadeG > 0 ? Math.round(entry.totalMadeG) : undefined}
                    step="any"
                    value={inputStrs[entry.fillingId] ?? value}
                    onChange={(e) => {
                      setInputStrs((prev) => ({ ...prev, [entry.fillingId]: e.target.value }));
                    }}
                    onBlur={(e) => {
                      const val = parseFloat(e.target.value);
                      const cap = entry.totalMadeG > 0 ? Math.round(entry.totalMadeG) : Infinity;
                      const clamped = isNaN(val) ? 0 : Math.max(0, Math.min(Math.round(val), cap));
                      setLocalValues((prev) => ({ ...prev, [entry.fillingId]: clamped }));
                      setInputStrs((prev) => {
                        const next = { ...prev };
                        delete next[entry.fillingId];
                        return next;
                      });
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        (e.target as HTMLInputElement).blur();
                        if (entries.length === 1) handleConfirm();
                      }
                    }}
                    className="flex-1 h-8 rounded-lg border border-border bg-card text-center text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                  />
                  <span className="text-xs text-muted-foreground w-4">g</span>
                </div>
                {entry.totalMadeG > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    Max {Math.round(entry.totalMadeG)}g (batch total)
                  </p>
                )}
              </div>
            );
          })}
        </div>

        {/* Actions */}
        <div className="px-5 py-4 border-t border-border flex flex-wrap gap-2 justify-end">
          <button
            onClick={onSkip}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            No leftover
          </button>
          <button
            onClick={handleFreeze}
            disabled={!anyPositive}
            className="rounded-full border border-sky-200 bg-white px-4 py-2 text-sm font-medium text-sky-700 hover:bg-sky-50 transition-colors inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Snowflake className="w-4 h-4" /> Freeze leftover
          </button>
          <button
            onClick={handleConfirm}
            disabled={!anyPositive}
            className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
          >
            Save leftover
          </button>
        </div>
      </div>
    </div>
  );
}
