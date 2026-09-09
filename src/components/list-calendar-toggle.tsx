"use client";

import { LayoutList, CalendarDays } from "lucide-react";

export type ListCalendarView = "list" | "calendar";

/** Two-button segmented toggle between a list and a month-calendar view —
 *  same shape and placement as the pantry pages' ViewDensityToggle. Shared by
 *  the Orders and Log pages; the labels stay fixed ("List" / "Calendar") so
 *  the E2E selectors are identical across pages, while the `title` tooltips
 *  describe what each view holds on the page in question. */
export function ListCalendarToggle({
  value,
  onChange,
  ariaLabel,
  listTitle,
  calendarTitle,
}: {
  value: ListCalendarView;
  onChange: (next: ListCalendarView) => void;
  /** Names the group for assistive tech, e.g. "Orders view". */
  ariaLabel: string;
  listTitle?: string;
  calendarTitle?: string;
}) {
  const btn = (view: ListCalendarView, Icon: typeof LayoutList, label: string, title?: string) => (
    <button
      type="button"
      onClick={() => onChange(view)}
      aria-pressed={value === view}
      title={title}
      className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium transition-colors ${
        value === view ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      <Icon aria-hidden="true" className="w-3.5 h-3.5" />
      {label}
    </button>
  );
  return (
    <div className="inline-flex rounded-full border border-border bg-card p-0.5" role="group" aria-label={ariaLabel}>
      {btn("list", LayoutList, "List", listTitle)}
      {btn("calendar", CalendarDays, "Calendar", calendarTitle)}
    </div>
  );
}
