"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useOrder, updateOrderFields, deleteOrder,
  useCustomers, useCustomer, saveCustomer, useOrderVenues,
  useOrderLineItems, useOrderProductionLinks, useProductionPlans,
} from "@/lib/hooks";
import { db } from "@/lib/db";
import { useSpaId } from "@/lib/use-spa-id";
import {
  formatEventDates,
  eventRelative,
  orderEndDate,
  isMultiDay,
  isPickupVenue,
  PICKUP_VENUE,
  toISODate,
  orderProgress,
  formatPieces,
  groupLinksByPlan,
  ORDER_STATUS_LABEL,
  ORDER_STATUS_STYLE,
} from "@/lib/orders";
import { LineItemsSection } from "@/components/orders/line-items-section";
import { LinkedBatchesSection } from "@/components/orders/linked-batches-section";
import { OrderProgressBar } from "@/components/orders/order-progress-bar";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { DetailSkeleton, DetailNotFound } from "@/components/detail-states";
import { SidebarCard, PropertyRow, DerivedRow, PROPERTY_INPUT_CLASS } from "@/components/detail-sidebar";
import { ORDER_SOURCES } from "@/types";
import type { Order, OrderStatus, OrderSource, Customer } from "@/types";
import { ArrowLeft, Trash2, Store } from "lucide-react";

/** Sentinel value in the customer select that reveals the quick-create input. */
const NEW_CUSTOMER = "__new__";

/** Lifecycle pills, in workflow order. Cancelled is kept last and visually
 *  demoted — it's an exit, not a stage. */
const LIFECYCLE: OrderStatus[] = ["lead", "confirmed", "in_production", "fulfilled", "cancelled"];

/**
 * Order detail — always editable, autosaving, no edit mode.
 *
 * Main column: notes, line items, linked batches, then the delete row.
 * Sidebar: the one-tap status pills, the order's properties (date, customer,
 * venue, type) and a Production card that tells you how far along it is.
 */
