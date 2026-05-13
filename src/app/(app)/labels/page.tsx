"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Plus, Pencil, Copy, Trash2, Tags } from "lucide-react";
import { useLabelTemplates, saveLabelTemplate, deleteLabelTemplate } from "@/lib/hooks";
import { labelTemplateKind } from "@/types";
import type { LabelTemplate, LabelTemplateKind } from "@/types";

const KIND_BADGE: Record<LabelTemplateKind, string> = {
  "production-batch": "Batch",
  "filling-batch": "Filling",
  "collection-package": "Box",
};

function formatRelativeDate(d: Date | string | undefined): string {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

export default function LabelsGalleryPage() {
  const templates = useLabelTemplates();
  const router = useRouter();
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  async function handleDuplicate(t: LabelTemplate) {
    const now = new Date();
    const copy: Omit<LabelTemplate, "id"> = {
      name: `${t.name} (copy)`,
      kind: labelTemplateKind(t),
      width: t.width,
      height: t.height,
      piecesPerLabel: t.piecesPerLabel,
      // Re-id every field so they stay unique within the new template.
      fields: t.fields.map((f, i) => ({ ...f, id: `f${Date.now() + i}` })),
      createdAt: now,
      updatedAt: now,
    };
    const newId = await saveLabelTemplate(copy);
    router.push(`/labels/${encodeURIComponent(newId)}`);
  }

  async function handleConfirmDelete(id: string) {
    await deleteLabelTemplate(id);
    setConfirmDeleteId(null);
  }

  return (
    <div>
      <PageHeader title="Label templates" description="Design printable labels for boxes, fillings, and shop assortments." />

      <div className="px-4 pb-8 space-y-4">
        <div className="flex items-center justify-end">
          <Link
            href="/labels/new"
            className="flex items-center gap-1.5 rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90"
          >
            <Plus className="w-3.5 h-3.5" />
            New template
          </Link>
        </div>

        {templates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border bg-card px-6 py-12 text-center">
            <Tags className="w-8 h-8 mx-auto text-muted-foreground/60" />
            <p className="text-sm font-medium mt-3">No label templates yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Create one to design a printable layout for box labels, filling stickers, or retail boxes.
            </p>
            <Link
              href="/labels/new"
              className="inline-flex items-center gap-1.5 mt-4 rounded-full bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:opacity-90"
            >
              <Plus className="w-3.5 h-3.5" />
              Create your first template
            </Link>
          </div>
        ) : (
          <ul className="rounded-lg border border-border bg-card divide-y divide-border">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline gap-2">
                    <Link
                      href={`/labels/${encodeURIComponent(t.id!)}`}
                      className="text-sm font-medium hover:underline truncate"
                    >
                      {t.name}
                    </Link>
                    <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground px-1.5 py-0.5 rounded bg-muted shrink-0">
                      {KIND_BADGE[labelTemplateKind(t)]}
                    </span>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {t.width}×{t.height}mm
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                    <span>{t.fields.length} field{t.fields.length === 1 ? "" : "s"}</span>
                    {t.updatedAt && (
                      <>
                        <span>·</span>
                        <span>Updated {formatRelativeDate(t.updatedAt)}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Link
                    href={`/labels/${encodeURIComponent(t.id!)}`}
                    className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
                    aria-label="Edit"
                    title="Edit"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </Link>
                  <button
                    onClick={() => handleDuplicate(t)}
                    className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-foreground"
                    aria-label="Duplicate"
                    title="Duplicate"
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(t.id!)}
                    className="p-1.5 rounded-full hover:bg-muted text-muted-foreground hover:text-status-warn"
                    aria-label="Delete"
                    title="Delete"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Delete confirm modal */}
      {confirmDeleteId && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 px-4"
          onClick={() => setConfirmDeleteId(null)}
        >
          <div
            className="bg-card rounded-lg border border-border p-5 max-w-sm w-full shadow-lg"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-medium">Delete this template?</p>
            <p className="text-xs text-muted-foreground mt-1.5">
              The template is removed from this device. Already-printed labels are unaffected.
            </p>
            <div className="flex gap-2 mt-4 justify-end">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="px-3 py-1.5 text-sm rounded-full border border-border"
              >
                Cancel
              </button>
              <button
                onClick={() => handleConfirmDelete(confirmDeleteId)}
                className="px-3 py-1.5 text-sm rounded-full bg-status-warn text-white"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
