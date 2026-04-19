"use client";

import { useState } from "react";
import { ShoppingCart, Check } from "lucide-react";

interface StockStatusPanelProps {
  lowStock?: boolean;
  lowStockOrdered?: boolean;
  outOfStock?: boolean;
  /** Used in the confirmation message: "This will add [itemName] to your shopping list." */
  itemName?: string;
  onFlagLowStock: () => void | Promise<void>;
  onFlagOutOfStock: () => void | Promise<void>;
  onMarkOrdered: () => void | Promise<void>;
  /** Clears the out-of-stock flag (item goes back to low-stock state). */
  onClearOutOfStock: () => void | Promise<void>;
  /** Clears the low-stock flag entirely (item is restocked / removed from list). */
  onClearLowStock: () => void | Promise<void>;
}

export function StockStatusPanel({
  lowStock,
  lowStockOrdered,
  outOfStock,
  itemName,
  onFlagLowStock,
  onFlagOutOfStock,
  onMarkOrdered,
  onClearOutOfStock,
  onClearLowStock,
}: StockStatusPanelProps) {
  const [pendingAction, setPendingAction] = useState<null | "low" | "out">(null);

  if (pendingAction) {
    return (
      <div className="rounded-lg border border-status-warn-edge bg-status-warn-bg p-3 space-y-2">
        <p className="text-sm font-medium text-status-warn">
          {pendingAction === "low" ? "Flag as low stock?" : "Mark as out of stock?"}
        </p>
        <p className="text-xs text-muted-foreground">
          {pendingAction === "low"
            ? `This will add ${itemName ?? "this item"} to your shopping list.`
            : `This will mark ${itemName ?? "this item"} as out of stock — shown as urgent on your shopping list.`}
        </p>
        <div className="flex items-center gap-3">
          <button
            onClick={async () => {
              if (pendingAction === "low") await onFlagLowStock();
              else await onFlagOutOfStock();
              setPendingAction(null);
            }}
            className="text-sm font-medium text-status-warn hover:underline"
          >
            Yes, add to list
          </button>
          <button
            onClick={() => setPendingAction(null)}
            className="text-sm text-muted-foreground hover:underline"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (outOfStock) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-status-alert-edge bg-status-alert-bg text-status-alert">
          <ShoppingCart className="w-3.5 h-3.5" />
          Out of stock — on shopping list
        </span>
        <button
          onClick={onMarkOrdered}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-full px-2.5 py-1.5 transition-colors"
        >
          <Check className="w-3 h-3" /> Mark ordered
        </button>
        <button
          onClick={onClearOutOfStock}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Mark restocked
        </button>
      </div>
    );
  }

  if (lowStock) {
    return (
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border ${lowStockOrdered ? "border-status-ok-edge bg-status-ok-bg text-status-ok" : "border-status-warn-edge bg-status-warn-bg text-status-warn"}`}>
          <ShoppingCart className="w-3.5 h-3.5" />
          {lowStockOrdered ? "Ordered — awaiting delivery" : "Low stock — on shopping list"}
        </span>
        {!lowStockOrdered && (
          <>
            <button
              onClick={onMarkOrdered}
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground border border-border rounded-full px-2.5 py-1.5 transition-colors"
            >
              <Check className="w-3 h-3" /> Mark ordered
            </button>
            <button
              onClick={() => setPendingAction("out")}
              className="inline-flex items-center gap-1 text-xs text-status-alert border border-status-alert-edge hover:border-status-alert rounded-full px-2.5 py-1.5 transition-colors"
            >
              Mark out of stock
            </button>
          </>
        )}
        <button
          onClick={onClearLowStock}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          {lowStockOrdered ? "Mark restocked" : "Remove from list"}
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <button
        onClick={() => setPendingAction("low")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-status-warn border border-border hover:border-status-warn-edge rounded-full px-3 py-1.5 transition-colors"
      >
        <ShoppingCart className="w-3.5 h-3.5" /> Flag as low stock
      </button>
      <button
        onClick={() => setPendingAction("out")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-status-alert border border-border hover:border-status-alert-edge rounded-full px-3 py-1.5 transition-colors"
      >
        <ShoppingCart className="w-3.5 h-3.5" /> Mark out of stock
      </button>
    </div>
  );
}
