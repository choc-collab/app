"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePersistedFilters } from "@/lib/use-persisted-filters";
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
  useGiveawayMonthTallies,
  usePackagingList,
  usePreparedSales,
  useRecentGiveaways,
  useRecentSoldSales,
  useShopKpis,
  useShopProducts,
  voidPreparedSale,
} from "@/lib/hooks";
import { firstNSaleIds, groupPreparedSales, type SaleGroup } from "@/lib/saleGrouping";
import { SaleQuantityStepper } from "@/components/sale-quantity-stepper";
import type { ShopProductInfo } from "@/lib/shopColor";
import { GIVE_AWAY_REASONS } from "@/types";
import type { GiveAwayRecord, Packaging, Sale } from "@/types";

const NEW_SALE_HREF = "/shop/new";
const LOG_GIVEAWAY_HREF = "/shop/giveaways";

type ActivityRange = "today" | "7d" | "30d" | "all";
type ShopTab = "ready" | "activity";

const ACTIVITY_RANGES: ReadonlyArray<{ value: ActivityRange; label: string }> = [
  { value: "today", label: "Today" },
  { value: "7d",    label: "7 days" },
  { value: "30d",   label: "30 days" },
  { value: "all",   label: "All" },
];

/** Largest window we keep in memory for the lists. Sales accumulate over
 *  time; capping the live query at 200 keeps the page responsive while
 *  still giving the operator a meaningful "All" view in practice. */
const ACTIVITY_FETCH_LIMIT = 200;

function activityRangeStartMs(range: ActivityRange): number {
  if (range === "all") return 0;
  const now = new Date();
  if (range === "today") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return start.getTime();
  }
  const days = range === "7d" ? 7 : 30;
  return now.getTime() - days * 86400000;
}

export default function ShopPage() {
  const kpis = useShopKpis();
  const prepared = usePreparedSales();
  const recent = useRecentSoldSales(ACTIVITY_FETCH_LIMIT);
  const recentGiveaways = useRecentGiveaways(ACTIVITY_FETCH_LIMIT);
  const collections = useCollections();
  const collectionPackagings = useAllCollectionPackagings();
  const canSell = collections.length > 0 && collectionPackagings.length > 0;
  const giveawayTallies = useGiveawayMonthTallies();

  const symbol = useCurrencySymbol();
  const weekday = useWeekday();

  // Tab + per-tab filter state. The tab choice persists across reloads via
  // sessionStorage so the operator returns to whichever list they were
  // working in. Search queries are not persisted — they're transient.
  const [tabFilters, setTabFilters] = usePersistedFilters("shop-landing", {
    activeTab: "ready" as ShopTab,
    activityRange: "today" as ActivityRange,
  });
  const [readyQuery, setReadyQuery] = useState("");
  const [activityQuery, setActivityQuery] = useState("");

  // Pre-build a tiny lookup so search can match collection names without an
  // O(N×M) scan inside the filter loop.
  const collectionNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of collections) if (c.id) m.set(c.id, c.name.toLowerCase());
    return m;
  }, [collections]);

  // ── Filter prepared sales ──
  const filteredPrepared = useMemo(() => {
    const q = readyQuery.trim().toLowerCase();
    if (!q) return prepared;
    return prepared.filter((s) => {
      const collection = collectionNameById.get(s.collectionId) ?? "";
      const note = (s.customerNote ?? "").toLowerCase();
      return collection.includes(q) || note.includes(q);
    });
  }, [prepared, readyQuery, collectionNameById]);

  // ── Filter recent activity (sales + giveaways) ──
  const rangeStart = activityRangeStartMs(tabFilters.activityRange);
  const filteredRecent = useMemo(() => {
    const q = activityQuery.trim().toLowerCase();
    return recent.filter((s) => {
      const t = s.soldAt ? new Date(s.soldAt).getTime() : new Date(s.preparedAt).getTime();
      if (t < rangeStart) return false;
      if (!q) return true;
      const collection = collectionNameById.get(s.collectionId) ?? "";
      const note = (s.customerNote ?? "").toLowerCase();
      return collection.includes(q) || note.includes(q);
    });
  }, [recent, activityQuery, rangeStart, collectionNameById]);

  const filteredGiveaways = useMemo(() => {
    const q = activityQuery.trim().toLowerCase();
    return recentGiveaways.filter((g) => {
      const t = new Date(g.at).getTime();
      if (t < rangeStart) return false;
      if (!q) return true;
      const reason = g.reason.toLowerCase();
      const recipient = (g.recipient ?? "").toLowerCase();
      const note = (g.note ?? "").toLowerCase();
      return reason.includes(q) || recipient.includes(q) || note.includes(q);
    });
  }, [recentGiveaways, activityQuery, rangeStart]);

  const activityCount = filteredRecent.length + filteredGiveaways.length;

  return (
    <div className="p-6 max-w-4xl">
      <HeaderRow
        weekday={weekday}
        revenue={kpis.revenueToday}
        boxes={kpis.boxesSoldToday}
        symbol={symbol}
        canSell={canSell}
        giveawayMonthCount={giveawayTallies.records}
      />

      <KpiGrid
        boxes={kpis.boxesSoldToday}
        revenue={kpis.revenueToday}
        bonbons={kpis.bonbonsToday}
        avg={kpis.avgBox7Day}
        symbol={symbol}
      />


      {!canSell && <SetupEmptyState />}

      {canSell && (
        <section aria-label="Shop activity" className="mt-8">
          {/* Tab strip — same rounded-pill style as the products / pantry
              tab strips, so the shop landing reads as part of the same app. */}
          <div className="flex gap-1 mb-3 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
            <ShopTabButton
              active={tabFilters.activeTab === "ready"}
              onClick={() => setTabFilters("activeTab", "ready")}
              label="Ready to sell"
              count={prepared.length}
            />
            <ShopTabButton
              active={tabFilters.activeTab === "activity"}
              onClick={() => setTabFilters("activeTab", "activity")}
              label="Recent activity"
              count={recent.length + recentGiveaways.length}
            />
          </div>

          {tabFilters.activeTab === "ready" ? (
            <ReadyToSellTab
              all={prepared}
              filtered={filteredPrepared}
              symbol={symbol}
              query={readyQuery}
              onQueryChange={setReadyQuery}
            />
          ) : (
            <RecentActivityTab
              filteredSales={filteredRecent}
              filteredGiveaways={filteredGiveaways}
              filteredCount={activityCount}
              totalCount={recent.length + recentGiveaways.length}
              symbol={symbol}
              query={activityQuery}
              onQueryChange={setActivityQuery}
              range={tabFilters.activityRange}
              onRangeChange={(r) => setTabFilters("activityRange", r)}
            />
          )}
        </section>
      )}
    </div>
  );
}

