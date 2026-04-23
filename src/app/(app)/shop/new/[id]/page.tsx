"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useMemo, useReducer, useState } from "react";
import { BonbonDisc } from "@/components/shop/bonbon-disc";
import { SaleCavityTray } from "@/components/shop/sale-cavity-tray";
import {
  useAllCollectionPackagings,
  useCollection,
  useCurrencySymbol,
  usePackaging,
  useProductCategoryMap,
  useProductStockMap,
  useShopProducts,
  saveSaleAsPrepared,
} from "@/lib/hooks";
import {
  DEFAULT_CATEGORY,
  filledCount,
  initSaleDraft,
  maxPrepareQuantity,
  saleDraftReducer,
  usedCounts,
  type SaleDraft,
} from "@/lib/saleDraft";
import type { ShopProductInfo } from "@/lib/shopColor";
import type { Packaging, Product } from "@/types";

export default function ShopFillBoxPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: cpId } = use(params);
  const cps = useAllCollectionPackagings();
  const cp = cps.find((c) => c.id === cpId);
  const collection = useCollection(cp?.collectionId);
  const packaging = usePackaging(cp?.packagingId);

  if (!cp && cps.length > 0) return <NotFound />;
  if (!cp || !collection || !packaging) return <Loading />;

  return (
    <FillBox
      cpId={cpId}
      price={cp.sellPrice}
      collectionId={cp.collectionId}
      collectionName={collection.name}
      packagingId={cp.packagingId}
      packaging={packaging}
    />
  );
}

