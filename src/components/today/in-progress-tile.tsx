"use client";

import Link from "next/link";
import { useMemo } from "react";
import { BookOpen } from "lucide-react";
import { useProductionPlans, useAllPlanProducts, useAllPlanFillings, useProductsList, useFillings, useMouldsList } from "@/lib/hooks";
import { getTotalCavities } from "@/lib/production";
import type { ProductionPlan, Mould } from "@/types";

const MAX_ROWS = 3;

interface BatchContent {
  products: { productId: string; name: string; pieces: number }[];
  fillings: { fillingId: string; name: string; grams: number }[];
}

/** Compact mini-board for active and draft production plans. Replaces the
 *  generic "In progress · N · Open board →" StatTile with a list of batch
 *  names, each linking to its detail page (`/production/[id]`) and its
 *  scaled-recipes view (`/production/[id]/products`). Hover/title surfaces
 *  the batch contents (products + fillings) for quick glance.
 *
 *  Long lists truncate at MAX_ROWS with a "N more on the board →" link to
 *  `/production`. Empty state matches the muted style of the other tiles. */
export function InProgressTile() {
  const plans = useProductionPlans();
  const allPlanProducts = useAllPlanProducts();
  const allPlanFillings = useAllPlanFillings();
  const products = useProductsList();
  const fillings = useFillings();
  const moulds = useMouldsList(true);

  const productNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of products) if (p.id) m.set(p.id, p.name);
    return m;
  }, [products]);
  const fillingNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const f of fillings) if (f.id) m.set(f.id, f.name);
    return m;
  }, [fillings]);
  const mouldsById = useMemo(() => {
    const m = new Map<string, Mould>();
    for (const x of moulds) if (x.id) m.set(x.id, x);
    return m;
  }, [moulds]);

  // For each plan id, a structured list of its products (with planned piece
  // counts) and standalone fillings (with target grams). Used by the
  // hover-popover that appears over each batch name.
  const contentByPlanId = useMemo(() => {
    const m = new Map<string, BatchContent>();
    function ensure(planId: string): BatchContent {
      let existing = m.get(planId);
      if (!existing) {
        existing = { products: [], fillings: [] };
        m.set(planId, existing);
      }
      return existing;
    }
    for (const pp of allPlanProducts) {
      const name = productNameById.get(pp.productId);
      if (!name) continue;
      const pieces = getTotalCavities(pp, mouldsById);
      ensure(pp.planId).products.push({ productId: pp.productId, name, pieces });
    }
    for (const pf of allPlanFillings) {
      const name = fillingNameById.get(pf.fillingId);
      if (!name) continue;
      ensure(pf.planId).fillings.push({ fillingId: pf.fillingId, name, grams: pf.targetGrams });
    }
    // Stable sort within each plan: most-pieces first for products, most-grams first for fillings.
    for (const c of m.values()) {
      c.products.sort((a, b) => b.pieces - a.pieces || a.name.localeCompare(b.name));
      c.fillings.sort((a, b) => b.grams - a.grams || a.name.localeCompare(b.name));
    }
    return m;
  }, [allPlanProducts, allPlanFillings, productNameById, fillingNameById, mouldsById]);

  const activePlans = useMemo(
    () => plans
      .filter((p) => p.status === "active" || p.status === "draft")
      .sort((a, b) => sortPlans(a, b)),
    [plans],
  );

  const empty = activePlans.length === 0;
  const visible = activePlans.slice(0, MAX_ROWS);
  const remaining = activePlans.length - visible.length;

  return (
    <div className={`h-full flex flex-col gap-2 rounded-lg border border-border bg-card p-4 ${empty ? "opacity-60" : ""}`}>
      <div className="flex items-baseline justify-between gap-2">
        <span className="mono-label text-muted-foreground">In progress</span>
        {!empty && (
          <span className="text-xs font-mono text-muted-foreground tabular-nums">
            {activePlans.length}
          </span>
        )}
      </div>

      {empty ? (
        <p className="text-xs text-muted-foreground mt-1">Nothing in progress.</p>
      ) : (
        <>
          <ul className="flex flex-col">
            {visible.map((plan) => {
              const content = contentByPlanId.get(plan.id!);
              return (
                <li key={plan.id} className="flex items-center gap-1 -mx-1 py-1">
                  <BatchContentsPopover content={content}>
                    <Link
                      href={`/production/${plan.id}`}
                      className="flex-1 min-w-0 px-1 text-sm font-medium truncate hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground rounded block"
                    >
                      {plan.name}
                      {plan.status === "draft" && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-muted-foreground font-normal">
                          draft
                        </span>
                      )}
                    </Link>
                  </BatchContentsPopover>
                  <Link
                    href={`/production/${plan.id}/products`}
                    aria-label="View scaled recipes"
                    title="View scaled recipes"
                    className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0"
                  >
                    <BookOpen className="w-4 h-4 text-muted-foreground" />
                  </Link>
                </li>
              );
            })}
          </ul>
          {remaining > 0 && (
            <Link
              href="/production"
              className="mt-auto text-xs text-muted-foreground hover:text-foreground self-start"
            >
              {remaining} more on the board →
            </Link>
          )}
        </>
      )}
    </div>
  );
}

