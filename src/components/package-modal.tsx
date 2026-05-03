"use client";

import { useEffect, useMemo, useState } from "react";
import { Package } from "lucide-react";
import type { Collection, CollectionPackaging, Packaging } from "@/types";

export type PackageChoice = {
  planProductId: string;
  productName: string;
  quantity: number;           // how many to wrap — always == actualYield
  collectionId: string;       // one of the available CollectionPackaging rows
  packagingId: string;        // wrapper
  price: number;              // unit sell price from CollectionPackaging
};

type AvailableOption = {
  collectionId: string;
  collectionName: string;
  packagingId: string;
  packagingName: string;
  price: number;
};

/**
 * Package modal — per bar-type plan product in the batch, pick which
 * collection × wrapper packaging to ship these bars into at the Shop. Defaults
 * to the first available option for each product when there's more than one.
 *
 * `entries` should be pre-filtered to bar products with `actualYield` already
 * recorded; the wizard enforces this ordering (unmould → package).
 */
export function PackageModal({
  entries,
  collections,
  packagings,
  collectionPackagings,
  currencySymbol,
  onConfirm,
  onCancel,
}: {
  entries: Array<{
    planProductId: string;
    productName: string;
    quantity: number;
  }>;
  collections: Collection[];
  packagings: Packaging[];
  collectionPackagings: CollectionPackaging[];
  currencySymbol: string;
  onConfirm: (choices: PackageChoice[]) => void;
  onCancel: () => void;
}) {
  const collectionById = useMemo(
    () => new Map(collections.map((c) => [c.id!, c])),
    [collections],
  );
  const packagingById = useMemo(
    () => new Map(packagings.map((p) => [p.id!, p])),
    [packagings],
  );

  // All CollectionPackaging rows flattened into display-ready options. Bars
  // are wrapped in small-capacity packagings (typically capacity === 1); we
  // filter to those so the list doesn't offer a Box-of-9 wrapper for a bar.
  const options = useMemo<AvailableOption[]>(() => {
    return collectionPackagings
      .map((cp): AvailableOption | null => {
        const pkg = packagingById.get(cp.packagingId);
        const coll = collectionById.get(cp.collectionId);
        if (!pkg || !coll) return null;
        // Single-piece wrappers only — a bar doesn't fit into an assortment
        // box, and the wizard's per-bar packaging flow shouldn't offer one.
        if (pkg.capacity !== 1) return null;
        return {
          collectionId: coll.id!,
          collectionName: coll.name,
          packagingId: pkg.id!,
          packagingName: pkg.name,
          price: cp.sellPrice,
        };
      })
      .filter((o): o is AvailableOption => o !== null)
      .sort((a, b) =>
        a.collectionName.localeCompare(b.collectionName) ||
        a.packagingName.localeCompare(b.packagingName),
      );
  }, [collectionPackagings, collectionById, packagingById]);

  const noOptions = options.length === 0;

  const [selection, setSelection] = useState<Record<string, string>>(() => {
    // Default each product to the first option; encoded as "collectionId::packagingId"
    const init: Record<string, string> = {};
    if (options.length > 0) {
      const first = `${options[0].collectionId}::${options[0].packagingId}`;
      for (const e of entries) init[e.planProductId] = first;
    }
    return init;
  });

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onCancel]);

  function buildChoices(): PackageChoice[] {
    return entries.map((e) => {
      const key = selection[e.planProductId];
      const [collectionId, packagingId] = key?.split("::") ?? ["", ""];
      const opt = options.find(
        (o) => o.collectionId === collectionId && o.packagingId === packagingId,
      );
      return {
        planProductId: e.planProductId,
        productName: e.productName,
        quantity: e.quantity,
        collectionId,
        packagingId,
        price: opt?.price ?? 0,
      };
    });
  }

  const totalRevenue = buildChoices().reduce(
    (sum, c) => sum + c.price * c.quantity,
    0,
  );

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onCancel} />

      <div className="relative w-full max-w-md mx-4 mb-4 sm:mb-0 rounded-2xl border border-border bg-card shadow-xl overflow-hidden">
        <div className="bg-gradient-to-b from-amber-50 to-card px-5 pt-5 pb-3">
          <div className="flex items-center gap-3 mb-1">
            <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center">
              <Package className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">
                Package for the Shop
              </h3>
              <p className="text-xs text-muted-foreground">
                Wrap these bars and drop them straight onto the counter.
              </p>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 space-y-4">
          {noOptions ? (
            <div className="rounded-lg border border-status-warn-edge bg-status-warn-bg px-3 py-2.5 text-xs text-status-warn">
              No single-piece wrappers are set up in any collection yet. Add a
              capacity-1 packaging to a collection (with a sell price) to
              enable shop-ready bar packaging.
            </div>
          ) : (
            entries.map((entry) => (
              <div key={entry.planProductId} className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <label className="text-sm font-medium text-foreground truncate">
                    {entry.productName}
                  </label>
                  <span className="text-[11px] text-muted-foreground font-mono tabular-nums shrink-0">
                    ×{entry.quantity}
                  </span>
                </div>
                <select
                  value={selection[entry.planProductId] ?? ""}
                  onChange={(e) =>
                    setSelection((prev) => ({
                      ...prev,
                      [entry.planProductId]: e.target.value,
                    }))
                  }
                  className="w-full rounded-lg border border-border bg-card px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                  data-testid={`package-select-${entry.planProductId}`}
                >
                  {options.map((o) => (
                    <option
                      key={`${o.collectionId}::${o.packagingId}`}
                      value={`${o.collectionId}::${o.packagingId}`}
                    >
                      {o.collectionName} — {o.packagingName} · {currencySymbol}
                      {o.price.toFixed(2)}
                    </option>
                  ))}
                </select>
              </div>
            ))
          )}
        </div>

        {!noOptions && (
          <div className="px-5 py-2 border-t border-border/50 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Ready to sell at the counter
            </span>
            <span className="text-sm font-semibold tabular-nums">
              {currencySymbol}
              {totalRevenue.toLocaleString(undefined, {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
        )}

        <div className="px-5 py-4 border-t border-border flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="rounded-full border border-border bg-card px-4 py-2 text-sm text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(buildChoices())}
            disabled={noOptions}
            className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Send to Shop
          </button>
        </div>
      </div>
    </div>
  );
}
