"use client";

/**
 * A structured step-list editor + read-only renderer.
 *
 * Used on the filling detail page to replace the free-text instructions
 * textarea. Step numbers are rendered from the array index (never stored),
 * so inserting, deleting and reordering steps never requires manual
 * renumbering — the motivating UX gripe.
 *
 * The parent component still owns a plain `string` value and receives a
 * plain `string` on change — the DB schema is unchanged. Parsing and
 * serialization live in [lib/steps.ts] and are unit-tested there.
 *
 * Keyboard ergonomics (match Notion / Apple Notes / Linear):
 *   - Enter         → commit current step, create a new empty step below,
 *                     focus it (this is the primary "add" flow)
 *   - Shift+Enter   → insert a real newline inside a step (for multi-line
 *                     steps, rare but supported)
 *   - Backspace at  → delete the current step and focus the end of the
 *     start of an    previous one (mirror of Enter)
 *     empty step
 *   - ⌘/Ctrl+Enter  → same as Enter (alternate muscle memory)
 *
 * Reordering uses @dnd-kit/sortable (same pattern as the filling-ingredient
 * row) so the UX is consistent with the rest of the app.
 */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type CSSProperties,
} from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Plus, X } from "lucide-react";
import {
  parseSteps,
  serializeSteps,
  insertStepAt,
  removeStepAt,
  updateStepAt,
} from "@/lib/steps";

// ─────────────────────────────────────────────────────────────────────────
//  Editor
// ─────────────────────────────────────────────────────────────────────────

interface StepListEditorProps {
  /** Newline-separated instructions string (as stored in the DB). */
  value: string;
  /** Called with the serialized value whenever the list changes. */
  onChange: (value: string) => void;
  /** Placeholder shown in empty step inputs. */
  placeholder?: string;
}

/** Internal row shape — the stable `id` is what @dnd-kit keys off.
 *  It's regenerated only when a step is inserted/deleted, so editing
 *  text never disturbs focus. */
interface Row {
  id: string;
  text: string;
}

let rowIdCounter = 0;
const nextRowId = () => `step-${++rowIdCounter}`;

function toRows(value: string): Row[] {
  return parseSteps(value).map((text) => ({ id: nextRowId(), text }));
}

