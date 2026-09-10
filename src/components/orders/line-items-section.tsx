"use client";

import { useState, useMemo, useEffect } from "react";
import {
  useOrderLineItems, saveOrderLineItem, updateOrderLineItemFields, deleteOrderLineItem,
  useOrderProductionLinks, useProductsList,
} from "@/lib/hooks";
import { allocatedByProduct, lineItemFulfillment, formatPieces } from "@/lib/orders";
import type { OrderLineItem, Product } from "@/types";
import { Plus, Trash2 } from "lucide-react";

/**
 * What the order needs, line by line, as a table card (same shape as the
 * packaging purchase history): quantity, item, how much of it batches have
 * claimed, and a permanently visible add row at the bottom.
 *
 * Every cell commits on its own — quantity and note on blur, product on
 * change — so a line that starts as "40 × mix TBD" firms up into "40 × Milk
 * Chocolate Ganache" in place, without deleting and re-adding it.
 *
 * The quantity column is sized for orders in the thousands: a five-digit
 * count fits without clipping, and the value is right-aligned and tabular so
 * a column of quantities lines up.
 */

const LINE_GRID = "96px minmax(0,1fr) 108px 32px";

export function LineItemsSection({ orderId }: { orderId: string }) {
  const items = useOrderLineItems(orderId);
  const links = useOrderProductionLinks(orderId);
  const products = useProductsList(true); // include archived so names don't vanish

  const [pendingRemove, setPendingRemove] = useState<string | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && pendingRemove) setPendingRemove(null);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pendingRemove]);

  const productById = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) if (p.id) m.set(p.id, p);
    return m;
  }, [products]);
  const activeProducts = useMemo(() => products.filter((p) => !p.archived), [products]);

  const allocated = useMemo(() => allocatedByProduct(links), [links]);
  const totalPieces = items.reduce((sum, i) => sum + Math.max(0, i.quantity || 0), 0);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-baseline justify-between gap-3">
        <h2 className="text-[13px] font-semibold">Line items</h2>
        {items.length > 0 && (
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {formatPieces(totalPieces)} pieces · {items.length} {items.length === 1 ? "line" : "lines"}
          </span>
        )}
      </div>

      <div
        className="grid gap-3 px-4 py-2 bg-muted text-[10px] font-semibold uppercase tracking-[0.06em] text-muted-foreground"
        style={{ gridTemplateColumns: LINE_GRID }}
      >
        <span className="text-right">Qty</span>
        <span>Item</span>
        <span className="text-right">Allocated</span>
        <span aria-hidden="true" />
      </div>

      {items.length === 0 && (
        <p className="px-4 py-3 text-xs text-muted-foreground border-b border-border">
          Nothing itemised yet — capture what this order needs, as vaguely or precisely as you know it.
        </p>
      )}

      {items.map((item) => {
        const product = item.productId ? productById.get(item.productId) : undefined;
        const name = item.productId
          ? product?.name ?? "(deleted product)"
          : item.notes || "(unspecified)";
        return pendingRemove === item.id ? (
          <div
            key={item.id}
            className="px-4 py-2.5 border-b border-border bg-status-alert-bg flex items-center justify-between gap-3 flex-wrap"
          >
            <p className="text-xs text-status-alert">
              Remove {formatPieces(item.quantity)} × {name} from this order?
            </p>
            <span className="flex items-center gap-3 text-xs shrink-0">
              <button
                onClick={async () => { await deleteOrderLineItem(item.id!); setPendingRemove(null); }}
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
          <LineItemRow
            key={item.id}
            item={item}
            name={name}
            product={product}
            activeProducts={activeProducts}
            allocated={allocated}
            onRemove={() => setPendingRemove(item.id!)}
          />
        );
      })}

      <AddLineItemRow orderId={orderId} nextSortOrder={items.reduce((max, i) => Math.max(max, i.sortOrder), -1) + 1} activeProducts={activeProducts} />
    </div>
  );
}

// ─── One editable row ────────────────────────────────────────────────────────

/** Borderless cell control: reads as a value until hovered or focused. */
const CELL_INPUT =
  "w-full min-w-0 bg-transparent rounded-md border border-transparent hover:border-border focus:border-foreground focus:outline-none px-1.5 py-0.5 text-sm";

