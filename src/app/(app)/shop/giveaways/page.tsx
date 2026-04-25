"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { BonbonDisc } from "@/components/shop/bonbon-disc";
import { BonbonPalette } from "@/components/shop/bonbon-palette";
import { SaleCavityTray } from "@/components/shop/sale-cavity-tray";
import { SnackPackTray } from "@/components/shop/snack-pack-tray";
import {
  saveGiveaway,
  useCurrencySymbol,
  useLatestProductCostMap,
  useMouldsList,
  usePackagingList,
  useProductCategoryMap,
  useProductStockMap,
  useShopProducts,
} from "@/lib/hooks";
import { tallyCells } from "@/lib/saleStock";
import {
  GIVE_AWAY_REASONS,
  shopKindsForPackaging,
  type GiveAwayReason,
  type GiveAwayShape,
} from "@/types";

/**
 * Log a give-away. Four modes via the segmented control at the top:
 *   - "box"   — fill a multi-cavity gift box, mirrors the paid sale flow
 *   - "loose" — counter list of individual pieces
 *   - "bar"   — whole bars (deferred)
 *   - "snack" — 4-piece enrobed stick (deferred)
 *
 * Per-mode draft state (cells / counts) lives in local React state and
 * persists across mode switches — switching tabs to peek at "loose" doesn't
 * lose a half-filled box. Reason and from-stock are page-global.
 *
 * Stock-aware: when from-stock is ON, the picker disables tiles that would
 * push below 0; the save mutation re-validates as a defence-in-depth.
 */

type Mode = "box" | "loose" | "bar" | "snack";

interface BoxDraft {
  packagingId: string | null;
  cells: (string | null)[];
  activeCellIndex: number | null;
}

interface LooseDraft {
  counts: Record<string, number>;
}

interface BarDraft {
  counts: Record<string, number>;
}

// Snack-bars are individual moulded products (just bigger / different-shaped
// than regular moulded bonbons), so the snack draft is a count map mirroring
// loose/bar — not a multi-cavity stick.
interface SnackDraft {
  counts: Record<string, number>;
}

const EMPTY_LOOSE: LooseDraft = { counts: {} };
const EMPTY_BAR: BarDraft = { counts: {} };
const EMPTY_SNACK: SnackDraft = { counts: {} };

function emptyBoxDraft(): BoxDraft {
  return { packagingId: null, cells: [], activeCellIndex: null };
}

