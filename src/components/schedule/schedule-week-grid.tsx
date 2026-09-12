"use client";

import Link from "next/link";
import { CalendarNavHeader } from "@/components/calendar-nav-header";
import { SCHEDULE_TYPE_INK } from "@/components/schedule/schedule-style";
import { compareScheduleItems, type ScheduleItem } from "@/lib/schedule";

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Week view — 7 full columns (no "+N more" cap, unlike the month grid),
 *  one per day of `days`. Clicking a column's empty area selects that day
 *  (for the agenda panel); clicking an item navigates straight to it. */
export function ScheduleWeekGrid({
  days,
  label,
  items,
  todayISO,
  selectedDate,
  onPrev,
  onNext,
  onToday,
  onDayClick,
}: {
  /** The 7 ISO dates (Monday–Sunday) this week spans — see `weekDays()`. */
  days: string[];
  label: string;
  items: ScheduleItem[];
  todayISO: string;
  selectedDate: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  onDayClick: (iso: string) => void;
}) {
  const byDate = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    const list = byDate.get(item.date);
    if (list) list.push(item);
    else byDate.set(item.date, [item]);
  }
  for (const list of byDate.values()) list.sort(compareScheduleItems);

  return (
    <div className="space-y-2">
      <CalendarNavHeader label={label} onPrev={onPrev} onNext={onNext} onToday={onToday} prevLabel="Previous week" nextLabel="Next week" />
      <div className="grid grid-cols-7 gap-1.5">
        {days.map((iso, i) => {
          const dayItems = byDate.get(iso) ?? [];
          const isToday = iso === todayISO;
          const isSelected = iso === selectedDate;
          const dayNum = Number(iso.slice(8));
          const weekday = WEEKDAY_NAMES[i];
          return (
            <div
              key={iso}
              data-date={iso}
              onClick={() => onDayClick(iso)}
              className={`min-h-40 rounded-lg border p-1.5 flex flex-col gap-1 cursor-pointer transition-colors ${
                isSelected ? "border-accent bg-card" : "border-border bg-card hover:bg-muted/40"
              }`}
            >
              <div className="flex items-baseline justify-between">
                <span className="mono-label text-muted-foreground">{weekday}</span>
                <span className={`text-xs tabular-nums px-1 rounded-full ${isToday ? "bg-accent text-accent-foreground font-semibold" : "text-foreground"}`}>
                  {dayNum}
                </span>
              </div>
              <div className="flex flex-col gap-0.5">
                {dayItems.map((item) => {
                  const chipClass =
                    "flex items-center gap-1 rounded bg-muted px-1 py-0.5 text-[10px] leading-tight font-medium hover:bg-muted/70 transition-colors min-w-0";
                  const title = `${item.title}${item.subtitle ? ` · ${item.subtitle}` : ""}`;
                  const inner = (
                    <>
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.done ? "bg-muted-foreground/40" : ""}`}
                        style={item.done ? undefined : { backgroundColor: SCHEDULE_TYPE_INK[item.type] }}
                        aria-hidden
                      />
                      <span className={`truncate ${item.done ? "line-through text-muted-foreground" : ""}`}>{item.title}</span>
                    </>
                  );
                  return item.href ? (
                    <Link key={item.id} href={item.href} onClick={(e) => e.stopPropagation()} title={title} className={chipClass}>
                      {inner}
                    </Link>
                  ) : (
                    <span key={item.id} title={title} className={chipClass}>{inner}</span>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
