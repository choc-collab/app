"use client";

import { useState, useMemo } from "react";
import {
  useOrderLineItems, saveOrderLineItem, deleteOrderLineItem,
  useOrderProductionLinks, useProductsList,
} from "@/lib/hooks";
import { allocatedByProduct, lineItemFulfillment } from "@/lib/orders";
import type { OrderLineItem } from "@/types";
import { X } from "lucide-react";

/** What the order needs, line by line. A line starts as vague as "40 ×
 *  (mix TBD, nut-free option)" and firms up into a real product; once it has
 *  a product, a fulfillment chip tracks how much is covered by per-product
 *  batch allocations (matched by product — see allocatedByProduct). */
export function LineItemsSection({ orderId }: { orderId: string }) {
  const items = useOrderLineItems(orderId);
  const links = useOrderProductionLinks(orderId);
  const products = useProductsList(true); // include archived so names don't vanish

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [qtyEdits, setQtyEdits] = useState<Record<string, string>>({});
  const [addQty, setAddQty] = useState("");
  const [addProductId, setAddProductId] = useState("");
  const [addNote, setAddNote] = useState("");

  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) if (p.id) m.set(p.id, p.name);
    return m;
  }, [products]);

  const allocated = useMemo(() => allocatedByProduct(links), [links]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const quantity = Math.max(1, parseInt(addQty) || 0);
    if (!quantity) return;
    const maxSort = items.reduce((max, i) => Math.max(max, i.sortOrder), -1);
    await saveOrderLineItem({
      orderId,
      productId: addProductId || undefined,
      quantity,
      notes: addNote.trim() || undefined,
      sortOrder: maxSort + 1,
    });
    setAddQty("");
    setAddProductId("");
    setAddNote("");
  }

  async function handleQtyBlur(item: OrderLineItem, raw: string) {
    const val = Math.max(1, parseInt(raw) || 1);
    if (val !== item.quantity) {
      await saveOrderLineItem({ ...item, quantity: val });
    }
    setQtyEdits((prev) => {
      const next = { ...prev };
      delete next[item.id!];
      return next;
    });
  }

  return (
    <div>
      <div className="mono-label text-muted-foreground mb-1.5">Line items</div>
      <div className="rounded-lg border border-border bg-card p-4 space-y-3">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Nothing itemised yet — capture what this order needs, as vaguely or precisely as you know it.
          </p>
        )}

        {items.length > 0 && (
          <ul className="space-y-1.5">
            {items.map((item) => {
              const name = item.productId
                ? productNameById.get(item.productId) ?? "(deleted product)"
                : item.notes || "(unspecified)";
              const fulfillment = lineItemFulfillment(item, allocated);
              return (
                <li key={item.id} className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    value={qtyEdits[item.id!] ?? String(item.quantity)}
                    onChange={(e) => setQtyEdits((prev) => ({ ...prev, [item.id!]: e.target.value }))}
                    onBlur={(e) => handleQtyBlur(item, e.target.value)}
                    aria-label={`Quantity for ${name}`}
                    className="input !w-16 shrink-0 text-sm tabular-nums"
                  />
                  <span className="text-muted-foreground text-sm shrink-0">×</span>
                  <div className="flex-1 min-w-0">
                    <span className={`text-sm font-medium truncate block ${!item.productId ? "text-muted-foreground italic" : ""}`}>
                      {name}
                    </span>
                    {item.productId && item.notes && (
                      <span className="text-xs text-muted-foreground truncate block">{item.notes}</span>
                    )}
                  </div>
                  {fulfillment && (
                    <span
                      className={`text-xs tabular-nums shrink-0 ${
                        fulfillment.allocated >= fulfillment.needed ? "text-success" : "text-muted-foreground"
                      }`}
                    >
                      {fulfillment.allocated}/{fulfillment.needed} allocated
                    </span>
                  )}
                  {confirmDeleteId === item.id ? (
                    <span className="flex items-center gap-1.5 shrink-0">
                      <span className="text-xs text-destructive">Remove?</span>
                      <button
                        onClick={async () => {
                          await deleteOrderLineItem(item.id!);
                          setConfirmDeleteId(null);
                        }}
                        className="text-xs font-medium text-destructive hover:underline"
                      >
                        Yes
                      </button>
                      <button
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs text-muted-foreground hover:underline"
                      >
                        Cancel
                      </button>
                    </span>
                  ) : (
                    <button
                      onClick={() => setConfirmDeleteId(item.id!)}
                      aria-label={`Remove line item ${name}`}
                      title="Remove line item"
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

        <form onSubmit={handleAdd} className="flex flex-wrap gap-2 pt-1">
          <input
            type="number"
            min={1}
            value={addQty}
            onChange={(e) => setAddQty(e.target.value)}
            placeholder="Qty"
            aria-label="Line item quantity"
            className="input !w-20 shrink-0"
          />
          <select
            className="input flex-1 min-w-32"
            value={addProductId}
            onChange={(e) => setAddProductId(e.target.value)}
            aria-label="Line item product"
          >
            <option value="">Unspecified</option>
            {products.filter((p) => !p.archived).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
          <input
            className="input flex-1 min-w-32"
            value={addNote}
            onChange={(e) => setAddNote(e.target.value)}
            placeholder="Note… e.g. mix TBD, nut-free"
            aria-label="Line item note"
          />
          <button
            type="submit"
            disabled={!(parseInt(addQty) > 0)}
            className="btn-secondary px-4 py-2"
          >
            Add
          </button>
        </form>
      </div>
    </div>
  );
}