/** Hover/focus popover that lists the batch's planned products (with piece
 *  counts) and standalone fillings (with target grams). Pure CSS — same
 *  approach as `CavityContentsPopover` in the shop: always rendered, hidden
 *  via opacity, opens on `:hover` and `:focus-within` of the wrapper.
 *  Pointer-events disabled so the underlying link still receives clicks. */
function BatchContentsPopover({
  content,
  children,
}: {
  content: BatchContent | undefined;
  children: React.ReactNode;
}) {
  const hasContent = !!content && (content.products.length > 0 || content.fillings.length > 0);
  // Build a plain-text fallback for the title attribute so touch / non-hover
  // users still get the information through long-press.
  const summary = !hasContent
    ? "Empty batch"
    : [
        ...content!.products.map((p) => `${p.name} ×${p.pieces}`),
        ...content!.fillings.map((f) => `${f.name} ${formatGrams(f.grams)}`),
      ].join(", ");

  return (
    <div
      className="relative group flex-1 min-w-0"
      title={summary}
    >
      {children}
      {hasContent && (
        <div
          role="tooltip"
          className="absolute left-0 top-full mt-1.5 z-20 w-max max-w-[18rem] rounded-md border border-border bg-card shadow-lg px-3 py-2.5 opacity-0 pointer-events-none transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100"
        >
          {content!.products.length > 0 && (
            <>
              <div className="mono-label text-muted-foreground">Products</div>
              <ul className="flex flex-col gap-0.5 mt-1 mb-1.5">
                {content!.products.map((p) => (
                  <li key={p.productId} className="flex items-center gap-2 text-xs leading-tight">
                    <span className="flex-1 truncate">{p.name}</span>
                    <span className="font-mono text-muted-foreground tabular-nums">×{p.pieces}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {content!.fillings.length > 0 && (
            <>
              <div className="mono-label text-muted-foreground mt-1">Fillings</div>
              <ul className="flex flex-col gap-0.5 mt-1">
                {content!.fillings.map((f) => (
                  <li key={f.fillingId} className="flex items-center gap-2 text-xs leading-tight">
                    <span className="flex-1 truncate">{f.name}</span>
                    <span className="font-mono text-muted-foreground tabular-nums">{formatGrams(f.grams)}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function formatGrams(g: number): string {
  if (g >= 1000) return `${(g / 1000).toFixed(g % 1000 === 0 ? 0 : 1)} kg`;
  return `${Math.round(g)} g`;
}

/** Active batches first (status="active"), then drafts. Within each bucket,
 *  most-recently-updated first — what you touched last is what you're
 *  thinking about now. */
function sortPlans(a: ProductionPlan, b: ProductionPlan): number {
  const sa = a.status === "active" ? 0 : 1;
  const sb = b.status === "active" ? 0 : 1;
  if (sa !== sb) return sa - sb;
  return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
}
