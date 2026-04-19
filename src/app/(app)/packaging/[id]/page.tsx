"use client";

import { useState, use, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  usePackaging, usePackagingOrders, useAllPackagingSuppliers,
  savePackaging, deletePackaging, archivePackaging, unarchivePackaging, isPackagingInUse,
  savePackagingOrder, deletePackagingOrder,
  setPackagingLowStock, setPackagingOutOfStock, markPackagingOrdered, useCurrencySymbol,
} from "@/lib/hooks";
import { ArrowLeft, Pencil, Trash2, Plus, Package, Archive, ArchiveRestore } from "lucide-react";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { StockStatusPanel } from "@/components/stock-status-panel";
import { useNavigationGuard } from "@/lib/useNavigationGuard";

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(date));
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function PackagingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: _packagingId } = use(params);
  const packagingId = decodeURIComponent(_packagingId);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";

  const sym = useCurrencySymbol();
  const pkg = usePackaging(packagingId);
  const orders = usePackagingOrders(packagingId);
  const allSuppliers = useAllPackagingSuppliers();

  const [editing, setEditing] = useState(isNew);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inUse, setInUse] = useState<boolean | null>(null);
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [deletingOrderId, setDeletingOrderId] = useState<string | null>(null);

  // Edit form state
  const [capacity, setCapacity] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [notes, setNotes] = useState("");

  // Order form state
  const [orderDate, setOrderDate] = useState(todayISO());
  const [orderQty, setOrderQty] = useState("");
  const [orderPrice, setOrderPrice] = useState("");
  const [orderSupplier, setOrderSupplier] = useState("");
  const [orderNotes, setOrderNotes] = useState("");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirmDelete) setConfirmDelete(false);
      else if (deletingOrderId) setDeletingOrderId(null);
      else if (showOrderForm) setShowOrderForm(false);
      else if (editing) setEditing(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete, deletingOrderId, showOrderForm, editing]);

  // Sync edit form when pkg loads
  if (pkg && (!editing || isNew) && capacity === "" && pkg.name) {
    setCapacity(String(pkg.capacity));
    setManufacturer(pkg.manufacturer ?? "");
    setNotes(pkg.notes ?? "");
  }

  const [savedOnce, setSavedOnce] = useState(false);
  const formDirty = editing && pkg != null && (
    capacity !== String(pkg.capacity) ||
    manufacturer !== (pkg.manufacturer ?? "") ||
    notes !== (pkg.notes ?? "")
  );
  const isDirty = (isNew && !savedOnce) || formDirty;

  const handleConfirmLeave = useCallback(async () => {
    if (isNew) await deletePackaging(packagingId);
  }, [isNew, packagingId]);

  const { safeBack } = useNavigationGuard(isDirty, isNew ? handleConfirmLeave : undefined);

  if (!pkg) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  function startEditing() {
    setCapacity(String(pkg!.capacity));
    setManufacturer(pkg!.manufacturer ?? "");
    setNotes(pkg!.notes ?? "");
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
    if (isNew) router.replace(`/packaging/${encodeURIComponent(packagingId)}`);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    const cap = parseInt(capacity) || 1;
    await savePackaging({
      id: packagingId,
      name: pkg!.name,
      capacity: cap,
      manufacturer: manufacturer.trim() || undefined,
      notes: notes.trim() || undefined,
      createdAt: pkg!.createdAt,
      updatedAt: new Date(),
    });
    setSavedOnce(true);
    setEditing(false);
    if (isNew) {
      router.replace(`/packaging/${encodeURIComponent(packagingId)}`);
      // Auto-open order form so user can immediately log a price
      setShowOrderForm(true);
    }
  }

  async function handleLogOrder(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseInt(orderQty);
    const price = parseFloat(orderPrice);
    if (!qty || !price || !orderDate) return;
    await savePackagingOrder({
      packagingId,
      quantity: qty,
      pricePerUnit: price,
      supplier: orderSupplier.trim() || undefined,
      orderedAt: new Date(orderDate),
      notes: orderNotes.trim() || undefined,
    });
    setOrderQty("");
    setOrderPrice("");
    setOrderSupplier("");
    setOrderNotes("");
    setOrderDate(todayISO());
    setShowOrderForm(false);
  }

  const latestOrder = orders[0];

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <button onClick={() => safeBack()} className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      <div className="px-4 pb-6 space-y-6">
        {/* Name row — always visible */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-start gap-3">
            <div className="w-12 h-12 rounded-lg bg-muted shrink-0 flex items-center justify-center text-muted-foreground mt-0.5">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <InlineNameEditor
                  name={pkg.name}
                  onSave={async (n) => { await savePackaging({ ...pkg, name: n, updatedAt: new Date() }); }}
                  className="text-xl font-bold"
                />
                {pkg.archived && (
                  <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[10px] font-medium flex items-center gap-1 shrink-0">
                    <Archive className="w-3 h-3" /> Archived
                  </span>
                )}
              </div>
              {!editing && (
                <>
                  <p className="text-sm text-muted-foreground mt-0.5">
                    fits {pkg.capacity} product{pkg.capacity !== 1 ? "s" : ""}
                  </p>
                  {pkg.manufacturer && (
                    <p className="text-sm text-muted-foreground">{pkg.manufacturer}</p>
                  )}
                  {latestOrder && (
                    <p className="text-sm font-medium text-primary mt-1">
                      {sym}{latestOrder.pricePerUnit.toFixed(2)}/unit
                      <span className="text-xs text-muted-foreground font-normal ml-1">(latest)</span>
                    </p>
                  )}
                </>
              )}
            </div>
          </div>
          {!editing && (
            <button
              onClick={startEditing}
              className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0"
              aria-label="Edit packaging"
            >
              <Pencil className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Stock status — hidden while editing */}
        {!editing && (
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
        )}

        {editing ? (
          /* ── Edit form (excludes name — handled by InlineNameEditor) ── */
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="label">Product capacity *</label>
              <input
                type="number"
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
                placeholder="e.g. 9"
                min="1"
                step="1"
                required
                autoFocus={isNew}
                className="input"
              />
              <p className="text-xs text-muted-foreground mt-0.5">How many products fit in this packaging</p>
            </div>
            <div>
              <label className="label">Manufacturer / Brand</label>
              <input
                type="text"
                list="manufacturer-list"
                value={manufacturer}
                onChange={(e) => setManufacturer(e.target.value)}
                placeholder="e.g. Keylink"
                className="input"
              />
              {allSuppliers.length > 0 && (
                <datalist id="manufacturer-list">
                  {allSuppliers.map((s) => <option key={s} value={s} />)}
                </datalist>
              )}
            </div>
            <div>
              <label className="label">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes…"
                rows={2}
                className="input resize-none"
              />
            </div>
            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1 py-2">Save</button>
              <button type="button" onClick={handleCancel} className="btn-secondary px-4 py-2">Cancel</button>
            </div>
          </form>
        ) : (
          <>
            {pkg.notes && (
              <p className="text-sm text-muted-foreground italic">{pkg.notes}</p>
            )}
          </>
        )}

        {/* Order history — always visible */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-primary">Purchase History</h2>
            {!showOrderForm && !editing && (
              <button
                onClick={() => setShowOrderForm(true)}
                className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
              >
                <Plus className="w-3.5 h-3.5" /> Log purchase
              </button>
            )}
          </div>

          {showOrderForm && (
            <form onSubmit={handleLogOrder} className="rounded-lg border border-border bg-card p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Date *</label>
                  <input
                    type="date"
                    value={orderDate}
                    onChange={(e) => setOrderDate(e.target.value)}
                    required
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Quantity *</label>
                  <input
                    type="number"
                    value={orderQty}
                    onChange={(e) => setOrderQty(e.target.value)}
                    placeholder="e.g. 1500"
                    min="1"
                    step="1"
                    required
                    autoFocus
                    className="input"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label">Price per unit ({sym}) *</label>
                  <input
                    type="number"
                    value={orderPrice}
                    onChange={(e) => setOrderPrice(e.target.value)}
                    placeholder="e.g. 1.99"
                    min="0.01"
                    step="0.01"
                    required
                    className="input"
                  />
                </div>
                <div>
                  <label className="label">Supplier</label>
                  <input
                    type="text"
                    list="supplier-list"
                    value={orderSupplier}
                    onChange={(e) => setOrderSupplier(e.target.value)}
                    placeholder="e.g. Keylink"
                    className="input"
                  />
                  {allSuppliers.length > 0 && (
                    <datalist id="supplier-list">
                      {allSuppliers.map((s) => <option key={s} value={s} />)}
                    </datalist>
                  )}
                </div>
              </div>
              {orderQty && orderPrice && !isNaN(parseInt(orderQty)) && !isNaN(parseFloat(orderPrice)) && (
                <p className="text-xs text-muted-foreground">
                  Total: {sym}{(parseInt(orderQty) * parseFloat(orderPrice)).toFixed(2)}
                </p>
              )}
              <div>
                <label className="label">Notes</label>
                <input
                  type="text"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  placeholder="Optional…"
                  className="input"
                />
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={!orderQty || !orderPrice || !orderDate}
                  className="btn-primary flex-1 py-2"
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={() => setShowOrderForm(false)}
                  className="btn-secondary px-4 py-2"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}

          {orders.length === 0 && !showOrderForm ? (
            <button
              onClick={() => setShowOrderForm(true)}
              disabled={editing}
              className="w-full rounded-full border border-dashed border-border py-4 text-sm text-muted-foreground hover:border-primary/40 hover:text-foreground transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Plus className="w-4 h-4 inline mr-1.5 -mt-0.5" />
              Log first purchase
            </button>
          ) : (
            <ul className="space-y-2">
              {orders.map((order) => (
                <li key={order.id} className="rounded-lg border border-border bg-card">
                  {deletingOrderId === order.id ? (
                    <div className="p-3 space-y-2">
                      <p className="text-sm font-medium text-destructive">Delete this entry?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={async () => {
                            await deletePackagingOrder(order.id!);
                            setDeletingOrderId(null);
                          }}
                          className="inline-flex items-center justify-center rounded-full bg-destructive text-white px-3 py-1.5 text-xs font-medium transition-colors hover:bg-destructive/90"
                        >
                          Yes, delete
                        </button>
                        <button
                          onClick={() => setDeletingOrderId(null)}
                          className="btn-secondary px-3 py-1.5 text-xs"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3 p-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-medium">{order.quantity.toLocaleString()} units</span>
                          <span className="text-xs text-muted-foreground">@ {sym}{order.pricePerUnit.toFixed(2)}/unit</span>
                          <span className="text-xs font-medium text-primary">
                            = {sym}{(order.quantity * order.pricePerUnit).toFixed(2)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                          <span className="text-xs text-muted-foreground">{formatDate(order.orderedAt)}</span>
                          {order.supplier && (
                            <>
                              <span className="text-muted-foreground/40 text-xs">·</span>
                              <span className="text-xs text-muted-foreground">{order.supplier}</span>
                            </>
                          )}
                        </div>
                        {order.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5 italic">{order.notes}</p>
                        )}
                      </div>
                      <button
                        onClick={() => setDeletingOrderId(order.id!)}
                        className="p-1 rounded hover:bg-muted transition-colors shrink-0 text-muted-foreground hover:text-destructive"
                        aria-label="Delete entry"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {!editing && (
        <div className="px-4 pb-8 border-t border-border pt-4 space-y-4">
          {pkg.archived && (
            <button
              onClick={async () => { await unarchivePackaging(packagingId); }}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArchiveRestore className="w-4 h-4" /> Unarchive packaging
            </button>
          )}
          {confirmDelete ? (
            inUse ? (
              /* In use by collections — archive only */
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium">Archive this packaging?</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  This packaging is referenced by one or more collections and cannot be deleted.
                  Archiving will hide it from lists but preserve it for existing collections.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      await archivePackaging(packagingId);
                      router.replace("/packaging");
                    }}
                    className="btn-primary px-4 py-2 text-sm"
                  >
                    Yes, archive packaging
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-4 py-2">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Not in use — allow full delete */
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                <p className="text-sm font-medium text-destructive">Delete this packaging?</p>
                <p className="text-xs text-muted-foreground">
                  This will permanently remove the packaging and all {orders.length} purchase{orders.length !== 1 ? "s" : ""} logged for it. This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      await deletePackaging(packagingId);
                      router.replace("/packaging");
                    }}
                    className="inline-flex items-center justify-center rounded-full bg-destructive text-white px-4 py-2 text-sm font-medium transition-colors hover:bg-destructive/90"
                  >
                    Yes, delete packaging
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-4 py-2">
                    Cancel
                  </button>
                </div>
              </div>
            )
          ) : (
            <button
              onClick={async () => {
                const used = await isPackagingInUse(packagingId);
                setInUse(used);
                setConfirmDelete(true);
              }}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
            >
              <Trash2 className="w-4 h-4" /> Delete packaging
            </button>
          )}
        </div>
      )}
    </div>
  );
}
