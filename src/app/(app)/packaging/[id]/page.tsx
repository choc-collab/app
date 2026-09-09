"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  usePackaging, usePackagingOrders, useAllPackagingSuppliers,
  updatePackagingFields, deletePackaging, archivePackaging, unarchivePackaging,
  getPackagingCollectionNames, savePackagingOrder, deletePackagingOrder,
  setPackagingLowStock, setPackagingOutOfStock, markPackagingOrdered, useCurrencySymbol,
} from "@/lib/hooks";
import { db } from "@/lib/db";
import { ArrowLeft, Trash2, Plus, Archive, ArchiveRestore } from "lucide-react";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { StockStatusPanel } from "@/components/stock-status-panel";
import { DetailSkeleton, DetailNotFound } from "@/components/detail-states";
import {
  SidebarCard, PropertyRow, DerivedRow, PROPERTY_INPUT_CLASS, PROPERTY_NUMBER_CLASS,
} from "@/components/detail-sidebar";
import { useSpaId } from "@/lib/use-spa-id";
import type { Packaging, PackagingOrder, PackagingKind } from "@/types";

const PACKAGING_KIND_OPTIONS: ReadonlyArray<{ value: PackagingKind; label: string }> = [
  { value: "bonbon", label: "Bonbon box" },
  { value: "snack-bar", label: "Snack-bar pack" },
  { value: "bar", label: "Bar wrapper" },
];

