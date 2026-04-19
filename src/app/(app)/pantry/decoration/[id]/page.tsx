"use client";

import { use, useState, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useDecorationMaterial,
  useDecorationMaterialUsage,
  useAllDecorationManufacturers,
  useAllDecorationVendors,
  useAllDecorationSources,
  saveDecorationMaterial,
  deleteDecorationMaterial,
  archiveDecorationMaterial,
  unarchiveDecorationMaterial,
  setDecorationMaterialLowStock,
  setDecorationMaterialOutOfStock,
  markDecorationMaterialOrdered,
  useDecorationCategories,
} from "@/lib/hooks";
import { UsedInPanel } from "@/components/pantry";
import { DECORATION_MATERIAL_TYPE_LABELS, COCOA_BUTTER_TYPES } from "@/types";
import type { CocoaButterType } from "@/types";
import { StockStatusPanel } from "@/components/stock-status-panel";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { ArrowLeft, Pencil, Trash2, Archive, ArchiveRestore } from "lucide-react";
import Link from "next/link";
import { useNavigationGuard } from "@/lib/useNavigationGuard";

export default function DecorationMaterialPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);
  const materialId = decodeURIComponent(idStr);
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";

  const material = useDecorationMaterial(materialId);
  const usedInProducts = useDecorationMaterialUsage(materialId);
  const allManufacturers = useAllDecorationManufacturers();
  const allVendors = useAllDecorationVendors();
  const allSources = useAllDecorationSources();
  const decorationCategories = useDecorationCategories();

  // Open directly in edit mode when just created
  const [editing, setEditing] = useState(isNew);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Edit form state
  const [type, setType] = useState("cocoa_butter");
  const [cocoaButterType, setCocoaButterType] = useState<CocoaButterType | "">("");
  const [color, setColor] = useState("#d4a017");
  const [manufacturer, setManufacturer] = useState("");
  const [vendor, setVendor] = useState("");
  const [source, setSource] = useState("");
  const [notes, setNotes] = useState("");

  // Navigation guard — delete incomplete record if user leaves a ?new=1 page without saving
  const [savedOnce, setSavedOnce] = useState(false);
  const formDirty = editing && material != null && (
    type !== material.type ||
    cocoaButterType !== (material.cocoaButterType ?? "") ||
    color !== (material.color ?? "#d4a017") ||
    manufacturer !== (material.manufacturer ?? "") ||
    vendor !== (material.vendor ?? "") ||
    source !== (material.source ?? "") ||
    notes !== (material.notes ?? "")
  );
  const isDirty = (isNew && !savedOnce) || formDirty;
  const handleConfirmLeave = useCallback(async () => {
    if (isNew) await deleteDecorationMaterial(materialId);
  }, [isNew, materialId]); // eslint-disable-line react-hooks/exhaustive-deps
  useNavigationGuard(isDirty, isNew ? handleConfirmLeave : undefined);

  // Escape key handling
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirmDelete) setConfirmDelete(false);
      else if (editing) handleCancel();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  function syncForm(m: NonNullable<typeof material>) {
    setType(m.type);
    setCocoaButterType(m.cocoaButterType ?? "");
    setColor(m.color ?? "#d4a017");
    setManufacturer(m.manufacturer ?? "");
    setVendor(m.vendor ?? "");
    setSource(m.source ?? "");
    setNotes(m.notes ?? "");
  }

  function startEditing() {
    syncForm(material!);
    setEditing(true);
  }

  function handleCancel() {
    syncForm(material!);
    setEditing(false);
    if (isNew) router.replace(`/pantry/decoration/${encodeURIComponent(materialId)}`);
  }

  async function handleSave(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!material?.id) return;
    await saveDecorationMaterial({
      ...material,
      id: material.id,
      type: type as never,
      cocoaButterType: type === "cocoa_butter" && cocoaButterType ? cocoaButterType as CocoaButterType : undefined,
      color,
      manufacturer: manufacturer.trim() || undefined,
      vendor: vendor.trim() || undefined,
      source: source.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setSavedOnce(true);
    setEditing(false);
    if (isNew) router.replace(`/pantry/decoration/${encodeURIComponent(materialId)}`);
  }

  async function handleDelete() {
    await deleteDecorationMaterial(materialId);
    router.replace("/pantry/decoration");
  }

  if (!material) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  return (
    <div>
      {/* Back */}
      <div className="px-4 pt-6 pb-2">
        <Link
          href="/pantry/decoration"
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Back
        </Link>
      </div>

      <div className="px-4 pb-6 space-y-6 max-w-lg">

        {/* Name row — always visible, pencil edits name only */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-5 h-5 rounded-full border border-black/10 shrink-0"
              style={{ backgroundColor: material.color ?? "#9ca3af" }}
            />
            <InlineNameEditor
              name={material.name}
              onSave={async (n) => {
                await saveDecorationMaterial({ ...material, name: n });
              }}
              className="text-xl font-bold"
            />
            {material.archived && (
              <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[10px] font-medium flex items-center gap-1 shrink-0">
                <Archive className="w-3 h-3" /> Archived
              </span>
            )}
          </div>
          {!editing && (
            <button
              onClick={startEditing}
              className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0"
              aria-label="Edit decoration material"
            >
              <Pencil className="w-4 h-4 text-muted-foreground" />
            </button>
          )}
        </div>

        {/* Type subtitle — shown below name in read-only mode */}
        {!editing && (
          <p className="text-sm text-primary -mt-3">
            {decorationCategories.find((c) => c.slug === material.type)?.name ?? DECORATION_MATERIAL_TYPE_LABELS[material.type] ?? material.type}
          </p>
        )}

        {/* Stock status — always at top, hidden while editing */}
        {!editing && (
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
        )}

        {editing ? (
          /* ── Edit form ── */
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="label">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value)}
                className="input"
                autoFocus={isNew}
              >
                {decorationCategories.map((c) => (
                  <option key={c.slug} value={c.slug}>{c.name}</option>
                ))}
                {/* Fallback for legacy types not in the DB */}
                {decorationCategories.length > 0 && !decorationCategories.some((c) => c.slug === type) && (
                  <option value={type}>{DECORATION_MATERIAL_TYPE_LABELS[type as keyof typeof DECORATION_MATERIAL_TYPE_LABELS] ?? type}</option>
                )}
              </select>
            </div>

            {type === "cocoa_butter" && (
              <div>
                <label className="label">Cocoa butter type</label>
                <select
                  value={cocoaButterType}
                  onChange={(e) => setCocoaButterType(e.target.value as CocoaButterType | "")}
                  className="input"
                >
                  <option value="">Unknown</option>
                  {COCOA_BUTTER_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="label">Colour</label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  className="w-10 h-10 rounded-md border border-border cursor-pointer p-0.5"
                  title="Pick colour"
                />
                <span className="text-sm text-muted-foreground font-mono">{color}</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Manufacturer</label>
                <input
                  type="text"
                  list="manufacturer-list"
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  onBlur={() => setManufacturer((v) => v.trim())}
                  placeholder="e.g. I Shud Koko"
                  className="input"
                />
                {allManufacturers.length > 0 && (
                  <datalist id="manufacturer-list">
                    {allManufacturers.map((m) => <option key={m} value={m} />)}
                  </datalist>
                )}
              </div>
              <div>
                <label className="label">Source</label>
                <input
                  type="text"
                  list="source-list"
                  value={source}
                  onChange={(e) => setSource(e.target.value)}
                  onBlur={() => setSource((v) => v.trim())}
                  placeholder="e.g. Keylink"
                  className="input"
                />
                {allSources.length > 0 && (
                  <datalist id="source-list">
                    {allSources.map((s) => <option key={s} value={s} />)}
                  </datalist>
                )}
              </div>
            </div>

            <div>
              <label className="label">Vendor</label>
              <input
                type="text"
                list="vendor-list"
                value={vendor}
                onChange={(e) => setVendor(e.target.value)}
                onBlur={() => setVendor((v) => v.trim())}
                placeholder="e.g. Chocolate Trading Co"
                className="input"
              />
              {allVendors.length > 0 && (
                <datalist id="vendor-list">
                  {allVendors.map((v) => <option key={v} value={v} />)}
                </datalist>
              )}
            </div>

            <div>
              <label className="label">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Usage tips…"
                rows={3}
                className="input resize-none"
              />
            </div>

            <div className="flex gap-2">
              <button type="submit" className="btn-primary flex-1 py-2">Save</button>
              <button type="button" onClick={handleCancel} className="btn-secondary px-4 py-2">Cancel</button>
            </div>
          </form>
        ) : (
          /* ── Read-only view ── */
          <>
            <div className="rounded-lg border border-border bg-card divide-y divide-border">
              <div className="flex justify-between items-center px-3 py-2 text-sm">
                <span className="text-muted-foreground">Colour</span>
                <div className="flex items-center gap-2">
                  <span
                    className="w-4 h-4 rounded-full border border-black/10"
                    style={{ backgroundColor: material.color ?? "#9ca3af" }}
                  />
                  <span className="font-mono text-xs">{material.color ?? "—"}</span>
                </div>
              </div>
              {material.type === "cocoa_butter" && material.cocoaButterType && (
                <div className="flex justify-between px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Cocoa butter type</span>
                  <span className="font-medium">{material.cocoaButterType}</span>
                </div>
              )}
              {material.manufacturer && (
                <div className="flex justify-between px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Manufacturer</span>
                  <span className="font-medium">{material.manufacturer}</span>
                </div>
              )}
              {material.vendor && (
                <div className="flex justify-between px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Vendor</span>
                  <span className="font-medium">{material.vendor}</span>
                </div>
              )}
              {material.source && (
                <div className="flex justify-between px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Source</span>
                  <span className="font-medium">{material.source}</span>
                </div>
              )}
            </div>

            {material.notes && (
              <p className="text-sm text-muted-foreground leading-relaxed">{material.notes}</p>
            )}

            <UsedInPanel
              singular="product"
              plural="products"
              items={usedInProducts.map((product) => ({
                id: product.id ?? "",
                name: product.name,
                href: `/products/${encodeURIComponent(product.id ?? "")}`,
                photo: product.photo,
              }))}
              emptyMessage="This material isn't used in any shell designs yet."
            />

            {/* Archive / Delete */}
            <section className="pt-4 border-t border-border">
              {material.archived ? (
                <button
                  onClick={() => unarchiveDecorationMaterial(materialId)}
                  className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArchiveRestore className="w-4 h-4" /> Unarchive material
                </button>
              ) : usedInProducts.length > 0 ? (
                /* In use — archive only, no delete */
                confirmDelete ? (
                  <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
                      <p className="text-sm font-medium">Archive this material?</p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      It will be hidden from lists but kept for existing shell designs that reference it.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={async () => { await archiveDecorationMaterial(materialId); setConfirmDelete(false); router.replace("/pantry/decoration"); }}
                        className="btn-primary px-4 py-2 text-sm"
                      >
                        Yes, archive material
                      </button>
                      <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-4 py-2">Cancel</button>
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
                /* Not in use — allow full delete */
                confirmDelete ? (
                  <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                    <p className="text-sm text-destructive font-medium">Delete this material?</p>
                    <p className="text-xs text-muted-foreground">
                      This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={handleDelete}
                        className="rounded-full bg-destructive text-destructive-foreground px-4 py-2 text-sm font-medium"
                      >
                        Yes, delete
                      </button>
                      <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-4 py-2">Cancel</button>
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
            </section>
          </>
        )}
      </div>
    </div>
  );
}
