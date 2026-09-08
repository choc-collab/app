"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  useOrderProductionLinks, useProductionPlans, useProductsList, useMouldsList, usePlanProducts,
  linkOrderToPlan, addOrderPlanAllocation, removeOrderPlanAllocation, unlinkOrderFromPlan,
} from "@/lib/hooks";
import { groupLinksByPlan } from "@/lib/orders";
import { PLAN_STATUS_LABEL, PLAN_STATUS_STYLE, getTotalCavities } from "@/lib/production";
import type { OrderProductionLink, ProductionPlan, Mould } from "@/types";
import { Factory, X, AlertTriangle } from "lucide-react";

/** Read-view section tying the order to the production batches that fulfil
 *  it. A batch starts as a bare association ("this batch is for this order")
 *  and refines into per-product allocations ("20 × Dark caramel from this
 *  batch"). Unlinking a batch or removing an allocation is a two-step inline
 *  confirm (standing rule for removal actions). */
export function LinkedBatchesSection({ orderId }: { orderId: string }) {
  const links = useOrderProductionLinks(orderId);
  const plans = useProductionPlans(); // newest first
  const products = useProductsList(true); // include archived so names don't vanish
  const moulds = useMouldsList(true);
  const [selectedPlanId, setSelectedPlanId] = useState("");

  const planById = useMemo(() => {
    const m = new Map<string, ProductionPlan>();
    for (const p of plans) if (p.id) m.set(p.id, p);
    return m;
  }, [plans]);

  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) if (p.id) m.set(p.id, p.name);
    return m;
  }, [products]);

  const mouldsById = useMemo(() => {
    const m = new Map<string, Mould>();
    for (const x of moulds) if (x.id) m.set(x.id, x);
    return m;
  }, [moulds]);

  const groups = useMemo(() => groupLinksByPlan(links), [links]);

  // Any row (bare or allocation) excludes the plan from the picker — further
  // products are added inside its group.
  const linkablePlans = useMemo(
    () => plans.filter((p) => p.id && !groups.has(p.id)),
    [plans, groups],
  );

  async function handleLink() {
    if (!selectedPlanId) return;
    await linkOrderToPlan(orderId, selectedPlanId);
    setSelectedPlanId("");
  }

  return (
    <div>
      <div className="mono-label text-muted-foreground mb-1.5">Linked batches</div>
      <div className="rounded-lg border border-border bg-card p-4 space-y-4">
        {groups.size === 0 && (
          <p className="text-xs text-muted-foreground">
            No batches linked yet — link the production batches you&apos;re making for this order.
          </p>
        )}

        {[...groups.entries()].map(([planId, rows]) => {
          const plan = planById.get(planId);
          if (!plan) return null; // plan deleted; cleanup removes the rows
          return (
            <BatchGroup
              key={planId}
              orderId={orderId}
              plan={plan}
              rows={rows}
              productNameById={productNameById}
              mouldsById={mouldsById}
            />
          );
        })}

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

/** One linked batch: header (name, batch number, status, unlink) plus its
 *  per-product allocation rows and an add-allocation row scoped to the
 *  products this batch actually makes. */
function BatchGroup({
  orderId,
  plan,
  rows,
  productNameById,
  mouldsById,
}: {
  orderId: string;
  plan: ProductionPlan;
  rows: OrderProductionLink[];
  productNameById: Map<string, string>;
  mouldsById: Map<string, Mould>;
}) {
  const planProducts = usePlanProducts(plan.id);
  const [confirmUnlinkBatch, setConfirmUnlinkBatch] = useState(false);
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);
  const [addProductId, setAddProductId] = useState("");
  const [addQty, setAddQty] = useState("");

  // "You're allocating 20 of ~112": the batch's output of each product —
  // actual yield once unmoulded, planned cavities before. Null hides the
  // denominator and the over-allocation warning (production/page.tsx canon).
  const batchPiecesByProduct = useMemo(() => {
    const m = new Map<string, number | null>();
    for (const pp of planProducts) {
      const planned = getTotalCavities(pp, mouldsById);
      m.set(pp.productId, pp.actualYield ?? (planned > 0 ? planned : null));
    }
    return m;
  }, [planProducts, mouldsById]);

  const allocations = rows.filter((r) => r.productId != null);

  async function handleAddAllocation(e: React.FormEvent) {
    e.preventDefault();
    const quantity = Math.max(1, parseInt(addQty) || 0);
    if (!addProductId || !quantity || !plan.id) return;
    await addOrderPlanAllocation(orderId, plan.id, addProductId, quantity);
    setAddProductId("");
    setAddQty("");
  }

  return (
    <div className="space-y-1.5">
      {/* Group header */}
      <div className="flex items-center gap-2">
        <Factory className="w-4 h-4 text-muted-foreground shrink-0" aria-hidden />
        <Link
          href={`/production/${encodeURIComponent(plan.id!)}`}
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
        {confirmUnlinkBatch ? (
          <span className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs text-destructive">Remove?</span>
            <button
              onClick={async () => {
                await unlinkOrderFromPlan(orderId, plan.id!);
                setConfirmUnlinkBatch(false);
              }}
              className="text-xs font-medium text-destructive hover:underline"
            >
              Yes
            </button>
            <button
              onClick={() => setConfirmUnlinkBatch(false)}
              className="text-xs text-muted-foreground hover:underline"
            >
              Cancel
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmUnlinkBatch(true)}
            aria-label={`Unlink ${plan.name}`}
            title="Unlink batch"
            className="p-1 rounded-full hover:bg-muted transition-colors shrink-0"
          >
            <X className="w-3.5 h-3.5 text-muted-foreground" />
          </button>
        )}
      </div>

      {/* Allocation rows */}
      {allocations.length > 0 && (
        <ul className="space-y-1 pl-6">
          {allocations.map((row) => {
            const name = productNameById.get(row.productId!) ?? "(deleted product)";
            const denominator = batchPiecesByProduct.get(row.productId!) ?? null;
            const over = denominator != null && (row.quantity ?? 0) > denominator;
            return (
              <li key={row.id} className="flex items-center gap-2 text-sm">
                <span className="tabular-nums font-medium shrink-0">{row.quantity} ×</span>
                <span className={`flex-1 min-w-0 truncate ${!productNameById.has(row.productId!) ? "text-muted-foreground italic" : ""}`}>
                  {name}
                </span>
                {denominator != null && (
                  <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                    of ~{denominator}
                  </span>
                )}
                {over && (
                  <span
                    className="flex items-center gap-1 text-xs text-status-warn shrink-0"
                    title="Allocation exceeds this batch's output of this product"
                  >
                    <AlertTriangle className="w-3 h-3" aria-hidden />
                    over batch yield
                  </span>
                )}
                {confirmRemoveId === row.id ? (
                  <span className="flex items-center gap-1.5 shrink-0">
                    <span className="text-xs text-destructive">Remove?</span>
                    <button
                      onClick={async () => {
                        await removeOrderPlanAllocation(row.id!);
                        setConfirmRemoveId(null);
                      }}
                      className="text-xs font-medium text-destructive hover:underline"
                    >
                      Yes
                    </button>
                    <button
                      onClick={() => setConfirmRemoveId(null)}
                      className="text-xs text-muted-foreground hover:underline"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmRemoveId(row.id!)}
                    aria-label={`Remove allocation ${name}`}
                    title="Remove allocation"
                    className="p-1 rounded-full hover:bg-muted transition-colors shrink-0"
                  >
                    <X className="w-3 h-3 text-muted-foreground" />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Add-allocation row, scoped to this batch's products */}
      {planProducts.length === 0 ? (
        <p className="text-xs text-muted-foreground pl-6">No products in this batch to allocate.</p>
      ) : (
        <form onSubmit={handleAddAllocation} className="flex gap-2 pl-6">
          <select
            className="input flex-1 text-sm"
            value={addProductId}
            onChange={(e) => setAddProductId(e.target.value)}
            aria-label={`Allocate a product from ${plan.name}`}
          >
            <option value="">Allocate a product…</option>
            {planProducts.map((pp) => {
              const name = productNameById.get(pp.productId) ?? "(deleted product)";
              const pieces = batchPiecesByProduct.get(pp.productId);
              return (
                <option key={pp.id} value={pp.productId}>
                  {name}{pieces != null ? ` — ~${pieces} pcs` : ""}
                </option>
              );
            })}
          </select>
          <input
            type="number"
            min={1}
            value={addQty}
            onChange={(e) => setAddQty(e.target.value)}
            placeholder="Qty"
            aria-label={`Allocation quantity for ${plan.name}`}
            className="input !w-20 shrink-0 text-sm"
          />
          <button
            type="submit"
            disabled={!addProductId || !(parseInt(addQty) > 0)}
            className="btn-secondary px-3 py-1.5 text-sm"
          >
            Add
          </button>
        </form>
      )}
    </div>
  );
}