function kindLabel(kind: PackagingKind | undefined): string {
  return PACKAGING_KIND_OPTIONS.find((o) => o.value === (kind ?? "bonbon"))?.label ?? "Box";
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date));
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PackagingDetailPage() {
  const packagingId = useSpaId("packaging");
  const router = useRouter();

  const sym = useCurrencySymbol();
  const pkg = usePackaging(packagingId);
  const orders = usePackagingOrders(packagingId);
  const allSuppliers = useAllPackagingSuppliers();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [usedByCollections, setUsedByCollections] = useState<string[] | null>(null);

  // Loading vs. not-found — `usePackaging`'s live query returns `undefined` both
  // while pending and when the row genuinely doesn't exist, so a one-shot direct
  // read resolves which one it actually is.
  const [status, setStatus] = useState<"loading" | "found" | "not-found">("loading");
  useEffect(() => {
    if (!packagingId) return;
    let cancelled = false;
    db.packaging.get(packagingId).then((p) => {
      if (!cancelled) setStatus(p ? "found" : "not-found");
    });
    return () => { cancelled = true; };
  }, [packagingId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirmDelete) setConfirmDelete(false);
      else if (confirmArchive) setConfirmArchive(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete, confirmArchive]);

  if (!packagingId || status === "loading" || (status === "found" && !pkg)) {
    return <DetailSkeleton cards={2} sidebar={3} label="Loading packaging" />;
  }
  if (status === "not-found" || !pkg) {
    return <DetailNotFound entity="packaging" backHref="/packaging" backLabel="Packaging" />;
  }

  const latestOrder = orders[0];
  const totalUnits = orders.reduce((sum, o) => sum + o.quantity, 0);
  const totalSpend = orders.reduce((sum, o) => sum + o.quantity * o.pricePerUnit, 0);
  const avgPerUnit = totalUnits > 0 ? totalSpend / totalUnits : null;

  const subtitle = [
    `${kindLabel(pkg.productKind)} · fits ${pkg.capacity}`,
    pkg.manufacturer,
    orders.length > 0 ? `${orders.length} order${orders.length !== 1 ? "s" : ""} logged` : null,
    latestOrder ? `${sym}${latestOrder.pricePerUnit.toFixed(2)}/unit latest` : null,
  ].filter(Boolean).join(" · ");

  async function openDeletePanel() {
    if (!packagingId) return;
    const names = await getPackagingCollectionNames(packagingId);
    setUsedByCollections(names);
    setConfirmDelete(true);
    setConfirmArchive(false);
  }

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <Link href="/packaging" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Packaging
        </Link>
      </div>

      {/* Header */}
      <div className="px-4 pb-5">
        <div className="flex items-center gap-2">
          <InlineNameEditor
            name={pkg.name}
            onSave={async (n) => { await updatePackagingFields(packagingId, { name: n }); }}
            className="text-xl font-bold"
          />
          <span className="rounded-full bg-accent text-accent-foreground px-2.5 py-0.5 text-[11px] font-medium shrink-0">
            {kindLabel(pkg.productKind)}
          </span>
          {pkg.archived && (
            <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[10px] font-medium flex items-center gap-1 shrink-0">
              <Archive className="w-3 h-3" /> Archived
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </div>

      <div className="px-4 pb-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        {/* ── Main column ── */}
        <div className="space-y-4 min-w-0">
          {/* Notes sit above the purchase history: the history grows without
              bound as orders are logged, and would otherwise push the notes
              off the bottom of the page. */}
          <NotesCard key={pkg.id} packagingId={packagingId} pkg={pkg} />

          <PurchaseHistoryCard
            packagingId={packagingId}
            orders={orders}
            suppliers={allSuppliers}
            sym={sym}
            totalUnits={totalUnits}
            totalSpend={totalSpend}
          />

          {/* ── Destructive actions ── */}
          <div className="pt-2 space-y-3">
            {pkg.archived ? (
              <button
                onClick={async () => { await unarchivePackaging(packagingId); }}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArchiveRestore className="w-4 h-4" /> Unarchive packaging
              </button>
            ) : confirmArchive ? (
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <p className="text-sm font-medium">Archive this packaging?</p>
                <p className="text-xs text-muted-foreground">
                  It stays available to any collection already using it, but is hidden from lists
                  and pickers.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => { await archivePackaging(packagingId); router.replace("/packaging"); }}
                    className="btn-primary px-4 py-2 text-sm"
                  >
                    Yes, archive packaging
                  </button>
                  <button onClick={() => setConfirmArchive(false)} className="btn-secondary px-4 py-2">Cancel</button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => { setConfirmArchive(true); setConfirmDelete(false); }}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <Archive className="w-4 h-4" /> Archive packaging
              </button>
            )}

            {confirmDelete ? (
              usedByCollections && usedByCollections.length > 0 ? (
                /* In use by collections — archive is the only way out */
                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
                    <p className="text-sm font-medium">Delete is blocked</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    In use by {usedByCollections.length} collection{usedByCollections.length !== 1 ? "s" : ""} —{" "}
                    {usedByCollections.join(", ")} — which would lose their box pricing.
                    Archiving hides it from lists while keeping that pricing intact.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => { await archivePackaging(packagingId); router.replace("/packaging"); }}
                      className="btn-primary px-4 py-2 text-sm"
                    >
                      Archive instead
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-4 py-2">Cancel</button>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                  <p className="text-sm font-medium text-destructive">Delete this packaging?</p>
                  <p className="text-xs text-muted-foreground">
                    Permanently removes the packaging and all {orders.length} logged purchase
                    order{orders.length !== 1 ? "s" : ""}. This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => { await deletePackaging(packagingId); router.replace("/packaging"); }}
                      className="inline-flex items-center justify-center rounded-full bg-destructive text-white px-4 py-2 text-sm font-medium transition-colors hover:bg-destructive/90"
                    >
                      Yes, delete packaging
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-4 py-2">Cancel</button>
                  </div>
                </div>
              )
            ) : (
              <button
                onClick={openDeletePanel}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Delete packaging
              </button>
            )}
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <SidebarCard title="Stock">
            <StockStatusPanel
              lowStock={pkg.lowStock}
              lowStockOrdered={pkg.lowStockOrdered}
              outOfStock={pkg.outOfStock}
              itemName={pkg.name}
              onFlagLowStock={() => setPackagingLowStock(packagingId, true)}
              onFlagOutOfStock={() => setPackagingOutOfStock(packagingId, true)}
              onMarkOrdered={() => markPackagingOrdered(packagingId)}
              onClearOutOfStock={() => setPackagingOutOfStock(packagingId, false)}
              onClearLowStock={() => setPackagingLowStock(packagingId, false)}
            />
          </SidebarCard>

          <PropertiesCard key={pkg.id} packagingId={packagingId} pkg={pkg} suppliers={allSuppliers} />

          <SidebarCard title="Derived" tinted className="space-y-2">
            <DerivedRow
              label="Latest per unit"
              value={latestOrder ? `${sym}${latestOrder.pricePerUnit.toFixed(2)}` : "—"}
            />
            <DerivedRow
              label="Average per unit"
              value={avgPerUnit != null ? `${sym}${avgPerUnit.toFixed(2)}` : "—"}
            />
            <DerivedRow label="Units ordered" value={totalUnits > 0 ? totalUnits.toLocaleString() : "—"} />
            <DerivedRow label="Orders logged" value={orders.length} />
            <DerivedRow
              label="Last ordered"
              value={latestOrder ? formatDate(latestOrder.orderedAt) : "—"}
            />
          </SidebarCard>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar: Properties ─────────────────────────────────────────────────────

