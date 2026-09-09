"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  useDecorationMaterial,
  useDecorationMaterialUsage,
  useAllDecorationManufacturers,
  useAllDecorationVendors,
  useAllDecorationSources,
  updateDecorationMaterialFields,
  deleteDecorationMaterial,
  archiveDecorationMaterial,
  unarchiveDecorationMaterial,
  setDecorationMaterialLowStock,
  setDecorationMaterialOutOfStock,
  markDecorationMaterialOrdered,
  useDecorationCategories,
} from "@/lib/hooks";
import { db } from "@/lib/db";
import { UsedInPanel } from "@/components/pantry";
import { DECORATION_MATERIAL_TYPE_LABELS, COCOA_BUTTER_TYPES } from "@/types";
import type { CocoaButterType, DecorationMaterial, DecorationMaterialType } from "@/types";
import { StockStatusPanel } from "@/components/stock-status-panel";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { DetailSkeleton, DetailNotFound } from "@/components/detail-states";
import {
  SidebarCard, PropertyRow, PROPERTY_INPUT_CLASS,
} from "@/components/detail-sidebar";
import { ArrowLeft, Trash2, Archive, ArchiveRestore } from "lucide-react";
import Link from "next/link";
import { useSpaId } from "@/lib/use-spa-id";

const DEFAULT_COLOR = "#d4a017";

