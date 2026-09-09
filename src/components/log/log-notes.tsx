"use client";

import { useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { addLogEntry, deleteLogEntry, updateLogEntryFields, useLogEntriesForDay } from "@/lib/hooks";
import type { LogEntry } from "@/types";

/** "10:24" from a stored timestamp — zero-padded, no locale. */
function timeOf(d: Date | string): string {
  const t = new Date(d);
  return `${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
}

/**
 * The written half of a day's log: every note for the day (each an autosaving
 * textarea with a two-step delete) followed by an always-present box to add
 * another. Several notes per day are deliberate — a morning observation and an
 * evening remark keep their own timestamps.
 */
export function LogNotes({ date }: { date: string }) {
  const entries = useLogEntriesForDay(date);
  return (
    <div className="space-y-3" data-testid="log-notes">
      {entries.length === 0 && (
        <p className="text-sm text-muted-foreground">No notes for this day yet.</p>
      )}
      <ul className="space-y-2">
        {entries.map((e) => (
          <li key={e.id}>
            <NoteCard entry={e} />
          </li>
        ))}
      </ul>
      <AddNoteBox date={date} />
    </div>
  );
}

function NoteCard({ entry }: { entry: LogEntry }) {
  const [value, setValue] = useState(entry.body);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Hydrated once per record (the list keys cards by entry id, so a different
  // note remounts): a live-query re-emit — another device editing, or our own
  // write echoing back — must not clobber what's being typed.

  function commit(next: string) {
    const trimmed = next.trim();
    if (!entry.id || trimmed === entry.body) return;
    void updateLogEntryFields(entry.id, { body: trimmed }, "Note");
  }
  // Debounce so a long note isn't one write per keystroke, then flush on blur so
  // leaving the field can never lose the last few characters.
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
    <div className="rounded-lg border border-border bg-card" data-testid="log-note">
      <div className="flex items-center justify-between gap-2 px-3 pt-2">
        <span className="text-[11px] font-mono tabular-nums text-muted-foreground">{timeOf(entry.createdAt)}</span>
        {confirmDelete ? (
          <span className="flex items-center gap-2 text-xs">
            <span className="text-muted-foreground">Delete this note?</span>
            <button
              type="button"
              onClick={() => { if (entry.id) void deleteLogEntry(entry.id); }}
              className="font-medium text-status-alert hover:underline"
            >
              Delete
            </button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="text-muted-foreground hover:text-foreground">
              Cancel
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            aria-label="Delete note"
            title="Delete note"
            className="p-1 -m-1 rounded text-muted-foreground hover:text-status-alert transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <textarea
        value={value}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={handleBlur}
        rows={Math.min(8, Math.max(2, value.split("\n").length))}
        aria-label={`Note from ${timeOf(entry.createdAt)}`}
        className="w-full text-sm bg-transparent border-0 resize-none focus:outline-none px-3 pb-3 pt-1"
      />
    </div>
  );
}

/** Blank textarea + Add button. Cmd/Ctrl+Enter also submits. Used on the day
 *  page and, in `compact` form, on the Today dashboard tile. */
export function AddNoteBox({
  date,
  compact = false,
  placeholder = "What happened, what did you learn, what would you do differently…",
  onAdded,
}: {
  date: string;
  compact?: boolean;
  placeholder?: string;
  onAdded?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const canAdd = draft.trim().length > 0 && !saving;

  async function submit() {
    if (!canAdd) return;
    // Clear optimistically so the next note can be typed straight away — a
    // late `setDraft("")` after the await would wipe whatever was typed
    // meanwhile. Restore the text if the write fails.
    const body = draft;
    setDraft("");
    setSaving(true);
    try {
      await addLogEntry(date, body);
      onAdded?.();
    } catch {
      setDraft(body);
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={(e) => { e.preventDefault(); void submit(); }}
      className={`rounded-lg border border-dashed border-border bg-card/60 ${compact ? "p-2" : "p-3"}`}
    >
      <textarea
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void submit(); }
        }}
        placeholder={placeholder}
        rows={compact ? 2 : 3}
        aria-label="New note"
        className="w-full text-sm bg-transparent border-0 resize-none focus:outline-none placeholder:text-muted-foreground/60"
      />
      <div className="flex items-center justify-between gap-2 mt-1">
        <span className="text-[11px] text-muted-foreground hidden sm:inline">⌘/Ctrl + Enter to add</span>
        <button type="submit" disabled={!canAdd} className="btn-primary px-3 py-1 text-xs ml-auto">
          Add note
        </button>
      </div>
    </form>
  );
}
