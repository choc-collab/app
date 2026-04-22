"use client";

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { ChevronRight, Workflow, Layers } from "lucide-react";

const PROPOSALS = [
  {
    href: "/proposals/nested-components",
    title: "Nested components & filling-only plans",
    tagline: "Reusable caramel → ganache · make filling batches without products",
    icon: Layers,
  },
];

export default function ProposalsIndexPage() {
  return (
    <div className="px-4 pt-6 pb-8 max-w-lg">
      <PageHeader
        title="Proposals"
        description="Clickable previews of features under design. In-memory only — nothing here touches your data."
      />
      <ul className="mt-6 space-y-2">
        {PROPOSALS.map((p) => {
          const Icon = p.icon;
          return (
            <li key={p.href}>
              <Link
                href={p.href}
                className="group block rounded-2xl border border-border bg-card hover:border-foreground/40 transition-colors px-4 py-3.5"
              >
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex-shrink-0 w-9 h-9 rounded-lg bg-muted group-hover:bg-foreground/5 transition-colors flex items-center justify-center">
                    <Icon className="w-4.5 h-4.5 text-foreground" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{p.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{p.tagline}</p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground mt-1 group-hover:translate-x-0.5 transition-transform" />
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
      <p className="mt-8 text-xs text-muted-foreground flex items-center gap-1.5">
        <Workflow className="w-3.5 h-3.5" />
        Each proposal is a scratch page — no DB writes, safe to poke around.
      </p>
    </div>
  );
}
