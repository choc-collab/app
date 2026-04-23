"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CavityPreview } from "@/components/shop/cavity-preview";
import { CavityContentsPopover } from "@/components/shop/cavity-contents-popover";
import {
  markSaleSold,
  markSalesSold,
  markSaleUnsold,
  updateSaleNote,
  updateSaleNotes,
  useAllCollectionPackagings,
  useCollections,
  useCurrencySymbol,
  usePackagingList,
  usePreparedSales,
  useRecentSoldSales,
  useShopKpis,
  useShopProducts,
  voidPreparedSale,
} from "@/lib/hooks";
import { firstNSaleIds, groupPreparedSales, type SaleGroup } from "@/lib/saleGrouping";
import type { ShopProductInfo } from "@/lib/shopColor";
import type { Packaging, Sale } from "@/types";

const NEW_SALE_HREF = "/shop/new";

export default function ShopPage() {
  const kpis = useShopKpis();
  const prepared = usePreparedSales();
  const recent = useRecentSoldSales(10);
  const collections = useCollections();
  const collectionPackagings = useAllCollectionPackagings();
  const canSell = collections.length > 0 && collectionPackagings.length > 0;

  const symbol = useCurrencySymbol();
  const weekday = useWeekday();

  return (
    <div className="p-6 max-w-4xl">
      <HeaderRow
        weekday={weekday}
        revenue={kpis.revenueToday}
        boxes={kpis.boxesSoldToday}
        symbol={symbol}
        canSell={canSell}
      />

      <KpiGrid
        boxes={kpis.boxesSoldToday}
        revenue={kpis.revenueToday}
        bonbons={kpis.bonbonsToday}
        avg={kpis.avgBox7Day}
        symbol={symbol}
      />

      {!canSell && <SetupEmptyState />}

      {prepared.length > 0 && (
        <section aria-labelledby="prepared-heading" className="mt-8">
          <h2 id="prepared-heading" className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-2">
            Ready to sell · {prepared.length}
          </h2>
          <SalesList sales={prepared} symbol={symbol} kind="prepared" />
        </section>
      )}

      {recent.length > 0 && (
        <section aria-labelledby="recent-heading" className="mt-8">
          <h2 id="recent-heading" className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-2">
            Recent sales
          </h2>
          <SalesList sales={recent} symbol={symbol} kind="sold" />
        </section>
      )}

      {canSell && prepared.length === 0 && recent.length === 0 && (
        <div className="mt-8 rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center">
          <p className="text-sm text-muted-foreground">No boxes yet today. Tap <span className="font-medium text-foreground">+ New box</span> to start.</p>
        </div>
      )}
    </div>
  );
}

function HeaderRow({
  weekday,
  revenue,
  boxes,
  symbol,
  canSell,
}: {
  weekday: string;
  revenue: number;
  boxes: number;
  symbol: string;
  canSell: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3 mb-5">
      <div>
        <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1">
          Shop · {weekday}
        </div>
        <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl tracking-tight">
          {symbol}
          {formatMoney(revenue)} today · {boxes} box{boxes !== 1 ? "es" : ""}
        </h1>
      </div>
      {canSell ? (
        <Link
          href={NEW_SALE_HREF}
          className="btn-primary"
          data-testid="shop-new-box"
        >
          + New box
        </Link>
      ) : (
        <button
          type="button"
          disabled
          className="btn-primary opacity-50 cursor-not-allowed"
          title="Create a collection and packaging first"
        >
          + New box
        </button>
      )}
    </div>
  );
}