function PropertiesCard({
  packagingId,
  pkg,
  suppliers,
}: {
  packagingId: string;
  pkg: Packaging;
  suppliers: string[];
}) {
  // Keyed by `pkg.id` at the call site, so local draft state resets only when
  // navigating to a different record — not on every autosave re-render.
  const [capacity, setCapacity] = useState(String(pkg.capacity));
  const [manufacturer, setManufacturer] = useState(pkg.manufacturer ?? "");

  const isBar = (pkg.productKind ?? "bonbon") === "bar";

  function commitCapacity() {
    const parsed = parseInt(capacity, 10);
    const next = !isNaN(parsed) && parsed > 0 ? parsed : 1;
    // Reflect the clamp back into the input so it can't sit showing a value the
    // record doesn't hold.
    if (String(next) !== capacity) setCapacity(String(next));
    if (next === pkg.capacity) return;
    updatePackagingFields(packagingId, { capacity: next }, "Capacity");
  }

  function commitManufacturer() {
    const trimmed = manufacturer.trim();
    if (trimmed === (pkg.manufacturer ?? "")) return;
    updatePackagingFields(packagingId, { manufacturer: trimmed || undefined }, "Manufacturer");
  }

  function commitKind(next: PackagingKind) {
    // A bar wrapper holds exactly one bar by definition, so picking it clamps
    // capacity in the same write rather than leaving an impossible pair behind.
    if (next === "bar") {
      setCapacity("1");
      updatePackagingFields(packagingId, { productKind: next, capacity: 1 }, "Kind");
    } else {
      updatePackagingFields(packagingId, { productKind: next }, "Kind");
    }
  }

  return (
    <SidebarCard title="Properties">
      <div className="space-y-1">
        <PropertyRow label="Kind">
          <select
            value={pkg.productKind ?? "bonbon"}
            onChange={(e) => commitKind(e.target.value as PackagingKind)}
            aria-label="Kind"
            className={PROPERTY_INPUT_CLASS}
          >
            {PACKAGING_KIND_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </PropertyRow>

        <PropertyRow label="Capacity">
          <input
            type="number"
            min="1"
            step="1"
            value={capacity}
            onChange={(e) => setCapacity(e.target.value)}
            onBlur={commitCapacity}
            disabled={isBar}
            aria-label="Capacity"
            title={isBar ? "Bar wrappers always hold a single bar." : undefined}
            className={`w-14 ${PROPERTY_NUMBER_CLASS} disabled:text-muted-foreground disabled:cursor-not-allowed`}
          />
        </PropertyRow>

        <PropertyRow label="Manufacturer">
          <input
            type="text"
            list="packaging-manufacturer-list"
            value={manufacturer}
            onChange={(e) => setManufacturer(e.target.value)}
            onBlur={commitManufacturer}
            placeholder="—"
            aria-label="Manufacturer"
            className={PROPERTY_INPUT_CLASS}
          />
          {suppliers.length > 0 && (
            <datalist id="packaging-manufacturer-list">
              {suppliers.map((s) => <option key={s} value={s} />)}
            </datalist>
          )}
        </PropertyRow>
      </div>
    </SidebarCard>
  );
}

// ─── Main: Notes ─────────────────────────────────────────────────────────────

function NotesCard({ packagingId, pkg }: { packagingId: string; pkg: Packaging }) {
  const [value, setValue] = useState(pkg.notes ?? "");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function commit(next: string) {
    const trimmed = next.trim();
    if (trimmed === (pkg.notes ?? "")) return;
    updatePackagingFields(packagingId, { notes: trimmed || undefined }, "Notes");
  }

  // Debounce so a long note isn't one write per keystroke, then flush on blur so
  // leaving the field can never lose the last few characters.
  function handleChange(next: string) {
    setValue(next);
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => commit(next), 600);
  }

  function handleBlur() {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    commit(value);
  }

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="px-4 py-3 border-b border-border">
        <h2 className="text-[13px] font-semibold">Notes</h2>
      </div>
      <div className="p-4">
        <textarea
          value={value}
          onChange={(e) => handleChange(e.target.value)}
          onBlur={handleBlur}
          placeholder="Anything worth remembering about this packaging…"
          rows={3}
          aria-label="Notes"
          className="w-full text-sm bg-transparent border-0 resize-none focus:outline-none placeholder:text-muted-foreground/60"
        />
      </div>
    </div>
  );
}

