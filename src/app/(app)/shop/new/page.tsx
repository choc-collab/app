"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CavityPreview } from "@/components/shop/cavity-preview";
import {
  useAllCollectionPackagings,
  useCollections,
  useCurrencySymbol,
  usePackagingList,
} from "@/lib/hooks";
import type { ShopProductInfo } from "@/lib/shopColor";
import type { Packaging } from "@/types";

export default function ShopNewSalePage() {
  const collections = useCollections();
  const packagings = usePackagingList(true);
  const cps = useAllCollectionPackagings();
  const symbol = useCurrencySymbol();

  const packagingById = useMemo(() => {
    const m = new Map<string, Packaging>();
    for (const p of packagings) if (p.id) m.set(p.id, p);
    return m;
  }, [packagings]);

  const collectionNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of collections) if (c.id) m.set(c.id, c.name);
    return m;
  }, [collections]);

  // Skip rows whose collection or packaging no longer exists (archived or
  // manually cleaned up). Keeps the picker safe against dangling FKs.
  const rows = useMemo(
    () => cps
      .filter((cp) => packagingById.has(cp.packagingId) && collectionNameById.has(cp.collectionId))
      .sort((a, b) => {
        const ca = collectionNameById.get(a.collectionId)!;
        const cb = collectionNameById.get(b.collectionId)!;
        if (ca !== cb) return ca.localeCompare(cb);
        const pa = packagingById.get(a.packagingId)!;
        const pb = packagingById.get(b.packagingId)!;
        return pa.capacity - pb.capacity;
      }),
    [cps, packagingById, collectionNameById],
  );

  return (
    <div className="p-6 max-w-4xl">
      <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground mb-1">
        Step 1 of 3
      </div>
      <h1 className="font-[family-name:var(--font-display)] text-2xl sm:text-3xl tracking-tight mb-1">
        Which box?
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        Pick a collection and box size. The price is set on the collection.
      </p>

      {rows.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map((cp) => {
            const pkg = packagingById.get(cp.packagingId)!;
            const collectionName = collectionNameById.get(cp.collectionId)!;
            return (
              <Link
                key={cp.id}
                href={`/shop/new/${encodeURIComponent(cp.id!)}`}
                className="block rounded-xl border border-border bg-card p-4 hover:border-primary/30 hover:shadow-sm transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                data-testid="shop-box-card"
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="min-w-0">
                    <div className="text-xs font-mono uppercase tracking-wide text-muted-foreground">
                      {collectionName}
                    </div>
                    <div className="font-medium text-sm truncate">{pkg.name}</div>
                  </div>
                  <div className="text-xs font-mono text-muted-foreground shrink-0">
                    {pkg.capacity} × cavity
                  </div>
                </div>

                <div className="flex justify-center mb-3">
                  <CavityPreview
                    cells={Array(pkg.capacity).fill(null)}
                    packaging={pkg}
                    productInfoById={EMPTY_INFO_MAP}
                    cellSize={36}
                    gap={3}
                    pad={8}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Fill and print</span>
                  <span className="font-mono text-sm tabular-nums">
                    {symbol}
                    {cp.sellPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mt-6">
        <Link href="/shop" className="text-sm text-muted-foreground hover:text-foreground">
          ← Back to shop
        </Link>
      </div>
    </div>
  );
}

// Shared constant — all cavities render as empty, so no lookup is needed.
const EMPTY_INFO_MAP = new Map<string, ShopProductInfo>();

function EmptyState() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card p-5">
      <h2 className="text-sm font-medium mb-1">Nothing to sell yet</h2>
      <p className="text-sm text-muted-foreground mb-3">
        Create a collection with at least one packaging size and sell price, then the options will show up here.
      </p>
      <Link href="/collections" className="btn-secondary inline-block">
        Open Collections
      </Link>
    </div>
  );
}
