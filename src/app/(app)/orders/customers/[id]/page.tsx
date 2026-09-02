"use client";

import { useState, useCallback, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  useCustomer, saveCustomer, deleteCustomer, archiveCustomer, unarchiveCustomer,
  useOrdersByCustomer,
} from "@/lib/hooks";
import { useSpaId } from "@/lib/use-spa-id";
import { useNavigationGuard } from "@/lib/useNavigationGuard";
import { groupOrdersForList, toISODate } from "@/lib/orders";
import { OrderCard } from "@/components/orders/order-card";
import { ArrowLeft, Pencil, Trash2, Archive, ArchiveRestore, Mail, Phone, AtSign } from "lucide-react";

export default function CustomerDetailPage() {
  return (
    <Suspense fallback={null}>
      <CustomerDetailPageInner />
    </Suspense>
  );
}

function CustomerDetailPageInner() {
  // Segment directly before the id — "customers", NOT "orders".
  const customerId = useSpaId("customers");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";
  const customer = useCustomer(customerId);
  const customerOrders = useOrdersByCustomer(customerId);

  const [editing, setEditing] = useState(isNew);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [savedOnce, setSavedOnce] = useState(false);
  const [syncedId, setSyncedId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [instagram, setInstagram] = useState("");
  const [notes, setNotes] = useState("");

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirmDelete) setConfirmDelete(false);
      else if (editing) handleCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync form state when the customer loads (also for new ones, which start in edit mode)
  if (customer && customer.id && customer.id !== syncedId && (!editing || isNew)) {
    setName(customer.name);
    setEmail(customer.email || "");
    setPhone(customer.phone || "");
    setInstagram(customer.instagram || "");
    setNotes(customer.notes || "");
    setSyncedId(customer.id);
  }

  const formDirty = editing && customer != null && (
    name !== customer.name ||
    email !== (customer.email || "") ||
    phone !== (customer.phone || "") ||
    instagram !== (customer.instagram || "") ||
    notes !== (customer.notes || "")
  );
  const isDirty = (isNew && !savedOnce) || formDirty;

  const handleConfirmLeave = useCallback(async () => {
    if (isNew && customer?.id) {
      await deleteCustomer(customer.id);
    }
  }, [isNew, customer?.id]);

  // Back is a plain Link to the customers tab; the guard's capture-phase click
  // interception still protects it (and every other link) while dirty.
  useNavigationGuard(isDirty, isNew ? handleConfirmLeave : undefined);

  const todayISO = useMemo(() => toISODate(new Date()), []);
  const { upcoming, past } = useMemo(
    () => groupOrdersForList(customerOrders, todayISO),
    [customerOrders, todayISO],
  );

  if (!customerId || !customer) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  async function handleSave() {
    if (!customerId || !name.trim()) return;
    await saveCustomer({
      ...customer!,
      name: name.trim(),
      email: email.trim() || undefined,
      phone: phone.trim() || undefined,
      instagram: instagram.trim().replace(/^@/, "") || undefined,
      notes: notes.trim() || undefined,
    });
    setEditing(false);
    setSavedOnce(true);
    if (isNew) router.replace(`/orders/customers/${encodeURIComponent(customerId)}`);
  }

  function handleCancel() {
    setName(customer!.name);
    setEmail(customer!.email || "");
    setPhone(customer!.phone || "");
    setInstagram(customer!.instagram || "");
    setNotes(customer!.notes || "");
    setEditing(false);
    if (isNew && customerId) router.replace(`/orders/customers/${encodeURIComponent(customerId)}`);
  }

  const orderCount = customerOrders.length;

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <Link
          href="/orders?tab=customers"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3 hover:text-foreground transition-colors"
        >
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Back
        </Link>
      </div>

      <div className="px-4 pb-6 space-y-4 max-w-2xl">
        {editing ? (
          <div className="rounded-lg border border-border bg-card p-4 space-y-3">
            <div>
              <label className="label" htmlFor="customer-name">Name</label>
              <input
                id="customer-name"
                className="input w-full"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Customer or business name"
                autoFocus
                required
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="customer-email">Email</label>
                <input
                  id="customer-email"
                  type="email"
                  className="input w-full"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                />
              </div>
              <div>
                <label className="label" htmlFor="customer-phone">Phone</label>
                <input
                  id="customer-phone"
                  type="tel"
                  className="input w-full"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+31 6 …"
                />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="customer-instagram">Instagram</label>
              <input
                id="customer-instagram"
                className="input w-full"
                value={instagram}
                onChange={(e) => setInstagram(e.target.value)}
                placeholder="handle (without the @)"
              />
            </div>
            <div>
              <label className="label" htmlFor="customer-notes">Notes</label>
              <textarea
                id="customer-notes"
                className="input w-full min-h-24"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Allergies, preferences, how you met…"
              />
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={handleSave}
                disabled={!name.trim()}
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
                <h1 className="text-xl font-bold truncate">{customer.name}</h1>
                {customer.archived && (
                  <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[10px] font-medium flex items-center gap-1 shrink-0">
                    <Archive className="w-3 h-3" /> Archived
                  </span>
                )}
              </div>
              <button
                onClick={() => setEditing(true)}
                aria-label="Edit customer"
                className="p-2 rounded-full hover:bg-muted transition-colors shrink-0"
              >
                <Pencil className="w-4 h-4 text-muted-foreground" />
              </button>
            </div>

            {(customer.email || customer.phone || customer.instagram) && (
              <div className="rounded-lg border border-border bg-card p-4 space-y-2.5">
                {customer.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
                    <a href={`mailto:${customer.email}`} className="hover:underline">{customer.email}</a>
                  </div>
                )}
                {customer.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
                    <a href={`tel:${customer.phone}`} className="hover:underline">{customer.phone}</a>
                  </div>
                )}
                {customer.instagram && (
                  <div className="flex items-center gap-2 text-sm">
                    <AtSign className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
                    <span>{customer.instagram}</span>
                  </div>
                )}
              </div>
            )}

            {customer.notes && (
              <div className="rounded-lg border border-border bg-card p-4">
                <div className="mono-label text-muted-foreground mb-1.5">Notes</div>
                <p className="text-sm whitespace-pre-wrap">{customer.notes}</p>
              </div>
            )}

            {/* Order history */}
            <div>
              <div className="mono-label text-muted-foreground mb-1.5">
                Orders ({orderCount})
              </div>
              {orderCount === 0 ? (
                <p className="text-xs text-muted-foreground">No orders yet for this customer.</p>
              ) : (
                <div className="space-y-3">
                  {upcoming.length > 0 && (
                    <div className="space-y-2">
                      {upcoming.map((o) => (
                        <OrderCard key={o.id} order={o} todayISO={todayISO} />
                      ))}
                    </div>
                  )}
                  {past.length > 0 && (
                    <div className="space-y-2 opacity-70">
                      {upcoming.length > 0 && (
                        <div className="mono-label text-muted-foreground pt-1">Past</div>
                      )}
                      {past.map((o) => (
                        <OrderCard key={o.id} order={o} todayISO={todayISO} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Archive / delete — three-way, mirroring filling categories */}
            <div className="pt-4 border-t border-border space-y-3">
              {customer.archived ? (
                <button
                  onClick={async () => {
                    await unarchiveCustomer(customerId);
                  }}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArchiveRestore className="w-4 h-4" /> Unarchive customer
                </button>
              ) : confirmDelete ? (
                orderCount > 0 ? (
                  <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                    <p className="text-sm font-medium">Archive this customer?</p>
                    <p className="text-xs text-muted-foreground">
                      {orderCount === 1 ? "1 order references" : `${orderCount} orders reference`} this
                      customer, so it can&apos;t be deleted. Archiving hides it from pickers; existing
                      orders keep it.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          await archiveCustomer(customerId);
                          router.replace("/orders?tab=customers");
                        }}
                        className="btn-primary px-4 py-2"
                      >
                        Archive customer
                      </button>
                      <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-4 py-2">
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                    <p className="text-sm font-medium text-destructive">Delete this customer?</p>
                    <p className="text-xs text-muted-foreground">
                      This permanently removes the customer and their contact details. This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => {
                          await deleteCustomer(customerId);
                          router.replace("/orders?tab=customers");
                        }}
                        className="inline-flex items-center justify-center rounded-full bg-destructive text-white px-4 py-2 text-sm font-medium transition-colors hover:bg-destructive/90"
                      >
                        Yes, delete customer
                      </button>
                      <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-4 py-2">
                        Cancel
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
                >
                  {orderCount > 0 ? <Archive className="w-4 h-4" /> : <Trash2 className="w-4 h-4" />}
                  {orderCount > 0 ? "Archive customer" : "Delete customer"}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