export default function DecorationMaterialPage() {
  const materialId = useSpaId("decoration");
  const router = useRouter();

  const material = useDecorationMaterial(materialId);
  const usedInProducts = useDecorationMaterialUsage(materialId);
  const allManufacturers = useAllDecorationManufacturers();
  const allVendors = useAllDecorationVendors();
  const allSources = useAllDecorationSources();
  const decorationCategories = useDecorationCategories();

  const [confirmDelete, setConfirmDelete] = useState(false);

  // Loading vs. not-found — the live query returns `undefined` for both, so a
  // one-shot direct read resolves which one it actually is.
  const [loadState, setLoadState] = useState<"loading" | "found" | "not-found">("loading");
  useEffect(() => {
    if (!materialId) return;
    let cancelled = false;
    db.decorationMaterials.get(materialId).then((m) => {
      if (!cancelled) setLoadState(m ? "found" : "not-found");
    });
    return () => { cancelled = true; };
  }, [materialId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && confirmDelete) setConfirmDelete(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete]);

  if (!materialId || loadState === "loading" || (loadState === "found" && !material)) {
    return <DetailSkeleton cards={1} sidebar={4} label="Loading decoration material" />;
  }
  if (loadState === "not-found" || !material) {
    return (
      <DetailNotFound
        entity="decoration material"
        backHref="/pantry/decoration"
        backLabel="Decoration materials"
      />
    );
  }

  const typeLabel =
    decorationCategories.find((c) => c.slug === material.type)?.name
    ?? DECORATION_MATERIAL_TYPE_LABELS[material.type as keyof typeof DECORATION_MATERIAL_TYPE_LABELS]
    ?? material.type;

  const subtitle = [
    typeLabel,
    material.type === "cocoa_butter" ? material.cocoaButterType : null,
    material.manufacturer,
    usedInProducts.length > 0
      ? `used in ${usedInProducts.length} product${usedInProducts.length === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean).join(" · ");

  async function handleDelete() {
    if (!materialId) return;
    await deleteDecorationMaterial(materialId);
    router.replace("/pantry/decoration");
  }

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <Link
          href="/pantry/decoration"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Decoration materials
        </Link>
      </div>

      {/* Header */}
      <div className="px-4 pb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <span
            aria-hidden="true"
            className="w-4 h-4 rounded-full border border-black/10 shrink-0"
            style={{ backgroundColor: material.color ?? "#9ca3af" }}
          />
          <InlineNameEditor
            name={material.name}
            onSave={async (n) => { await updateDecorationMaterialFields(materialId, { name: n }, "Name"); }}
            className="text-xl font-bold"
          />
          {material.archived && (
            <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[10px] font-medium flex items-center gap-1 shrink-0">
              <Archive className="w-3 h-3" /> Archived
            </span>
          )}
        </div>
        <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>
      </div>

      <div className="px-4 pb-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        {/* ── Main column ── */}
        <div className="space-y-4 min-w-0">
          <NotesCard key={material.id} materialId={materialId} material={material} />

          {/* ── Destructive actions ── */}
          <div className="pt-2 space-y-3">
            {material.archived ? (
              <button
                onClick={() => unarchiveDecorationMaterial(materialId)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArchiveRestore className="w-4 h-4" /> Unarchive material
              </button>
            ) : usedInProducts.length > 0 ? (
              /* Referenced by a shell design — archive is the only way out. */
              confirmDelete ? (
                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
                    <p className="text-sm font-medium">Delete is blocked</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Used by {usedInProducts.length} product
                    {usedInProducts.length === 1 ? "" : "s"} through their shell designs.
                    Archiving hides it from lists while keeping those designs intact.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => {
                        await archiveDecorationMaterial(materialId);
                        setConfirmDelete(false);
                        router.replace("/pantry/decoration");
                      }}
                      className="btn-primary px-4 py-2 text-sm"
                    >
                      Archive instead
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-4 py-2">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Archive className="w-4 h-4" /> Archive material
                </button>
              )
            ) : (
              confirmDelete ? (
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                  <p className="text-sm text-destructive font-medium">Delete this material?</p>
                  <p className="text-xs text-muted-foreground">
                    No shell design references it. This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={handleDelete}
                      className="rounded-full bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium"
                    >
                      Yes, delete
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-4 py-2">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-destructive transition-colors"
                >
                  <Trash2 className="w-4 h-4" /> Delete material
                </button>
              )
            )}
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4 lg:sticky lg:top-4">
          <SidebarCard title="Stock">
            <StockStatusPanel
              lowStock={material.lowStock}
              lowStockOrdered={material.lowStockOrdered}
              outOfStock={material.outOfStock}
              itemName={material.name}
              onFlagLowStock={() => setDecorationMaterialLowStock(materialId, true)}
              onFlagOutOfStock={() => setDecorationMaterialOutOfStock(materialId, true)}
              onMarkOrdered={() => markDecorationMaterialOrdered(materialId)}
              onClearOutOfStock={() => setDecorationMaterialOutOfStock(materialId, false)}
              onClearLowStock={() => setDecorationMaterialLowStock(materialId, false)}
            />
          </SidebarCard>

          <PropertiesCard
            key={`props-${material.id}`}
            materialId={materialId}
            material={material}
            decorationCategories={decorationCategories}
            manufacturers={allManufacturers}
            vendors={allVendors}
            sources={allSources}
          />

          <SidebarCard
            title="Used in"
            meta={usedInProducts.length > 0 ? usedInProducts.length : undefined}
          >
            <UsedInPanel
              singular="product"
              plural="products"
              items={usedInProducts.map((product) => ({
                id: product.id ?? "",
                name: product.name,
                href: `/products/${encodeURIComponent(product.id ?? "")}`,
                photo: product.photo,
              }))}
              emptyMessage="Not used in any shell design yet."
              hideHeading
            />
          </SidebarCard>
        </div>
      </div>
    </div>
  );
}

// ─── Sidebar: Properties ─────────────────────────────────────────────────────

function PropertiesCard({
  materialId,
  material,
  decorationCategories,
  manufacturers,
  vendors,
  sources,
}: {
  materialId: string;
  material: DecorationMaterial;
  decorationCategories: { slug: string; name: string }[];
  manufacturers: string[];
  vendors: string[];
  sources: string[];
}) {
  return (
    <SidebarCard title="Properties">
      <div className="space-y-1">
        <PropertyRow label="Type">
          <select
            value={material.type}
            onChange={(e) => updateDecorationMaterialFields(materialId, { type: e.target.value as DecorationMaterialType }, "Type")}
            aria-label="Type"
            className={PROPERTY_INPUT_CLASS}
          >
            {decorationCategories.map((c) => (
              <option key={c.slug} value={c.slug}>{c.name}</option>
            ))}
            {/* Legacy types that predate the categories table still need to be
                selectable, or changing another field would silently reassign them. */}
            {decorationCategories.length > 0 && !decorationCategories.some((c) => c.slug === material.type) && (
              <option value={material.type}>
                {DECORATION_MATERIAL_TYPE_LABELS[material.type as keyof typeof DECORATION_MATERIAL_TYPE_LABELS] ?? material.type}
              </option>
            )}
          </select>
        </PropertyRow>

        {material.type === "cocoa_butter" && (
          <PropertyRow label="Cocoa butter type">
            <select
              value={material.cocoaButterType ?? ""}
              onChange={(e) =>
                updateDecorationMaterialFields(
                  materialId,
                  { cocoaButterType: (e.target.value || undefined) as CocoaButterType | undefined },
                  "Cocoa butter type",
                )
              }
              aria-label="Cocoa butter type"
              className={PROPERTY_INPUT_CLASS}
            >
              <option value="">Unknown</option>
              {COCOA_BUTTER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </PropertyRow>
        )}

        <PropertyRow label="Colour">
          <span className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground font-mono">
              {material.color ?? DEFAULT_COLOR}
            </span>
            <input
              type="color"
              value={material.color ?? DEFAULT_COLOR}
              onChange={(e) => updateDecorationMaterialFields(materialId, { color: e.target.value }, "Colour")}
              aria-label="Colour"
              title="Pick colour"
              className="w-7 h-7 rounded-md border border-border cursor-pointer p-0.5 shrink-0"
            />
          </span>
        </PropertyRow>

        <TextPropertyRow
          label="Manufacturer"
          value={material.manufacturer ?? ""}
          suggestions={manufacturers}
          listId="decoration-manufacturer-list"
          onCommit={(v) => updateDecorationMaterialFields(materialId, { manufacturer: v || undefined }, "Manufacturer")}
        />
        <TextPropertyRow
          label="Vendor"
          value={material.vendor ?? ""}
          suggestions={vendors}
          listId="decoration-vendor-list"
          onCommit={(v) => updateDecorationMaterialFields(materialId, { vendor: v || undefined }, "Vendor")}
        />
        <TextPropertyRow
          label="Source"
          value={material.source ?? ""}
          suggestions={sources}
          listId="decoration-source-list"
          onCommit={(v) => updateDecorationMaterialFields(materialId, { source: v || undefined }, "Source")}
        />
      </div>
    </SidebarCard>
  );
}

/** A property row holding free text: local draft while typing, commit on blur,
 *  and only when the value actually moved. */
function TextPropertyRow({
  label,
  value,
  suggestions,
  listId,
  onCommit,
}: {
  label: string;
  value: string;
  suggestions: string[];
  listId: string;
  onCommit: (next: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  // Track what the draft was seeded from, so a change made elsewhere refreshes
  // the input without a prop-sync effect.
  const [seed, setSeed] = useState(value);
  if (seed !== value) {
    setSeed(value);
    setDraft(value);
  }

  return (
    <PropertyRow label={label}>
      <input
        type="text"
        list={listId}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const trimmed = draft.trim();
          if (trimmed === value) return;
          onCommit(trimmed);
        }}
        placeholder="—"
        aria-label={label}
        className={PROPERTY_INPUT_CLASS}
      />
      {suggestions.length > 0 && (
        <datalist id={listId}>
          {suggestions.map((s) => <option key={s} value={s} />)}
        </datalist>
      )}
    </PropertyRow>
  );
}

// ─── Main: Notes ─────────────────────────────────────────────────────────────

function NotesCard({
  materialId,
  material,
}: {
  materialId: string;
  material: DecorationMaterial;
}) {
  const [value, setValue] = useState(material.notes ?? "");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function commit(next: string) {
    const trimmed = next.trim();
    if (trimmed === (material.notes ?? "")) return;
    updateDecorationMaterialFields(materialId, { notes: trimmed || undefined }, "Notes");
  }

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
          placeholder="How it sprays, what it pairs with, how much to warm it…"
          rows={4}
          aria-label="Notes"
          className="w-full text-sm bg-transparent border-0 resize-none focus:outline-none placeholder:text-muted-foreground/60"
        />
      </div>
    </div>
  );
}
