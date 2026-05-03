"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMould, useMoulds, saveMould, deleteMould, archiveMould, unarchiveMould, isMouldInUse, useMouldUsage } from "@/lib/hooks";
import { UsedInPanel } from "@/components/pantry";
import { ArrowLeft, Camera, Pencil, Trash2, Archive, ArchiveRestore } from "lucide-react";
import { InlineNameEditor } from "@/components/inline-name-editor";
import { FILL_FACTOR } from "@/lib/production";
import { useNavigationGuard } from "@/lib/useNavigationGuard";
import { useSpaId } from "@/lib/use-spa-id";

export default function MouldDetailPage() {
  const mouldId = useSpaId("moulds");
  const router = useRouter();
  const searchParams = useSearchParams();
  const isNew = searchParams.get("new") === "1";

  const mould = useMould(mouldId);
  const usedInProducts = useMouldUsage(mouldId);
  const allMoulds = useMoulds(true);
  const brands = [...new Set(allMoulds.map((m) => m.brand).filter(Boolean))] as string[];

  const [editing, setEditing] = useState(isNew);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inUse, setInUse] = useState<boolean | null>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      if (confirmDelete) setConfirmDelete(false);
      else if (editing) setEditing(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [confirmDelete, editing]);

  // Form state
  const [productNumber, setProductNumber] = useState("");
  const [brand, setBrand] = useState("");
  const [cavityWeightG, setCavityWeightG] = useState("");
  const [numberOfCavities, setNumberOfCavities] = useState("");
  const [fillingGramsPerCavity, setFillingGramsPerCavity] = useState("");
  const [quantityOwned, setQuantityOwned] = useState("");
  const [notes, setNotes] = useState("");
  const [photo, setPhoto] = useState<string | undefined>(undefined);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const formSyncedRef = useRef(false);

  function fillingDefault(wt: number) {
    return wt > 0 ? String(Math.round(wt * FILL_FACTOR * 10) / 10) : "";
  }

  function syncForm(m: NonNullable<typeof mould>) {
    setProductNumber(m.productNumber ?? "");
    setBrand(m.brand ?? "");
    setCavityWeightG(m.cavityWeightG > 0 ? String(m.cavityWeightG) : "");
    setNumberOfCavities(m.numberOfCavities > 0 ? String(m.numberOfCavities) : "");
    setFillingGramsPerCavity(
      m.fillingGramsPerCavity != null
        ? String(m.fillingGramsPerCavity)
        : fillingDefault(m.cavityWeightG)
    );
    setQuantityOwned(m.quantityOwned != null ? String(m.quantityOwned) : "");
    setNotes(m.notes ?? "");
    setPhoto(m.photo);
  }

  // Sync form state once when the mould first loads. Done in render (rather
  // than in an effect) so the form fields below render with populated values
  // on the same paint — moving to useEffect would briefly show empty fields.
  // The ref is the standard guard against re-syncing on subsequent renders.
  // eslint-disable-next-line react-hooks/refs
  if (mould && (!editing || isNew) && !formSyncedRef.current && mould.name) {
     
    formSyncedRef.current = true;
    syncForm(mould);
  }

  const origFillingGrams = mould != null
    ? (mould.fillingGramsPerCavity != null
      ? String(mould.fillingGramsPerCavity)
      : fillingDefault(mould.cavityWeightG))
    : "";

  const [savedOnce, setSavedOnce] = useState(false);
  const formDirty = editing && mould != null && (
    productNumber !== (mould.productNumber ?? "") ||
    brand !== (mould.brand ?? "") ||
    cavityWeightG !== (mould.cavityWeightG > 0 ? String(mould.cavityWeightG) : "") ||
    numberOfCavities !== (mould.numberOfCavities > 0 ? String(mould.numberOfCavities) : "") ||
    fillingGramsPerCavity !== origFillingGrams ||
    quantityOwned !== (mould.quantityOwned != null ? String(mould.quantityOwned) : "") ||
    photo !== mould.photo
  );
  const isDirty = (isNew && !savedOnce) || formDirty;

  const handleConfirmLeave = useCallback(async () => {
    if (isNew && mouldId) await deleteMould(mouldId);
  }, [isNew, mouldId]);

  const { safeBack } = useNavigationGuard(isDirty, isNew ? handleConfirmLeave : undefined);

  if (!mouldId || !mould) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground">Loading…</p>
      </div>
    );
  }

  const wt = parseFloat(cavityWeightG) || 0;
  const cav = parseInt(numberOfCavities) || 0;

  function startEditing() { formSyncedRef.current = true; syncForm(mould!); setEditing(true); }

  function handleCancel() {
    syncForm(mould!);
    setEditing(false);
    if (isNew && mouldId) router.replace(`/moulds/${encodeURIComponent(mouldId)}`);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!mouldId || wt <= 0 || cav <= 0) return;
    const fillG = parseFloat(fillingGramsPerCavity);
    const qtyOwned = parseInt(quantityOwned);
    await saveMould({
      id: mouldId,
      name: mould!.name,
      productNumber: productNumber.trim() || undefined,
      brand: brand || undefined,
      cavityWeightG: wt,
      numberOfCavities: cav,
      fillingGramsPerCavity: !isNaN(fillG) && fillG > 0 ? fillG : undefined,
      quantityOwned: !isNaN(qtyOwned) && qtyOwned > 0 ? qtyOwned : undefined,
      photo,
      notes: notes.trim() || undefined,
    });
    setSavedOnce(true);
    setEditing(false);
    if (isNew && mouldId) router.replace(`/moulds/${encodeURIComponent(mouldId)}`);
  }

  function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPhoto(reader.result as string);
    reader.readAsDataURL(file);
  }

  return (
    <div>
      <div className="px-4 pt-6 pb-2">
        <button onClick={() => safeBack()} className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3">
          <ArrowLeft aria-hidden="true" className="w-4 h-4" /> Back
        </button>
      </div>

      <div className="px-4 pb-6 space-y-4">
        {/* Photo + Name row — always visible */}
        <div className="flex items-start gap-4">
          <div className="shrink-0">
            {editing ? (
              <div className="flex flex-col items-center gap-1">
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 rounded-lg bg-muted flex flex-col items-center justify-center text-muted-foreground gap-1 overflow-hidden"
                >
                  {photo ? (
                    <img src={photo} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <>
                      <Camera className="w-5 h-5" />
                      <span className="text-[10px]">Photo</span>
                    </>
                  )}
                </button>
                {photo && (
                  <button
                    type="button"
                    onClick={() => setPhoto(undefined)}
                    className="text-[10px] text-muted-foreground hover:text-destructive transition-colors"
                  >
                    Remove
                  </button>
                )}
              </div>
            ) : (
              <button
                type="button"
                aria-label="Edit mould photo"
                className="w-20 h-20 rounded-lg overflow-hidden cursor-pointer"
                onClick={startEditing}
              >
                {mould.photo ? (
                  <img src={mould.photo} alt={mould.name} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground text-2xl font-light">
                    ◻
                  </div>
                )}
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handlePhoto}
              className="hidden"
            />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <InlineNameEditor
                    name={mould.name}
                    onSave={async (n) => { await saveMould({ ...mould, name: n }); }}
                    className="text-xl font-bold"
                  />
                  {mould.archived && (
                    <span className="rounded-full bg-muted text-muted-foreground px-2.5 py-0.5 text-[10px] font-medium flex items-center gap-1 shrink-0">
                      <Archive className="w-3 h-3" /> Archived
                    </span>
                  )}
                  {!editing && mould.productNumber && (
                    <span className="text-sm text-muted-foreground font-mono">{mould.productNumber}</span>
                  )}
                </div>
                {!editing && mould.brand && (
                  <p className="text-sm text-muted-foreground mt-0.5">{mould.brand}</p>
                )}
              </div>
              {!editing && (
                <button
                  onClick={startEditing}
                  className="p-1.5 rounded-full hover:bg-muted transition-colors shrink-0"
                  aria-label="Edit mould"
                >
                  <Pencil className="w-4 h-4 text-muted-foreground" />
                </button>
              )}
            </div>
          </div>
        </div>

        {editing ? (
          /* ── Edit form (excludes name — handled by InlineNameEditor) ── */
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="label">Product number</label>
              <input
                type="text"
                value={productNumber}
                onChange={(e) => setProductNumber(e.target.value)}
                placeholder="e.g. CW-1234"
                autoFocus={isNew}
                className="input"
              />
            </div>

            <div>
              <label className="label">Brand</label>
              <input
                type="text"
                list="brand-list"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                placeholder="e.g. Chocolate World, Martellato"
                className="input"
              />
              {brands.length > 0 && (
                <datalist id="brand-list">
                  {brands.map((b) => (
                    <option key={b} value={b} />
                  ))}
                </datalist>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">Cavity weight (g) *</label>
                <input
                  type="number"
                  value={cavityWeightG}
                  onChange={(e) => setCavityWeightG(e.target.value)}
                  placeholder="e.g. 12.5"
                  min="0.1"
                  step="0.1"
                  required
                  className="input"
                />
                <p className="text-xs text-muted-foreground mt-0.5">From manufacturer spec</p>
              </div>
              <div>
                <label className="label">No. of cavities *</label>
                <input
                  type="number"
                  value={numberOfCavities}
                  onChange={(e) => setNumberOfCavities(e.target.value)}
                  placeholder="e.g. 24"
                  min="1"
                  step="1"
                  required
                  className="input"
                />
              </div>
            </div>
            {wt > 0 && cav > 0 && (
              <p className="text-xs text-muted-foreground">Total weight: {Math.round(wt * cav)} g</p>
            )}

            <div>
              <label className="label">Filling per cavity (g)</label>
              <input
                type="number"
                value={fillingGramsPerCavity}
                onChange={(e) => setFillingGramsPerCavity(e.target.value)}
                placeholder={wt > 0 ? String(Math.round(wt * FILL_FACTOR * 10) / 10) : "e.g. 7.6"}
                min="0.1"
                step="0.1"
                className="input"
              />
              {wt > 0 && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  Default: {Math.round(wt * FILL_FACTOR * 10) / 10} g (cavity × {Math.round(FILL_FACTOR * 100)}% fill)
                </p>
              )}
            </div>

            <div>
              <label className="label">Moulds owned</label>
              <input
                type="number"
                value={quantityOwned}
                onChange={(e) => setQuantityOwned(e.target.value)}
                placeholder="e.g. 3"
                min="1"
                step="1"
                className="input"
              />
              <p className="text-xs text-muted-foreground mt-0.5">How many copies of this mould you own</p>
            </div>

            <div>
              <label className="label">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                className="input"
                placeholder="Any notes about this mould…"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={wt <= 0 || cav <= 0}
                className="btn-primary flex-1 py-2"
              >
                Save
              </button>
              <button
                type="button"
                onClick={handleCancel}
                className="btn-secondary px-4 py-2"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          /* ── Read-only view ── */
          <>
            {mould.cavityWeightG > 0 && (
              <div className="rounded-lg border border-border bg-card divide-y divide-border">
                <div className="flex justify-between px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Cavity weight</span>
                  <span className="font-medium">{mould.cavityWeightG} g</span>
                </div>
                <div className="flex justify-between px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Number of cavities</span>
                  <span className="font-medium">{mould.numberOfCavities}</span>
                </div>
                <div className="flex justify-between px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Total weight</span>
                  <span className="font-medium">{Math.round(mould.cavityWeightG * mould.numberOfCavities)} g</span>
                </div>
                <div className="flex justify-between px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Filling per cavity</span>
                  <span className="font-medium">
                    {mould.fillingGramsPerCavity != null
                      ? `${mould.fillingGramsPerCavity} g`
                      : `${Math.round(mould.cavityWeightG * FILL_FACTOR * 10) / 10} g`}
                  </span>
                </div>
                <div className="flex justify-between px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Moulds owned</span>
                  <span className="font-medium">
                    {mould.quantityOwned != null ? mould.quantityOwned : <span className="text-muted-foreground">—</span>}
                  </span>
                </div>
              </div>
            )}

            {mould.notes && (
              <p className="text-sm text-muted-foreground leading-relaxed">{mould.notes}</p>
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
              emptyMessage="This mould isn't set as the default for any products yet."
              className="mt-2"
            />
          </>
        )}
      </div>

      {!editing && (
        <div className="px-4 pb-8 border-t border-border pt-4 space-y-4">
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
              /* In use by products or plans — archive only */
              <div className="rounded-lg border border-border bg-card p-4 space-y-3">
                <div className="flex items-center gap-2">
                  <Archive className="w-4 h-4 text-muted-foreground shrink-0" />
                  <p className="text-sm font-medium">Archive this mould?</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  This mould is referenced by products or production plans and cannot be deleted.
                  Archiving will hide it from lists but preserve it for existing products.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      await archiveMould(mouldId);
                      router.replace("/moulds");
                    }}
                    className="btn-primary px-4 py-2 text-sm"
                  >
                    Yes, archive mould
                  </button>
                  <button onClick={() => setConfirmDelete(false)} className="btn-secondary px-4 py-2">
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Not in use — allow full delete */
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 space-y-3">
                <p className="text-sm font-medium text-destructive">Delete this mould?</p>
                <p className="text-xs text-muted-foreground">This will permanently remove the mould. This cannot be undone.</p>
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
      )}
    </div>
  );
}
