"use client";

import { useEffect, useState } from "react";
import { useProductionPlan } from "@/lib/hooks";
import { useSpaId } from "@/lib/use-spa-id";
import { ArrowLeft, Copy, Check } from "lucide-react";
import Link from "next/link";

export default function BatchSummaryPage() {
  const planId = useSpaId("production");
  const plan = useProductionPlan(planId);
  const [copied, setCopied] = useState(false);
  const [backHref, setBackHref] = useState("/production");
  const [backLabel, setBackLabel] = useState("Back to batch");

  const sanitizeBackHref = (value: string | null): string | null => {
    if (!value) return null;
    if (!value.startsWith("/")) return null;
    if (value.startsWith("//")) return null;
    return value;
  };

  useEffect(() => {
    const from = sanitizeBackHref(new URLSearchParams(window.location.search).get("from"));
    if (from === "/production") { setBackHref(from); setBackLabel("Production"); }
    else if (from) { setBackHref(from); setBackLabel("Back to product"); }
    else if (planId) { setBackHref(`/production/${planId}`); }
  }, [planId]);

  if (!planId || !plan) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    );
  }

  if (!plan.batchSummary) {
    return (
      <div>
        <div className="px-4 pt-6 pb-2">
          <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3">
            <ArrowLeft className="w-4 h-4" /> {backLabel}
          </Link>
          <h1 className="text-xl font-bold">Batch summary</h1>
        </div>
        <p className="px-4 text-sm text-muted-foreground py-8 text-center">
          No summary available. Summaries are generated automatically when a batch is marked as done.
        </p>
      </div>
    );
  }

  async function handleCopy() {
    await navigator.clipboard.writeText(plan!.batchSummary!);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="px-4 pt-6 pb-4">
        <Link href={backHref} className="inline-flex items-center gap-1 text-sm text-muted-foreground mb-3">
          <ArrowLeft className="w-4 h-4" /> {backLabel}
        </Link>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold">Batch summary</h1>
            {plan.batchNumber && (
              <p className="font-mono text-xs text-muted-foreground mt-0.5">{plan.batchNumber}</p>
            )}
          </div>
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-sm text-muted-foreground hover:bg-muted transition-colors shrink-0"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-primary" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      <div className="px-4 pb-8">
        <pre className="whitespace-pre-wrap font-mono text-xs leading-relaxed bg-muted/50 rounded-lg border border-border p-4 text-foreground">
          {plan.batchSummary}
        </pre>
      </div>
    </div>
  );
}
