"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Undo2, X } from "lucide-react";
import {
  usePreparedSales,
  useCollections,
  usePackagingList,
  useCurrencySymbol,
  markSalesSold,
  markSaleUnsold,
} from "@/lib/hooks";
import { groupPreparedSales, firstNSaleIds, type SaleGroup } from "@/lib/saleGrouping";
import { SaleQuantityStepper } from "@/components/sale-quantity-stepper";

const UNDO_TIMEOUT_MS = 5000;

interface UndoToast {
  /** Sale ids that were just flipped to sold — undo restores all of them. */
  saleIds: string[];
  label: string;
  /** Monotonic timer key — bumped per sell so successive sells retrigger
   *  the auto-clear timeout cleanly. */
  tick: number;
}

/** Quick-sell grid backed by the same prepared-sales data and the same
 *  stepper component as /shop's Ready tab. Each tile is one "group" of
 *  identical prepared boxes:
 *
 *    - count === 1 → a single "Sell" button
 *    - count > 1   → stepper (1..count) + "Sell N" button
 *
 *  After each sell a toast lives at the bottom for ~5 s with an Undo
 *  affordance. Anything more complex than recording a stock sale (custom
 *  box, refund, multi-pack, edit note) bounces to /shop. */
export function SellQuickGrid() {
  const prepared = usePreparedSales();
  const collections = useCollections();
  const packaging = usePackagingList(true);
  const currency = useCurrencySymbol();

  const collectionNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of collections) if (c.id) m.set(c.id, c.name);
    return m;
  }, [collections]);
  const packagingNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of packaging) if (p.id) m.set(p.id, p.name);
    return m;
  }, [packaging]);

  const groups = useMemo(() => groupPreparedSales(prepared), [prepared]);

  const [undoToast, setUndoToast] = useState<UndoToast | null>(null);
  const [pendingGroupKey, setPendingGroupKey] = useState<string | null>(null);

  useEffect(() => {
    if (!undoToast) return;
    const id = setTimeout(() => setUndoToast(null), UNDO_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [undoToast]);

  async function handleSell(group: SaleGroup, qty: number) {
    if (pendingGroupKey) return;
    const ids = firstNSaleIds(group, qty);
    if (ids.length === 0) return;
    setPendingGroupKey(group.key);
    try {
      await markSalesSold(ids);
      setUndoToast({
        saleIds: ids,
        label: `${ids.length} × ${tileLabel(group, collectionNameById, packagingNameById)}`,
        tick: Date.now(),
      });
    } finally {
      setPendingGroupKey(null);
    }
  }

  async function handleUndo() {
    const toast = undoToast;
    if (!toast) return;
    setUndoToast(null);
    // markSaleUnsold is per-sale; flip them back in parallel — same
    // independent updates that markSalesSold made.
    await Promise.all(toast.saleIds.map((id) => markSaleUnsold(id)));
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4 flex flex-col gap-3">
      <header className="flex items-end justify-between gap-3">
        <div>
          <span className="mono-label text-muted-foreground">Sell · quick</span>
          <h2 className="text-lg font-display tracking-tight mt-1">Pre-packaged boxes</h2>
        </div>
        <Link
          href="/shop"
          className="inline-flex items-center text-xs text-muted-foreground hover:text-foreground rounded-full border border-border px-3 py-1.5 transition-colors"
        >
          Go to shop →
        </Link>
      </header>

      <p className="text-xs text-muted-foreground">
        Record a sale — stock decrements immediately.
      </p>

      {groups.length === 0 ? (
        <div className="py-6 text-center text-sm text-muted-foreground border border-dashed border-border rounded-md">
          Nothing prepped right now —{" "}
          <Link href="/shop/new" className="underline hover:text-foreground">
            build a box
          </Link>{" "}
          to fill the counter.
        </div>
      ) : (
        <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {groups.map((group) => (
            <SellTile
              key={group.key}
              group={group}
              currency={currency}
              busy={pendingGroupKey === group.key}
              label={tileLabel(group, collectionNameById, packagingNameById)}
              onSell={(qty) => handleSell(group, qty)}
            />
          ))}
        </ul>
      )}

      {undoToast && (
        <div
          role="status"
          className="mt-1 flex items-center gap-3 rounded-md border border-accent bg-accent text-accent-foreground px-3 py-2"
        >
          <span className="text-xs flex-1 min-w-0">
            <span className="mono-label opacity-70">Sold</span>
            <span className="block truncate">{undoToast.label}</span>
          </span>
          <button
            type="button"
            onClick={handleUndo}
            className="inline-flex items-center gap-1 rounded-full bg-card text-foreground text-xs px-3 py-1 hover:opacity-90 transition-opacity"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Undo
          </button>
          <button
            type="button"
            onClick={() => setUndoToast(null)}
            aria-label="Dismiss"
            className="text-accent-foreground/60 hover:text-accent-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </section>
  );
}

function SellTile({
  group,
  currency,
  busy,
  label,
  onSell,
}: {
  group: SaleGroup;
  currency: string;
  busy: boolean;
  label: string;
  onSell: (qty: number) => void;
}) {
  const note = group.representative.customerNote;
  const [qty, setQty] = useState(1);
  // Reset the stepper to 1 whenever the group's count changes (e.g. after a
  // sell shrinks it) — the previous qty may now exceed the new ceiling.
  useEffect(() => {
    setQty((prev) => Math.min(prev, group.count));
  }, [group.count]);
  const overMax = qty > group.count;

  return (
    <li className="rounded-md border border-border bg-card p-3 flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-sm font-medium line-clamp-2">{label}</span>
        <span className="text-sm font-mono shrink-0">{currency}{formatPrice(group.representative.price)}</span>
      </div>
      <span className="text-xs font-mono text-muted-foreground">
        {group.count} in stock
      </span>
      {note && (
        <span className="text-xs text-muted-foreground italic line-clamp-1">“{note}”</span>
      )}
      <div className="flex items-center gap-2 mt-1">
        {group.count > 1 && (
          <SaleQuantityStepper
            value={qty}
            max={group.count}
            disabled={busy}
            onChange={setQty}
            testIdPrefix="today-sell-qty"
          />
        )}
        <button
          type="button"
          onClick={() => onSell(group.count > 1 ? qty : 1)}
          disabled={busy || overMax}
          className="inline-flex items-center justify-center rounded-full bg-accent text-accent-foreground text-xs px-3 py-1 hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {busy ? "Selling…" : group.count > 1 ? `Sell ${qty}` : "Sell"}
        </button>
      </div>
    </li>
  );
}

function tileLabel(
  group: SaleGroup,
  collectionNameById: ReadonlyMap<string, string>,
  packagingNameById: ReadonlyMap<string, string>,
): string {
  const pkg = packagingNameById.get(group.representative.packagingId) ?? "Box";
  const col = collectionNameById.get(group.representative.collectionId);
  return col ? `${pkg} · ${col}` : pkg;
}

function formatPrice(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toFixed(2);
}
