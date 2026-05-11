"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronDown, Trash2, AlertTriangle, CheckCircle2 } from "lucide-react";
import { useSpaId } from "@/lib/use-spa-id";
import {
  useLabelTemplate,
  saveLabelTemplate,
  useBrand,
  useProductionPlans,
  useAllPlanProducts,
  useProductsList,
  useMarketRegion,
} from "@/lib/hooks";
import { useLabelContext } from "@/lib/labelContext";
import { renderField, FIELD_DEFINITIONS, FIELD_TYPES_BY_GROUP, effectiveFieldSizePt, formatLabelDate, DATE_FORMAT_PRESETS, DEFAULT_DATE_FORMAT, type LabelFieldGroup } from "@/lib/labelFields";
import { lintTemplate, summariseLint, type LintWarning } from "@/lib/labelLinter";
import type { LabelField, LabelFieldType, LabelSource, LabelTemplate, LabelFieldProps } from "@/types";

const MM_BASE = 4; // px per mm at zoom = 1
const ZOOM_MIN = 1;
const ZOOM_MAX = 8;
const SOURCE_STORAGE_KEY = "choc-collab.labels.lastSource";

const GROUP_LABEL: Record<LabelFieldGroup, string> = {
  product: "Product / batch (auto)",
  brand: "Brand / business (auto)",
  custom: "Custom",
};

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function newFieldId(): string {
  return `f${Date.now()}-${Math.floor(Math.random() * 1000)}`;
}

export default function LabelEditorPage() {
  const id = useSpaId("labels");
  const remote = useLabelTemplate(id);

  if (!id) return <Loading message="Loading template…" />;
  if (remote === undefined) return <Loading message="Loading template…" />;
  if (remote === null) return <NotFound />;
  return <Editor key={remote.id} initial={remote} />;
}

function Loading({ message }: { message: string }) {
  return <div className="px-4 py-8 text-sm text-muted-foreground">{message}</div>;
}