function LineItemRow({
  item,
  name,
  product,
  activeProducts,
  allocated,
  onRemove,
}: {
  item: OrderLineItem;
  name: string;
  product: Product | undefined;
  activeProducts: Product[];
  allocated: Map<string, number>;
  onRemove: () => void;
}) {
  // Local drafts, keyed by the row (the row remounts per item id) so they
  // survive the re-render each autosave triggers.
  const [qty, setQty] = useState(String(item.quantity));
  const [note, setNote] = useState(item.notes ?? "");

  const fulfillment = lineItemFulfillment(item, allocated);

  function commitQty() {
    const parsed = parseInt(qty, 10);
    const next = !isNaN(parsed) && parsed > 0 ? parsed : 1;
    if (String(next) !== qty) setQty(String(next));
    if (next === item.quantity) return;
    updateOrderLineItemFields(item.id!, { quantity: next }, "Quantity");
  }

  function commitNote() {
    const trimmed = note.trim();
    if (trimmed === (item.notes ?? "")) return;
    updateOrderLineItemFields(item.id!, { notes: trimmed || undefined }, "Note");
  }

  function commitProduct(productId: string) {
    if ((productId || undefined) === item.productId) return;
    updateOrderLineItemFields(item.id!, { productId: productId || undefined }, "Product");
  }

  // The picker lists live products plus, when needed, the one this row already
  // holds — an archived product must stay selectable so the row doesn't show
  // the wrong value.
  const pickerProducts = product && product.archived
    ? [...activeProducts, product].sort((a, b) => a.name.localeCompare(b.name))
    : activeProducts;

  return (
    <div
      className="grid gap-3 px-4 py-2 border-b border-border items-start hover:bg-muted/40 transition-colors"
      style={{ gridTemplateColumns: LINE_GRID }}
    >
      <input
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        onBlur={commitQty}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        aria-label={`Quantity for ${name}`}
        className={`${CELL_INPUT} text-right tabular-nums font-medium`}
      />
      <div className="min-w-0 space-y-0.5">
        <select
          value={item.productId ?? ""}
          onChange={(e) => commitProduct(e.target.value)}
          aria-label={`Product for ${name}`}
          className={`${CELL_INPUT} font-medium ${!item.productId ? "text-muted-foreground italic" : ""}`}
        >
          <option value="">Unspecified</option>
          {item.productId && !product && <option value={item.productId}>(deleted product)</option>}
          {pickerProducts.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.archived ? " (archived)" : ""}</option>
          ))}
        </select>
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={commitNote}
          onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
          placeholder={item.productId ? "Add a note…" : "What is it? e.g. mix TBD, nut-free option"}
          aria-label={`Note for ${name}`}
          className={`${CELL_INPUT} !text-xs text-muted-foreground italic placeholder:not-italic placeholder:text-muted-foreground/50`}
        />
      </div>
      <span
        className={`text-xs tabular-nums text-right pt-1.5 ${
          fulfillment
            ? fulfillment.allocated >= fulfillment.needed ? "text-success font-medium" : "text-muted-foreground"
            : "text-muted-foreground/60"
        }`}
        title={fulfillment ? `${formatPieces(fulfillment.allocated)} of ${formatPieces(fulfillment.needed)} claimed from linked batches` : "Pick a product to track allocations"}
      >
        {fulfillment ? `${formatPieces(fulfillment.allocated)}/${formatPieces(fulfillment.needed)}` : "—"}
      </span>
      <button
        onClick={onRemove}
        aria-label={`Remove line item ${name}`}
        title="Remove line item"
        className="justify-self-end mt-1 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

// ─── Add row ─────────────────────────────────────────────────────────────────

/** The last row is the add row — itemising the order is the card's primary
 *  action, so it lives where the next line would go rather than behind a
 *  disclosure. Enter anywhere in the row adds. */
function AddLineItemRow({
  orderId,
  nextSortOrder,
  activeProducts,
}: {
  orderId: string;
  nextSortOrder: number;
  activeProducts: Product[];
}) {
  const [qty, setQty] = useState("");
  const [productId, setProductId] = useState("");
  const [note, setNote] = useState("");

  const qtyNum = parseInt(qty, 10);
  const valid = !isNaN(qtyNum) && qtyNum > 0;

  async function handleAdd() {
    if (!valid) return;
    await saveOrderLineItem({
      orderId,
      productId: productId || undefined,
      quantity: qtyNum,
      notes: note.trim() || undefined,
      sortOrder: nextSortOrder,
    });
    setQty("");
    setProductId("");
    setNote("");
  }

  return (
    <div onKeyDown={(e) => { if (e.key === "Enter" && valid) { e.preventDefault(); handleAdd(); } }}>
      <div className="grid gap-3 px-4 pt-2.5 items-center" style={{ gridTemplateColumns: LINE_GRID }}>
        <input
          type="number"
          min={1}
          step={1}
          inputMode="numeric"
          value={qty}
          onChange={(e) => setQty(e.target.value)}
          placeholder="Qty"
          aria-label="Line item quantity"
          className="input !py-1 !px-2 text-xs text-right tabular-nums w-full"
        />
        <select
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          aria-label="Line item product"
          className="input !py-1 !px-2 text-xs min-w-0"
        >
          <option value="">Unspecified</option>
          {activeProducts.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <span aria-hidden="true" />
        <button
          onClick={handleAdd}
          disabled={!valid}
          aria-label="Add line item"
          title="Add line item"
          className="justify-self-end w-6 h-6 rounded-md bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted/70 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
      {/* The note sits on its own line — it's free text and would squeeze the
          other columns if it shared the grid row. */}
      <div className="px-4 pt-1.5 pb-2.5">
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note… e.g. mix TBD, nut-free option"
          aria-label="Line item note"
          className="input !py-1 !px-2 text-xs w-full"
        />
      </div>
    </div>
  );
}
