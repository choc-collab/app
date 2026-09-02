"use client";

import { useState, useCallback, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useOrder, saveOrder, deleteOrder,
  useCustomers, useCustomer, saveCustomer,
  useOrderProductionLinks, useProductionPlans, linkOrderToPlan, unlinkOrderFromPlan,
} from "@/lib/hooks";
import { useSpaId } from "@/lib/use-spa-id";
import { useNavigationGuard } from "@/lib/useNavigationGuard";
import {
  formatISODate,
  relativeToToday,
  toISODate,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_STYLE,
} from "@/lib/orders";
import { PLAN_STATUS_LABEL, PLAN_STATUS_STYLE } from "@/lib/production";
import { ORDER_SOURCES } from "@/types";
import type { OrderStatus, OrderSource } from "@/types";
import { ArrowLeft, Pencil, Trash2, CalendarDays, MapPin, User, Factory, X } from "lucide-react";

/** Sentinel value in the customer select that reveals the quick-create input. */
const NEW_CUSTOMER = "__new__";

/** Lifecycle pills shown in read mode, in workflow order. Cancelled is kept
 *  last and visually demoted — it's an exit, not a stage. */
const LIFECYCLE: OrderStatus[] = ["lead", "confirmed", "in_production", "fulfilled", "cancelled"];

export default function OrderDetailPage() {
  return (
    <Suspense fallback={null}>
      <OrderDetailPageInner />
    </Suspense>
  );
}

