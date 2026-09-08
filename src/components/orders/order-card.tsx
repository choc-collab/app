"use client";

import Link from "next/link";
import { formatISODate, relativeToToday, ORDER_STATUS_LABEL, ORDER_STATUS_STYLE } from "@/lib/orders";
import type { Order } from "@/types";

/** One order row in a list: title + status badge, customer/venue subtitle,
 *  date + relative distance on the right. Used by the Orders list and the
 *  customer detail page's order history. */
export function OrderCard({
  order,
  todayISO,
  customerName,
}: {
  order: Order;
  todayISO: string;
  /** Resolved display name — the card doesn't look it up itself. Omit on
   *  pages already scoped to one customer. */
  customerName?: string;
}) {
  const subtitle = [customerName, order.venue].filter(Boolean).join(" · ");
  return (
    <Link
      href={`/orders/${order.id}`}
      className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:bg-muted/40 transition-colors"
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-medium truncate">{order.title}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${ORDER_STATUS_STYLE[order.status]}`}>
            {ORDER_STATUS_LABEL[order.status]}
          </span>
        </div>
        {subtitle && <p className="text-xs text-muted-foreground truncate mt-0.5">{subtitle}</p>}
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm tabular-nums">{formatISODate(order.eventDate)}</div>
        <div className="text-xs text-muted-foreground">{relativeToToday(order.eventDate, todayISO)}</div>
      </div>
    </Link>
  );
}
