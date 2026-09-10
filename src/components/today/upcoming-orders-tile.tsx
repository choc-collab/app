"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useOrders } from "@/lib/hooks";
import {
  upcomingOrders,
  toISODate,
  eventDayOf,
  eventRelative,
  formatEventDates,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_STYLE,
} from "@/lib/orders";

const MAX_ROWS = 3;

/** Compact mini-board for upcoming orders and events (statuses lead /
 *  confirmed / in production, event date today or later). Mirrors the
 *  In-progress tile: names link to each order's detail page, soonest first,
 *  truncating at MAX_ROWS with a "N more" link to the Orders page. */
export function UpcomingOrdersTile() {
  const orders = useOrders();

  const upcoming = useMemo(
    () => upcomingOrders(orders, toISODate(new Date())),
    [orders],
  );

  const todayISO = toISODate(new Date());
  const empty = upcoming.length === 0;
  const visible = upcoming.slice(0, MAX_ROWS);
  const remaining = upcoming.length - visible.length;

  return (
    <div className={`h-full flex flex-col gap-2 rounded-lg border border-border bg-card p-4 ${empty ? "opacity-60" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="mono-label text-muted-foreground">Upcoming orders</span>
        {!empty && (
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            {upcoming.length}
          </span>
        )}
      </div>

      {empty ? (
        <Link href="/orders" className="mt-auto self-start text-xs text-muted-foreground hover:text-foreground">
          Nothing planned — add an order →
        </Link>
      ) : (
        <>
          <ul className="flex flex-col">
            {visible.map((o) => (
              <li key={o.id} className="-mx-1 py-1">
                <Link
                  href={`/orders/${o.id}`}
                  title={`${o.title} · ${ORDER_STATUS_LABEL[o.status]} · ${eventRelative(o, todayISO)}`}
                  className="flex items-center gap-1.5 px-1 min-w-0 rounded hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground"
                >
                  <span className="flex-1 min-w-0 text-sm font-medium truncate">{o.title}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium shrink-0 ${ORDER_STATUS_STYLE[o.status]}`}>
                    {ORDER_STATUS_LABEL[o.status]}
                  </span>
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    {formatShortDate(o, todayISO)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {remaining > 0 ? (
            <Link
              href="/orders"
              className="mt-auto text-xs text-muted-foreground hover:text-foreground self-start"
            >
              {remaining} more on the calendar →
            </Link>
          ) : (
            <Link
              href="/orders"
              className="mt-auto text-xs text-muted-foreground hover:text-foreground self-start"
            >
              All orders →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

/** "20 Dec" / "19–20 Dec" for far-out dates; "today", "tomorrow" or
 *  "day 1 of 2" when imminent or under way. */
function formatShortDate(o: { eventDate: string; endDate?: string }, todayISO: string): string {
  const rel = eventRelative(o, todayISO);
  if (rel === "today" || rel === "tomorrow" || eventDayOf(o, todayISO)) return rel;
  return formatEventDates(o, { year: false });
}
