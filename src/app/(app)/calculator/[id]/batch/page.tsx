"use client";

import { use, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  useExperiment,
  useExperimentIngredients,
  useMoulds,
  useFillings,
  useFillingIngredients,
  useIngredients,
  saveExperiment,
  forkExperimentVersion,
  saveFilling,
  saveFillingIngredient,
  setIngredientLowStock,
} from "@/lib/hooks";
import { FILL_FACTOR } from "@/lib/production";
import { ChevronLeft, CheckCircle } from "lucide-react";
import { LowStockFlagButton } from "@/components/pantry";

export default function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);
  const id = decodeURIComponent(idStr);
  const router = useRouter();
  const searchParams = useSearchParams();

  const mouldId = searchParams.get("mouldId") ?? "";
  const numMoulds = Math.max(1, parseInt(searchParams.get("numMoulds") ?? "1") || 1);
  const companionFillingId = searchParams.get("companionFillingId") ?? "";
  const companionFillPct = Math.min(90, Math.max(0, parseFloat(searchParams.get("companionFillPct") ?? "0") || 0));
  const experimentFillPct = 100 - companionFillPct;

  const experiment = useExperiment(id);
  const experimentIngredients = useExperimentIngredients(id);
  const allMoulds = useMoulds(true);
  const allFillings = useFillings();
  const companionIngredients = useFillingIngredients(companionFillingId || undefined);
  const allIngredients = useIngredients();

  const mould = allMoulds.find((m) => m.id === mouldId);
  const companionFilling = allFillings.find((l) => l.id === companionFillingId);
  const ingredientMap = useMemo(() => new Map(allIngredients.map((i) => [i.id!, i])), [allIngredients]);

  // Scaling
  const expTotalWeight = experimentIngredients.reduce((s, ei) => s + ei.amount, 0);
  const targetWeightG = mould
    ? mould.cavityWeightG * mould.numberOfCavities * numMoulds * FILL_FACTOR * (experimentFillPct / 100)
    : 0;
  const scaleFactor = expTotalWeight > 0 && targetWeightG > 0 ? targetWeightG / expTotalWeight : 1;

  const companionTotalWeight = companionIngredients.reduce((s, li) => s + li.amount, 0);
  const companionTargetWeightG = mould && companionFillPct > 0
    ? mould.cavityWeightG * mould.numberOfCavities * numMoulds * FILL_FACTOR * (companionFillPct / 100)
    : 0;
  const companionScaleFactor = companionTotalWeight > 0 && companionTargetWeightG > 0
    ? companionTargetWeightG / companionTotalWeight
    : 1;

  // Page state
  type Step = "product" | "feedback" | "to_improve_done" | "promote";
  const [step, setStep] = useState<Step>("product");
  const [tasteFeedback, setTasteFeedback] = useState(0);
  const [textureFeedback, setTextureFeedback] = useState(0);
  const [feedbackNotes, setFeedbackNotes] = useState("");
  const [fillingName, setFillingName] = useState("");
  const [promotedFillingId, setPromotedFillingId] = useState<string | null>(null);

  function buildFeedbackText(taste: number, texture: number, notes: string): string {
    const parts: string[] = [];
    if (taste > 0) parts.push(`Taste: ${taste}/5`);
    if (texture > 0) parts.push(`Texture/mouthfeel: ${texture}/5`);
    if (notes.trim()) parts.push(notes.trim());
    return parts.join(" · ");
  }

  async function handleFeedbackDecision(outcome: "to_improve" | "promote") {
    if (!experiment) return;
    if (outcome === "to_improve") {
      await saveExperiment({ ...experiment, status: "to_improve", tasteFeedback, textureFeedback, batchNotes: feedbackNotes });
      setStep("to_improve_done");
    } else {
      setFillingName(experiment.name);
      setStep("promote");
    }
  }

  async function handlePromoteToFilling() {
    if (!experiment || !fillingName.trim()) return;
    const newFillingId = await saveFilling({
      name: fillingName.trim(),
      category: "Ganaches (Emulsions)",
      source: "Product Lab",
      description: buildFeedbackText(tasteFeedback, textureFeedback, feedbackNotes),
      allergens: [],
      instructions: "",
      status: "confirmed",
      createdAt: new Date(),
    }) as string;
    await Promise.all(
      experimentIngredients.map((ei, idx) =>
        saveFillingIngredient({ fillingId: newFillingId, ingredientId: ei.ingredientId, amount: ei.amount, unit: "g", sortOrder: idx })
      )
    );
    await saveExperiment({ ...experiment, status: "promoted", promotedFillingId: newFillingId, tasteFeedback, textureFeedback, batchNotes: feedbackNotes });
    setPromotedFillingId(newFillingId);
  }

  async function handleNewVersion() {
    const newId = await forkExperimentVersion(id);
    router.push(`/calculator/${encodeURIComponent(newId)}?new=1`);
  }

  if (!experiment || !mould) {
    return <div className="px-4 pt-6 text-sm text-muted-foreground">Loading…</div>;
  }

  const productCount = mould.numberOfCavities * numMoulds;

  return (
    <div className="px-4 pt-6 pb-12 max-w-lg">
      <button
        onClick={() => router.push(`/calculator/${encodeURIComponent(id)}`)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ChevronLeft className="w-4 h-4" /> {experiment.name}
      </button>

      <h1 className="text-xl font-bold mb-0.5">Product</h1>
      <p className="text-sm text-muted-foreground mb-5">
        {mould.name} · {numMoulds} mould{numMoulds !== 1 ? "s" : ""} · {productCount} product{productCount !== 1 ? "s" : ""}
      </p>

      {/* Scaled product cards */}
      {step === "product" && (
        <>
          <div className="space-y-4 mb-6">
            <ScaledProductCard
              title={experiment.name}
              subtitle={`${targetWeightG.toFixed(0)} g · ×${scaleFactor.toFixed(2)} scale`}
              rows={experimentIngredients.map((ei) => {
                const ing = ingredientMap.get(ei.ingredientId);
                return {
                  id: ei.ingredientId,
                  name: ing ? (ing.manufacturer ? `${ing.name} (${ing.manufacturer})` : ing.name) : "Unknown",
                  originalAmount: ei.amount,
                  scaledAmount: Math.round(ei.amount * scaleFactor * 10) / 10,
                  lowStock: ing?.lowStock,
                };
              })}
            />
            {companionFilling && companionIngredients.length > 0 && (
              <ScaledProductCard
                title={companionFilling.name}
                subtitle={`${companionTargetWeightG.toFixed(0)} g · ×${companionScaleFactor.toFixed(2)} scale`}
                rows={companionIngredients.map((li) => {
                  const ing = ingredientMap.get(li.ingredientId);
                  return {
                    id: li.ingredientId,
                    name: ing?.name ?? "Unknown",
                    originalAmount: li.amount,
                    scaledAmount: Math.round(li.amount * companionScaleFactor * 10) / 10,
                    lowStock: ing?.lowStock,
                  };
                })}
              />
            )}
          </div>
          <button onClick={() => setStep("feedback")} className="btn-primary px-5 py-2 text-sm">
            Made it ✓
          </button>
        </>
      )}

      {/* Feedback form */}
      {step === "feedback" && (
        <div className="space-y-5">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setStep("product")}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          </div>
          <p className="text-sm font-medium">How did it turn out?</p>
          <RatingRow label="Taste" value={tasteFeedback} onChange={setTasteFeedback} />
          <RatingRow label="Texture / mouthfeel" value={textureFeedback} onChange={setTextureFeedback} />
          <div>
            <label className="label">Notes</label>
            <textarea
              value={feedbackNotes}
              onChange={(e) => setFeedbackNotes(e.target.value)}
              placeholder="Taste notes, texture observations, what to change…"
              rows={3}
              className="input w-full resize-none"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => handleFeedbackDecision("to_improve")}
              className="flex-1 text-sm border border-border rounded-full py-2 font-medium hover:bg-muted transition-colors"
            >
              Needs improvement
            </button>
            <button
              onClick={() => handleFeedbackDecision("promote")}
              className="flex-1 btn-primary text-sm py-2"
            >
              Ready to promote →
            </button>
          </div>
        </div>
      )}

      {/* Needs improvement outcome */}
      {step === "to_improve_done" && (
        <div className="p-4 rounded-lg border border-status-warn-edge bg-status-warn-bg space-y-2 text-sm">
          <p className="font-medium text-status-warn">Feedback saved.</p>
          <p className="text-xs text-status-warn">Come back to the lab to refine the product. Start a new version when you&rsquo;re ready to tweak.</p>
          <div className="flex gap-2 pt-1">
            <button onClick={handleNewVersion} className="btn-primary px-3 py-1.5 text-sm">New version →</button>
            <button onClick={() => router.push("/lab")} className="text-sm text-muted-foreground hover:text-foreground">Back to Lab</button>
          </div>
        </div>
      )}

      {/* Promote outcome */}
      {step === "promote" && (
        <div className="space-y-3">
          <p className="text-sm font-medium">Promote to filling</p>
          <div>
            <label className="label">Filling name</label>
            <input
              type="text"
              value={fillingName}
              onChange={(e) => setFillingName(e.target.value)}
              className="input w-full"
              autoFocus
            />
          </div>
          <p className="text-xs text-muted-foreground">
            Feedback will be saved as the filling description. Status set to &ldquo;confirmed&rdquo;.
          </p>
          {promotedFillingId ? (
            <div className="flex items-center gap-2 text-sm text-status-ok">
              <CheckCircle className="w-4 h-4 shrink-0" />
              Saved as filling.{" "}
              <button onClick={() => router.push(`/fillings/${encodeURIComponent(promotedFillingId)}`)} className="underline">
                Open filling
              </button>
            </div>
          ) : (
            <button
              onClick={handlePromoteToFilling}
              disabled={!fillingName.trim()}
              className="btn-primary px-4 py-1.5 text-sm disabled:opacity-40"
            >
              Save as confirmed filling ✓
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- Scaled product card (matches production /products page style) ---

type ScaledRow = {
  id: string;
  name: string;
  originalAmount: number;
  scaledAmount: number;
  lowStock?: boolean;
};

function ScaledProductCard({ title, subtitle, rows }: { title: string; subtitle: string; rows: ScaledRow[] }) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex justify-between items-start px-3 pt-3 pb-2 bg-primary/8">
        <div>
          <h3 className="font-medium text-sm">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
        </div>
      </div>
      <ul className="border-t border-border">
        {rows.map((row) => {
          const active = hoveredId === row.id;
          return (
            <li
              key={row.id}
              onMouseEnter={() => setHoveredId(row.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`flex items-baseline gap-2 px-3 py-2 border-b border-border last:border-b-0 transition-colors ${active ? "bg-primary/8" : ""}`}
            >
              <span className={`text-sm flex-1 min-w-0 truncate ${active ? "font-medium" : ""}`}>{row.name}</span>
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">{row.originalAmount}g →</span>
              <span className={`tabular-nums shrink-0 ${active ? "text-base font-bold text-primary" : "text-sm font-medium"}`}>
                {row.scaledAmount}g
              </span>
              <LowStockFlagButton
                flagged={row.lowStock}
                itemName={row.name}
                onFlag={() => setIngredientLowStock(row.id, true)}
                size="sm"
              />
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// --- Rating buttons (1–5) ---

function RatingRow({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <div>
      <label className="text-xs text-muted-foreground block mb-1.5">{label}</label>
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            onClick={() => onChange(value === n ? 0 : n)}
            className={`w-9 h-9 rounded text-sm font-medium border transition-colors ${
              n <= value
                ? "bg-primary text-primary-foreground border-primary"
                : "bg-card border-border hover:border-primary/50"
            }`}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}
