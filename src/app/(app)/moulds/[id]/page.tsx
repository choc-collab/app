"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  useMould, useMoulds, updateMouldFields, deleteMould, archiveMould, unarchiveMould,
  isMouldInUse, useMouldUsage,
} from "@/lib/hooks";
import { db } from "@/lib/db";
import { UsedInPanel } from "@/components/pantry";
import { ArrowLeft, Camera, Trash2, Archive, ArchiveRestore, X } from "lucide-react";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { DetailSkeleton, DetailNotFound } from "@/components/detail-states";
import {
  SidebarCard, PropertyRow, DerivedRow, PROPERTY_INPUT_CLASS, PROPERTY_NUMBER_CLASS,
} from "@/components/detail-sidebar";
import { FILL_FACTOR } from "@/lib/production";
import { useSpaId } from "@/lib/use-spa-id";
import type { Mould } from "@/types";

/** The filling weight a cavity gets when none is set explicitly — the cavity's
 *  total weight less the shell, at the app-wide fill factor. */
function defaultFillingGrams(cavityWeightG: number): number {
  return Math.round(cavityWeightG * FILL_FACTOR * 10) / 10;
}

export default function MouldDetailPage() {
  const mouldId = useSpaId("moulds");
  const router = useRouter();

  const mould = useMould(mouldId);
  const usedInProducts = useMouldUsage(mouldId);
  const allMoulds = useMoulds(true);
  const brands = [...new Set(allMoulds.map((m) => m.brand).filter(Boolean))] as string[];

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmRemovePhoto, setConfirmRemovePhoto] = useState(false);
  const [inUse, setInUse] = useState<boolean | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Loading vs. not-found — the live query returns `undefined` for both, so a
  // one-shot direct read resolves which one it actually is.
  const [loadState, setLoadState] = useState<"loading" | "found" | "not-found">("loading");
  useEffect(() => {
    if (!mouldId) return;
    let cancelled = false;
    db.moulds.get(mouldId).then((m) => {
      if (!cancelled) setLoadState(m ? "found" : "not-found");
    });
    return () => { cancelled = true; };
  }, [mouldId]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirmDelete) setConfirmDelete(false);
      else if (confirmRemovePhoto) setConfirmRemovePhoto(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete, confirmRemovePhoto]);

  if (!mouldId || loadState === "loading" || (loadState === "found" && !mould)) {
    return <DetailSkeleton cards={1} sidebar={3} label="Loading mould" />;
  }
  if (loadState === "not-found" || !mould) {
    return <DetailNotFound entity="mould" backHref="/moulds" backLabel="Moulds" />;
  }

  const fillingPerCavity = mould.fillingGramsPerCavity ?? defaultFillingGrams(mould.cavityWeightG);
  const totalWeight = Math.round(mould.cavityWeightG * mould.numberOfCavities);

  const subtitle = [
    mould.brand,
    mould.productNumber,
    mould.cavityWeightG > 0 ? `${mould.numberOfCavities} × ${mould.cavityWeightG} g` : null,
    usedInProducts.length > 0
      ? `default for ${usedInProducts.length} product${usedInProducts.length === 1 ? "" : "s"}`
      : null,
  ].filter(Boolean).join(" · ");

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !mouldId) return;
    const reader = new FileReader();
    reader.onload = () => { updateMouldFields(mouldId, { photo: reader.result as string }, "Photo"); };
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <Link href="/moulds" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Moulds
        </Link>
      </div>

      {/* Header */}
      <div className="px-4 pb-5">
        <div className="flex items-center gap-2 flex-wrap">
          <InlineNameEditor
            name={mould.name}
            onSave={async (n) => { await updateMouldFields(mouldId, { name: n }, "Name"); }}
            className="text-xl font-bold"
          />
          {mould.archived && (
            <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[10px] font-medium flex items-center gap-1 shrink-0">
              <Archive className="w-3 h-3" /> Archived
            </span>
          )}
        </div>
        {subtitle && <p className="text-sm text-muted-foreground mt-1">{subtitle}</p>}
      </div>

      <div className="px-4 pb-8 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px] gap-5 items-start">
        {/* ── Main column ── */}
        <div className="space-y-4 min-w-0">
          <NotesCard key={mould.id} mouldId={mouldId} mould={mould} />

          {/* ── Destructive actions ── */}
          <div className="pt-2 space-y-3">
            {mould.archived && (
              <button
                onClick={async () => { await unarchiveMould(mouldId); }}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArchiveRestore className="w-4 h-4" /> Unarchive mould
              </button>
            )}
            {confirmDelete ? (
              inUse ? (
                /* Referenced by products or plans — archive is the only way out. */
                <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                  <div className="flex items-center gap-2">
                    <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
                    <p className="text-sm font-medium">Delete is blocked</p>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    This mould is referenced by products or production plans, so it can&apos;t be
                    deleted. Archiving hides it from lists while keeping it available to
                    everything that already uses it.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => { await archiveMould(mouldId); router.replace("/moulds"); }}
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
                <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                  <p className="text-sm font-medium text-destructive">Delete this mould?</p>
                  <p className="text-xs text-muted-foreground">
                    This will permanently remove the mould. This cannot be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={async () => { await deleteMould(mouldId); router.replace("/moulds"); }}
                      className="inline-flex items-center justify-center rounded-full bg-destructive text-white px-4 py-2 text-sm font-medium transition-colors hover:bg-destructive/90"
                    >
                      Yes, delete mould
                    </button>
                    <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-4 py-2">
                      Cancel
                    </button>
                  </div>
                </div>
              )
            ) : (
              <button
                onClick={async () => {
                  const used = await isMouldInUse(mouldId);
                  setInUse(used);
                  setConfirmDelete(true);
                }}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="w-4 h-4" /> Delete mould
              </button>
            )}
          </div>
        </div>

        {/* ── Sidebar ── */}
        <div className="space-y-4 lg:sticky lg:top-4">
          {/* Photo */}
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            {mould.photo ? (
              <img
                src={mould.photo}
                alt={mould.name}
                className="w-full h-[132px] object-cover cursor-pointer"
                onClick={() => fileInputRef.current?.click()}
              />
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-[132px] bg-muted flex flex-col items-center justify-center text-muted-foreground gap-1"
              >
                <Camera className="w-5 h-5" />
                <span className="text-[11px]">Add photo</span>
              </button>
            )}
            <div className="px-3 py-2 border-t border-border flex items-center justify-between gap-2">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-[11px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                {mould.photo ? "Replace photo" : "Add photo"}
              </button>
              {mould.photo && (
                confirmRemovePhoto ? (
                  <span className="flex items-center gap-1.5 text-[11px]">
                    <span className="text-muted-foreground">Remove?</span>
                    <button
                      onClick={async () => {
                        await updateMouldFields(mouldId, { photo: undefined }, "Photo");
                        setConfirmRemovePhoto(false);
                      }}
                      className="text-destructive font-medium hover:underline"
                    >
                      Yes
                    </button>
                    <button onClick={() => setConfirmRemovePhoto(false)} className="text-muted-foreground hover:underline">
                      Cancel
                    </button>
                  </span>
                ) : (
                  <button
                    onClick={() => setConfirmRemovePhoto(true)}
                    aria-label="Remove photo"
                    className="text-[11px] text-muted-foreground hover:text-destructive"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhoto}
              className="hidden"
            />
          </div>

          <PropertiesCard key={`props-${mould.id}`} mouldId={mouldId} mould={mould} brands={brands} />

          <SidebarCard title="Derived" tinted className="space-y-2">
            <DerivedRow
              label="Total weight"
              value={mould.cavityWeightG > 0 ? `${totalWeight} g` : "—"}
            />
            <DerivedRow
              label="Filling per cavity"
              value={mould.cavityWeightG > 0 ? `${fillingPerCavity} g` : "—"}
            />
            {mould.fillingGramsPerCavity == null && mould.cavityWeightG > 0 && (
              <p className="text-[11px] text-muted-foreground">
                Derived from the cavity weight — set it explicitly to override.
              </p>
            )}
          </SidebarCard>

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
              emptyMessage="Not the default mould for any product yet."
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
  mouldId,
  mould,
  brands,
}: {
  mouldId: string;
  mould: Mould;
  brands: string[];
}) {
  // Keyed by `mould.id` at the call site, so drafts reset on navigation but
  // survive the re-render each autosave triggers.
  const [productNumber, setProductNumber] = useState(mould.productNumber ?? "");
  const [brand, setBrand] = useState(mould.brand ?? "");
  const [cavityWeight, setCavityWeight] = useState(mould.cavityWeightG > 0 ? String(mould.cavityWeightG) : "");
  const [cavities, setCavities] = useState(mould.numberOfCavities > 0 ? String(mould.numberOfCavities) : "");
  const [fillingGrams, setFillingGrams] = useState(
    mould.fillingGramsPerCavity != null ? String(mould.fillingGramsPerCavity) : "",
  );
  const [quantityOwned, setQuantityOwned] = useState(
    mould.quantityOwned != null ? String(mould.quantityOwned) : "",
  );

  function commitProductNumber() {
    const trimmed = productNumber.trim();
    if (trimmed === (mould.productNumber ?? "")) return;
    updateMouldFields(mouldId, { productNumber: trimmed || undefined }, "Product number");
  }

  function commitBrand() {
    const trimmed = brand.trim();
    if (trimmed === (mould.brand ?? "")) return;
    updateMouldFields(mouldId, { brand: trimmed || undefined }, "Brand");
  }

  function commitCavityWeight() {
    const next = parseFloat(cavityWeight);
    // Cavity weight drives every downstream weight calculation, so a zero or
    // blank value is rejected rather than written.
    if (isNaN(next) || next <= 0) {
      setCavityWeight(mould.cavityWeightG > 0 ? String(mould.cavityWeightG) : "");
      return;
    }
    if (next === mould.cavityWeightG) return;
    updateMouldFields(mouldId, { cavityWeightG: next }, "Cavity weight");
  }

  function commitCavities() {
    const next = parseInt(cavities, 10);
    if (isNaN(next) || next <= 0) {
      setCavities(mould.numberOfCavities > 0 ? String(mould.numberOfCavities) : "");
      return;
    }
    if (next === mould.numberOfCavities) return;
    updateMouldFields(mouldId, { numberOfCavities: next }, "Number of cavities");
  }

  function commitFillingGrams() {
    const next = parseFloat(fillingGrams);
    // Blank means "derive it from the cavity weight", so an empty field clears
    // the override rather than being rejected.
    const value = !isNaN(next) && next > 0 ? next : undefined;
    if (value === mould.fillingGramsPerCavity) return;
    updateMouldFields(mouldId, { fillingGramsPerCavity: value }, "Filling per cavity");
  }

  function commitQuantityOwned() {
    const next = parseInt(quantityOwned, 10);
    const value = !isNaN(next) && next > 0 ? next : undefined;
    if (value === mould.quantityOwned) return;
    updateMouldFields(mouldId, { quantityOwned: value }, "Moulds owned");
  }

  return (
    <SidebarCard title="Properties">
      <div className="space-y-1">
        <PropertyRow label="Product number">
          <input
            type="text"
            value={productNumber}
            onChange={(e) => setProductNumber(e.target.value)}
            onBlur={commitProductNumber}
            placeholder="—"
            aria-label="Product number"
            className={PROPERTY_INPUT_CLASS}
          />
        </PropertyRow>

        <PropertyRow label="Brand">
          <input
            type="text"
            list="mould-brand-list"
            value={brand}
            onChange={(e) => setBrand(e.target.value)}
            onBlur={commitBrand}
            placeholder="—"
            aria-label="Brand"
            className={PROPERTY_INPUT_CLASS}
          />
          {brands.length > 0 && (
            <datalist id="mould-brand-list">
              {brands.map((b) => <option key={b} value={b} />)}
            </datalist>
          )}
        </PropertyRow>

        <PropertyRow label="Cavity weight">
          <span className="flex items-baseline gap-1">
            <input
              type="number"
              min="0.1"
              step="0.1"
              value={cavityWeight}
              onChange={(e) => setCavityWeight(e.target.value)}
              onBlur={commitCavityWeight}
              aria-label="Cavity weight"
              className={`w-16 ${PROPERTY_NUMBER_CLASS}`}
            />
            <span className="text-xs text-muted-foreground">g</span>
          </span>
        </PropertyRow>

        <PropertyRow label="Cavities">
          <input
            type="number"
            min="1"
            step="1"
            value={cavities}
            onChange={(e) => setCavities(e.target.value)}
            onBlur={commitCavities}
            aria-label="Number of cavities"
            className={`w-14 ${PROPERTY_NUMBER_CLASS}`}
          />
        </PropertyRow>

        <PropertyRow label="Filling per cavity">
          <span className="flex items-baseline gap-1">
            <input
              type="number"
              min="0"
              step="0.1"
              value={fillingGrams}
              onChange={(e) => setFillingGrams(e.target.value)}
              onBlur={commitFillingGrams}
              placeholder={mould.cavityWeightG > 0 ? String(defaultFillingGrams(mould.cavityWeightG)) : "—"}
              aria-label="Filling per cavity"
              className={`w-16 ${PROPERTY_NUMBER_CLASS}`}
            />
            <span className="text-xs text-muted-foreground">g</span>
          </span>
        </PropertyRow>

        <PropertyRow label="Moulds owned">
          <input
            type="number"
            min="0"
            step="1"
            value={quantityOwned}
            onChange={(e) => setQuantityOwned(e.target.value)}
            onBlur={commitQuantityOwned}
            placeholder="—"
            aria-label="Moulds owned"
            className={`w-14 ${PROPERTY_NUMBER_CLASS}`}
          />
        </PropertyRow>
      </div>
    </SidebarCard>
  );
}

// ─── Main: Notes ─────────────────────────────────────────────────────────────

function NotesCard({ mouldId, mould }: { mouldId: string; mould: Mould }) {
  const [value, setValue] = useState(mould.notes ?? "");
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function commit(next: string) {
    const trimmed = next.trim();
    if (trimmed === (mould.notes ?? "")) return;
    updateMouldFields(mouldId, { notes: trimmed || undefined }, "Notes");
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
          placeholder="Demoulding quirks, which shelf it lives on, what it pairs with…"
          rows={4}
          aria-label="Notes"
          className="w-full text-sm bg-transparent border-0 resize-none focus:outline-none placeholder:text-muted-foreground/60"
        />
      </div>
    </div>
  );
}
