"use client";

/**
 * Orders page — two tabs: Orders, Customers
 * ─────────────────────────────────────────
 * Orders: corporate orders and event bookings on a timeline, as a table
 *         grouped by month (with pieces needed and a made/needed progress bar
 *         per order) or a month calendar view (toggle, persisted). Orders are
 *         captured early with just a title + date + status and refined on the
 *         detail page as the event approaches.
 * Customers: the people and businesses behind those orders, with contact
 *         details and per-customer order history on their detail pages.
 */

import { useState, useMemo, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { ListCalendarToggle, type ListCalendarView } from "@/components/list-calendar-toggle";
import { ListToolbar, QuickAddForm, EmptyState, ListItemCard, FilterPanel, FilterChipGroup } from "@/components/pantry";
import { MonthGrid } from "@/components/orders/month-grid";
import { OrdersTable, type OrdersTableGroup } from "@/components/orders/orders-table";
import {
  useOrders, saveOrder, useCustomers, saveCustomer,
  useAllOrderLineItems, useAllOrderProductionLinks, useProductionPlans,
} from "@/lib/hooks";
import {
  groupOrdersForList,
  toISODate,
  shiftMonth,
  monthLabel,
  orderProgressByOrder,
  ORDER_STATUS_LABEL,
  orderWithinPeriod,
  type OrderPeriod,
} from "@/lib/orders";
import type { OrderStatus, Customer } from "@/types";
import { useNShortcut } from "@/lib/use-n-shortcut";
import { usePersistedFilters } from "@/lib/use-persisted-filters";

type OrdersPageTab = "orders" | "customers";

const TABS: { id: OrdersPageTab; label: string }[] = [
  { id: "orders", label: "Orders" },
  { id: "customers", label: "Customers" },
];

type OrdersView = ListCalendarView;

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
    showFilters: false,
    includePast: false,
    period: "all" as OrderPeriod,
    filterCustomer: "", // customer id; "" = all customers
    collapsedGroups: [] as string[],
  });
  const orders = useOrders();
  const customers = useCustomers(true);
  const allLineItems = useAllOrderLineItems();
  const allLinks = useAllOrderProductionLinks();
  const plans = useProductionPlans();
  const todayISO = useMemo(() => toISODate(new Date()), []);

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDate, setNewDate] = useState(todayISO);
  // Multi-day events (a two-day market) set an end date; hidden behind a
  // toggle so the common single-day capture stays two fields.
  const [newMultiDay, setNewMultiDay] = useState(false);
  const [newEndDate, setNewEndDate] = useState("");
  const [newStatus, setNewStatus] = useState<OrderStatus>("lead");
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

  const activeFilterCount =
    (f.includePast ? 1 : 0) +
    (f.period !== "all" ? 1 : 0) +
    (f.filterCustomer ? 1 : 0);

  function clearFilters() {
    setF("includePast", false);
    setF("period", "all");
    setF("filterCustomer", "");
  }

  const searchLower = f.search.toLowerCase();
  // Search + customer filter — feeds both views (the calendar keeps its own
  // month navigation, so the period window applies to the list only).
  const baseFiltered = useMemo(
    () =>
      orders.filter((o) => {
        if (f.filterCustomer && o.customerId !== f.filterCustomer) return false;
        if (!f.search) return true;
        return (
          o.title.toLowerCase().includes(searchLower) ||
          (customerNameById.get(o.customerId ?? "") ?? "").toLowerCase().includes(searchLower) ||
          (o.venue ?? "").toLowerCase().includes(searchLower)
        );
      }),
    [orders, f.search, searchLower, customerNameById, f.filterCustomer],
  );

  const listFiltered = useMemo(
    () => (f.period === "all" ? baseFiltered : baseFiltered.filter((o) => orderWithinPeriod(o, todayISO, f.period))),
    [baseFiltered, f.period, todayISO],
  );

  const { upcoming, past } = useMemo(
    () => groupOrdersForList(listFiltered, todayISO),
    [listFiltered, todayISO],
  );

  // Section the upcoming list by month ("December 2026") for scanability, with
  // past & closed orders — when shown — as one dimmed group at the bottom.
  const tableGroups = useMemo<OrdersTableGroup[]>(() => {
    const groups: OrdersTableGroup[] = [];
    for (const o of upcoming) {
      const label = monthLabel(o.eventDate);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.orders.push(o);
      else groups.push({ key: label, label, orders: [o] });
    }
    if (f.includePast && past.length > 0) {
      groups.push({ key: "past", label: "Past & closed", orders: past, dimmed: true });
    }
    return groups;
  }, [upcoming, past, f.includePast]);

  // Pieces needed / made per order, for the two production columns.
  const planStatusById = useMemo(() => {
    const m = new Map<string, "draft" | "active" | "done">();
    for (const p of plans) if (p.id) m.set(p.id, p.status);
    return m;
  }, [plans]);
  const progressByOrder = useMemo(
    () => orderProgressByOrder(listFiltered, allLineItems, allLinks, planStatusById),
    [listFiltered, allLineItems, allLinks, planStatusById],
  );
  const collapsedGroups = useMemo(() => new Set(f.collapsedGroups), [f.collapsedGroups]);
  function toggleGroup(key: string) {
    const next = new Set(collapsedGroups);
    if (next.has(key)) next.delete(key); else next.add(key);
    setF("collapsedGroups", Array.from(next));
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim() || !newDate) return;
    const id = await saveOrder({
      title: newTitle.trim(),
      eventDate: newDate,
      endDate: newMultiDay && newEndDate > newDate ? newEndDate : undefined,
      status: newStatus,
    });
    router.push(`/orders/${encodeURIComponent(String(id))}`);
  }

  function resetAddForm() {
    setShowAdd(false);
    setNewTitle("");
    setNewDate(todayISO);
    setNewMultiDay(false);
    setNewEndDate("");
    setNewStatus("lead");
  }

  function openAddForDay(iso: string) {
    setNewDate(iso);
    setShowAdd(true);
  }

  return (
    <div className="px-4 space-y-3 pb-6">
      <div className="flex justify-end">
        <ListCalendarToggle
          value={f.view}
          onChange={(v) => setF("view", v)}
          ariaLabel="Orders view"
          listTitle="List view — upcoming orders grouped by month"
          calendarTitle="Calendar view — orders on a month grid"
        />
      </div>

      <ListToolbar
        search={f.search}
        onSearchChange={(v) => setF("search", v)}
        searchPlaceholder="Search title, customer, venue…"
        searchAriaLabel="Search orders"
        onAdd={() => setShowAdd(true)}
        addAriaLabel="Add order"
        addTitle="Add order (n)"
        showFilters
        filterPanelOpen={f.showFilters}
        onToggleFilters={() => setF("showFilters", !f.showFilters)}
        activeFilterCount={activeFilterCount}
      />

      {f.showFilters && (
        <FilterPanel activeFilterCount={activeFilterCount} onClearAll={clearFilters}>
          <FilterChipGroup
            label="Past & closed orders"
            options={[
              { value: "hide", label: "Hide" },
              { value: "show", label: "Show" },
            ]}
            value={f.includePast ? "show" : "hide"}
            defaultValue="hide"
            onChange={(v) => setF("includePast", v === "show")}
          />
          <FilterChipGroup
            label="Event date"
            options={[
              { value: "30d", label: "Within 30 days" },
              { value: "90d", label: "Within 90 days" },
              { value: "12mo", label: "Within 12 months" },
              { value: "all", label: "All dates" },
            ]}
            value={f.period}
            defaultValue="all"
            onChange={(v) => setF("period", v as OrderPeriod)}
          />
          {customers.length > 0 && (
            <div>
              <p className="text-xs text-muted-foreground mb-1">Customer</p>
              <select
                className="input sm:!w-64"
                value={f.filterCustomer}
                onChange={(e) => setF("filterCustomer", e.target.value)}
                aria-label="Filter by customer"
              >
                <option value="">All customers</option>
                {customers.filter((c) => c.id).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}{c.archived ? " (archived)" : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </FilterPanel>
      )}

      {showAdd && (
        <QuickAddForm
          onSubmit={handleAdd}
          onCancel={resetAddForm}
          submitLabel="Create Order"
          canSubmit={!!newTitle.trim() && !!newDate && (!newMultiDay || newEndDate > newDate)}
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
          {/* Single day: date + status side by side. Multi-day: the date
              becomes "Starts" and an "Ends" field appears beside it, each with
              a visible label so the two dates can't be confused. */}
          <div className="flex flex-wrap gap-2">
            <label className="flex-1 min-w-36 flex flex-col gap-1">
              {newMultiDay && <span className="text-xs text-muted-foreground">Starts</span>}
              <input
                type="date"
                className="input w-full"
                value={newDate}
                onChange={(e) => setNewDate(e.target.value)}
                aria-label="Event date"
                required
              />
            </label>
            {newMultiDay && (
              <label className="flex-1 min-w-36 flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Ends</span>
                <input
                  type="date"
                  className="input w-full"
                  value={newEndDate}
                  min={newDate}
                  onChange={(e) => setNewEndDate(e.target.value)}
                  aria-label="End date"
                  required
                />
              </label>
            )}
            <label className="flex-1 min-w-36 flex flex-col gap-1 justify-end">
              {newMultiDay && <span className="text-xs text-muted-foreground">Status</span>}
              <select
                className="input w-full"
                value={newStatus}
                onChange={(e) => setNewStatus(e.target.value as OrderStatus)}
                aria-label="Status"
              >
                {CREATE_STATUSES.map((s) => (
                  <option key={s} value={s}>{ORDER_STATUS_LABEL[s]}</option>
                ))}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newMultiDay}
                onChange={(e) => { setNewMultiDay(e.target.checked); if (!e.target.checked) setNewEndDate(""); }}
              />
              Multi-day event
            </label>
            {newMultiDay && !newEndDate && (
              <span className="text-xs text-muted-foreground">Pick the last day of the event.</span>
            )}
            {newMultiDay && newEndDate && newEndDate <= newDate && (
              <span className="text-xs text-status-alert">The last day must come after the first.</span>
            )}
          </div>
        </QuickAddForm>
      )}

      {f.view === "calendar" ? (
        <MonthGrid
          year={cal.year}
          month={cal.month}
          orders={baseFiltered}
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
          {upcoming.length === 0 && (!f.includePast || past.length === 0) && (
            <EmptyState
              hasData={orders.length > 0}
              emptyMessage="No orders yet. Tap + to capture your first order or event."
              filteredMessage="No orders match your search or filters."
            />
          )}

          {tableGroups.length > 0 && (
            <>
              <div className="flex justify-end gap-3">
                <button onClick={() => setF("collapsedGroups", tableGroups.map((g) => g.key))} className="text-xs text-muted-foreground">Collapse all</button>
                <button onClick={() => setF("collapsedGroups", [])} className="text-xs text-muted-foreground">Expand all</button>
              </div>
              <OrdersTable
                groups={tableGroups}
                todayISO={todayISO}
                progressByOrder={progressByOrder}
                customerNameById={customerNameById}
                collapsed={collapsedGroups}
                onToggleGroup={toggleGroup}
              />
            </>
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
