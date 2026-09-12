"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

/** The prev / Today / next heading row shared by every calendar-ish view in
 *  the app — extracted from `MonthGridShell` so week/day views (which don't
 *  use the month grid at all) can match its look without duplicating markup. */
export function CalendarNavHeader({
  label,
  onPrev,
  onNext,
  onToday,
  prevLabel = "Previous",
  nextLabel = "Next",
}: {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** Accessible names for the prev/next buttons — callers with existing e2e
   *  coverage (the month view's "Previous month"/"Next month") must pass
   *  their exact original label to avoid breaking selectors. */
  prevLabel?: string;
  nextLabel?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold">{label}</h2>
      <div className="flex items-center gap-1">
        <button onClick={onPrev} aria-label={prevLabel} className="p-1.5 rounded-full hover:bg-muted transition-colors">
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button onClick={onToday} className="btn-secondary px-3 py-1 text-xs">
          Today
        </button>
        <button onClick={onNext} aria-label={nextLabel} className="p-1.5 rounded-full hover:bg-muted transition-colors">
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
