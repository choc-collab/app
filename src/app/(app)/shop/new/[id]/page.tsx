"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useReducer, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { BonbonDisc } from "@/components/shop/bonbon-disc";
import { useSpaId } from "@/lib/use-spa-id";
import { BonbonPalette } from "@/components/shop/bonbon-palette";
import { SaleCavityTray } from "@/components/shop/sale-cavity-tray";
import { SnackPackTray } from "@/components/shop/snack-pack-tray";
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
import { shopKindsForPackaging } from "@/types";
import type { Packaging, Product } from "@/types";

export default function ShopFillBoxPage() {
  // Production builds use static export — every dynamic route is rewritten to
  // a `_spa` placeholder, so `use(params)` would always return "_spa" instead
  // of the real CollectionPackaging id. `useSpaId` reads it from
  // `window.location.pathname` instead, matching every other detail page in
  // the app.
  const cpId = useSpaId("new");
  const cps = useAllCollectionPackagings();
  const cp = cpId ? cps.find((c) => c.id === cpId) : undefined;
  const collection = useCollection(cp?.collectionId);
  const packaging = usePackaging(cp?.packagingId);

  // No id yet (first client render before useSyncExternalStore picks up the
  // pathname) — show the loading state rather than flashing NotFound.
  if (!cpId) return <Loading />;
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

  // Filter the catalog to products whose kind is compatible with the chosen
  // packaging. A "bonbon" gift box accepts moulded + enrobed, a "snack-bar"
  // pack accepts snack-bars only, etc. Bars are never shown here — they're
  // packaged via the production wizard's Package step (`packagePlanProductAsSales`).
  const allowedKinds = useMemo(
    () => shopKindsForPackaging(packaging.productKind),
    [packaging.productKind],
  );
  const compatibleProducts = useMemo(
    () =>
      products.filter((p) => {
        if (!p.id) return false;
        const kind = productInfoById.get(p.id)?.kind;
        return kind ? allowedKinds.has(kind) : false;
      }),
    [products, productInfoById, allowedKinds],
  );

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

  // productId → category name, used to drive the palette's category chip
  // row and per-tile filter. Built once per render; the palette consumes
  // it via the BonbonPalette extracted component.
  const categoryByProductId = useMemo(() => {
    const m = new Map<string, string | undefined>();
    for (const p of compatibleProducts) {
      if (!p.id) continue;
      const cat = p.productCategoryId ? categoryMap.get(p.productCategoryId)?.name : undefined;
      m.set(p.id, cat);
    }
    return m;
  }, [compatibleProducts, categoryMap]);

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
        <div className="-mx-1 mb-3">
          <Link
            href="/shop/new"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Back
          </Link>
        </div>
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
          {packaging.productKind === "snack-bar" ? (
            <SnackPackTray
              cells={draft.cells}
              activeIndex={draft.activeCellIndex}
              productInfoById={productInfoById}
              onSelect={(i) => dispatch({ type: "selectCell", index: i })}
              onClear={(i) => dispatch({ type: "clearCell", index: i })}
            />
          ) : (
            <SaleCavityTray
              cells={draft.cells}
              activeIndex={draft.activeCellIndex}
              packaging={packaging}
              productInfoById={productInfoById}
              onSelect={(i) => dispatch({ type: "selectCell", index: i })}
              onClear={(i) => dispatch({ type: "clearCell", index: i })}
            />
          )}
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

      </div>

      {/* Right — the palette */}
      <aside
        className="flex flex-col min-h-0 border-t lg:border-t-0 lg:border-l border-border"
        style={{ background: "var(--color-nav)" }}
      >
        <BonbonPalette
          catalog={compatibleProducts}
          productInfoById={productInfoById}
          categoryByProductId={categoryByProductId}
          usedCounts={counts}
          stockMap={stockMap}
          fromStock
          canPick={draft.activeCellIndex != null}
          onPick={(pid) =>
            dispatch({ type: "placeBonbon", productId: pid, stockAvailable: stockMap.get(pid) ?? 0 })
          }
          query={draft.query}
          onQueryChange={(q) => dispatch({ type: "setQuery", query: q })}
          category={draft.category === DEFAULT_CATEGORY ? "" : draft.category}
          onCategoryChange={(c) => dispatch({ type: "setCategory", category: c || DEFAULT_CATEGORY })}
          accent="cocoa"
          emptyState={<FillBoxEmptyPalette />}
        />
      </aside>
    </div>
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

function FillBoxEmptyPalette() {
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
