/**
 * Single-select segmented tab bar — small pill-shaped control used as a
 * primary lens above pantry list pages (e.g. All · Current · Archived,
 * All · In stock · Frozen · Low/out). Mirrors the inline pattern used on
 * the /today dashboard's To-Make list, generalised for reuse.
 */

"use client";

import type { ReactNode } from "react";

export type SegmentedTabOption<T extends string> = {
  id: T;
  label: ReactNode;
  /** Optional numeric badge — rendered next to the label when not selected
   *  (mutes the count once the tab is active to keep selected tabs tight). */
  count?: number | null;
};

export function SegmentedTabs<T extends string>({
  value,
  onChange,
  options,
  ariaLabel,
}: {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<SegmentedTabOption<T>>;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex rounded-full border border-border bg-card p-0.5"
    >
      {options.map(({ id, label, count }) => {
        const selected = value === id;
        return (
          <button
            key={id}
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(id)}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-colors inline-flex items-center gap-1 ${
              selected
                ? "bg-accent text-accent-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {label}
            {!selected && count != null && count > 0 && (
              <span className="text-[10px] tabular-nums">({count})</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