export default function OrderDetailPage() {
  const orderId = useSpaId("orders");
  const router = useRouter();
  const order = useOrder(orderId);
  const assignedCustomer = useCustomer(order?.customerId);
  const lineItems = useOrderLineItems(orderId);
  const links = useOrderProductionLinks(orderId);
  const plans = useProductionPlans();

  const [confirmDelete, setConfirmDelete] = useState(false);

  // Loading vs. not-found — `useOrder`'s live query returns `undefined` both
  // while pending and when the row genuinely doesn't exist, so a one-shot
  // direct read resolves which one it actually is.
  const [status, setStatus] = useState<"loading" | "found" | "not-found">("loading");
  useEffect(() => {
    if (!orderId) return;
    let cancelled = false;
    db.orders.get(orderId).then((o) => {
      if (!cancelled) setStatus(o ? "found" : "not-found");
    });
    return () => { cancelled = true; };
  }, [orderId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && confirmDelete) setConfirmDelete(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete]);

  const planStatusById = useMemo(() => {
    const m = new Map<string, "draft" | "active" | "done">();
    for (const p of plans) if (p.id) m.set(p.id, p.status);
    return m;
  }, [plans]);
  const progress = useMemo(() => orderProgress(lineItems, links, planStatusById), [lineItems, links, planStatusById]);
  const batchCount = useMemo(() => groupLinksByPlan(links).size, [links]);

  // Date only for the relative read-out — computed once per mount, not per
  // render, so the pre-rendered shell and the client agree.
  const [todayISO] = useState(() => toISODate(new Date()));

  if (!orderId || status === "loading" || (status === "found" && !order)) {
    return <DetailSkeleton cards={3} sidebar={3} label="Loading order" />;
  }
  if (status === "not-found" || !order) {
    return <DetailNotFound entity="order" backHref="/orders?tab=orders" backLabel="Orders" />;
  }

  const sourceLabel = ORDER_SOURCES.find((s) => s.value === order.source)?.label;
  const subtitleFacts = [
    `${formatEventDates(order)} · ${eventRelative(order, todayISO)}`,
    isPickupVenue(order.venue) ? PICKUP_VENUE : order.venue,
    sourceLabel,
    lineItems.length > 0 ? `${formatPieces(progress.needed)} pieces` : null,
  ].filter(Boolean);

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <Link
          href="/orders?tab=orders"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Orders
        </Link>
      </div>

      {/* Header */}
      <div className="px-4 pb-5">
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <InlineNameEditor
            name={order.title}
            onSave={async (n) => { await updateOrderFields(orderId, { title: n }, "Title"); }}
            className="text-xl font-bold"
          />
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium shrink-0 ${ORDER_STATUS_STYLE[order.status]}`}>
            {ORDER_STATUS_LABEL[order.status]}
          </span>
        </div>
        <p className="text-sm text-muted-foreground mt-1">
          {subtitleFacts[0]}
          {assignedCustomer && (
            <>
              {" · "}
              <Link
                href={`/orders/customers/${encodeURIComponent(assignedCustomer.id!)}`}
                className="hover:underline text-foreground"
              >
                {assignedCustomer.name}
              </Link>
              {assignedCustomer.archived && <span className="text-xs"> (archived)</span>}
            </>
          )}
          {subtitleFacts.slice(1).map((f) => ` · ${f}`).join("")}
        </p>
      </div>

      <div className="px-4 pb-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        {/* ── Main column ── */}
        <div className="space-y-4 min-w-0">
          {/* Notes first: early on they hold everything you know ("40 bonbons,
              mix TBD"), and the two lists below grow as the order firms up. */}
          <NotesCard key={order.id} orderId={orderId} order={order} />

          <LineItemsSection orderId={orderId} />

          <LinkedBatchesSection orderId={orderId} />

          {/* ── Destructive actions ── */}
          <div className="pt-2">
            {confirmDelete ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                <p className="text-sm font-medium text-destructive">Delete this order?</p>
                <p className="text-xs text-muted-foreground">
                  Permanently removes the order, its {lineItems.length} line {lineItems.length === 1 ? "item" : "items"} and
                  its {batchCount} batch {batchCount === 1 ? "link" : "links"}. The batches themselves are untouched.
                  This cannot be undone.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      await deleteOrder(orderId);
                      router.replace("/orders?tab=orders");
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
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <SidebarCard title="Status">
            <div className="flex flex-wrap gap-1.5">
              {LIFECYCLE.map((s) => (
                <button
                  key={s}
                  onClick={() => { if (s !== order.status) updateOrderFields(orderId, { status: s }, "Status"); }}
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
          </SidebarCard>

          <PropertiesCard key={order.id} orderId={orderId} order={order} assignedCustomer={assignedCustomer} />

          <SidebarCard title="Production" tinted className="space-y-2">
            {progress.needed > 0 ? (
              <>
                <OrderProgressBar progress={progress} />
                <div className="space-y-1.5 pt-1">
                  <DerivedRow label="Pieces needed" value={formatPieces(progress.needed)} />
                  <DerivedRow label="Made" value={formatPieces(progress.made)} />
                  <DerivedRow label="In production" value={progress.planned > 0 ? formatPieces(progress.planned) : "—"} />
                  <DerivedRow label="Still to make" value={formatPieces(Math.max(0, progress.needed - progress.made))} />
                </div>
              </>
            ) : (
              <p className="text-xs text-muted-foreground">
                Add line items to see how many pieces this order needs and how many are made.
              </p>
            )}
            <div className="space-y-1.5 pt-1 border-t border-border/60">
              <DerivedRow label="Line items" value={lineItems.length} />
              <DerivedRow label="Batches linked" value={batchCount} />
            </div>
          </SidebarCard>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar: Properties ─────────────────────────────────────────────────────

function PropertiesCard({
  orderId,
  order,
  assignedCustomer,
}: {
  orderId: string;
  order: Order;
  assignedCustomer: Customer | undefined;
}) {
  const customers = useCustomers();
  // Venues already used on other orders, for autocomplete — the same few
  // markets and shops come back every season. Pick-up is always offered.
  const venueOptions = useOrderVenues();
  // Non-archived customers, plus the currently-assigned one even if archived —
  // so the picker never shows a value the order doesn't hold.
  const pickerCustomers = useMemo(() => {
    if (assignedCustomer?.archived && assignedCustomer.id) {
      return [...customers, assignedCustomer].sort((a, b) => a.name.localeCompare(b.name));
    }
    return customers;
  }, [customers, assignedCustomer]);

  // Keyed by `order.id` at the call site, so drafts reset only when navigating
  // to a different record — not on every autosave re-render.
  const [eventDate, setEventDate] = useState(order.eventDate);
  const [endDate, setEndDate] = useState(isMultiDay(order) ? orderEndDate(order) : "");
  const [venue, setVenue] = useState(order.venue ?? "");
  const [creatingCustomer, setCreatingCustomer] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");

  const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

  function commitEventDate(next: string) {
    // A date input reports "" while a segment is being retyped; only a full
    // ISO date is a real value. Blur reverts a still-empty field.
    if (!ISO_DATE.test(next)) return;
    if (next === order.eventDate) return;
    // Moving the start past the end collapses the event to a single day in
    // the same write, so the record never holds an end before its start.
    if (order.endDate && order.endDate <= next) {
      setEndDate("");
      updateOrderFields(orderId, { eventDate: next, endDate: undefined }, "Event date");
    } else {
      updateOrderFields(orderId, { eventDate: next }, "Event date");
    }
  }

  function commitEndDate(next: string) {
    if (next === "") {
      // Cleared: back to a single-day event.
      if (order.endDate) updateOrderFields(orderId, { endDate: undefined }, "End date");
      return;
    }
    if (!ISO_DATE.test(next)) return;
    if (next <= order.eventDate) {
      // An end on or before the start is a single day — drop it and say so
      // by snapping the field back to empty.
      setEndDate("");
      if (order.endDate) updateOrderFields(orderId, { endDate: undefined }, "End date");
      return;
    }
    if (next === order.endDate) return;
    updateOrderFields(orderId, { endDate: next }, "End date");
  }

  function commitVenue(next = venue) {
    // Any spelling of pick-up is stored canonically so it groups as one venue.
    const trimmed = isPickupVenue(next) ? PICKUP_VENUE : next.trim();
    if (trimmed !== venue) setVenue(trimmed);
    if (trimmed === (order.venue ?? "")) return;
    updateOrderFields(orderId, { venue: trimmed || undefined }, "Venue");
  }

  function handleCustomerChange(value: string) {
    if (value === NEW_CUSTOMER) {
      setCreatingCustomer(true);
      setNewCustomerName("");
      return;
    }
    if ((value || undefined) === order.customerId) return;
    updateOrderFields(orderId, { customerId: value || undefined }, "Customer");
  }

  async function commitNewCustomer() {
    const name = newCustomerName.trim();
    if (!name) { setCreatingCustomer(false); return; }
    const id = await saveCustomer({ name });
    await updateOrderFields(orderId, { customerId: id }, "Customer");
    setCreatingCustomer(false);
    setNewCustomerName("");
  }

  return (
    <SidebarCard title="Properties">
      <div className="space-y-1">
        <PropertyRow label={endDate ? "Starts" : "Event date"}>
          <input
            type="date"
            value={eventDate}
            onChange={(e) => { setEventDate(e.target.value); commitEventDate(e.target.value); }}
            onBlur={() => { if (!eventDate) setEventDate(order.eventDate); }}
            aria-label="Event date"
            className={`${PROPERTY_INPUT_CLASS} tabular-nums`}
          />
        </PropertyRow>

        {/* Multi-day events (a market weekend) set an end; empty = one day. */}
        <PropertyRow label="Ends">
          <input
            type="date"
            value={endDate}
            min={order.eventDate}
            onChange={(e) => { setEndDate(e.target.value); commitEndDate(e.target.value); }}
            aria-label="End date"
            title="Leave empty for a single-day event"
            className={`${PROPERTY_INPUT_CLASS} tabular-nums ${endDate ? "" : "text-muted-foreground/60"}`}
          />
        </PropertyRow>

        <PropertyRow label="Customer">
          {creatingCustomer ? (
            <input
              autoFocus
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
              onBlur={commitNewCustomer}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); commitNewCustomer(); }
                if (e.key === "Escape") { setCreatingCustomer(false); setNewCustomerName(""); }
              }}
              placeholder="New customer name…"
              aria-label="New customer name"
              className={PROPERTY_INPUT_CLASS}
            />
          ) : (
            <select
              value={order.customerId ?? ""}
              onChange={(e) => handleCustomerChange(e.target.value)}
              aria-label="Customer"
              className={PROPERTY_INPUT_CLASS}
            >
              <option value="">—</option>
              {pickerCustomers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}{c.archived ? " (archived)" : ""}
                </option>
              ))}
              <option value={NEW_CUSTOMER}>+ New customer…</option>
            </select>
          )}
        </PropertyRow>

        <PropertyRow label="Venue">
          <div className="flex items-center justify-end gap-1.5 min-w-0 max-w-[70%]">
            {/* One tap for the common no-venue case: someone collects a box. */}
            {!venue && (
              <button
                type="button"
                onClick={() => commitVenue(PICKUP_VENUE)}
                className="shrink-0 inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Nobody travels — the customer collects the order"
              >
                <Store className="w-3 h-3" aria-hidden /> Pick-up
              </button>
            )}
            <input
              type="text"
              list="order-venue-list"
              value={venue}
              onChange={(e) => setVenue(e.target.value)}
              onBlur={() => commitVenue()}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              placeholder="—"
              aria-label="Venue"
              className={`${PROPERTY_INPUT_CLASS} !max-w-none min-w-0 flex-1`}
            />
            <datalist id="order-venue-list">
              {venueOptions.map((v) => <option key={v} value={v} />)}
            </datalist>
          </div>
        </PropertyRow>

        <PropertyRow label="Type">
          <select
            value={order.source ?? ""}
            onChange={(e) => {
              const next = (e.target.value || undefined) as OrderSource | undefined;
              if (next !== order.source) updateOrderFields(orderId, { source: next }, "Type");
            }}
            aria-label="Type"
            className={PROPERTY_INPUT_CLASS}
          >
            <option value="">—</option>
            {ORDER_SOURCES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </PropertyRow>
      </div>
    </SidebarCard>
  );
}

// ─── Main: Notes ─────────────────────────────────────────────────────────────

function NotesCard({ orderId, order }: { orderId: string; order: Order }) {
  const [value, setValue] = useState(order.notes ?? "");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function commit(next: string) {
    const trimmed = next.trim();
    if (trimmed === (order.notes ?? "")) return;
    updateOrderFields(orderId, { notes: trimmed || undefined }, "Notes");
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
          placeholder='The vague early details live here — "40 bonbons, mix TBD, wants a nut-free option…"'
          rows={3}
          aria-label="Notes"
          className="w-full text-sm bg-transparent border-0 resize-none focus:outline-none placeholder:text-muted-foreground/60"
        />
      </div>
    </div>
  );
}