// ─── Main: Purchase history ──────────────────────────────────────────────────

const ORDER_GRID = "96px minmax(0,1fr) 78px 88px 84px 32px";

function PurchaseHistoryCard({
  packagingId,
  orders,
  suppliers,
  sym,
  totalUnits,
  totalSpend,
}: {
  packagingId: string;
  orders: PackagingOrder[];
  suppliers: string[];
  sym: string;
  totalUnits: number;
  totalSpend: number;
}) {
  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && pendingRemove) setPendingRemove(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pendingRemove]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold">Purchase history</h2>
        {orders.length > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {totalUnits.toLocaleString()} units · {sym}{totalSpend.toFixed(2)}
          </span>
        )}
      </div>

      {/* Column heads */}
      <div
        className="grid gap-3 px-4 py-2 bg-muted text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
        style={{ gridTemplateColumns: ORDER_GRID }}
      >
        <span>Date</span>
        <span>Supplier</span>
        <span className="text-right">Qty</span>
        <span className="text-right">Total</span>
        <span className="text-right">Per unit</span>
        <span aria-hidden="true" />
      </div>

      {orders.map((order) => (
        pendingRemove === order.id ? (
          <div
            key={order.id}
            className="px-4 py-2.5 border-b border-border bg-status-alert-bg flex items-center justify-between gap-3 flex-wrap"
          >
            <p className="text-xs text-status-alert">
              Remove the {formatDate(order.orderedAt)} order — {order.quantity.toLocaleString()} units,{" "}
              {sym}{(order.quantity * order.pricePerUnit).toFixed(2)}?
            </p>
            <span className="flex items-center gap-3 text-xs shrink-0">
              <button
                onClick={async () => { await deletePackagingOrder(order.id!); setPendingRemove(null); }}
                className="text-destructive font-medium underline underline-offset-2"
              >
                Yes, remove
              </button>
              <button
                onClick={() => setPendingRemove(null)}
                className="text-muted-foreground underline underline-offset-2"
              >
                Cancel
              </button>
            </span>
          </div>
        ) : (
          <div
            key={order.id}
            className="grid gap-3 px-4 py-2.5 border-b border-border items-baseline hover:bg-muted/40 transition-colors"
            style={{ gridTemplateColumns: ORDER_GRID }}
          >
            <span className="text-xs tabular-nums">{formatDate(order.orderedAt)}</span>
            <span className="text-xs min-w-0">
              <span className="block truncate">{order.supplier || "—"}</span>
              {order.notes && (
                <span className="block text-[11px] text-muted-foreground italic truncate">{order.notes}</span>
              )}
            </span>
            <span className="text-xs text-right tabular-nums">{order.quantity.toLocaleString()}</span>
            <span className="text-xs text-right tabular-nums">
              {sym}{(order.quantity * order.pricePerUnit).toFixed(2)}
            </span>
            <span className="text-xs text-right tabular-nums font-medium">
              {sym}{order.pricePerUnit.toFixed(2)}
            </span>
            <button
              onClick={() => setPendingRemove(order.id!)}
              aria-label={`Delete ${formatDate(order.orderedAt)} entry`}
              className="justify-self-end p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        )
      ))}

      <AddOrderRow packagingId={packagingId} suppliers={suppliers} sym={sym} />
    </div>
  );
}

