/**
 * Stock-status badges for pantry list pages.
 *
 * Two variants:
 *  - <StockBadge status="low-stock" />       — item-level pill shown inside a list row
 *  - <GroupStockBadge outCount={2} lowCount={5} /> — summary pill shown in a group header
 *
 * Use the same classes everywhere so status colours are consistent across all pantry pages.
 */

export type StockStatus = "out-of-stock" | "low-stock" | "ordered" | "in-stock";

/** Inline pill badge shown next to an item's name. */
export function StockBadge({ status }: { status: StockStatus }) {
  if (status === "in-stock") return null;

  if (status === "out-of-stock") {
    return (
      <span className="text-[10px] font-medium text-status-alert bg-status-alert-bg px-1.5 py-0.5 rounded-full">
        out of stock
      </span>
    );
  }
  if (status === "ordered") {
    return (
      <span className="text-[10px] font-medium text-status-ok bg-status-ok-bg px-1.5 py-0.5 rounded-full">
        ordered
      </span>
    );
  }
  // low-stock
  return (
    <span className="text-[10px] font-medium text-status-warn bg-status-warn-bg px-1.5 py-0.5 rounded-full">
      low stock
    </span>
  );
}

/**
 * Summary badges shown inside a collapsible group header.
 * Renders "N out" (alert) if any items are out of stock,
 * otherwise "N low" (warn) if any items are low stock.
 */
export function GroupStockBadge({
  outCount = 0,
  lowCount = 0,
}: {
  outCount?: number;
  lowCount?: number;
}) {
  if (outCount > 0) {
    return (
      <span className="text-[10px] font-medium text-status-alert bg-status-alert-bg px-1.5 py-0.5 rounded-full">
        {outCount} out
      </span>
    );
  }
  if (lowCount > 0) {
    return (
      <span className="text-[10px] font-medium text-status-warn bg-status-warn-bg px-1.5 py-0.5 rounded-full">
        {lowCount} low
      </span>
    );
  }
  return null;
}
