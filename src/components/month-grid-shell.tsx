"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthGridDays, MONTH_NAMES } from "@/lib/orders";

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** The chrome every month calendar in the app shares: a month heading with
 *  previous / Today / next controls, the weekday row, and a 7-column grid of
 *  cells (Monday-start, leading and trailing days of adjacent months dimmed).
 *  What goes *inside* a cell is the caller's — the Orders calendar hangs order
 *  chips there, the Log calendar hangs activity markers. All state (which
 *  month is shown) lives in the parent. */
export function MonthGridShell({
  year,
  month,
  todayISO,
  onPrev,
  onNext,
  onToday,
  onDayClick,
  renderDay,
  cellClassName = "min-h-20",
}: {
  year: number;
  /** 0-based, matching `Date`. */
  month: number;
  todayISO: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** Clicking a cell's empty area. */
  onDayClick?: (iso: string) => void;
  /** Cell body, rendered under the day number. */
  renderDay: (iso: string, ctx: { inMonth: boolean; isToday: boolean }) => React.ReactNode;
  cellClassName?: string;
}) {
  const days = monthGridDays(year, month);
  const currentMonthPrefix = `${year}-${String(month + 1).padStart(2, "0")}-`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {MONTH_NAMES[month]} {year}
        </h2>
        <div className="flex items-center gap-1">
          <button onClick={onPrev} aria-label="Previous month" className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={onToday} className="btn-secondary px-3 py-1 text-xs">
            Today
          </button>
          <button onClick={onNext} aria-label="Next month" className="p-1.5 rounded-full hover:bg-muted transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-center">
        {WEEKDAY_NAMES.map((d) => (
          <div key={d} className="mono-label text-muted-foreground py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-t border-l border-border rounded-b-lg overflow-hidden">
        {days.map((iso) => {
          const inMonth = iso.startsWith(currentMonthPrefix);
          const isToday = iso === todayISO;
          const dayNum = Number(iso.slice(8));
          return (
            <div
              key={iso}
              data-date={iso}
              onClick={onDayClick ? () => onDayClick(iso) : undefined}
              className={`${cellClassName} border-b border-r border-border p-1 flex flex-col gap-0.5 ${
                inMonth ? "bg-card" : "bg-muted/40"
              } ${onDayClick ? "cursor-pointer hover:bg-muted/60 transition-colors" : ""}`}
            >
              <span
                className={`self-start text-xs tabular-nums px-1 rounded-full ${
                  isToday
                    ? "bg-accent text-accent-foreground font-semibold"
                    : inMonth
                      ? "text-foreground"
                      : "text-muted-foreground/50"
                }`}
              >
                {dayNum}
              </span>
              {renderDay(iso, { inMonth, isToday })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