export default function GiveAwayLogPage() {
  const router = useRouter();
  const symbol = useCurrencySymbol();
  const { products, viewById: productInfoById } = useShopProducts();
  const categoryMap = useProductCategoryMap();
  const stockMap = useProductStockMap();
  const costMap = useLatestProductCostMap();
  const packagings = usePackagingList(false);
  const moulds = useMouldsList(false);

  // Index moulds by id once per render — used to surface the bar tile caption
  // ("100g · 70%") in bar mode without hammering Dexie per tile.
  const mouldById = useMemo(() => {
    const m = new Map<string, (typeof moulds)[number]>();
    for (const x of moulds) if (x.id) m.set(x.id, x);
    return m;
  }, [moulds]);

  // Page-global state.
  const [mode, setMode] = useState<Mode>("loose");
  const [reason, setReason] = useState<GiveAwayReason>("sample");
  // Default to true: most give-aways come out of finished stock (samples for
  // walk-ins, staff snacks, marketing pulls). Off-stock is the rarer case
  // where the operator made the piece fresh just for the give-away.
  const [fromStock, setFromStock] = useState(true);
  const [recipient, setRecipient] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Per-mode drafts — kept independently so switching tabs is non-destructive.
  const [looseDraft, setLooseDraft] = useState<LooseDraft>(EMPTY_LOOSE);
  const [boxDraft, setBoxDraft] = useState<BoxDraft>(emptyBoxDraft);
  const [barDraft, setBarDraft] = useState<BarDraft>(EMPTY_BAR);
  const [snackDraft, setSnackDraft] = useState<SnackDraft>(EMPTY_SNACK);

  // Search + category state — also kept per-mode so flipping between
  // "moulded only in loose" and "all in box" feels natural.
  const [looseQuery, setLooseQuery] = useState("");
  const [looseCategory, setLooseCategory] = useState("");
  const [boxQuery, setBoxQuery] = useState("");
  const [boxCategory, setBoxCategory] = useState("");

  // First-render: pick the smallest bonbon (multi-cavity gift box) as the
  // default. Snack-bar packs are valid in box mode but ancillary, so a bonbon
  // box is the more discoverable starting point. Falls back to the smallest
  // multi-cavity packaging of any kind if no bonbon box exists.
  const defaultPackaging = useMemo(() => {
    const multi = packagings.filter((p) => (p.capacity ?? 0) > 1);
    if (multi.length === 0) return null;
    const bonbons = multi.filter((p) => (p.productKind ?? "bonbon") === "bonbon");
    const pool = bonbons.length > 0 ? bonbons : multi;
    return pool.reduce((best, p) =>
      (p.capacity ?? 0) < (best.capacity ?? 0) ? p : best,
    );
  }, [packagings]);

  // Lazily set boxDraft.packagingId once we know what packaging to default to.
  if (mode === "box" && boxDraft.packagingId == null && defaultPackaging?.id) {
    const cap = defaultPackaging.capacity ?? 0;
    setBoxDraft({
      packagingId: defaultPackaging.id,
      cells: Array<string | null>(cap).fill(null),
      activeCellIndex: cap > 0 ? 0 : null,
    });
  }

  const boxPackaging = useMemo(
    () => packagings.find((p) => p.id === boxDraft.packagingId) ?? null,
    [packagings, boxDraft.packagingId],
  );

  // productId → category name, for the palette's filter row. Same shape the
  // fill-box page builds.
  const categoryByProductId = useMemo(() => {
    const m = new Map<string, string | undefined>();
    for (const p of products) {
      if (!p.id) continue;
      const cat = p.productCategoryId ? categoryMap.get(p.productCategoryId)?.name : undefined;
      m.set(p.id, cat);
    }
    return m;
  }, [products, categoryMap]);

  // Loose mode catalog — exclude bars (whole bars belong in their own mode).
  const looseCatalog = useMemo(
    () =>
      products.filter((p) => {
        if (!p.id) return false;
        return productInfoById.get(p.id)?.kind !== "bar";
      }),
    [products, productInfoById],
  );

  // Box mode catalog — derived from the *selected packaging's* productKind.
  // A 12-cavity bonbon gift box accepts moulded + enrobed; a snack-bar 3-pack
  // accepts only snack-bars; etc. Snack bars are deliberately excluded from
  // bonbon boxes (they don't fit alongside regular bonbons).
  const boxAllowedKinds = useMemo(
    () => shopKindsForPackaging(boxPackaging?.productKind),
    [boxPackaging],
  );
  const boxCatalog = useMemo(
    () =>
      products.filter((p) => {
        if (!p.id) return false;
        const kind = productInfoById.get(p.id)?.kind;
        return kind ? boxAllowedKinds.has(kind) : false;
      }),
    [products, productInfoById, boxAllowedKinds],
  );

  // Bar mode catalog — only products whose category renders as "bar".
  const barCatalog = useMemo(
    () =>
      products.filter((p) => {
        if (!p.id) return false;
        return productInfoById.get(p.id)?.kind === "bar";
      }),
    [products, productInfoById],
  );

  // Snack mode catalog — snack-bars are individual moulded products in their
  // own larger format. They're given away one at a time, like bars.
  const snackCatalog = useMemo(
    () =>
      products.filter((p) => {
        if (!p.id) return false;
        return productInfoById.get(p.id)?.kind === "snack-bar";
      }),
    [products, productInfoById],
  );

  // Usage map for the active mode — drives tally, cost, and stock-decrement.
  const usage = useMemo<Map<string, number>>(() => {
    if (mode === "box") return tallyCells(boxDraft.cells);
    if (mode === "loose" || mode === "bar" || mode === "snack") {
      const counts =
        mode === "loose" ? looseDraft.counts
        : mode === "bar" ? barDraft.counts
        : snackDraft.counts;
      const m = new Map<string, number>();
      for (const [pid, n] of Object.entries(counts)) {
        if (n > 0) m.set(pid, n);
      }
      return m;
    }
    return new Map();
  }, [mode, boxDraft.cells, looseDraft.counts, barDraft.counts, snackDraft.counts]);

  const pieceCount = useMemo(() => {
    let n = 0;
    for (const v of usage.values()) n += v;
    return n;
  }, [usage]);

  const totalCost = useMemo(() => {
    let c = 0;
    for (const [pid, n] of usage) c += (costMap.get(pid) ?? 0) * n;
    return c;
  }, [usage, costMap]);

  // Box mode: how many cavities are filled out of total.
  const boxFilled = useMemo(() => {
    let n = 0;
    for (const c of boxDraft.cells) if (c) n++;
    return n;
  }, [boxDraft.cells]);
  const boxTotal = boxPackaging?.capacity ?? 0;
  const boxComplete = boxTotal > 0 && boxFilled === boxTotal;

  // CTA enabled state per mode.
  const canLog =
    mode === "loose" ? pieceCount > 0
    : mode === "bar"   ? pieceCount > 0
    : mode === "snack" ? pieceCount > 0
    : mode === "box"   ? boxComplete && pieceCount > 0
    : false;

  const ctaLabel = (() => {
    if (mode === "loose") return `Log ${pieceCount} ${pieceCount === 1 ? "piece" : "pieces"} →`;
    if (mode === "bar") {
      return pieceCount > 0
        ? `Log ${pieceCount} bar${pieceCount === 1 ? "" : "s"} →`
        : "Log bar give-away →";
    }
    if (mode === "snack") {
      return pieceCount > 0
        ? `Log ${pieceCount} snack bar${pieceCount === 1 ? "" : "s"} →`
        : "Log snack-bar give-away →";
    }
    if (mode === "box") return boxComplete ? "Log gift box →" : `Box · ${boxFilled}/${boxTotal}`;
    return "Coming soon";
  })();

  // ── Loose mode: stepper handlers ──
  function bumpLoose(productId: string, delta: number) {
    setLooseDraft((prev) => {
      const next = { ...prev.counts };
      const current = next[productId] ?? 0;
      const stockAvailable = fromStock ? stockMap.get(productId) ?? 0 : Number.MAX_SAFE_INTEGER;
      const updated = Math.max(0, Math.min(stockAvailable, current + delta));
      if (updated === 0) delete next[productId];
      else next[productId] = updated;
      return { counts: next };
    });
  }

  // ── Bar mode: stepper handlers (same shape as loose) ──
  function bumpBar(productId: string, delta: number) {
    setBarDraft((prev) => {
      const next = { ...prev.counts };
      const current = next[productId] ?? 0;
      const stockAvailable = fromStock ? stockMap.get(productId) ?? 0 : Number.MAX_SAFE_INTEGER;
      const updated = Math.max(0, Math.min(stockAvailable, current + delta));
      if (updated === 0) delete next[productId];
      else next[productId] = updated;
      return { counts: next };
    });
  }

  // ── Snack mode: stepper handlers (mirrors loose/bar — snack-bars are
  //    individual products, not a multi-cavity stick) ──
  function bumpSnack(productId: string, delta: number) {
    setSnackDraft((prev) => {
      const next = { ...prev.counts };
      const current = next[productId] ?? 0;
      const stockAvailable = fromStock ? stockMap.get(productId) ?? 0 : Number.MAX_SAFE_INTEGER;
      const updated = Math.max(0, Math.min(stockAvailable, current + delta));
      if (updated === 0) delete next[productId];
      else next[productId] = updated;
      return { counts: next };
    });
  }

  // ── Box mode: cavity-tap handlers ──
  function selectCell(i: number) {
    setBoxDraft((d) => ({ ...d, activeCellIndex: i }));
  }
  function clearCell(i: number) {
    setBoxDraft((d) => {
      const next = d.cells.slice();
      next[i] = null;
      return { ...d, cells: next, activeCellIndex: i };
    });
  }
  function placeBonbonInBox(productId: string) {
    setBoxDraft((d) => {
      const idx = d.activeCellIndex;
      if (idx == null) return d;
      const next = d.cells.slice();
      next[idx] = productId;
      // Advance to the next empty cavity, wrapping to the start if needed.
      const total = next.length;
      let nextActive: number | null = null;
      for (let off = 1; off <= total; off++) {
        const probe = (idx + off) % total;
        if (next[probe] == null) {
          nextActive = probe;
          break;
        }
      }
      return { cells: next, activeCellIndex: nextActive, packagingId: d.packagingId };
    });
  }
  function changeBoxPackaging(packagingId: string) {
    const pkg = packagings.find((p) => p.id === packagingId);
    if (!pkg) return;
    const cap = pkg.capacity ?? 0;
    setBoxDraft({
      packagingId,
      cells: Array<string | null>(cap).fill(null),
      activeCellIndex: cap > 0 ? 0 : null,
    });
  }

  // From-stock guard: when toggling ON, clamp existing counts (loose) or
  // clear over-stock cells (box) so the draft is internally consistent.
  function setFromStockGuarded(next: boolean) {
    setFromStock(next);
    if (!next) return;
    setLooseDraft((prev) => {
      const out: Record<string, number> = {};
      for (const [pid, n] of Object.entries(prev.counts)) {
        const cap = stockMap.get(pid) ?? 0;
        const clamped = Math.min(cap, n);
        if (clamped > 0) out[pid] = clamped;
      }
      return { counts: out };
    });
    setBarDraft((prev) => {
      const out: Record<string, number> = {};
      for (const [pid, n] of Object.entries(prev.counts)) {
        const cap = stockMap.get(pid) ?? 0;
        const clamped = Math.min(cap, n);
        if (clamped > 0) out[pid] = clamped;
      }
      return { counts: out };
    });
    setSnackDraft((prev) => {
      const out: Record<string, number> = {};
      for (const [pid, n] of Object.entries(prev.counts)) {
        const cap = stockMap.get(pid) ?? 0;
        const clamped = Math.min(cap, n);
        if (clamped > 0) out[pid] = clamped;
      }
      return { counts: out };
    });
    // Box mode: if any cell holds a product whose total in the draft exceeds
    // available stock, drop the excess from the back of the array.
    setBoxDraft((d) => {
      const cap = new Map<string, number>();
      for (const pid of d.cells) {
        if (!pid) continue;
        cap.set(pid, (cap.get(pid) ?? 0) + 1);
      }
      const overBy = new Map<string, number>();
      for (const [pid, used] of cap) {
        const available = stockMap.get(pid) ?? 0;
        if (used > available) overBy.set(pid, used - available);
      }
      if (overBy.size === 0) return d;
      const next = d.cells.slice();
      for (let i = next.length - 1; i >= 0 && overBy.size > 0; i--) {
        const pid = next[i];
        if (!pid) continue;
        const need = overBy.get(pid) ?? 0;
        if (need > 0) {
          next[i] = null;
          if (need <= 1) overBy.delete(pid);
          else overBy.set(pid, need - 1);
        }
      }
      // Reset active to the first empty cell so the user can keep going.
      let active: number | null = null;
      for (let i = 0; i < next.length; i++) {
        if (next[i] == null) { active = i; break; }
      }
      return { ...d, cells: next, activeCellIndex: active };
    });
  }

  async function handleLog() {
    if (!canLog) {
      setError(
        mode === "box" ? "Fill every cavity first." : "Add at least one piece first.",
      );
      return;
    }
    setSaving(true);
    setError(null);
    try {
      let shape: GiveAwayShape;
      if (mode === "box") {
        if (!boxDraft.packagingId) throw new Error("Pick a box first.");
        shape = { kind: "box", packagingId: boxDraft.packagingId, cells: boxDraft.cells.slice() };
      } else if (mode === "loose") {
        shape = { kind: "loose", counts: { ...looseDraft.counts } };
      } else if (mode === "bar") {
        shape = { kind: "bar", counts: { ...barDraft.counts } };
      } else if (mode === "snack") {
        shape = { kind: "snack", counts: { ...snackDraft.counts } };
      } else {
        throw new Error("This mode isn't available yet.");
      }
      await saveGiveaway({
        reason,
        fromStock,
        shape,
        recipient: recipient.trim() || undefined,
        note: note.trim() || undefined,
        costPerProductById: costMap,
      });
      router.push("/shop");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  }

  return (
    <div>
      {/* Top-of-page back link — matches the pattern used on every other
          detail/edit page in the app (packaging, fillings, collections, etc.). */}
      <div className="px-4 pt-6 pb-2">
        <Link
          href="/shop"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Back
        </Link>
      </div>

      <div className="px-4 pb-10 max-w-5xl">
        {/* Title row — subtitle + h1, no inline action (the primary CTA lives
            inline at the bottom of the form, matching every other edit flow). */}
        <div className="mb-4">
          <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1">
            {fromStock
              ? "From stock — bonbons leave finished inventory"
              : "Off-stock — made fresh, never entered finished stock"}
          </div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl tracking-tight">
            Log give-away
          </h1>
        </div>

        {/* Page-global config: Reason + From-stock. These apply across all four
            modes, so they sit above the mode tabs as regular form fields rather
            than in a sticky bar. */}
        <section className="mb-4 rounded-lg border border-border bg-card p-3 space-y-3">
          <div>
            <div className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground mb-1.5">
              Reason
            </div>
            <div className="flex flex-wrap gap-1.5">
              {GIVE_AWAY_REASONS.map((r) => (
                <ReasonChip
                  key={r.value}
                  label={r.label}
                  active={reason === r.value}
                  onClick={() => setReason(r.value)}
                />
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] font-mono uppercase tracking-wide text-muted-foreground">
              Stock source
            </div>
            <FromStockToggle on={fromStock} onChange={setFromStockGuarded} />
          </div>
        </section>

        {/* Mode tabs */}
        <ModeTabs mode={mode} onChange={setMode} />

        {/* Body — varies by mode. State is preserved across switches. */}
        <div className="mt-4">
          {mode === "loose" && (
            <LooseModeBody
              catalog={looseCatalog}
              productInfoById={productInfoById}
              stockMap={stockMap}
              costMap={costMap}
              counts={looseDraft.counts}
              fromStock={fromStock}
              symbol={symbol}
              query={looseQuery}
              onQueryChange={setLooseQuery}
              category={looseCategory}
              onCategoryChange={setLooseCategory}
              categoryByProductId={categoryByProductId}
              onBump={bumpLoose}
            />
          )}

          {mode === "box" && (
            <BoxModeBody
              catalog={boxCatalog}
              productInfoById={productInfoById}
              stockMap={stockMap}
              categoryByProductId={categoryByProductId}
              packagings={packagings.filter((p) => (p.capacity ?? 0) > 1)}
              boxPackaging={boxPackaging}
              cells={boxDraft.cells}
              activeCellIndex={boxDraft.activeCellIndex}
              usage={usage}
              fromStock={fromStock}
              onSelect={selectCell}
              onClear={clearCell}
              onPick={placeBonbonInBox}
              onChangePackaging={changeBoxPackaging}
              query={boxQuery}
              onQueryChange={setBoxQuery}
              category={boxCategory}
              onCategoryChange={setBoxCategory}
              filled={boxFilled}
              total={boxTotal}
            />
          )}

          {mode === "bar" && (
            <BarModeBody
              catalog={barCatalog}
              productInfoById={productInfoById}
              stockMap={stockMap}
              costMap={costMap}
              mouldById={mouldById}
              counts={barDraft.counts}
              fromStock={fromStock}
              symbol={symbol}
              onBump={bumpBar}
            />
          )}

          {mode === "snack" && (
            <SnackModeBody
              catalog={snackCatalog}
              productInfoById={productInfoById}
              stockMap={stockMap}
              costMap={costMap}
              counts={snackDraft.counts}
              fromStock={fromStock}
              symbol={symbol}
              onBump={bumpSnack}
            />
          )}
        </div>

        {/* Recipient + note (optional) — collapsed by default */}
        <details className="mt-4 rounded-lg border border-border bg-card">
          <summary className="px-3 py-2 text-xs font-mono uppercase tracking-wide text-muted-foreground cursor-pointer">
            Add recipient or note (optional)
          </summary>
          <div className="px-3 pb-3 space-y-2">
            <div>
              <label className="label" htmlFor="giveaway-recipient">Recipient</label>
              <input
                id="giveaway-recipient"
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder="e.g. Influencer name, charity"
                className="input"
              />
            </div>
            <div>
              <label className="label" htmlFor="giveaway-note">Note</label>
              <textarea
                id="giveaway-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Any context worth keeping…"
                rows={2}
                className="input"
              />
            </div>
          </div>
        </details>

        {/* Inline action row at the bottom of the form — same pattern as the
            Save/Cancel rows on every other edit page. Tally sits next to the
            CTA so the user can verify the count before committing. */}
        {error && (
          <div className="mt-4 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive" role="alert">
            {error}
          </div>
        )}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-border">
          <div className="text-sm text-muted-foreground tabular-nums">
            <span className="font-medium text-foreground" data-testid="giveaway-tally">
              {pieceCount} {pieceCount === 1 ? "piece" : "pieces"}
            </span>
            {pieceCount > 0 && (
              <span> · ~{symbol}{totalCost.toFixed(2)} ingredient cost</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/shop"
              className="btn-secondary px-4 py-2"
            >
              Cancel
            </Link>
            <button
              type="button"
              onClick={handleLog}
              disabled={saving || !canLog}
              className="btn-primary"
              data-testid="giveaway-log-cta"
            >
              {saving ? "Logging…" : ctaLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Mode tabs — segmented control
// ============================================================================

const MODE_TABS: ReadonlyArray<{ value: Mode; label: string; available: boolean }> = [
  { value: "box",   label: "Box",   available: true },
  { value: "loose", label: "Loose", available: true },
  { value: "bar",   label: "Bar",   available: true },
  { value: "snack", label: "Snack", available: true },
];

function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (m: Mode) => void }) {
  return (
    <div
      role="tablist"
      aria-label="Give-away shape"
      className="inline-flex rounded-full border border-border p-0.5 bg-card"
      data-testid="giveaway-mode-tabs"
    >
      {MODE_TABS.map((t) => {
        const active = mode === t.value;
        const disabled = !t.available;
        return (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={active}
            disabled={disabled}
            onClick={() => onChange(t.value)}
            className="rounded-full px-4 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            style={
              active
                ? { background: "var(--accent-lilac-bg)", color: "var(--accent-lilac-ink)" }
                : { background: "transparent", color: "var(--color-muted-foreground)" }
            }
            data-testid={`giveaway-mode-tab-${t.value}`}
            title={disabled ? "Coming soon" : undefined}
          >
            {t.label}
            {disabled && <span className="ml-1 text-[9px] uppercase">soon</span>}
          </button>
        );
      })}
    </div>
  );
}

// ============================================================================
// Loose mode body
// ============================================================================

function LooseModeBody({
  catalog,
  productInfoById,
  stockMap,
  costMap,
  counts,
  fromStock,
  symbol,
  query,
  onQueryChange,
  category,
  onCategoryChange,
  categoryByProductId,
  onBump,
}: {
  catalog: ReturnType<typeof useShopProducts>["products"];
  productInfoById: ReturnType<typeof useShopProducts>["viewById"];
  stockMap: Map<string, number>;
  costMap: Map<string, number>;
  counts: Record<string, number>;
  fromStock: boolean;
  symbol: string;
  query: string;
  onQueryChange: (q: string) => void;
  category: string;
  onCategoryChange: (c: string) => void;
  categoryByProductId: ReadonlyMap<string, string | undefined>;
  onBump: (productId: string, delta: number) => void;
}) {
  const categoryNames = useMemo(() => {
    const names = new Set<string>();
    for (const p of catalog) {
      if (!p.id) continue;
      const cat = categoryByProductId.get(p.id);
      if (cat) names.add(cat);
    }
    return Array.from(names).sort();
  }, [catalog, categoryByProductId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog.filter((p) => {
      if (category) {
        const cat = p.id ? categoryByProductId.get(p.id) : undefined;
        if (cat !== category) return false;
      }
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [catalog, query, category, categoryByProductId]);

  return (
    <>
      <div className="space-y-2.5 mb-3">
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search bonbons…"
          className="input"
          aria-label="Search bonbons"
        />
        {categoryNames.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            <CategoryChip
              label="All"
              active={category === ""}
              onClick={() => onCategoryChange("")}
            />
            {categoryNames.map((c) => (
              <CategoryChip
                key={c}
                label={c}
                active={category === c}
                onClick={() => onCategoryChange(c)}
              />
            ))}
          </div>
        )}
      </div>

      {catalog.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No bonbons available yet — add a product in the Products section.
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
          No bonbons match the current filter.
        </div>
      ) : (
        <ul className="rounded-lg border border-border bg-card divide-y divide-border" data-testid="giveaway-loose-list">
          {filtered.map((p) => {
            if (!p.id) return null;
            const info = productInfoById.get(p.id);
            const stock = stockMap.get(p.id) ?? 0;
            const count = counts[p.id] ?? 0;
            const remaining = fromStock ? Math.max(0, stock - count) : null;
            const incrDisabled = fromStock && remaining === 0;
            const cost = costMap.get(p.id);
            return (
              <li
                key={p.id}
                className="px-3 py-2.5 flex items-center gap-3"
                data-testid="giveaway-loose-row"
                data-product-id={p.id}
              >
                <div className="shrink-0">
                  <BonbonDisc info={info} size={32} ariaHidden />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{p.name}</div>
                  <div className="text-[11px] text-muted-foreground tabular-nums">
                    {fromStock ? (
                      stock > 0 ? `${remaining} left` : "out"
                    ) : cost != null ? (
                      `${symbol}${cost.toFixed(2)} each`
                    ) : (
                      "fresh"
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onBump(p.id!, -1)}
                    disabled={count === 0}
                    aria-label={`Decrease ${p.name}`}
                    className="w-7 h-7 rounded-full border border-border bg-card text-sm flex items-center justify-center disabled:opacity-30 hover:bg-muted"
                  >
                    −
                  </button>
                  <span
                    className="w-8 text-center text-sm tabular-nums font-medium"
                    aria-label={`${p.name} count`}
                  >
                    {count}
                  </span>
                  <button
                    type="button"
                    onClick={() => onBump(p.id!, +1)}
                    disabled={incrDisabled}
                    aria-label={`Increase ${p.name}`}
                    className="w-7 h-7 rounded-full border border-border bg-card text-sm flex items-center justify-center disabled:opacity-30 hover:bg-muted"
                  >
                    +
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

// ============================================================================
// Box mode body
// ============================================================================

function BoxModeBody({
  catalog,
  productInfoById,
  stockMap,
  categoryByProductId,
  packagings,
  boxPackaging,
  cells,
  activeCellIndex,
  usage,
  fromStock,
  onSelect,
  onClear,
  onPick,
  onChangePackaging,
  query,
  onQueryChange,
  category,
  onCategoryChange,
  filled,
  total,
}: {
  catalog: ReturnType<typeof useShopProducts>["products"];
  productInfoById: ReturnType<typeof useShopProducts>["viewById"];
  stockMap: Map<string, number>;
  categoryByProductId: ReadonlyMap<string, string | undefined>;
  packagings: ReturnType<typeof usePackagingList>;
  boxPackaging: ReturnType<typeof usePackagingList>[number] | null;
  cells: (string | null)[];
  activeCellIndex: number | null;
  usage: ReadonlyMap<string, number>;
  fromStock: boolean;
  onSelect: (i: number) => void;
  onClear: (i: number) => void;
  onPick: (productId: string) => void;
  onChangePackaging: (id: string) => void;
  query: string;
  onQueryChange: (q: string) => void;
  category: string;
  onCategoryChange: (c: string) => void;
  filled: number;
  total: number;
}) {
  if (packagings.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No multi-cavity packaging yet. Add a gift box in{" "}
        <Link href="/packaging" className="underline underline-offset-2">
          Packaging
        </Link>{" "}
        to log a box give-away.
      </div>
    );
  }
  if (!boxPackaging) {
    return null; // first-render — defaultPackaging effect lands next tick
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 min-h-[480px]">
      {/* Left — the box */}
      <div className="overflow-auto">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
            {boxPackaging.name} · {filled}/{total} filled
            {!fromStock && " · off-stock"}
          </div>
          <PackagingPicker
            packagings={packagings}
            selectedId={boxPackaging.id ?? null}
            onChange={onChangePackaging}
          />
        </div>

        <div className="flex justify-center">
          {boxPackaging.productKind === "snack-bar" ? (
            <SnackPackTray
              cells={cells}
              activeIndex={activeCellIndex}
              productInfoById={productInfoById}
              onSelect={onSelect}
              onClear={onClear}
            />
          ) : (
            <SaleCavityTray
              cells={cells}
              activeIndex={activeCellIndex}
              packaging={boxPackaging}
              productInfoById={productInfoById}
              onSelect={onSelect}
              onClear={onClear}
            />
          )}
        </div>

        {filled > 0 && (
          <div className="mt-4 rounded-lg border border-border bg-card p-3">
            <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-2">
              In this gift box · tap a chip to remove one
            </div>
            <div className="flex flex-wrap gap-2">
              {Array.from(usage.entries()).map(([pid, n]) => {
                const info = productInfoById.get(pid);
                if (!info) return null;
                return (
                  <button
                    key={pid}
                    type="button"
                    onClick={() => {
                      // Clear the LAST matching cavity — keeps the chip count monotonic.
                      for (let i = cells.length - 1; i >= 0; i--) {
                        if (cells[i] === pid) {
                          onClear(i);
                          break;
                        }
                      }
                    }}
                    className="inline-flex items-center gap-1.5 rounded-full pl-1 pr-2.5 py-1 text-xs hover:opacity-90"
                    style={{ background: "var(--accent-lilac-bg)", color: "var(--accent-lilac-ink)" }}
                  >
                    <BonbonDisc info={info} size={20} ariaHidden />
                    <span>{info.name}</span>
                    <span className="font-mono">×{n}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Right — the palette */}
      <aside
        className="flex flex-col min-h-[480px] max-h-[70vh] border border-border rounded-lg"
        style={{ background: "var(--color-nav)" }}
      >
        <BonbonPalette
          catalog={catalog}
          productInfoById={productInfoById}
          categoryByProductId={categoryByProductId}
          usedCounts={usage}
          stockMap={stockMap}
          fromStock={fromStock}
          canPick={activeCellIndex != null}
          onPick={onPick}
          query={query}
          onQueryChange={onQueryChange}
          category={category}
          onCategoryChange={onCategoryChange}
          accent="lilac"
        />
      </aside>
    </div>
  );
}

function PackagingPicker({
  packagings,
  selectedId,
  onChange,
}: {
  packagings: ReturnType<typeof usePackagingList>;
  selectedId: string | null;
  onChange: (id: string) => void;
}) {
  if (packagings.length <= 1) return null;
  // Group bonbon vs snack-bar packagings so the operator can spot the kind
  // shift at a glance — picking a snack-bar pack swaps the palette.
  const bonbonPkgs   = packagings.filter((p) => (p.productKind ?? "bonbon") === "bonbon");
  const snackBarPkgs = packagings.filter((p) => p.productKind === "snack-bar");
  return (
    <select
      value={selectedId ?? ""}
      onChange={(e) => onChange(e.target.value)}
      className="text-xs border border-border rounded-md px-2 py-1 bg-card"
      aria-label="Change box"
    >
      {bonbonPkgs.length > 0 && (
        <optgroup label="Bonbon boxes">
          {bonbonPkgs.map((p) => (
            <option key={p.id} value={p.id ?? ""}>{p.name} · {p.capacity}</option>
          ))}
        </optgroup>
      )}
      {snackBarPkgs.length > 0 && (
        <optgroup label="Snack-bar packs">
          {snackBarPkgs.map((p) => (
            <option key={p.id} value={p.id ?? ""}>{p.name} · {p.capacity}</option>
          ))}
        </optgroup>
      )}
    </select>
  );
}

// ============================================================================
// Bar mode body
// ============================================================================
//
// Whole bars don't fit in a regular gift box, so the picker is its own grid:
// each tile shows the bar visual (rendered by BonbonDisc with kind="bar") plus
// a +/- stepper. Mirrors the loose-mode list but as a tile grid since each row
// only has one column-shape (a wide horizontal bar) and feels nicer as tiles.

function BarModeBody({
  catalog,
  productInfoById,
  stockMap,
  costMap,
  mouldById,
  counts,
  fromStock,
  symbol,
  onBump,
}: {
  catalog: ReturnType<typeof useShopProducts>["products"];
  productInfoById: ReturnType<typeof useShopProducts>["viewById"];
  stockMap: Map<string, number>;
  costMap: Map<string, number>;
  mouldById: Map<string, ReturnType<typeof useMouldsList>[number]>;
  counts: Record<string, number>;
  fromStock: boolean;
  symbol: string;
  onBump: (productId: string, delta: number) => void;
}) {
  if (catalog.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No bar products yet — add one in the Products section and pick the
        “bar” category.
      </div>
    );
  }
  return (
    <ul
      className="grid grid-cols-1 sm:grid-cols-2 gap-2"
      data-testid="giveaway-bar-grid"
    >
      {catalog.map((p) => {
        if (!p.id) return null;
        const info = productInfoById.get(p.id);
        const stock = stockMap.get(p.id) ?? 0;
        const count = counts[p.id] ?? 0;
        const remaining = fromStock ? Math.max(0, stock - count) : null;
        const incrDisabled = fromStock && remaining === 0;
        const cost = costMap.get(p.id);
        // Spec caption: "100g · 70%" — uses the bar's default mould cavity
        // weight and the product's shell percentage. We render whatever is
        // available; if neither is set, we fall through to cost or stock.
        const mould = p.defaultMouldId ? mouldById.get(p.defaultMouldId) : undefined;
        const grams = mould?.cavityWeightG;
        const shell = p.shellPercentage;
        const specCaption =
          grams != null && shell != null ? `${grams}g · ${shell}%`
          : grams != null ? `${grams}g`
          : null;
        return (
          <li
            key={p.id}
            className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2"
            data-testid="giveaway-bar-tile"
            data-product-id={p.id}
          >
            <div className="flex justify-center py-2">
              <BonbonDisc info={info} size={120} />
            </div>
            <div className="text-sm font-medium leading-tight text-center line-clamp-2">
              {p.name}
            </div>
            <div className="text-[11px] text-muted-foreground text-center tabular-nums leading-tight">
              {specCaption && <div>{specCaption}</div>}
              <div>
                {fromStock
                  ? stock > 0 ? `${remaining} left` : "out"
                  : cost != null ? `${symbol}${cost.toFixed(2)} each`
                  : "fresh"}
              </div>
            </div>
            <div className="flex items-center justify-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => onBump(p.id!, -1)}
                disabled={count === 0}
                aria-label={`Decrease ${p.name}`}
                className="w-7 h-7 rounded-full border border-border bg-card text-sm flex items-center justify-center disabled:opacity-30 hover:bg-muted"
              >
                −
              </button>
              <span
                className="w-8 text-center text-sm tabular-nums font-medium"
                aria-label={`${p.name} count`}
              >
                {count}
              </span>
              <button
                type="button"
                onClick={() => onBump(p.id!, +1)}
                disabled={incrDisabled}
                aria-label={`Increase ${p.name}`}
                className="w-7 h-7 rounded-full border border-border bg-card text-sm flex items-center justify-center disabled:opacity-30 hover:bg-muted"
              >
                +
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ============================================================================
// Snack mode body
// ============================================================================
//
// Snack-bars are an individual product format (a moulded bonbon in a larger
// single-piece shape — gianduja sticks, snack tablets, etc.), so the give-away
// UX is a tile grid mirroring bar mode: one tile per snack-bar product with a
// +/- stepper. Not a multi-cavity stick.

function SnackModeBody({
  catalog,
  productInfoById,
  stockMap,
  costMap,
  counts,
  fromStock,
  symbol,
  onBump,
}: {
  catalog: ReturnType<typeof useShopProducts>["products"];
  productInfoById: ReturnType<typeof useShopProducts>["viewById"];
  stockMap: Map<string, number>;
  costMap: Map<string, number>;
  counts: Record<string, number>;
  fromStock: boolean;
  symbol: string;
  onBump: (productId: string, delta: number) => void;
}) {
  if (catalog.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        No snack-bar products yet — pick the “snack bar” category on a product
        to give away its larger single-piece format here.
      </div>
    );
  }
  return (
    <ul
      className="grid grid-cols-1 sm:grid-cols-2 gap-2"
      data-testid="giveaway-snack-grid"
    >
      {catalog.map((p) => {
        if (!p.id) return null;
        const info = productInfoById.get(p.id);
        const stock = stockMap.get(p.id) ?? 0;
        const count = counts[p.id] ?? 0;
        const remaining = fromStock ? Math.max(0, stock - count) : null;
        const incrDisabled = fromStock && remaining === 0;
        const cost = costMap.get(p.id);
        return (
          <li
            key={p.id}
            className="rounded-lg border border-border bg-card p-3 flex flex-col gap-2"
            data-testid="giveaway-snack-tile"
            data-product-id={p.id}
          >
            <div className="flex justify-center py-2">
              <BonbonDisc info={info} size={100} />
            </div>
            <div className="text-sm font-medium leading-tight text-center line-clamp-2">
              {p.name}
            </div>
            <div className="text-[11px] text-muted-foreground text-center tabular-nums">
              {fromStock
                ? stock > 0 ? `${remaining} left` : "out"
                : cost != null ? `${symbol}${cost.toFixed(2)} each`
                : "fresh"}
            </div>
            <div className="flex items-center justify-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => onBump(p.id!, -1)}
                disabled={count === 0}
                aria-label={`Decrease ${p.name}`}
                className="w-7 h-7 rounded-full border border-border bg-card text-sm flex items-center justify-center disabled:opacity-30 hover:bg-muted"
              >
                −
              </button>
              <span
                className="w-8 text-center text-sm tabular-nums font-medium"
                aria-label={`${p.name} count`}
              >
                {count}
              </span>
              <button
                type="button"
                onClick={() => onBump(p.id!, +1)}
                disabled={incrDisabled}
                aria-label={`Increase ${p.name}`}
                className="w-7 h-7 rounded-full border border-border bg-card text-sm flex items-center justify-center disabled:opacity-30 hover:bg-muted"
              >
                +
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ============================================================================
// Shared chips
// ============================================================================

function CategoryChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-medium ${
        active
          ? "text-[var(--accent-lilac-ink)]"
          : "border border-border text-muted-foreground hover:text-foreground"
      }`}
      style={active ? { background: "var(--accent-lilac-bg)" } : undefined}
    >
      {label}
    </button>
  );
}

function ReasonChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? "text-[var(--accent-lilac-ink)]"
          : "bg-card border border-border text-muted-foreground hover:text-foreground"
      }`}
      style={active ? { background: "var(--accent-lilac-bg)" } : undefined}
      aria-pressed={active}
    >
      {label}
    </button>
  );
}

function FromStockToggle({
  on,
  onChange,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium border border-border transition-colors"
      style={{
        background: on ? "var(--accent-lilac-bg)" : "var(--color-card)",
        color: on ? "var(--accent-lilac-ink)" : "var(--color-muted-foreground)",
      }}
      data-testid="giveaway-fromstock-toggle"
    >
      <span
        aria-hidden
        className="inline-block w-2 h-2 rounded-full"
        style={{ background: on ? "var(--accent-lilac-ink)" : "#d8d4cc" }}
      />
      {on ? "From stock" : "Off-stock"}
    </button>
  );
}
