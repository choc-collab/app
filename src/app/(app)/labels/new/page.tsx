"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ArrowLeft } from "lucide-react";
import { saveLabelTemplate } from "@/lib/hooks";
import { createBlankTemplate } from "@/types";

interface PresetSize { label: string; width: number; height: number }

// A small set of practical label sizes. Free-form W/H is also available.
// Names stay dimensions-only — the user picks the template name themselves,
// so prescriptive labels like "Box of 9 retail" or "Filling jar" just
// presuppose use cases the template doesn't actually pin to.
const PRESETS: PresetSize[] = [
  { label: "40×40 mm", width: 40, height: 40 },
  { label: "50×40 mm", width: 50, height: 40 },
  { label: "50×50 mm", width: 50, height: 50 },
  { label: "60×40 mm", width: 60, height: 40 },
  { label: "89×36 mm", width: 89, height: 36 },
  { label: "89×62 mm", width: 89, height: 62 },
];

export default function NewLabelTemplatePage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [presetIdx, setPresetIdx] = useState<number | "custom">(1);
  // Track width / height as strings so the user can transiently empty the
  // field while typing (e.g. clear "50" before typing "60"). Coercing to a
  // number on every keystroke would re-render the input with "0" and trap
  // them into "060". Parsed once at submit.
  const [width, setWidth] = useState("50");
  const [height, setHeight] = useState("40");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string>("");

  function handlePreset(idx: number | "custom") {
    setPresetIdx(idx);
    if (idx !== "custom") {
      setWidth(String(PRESETS[idx].width));
      setHeight(String(PRESETS[idx].height));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Give the template a name.");
      return;
    }
    const widthMm = parseFloat(width);
    const heightMm = parseFloat(height);
    if (!Number.isFinite(widthMm) || widthMm <= 0 || widthMm > 500) {
      setError("Width must be between 1 and 500 mm.");
      return;
    }
    if (!Number.isFinite(heightMm) || heightMm <= 0 || heightMm > 500) {
      setError("Height must be between 1 and 500 mm.");
      return;
    }

    setSubmitting(true);
    try {
      const draft = createBlankTemplate({ name: trimmed, width: widthMm, height: heightMm });
      const id = await saveLabelTemplate(draft);
      router.push(`/labels/${encodeURIComponent(id)}?new=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create template.");
      setSubmitting(false);
    }
  }

  return (
    <div>
      <PageHeader title="New label template" description="Pick a name and a size — you'll add fields and tweak everything in the editor." />

      <div className="px-4 pb-8 max-w-xl">
        <Link href="/labels" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to templates
        </Link>

        <form onSubmit={handleSubmit} className="space-y-6">
          <section className="space-y-1.5">
            <label className="block text-sm font-medium">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Box of 9 — retail"
              autoFocus
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            />
          </section>

          <section className="space-y-2">
            <label className="block text-sm font-medium">Size</label>
            <p className="text-xs text-muted-foreground">Pick a preset or enter custom dimensions in millimetres.</p>
            <select
              value={presetIdx === "custom" ? "custom" : String(presetIdx)}
              onChange={(e) => handlePreset(e.target.value === "custom" ? "custom" : Number(e.target.value))}
              className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
            >
              {PRESETS.map((p, i) => (
                <option key={i} value={i}>{p.label}</option>
              ))}
              <option value="custom">Custom…</option>
            </select>
            <div className="flex gap-3 pt-1">
              <label className="flex-1">
                <span className="block text-xs text-muted-foreground mb-1">Width (mm)</span>
                <input
                  type="number"
                  value={width}
                  onChange={(e) => { setWidth(e.target.value); setPresetIdx("custom"); }}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                  min={1}
                  max={500}
                />
              </label>
              <label className="flex-1">
                <span className="block text-xs text-muted-foreground mb-1">Height (mm)</span>
                <input
                  type="number"
                  value={height}
                  onChange={(e) => { setHeight(e.target.value); setPresetIdx("custom"); }}
                  className="w-full rounded-md border border-border bg-card px-3 py-2 text-sm"
                  min={1}
                  max={500}
                />
              </label>
            </div>
          </section>

          {error && (
            <div className="text-sm text-status-warn bg-status-warn-bg border border-status-warn-edge rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 rounded-full bg-primary text-primary-foreground py-2 text-sm font-medium disabled:opacity-50"
            >
              {submitting ? "Creating…" : "Create template"}
            </button>
            <Link
              href="/labels"
              className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              Cancel
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