function OrderDetailPageInner() {
  const orderId = useSpaId("orders");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";
  const order = useOrder(orderId);

  const [editing, setEditing] = useState(isNew);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [syncedId, setSyncedId] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [newCustomerName, setNewCustomerName] = useState("");
  const [venue, setVenue] = useState("");
  const [source, setSource] = useState<OrderSource | "">("");
  const [notes, setNotes] = useState("");

  const customers = useCustomers();
  const assignedCustomer = useCustomer(order?.customerId);
  // Non-archived customers, plus the currently-assigned one even if archived —
  // so editing an order doesn't silently drop an archived customer.
  const pickerCustomers = useMemo(() => {
    if (assignedCustomer?.archived && assignedCustomer.id) {
      return [...customers, assignedCustomer].sort((a, b) => a.name.localeCompare(b.name));
    }
    return customers;
  }, [customers, assignedCustomer]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirmDelete) setConfirmDelete(false);
      else if (editing) handleCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync form state when the order loads (also for new orders, which start in edit mode)
  if (order && order.id && order.id !== syncedId && (!editing || isNew)) {
    setTitle(order.title);
    setEventDate(order.eventDate);
    setCustomerId(order.customerId || "");
    setVenue(order.venue || "");
    setSource(order.source || "");
    setNotes(order.notes || "");
    setSyncedId(order.id);
  }

  const formDirty = editing && order != null && (
    title !== order.title ||
    eventDate !== order.eventDate ||
    customerId !== (order.customerId || "") ||
    venue !== (order.venue || "") ||
    source !== (order.source || "") ||
    notes !== (order.notes || "")
  );
  const isDirty = (isNew && !savedOnce) || formDirty;

  const handleConfirmLeave = useCallback(async () => {
    if (isNew && order?.id) {
      await deleteOrder(order.id);
    }
  }, [isNew, order?.id]);

  const { safeBack } = useNavigationGuard(isDirty, isNew ? handleConfirmLeave : undefined);

  if (!orderId || !order) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  async function handleSave() {
    if (!orderId || !title.trim() || !eventDate) return;
    let resolvedCustomerId: string | undefined = customerId || undefined;
    if (customerId === NEW_CUSTOMER) {
      const name = newCustomerName.trim();
      if (!name) return;
      resolvedCustomerId = await saveCustomer({ name });
    }
    await saveOrder({
      ...order!,
      title: title.trim(),
      eventDate,
      customerId: resolvedCustomerId,
      venue: venue.trim() || undefined,
      source: source || undefined,
      notes: notes.trim() || undefined,
    });
    setNewCustomerName("");
    setEditing(false);
    setSavedOnce(true);
    if (isNew) router.replace(`/orders/${encodeURIComponent(orderId)}`);
  }

  function handleCancel() {
    setTitle(order!.title);
    setEventDate(order!.eventDate);
    setCustomerId(order!.customerId || "");
    setNewCustomerName("");
    setVenue(order!.venue || "");
    setSource(order!.source || "");
    setNotes(order!.notes || "");
    setEditing(false);
    if (isNew && orderId) router.replace(`/orders/${encodeURIComponent(orderId)}`);
  }

  async function handleStatusChange(status: OrderStatus) {
    if (status === order!.status) return;
    await saveOrder({ ...order!, status });
  }

  const todayISO = toISODate(new Date());
  const sourceLabel = ORDER_SOURCES.find((s) => s.value === order.source)?.label;

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <button
          onClick={() => safeBack()}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3"
        >
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Back
        </button>
      </div>

      <div className="px-4 pb-6 space-y-4 max-w-2xl">
        {editing ? (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <label className="label" htmlFor="order-title">Title</label>
              <input
                id="order-title"
                className="input w-full"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Popup in Wittelte"
                autoFocus
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="order-date">Event date</label>
              <input
                id="order-date"
                type="date"
                className="input w-full"
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="order-customer">Customer</label>
                <select
                  id="order-customer"
                  className="input w-full"
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  <option value="">—</option>
                  {pickerCustomers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.archived ? " (archived)" : ""}
                    </option>
                  ))}
                  <option value={NEW_CUSTOMER}>+ New customer…</option>
                </select>
                {customerId === NEW_CUSTOMER && (
                  <input
                    className="input w-full mt-2"
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    placeholder="Customer name…"
                    aria-label="New customer name"
                    autoFocus
                  />
                )}
              </div>
              <div>
                <label className="label" htmlFor="order-venue">Venue / location</label>
                <input
                  id="order-venue"
                  className="input w-full"
                  value={venue}
                  onChange={(e) => setVenue(e.target.value)}
                  placeholder="Where is it happening?"
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="order-source">Type</label>
              <select
                id="order-source"
                className="input w-full"
                value={source}
                onChange={(e) => setSource(e.target.value as OrderSource | "")}
              >
                <option value="">—</option>
                {ORDER_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="order-notes">Notes</label>
              <textarea
                id="order-notes"
                className="input w-full min-h-24"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder='The vague early details live here — "40 bonbons, mix TBD, wants a nut-free option…"'
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={!title.trim() || !eventDate || (customerId === NEW_CUSTOMER && !newCustomerName.trim())}
                className="btn-primary flex-1 py-2"
              >
                Save
              </button>
              <button onClick={handleCancel} className="btn-secondary px-4 py-2">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-xl font-bold truncate">{order.title}</h1>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${ORDER_STATUS_STYLE[order.status]}`}>
                  {ORDER_STATUS_LABEL[order.status]}
                </span>
              </div>
              <button
                onClick={() => setEditing(true)}
                aria-label="Edit order"
                className="p-2 rounded-full hover:bg-muted transition-colors shrink-0"
              >
                <Pencil className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            <div className="rounded-lg border border-border bg-card p-4 space-y-2.5">
              <div className="flex items-center gap-2 text-sm">
                <CalendarDays className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
                <span className="font-medium tabular-nums">{formatISODate(order.eventDate)}</span>
                <span className="text-muted-foreground">({relativeToToday(order.eventDate, todayISO)})</span>
              </div>
              {assignedCustomer && (
                <div className="flex items-center gap-2 text-sm">
                  <User className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
                  <Link
                    href={`/orders/customers/${encodeURIComponent(assignedCustomer.id!)}`}
                    className="hover:underline"
                  >
                    {assignedCustomer.name}
                  </Link>
                  {assignedCustomer.archived && (
                    <span className="text-xs text-muted-foreground">(archived)</span>
                  )}
                </div>
              )}
              {order.venue && (
                <div className="flex items-center gap-2 text-sm">
                  <MapPin className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
                  <span>{order.venue}</span>
                </div>
              )}
              {sourceLabel && (
                <div className="text-xs text-muted-foreground">{sourceLabel}</div>
              )}
            </div>

            {order.notes && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mono-label text-muted-foreground mb-1.5">Notes</div>
                <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
              </div>
            )}

            <LinkedBatchesSection orderId={orderId} />

            {/* One-tap lifecycle advance without entering edit mode */}
            <div>
              <div className="mono-label text-muted-foreground mb-1.5">Status</div>
              <div className="flex flex-wrap gap-1.5">
                {LIFECYCLE.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleStatusChange(s)}
                    aria-pressed={order.status === s}
                    className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      order.status === s
                        ? `${ORDER_STATUS_STYLE[s]} ring-1 ring-inset ring-current`
                        : "bg-muted text-muted-foreground hover:bg-muted/80"
                    }`}
                  >
                    {ORDER_STATUS_LABEL[s]}
                  </button>
                ))}
              </div>
            </div>

            {/* Two-step delete */}
            <div className="pt-4 border-t border-border">
              {confirmDelete ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                  <p className="text-sm font-medium text-destructive">Delete this order?</p>
                  <p className="text-xs text-muted-foreground">
                    This permanently removes the order. This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        await deleteOrder(orderId);
                        router.replace("/orders");
                      }}
                      className="inline-flex items-center justify-center rounded-full bg-destructive text-white px-4 py-2 text-sm font-medium transition-colors hover:bg-destructive/90"
                    >
                      Yes, delete order
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-4 py-2">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Delete order
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/** Read-view section tying the order to the production batches that fulfil
 *  it. Rows link to the batch's board page; unlinking is a two-step inline
 *  confirm (standing rule for removal actions). */
function LinkedBatchesSection({ orderId }: { orderId: string }) {
  const links = useOrderProductionLinks(orderId);
  const plans = useProductionPlans(); // newest first
  const [selectedPlanId, setSelectedPlanId] = useState("");
  const [confirmUnlinkId, setConfirmUnlinkId] = useState<string | null>(null);

  const planById = useMemo(() => {
    const m = new Map<string, (typeof plans)[number]>();
    for (const p of plans) if (p.id) m.set(p.id, p);
    return m;
  }, [plans]);

  const linkedPlanIds = useMemo(() => new Set(links.map((l) => l.planId)), [links]);
  const linkablePlans = useMemo(
    () => plans.filter((p) => p.id && !linkedPlanIds.has(p.id)),
    [plans, linkedPlanIds],
  );

  async function handleLink() {
    if (!selectedPlanId) return;
    await linkOrderToPlan(orderId, selectedPlanId);
    setSelectedPlanId("");
  }

  return (
    <div>
      <div className="mono-label text-muted-foreground mb-1.5">Linked batches</div>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        {links.length === 0 && (
          <p className="text-xs text-muted-foreground">
            No batches linked yet — link the production batches you&apos;re making for this order.
          </p>
        )}

        {links.length > 0 && (
          <ul className="space-y-1.5">
            {links.map((link) => {
              const plan = planById.get(link.planId);
              if (!plan) return null; // plan deleted; cleanup removes the link
              return (
                <li key={link.id} className="flex items-center gap-2">
                  <Factory className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
                  <Link
                    href={`/production/${encodeURIComponent(link.planId)}`}
                    className="flex-1 min-w-0 text-sm font-medium truncate hover:underline"
                  >
                    {plan.name}
                    {plan.batchNumber && (
                      <span className="ml-2 font-mono text-[10px] text-muted-foreground font-normal">
                        {plan.batchNumber}
                      </span>
                    )}
                  </Link>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium shrink-0 ${PLAN_STATUS_STYLE[plan.status]}`}>
                    {PLAN_STATUS_LABEL[plan.status]}
                  </span>
                  {confirmUnlinkId === link.id ? (
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-destructive">Remove?</span>
                      <button
                        onClick={async () => {
                          await unlinkOrderFromPlan(link.id!);
                          setConfirmUnlinkId(null);
                        }}
                        className="text-xs font-medium text-destructive hover:underline"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmUnlinkId(null)}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmUnlinkId(link.id!)}
                      aria-label={`Unlink ${plan.name}`}
                      title="Unlink batch"
                      className="p-1 rounded-full hover:bg-muted transition-colors shrink-0"
                    >
                      <X className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {linkablePlans.length > 0 && (
          <div className="flex gap-2 pt-1">
            <select
              className="input flex-1"
              value={selectedPlanId}
              onChange={(e) => setSelectedPlanId(e.target.value)}
              aria-label="Link a batch"
            >
              <option value="">Link a batch…</option>
              {linkablePlans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.batchNumber ? ` (${p.batchNumber})` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={handleLink}
              disabled={!selectedPlanId}
              className="btn-secondary px-4 py-2"
            >
              Link
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