function KpiGrid({
  boxes,
  revenue,
  bonbons,
  avg,
  symbol,
}: {
  boxes: number;
  revenue: number;
  bonbons: number;
  avg: number | null;
  symbol: string;
}) {
  const cards = [
    { label: "Boxes sold", value: String(boxes), sub: "Today" },
    { label: "Revenue", value: `${symbol}${formatMoney(revenue)}`, sub: "Today" },
    { label: "Bonbons", value: String(bonbons), sub: "Today" },
    {
      label: "Avg. box",
      value: avg == null ? "—" : `${symbol}${formatMoney(avg)}`,
      sub: "7-day",
    },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      {cards.map((c) => (
        <div key={c.label} className="bg-card border border-border rounded-lg p-3">
          <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1.5">
            {c.label}
          </div>
          <div className="text-xl font-medium tracking-tight">{c.value}</div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

function SalesList({
  sales,
  symbol,
  kind,
}: {
  sales: Sale[];
  symbol: string;
  kind: "prepared" | "sold";
}) {
  const { viewById: productInfoById } = useShopProducts();
  const packagings = usePackagingList(true);
  const collections = useCollections();

  const packagingById = useMemo(() => {
    const m = new Map<string, Packaging>();
    for (const p of packagings) if (p.id) m.set(p.id, p);
    return m;
  }, [packagings]);

  const collectionNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of collections) if (c.id) m.set(c.id, c.name);
    return m;
  }, [collections]);

  if (kind === "prepared") {
    const groups = groupPreparedSales(sales);
    return (
      <ul className="flex flex-col gap-2">
        {groups.map((group) => {
          const pkg = packagingById.get(group.representative.packagingId);
          const collectionName =
            collectionNameById.get(group.representative.collectionId) ?? "—";
          const label = pkg?.name ?? "Box";
          // Singletons keep the original row chrome — no grouping controls
          // appear until there's actually something to group.
          if (group.count === 1) {
            return (
              <SaleRow
                key={group.key}
                sale={group.representative}
                kind="prepared"
                symbol={symbol}
                collectionName={collectionName}
                packaging={pkg}
                packagingLabel={label}
                productInfoById={productInfoById}
              />
            );
          }
          return (
            <PreparedGroupRow
              key={group.key}
              group={group}
              symbol={symbol}
              collectionName={collectionName}
              packaging={pkg}
              packagingLabel={label}
              productInfoById={productInfoById}
            />
          );
        })}
      </ul>
    );
  }

  // kind === "sold" — flat list, no grouping.
  return (
    <ul className="flex flex-col gap-2">
      {sales.map((sale) => {
        const pkg = packagingById.get(sale.packagingId);
        const collectionName = collectionNameById.get(sale.collectionId) ?? "—";
        const label = pkg?.name ?? "Box";
        return (
          <SaleRow
            key={sale.id ?? `${sale.collectionId}-${sale.packagingId}-${sale.preparedAt}`}
            sale={sale}
            kind="sold"
            symbol={symbol}
            collectionName={collectionName}
            packaging={pkg}
            packagingLabel={label}
            productInfoById={productInfoById}
          />
        );
      })}
    </ul>
  );
}

function SaleRow({
  sale,
  kind,
  symbol,
  collectionName,
  packaging,
  packagingLabel,
  productInfoById,
}: {
  sale: Sale;
  kind: "prepared" | "sold";
  symbol: string;
  collectionName: string;
  packaging: Packaging | undefined;
  packagingLabel: string;
  productInfoById: Map<string, ShopProductInfo>;
}) {
  const [editing, setEditing] = useState(false);
  const [draftNote, setDraftNote] = useState(sale.customerNote ?? "");
  const [savingNote, setSavingNote] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);

  // Keep the local draft in sync when the underlying row changes externally
  // (e.g. another tab edited the same note via Dexie Cloud sync).
  useEffect(() => {
    if (!editing) setDraftNote(sale.customerNote ?? "");
  }, [sale.customerNote, editing]);

  const when = formatTimestamp(kind === "prepared" ? sale.preparedAt : sale.soldAt ?? sale.preparedAt);

  async function handleSaveNote() {
    if (!sale.id || savingNote) return;
    setSavingNote(true);
    setNoteError(null);
    try {
      await updateSaleNote(sale.id, draftNote);
      setEditing(false);
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingNote(false);
    }
  }

  function handleCancelEdit() {
    setDraftNote(sale.customerNote ?? "");
    setNoteError(null);
    setEditing(false);
  }

  return (
    <li className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2.5">
      {packaging && (
        <CavityContentsPopover cells={sale.cells} productInfoById={productInfoById}>
          <CavityPreview
            cells={sale.cells}
            packaging={packaging}
            productInfoById={productInfoById}
            cellSize={14}
          />
        </CavityContentsPopover>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">
          {collectionName} · {packagingLabel}
        </div>
        <div className="text-[11px] text-muted-foreground">{when}</div>
        {editing ? (
          <div className="mt-1.5 flex flex-col gap-1.5">
            <textarea
              className="input w-full text-sm"
              rows={2}
              placeholder="Customer name, pickup time, gift tag…"
              value={draftNote}
              onChange={(e) => setDraftNote(e.target.value)}
              autoFocus
              data-testid="shop-edit-note-input"
            />
            {noteError && <div className="text-xs text-red-600">{noteError}</div>}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveNote}
                disabled={savingNote}
                className="btn-primary text-xs px-3 py-1 disabled:opacity-50"
                data-testid="shop-edit-note-save"
              >
                {savingNote ? "Saving…" : "Save"}
              </button>
              <button
                type="button"
                onClick={handleCancelEdit}
                disabled={savingNote}
                className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          sale.customerNote && (
            <div
              className="text-[11px] text-foreground/80 mt-0.5 line-clamp-2"
              title={sale.customerNote}
              data-testid="shop-sale-note"
            >
              “{sale.customerNote}”
            </div>
          )
        )}
      </div>
      <div className="font-mono text-sm tabular-nums shrink-0">
        {symbol}
        {formatMoney(sale.price)}
      </div>
      {kind === "prepared" && sale.id && !editing && (
        <PreparedActions
          saleId={sale.id}
          hasNote={Boolean(sale.customerNote)}
          onEdit={() => setEditing(true)}
        />
      )}
      {kind === "sold" && sale.id && soldWithinLast(sale.soldAt, 24 * 60 * 60_000) && (
        <UndoSoldAction saleId={sale.id} />
      )}
    </li>
  );
}

function soldWithinLast(soldAt: Date | string | undefined, ms: number): boolean {
  if (!soldAt) return false;
  const t = typeof soldAt === "string" ? new Date(soldAt).getTime() : soldAt.getTime();
  if (!Number.isFinite(t)) return false;
  return Date.now() - t < ms;
}

function UndoSoldAction({ saleId }: { saleId: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleUndo() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await markSaleUnsold(saleId);
      // Row hops back to "Ready to sell" — nothing else to do.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Undo failed");
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        onClick={handleUndo}
        disabled={busy}
        className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        title="Move this box back to Ready to sell"
        data-testid="shop-undo-sold-btn"
      >
        ↶ Undo
      </button>
    </div>
  );
}

function PreparedActions({
  saleId,
  hasNote,
  onEdit,
}: {
  saleId: string;
  hasNote: boolean;
  onEdit: () => void;
}) {
  const [busy, setBusy] = useState<"sell" | "void" | null>(null);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSell() {
    if (busy) return;
    setBusy("sell");
    setError(null);
    try {
      await markSaleSold(saleId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sell failed");
    } finally {
      setBusy(null);
    }
  }

  async function handleVoid() {
    if (busy) return;
    setBusy("void");
    setError(null);
    try {
      await voidPreparedSale(saleId);
      // Row unmounts on success — nothing else to do.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Void failed");
      setBusy(null);
      setConfirmVoid(false);
    }
  }

  if (confirmVoid) {
    return (
      <div className="flex items-center gap-2 shrink-0 basis-full sm:basis-auto">
        <span className="text-xs text-muted-foreground">Void this box?</span>
        <button
          type="button"
          onClick={handleVoid}
          disabled={busy !== null}
          className="text-xs font-medium text-red-600 hover:underline disabled:opacity-50"
        >
          Yes, void
        </button>
        <button
          type="button"
          onClick={() => setConfirmVoid(false)}
          disabled={busy !== null}
          className="text-xs text-muted-foreground hover:underline disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 shrink-0">
      {error && <span className="text-xs text-red-600">{error}</span>}
      <button
        type="button"
        onClick={onEdit}
        disabled={busy !== null}
        className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
        data-testid="shop-edit-note-btn"
      >
        {hasNote ? "Edit" : "+ Note"}
      </button>
      <button
        type="button"
        onClick={handleSell}
        disabled={busy !== null}
        className="btn-primary text-xs px-3 py-1.5"
        data-testid="shop-sell-btn"
      >
        {busy === "sell" ? "Selling…" : "Sell"}
      </button>
      <button
        type="button"
        onClick={() => setConfirmVoid(true)}
        disabled={busy !== null}
        className="text-xs text-muted-foreground hover:text-foreground"
        data-testid="shop-void-btn"
      >
        Void
      </button>
    </div>
  );
}

function PreparedGroupRow({
  group,
  symbol,
  collectionName,
  packaging,
  packagingLabel,
  productInfoById,
}: {
  group: SaleGroup;
  symbol: string;
  collectionName: string;
  packaging: Packaging | undefined;
  packagingLabel: string;
  productInfoById: Map<string, ShopProductInfo>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [sellQty, setSellQty] = useState(1);
  const [sellBusy, setSellBusy] = useState(false);
  const [sellError, setSellError] = useState<string | null>(null);
  // User can type any positive number into the stepper input; we surface
  // "Only N available" when they go over the group size instead of silently
  // clamping, so they can see the ceiling.
  const sellOverMax = sellQty > group.count;

  // Editing the shared note affects every row in the group.
  const [editing, setEditing] = useState(false);
  const [draftNote, setDraftNote] = useState(group.representative.customerNote ?? "");
  const [noteBusy, setNoteBusy] = useState(false);
  const [noteError, setNoteError] = useState<string | null>(null);
  useEffect(() => {
    if (!editing) setDraftNote(group.representative.customerNote ?? "");
  }, [group.representative.customerNote, editing]);

  async function handleSellN() {
    if (sellBusy || sellOverMax) return;
    const ids = firstNSaleIds(group, sellQty);
    if (ids.length === 0) return;
    setSellBusy(true);
    setSellError(null);
    try {
      await markSalesSold(ids);
      // Reset the stepper — the group will either shrink or disappear.
      setSellQty(1);
    } catch (err) {
      setSellError(err instanceof Error ? err.message : "Sell failed");
    } finally {
      setSellBusy(false);
    }
  }

  async function handleSaveNote() {
    if (noteBusy) return;
    const ids = group.sales.map((s) => s.id).filter((id): id is string => Boolean(id));
    setNoteBusy(true);
    setNoteError(null);
    try {
      await updateSaleNotes(ids, draftNote);
      setEditing(false);
    } catch (err) {
      setNoteError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setNoteBusy(false);
    }
  }

  function handleCancelEdit() {
    setDraftNote(group.representative.customerNote ?? "");
    setNoteError(null);
    setEditing(false);
  }

  const hasNote = Boolean(group.representative.customerNote);

  return (
    <li className="rounded-lg border border-border bg-card" data-testid="shop-prepared-group">
      <div className="flex flex-wrap items-center gap-3 px-3 py-2.5">
        {packaging && (
          <CavityContentsPopover cells={group.representative.cells} productInfoById={productInfoById}>
            <CavityPreview
              cells={group.representative.cells}
              packaging={packaging}
              productInfoById={productInfoById}
              cellSize={14}
            />
          </CavityContentsPopover>
        )}
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium truncate">
            {collectionName} · {packagingLabel}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {formatTimestamp(group.earliestPreparedAt)}
          </div>
          {editing ? (
            <div className="mt-1.5 flex flex-col gap-1.5">
              <textarea
                className="input w-full text-sm"
                rows={2}
                placeholder="Customer name, pickup time, gift tag…"
                value={draftNote}
                onChange={(e) => setDraftNote(e.target.value)}
                autoFocus
                data-testid="shop-edit-note-input"
              />
              {noteError && <div className="text-xs text-red-600">{noteError}</div>}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleSaveNote}
                  disabled={noteBusy}
                  className="btn-primary text-xs px-3 py-1 disabled:opacity-50"
                  data-testid="shop-edit-note-save"
                >
                  {noteBusy ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={handleCancelEdit}
                  disabled={noteBusy}
                  className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                >
                  Cancel
                </button>
                <span className="text-[11px] text-muted-foreground">
                  Applies to all {group.count} boxes
                </span>
              </div>
            </div>
          ) : (
            hasNote && (
              <div
                className="text-[11px] text-foreground/80 mt-0.5 line-clamp-2"
                title={group.representative.customerNote}
                data-testid="shop-sale-note"
              >
                “{group.representative.customerNote}”
              </div>
            )
          )}
        </div>
        <div className="font-mono text-sm tabular-nums shrink-0">
          {symbol}
          {formatMoney(group.representative.price)}
          <span className="text-muted-foreground"> · ×{group.count}</span>
        </div>
        {!editing && (
          <div className="flex flex-wrap items-center gap-2 shrink-0" data-testid="shop-group-actions">
            {sellError && <span className="text-xs text-red-600">{sellError}</span>}
            {sellOverMax && (
              <span className="text-xs text-red-600" role="alert" data-testid="shop-group-qty-over">
                Only {group.count} available
              </span>
            )}
            <GroupQuantityStepper
              value={sellQty}
              max={group.count}
              disabled={sellBusy}
              onChange={setSellQty}
            />
            <button
              type="button"
              onClick={handleSellN}
              disabled={sellBusy || sellOverMax}
              className="btn-primary text-xs px-3 py-1.5 disabled:opacity-50"
              data-testid="shop-sell-group-btn"
            >
              {sellBusy ? "Selling…" : `Sell ${sellQty}`}
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              disabled={sellBusy}
              className="text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              data-testid="shop-edit-note-btn"
            >
              {hasNote ? "Edit" : "+ Note"}
            </button>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="text-xs text-muted-foreground hover:text-foreground"
              aria-expanded={expanded}
              aria-label={expanded ? "Collapse group" : "Expand group"}
              data-testid="shop-group-expand"
            >
              {expanded ? "▴" : "▾"}
            </button>
          </div>
        )}
      </div>
      {expanded && (
        <ul className="border-t border-border divide-y divide-border" data-testid="shop-group-sub-list">
          {group.sales.map((s) => (
            <PreparedSubRow key={s.id ?? s.preparedAt.toString()} sale={s} />
          ))}
        </ul>
      )}
    </li>
  );
}

function PreparedSubRow({ sale }: { sale: Sale }) {
  const [busy, setBusy] = useState<"sell" | "void" | null>(null);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSell() {
    if (!sale.id || busy) return;
    setBusy("sell");
    setError(null);
    try {
      await markSaleSold(sale.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sell failed");
      setBusy(null);
    }
  }

  async function handleVoid() {
    if (!sale.id || busy) return;
    setBusy("void");
    setError(null);
    try {
      await voidPreparedSale(sale.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Void failed");
      setBusy(null);
      setConfirmVoid(false);
    }
  }

  return (
    <li className="flex items-center gap-3 px-3 py-2 pl-10 text-xs">
      <span className="flex-1 text-muted-foreground">
        {formatTimestamp(sale.preparedAt)}
      </span>
      {error && <span className="text-red-600">{error}</span>}
      {confirmVoid ? (
        <>
          <span className="text-muted-foreground">Void this box?</span>
          <button
            type="button"
            onClick={handleVoid}
            disabled={busy !== null}
            className="font-medium text-red-600 hover:underline disabled:opacity-50"
          >
            Yes, void
          </button>
          <button
            type="button"
            onClick={() => setConfirmVoid(false)}
            disabled={busy !== null}
            className="text-muted-foreground hover:underline disabled:opacity-50"
          >
            Cancel
          </button>
        </>
      ) : (
        <>
          <button
            type="button"
            onClick={handleSell}
            disabled={busy !== null}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            data-testid="shop-sub-sell-btn"
          >
            {busy === "sell" ? "Selling…" : "Sell"}
          </button>
          <button
            type="button"
            onClick={() => setConfirmVoid(true)}
            disabled={busy !== null}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
            data-testid="shop-sub-void-btn"
          >
            Void
          </button>
        </>
      )}
    </li>
  );
}

function GroupQuantityStepper({
  value,
  max,
  disabled,
  onChange,
}: {
  value: number;
  max: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  // Mirrors the fill-screen QuantityStepper — local buffer so the user can
  // type a number (useful when a morning batch is, say, 40 boxes and the
  // customer wants 30: typing beats holding the + button).
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);

  const decDisabled = disabled || value <= 1;
  const incDisabled = disabled || value >= max;

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setText(raw);
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= 1) onChange(n);
  }

  function handleBlur() {
    const n = parseInt(text, 10);
    if (Number.isNaN(n) || n < 1) setText(String(value));
  }

  return (
    <div
      className="flex items-center gap-0.5 rounded-full border border-border bg-card px-0.5"
      role="group"
      aria-label="Sell quantity"
    >
      <button
        type="button"
        aria-label="Decrease sell quantity"
        disabled={decDisabled}
        onClick={() => onChange(value - 1)}
        className="w-6 h-6 flex items-center justify-center rounded-full text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        data-testid="shop-group-qty-dec"
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={1}
        value={text}
        onChange={handleInputChange}
        onBlur={handleBlur}
        disabled={disabled}
        className="font-mono text-xs tabular-nums text-center bg-transparent border-0 focus:outline-none w-8 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:text-muted-foreground"
        aria-label="Sell quantity"
        data-testid="shop-group-qty-value"
      />
      <button
        type="button"
        aria-label="Increase sell quantity"
        disabled={incDisabled}
        onClick={() => onChange(value + 1)}
        className="w-6 h-6 flex items-center justify-center rounded-full text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        data-testid="shop-group-qty-inc"
      >
        +
      </button>
    </div>
  );
}

function SetupEmptyState() {
  return (
    <div className="mt-6 rounded-lg border border-dashed border-border bg-card p-5">
      <h2 className="text-sm font-medium mb-1">Set up a collection first</h2>
      <p className="text-sm text-muted-foreground mb-3">
        The Shop sells boxes at a price set on a collection × packaging pair. Create at least one collection with a packaging option, then come back here.
      </p>
      <Link href="/collections" className="btn-secondary inline-block">
        Open Collections
      </Link>
    </div>
  );
}

// ---------- formatting helpers ----------

function formatMoney(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatTimestamp(d: Date | string | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  if (!Number.isFinite(date.getTime())) return "";

  const time = date.toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const now = new Date();

  if (sameLocalDay(date, now)) return `today, ${time}`;

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (sameLocalDay(date, yesterday)) return `yesterday, ${time}`;

  const datePart = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${datePart}, ${time}`;
}

function sameLocalDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function useWeekday(): string {
  // Empty on SSR / first paint, filled in after hydration — same pattern as
  // `useGreeting` on /app/page.tsx, to avoid a hydration mismatch.
  const [weekday, setWeekday] = useState("");
  useEffect(() => {
    setWeekday(new Date().toLocaleDateString(undefined, { weekday: "long" }));
  }, []);
  return weekday;
}
