"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Plus, Undo2, X } from "lucide-react";
import {
  usePreparedSales,
  useCollections,
  usePackagingList,
  useCurrencySymbol,
  markSaleSold,
  markSaleUnsold,
} from "@/lib/hooks";
import { groupPreparedSales, firstNSaleIds, type SaleGroup } from "@/lib/saleGrouping";

const UNDO_TIMEOUT_MS = 5000;

interface UndoToast {
  saleId: string;
  label: string;
  /** Monotonic timer key — bumped per sell so successive sales retrigger the
   *  auto-clear timeout cleanly without leaking the previous handle. */
  tick: number;
}

/** Quick-sell grid backed by the same prepared-sales data as /shop's
 *  Ready tab. Each tile is one "group" of identical prepared boxes;
 *  tapping "Sell 1" flips the oldest sale in the group to sold. A toast
 *  with Undo lives at the bottom for ~5s after each sell.
 *
 *  Anything more complex than a single-tap sell (custom box, multi-pack,
 *  refund, edit-note) bounces to /shop. */
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
  const [pendingSaleId, setPendingSaleId] = useState<string | null>(null);

  // Auto-clear the toast after UNDO_TIMEOUT_MS. Re-runs every time `tick`
  // changes, so a second sell within the window resets the timer.
  useEffect(() => {
    if (!undoToast) return;
    const id = setTimeout(() => setUndoToast(null), UNDO_TIMEOUT_MS);
    return () => clearTimeout(id);
  }, [undoToast]);

  async function handleSell(group: SaleGroup) {
    const ids = firstNSaleIds(group, 1);
    const saleId = ids[0];
    if (!saleId || pendingSaleId) return;
    setPendingSaleId(saleId);
    try {
      await markSaleSold(saleId);
      setUndoToast({
        saleId,
        label: tileLabel(group, collectionNameById, packagingNameById),
        tick: Date.now(),
      });
    } finally {
      setPendingSaleId(null);
    }
  }

  async function handleUndo() {
    const toast = undoToast;
    if (!toast) return;
    setUndoToast(null);
    await markSaleUnsold(toast.saleId);
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
        Tap a box to record a sale. Stock decrements immediately.
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
              busy={pendingSaleId !== null}
              label={tileLabel(group, collectionNameById, packagingNameById)}
              onSell={() => handleSell(group)}
            />
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground italic mt-1">
        Custom orders, refunds, multi-pack sales →{" "}
        <Link href="/shop" className="underline hover:text-foreground">
          Go to shop
        </Link>
        .
      </p>

      {undoToast && (
        <div
          role="status"
          className="mt-1 flex items-center gap-3 rounded-md border border-foreground bg-foreground text-background px-3 py-2"
        >
          <span className="text-xs flex-1 min-w-0">
            <span className="mono-label opacity-70">Sold</span>
            <span className="block truncate">{undoToast.label}</span>
          </span>
          <button
            type="button"
            onClick={handleUndo}
            className="inline-flex items-center gap-1 rounded-full bg-background text-foreground text-xs px-3 py-1 hover:opacity-90 transition-opacity"
          >
            <Undo2 className="w-3.5 h-3.5" />
            Undo
          </button>
          <button
            type="button"
            onClick={() => setUndoToast(null)}
            aria-label="Dismiss"
            className="text-background/60 hover:text-background transition-colors"
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
  onSell: () => void;
}) {
  const note = group.representative.customerNote;
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
      <button
        type="button"
        onClick={onSell}
        disabled={busy}
        className="mt-1 inline-flex items-center justify-center gap-1.5 rounded-full bg-foreground text-background text-xs px-3 py-1.5 disabled:opacity-50 hover:opacity-90 transition-opacity"
      >
        <Plus className="w-3.5 h-3.5" />
        Sell 1
      </button>
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
