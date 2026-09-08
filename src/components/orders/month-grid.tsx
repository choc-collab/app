"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { monthGridDays, ordersByDate, ORDER_STATUS_LABEL, MONTH_NAMES } from "@/lib/orders";
import type { Order, OrderStatus } from "@/types";

const MAX_CHIPS_PER_DAY = 3;

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Solid-dot color per status for the tiny indicator on calendar chips —
 *  the pill badges' bg tokens are too washed out at 6px. */
const STATUS_DOT: Record<OrderStatus, string> = {
  lead: "bg-muted-foreground/50",
  confirmed: "bg-success",
  in_production: "bg-warning",
  fulfilled: "bg-success/40",
  cancelled: "bg-status-alert",
};

/** Presentational month calendar. All state (which month is shown) lives in
 *  the parent; the grid just renders `monthGridDays(year, month)` and hangs
 *  order chips on their `eventDate` cells. */
export function MonthGrid({
  year,
  month,
  orders,
  todayISO,
  onPrev,
  onNext,
  onToday,
  onDayClick,
}: {
  year: number;
  /** 0-based, matching `Date`. */
  month: number;
  orders: Order[];
  todayISO: string;
  onPrev: () => void;
  onNext: () => void;
  onToday: () => void;
  /** Clicking a cell's empty area — used to quick-add an order on that day. */
  onDayClick?: (iso: string) => void;
}) {
  const days = monthGridDays(year, month);
  const byDate = ordersByDate(orders);
  const currentMonthPrefix = `${year}-${String(month + 1).padStart(2, "0")}-`;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">
          {MONTH_NAMES[month]} {year}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={onPrev}
            aria-label="Previous month"
            className="p-1.5 rounded-full hover:bg-muted transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button onClick={onToday} className="btn-secondary px-3 py-1 text-xs">
            Today
          </button>
          <button
            onClick={onNext}
            aria-label="Next month"
            className="p-1.5 rounded-full hover:bg-muted transition-colors"
          >
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
          const dayOrders = byDate.get(iso) ?? [];
          const visible = dayOrders.slice(0, MAX_CHIPS_PER_DAY);
          const overflow = dayOrders.length - visible.length;
          const dayNum = Number(iso.slice(8));

          return (
            <div
              key={iso}
              onClick={onDayClick ? () => onDayClick(iso) : undefined}
              className={`min-h-20 border-b border-r border-border p-1 flex flex-col gap-0.5 ${
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
              {visible.map((o) => (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  onClick={(e) => e.stopPropagation()}
                  title={`${o.title} · ${ORDER_STATUS_LABEL[o.status]}`}
                  className="flex items-center gap-1 rounded bg-muted px-1 py-0.5 text-[10px] leading-tight font-medium hover:bg-muted/70 transition-colors min-w-0"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[o.status]}`} aria-hidden />
                  <span className="truncate">{o.title}</span>
                </Link>
              ))}
              {overflow > 0 && (
                <span className="text-[10px] text-muted-foreground px-1">+{overflow} more</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