/** The last row of the table is the add-entry row — entering a purchase is the
 *  page's primary action, so it lives where the next row would go rather than
 *  behind a disclosure. */
function AddOrderRow({
  packagingId,
  suppliers,
  sym,
}: {
  packagingId: string;
  suppliers: string[];
  sym: string;
}) {
  const [date, setDate] = useState(todayISO());
  const [supplier, setSupplier] = useState("");
  const [qty, setQty] = useState("");
  const [price, setPrice] = useState("");
  const [notes, setNotes] = useState("");

  const qtyNum = parseInt(qty, 10);
  const priceNum = parseFloat(price);
  const valid = !!date && !isNaN(qtyNum) && qtyNum > 0 && !isNaN(priceNum) && priceNum > 0;
  const total = valid ? qtyNum * priceNum : null;

  async function handleAdd() {
    if (!valid) return;
    await savePackagingOrder({
      packagingId,
      quantity: qtyNum,
      pricePerUnit: priceNum,
      supplier: supplier.trim() || undefined,
      orderedAt: new Date(date),
      notes: notes.trim() || undefined,
    });
    setQty("");
    setPrice("");
    setSupplier("");
    setNotes("");
    setDate(todayISO());
  }

  return (
    <div onKeyDown={(e) => { if (e.key === "Enter" && valid) handleAdd(); }}>
    <div
      className="grid gap-3 px-4 pt-2.5 items-center"
      style={{ gridTemplateColumns: ORDER_GRID }}
    >
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        aria-label="Purchase date"
        className="input !py-1 !px-2 text-xs"
      />
      <input
        type="text"
        list="packaging-supplier-list"
        value={supplier}
        onChange={(e) => setSupplier(e.target.value)}
        placeholder="Supplier"
        aria-label="Supplier"
        className="input !py-1 !px-2 text-xs min-w-0"
      />
      {suppliers.length > 0 && (
        <datalist id="packaging-supplier-list">
          {suppliers.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
      <input
        type="number"
        min="1"
        step="1"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        placeholder="Qty"
        aria-label="Quantity"
        className="input !py-1 !px-2 text-xs text-right"
      />
      <input
        type="number"
        min="0.01"
        step="0.01"
        value={price}
        onChange={(e) => setPrice(e.target.value)}
        placeholder="Per unit"
        aria-label={`Price per unit (${sym})`}
        className="input !py-1 !px-2 text-xs text-right"
      />
      <span className="text-xs text-right tabular-nums text-muted-foreground">
        {total != null ? `${sym}${total.toFixed(2)}` : "—"}
      </span>
      <button
        onClick={handleAdd}
        disabled={!valid}
        aria-label="Log purchase"
        className="justify-self-end w-6 h-6 rounded-md bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
      >
        <Plus className="w-3.5 h-3.5" />
      </button>
    </div>
    {/* Order notes sit on their own line — they're free text and would squeeze
        every other column if they shared the grid row. */}
    <div className="px-4 pt-1.5 pb-2.5">
      <input
        type="text"
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Notes for this order (optional)"
        aria-label="Order notes"
        className="input !py-1 !px-2 text-xs w-full"
      />
    </div>
    </div>
  );
}