// ============================================================================
// Tabs + per-tab views
// ============================================================================

function ShopTabButton({
  active,
  onClick,
  label,
  count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
        active
          ? "bg-accent text-accent-foreground"
          : "bg-muted text-muted-foreground hover:bg-muted/80"
      }`}
      aria-pressed={active}
    >
      {label}
      <span className="ml-1.5 font-mono text-[11px] opacity-70 tabular-nums">
        {count}
      </span>
    </button>
  );
}

function ReadyToSellTab({
  all,
  filtered,
  symbol,
  query,
  onQueryChange,
}: {
  all: Sale[];
  filtered: Sale[];
  symbol: string;
  query: string;
  onQueryChange: (q: string) => void;
}) {
  if (all.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          No prepared boxes yet. Tap <span className="font-medium text-foreground">+ New box</span> to start.
        </p>
      </div>
    );
  }
  return (
    <>
      <SearchInput
        value={query}
        onChange={onQueryChange}
        placeholder="Search by collection or note…"
      />
      {filtered.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground text-center">
          Nothing matches “{query}”.
        </p>
      ) : (
        <SalesList sales={filtered} symbol={symbol} kind="prepared" />
      )}
    </>
  );
}

function RecentActivityTab({
  filteredSales,
  filteredGiveaways,
  filteredCount,
  totalCount,
  symbol,
  query,
  onQueryChange,
  range,
  onRangeChange,
}: {
  filteredSales: Sale[];
  filteredGiveaways: GiveAwayRecord[];
  filteredCount: number;
  totalCount: number;
  symbol: string;
  query: string;
  onQueryChange: (q: string) => void;
  range: ActivityRange;
  onRangeChange: (r: ActivityRange) => void;
}) {
  if (totalCount === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border bg-card px-4 py-8 text-center">
        <p className="text-sm text-muted-foreground">
          No activity yet. Sales and give-aways you log will show up here.
        </p>
      </div>
    );
  }
  return (
    <>
      <div className="space-y-2 mb-3">
        <SearchInput
          value={query}
          onChange={onQueryChange}
          placeholder="Search by collection, reason, recipient, or note…"
        />
        <div className="flex flex-wrap gap-1">
          {ACTIVITY_RANGES.map((r) => {
            const active = r.value === range;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => onRangeChange(r.value)}
                className={`px-2.5 py-1 text-xs rounded-full border transition-colors ${
                  active
                    ? "bg-foreground text-background border-foreground"
                    : "bg-transparent text-muted-foreground border-border hover:text-foreground"
                }`}
                aria-pressed={active}
              >
                {r.label}
              </button>
            );
          })}
        </div>
      </div>
      {filteredCount === 0 ? (
        <p className="rounded-lg border border-dashed border-border bg-card px-4 py-6 text-sm text-muted-foreground text-center">
          {query ? `Nothing matches “${query}” in this window.` : "No activity in this window."}
        </p>
      ) : (
        <RecentActivityList
          sales={filteredSales}
          giveaways={filteredGiveaways}
          symbol={symbol}
        />
      )}
    </>
  );
}

function SearchInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
}) {
  return (
    <div className="relative">
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="input w-full text-sm"
        // The global .input class uses a shorthand `padding` declaration that
        // beats Tailwind's `pl-*` utilities in the cascade — so pl-7 ends up
        // ignored and the magnifier overlaps the placeholder. Inline style
        // wins on specificity, so we set the left padding explicitly here.
        style={{ paddingLeft: 28 }}
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
  );
}

function HeaderRow({
  weekday,
  revenue,
  boxes,
  symbol,
  canSell,
  giveawayMonthCount,
}: {
  weekday: string;
  revenue: number;
  boxes: number;
  symbol: string;
  canSell: boolean;
  giveawayMonthCount: number;
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
      <div className="flex items-center gap-2">
        {canSell && <GiveAwayHeaderButton monthCount={giveawayMonthCount} />}
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
    </div>
  );
}

/**
 * Small lilac sibling to "+ New box". Visually demoted vs the cocoa primary
 * CTA (give-aways are ancillary), but discoverable enough that the operator
 * notices it. Optional running count surfaces just under the label so a busy
 * give-away month doesn't have to be discovered by clicking through.
 */
function GiveAwayHeaderButton({ monthCount }: { monthCount: number }) {
  return (
    <Link
      href={LOG_GIVEAWAY_HREF}
      className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-medium border border-transparent transition-colors hover:opacity-90 focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-offset-2"
      style={{
        background: "var(--accent-lilac-bg)",
        color: "var(--accent-lilac-ink)",
      }}
      data-testid="shop-giveaway-tile"
      title={
        monthCount > 0
          ? `${monthCount} give-away${monthCount === 1 ? "" : "s"} this month`
          : "Log a sample, charity, or friends/family give-away"
      }
    >
      <svg
        aria-hidden
        viewBox="0 0 24 24"
        width="14"
        height="14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <rect x="3" y="8" width="18" height="13" rx="1" />
        <path d="M3 12h18" />
        <path d="M12 8v13" />
        <path d="M12 8c-2 0-4-1.5-4-3.5S10 2 12 4c2-2 4-1.5 4 .5S14 8 12 8z" />
      </svg>
      Log give-away
      {monthCount > 0 && (
        <span className="font-mono opacity-70 tabular-nums">· {monthCount}</span>
      )}
    </Link>
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

/**
 * Merged "Recent activity" timeline — sold sales + give-aways interleaved by
 * timestamp. Per the design handoff, give-aways are visually demoted (lilac
 * tint, no price chip, "given" verb) but live in the same list as sales so
 * the operator sees the full daily outflow at a glance.
 *
 * The merge is a single sort over the union; we cap the rendered window at
 * the largest of the two source lists' caps to avoid arbitrary cutoffs.
 */
function RecentActivityList({
  sales,
  giveaways,
  symbol,
}: {
  sales: Sale[];
  giveaways: GiveAwayRecord[];
  symbol: string;
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

  // Build a discriminated, time-sorted union. We hold weak refs to the source
  // rows rather than copying fields so future schema additions land for free.
  type Item =
    | { kind: "sale"; at: number; sale: Sale }
    | { kind: "giveaway"; at: number; giveaway: GiveAwayRecord };

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const s of sales) {
      const t = s.soldAt ? new Date(s.soldAt).getTime() : new Date(s.preparedAt).getTime();
      out.push({ kind: "sale", at: t, sale: s });
    }
    for (const g of giveaways) {
      out.push({ kind: "giveaway", at: new Date(g.at).getTime(), giveaway: g });
    }
    out.sort((a, b) => b.at - a.at);
    return out;
  }, [sales, giveaways]);

  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, i) => {
        if (item.kind === "sale") {
          const sale = item.sale;
          const pkg = packagingById.get(sale.packagingId);
          const collectionName = collectionNameById.get(sale.collectionId) ?? "—";
          const label = pkg?.name ?? "Box";
          return (
            <SaleRow
              key={`sale-${sale.id ?? i}`}
              sale={sale}
              kind="sold"
              symbol={symbol}
              collectionName={collectionName}
              packaging={pkg}
              packagingLabel={label}
              productInfoById={productInfoById}
            />
          );
        }
        const g = item.giveaway;
        return (
          <GiveAwayRow
            key={`giveaway-${g.id ?? i}`}
            giveaway={g}
            symbol={symbol}
            packagingById={packagingById}
            productInfoById={productInfoById}
          />
        );
      })}
    </ul>
  );
}

function GiveAwayRow({
  giveaway,
  symbol,
  packagingById,
  productInfoById,
}: {
  giveaway: GiveAwayRecord;
  symbol: string;
  packagingById: Map<string, Packaging>;
  productInfoById: Map<string, ShopProductInfo>;
}) {
  const reasonLabel =
    GIVE_AWAY_REASONS.find((r) => r.value === giveaway.reason)?.label ?? giveaway.reason;
  const when = formatTimestamp(giveaway.at);
  const shapeLabel = describeGiveAwayShape(giveaway, packagingById);

  return (
    <li
      className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2.5"
      style={{
        background: "color-mix(in oklab, var(--accent-lilac-bg) 35%, var(--color-card))",
        borderColor: "color-mix(in oklab, var(--accent-lilac-ink) 20%, var(--color-border))",
      }}
      data-testid="shop-giveaway-row"
      data-giveaway-id={giveaway.id}
    >
      {giveaway.shape.kind === "box" ? (
        <GiveAwayBoxThumb
          shape={giveaway.shape}
          packagingById={packagingById}
          productInfoById={productInfoById}
        />
      ) : (
        <span
          aria-hidden
          className="inline-flex items-center justify-center w-7 h-7 rounded-full shrink-0"
          style={{ background: "var(--accent-lilac-bg)", color: "var(--accent-lilac-ink)" }}
        >
          <svg
            viewBox="0 0 24 24"
            width="14"
            height="14"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="8" width="18" height="13" rx="1" />
            <path d="M3 12h18" />
            <path d="M12 8v13" />
            <path d="M12 8c-2 0-4-1.5-4-3.5S10 2 12 4c2-2 4-1.5 4 .5S14 8 12 8z" />
          </svg>
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium truncate">
          <span style={{ color: "var(--accent-lilac-ink)" }}>{reasonLabel}</span>
          <span className="text-muted-foreground"> · </span>
          <span>{shapeLabel}</span>
        </div>
        <div className="text-[11px] text-muted-foreground">
          given {when}
          {giveaway.recipient ? ` · ${giveaway.recipient}` : ""}
          {!giveaway.fromStock ? " · off-stock" : ""}
        </div>
        {giveaway.note && (
          <div
            className="text-[11px] text-foreground/80 mt-0.5 line-clamp-2"
            title={giveaway.note}
          >
            “{giveaway.note}”
          </div>
        )}
      </div>
      <div className="font-mono text-xs tabular-nums shrink-0 text-muted-foreground">
        ~{symbol}
        {formatMoney(giveaway.ingredientCost)}
      </div>
    </li>
  );
}

function describeGiveAwayShape(
  giveaway: GiveAwayRecord,
  packagingById: Map<string, Packaging>,
): string {
  const { shape, pieceCount } = giveaway;
  if (shape.kind === "box") {
    const pkg = packagingById.get(shape.packagingId);
    return pkg?.name ? `${pkg.name}` : `Gift box of ${pieceCount}`;
  }
  if (shape.kind === "bar") {
    return `${pieceCount} bar${pieceCount === 1 ? "" : "s"}`;
  }
  if (shape.kind === "snack") {
    return `${pieceCount} snack bar${pieceCount === 1 ? "" : "s"}`;
  }
  return `${pieceCount} loose piece${pieceCount === 1 ? "" : "s"}`;
}

function GiveAwayBoxThumb({
  shape,
  packagingById,
  productInfoById,
}: {
  shape: Extract<GiveAwayRecord["shape"], { kind: "box" }>;
  packagingById: Map<string, Packaging>;
  productInfoById: Map<string, ShopProductInfo>;
}) {
  const pkg = packagingById.get(shape.packagingId);
  if (!pkg) return null;
  return (
    <CavityContentsPopover cells={shape.cells} productInfoById={productInfoById}>
      <CavityPreview
        cells={shape.cells}
        packaging={pkg}
        productInfoById={productInfoById}
        cellSize={14}
      />
    </CavityContentsPopover>
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
            <SaleQuantityStepper
              value={sellQty}
              max={group.count}
              disabled={sellBusy}
              onChange={setSellQty}
              testIdPrefix="shop-group-qty"
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
