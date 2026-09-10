"use client";

import { useState } from "react";
import { PantryTableHeader, PantryTableGroupHeader, PantryTableRow, GroupHeader, type PantryTableColumn } from "@/components/pantry";
import { OrderProgressBar } from "@/components/orders/order-progress-bar";
import {
  formatEventDates,
  eventRelative,
  formatPieces,
  isPickupVenue,
  PICKUP_VENUE,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_STYLE,
  type OrderProgress,
} from "@/lib/orders";
import { ORDER_SOURCES } from "@/types";
import type { Order } from "@/types";
import { Store } from "lucide-react";

/**
 * Aligned table of orders, grouped (by month on the Orders list, by
 * upcoming/past on a customer page). Same chrome as the pantry list tables —
 * `PantryTableHeader` / `PantryTableGroupHeader` / `PantryTableRow` — so an
 * order row reads like a filling or packaging row: chevron on the right, one
 * click to the detail page, nothing editable inline. The Venue column shows
 * collection orders as the same Pick-up chip the detail page uses.
 *
 * The two production columns come from `orderProgressByOrder` in `lib/orders`:
 * Order size — how many pieces the order calls for (every line item, typed or
 * not) — and Made, how many of those already exist.
 */

const ORDERS_GRID = "minmax(180px,1.4fr) 104px 150px minmax(120px,1fr) 88px 84px minmax(130px,0.9fr) 20px";
const ORDERS_COLUMNS: PantryTableColumn[] = [
  { key: "order", label: "Order" },
  { key: "status", label: "Status" },
  { key: "date", label: "Event date" },
  { key: "venue", label: "Venue" },
  { key: "type", label: "Type" },
  { key: "size", label: "Order size", align: "right" },
  { key: "progress", label: "Made" },
];

export interface OrdersTableGroup {
  /** Stable key for the collapse set. */
  key: string;
  label: string;
  orders: Order[];
  /** Past & closed groups render their rows dimmed. */
  dimmed?: boolean;
}

export function OrdersTable({
  groups,
  todayISO,
  progressByOrder,
  customerNameById,
  collapsed,
  onToggleGroup,
  ariaLabel = "Orders",
}: {
  groups: OrdersTableGroup[];
  todayISO: string;
  progressByOrder: ReadonlyMap<string, OrderProgress>;
  /** Resolved display names. Omit on pages already scoped to one customer. */
  customerNameById?: ReadonlyMap<string, string>;
  /** Controlled collapse state. When omitted the table keeps its own. */
  collapsed?: ReadonlySet<string>;
  onToggleGroup?: (key: string) => void;
  ariaLabel?: string;
}) {
  const [localCollapsed, setLocalCollapsed] = useState<Set<string>>(new Set());
  const collapsedSet = collapsed ?? localCollapsed;
  const toggle = onToggleGroup ?? ((key: string) =>
    setLocalCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    }));

  return (
    <div role="table" aria-label={ariaLabel} className="rounded-lg border border-border bg-card overflow-hidden overflow-x-auto">
      <PantryTableHeader columns={ORDERS_COLUMNS} gridTemplateColumns={ORDERS_GRID} />
      {groups.map((group) => {
        const isCollapsed = collapsedSet.has(group.key);
        return (
          <div key={group.key}>
            <PantryTableGroupHeader>
              <GroupHeader
                label={group.label}
                count={group.orders.length}
                isCollapsed={isCollapsed}
                onToggle={() => toggle(group.key)}
              />
            </PantryTableGroupHeader>
            {!isCollapsed && group.orders.map((o) => (
              <OrderRow
                key={o.id}
                order={o}
                todayISO={todayISO}
                progress={progressByOrder.get(o.id ?? "")}
                customerName={customerNameById?.get(o.customerId ?? "")}
                dimmed={group.dimmed}
              />
            ))}
          </div>
        );
      })}
    </div>
  );
}

function OrderRow({
  order,
  todayISO,
  progress,
  customerName,
  dimmed,
}: {
  order: Order;
  todayISO: string;
  progress?: OrderProgress;
  customerName?: string;
  dimmed?: boolean;
}) {
  const pickup = isPickupVenue(order.venue);
  const sourceLabel = ORDER_SOURCES.find((s) => s.value === order.source)?.label;
  const needed = progress?.needed ?? 0;

  return (
    <PantryTableRow
      href={`/orders/${encodeURIComponent(order.id ?? "")}`}
      gridTemplateColumns={ORDERS_GRID}
      archived={dimmed}
    >
      <div className="min-w-0">
        <h3 className="font-medium text-sm truncate">{order.title}</h3>
        {customerName && <p className="text-xs text-muted-foreground truncate mt-0.5">{customerName}</p>}
      </div>
      <div>
        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-medium whitespace-nowrap ${ORDER_STATUS_STYLE[order.status]}`}>
          {ORDER_STATUS_LABEL[order.status]}
        </span>
      </div>
      <div className="min-w-0">
        <div className="text-xs tabular-nums whitespace-nowrap">{formatEventDates(order)}</div>
        <div className="text-[11px] text-muted-foreground whitespace-nowrap">{eventRelative(order, todayISO)}</div>
      </div>
      <div className="min-w-0">
        {pickup ? (
          /* Same chip as the detail page's Pick-up shortcut, so it reads as one thing */
          <span className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground whitespace-nowrap">
            <Store className="w-3 h-3" aria-hidden /> {PICKUP_VENUE}
          </span>
        ) : order.venue ? (
          <span className="text-xs truncate block" title={order.venue}>{order.venue}</span>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
      <span className="text-xs text-muted-foreground truncate">{sourceLabel ?? "—"}</span>
      <span className="text-xs tabular-nums text-right font-medium" title={needed > 0 ? `${formatPieces(needed)} pieces across all line items` : "No line items yet"}>
        {needed > 0 ? formatPieces(needed) : <span className="text-muted-foreground font-normal">—</span>}
      </span>
      <div className="min-w-0">
        {progress && needed > 0 ? (
          <OrderProgressBar progress={progress} compact />
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </div>
    </PantryTableRow>
  );
}