function NotFound() {
  return (
    <div className="px-4 py-8">
      <p className="text-sm">Template not found.</p>
      <Link href="/labels" className="text-sm underline mt-2 inline-block">Back to gallery</Link>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

function Editor({ initial }: { initial: LabelTemplate }) {
  // Local draft is the source of truth while editing. We hydrate from `initial`
  // exactly once (on mount); subsequent mutations write through `commit`.
  const [tpl, setTpl] = useState<LabelTemplate>(initial);
  const [zoom, setZoom] = useState(3);
  const [sel, setSel] = useState<string | null>(null);
  const [showWarnings, setShowWarnings] = useState(true);
  const [showTabletWarning, setShowTabletWarning] = useState(false);

  // The drag-end handler that's wired into a `pointerup` *native* listener
  // closes over the render in which it was attached, so it reads `tpl` from
  // that render even after dozens of pointermove-triggered re-renders. Refs
  // dodge the closure by mutating through the same identity across renders,
  // so `commitCurrent` always saves the post-drag state instead of pre-drag.
  const tplRef = useRef(tpl);
  tplRef.current = tpl;

  useEffect(() => {
    if (typeof window === "undefined") return;
    const isCoarseAndNarrow = window.matchMedia("(pointer: coarse) and (max-width: 1100px)").matches;
    if (isCoarseAndNarrow) setShowTabletWarning(true);
  }, []);

  // Persist + send to Dexie. Always operates on the latest local draft.
  function commit(next: LabelTemplate) {
    setTpl(next);
    tplRef.current = next;
    saveLabelTemplate(next).catch((err) => {
      console.error("saveLabelTemplate failed", err);
    });
  }

  // Mutators used by inspector + drag handlers.
  function setMetadata(patch: Partial<LabelTemplate>) {
    commit({ ...tplRef.current, ...patch, updatedAt: new Date() });
  }
  function updateFieldLocal(fieldId: string, patch: Partial<LabelField>) {
    setTpl((cur) => {
      const next = {
        ...cur,
        fields: cur.fields.map((f) => f.id === fieldId
          ? { ...f, ...patch, props: patch.props ? { ...f.props, ...patch.props } : f.props }
          : f),
      };
      tplRef.current = next;
      return next;
    });
  }
  function updateAndCommitField(fieldId: string, patch: Partial<LabelField>) {
    const cur = tplRef.current;
    const next: LabelTemplate = {
      ...cur,
      fields: cur.fields.map((f) => f.id === fieldId
        ? { ...f, ...patch, props: patch.props ? { ...f.props, ...patch.props } : f.props }
        : f),
      updatedAt: new Date(),
    };
    commit(next);
  }
  function commitCurrent() {
    commit({ ...tplRef.current, updatedAt: new Date() });
  }
  function addField(type: LabelFieldType, atMm?: { x: number; y: number }) {
    const def = FIELD_DEFINITIONS[type];
    const cur = tplRef.current;
    const newF: LabelField = {
      id: newFieldId(),
      type,
      x: clamp(atMm?.x ?? 4, 0, Math.max(0, cur.width - def.defaultW)),
      y: clamp(atMm?.y ?? 4, 0, Math.max(0, cur.height - def.defaultH)),
      w: def.defaultW,
      h: def.defaultH,
      props: {},
    };
    commit({ ...cur, fields: [...cur.fields, newF], updatedAt: new Date() });
    setSel(newF.id);
  }
  function removeField(fieldId: string) {
    const cur = tplRef.current;
    commit({ ...cur, fields: cur.fields.filter((f) => f.id !== fieldId), updatedAt: new Date() });
    if (sel === fieldId) setSel(null);
  }

  const selectedField = sel ? tpl.fields.find((f) => f.id === sel) ?? null : null;

  // Source picker — drives the live preview.
  const [source, setSource] = useState<LabelSource | null>(() => readPersistedSource(tpl.id));
  useEffect(() => { writePersistedSource(tpl.id, source); }, [tpl.id, source]);
  const context = useLabelContext(source);
  const brand = useBrand();
  const marketRegion = useMarketRegion();
  const lint = useMemo(() => lintTemplate(tpl, brand), [tpl, brand]);

  return (
    <div className="flex flex-col h-screen bg-background">
      {showTabletWarning && (
        <div className="px-4 py-2 bg-status-warn-bg border-b border-status-warn-edge text-xs text-status-warn flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1">
            The editor is best used on a desktop with a mouse. Drag-to-position is awkward on touch screens.
          </span>
          <button onClick={() => setShowTabletWarning(false)} className="underline">Dismiss</button>
        </div>
      )}

      <TopBar
        tpl={tpl}
        onName={(name) => setMetadata({ name })}
        zoom={zoom}
        setZoom={setZoom}
        source={source}
        setSource={setSource}
      />

      <div className="flex-1 grid grid-cols-[240px_1fr_320px] min-h-0">
        <FieldRail fields={tpl.fields} onAdd={(type) => addField(type)} />
        <Canvas
          tpl={tpl}
          zoom={zoom}
          sel={sel}
          setSel={setSel}
          context={context ?? null}
          brand={brand}
          marketRegion={marketRegion}
          updateFieldLocal={updateFieldLocal}
          commitCurrent={commitCurrent}
          addFieldAt={(type, at) => addField(type, at)}
        />
        <Inspector
          tpl={tpl}
          field={selectedField}
          setMetadata={setMetadata}
          updateField={updateAndCommitField}
          removeField={removeField}
          lint={lint}
          showWarnings={showWarnings}
          setShowWarnings={setShowWarnings}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Top bar
// ---------------------------------------------------------------------------

function TopBar({
  tpl, onName, zoom, setZoom, source, setSource,
}: {
  tpl: LabelTemplate;
  onName: (s: string) => void;
  zoom: number;
  setZoom: (z: number) => void;
  source: LabelSource | null;
  setSource: (s: LabelSource | null) => void;
}) {
  return (
    <div className="border-b border-border px-4 py-2 flex items-center gap-3 bg-card">
      <Link href="/labels" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="w-3.5 h-3.5" /> Templates
      </Link>
      <input
        value={tpl.name}
        onChange={(e) => onName(e.target.value)}
        className="text-sm font-medium px-2 py-1 rounded border border-transparent hover:border-border focus:border-border focus:outline-none bg-transparent"
        style={{ width: 240 }}
      />
      <span className="text-xs font-mono text-muted-foreground">
        {tpl.width}×{tpl.height}mm
      </span>
      <div className="flex-1" />
      <SourcePicker value={source} onChange={setSource} />
      <ZoomControl zoom={zoom} setZoom={setZoom} />
    </div>
  );
}

function ZoomControl({ zoom, setZoom }: { zoom: number; setZoom: (z: number) => void }) {
  return (
    <div className="inline-flex items-center gap-1">
      <button onClick={() => setZoom(Math.max(ZOOM_MIN, zoom - 0.5))} className="px-2 py-0.5 text-xs border border-border rounded">−</button>
      <span className="text-xs font-mono text-muted-foreground min-w-[3em] text-center">{Math.round(zoom * 100)}%</span>
      <button onClick={() => setZoom(Math.min(ZOOM_MAX, zoom + 0.5))} className="px-2 py-0.5 text-xs border border-border rounded">+</button>
    </div>
  );
}

function SourcePicker({
  value, onChange,
}: {
  value: LabelSource | null;
  onChange: (s: LabelSource | null) => void;
}) {
  const plans = useProductionPlans();
  const allPlanProducts = useAllPlanProducts();
  const products = useProductsList();
  const productMap = useMemo(() => new Map(products.map((p) => [p.id!, p])), [products]);

  // Production-batch is the only source kind whose resolver is implemented in
  // Phase 1. The other kinds (filling-batch, collection-package) come online
  // in Phase 2 alongside their entry points.
  const options = useMemo(() => {
    const out: Array<{ value: string; label: string; source: LabelSource }> = [];
    const recentPlans = plans
      .filter((p) => p.status === "done" && p.id)
      .sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0))
      .slice(0, 30);
    for (const plan of recentPlans) {
      for (const pp of allPlanProducts.filter((x) => x.planId === plan.id)) {
        const product = productMap.get(pp.productId);
        const name = product?.name ?? "Unknown product";
        out.push({
          value: `${plan.id}|${pp.id}`,
          label: `${name} · ${plan.batchNumber ?? plan.name}`,
          source: { kind: "production-batch", planId: plan.id!, planProductId: pp.id! },
        });
      }
    }
    return out;
  }, [plans, allPlanProducts, productMap]);

  const selectedKey = value && "planProductId" in value ? `${value.planId}|${value.planProductId}` : "";
  return (
    <div className="inline-flex items-center gap-2">
      <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">Preview</span>
      <select
        value={selectedKey}
        onChange={(e) => {
          const value = e.target.value;
          // Drop focus before propagating state — keeps the keyboard / pointer
          // focus from lingering on the dropdown and stealing interactions
          // from the canvas after a source is chosen.
          e.target.blur();
          if (!value) { onChange(null); return; }
          const opt = options.find((o) => o.value === value);
          onChange(opt?.source ?? null);
        }}
        className="text-xs border border-border rounded px-2 py-1 bg-card"
      >
        <option value="">— Pick a recent batch —</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field rail (left)
// ---------------------------------------------------------------------------

function FieldRail({
  fields, onAdd,
}: {
  fields: ReadonlyArray<LabelField>;
  onAdd: (type: LabelFieldType) => void;
}) {
  const groups: LabelFieldGroup[] = ["product", "brand", "custom"];
  // Count occurrences per field type so the rail can mark which types are
  // already on the canvas (and how many times).
  const countByType = useMemo(() => {
    const m = new Map<LabelFieldType, number>();
    for (const f of fields) m.set(f.type, (m.get(f.type) ?? 0) + 1);
    return m;
  }, [fields]);

  return (
    <div className="border-r border-border p-3 overflow-auto bg-card flex flex-col gap-3">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Field library</div>
        <div className="text-[10px] text-muted-foreground/70 mt-0.5">Drag onto the label, or click to add at top-left.</div>
      </div>
      {groups.map((g) => (
        <div key={g} className="flex flex-col gap-1.5">
          <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{GROUP_LABEL[g]}</div>
          {FIELD_TYPES_BY_GROUP[g].map((type) => {
            const def = FIELD_DEFINITIONS[type];
            const count = countByType.get(type) ?? 0;
            const placed = count > 0;
            return (
              <div
                key={type}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "copy";
                  e.dataTransfer.setData("application/x-field", type);
                }}
                onClick={() => onAdd(type)}
                className={`flex items-center gap-2 px-2 py-1.5 border rounded text-xs cursor-grab select-none transition-colors ${
                  placed
                    ? "border-solid border-primary/40 bg-accent text-accent-foreground hover:bg-accent/80"
                    : "border-dashed border-border hover:bg-muted/40"
                }`}
                title={placed ? `${count} on canvas — click to add another` : "Click to add"}
              >
                <span className={`w-2 h-2 rounded-sm shrink-0 ${placed ? "bg-primary" : "bg-muted"}`} />
                <span className={`flex-1 ${placed ? "font-medium" : ""}`}>{def.label}</span>
                {placed ? (
                  <span className="text-[10px] font-mono px-1.5 rounded-full bg-primary/15 text-primary tabular-nums">
                    ×{count}
                  </span>
                ) : (
                  <span className="text-[9px] font-mono text-muted-foreground">+</span>
                )}
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Canvas (center)
// ---------------------------------------------------------------------------

function Canvas({
  tpl, zoom, sel, setSel, context, brand, marketRegion, updateFieldLocal, commitCurrent, addFieldAt,
}: {
  tpl: LabelTemplate;
  zoom: number;
  sel: string | null;
  setSel: (id: string | null) => void;
  context: ReturnType<typeof useLabelContext> extends infer T ? (T extends undefined ? null : NonNullable<T> | null) : null;
  brand: ReturnType<typeof useBrand>;
  marketRegion: ReturnType<typeof useMarketRegion>;
  updateFieldLocal: (id: string, patch: Partial<LabelField>) => void;
  commitCurrent: () => void;
  addFieldAt: (type: LabelFieldType, at: { x: number; y: number }) => void;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const px = MM_BASE * zoom;
  const labelW = tpl.width * px;
  const labelH = tpl.height * px;

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const type = e.dataTransfer.getData("application/x-field") as LabelFieldType;
    if (!type || !FIELD_DEFINITIONS[type] || !ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const xMm = (e.clientX - rect.left) / px;
    const yMm = (e.clientY - rect.top) / px;
    addFieldAt(type, { x: xMm, y: yMm });
  }
  function onDragOver(e: React.DragEvent) {
    if (e.dataTransfer.types.includes("application/x-field")) e.preventDefault();
  }

  return (
    <div className="overflow-auto p-6 flex justify-center" style={{ background: "#f0eee8" }}>
      <div>
        <div className="text-[10px] font-mono text-muted-foreground mb-1">
          {tpl.width}mm × {tpl.height}mm · {Math.round(zoom * 100)}%
          {context && context.warnings.length > 0 && <span className="ml-2">· {context.warnings.length} resolver note{context.warnings.length === 1 ? "" : "s"}</span>}
        </div>
        <div
          ref={ref}
          onClick={(e) => { if (e.target === e.currentTarget) setSel(null); }}
          onDrop={onDrop}
          onDragOver={onDragOver}
          style={{
            position: "relative",
            width: labelW, height: labelH,
            background: "#fff", border: "1px solid #111",
            boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
          }}
        >
          {tpl.fields.map((f) => (
            <FieldNode
              key={f.id}
              field={f}
              tpl={tpl}
              px={px}
              selected={sel === f.id}
              onSelect={() => setSel(f.id)}
              context={context}
              brand={brand}
              marketRegion={marketRegion}
              updateLocal={updateFieldLocal}
              commitCurrent={commitCurrent}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FieldNode({
  field, tpl, px, selected, onSelect, context, brand, marketRegion, updateLocal, commitCurrent,
}: {
  field: LabelField;
  tpl: LabelTemplate;
  px: number;
  selected: boolean;
  onSelect: () => void;
  context: Parameters<typeof renderField>[0]["context"];
  brand: Parameters<typeof renderField>[0]["brand"];
  marketRegion: ReturnType<typeof useMarketRegion>;
  updateLocal: (id: string, patch: Partial<LabelField>) => void;
  commitCurrent: () => void;
}) {
  function startInteraction(e: React.PointerEvent<HTMLElement>, mode: "move" | "resize") {
    // Only react to the primary mouse button / pen / single touch.
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault(); // suppress native image drag, text selection, etc.
    if (mode === "move") onSelect();

    const target = e.currentTarget;
    const pointerId = e.pointerId;
    const startX = e.clientX, startY = e.clientY;
    const startF = { ...field };

    // `setPointerCapture` routes every subsequent pointermove/pointerup for
    // this pointerId back to `target`, even when the cursor leaves the field.
    // Without it, fast drags off the small canvas silently stop tracking.
    try { target.setPointerCapture(pointerId); } catch { /* not supported — fall back to bubbling */ }

    function onMove(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      const dxMm = (ev.clientX - startX) / px;
      const dyMm = (ev.clientY - startY) / px;
      if (mode === "move") {
        updateLocal(field.id, {
          x: clamp(startF.x + dxMm, 0, tpl.width - startF.w),
          y: clamp(startF.y + dyMm, 0, tpl.height - startF.h),
        });
      } else {
        updateLocal(field.id, {
          w: clamp(startF.w + dxMm, 4, tpl.width - startF.x),
          h: clamp(startF.h + dyMm, 2, tpl.height - startF.y),
        });
      }
    }
    function onUp(ev: PointerEvent) {
      if (ev.pointerId !== pointerId) return;
      target.removeEventListener("pointermove", onMove);
      target.removeEventListener("pointerup", onUp);
      target.removeEventListener("pointercancel", onUp);
      try { target.releasePointerCapture(pointerId); } catch { /* already released */ }
      // Persist the final position once the gesture ends.
      commitCurrent();
    }
    target.addEventListener("pointermove", onMove);
    target.addEventListener("pointerup", onUp);
    target.addEventListener("pointercancel", onUp);
  }

  return (
    <div
      onPointerDown={(e) => startInteraction(e, "move")}
      style={{
        position: "absolute",
        left: field.x * px, top: field.y * px,
        width: field.w * px, height: field.h * px,
        cursor: "move",
        userSelect: "none",
        // `touch-action: none` is required for setPointerCapture to track
        // touch drags reliably — otherwise the browser steals the gesture for
        // scroll. Harmless on mouse pointers.
        touchAction: "none",
        outline: selected ? "1.5px solid #1f6feb" : undefined,
        outlineOffset: selected ? 3 : undefined,
        padding: 1,
      }}
    >
      <div style={{ width: "100%", height: "100%", overflow: "hidden", pointerEvents: "none" }}>
        {renderField({ field, context, brand, template: tpl, marketRegion })}
      </div>
      {selected && (
        <span
          onPointerDown={(e) => startInteraction(e, "resize")}
          style={{
            position: "absolute", right: -6, bottom: -6,
            width: 12, height: 12, background: "#1f6feb", border: "1.5px solid #fff",
            borderRadius: 2, cursor: "nwse-resize",
            touchAction: "none",
          }}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inspector (right)
// ---------------------------------------------------------------------------

function Inspector({
  tpl, field, setMetadata, updateField, removeField, lint, showWarnings, setShowWarnings,
}: {
  tpl: LabelTemplate;
  field: LabelField | null;
  setMetadata: (patch: Partial<LabelTemplate>) => void;
  updateField: (id: string, patch: Partial<LabelField>) => void;
  removeField: (id: string) => void;
  lint: LintWarning[];
  showWarnings: boolean;
  setShowWarnings: (v: boolean) => void;
}) {
  return (
    <div className="border-l border-border p-4 overflow-auto bg-card flex flex-col gap-4">
      {field
        ? <FieldInspector field={field} updateField={updateField} removeField={removeField} />
        : <TemplateInspector tpl={tpl} setMetadata={setMetadata} />
      }
      <WarningsPanel lint={lint} show={showWarnings} setShow={setShowWarnings} />
    </div>
  );
}

function TemplateInspector({
  tpl, setMetadata,
}: {
  tpl: LabelTemplate;
  setMetadata: (patch: Partial<LabelTemplate>) => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <Section title="Template">
        <Row label="W × H (mm)">
          <NumInput value={tpl.width} onChange={(v) => setMetadata({ width: v })} />
          <NumInput value={tpl.height} onChange={(v) => setMetadata({ height: v })} />
        </Row>
        <Row label="Pieces / label">
          <NumInput value={tpl.piecesPerLabel ?? 1} onChange={(v) => setMetadata({ piecesPerLabel: v || 1 })} />
        </Row>
        <p className="text-[11px] text-muted-foreground italic mt-1">Click a field to edit its position, type and binding. Nutrition formatting follows your target market in Settings.</p>
      </Section>
    </div>
  );
}

function FieldInspector({
  field, updateField, removeField,
}: {
  field: LabelField;
  updateField: (id: string, patch: Partial<LabelField>) => void;
  removeField: (id: string) => void;
}) {
  const def = FIELD_DEFINITIONS[field.type];
  const props: LabelFieldProps = field.props ?? {};
  const setProp = <K extends keyof LabelFieldProps>(key: K, value: LabelFieldProps[K]) => {
    updateField(field.id, { props: { [key]: value } as Partial<LabelFieldProps> });
  };
  // A field has a size control if its type has a configured default (logo,
  // qr, divider, image are sizeless image / visual fields).
  const hasSizeControl = def.defaultSizePt !== undefined;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Selected · {def.label}</div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {def.group === "product" ? "Auto-bound to the previewed product/batch."
            : def.group === "brand" ? "Auto-bound to your Brand profile (Settings)."
            : "Manual content — edit below."}
        </div>
      </div>

      <Section title="Position (mm)">
        <Row label="X / Y">
          <NumInput value={Math.round(field.x * 10) / 10} onChange={(v) => updateField(field.id, { x: v })} />
          <NumInput value={Math.round(field.y * 10) / 10} onChange={(v) => updateField(field.id, { y: v })} />
        </Row>
        <Row label="W / H">
          <NumInput value={Math.round(field.w * 10) / 10} onChange={(v) => updateField(field.id, { w: v })} />
          <NumInput value={Math.round(field.h * 10) / 10} onChange={(v) => updateField(field.id, { h: v })} />
        </Row>
      </Section>

      <Section title="Format">
        {hasSizeControl && (
          <Row label="Size (pt)">
            <SizeStepper
              value={effectiveFieldSizePt(field.type, props.size)}
              defaultValue={def.defaultSizePt!}
              isOverridden={props.size !== undefined}
              onChange={(v) => setProp("size", v)}
              onReset={() => setProp("size", undefined)}
            />
          </Row>
        )}
        {field.type === "ingr" && (
          <Toggle label="Bold allergen tokens" value={props.boldAllergens !== false} onChange={(v) => setProp("boldAllergens", v)} />
        )}
        {(field.type === "text" || field.type === "subtitle") && (
          <>
            <textarea
              value={props.text ?? ""}
              onChange={(e) => setProp("text", e.target.value)}
              rows={3}
              placeholder="Free text…"
              className="w-full text-xs border border-border rounded px-2 py-1.5 bg-card resize-y"
            />
            {field.type === "text" && (
              <Toggle label="Italic" value={!!props.italic} onChange={(v) => setProp("italic", v)} />
            )}
          </>
        )}
        {(field.type === "bbe" || field.type === "prodate") && (
          <DateFormatControl
            value={props.dateFormat}
            onChange={(v) => setProp("dateFormat", v)}
          />
        )}
        {field.type === "qr" && (
          <Row label="QR URL">
            <input
              type="text"
              value={props.qrUrl ?? ""}
              onChange={(e) => setProp("qrUrl", e.target.value || undefined)}
              placeholder="(falls back to first brand link)"
              className="flex-1 text-xs border border-border rounded px-2 py-1 bg-card"
            />
          </Row>
        )}
      </Section>

      <button
        onClick={() => removeField(field.id)}
        className="flex items-center gap-1.5 self-start mt-auto rounded-full border border-status-warn-edge text-status-warn px-3 py-1 text-xs hover:bg-status-warn-bg"
      >
        <Trash2 className="w-3 h-3" />
        Delete field
      </button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">{title}</div>
      {children}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <div className="text-[11px] text-muted-foreground w-20 shrink-0">{label}</div>
      <div className="flex gap-1.5 flex-1">{children}</div>
    </div>
  );
}

function NumInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <input
      type="number"
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      className="w-16 text-xs font-mono border border-border rounded px-1.5 py-1 bg-card"
    />
  );
}

/**
 * Tactile stepper for font size. Always shows the *effective* size (the
 * field's override when set, or the type's default otherwise) so the displayed
 * number matches what's actually rendered. Click − / + to nudge in 0.5pt
 * steps; the value can also be typed directly. When the size has been
 * overridden, a "Reset" link appears that clears the override and goes back to
 * the type default.
 */
function SizeStepper({
  value, defaultValue, isOverridden, onChange, onReset,
}: {
  value: number;
  defaultValue: number;
  isOverridden: boolean;
  onChange: (v: number) => void;
  onReset: () => void;
}) {
  const STEP = 0.5;
  const MIN = 1;
  const MAX = 72;
  const clampSize = (v: number) => Math.max(MIN, Math.min(MAX, Math.round(v * 2) / 2));

  return (
    <div className="flex items-center gap-1.5">
      <div className="inline-flex items-center border border-border rounded overflow-hidden bg-card">
        <button
          type="button"
          onClick={() => onChange(clampSize(value - STEP))}
          aria-label="Decrease size"
          className="px-2 py-1 text-sm hover:bg-muted/40 disabled:opacity-40"
          disabled={value <= MIN}
        >
          −
        </button>
        <input
          type="number"
          step={STEP}
          min={MIN}
          max={MAX}
          value={value}
          onChange={(e) => {
            const n = parseFloat(e.target.value);
            if (!Number.isFinite(n) || n <= 0) return;
            onChange(clampSize(n));
          }}
          className="w-12 text-xs font-mono text-center px-1 py-1 bg-card border-x border-border focus:outline-none"
        />
        <button
          type="button"
          onClick={() => onChange(clampSize(value + STEP))}
          aria-label="Increase size"
          className="px-2 py-1 text-sm hover:bg-muted/40 disabled:opacity-40"
          disabled={value >= MAX}
        >
          +
        </button>
      </div>
      {isOverridden ? (
        <button
          type="button"
          onClick={onReset}
          className="text-[10px] text-muted-foreground hover:text-foreground underline"
          title={`Reset to default (${defaultValue}pt)`}
        >
          ↺ {defaultValue}pt
        </button>
      ) : (
        <span className="text-[10px] text-muted-foreground/70" title="Default for this field type">
          default
        </span>
      )}
    </div>
  );
}

/**
 * Pattern-based date-format editor for `bbe` and `prodate` fields. The user
 * types a pattern (`DD MM YY`, `YYYY/MM/DD`, whatever they want); tokens are
 * substituted at render time. A live preview shows the result for today's
 * date, and one-click chips fill in common patterns.
 */
const DATE_PREVIEW = new Date();
function DateFormatControl({
  value, onChange,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
}) {
  const effective = value ?? DEFAULT_DATE_FORMAT;
  const preview = formatLabelDate(DATE_PREVIEW, effective);
  return (
    <div className="flex flex-col gap-1.5">
      <Row label="Date format">
        <input
          type="text"
          value={effective}
          onChange={(e) => {
            const next = e.target.value;
            onChange(next === DEFAULT_DATE_FORMAT ? undefined : next);
          }}
          spellCheck={false}
          className="flex-1 text-xs font-mono border border-border rounded px-2 py-1 bg-card tracking-wider"
        />
      </Row>
      <div className="flex items-center justify-between gap-2 pl-[5.5rem]">
        <span className="text-[10px] font-mono text-muted-foreground tabular-nums">→ {preview}</span>
      </div>
      <div className="flex flex-wrap gap-1 pl-[5.5rem]">
        {DATE_FORMAT_PRESETS.map((p) => {
          const active = effective === p.pattern;
          return (
            <button
              key={p.pattern}
              type="button"
              onClick={() => onChange(p.pattern === DEFAULT_DATE_FORMAT ? undefined : p.pattern)}
              className={`text-[10px] font-mono px-1.5 py-0.5 rounded border transition-colors ${
                active
                  ? "border-primary/40 bg-accent text-accent-foreground"
                  : "border-border text-muted-foreground hover:bg-muted/40"
              }`}
              title={p.pattern}
            >
              {p.hint}
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground/80 pl-[5.5rem] leading-snug">
        Tokens: <code>YYYY</code>, <code>YY</code>, <code>MM</code>, <code>M</code>, <code>DD</code>, <code>D</code>. Everything else prints as-is.
      </p>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-xs">
      <span
        onClick={() => onChange(!value)}
        className="relative inline-block"
        style={{
          width: 28, height: 16, background: value ? "#111" : "#fff",
          border: "1.25px solid #111", borderRadius: 9999, flexShrink: 0,
        }}
      >
        <span
          style={{
            position: "absolute", top: 1, left: value ? 13 : 1,
            width: 12, height: 12, borderRadius: 9999,
            background: value ? "#fff" : "#111",
          }}
        />
      </span>
      {label}
    </label>
  );
}

function WarningsPanel({
  lint, show, setShow,
}: {
  lint: LintWarning[];
  show: boolean;
  setShow: (v: boolean) => void;
}) {
  const summary = summariseLint(lint);
  const total = lint.length;
  return (
    <div className={`mt-2 border rounded-lg p-3 text-xs ${total > 0 ? "border-status-warn-edge bg-status-warn-bg" : "border-status-ok-edge bg-status-ok-bg"}`}>
      <button onClick={() => setShow(!show)} className="flex items-center gap-2 w-full text-left">
        {total > 0 ? <AlertTriangle className="w-3.5 h-3.5 text-status-warn" /> : <CheckCircle2 className="w-3.5 h-3.5 text-status-ok" />}
        <span className={`font-mono uppercase tracking-wider text-[10px] ${total > 0 ? "text-status-warn" : "text-status-ok"}`}>
          {total === 0
            ? "Linter — all good"
            : `Linter — ${summary.brand} brand · ${summary.layout} layout`}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 ml-auto transition-transform ${show ? "rotate-180" : ""}`} />
      </button>
      {show && total > 0 && (
        <ul className="mt-2 space-y-1 text-[11px] leading-snug text-foreground/80 pl-1">
          {lint.map((w, i) => <li key={i}>· {w.message}</li>)}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Persisted preview source
// ---------------------------------------------------------------------------

function readPersistedSource(templateId: string | undefined): LabelSource | null {
  if (typeof window === "undefined" || !templateId) return null;
  try {
    const raw = window.localStorage.getItem(`${SOURCE_STORAGE_KEY}.${templateId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LabelSource;
    if (typeof parsed?.kind !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}
function writePersistedSource(templateId: string | undefined, source: LabelSource | null) {
  if (typeof window === "undefined" || !templateId) return;
  try {
    const key = `${SOURCE_STORAGE_KEY}.${templateId}`;
    if (source) window.localStorage.setItem(key, JSON.stringify(source));
    else window.localStorage.removeItem(key);
  } catch {
    // ignore — preview source is a convenience, not a guarantee
  }
}
