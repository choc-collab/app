"use client";

import { useState } from "react";
import { ShoppingCart } from "lucide-react";

interface LowStockFlagButtonProps {
  /** Whether the item is already flagged as low stock */
  flagged?: boolean;
  /** Item name shown in the confirmation prompt */
  itemName?: string;
  /** Called when the user confirms flagging as low stock */
  onFlag: () => void | Promise<void>;
  /** Called when the user confirms removing from shopping list. If omitted, the button shows "On list" when flagged. */
  onUnflag?: () => void | Promise<void>;
  /** Icon + hit-target sizing: "sm" for inline product rows, "md" for list page rows */
  size?: "sm" | "md";
}

/**
 * Compact shopping-cart button with inline confirmation.
 *
 * Two modes:
 * - **Flag-only** (no `onUnflag`): tapping a flagged item does nothing (shows "On list" label).
 * - **Toggle** (`onUnflag` provided): tapping a flagged item asks "Remove from list?" before unflagging.
 */
export function LowStockFlagButton({
  flagged,
  itemName,
  onFlag,
  onUnflag,
  size = "md",
}: LowStockFlagButtonProps) {
  const [pending, setPending] = useState<"flag" | "unflag" | null>(null);

  const iconSize = size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4";
  const hitArea = size === "sm" ? "p-0.5" : "p-3";

  // Confirmation prompt (inline, replaces the button)
  if (pending) {
    const isRemoving = pending === "unflag";
    return (
      <span className="flex items-center gap-1.5 text-xs shrink-0">
        <span className="text-muted-foreground">
          {isRemoving ? "Remove?" : "Add to list?"}
        </span>
        <button
          onClick={async (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (isRemoving) await onUnflag?.();
            else await onFlag();
            setPending(null);
          }}
          className={`font-medium hover:underline ${isRemoving ? "text-red-600" : "text-status-warn"}`}
        >
          Yes
        </button>
        <button
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPending(null); }}
          className="text-muted-foreground hover:underline"
        >
          Cancel
        </button>
      </span>
    );
  }

  // Already flagged — no unflag callback → static label
  if (flagged && !onUnflag) {
    return (
      <span
        className={`shrink-0 ${hitArea} text-status-warn`}
        title="Already on shopping list"
      >
        <ShoppingCart className={iconSize} />
      </span>
    );
  }

  // Icon button
  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setPending(flagged ? "unflag" : "flag");
      }}
      className={`shrink-0 ${hitArea} rounded transition-colors ${
        flagged
          ? "text-status-warn hover:text-status-warn"
          : "text-muted-foreground/30 hover:text-status-warn"
      }`}
      title={flagged ? "Remove from shopping list" : "Flag as low stock"}
    >
      <ShoppingCart className={iconSize} />
    </button>
  );
}