export function StepListEditor({
  value,
  onChange,
  placeholder = "Describe this step…",
}: StepListEditorProps) {
  // Rows are derived from `value` on mount and whenever the parent resets
  // the value to something we didn't just emit (e.g. on Cancel). We compare
  // against the last value we emitted so we don't clobber in-flight edits.
  const [rows, setRows] = useState<Row[]>(() => toRows(value));
  const lastEmitted = useRef<string>(serializeSteps(rows.map((r) => r.text)));

  useEffect(() => {
    if (value !== lastEmitted.current) {
      const next = toRows(value);
      setRows(next);
      lastEmitted.current = serializeSteps(next.map((r) => r.text));
    }
  }, [value]);

  /** Commit a new row array: update state, serialize, call onChange. */
  const commit = (next: Row[]) => {
    setRows(next);
    const serialized = serializeSteps(next.map((r) => r.text));
    lastEmitted.current = serialized;
    onChange(serialized);
  };

  // Refs for programmatic focus after insert/delete.
  const inputRefs = useRef(new Map<string, HTMLTextAreaElement>());
  const pendingFocus = useRef<{ id: string; caret: "start" | "end" } | null>(null);

  useEffect(() => {
    if (!pendingFocus.current) return;
    const { id, caret } = pendingFocus.current;
    const el = inputRefs.current.get(id);
    if (el) {
      el.focus();
      const pos = caret === "start" ? 0 : el.value.length;
      el.setSelectionRange(pos, pos);
    }
    pendingFocus.current = null;
  }, [rows]);

  // ── Mutations ────────────────────────────────────────────────────────
  const handleTextChange = (index: number, text: string) => {
    const texts = rows.map((r) => r.text);
    const nextTexts = updateStepAt(texts, index, text);
    const next = rows.map((r, i) => (i === index ? { ...r, text: nextTexts[i] } : r));
    commit(next);
  };

  const handleAddBelow = (index: number) => {
    const newRow: Row = { id: nextRowId(), text: "" };
    const next = [
      ...rows.slice(0, index + 1),
      newRow,
      ...rows.slice(index + 1),
    ];
    pendingFocus.current = { id: newRow.id, caret: "start" };
    commit(next);
  };

  const handleAddAtEnd = () => {
    const newRow: Row = { id: nextRowId(), text: "" };
    const next = [...rows, newRow];
    pendingFocus.current = { id: newRow.id, caret: "start" };
    commit(next);
  };

  const handleRemove = (index: number) => {
    if (rows.length === 0) return;
    const nextTexts = removeStepAt(
      rows.map((r) => r.text),
      index,
    );
    const next = rows.filter((_, i) => i !== index);
    // Focus previous row's end, or next row if removing the first
    const focusTarget = next[index - 1] ?? next[index] ?? null;
    if (focusTarget) {
      pendingFocus.current = { id: focusTarget.id, caret: "end" };
    }
    // Use nextTexts via commit to keep serialization consistent (even
    // though next.map(r=>r.text) is equivalent here, this path lets the
    // pure helper stay the source of truth for behaviour)
    void nextTexts;
    commit(next);
  };

  // ── Keyboard ─────────────────────────────────────────────────────────
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>, index: number) => {
    // Enter (without Shift) → split/add new step
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleAddBelow(index);
      return;
    }
    // Ctrl/Cmd+Enter → same as Enter (alt muscle memory)
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleAddBelow(index);
      return;
    }
    // Backspace on an empty step → delete it and focus previous
    if (e.key === "Backspace" && rows[index]?.text === "" && rows.length > 1) {
      e.preventDefault();
      handleRemove(index);
      return;
    }
  };

  // ── Drag & drop ──────────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor,   { activationConstraint: { delay: 150, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const handleDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((r) => r.id === active.id);
    const to   = rows.findIndex((r) => r.id === over.id);
    if (from === -1 || to === -1) return;
    commit(arrayMove(rows, from, to));
  };

  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);

  // ── Render ───────────────────────────────────────────────────────────
  return (
    <div>
      {rows.length > 0 ? (
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext items={rowIds} strategy={verticalListSortingStrategy}>
            <ol className="space-y-1.5">
              {rows.map((row, index) => (
                <StepRow
                  key={row.id}
                  row={row}
                  index={index}
                  placeholder={placeholder}
                  onTextChange={(text) => handleTextChange(index, text)}
                  onKeyDown={(e) => handleKeyDown(e, index)}
                  onRemove={() => handleRemove(index)}
                  registerRef={(el) => {
                    if (el) inputRefs.current.set(row.id, el);
                    else inputRefs.current.delete(row.id);
                  }}
                />
              ))}
            </ol>
          </SortableContext>
        </DndContext>
      ) : (
        <p className="text-xs text-muted-foreground italic mb-2">
          No steps yet. Click &ldquo;Add step&rdquo; to get started.
        </p>
      )}

      <button
        type="button"
        onClick={handleAddAtEnd}
        className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/80 transition-colors"
      >
        <Plus className="w-3.5 h-3.5" />
        Add step
      </button>
      <p className="text-xs text-muted-foreground mt-1.5">
        Press <kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono text-[10px]">Enter</kbd> to add another step,{" "}
        <kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono text-[10px]">Shift+Enter</kbd> for a line break inside a step.
      </p>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Individual row (sortable)
// ─────────────────────────────────────────────────────────────────────────

interface StepRowProps {
  row: Row;
  index: number;
  placeholder: string;
  onTextChange: (text: string) => void;
  onKeyDown: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  onRemove: () => void;
  registerRef: (el: HTMLTextAreaElement | null) => void;
}

function StepRow({
  row,
  index,
  placeholder,
  onTextChange,
  onKeyDown,
  onRemove,
  registerRef,
}: StepRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: row.id });

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.6 : 1,
  };

  // Auto-resize the textarea to fit its content — classic
  // scrollHeight trick, ref callback merges with registerRef.
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  const mergeRef = (el: HTMLTextAreaElement | null) => {
    localRef.current = el;
    registerRef(el);
  };

  useEffect(() => {
    const el = localRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [row.text]);

  return (
    <li
      ref={setNodeRef}
      style={style}
      suppressHydrationWarning
      className={`group flex items-start gap-2 rounded-md border border-transparent px-1 py-1 transition-colors ${
        isDragging ? "bg-muted/50 border-border" : "hover:bg-muted/30"
      }`}
    >
      <button
        type="button"
        aria-label={`Drag to reorder step ${index + 1}`}
        className="mt-1.5 -ml-0.5 flex-shrink-0 cursor-grab touch-none text-muted-foreground/40 hover:text-muted-foreground opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="w-4 h-4" />
      </button>

      <span
        aria-hidden="true"
        className="mt-1.5 flex-shrink-0 w-6 text-right text-sm font-medium tabular-nums text-muted-foreground select-none"
      >
        {index + 1}.
      </span>

      <textarea
        ref={mergeRef}
        value={row.text}
        onChange={(e) => onTextChange(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        rows={1}
        className="input flex-1 min-w-0 resize-none py-1.5 leading-snug"
        aria-label={`Step ${index + 1}`}
      />

      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove step ${index + 1}`}
        className="mt-1.5 flex-shrink-0 text-muted-foreground/40 hover:text-red-600 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
      >
        <X className="w-4 h-4" />
      </button>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────
//  Read-only renderer
// ─────────────────────────────────────────────────────────────────────────

interface StepListProps {
  text: string;
  className?: string;
}

/** Read-only rendering of the stored instructions as a clean numbered list.
 *  Used on the filling detail page outside edit mode, and anywhere else
 *  that wants to display the same field. */
export function StepList({ text, className = "" }: StepListProps) {
  const steps = parseSteps(text);
  if (steps.length === 0) return null;
  return (
    <ol className={`list-decimal pl-5 space-y-1 text-sm ${className}`}>
      {steps.map((step, i) => (
        <li key={i} className="leading-snug">
          {step}
        </li>
      ))}
    </ol>
  );
}
