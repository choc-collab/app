"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import {
  useExperiment,
  useExperimentIngredients,
  useMoulds,
  useFillings,
} from "@/lib/hooks";
import { FILL_FACTOR } from "@/lib/production";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function RunBatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);
  const id = decodeURIComponent(idStr);
  const router = useRouter();

  const experiment = useExperiment(id);
  const experimentIngredients = useExperimentIngredients(id);
  const allMoulds = useMoulds(true);
  const allFillings = useFillings();

  const [mouldId, setMouldId] = useState("");
  const [numMouldsStr, setNumMouldsStr] = useState("1");
  const [showCompanion, setShowCompanion] = useState(false);
  const [companionFillingId, setCompanionFillingId] = useState("");
  const [companionFillPctStr, setCompanionFillPctStr] = useState("30");

  const numMoulds = Math.max(1, parseInt(numMouldsStr) || 1);
  const companionFillPct = showCompanion && companionFillingId
    ? Math.min(90, Math.max(10, parseFloat(companionFillPctStr) || 30))
    : 0;
  const experimentFillPct = 100 - companionFillPct;

  const mould = allMoulds.find((m) => m.id === mouldId);
  const totalWeight = experimentIngredients.reduce((s, ei) => s + ei.amount, 0);
  const targetWeightG = mould
    ? mould.cavityWeightG * mould.numberOfCavities * numMoulds * FILL_FACTOR * (experimentFillPct / 100)
    : 0;
  const scaleFactor = totalWeight > 0 && targetWeightG > 0 ? targetWeightG / totalWeight : 1;
  const productCount = mould ? mould.numberOfCavities * numMoulds : 0;

  if (!experiment) {
    return <div className="px-4 pt-6 text-sm text-muted-foreground">Loading…</div>;
  }

  function handleStart() {
    if (!mouldId) return;
    const p = new URLSearchParams({ mouldId, numMoulds: numMouldsStr });
    if (showCompanion && companionFillingId) {
      p.set("companionFillingId", companionFillingId);
      p.set("companionFillPct", companionFillPctStr);
    }
    router.push(`/calculator/${encodeURIComponent(id)}/batch?${p.toString()}`);
  }

  return (
    <div className="px-4 pt-6 pb-12 max-w-lg">
      {/* Back */}
      <button
        onClick={() => router.back()}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-6"
      >
        <ChevronLeft className="w-4 h-4" /> {experiment.name}
      </button>

      <h1 className="text-xl font-semibold mb-1">Make product</h1>
      <p className="text-sm text-muted-foreground mb-7">
        Choose your mould and quantity — we&rsquo;ll scale the formula for you.
      </p>

      {/* Mould */}
      <section className="mb-5 space-y-4">
        <div>
          <label className="label">Mould</label>
          <select
            value={mouldId}
            onChange={(e) => setMouldId(e.target.value)}
            className="input w-full"
          >
            <option value="">Select a mould…</option>
            {allMoulds.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name} — {m.numberOfCavities} cavities × {m.cavityWeightG} g
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="label">Number of moulds</label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min="1"
              value={numMouldsStr}
              onChange={(e) => setNumMouldsStr(e.target.value)}
              className="input w-24"
            />
            {mould && (
              <span className="text-sm text-muted-foreground">
                = {productCount} product{productCount !== 1 ? "s" : ""}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Companion filling */}
      <section className="mb-7">
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
          <input
            type="checkbox"
            checked={showCompanion}
            onChange={(e) => setShowCompanion(e.target.checked)}
            className="rounded"
          />
          Add a companion filling <span className="text-muted-foreground">(optional)</span>
        </label>
        {showCompanion && (
          <div className="mt-3 pl-5 space-y-3">
            <select
              value={companionFillingId}
              onChange={(e) => setCompanionFillingId(e.target.value)}
              className="input w-full"
            >
              <option value="">Select a filling…</option>
              {allFillings.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            {companionFillingId && (
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs text-muted-foreground">
                  {allFillings.find((l) => l.id === companionFillingId)?.name ?? "Companion"} fills
                </span>
                <input
                  type="number"
                  min="10"
                  max="90"
                  value={companionFillPctStr}
                  onChange={(e) => setCompanionFillPctStr(e.target.value)}
                  className="input w-16 text-xs"
                />
                <span className="text-xs text-muted-foreground">
                  % · this ganache fills {experimentFillPct}%
                </span>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Live preview */}
      {mould && (
        <div className="mb-6 rounded-xl border border-border bg-muted/40 px-4 py-4">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Batch preview
          </p>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            <dt className="text-muted-foreground">Products</dt>
            <dd className="font-medium">{productCount}</dd>
            <dt className="text-muted-foreground">Ganache needed</dt>
            <dd className="font-medium">{targetWeightG.toFixed(0)} g</dd>
            <dt className="text-muted-foreground">Scale factor</dt>
            <dd className="font-medium">×{scaleFactor.toFixed(2)}</dd>
          </dl>
          {totalWeight > 0 && (
            <p className="text-xs text-muted-foreground mt-3">
              Your formula weighs {totalWeight.toFixed(0)} g
            </p>
          )}
        </div>
      )}

      <button
        onClick={handleStart}
        disabled={!mouldId}
        className="btn-primary px-5 py-2.5 text-sm disabled:opacity-40 w-full sm:w-auto"
      >
        Start batch <ChevronRight className="inline w-4 h-4 -mt-0.5" />
      </button>
    </div>
  );
}
