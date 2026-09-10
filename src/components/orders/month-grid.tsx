"use client";

import Link from "next/link";
import { MonthGridShell } from "@/components/month-grid-shell";
import { ordersByDate, eventDayOf, ORDER_STATUS_LABEL } from "@/lib/orders";
import type { Order, OrderStatus } from "@/types";

const MAX_CHIPS_PER_DAY = 3;

/** Solid-dot color per status for the tiny indicator on calendar chips —
 *  the pill badges' bg tokens are too washed out at 6px. */
const STATUS_DOT: Record<OrderStatus, string> = {
  lead: "bg-muted-foreground/50",
  confirmed: "bg-success",
  in_production: "bg-warning",
  fulfilled: "bg-success/40",
  cancelled: "bg-status-alert",
};

/** Presentational month calendar for orders. The grid chrome (heading, month
 *  navigation, weekday row, cells) is `MonthGridShell`; this hangs order chips
 *  on the cells — one per day the event occupies, so a two-day market shows on
 *  both days (the title says which day it is). */
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
  const byDate = ordersByDate(orders);

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
        const dayOrders = byDate.get(iso) ?? [];
        const visible = dayOrders.slice(0, MAX_CHIPS_PER_DAY);
        const overflow = dayOrders.length - visible.length;
        return (
          <>
            {visible.map((o) => {
              const dayOf = eventDayOf(o, iso);
              const multi = dayOf != null && dayOf.total > 1;
              return (
                <Link
                  key={o.id}
                  href={`/orders/${encodeURIComponent(o.id ?? "")}`}
                  onClick={(e) => e.stopPropagation()}
                  title={`${o.title} · ${ORDER_STATUS_LABEL[o.status]}${multi ? ` · day ${dayOf.day} of ${dayOf.total}` : ""}`}
                  className="flex items-center gap-1 rounded bg-muted px-1 py-0.5 text-[10px] leading-tight font-medium hover:bg-muted/70 transition-colors min-w-0"
                >
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${STATUS_DOT[o.status]}`} aria-hidden />
                  <span className="truncate">{o.title}</span>
                  {multi && (
                    <span className="ml-auto shrink-0 text-muted-foreground tabular-nums font-normal">
                      {dayOf.day}/{dayOf.total}
                    </span>
                  )}
                </Link>
              );
            })}
            {overflow > 0 && <span className="text-[10px] text-muted-foreground px-1">+{overflow} more</span>}
          </>
        );
      }}
    />
  );
}
