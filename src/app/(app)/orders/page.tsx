"use client";

/**
 * Orders page — two tabs: Orders, Customers
 * ─────────────────────────────────────────
 * Orders: corporate orders and event bookings on a timeline, with a grouped
 *         upcoming/past list view and a month calendar view (toggle,
 *         persisted). Orders are captured early with just a title + date +
 *         status and refined on the detail page as the event approaches.
 * Customers: the people and businesses behind those orders, with contact
 *         details and per-customer order history on their detail pages.
 */

import { useState, useMemo, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { ListToolbar, QuickAddForm, EmptyState, ListItemCard } from "@/components/pantry";
import { MonthGrid } from "@/components/orders/month-grid";
import { OrderCard } from "@/components/orders/order-card";
import { useOrders, saveOrder, useCustomers, saveCustomer } from "@/lib/hooks";
import {
  groupOrdersForList,
  toISODate,
  shiftMonth,
  monthLabel,
  ORDER_STATUS_LABEL,
} from "@/lib/orders";
import type { Order, OrderStatus, Customer } from "@/types";
import { useNShortcut } from "@/lib/use-n-shortcut";
import { usePersistedFilters } from "@/lib/use-persisted-filters";

type OrdersPageTab = "orders" | "customers";

const TABS: { id: OrdersPageTab; label: string }[] = [
  { id: "orders", label: "Orders" },
  { id: "customers", label: "Customers" },
];

type OrdersView = "list" | "calendar";

const VIEWS: { id: OrdersView; label: string }[] = [
  { id: "list", label: "List" },
  { id: "calendar", label: "Calendar" },
];

/** Statuses offered at creation time — an order that's already fulfilled or
 *  cancelled isn't worth capturing, and "in production" starts on the detail
 *  page once real work begins. */
const CREATE_STATUSES: OrderStatus[] = ["lead", "confirmed"];

export default function OrdersPage() {
  return (
    <Suspense fallback={null}>
      <OrdersPageInner />
    </Suspense>
  );
}

function OrdersPageInner() {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab");

  // URL param wins over sessionStorage — lets detail pages return to a specific
  // tab via `/orders?tab=customers` (used by the customer detail Back link).
  //
  // Seed the persisted value synchronously (a lazy initializer runs during
  // render, ahead of all effects) so usePersistedFilters' own restore effect
  // reads the URL's tab instead of racing it. Without this, landing on
  // `?tab=orders` with "customers" persisted leaves the wrong tab active:
  // the override effect no-ops (state still equals the default) before the
  // restore effect flips it. Idempotent, so StrictMode double-render is fine.
  useState(() => {
    if (typeof window === "undefined") return null;
    if (tabParam === "orders" || tabParam === "customers") {
      try {
        const raw = sessionStorage.getItem("filters:orders-tab");
        const parsed = raw ? JSON.parse(raw) : {};
        sessionStorage.setItem("filters:orders-tab", JSON.stringify({ ...parsed, activeTab: tabParam }));
      } catch {}
    }
    return null;
  });

  const [tab, setTab] = usePersistedFilters("orders-tab", { activeTab: "orders" as OrdersPageTab });

  // Covers client-side navigations where the page doesn't remount (only the
  // query string changes) — the render-time seed above only runs on mount.
  useEffect(() => {
    if (tabParam === "orders" || tabParam === "customers") {
      if (tab.activeTab !== tabParam) setTab("activeTab", tabParam);
    }
  }, [tabParam]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeTab = tab.activeTab;

  return (
    <div>
      <PageHeader title="Orders" description="Corporate orders and event bookings, and the customers behind them" />

      <div className="px-4 mb-3">
        <div className="flex gap-1 overflow-x-auto" style={{ scrollbarWidth: "none" }}>
          {TABS.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => setTab("activeTab", id)}
              className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                activeTab === id
                  ? "bg-accent text-accent-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {activeTab === "orders" && <OrdersTab />}
      {activeTab === "customers" && <CustomersTab />}
    </div>
  );
}

// ─── Orders Tab ──────────────────────────────────────────────────────────────

function OrdersTab() {
  const router = useRouter();
  const [f, setF] = usePersistedFilters("orders", {
    view: "list" as OrdersView,
    search: "",
  });
  const orders = useOrders();
  const customers = useCustomers(true);
  const todayISO = useMemo(() => toISODate(new Date()), []);

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(todayISO);
  const [newStatus, setNewStatus] = useState<OrderStatus>("lead");
  const [showPast, setShowPast] = useState(false);
  const [cal, setCal] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  useNShortcut(() => setShowAdd(true), showAdd);

  const customerNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of customers) if (c.id) m.set(c.id, c.name);
    return m;
  }, [customers]);

  const searchLower = f.search.toLowerCase();
  const filtered = useMemo(
    () =>
      f.search
        ? orders.filter(
            (o) =>
              o.title.toLowerCase().includes(searchLower) ||
              (customerNameById.get(o.customerId ?? "") ?? "").toLowerCase().includes(searchLower) ||
              (o.venue ?? "").toLowerCase().includes(searchLower),
          )
        : orders,
    [orders, f.search, searchLower, customerNameById],
  );

  const { upcoming, past } = useMemo(
    () => groupOrdersForList(filtered, todayISO),
    [filtered, todayISO],
  );

  // Section the upcoming list by month ("December 2026") for scanability.
  const upcomingByMonth = useMemo(() => {
    const groups: { label: string; orders: Order[] }[] = [];
    for (const o of upcoming) {
      const label = monthLabel(o.eventDate);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.orders.push(o);
      else groups.push({ label, orders: [o] });
    }
    return groups;
  }, [upcoming]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newDate) return;
    const id = await saveOrder({
      title: newTitle.trim(),
      eventDate: newDate,
      status: newStatus,
    });
    router.push(`/orders/${encodeURIComponent(String(id))}?new=1`);
  }

  function openAddForDay(iso: string) {
    setNewDate(iso);
    setShowAdd(true);
  }

  return (
    <div className="px-4 space-y-3 pb-6">
      <div className="flex gap-1">
        {VIEWS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => setF("view", id)}
            aria-pressed={f.view === id}
            className={`px-3.5 py-1.5 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
              f.view === id
                ? "bg-accent text-accent-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <ListToolbar
        search={f.search}
        onSearchChange={(v) => setF("search", v)}
        searchPlaceholder="Search title, customer, venue…"
        searchAriaLabel="Search orders"
        onAdd={() => setShowAdd(true)}
        addAriaLabel="Add order"
        addTitle="Add order (n)"
      />

      {showAdd && (
        <QuickAddForm
          onSubmit={handleAdd}
          onCancel={() => {
            setShowAdd(false);
            setNewTitle("");
            setNewDate(todayISO);
            setNewStatus("lead");
          }}
          submitLabel="Create Order"
          canSubmit={!!newTitle.trim() && !!newDate}
        >
          <input
            className="input w-full"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Order or event title… e.g. Popup in Wittelte"
            aria-label="Order title"
            autoFocus
            required
          />
          <div className="flex gap-2">
            <input
              type="date"
              className="input flex-1"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              aria-label="Event date"
              required
            />
            <select
              className="input flex-1"
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value as OrderStatus)}
              aria-label="Status"
            >
              {CREATE_STATUSES.map((s) => (
                <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>
              ))}
            </select>
          </div>
        </QuickAddForm>
      )}

      {f.view === "calendar" ? (
        <MonthGrid
          year={cal.year}
          month={cal.month}
          orders={filtered}
          todayISO={todayISO}
          onPrev={() => setCal((c) => shiftMonth(c.year, c.month, -1))}
          onNext={() => setCal((c) => shiftMonth(c.year, c.month, 1))}
          onToday={() => {
            const now = new Date();
            setCal({ year: now.getFullYear(), month: now.getMonth() });
          }}
          onDayClick={openAddForDay}
        />
      ) : (
        <>
          {filtered.length === 0 && (
            <EmptyState
              hasData={orders.length > 0}
              emptyMessage="No orders yet. Tap + to capture your first order or event."
              filteredMessage="No orders match your search."
            />
          )}

          {upcomingByMonth.map((group) => (
            <div key={group.label}>
              <h2 className="mono-label text-muted-foreground mb-1.5">{group.label}</h2>
              <div className="space-y-2">
                {group.orders.map((o) => (
                  <OrderCard
                    key={o.id}
                    order={o}
                    todayISO={todayISO}
                    customerName={customerNameById.get(o.customerId ?? "")}
                  />
                ))}
              </div>
            </div>
          ))}

          {past.length > 0 && (
            <div className="pt-2">
              <button
                onClick={() => setShowPast((v) => !v)}
                className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                {showPast ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                Past &amp; closed ({past.length})
              </button>
              {showPast && (
                <div className="space-y-2 mt-2 opacity-70">
                  {past.map((o) => (
                    <OrderCard
                      key={o.id}
                      order={o}
                      todayISO={todayISO}
                      customerName={customerNameById.get(o.customerId ?? "")}
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Customers Tab ───────────────────────────────────────────────────────────

function CustomersTab() {
  const router = useRouter();
  const [f, setF] = usePersistedFilters("customers", { search: "", showArchived: false });
  const customers = useCustomers(f.showArchived);
  const orders = useOrders();

  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");

  useNShortcut(() => setShowAdd(true), showAdd);

  const orderCountByCustomer = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders) {
      if (!o.customerId) continue;
      m.set(o.customerId, (m.get(o.customerId) ?? 0) + 1);
    }
    return m;
  }, [orders]);

  const searchLower = f.search.toLowerCase();
  const filtered = useMemo(
    () =>
      f.search
        ? customers.filter(
            (c) =>
              c.name.toLowerCase().includes(searchLower) ||
              (c.email ?? "").toLowerCase().includes(searchLower) ||
              (c.phone ?? "").toLowerCase().includes(searchLower),
          )
        : customers,
    [customers, f.search, searchLower],
  );

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    const id = await saveCustomer({ name: newName.trim() });
    setNewName("");
    setShowAdd(false);
    router.push(`/orders/customers/${encodeURIComponent(String(id))}?new=1`);
  }

  return (
    <div className="px-4 space-y-3 pb-6">
      <ListToolbar
        search={f.search}
        onSearchChange={(v) => setF("search", v)}
        searchPlaceholder="Search name, email, phone…"
        searchAriaLabel="Search customers"
        onAdd={() => setShowAdd(true)}
        addAriaLabel="Add customer"
        addTitle="Add customer (n)"
      />

      {showAdd && (
        <QuickAddForm
          onSubmit={handleAdd}
          onCancel={() => {
            setShowAdd(false);
            setNewName("");
          }}
          submitLabel="Create Customer"
          canSubmit={!!newName.trim()}
        >
          <input
            className="input w-full"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Customer name…"
            aria-label="Customer name"
            autoFocus
            required
          />
        </QuickAddForm>
      )}

      <EmptyStateWhenNeeded customers={customers} filtered={filtered} />

      <ul className="space-y-2">
        {filtered.map((c) => (
          <ListItemCard
            key={c.id}
            href={`/orders/customers/${encodeURIComponent(c.id!)}`}
            archived={c.archived}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium text-sm truncate">{c.name}</span>
                {c.archived && (
                  <span className="rounded-full bg-muted text-muted-foreground px-2 py-0.5 text-[10px] font-medium shrink-0">
                    Archived
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {customerSubtitle(c, orderCountByCustomer.get(c.id ?? "") ?? 0)}
              </p>
            </div>
          </ListItemCard>
        ))}
      </ul>
    </div>
  );
}

function EmptyStateWhenNeeded({ customers, filtered }: { customers: Customer[]; filtered: Customer[] }) {
  if (filtered.length > 0) return null;
  return (
    <EmptyState
      hasData={customers.length > 0}
      emptyMessage="No customers yet. Tap + to add your first."
      filteredMessage="No customers match your search."
    />
  );
}

function customerSubtitle(c: Customer, orderCount: number): string {
  const contact = [c.email, c.phone, c.instagram ? `@${c.instagram}` : undefined].filter(Boolean).join(" · ");
  const count = `${orderCount} ${orderCount === 1 ? "order" : "orders"}`;
  return contact ? `${contact} · ${count}` : count;
}
