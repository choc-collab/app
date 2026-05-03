"use client";

import { useEffect, useRef, useState } from "react";
import { Snowflake } from "lucide-react";

export function FreezeModal({
  title,
  itemName,
  itemSubtitle,
  unit,
  availableQty,
  defaultQty,
  defaultShelfLifeDays,
  onConfirm,
  onCancel,
}: {
  title: string;
  itemName: string;
  itemSubtitle?: string;
  /** "pcs" for products, "g" for filling */
  unit: string;
  /** Max amount the user is allowed to freeze. */
  availableQty: number;
  /** Pre-filled quantity (defaults to the whole batch per PM direction). */
  defaultQty: number;
  /** Pre-filled shelf life in days — the remaining shelf life at freeze time. */
  defaultShelfLifeDays: number;
  onConfirm: (qty: number, preservedShelfLifeDays: number) => void;
  onCancel: () => void;
}) {
  const [qtyStr, setQtyStr] = useState(String(Math.round(defaultQty)));
  const [daysStr, setDaysStr] = useState(String(Math.max(0, Math.round(defaultShelfLifeDays))));
  const qtyRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    qtyRef.current?.focus();
    qtyRef.current?.select();
  }, []);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  function handleConfirm() {
    const qty = Math.max(0, Math.min(Math.round(parseFloat(qtyStr) || 0), Math.round(availableQty)));
    const days = Math.max(0, Math.round(parseFloat(daysStr) || 0));
    if (qty <= 0) return;
    onConfirm(qty, days);
  }

  const qtyNum = parseFloat(qtyStr);
  const tooMuch = !isNaN(qtyNum) && qtyNum > availableQty;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onCancel} />

      <div className="relative w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
        {/* Header — cool icy tint */}
        <div className="bg-gradient-to-b from-sky-50 to-card px-5 pt-5 pb-3">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center">
              <Snowflake className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">{title}</h3>
              <p className="text-xs text-muted-foreground">
                {itemName}{itemSubtitle ? ` · ${itemSubtitle}` : ""}
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Quantity to freeze
            </label>
            <div className="flex items-center gap-2">
              <input
                ref={qtyRef}
                type="number"
                min={1}
                max={Math.round(availableQty)}
                value={qtyStr}
                onChange={(e) => setQtyStr(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
                className="flex-1 h-9 rounded-lg border border-border bg-card px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500"
              />
              <span className="text-xs text-muted-foreground w-10">{unit}</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Available: {Math.round(availableQty)} {unit}
            </p>
            {tooMuch && (
              <p className="mt-1 text-[11px] text-status-alert">
                Cannot freeze more than what&apos;s available.
              </p>
            )}
          </div>

          <div>
            <label className="block text-xs text-muted-foreground mb-1">
              Shelf life to preserve (days)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={0}
                value={daysStr}
                onChange={(e) => setDaysStr(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
                className="flex-1 h-9 rounded-lg border border-border bg-card px-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-sky-500/50 focus:border-sky-500"
              />
              <span className="text-xs text-muted-foreground w-10">days</span>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Pre-filled with the remaining shelf life. Sell-by is paused in the freezer
              and restarts from this many days once defrosted.
            </p>
          </div>
        </div>

        <div className="px-5 py-4 border-t border-border flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={tooMuch || !(parseFloat(qtyStr) > 0)}
            className="rounded-full bg-sky-600 text-white px-4 py-2 text-sm font-medium hover:bg-sky-700 transition-colors disabled:opacity-50"
          >
            Freeze
          </button>
        </div>
      </div>
    </div>
  );
}

export function DefrostConfirmModal({
  itemName,
  qty,
  unit,
  preservedShelfLifeDays,
  onConfirm,
  onCancel,
}: {
  itemName: string;
  qty: number;
  unit: string;
  preservedShelfLifeDays: number | undefined;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  const sellBy = preservedShelfLifeDays != null
    // eslint-disable-next-line react-hooks/purity -- "sell by" preview is a render-time snapshot
    ? new Date(Date.now() + preservedShelfLifeDays * 24 * 60 * 60 * 1000).toLocaleDateString("en-GB", {
        day: "numeric", month: "short", year: "numeric",
      })
    : null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onCancel} />

      <div className="relative w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h3 className="text-base font-bold text-foreground">Defrost {itemName}?</h3>
          <p className="text-xs text-muted-foreground mt-1">
            {Math.round(qty)} {unit} will move back to available stock.
          </p>
        </div>

        <div className="px-5 pb-3">
          {sellBy ? (
            <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 text-xs text-foreground">
              New sell-by date: <span className="font-medium">{sellBy}</span>
              <span className="text-muted-foreground"> ({preservedShelfLifeDays} days from today)</span>
            </div>
          ) : (
            <div className="rounded-lg bg-muted/40 border border-border px-3 py-2 text-xs text-muted-foreground">
              No preserved shelf life recorded — defrosting will not set a new sell-by date.
            </div>
          )}
        </div>

        <div className="px-5 py-4 border-t border-border flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Yes, defrost
          </button>
        </div>
      </div>
    </div>
  );
}