function FillBox({
  cpId,
  price,
  collectionId,
  collectionName,
  packagingId,
  packaging,
}: {
  cpId: string;
  price: number;
  collectionId: string;
  collectionName: string;
  packagingId: string;
  packaging: Packaging;
}) {
  const router = useRouter();
  const symbol = useCurrencySymbol();

  const { products, viewById: productInfoById } = useShopProducts();
  const categoryMap = useProductCategoryMap();
  const stockMap = useProductStockMap();

  // Lazy initializer: restore from sessionStorage on first render when the
  // stored draft matches this box's capacity; otherwise a fresh empty draft.
  const [draft, dispatch] = useReducer(
    saleDraftReducer,
    packaging.capacity,
    (capacity) => {
      const stored = readDraft(cpId);
      if (stored && stored.capacity === capacity && Array.isArray(stored.cells) && stored.cells.length === capacity) {
        return stored;
      }
      return initSaleDraft(capacity);
    },
  );

  // Persist draft to sessionStorage on every change.
  useEffect(() => {
    writeDraft(cpId, draft);
  }, [cpId, draft]);

  const categoryNames = useMemo(() => {
    const names = new Set<string>();
    for (const p of products) {
      const cat = p.productCategoryId ? categoryMap.get(p.productCategoryId)?.name : undefined;
      if (cat) names.add(cat);
    }
    return [DEFAULT_CATEGORY, ...Array.from(names).sort()];
  }, [products, categoryMap]);

  const filtered = useMemo(() => {
    const q = draft.query.trim().toLowerCase();
    return products.filter((p) => {
      if (draft.category !== DEFAULT_CATEGORY) {
        const cat = p.productCategoryId ? categoryMap.get(p.productCategoryId)?.name : undefined;
        if (cat !== draft.category) return false;
      }
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [products, draft.query, draft.category, categoryMap]);

  const counts = useMemo(() => usedCounts(draft.cells), [draft.cells]);
  const filled = filledCount(draft.cells);
  const total = packaging.capacity;
  const complete = total > 0 && filled === total;

  // How many copies of this exact box stock will allow.
  const maxQ = useMemo(() => maxPrepareQuantity(draft.cells, stockMap), [draft.cells, stockMap]);
  // Surface "you typed more than stock allows" as an inline error instead of
  // silently clamping — lets the user see the ceiling and decide whether to
  // adjust their order, fill fewer cavities, or reduce the count.
  const overMax = draft.quantity > maxQ;

  // Palette density — follows the handoff: 2 cols when small, 3 when big.
  const paletteCols = products.length > 20 ? 3 : 2;
  const tileSize = products.length > 20 ? 34 : 44;

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    if (!complete || saving || maxQ === 0 || overMax) return;
    setSaving(true);
    setError(null);
    try {
      await saveSaleAsPrepared({
        collectionId,
        packagingId,
        cells: draft.cells,
        price,
        customerNote: draft.note.trim() || undefined,
        quantity: draft.quantity,
      });
      clearDraft(cpId);
      router.push("/shop");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save sale");
      setSaving(false);
    }
  }

  // Suppress unused-warning for `symbol` — reserved for Phase 3 review screen
  // that will display the sale price inline on this page.
  void symbol;

  return (
    <div
      className="grid grid-cols-1 lg:grid-cols-[1fr_320px] min-h-[100dvh]"
      style={{ background: "var(--color-background)" }}
    >
      {/* Left — the box */}
      <div className="p-5 sm:p-6 overflow-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-0.5">
              Step 2 of 3 · {collectionName} · {packaging.name}
            </div>
            <h1 className="font-[family-name:var(--font-display)] text-xl sm:text-2xl tracking-tight">
              Fill the box{" "}
              <span className="font-mono text-base sm:text-lg text-muted-foreground ml-2" data-testid="shop-fill-counter">
                {filled}/{total}
              </span>
            </h1>
          </div>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <QuantityStepper
                value={draft.quantity}
                min={1}
                max={Math.max(1, maxQ)}
                disabled={!complete || saving || maxQ === 0}
                onChange={(q) => dispatch({ type: "setQuantity", quantity: q })}
              />
              <button
                type="button"
                onClick={handleSave}
                disabled={!complete || saving || maxQ === 0 || overMax}
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                data-testid="shop-save-prepared"
              >
                {saving
                  ? "Saving…"
                  : `Save as prepared${draft.quantity > 1 ? ` × ${draft.quantity}` : ""} →`}
              </button>
            </div>
            {overMax && maxQ > 0 && (
              <div
                className="text-xs text-red-600"
                role="alert"
                data-testid="shop-qty-over-stock"
              >
                Only {maxQ} box{maxQ !== 1 ? "es" : ""} fit in current stock.
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        <div className="flex justify-center">
          <SaleCavityTray
            cells={draft.cells}
            activeIndex={draft.activeCellIndex}
            packaging={packaging}
            productInfoById={productInfoById}
            onSelect={(i) => dispatch({ type: "selectCell", index: i })}
            onClear={(i) => dispatch({ type: "clearCell", index: i })}
          />
        </div>

        <SummaryCard
          counts={counts}
          productInfoById={productInfoById}
          filled={filled}
          cells={draft.cells}
          onClear={(i) => dispatch({ type: "clearCell", index: i })}
        />

        <div className="mt-4">
          <label className="block text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1.5" htmlFor="shop-note">
            Note (optional)
          </label>
          <textarea
            id="shop-note"
            className="input w-full text-sm"
            rows={2}
            placeholder="Customer name, pickup time, gift tag…"
            value={draft.note}
            onChange={(e) => dispatch({ type: "setNote", note: e.target.value })}
            data-testid="shop-note-input"
          />
        </div>

        <div className="mt-6">
          <Link href="/shop/new" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to box picker
          </Link>
        </div>
      </div>

      {/* Right — the palette */}
      <aside
        className="flex flex-col min-h-0 border-t lg:border-t-0 lg:border-l border-border"
        style={{ background: "var(--color-nav)" }}
      >
        <div className="p-3.5 pb-2">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground">Bonbons</div>
            <div className="text-xs font-mono text-muted-foreground">
              {filtered.length}/{products.length}
            </div>
          </div>

          <div className="relative mb-2">
            <input
              type="search"
              className="input w-full text-sm pl-7"
              placeholder="Search…"
              value={draft.query}
              onChange={(e) => dispatch({ type: "setQuery", query: e.target.value })}
              data-testid="shop-palette-search"
            />
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              width="14"
              height="14"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-3.5-3.5" />
            </svg>
          </div>

          <div
            className="flex gap-1 overflow-x-auto pb-1 -mx-0.5 px-0.5"
            style={{ scrollbarWidth: "none" }}
          >
            {categoryNames.map((c) => {
              const active = c === draft.category;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => dispatch({ type: "setCategory", category: c })}
                  className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    active
                      ? "text-[var(--accent-cocoa-ink)]"
                      : "border border-border text-muted-foreground hover:text-foreground"
                  }`}
                  style={active ? { background: "var(--accent-cocoa-bg)" } : undefined}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {products.length === 0 ? (
            <EmptyPalette />
          ) : filtered.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">No bonbons match.</div>
          ) : (
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: `repeat(${paletteCols}, minmax(0, 1fr))` }}
            >
              {filtered.map((p) => (
                <PaletteTile
                  key={p.id}
                  product={p}
                  info={p.id ? productInfoById.get(p.id) : undefined}
                  available={stockMap.get(p.id!) ?? 0}
                  used={counts.get(p.id!) ?? 0}
                  tileSize={tileSize}
                  onPick={(pid) => dispatch({ type: "placeBonbon", productId: pid, stockAvailable: stockMap.get(pid) ?? 0 })}
                  canPick={draft.activeCellIndex != null}
                />
              ))}
            </div>
          )}
        </div>
      </aside>
    </div>
  );
}

function PaletteTile({
  product,
  info,
  available,
  used,
  tileSize,
  onPick,
  canPick,
}: {
  product: Omit<Product, "photo">;
  info: ShopProductInfo | undefined;
  available: number;
  used: number;
  tileSize: number;
  onPick: (productId: string) => void;
  canPick: boolean;
}) {
  const remaining = available - used;
  const out = remaining <= 0;
  const low = remaining > 0 && remaining <= 3;
  const disabled = out || !canPick;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => product.id && onPick(product.id)}
      className="rounded-lg border border-border bg-card px-1.5 py-2 flex flex-col items-center gap-1 transition-all hover:border-primary/40 disabled:opacity-40 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      data-testid="shop-palette-tile"
      data-product-id={product.id}
      title={!canPick && !out ? "Select a cavity first" : undefined}
    >
      <BonbonDisc info={info} size={tileSize} />
      <div className="text-[10px] font-medium leading-tight text-center line-clamp-2 min-h-[1.4em]">
        {product.name}
      </div>
      <div
        className="text-[9px] font-mono"
        style={{
          color: out
            ? "var(--color-status-alert, #8c3030)"
            : low
              ? "var(--color-status-warn, #7a5c08)"
              : "var(--color-muted-foreground)",
        }}
      >
        {out ? "out" : `${remaining} left`}
      </div>
    </button>
  );
}

function SummaryCard({
  counts,
  productInfoById,
  filled,
  cells,
  onClear,
}: {
  counts: Map<string, number>;
  productInfoById: Map<string, ShopProductInfo>;
  filled: number;
  cells: readonly (string | null)[];
  onClear: (index: number) => void;
}) {
  return (
    <div className="mt-4 rounded-lg border border-border bg-card p-3">
      <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-2">
        In this box · tap a chip to remove one
      </div>
      {filled === 0 ? (
        <div className="text-xs text-muted-foreground">
          Empty. Tap a well, then a bonbon from the palette.
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {Array.from(counts.entries()).map(([pid, n]) => {
            const info = productInfoById.get(pid);
            if (!info) return null;
            return (
              <button
                key={pid}
                type="button"
                onClick={() => {
                  // Clear the LAST matching cavity — keeps the remaining chip
                  // count monotonic as the user taps.
                  for (let i = cells.length - 1; i >= 0; i--) {
                    if (cells[i] === pid) {
                      onClear(i);
                      break;
                    }
                  }
                }}
                className="inline-flex items-center gap-1.5 rounded-full bg-muted pl-1 pr-2.5 py-1 text-xs hover:bg-muted/80"
              >
                <BonbonDisc info={info} size={20} ariaHidden />
                <span>{info.name}</span>
                <span className="font-mono text-muted-foreground">×{n}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function QuantityStepper({
  value,
  min,
  max,
  disabled,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onChange: (next: number) => void;
}) {
  // Local buffer so the user can type (incl. temporarily empty / mid-edit
  // states like backspacing "10" → "1" → ""). onChange fires as soon as the
  // text parses to an integer ≥ min. On blur we resync to the committed value.
  const [text, setText] = useState(String(value));
  useEffect(() => {
    setText(String(value));
  }, [value]);

  const decDisabled = disabled || value <= min;
  const incDisabled = disabled || value >= max;

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    setText(raw);
    const n = parseInt(raw, 10);
    if (!Number.isNaN(n) && n >= min) onChange(n);
  }

  function handleBlur() {
    const n = parseInt(text, 10);
    if (Number.isNaN(n) || n < min) {
      setText(String(value));
    }
  }

  return (
    <div
      className="flex items-center gap-0.5 rounded-full border border-border bg-card px-1 py-1"
      role="group"
      aria-label="Quantity"
    >
      <button
        type="button"
        aria-label="Decrease quantity"
        disabled={decDisabled}
        onClick={() => onChange(value - 1)}
        className="w-7 h-7 flex items-center justify-center rounded-full text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        data-testid="shop-qty-dec"
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        value={text}
        onChange={handleInputChange}
        onBlur={handleBlur}
        disabled={disabled}
        className="font-mono text-sm tabular-nums text-center bg-transparent border-0 focus:outline-none w-10 [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none disabled:text-muted-foreground"
        aria-label="Quantity"
        data-testid="shop-qty-value"
      />
      <button
        type="button"
        aria-label="Increase quantity"
        disabled={incDisabled}
        onClick={() => onChange(value + 1)}
        className="w-7 h-7 flex items-center justify-center rounded-full text-sm text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
        data-testid="shop-qty-inc"
      >
        +
      </button>
    </div>
  );
}

function Loading() {
  return (
    <div className="p-6 max-w-3xl">
      <p className="text-sm text-muted-foreground">Loading box…</p>
    </div>
  );
}

function NotFound() {
  return (
    <div className="p-6 max-w-3xl">
      <h1 className="font-[family-name:var(--font-display)] text-2xl mb-2">Box not found</h1>
      <p className="text-sm text-muted-foreground mb-4">
        This box configuration no longer exists. It may have been removed from the collection.
      </p>
      <Link href="/shop/new" className="btn-secondary inline-block">
        Back to box picker
      </Link>
    </div>
  );
}

function EmptyPalette() {
  return (
    <div className="py-6 text-center">
      <div className="text-sm font-medium mb-1">No bonbons yet</div>
      <p className="text-xs text-muted-foreground mb-3">
        Add products in the Pantry, then come back here to fill this box.
      </p>
      <Link href="/products" className="text-xs underline text-muted-foreground hover:text-foreground">
        Open Products
      </Link>
    </div>
  );
}

// ---------- sessionStorage persistence ----------

const STORAGE_PREFIX = "shop-draft-";

function storageKey(cpId: string): string {
  return `${STORAGE_PREFIX}${cpId}`;
}

function readDraft(cpId: string): SaleDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(storageKey(cpId));
    return raw ? (JSON.parse(raw) as SaleDraft) : null;
  } catch {
    return null;
  }
}

function writeDraft(cpId: string, draft: SaleDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey(cpId), JSON.stringify(draft));
  } catch {
    // Quota exceeded or disabled storage — swallow; the draft just won't persist.
  }
}

function clearDraft(cpId: string): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey(cpId));
  } catch {
    // no-op
  }
}
