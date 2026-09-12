"use client";

import Link from "next/link";
import { MonthGridShell } from "@/components/month-grid-shell";
import { SCHEDULE_TYPE_INK } from "@/components/schedule/schedule-style";
import { compareScheduleItems, type ScheduleItem } from "@/lib/schedule";

const MAX_CHIPS_PER_DAY = 3;

/** Presentational month calendar overlaying Orders, production phase dates,
 *  and prep tasks. The grid chrome is `MonthGridShell` (shared with the
 *  Orders and Log calendars); this hangs one chip per item on its day,
 *  colour-coded by type. */
export function ScheduleMonthGrid({
  year,
  month,
  items,
  todayISO,
  onPrev,
  onNext,
  onToday,
  onDayClick,
}: {
  year: number;
  /** 0-based, matching `Date`. */
  month: number;
  items: ScheduleItem[];
  todayISO: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** Clicking a cell's empty area — used to select the day (and add a task). */
  onDayClick?: (iso: string) => void;
}) {
  const byDate = new Map<string, ScheduleItem[]>();
  for (const item of items) {
    const list = byDate.get(item.date);
    if (list) list.push(item);
    else byDate.set(item.date, [item]);
  }
  for (const list of byDate.values()) list.sort(compareScheduleItems);

  return (
    <MonthGridShell
      year={year}
      month={month}
      todayISO={todayISO}
      onPrev={onPrev}
      onNext={onNext}
      onToday={onToday}
      onDayClick={onDayClick}
      renderDay={(iso) => {
        const dayItems = byDate.get(iso) ?? [];
        const visible = dayItems.slice(0, MAX_CHIPS_PER_DAY);
        const overflow = dayItems.length - visible.length;
        return (
          <>
            {visible.map((item) => {
              const chipClass =
                "flex items-center gap-1 rounded bg-muted px-1 py-0.5 text-[10px] leading-tight font-medium hover:bg-muted/70 transition-colors min-w-0";
              const inner = (
                <>
                  {/* Finished work drops its type colour too — a bright dot
                      beside struck-through text still reads as "live". */}
                  <span
                    className={`w-1.5 h-1.5 rounded-full shrink-0 ${item.done ? "bg-muted-foreground/40" : ""}`}
                    style={item.done ? undefined : { backgroundColor: SCHEDULE_TYPE_INK[item.type] }}
                    aria-hidden
                  />
                  <span className={`truncate ${item.done ? "line-through text-muted-foreground" : ""}`}>
                    {item.title}
                  </span>
                </>
              );
              const title = `${item.title}${item.subtitle ? ` · ${item.subtitle}` : ""}`;
              return item.href ? (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={(e) => e.stopPropagation()}
                  title={title}
                  className={chipClass}
                >
                  {inner}
                </Link>
              ) : (
                <span key={item.id} title={title} className={chipClass}>
                  {inner}
                </span>
              );
            })}
            {overflow > 0 && <span className="text-[10px] text-muted-foreground px-1">+{overflow} more</span>}
          </>
        );
      }}
    />
  );
}
