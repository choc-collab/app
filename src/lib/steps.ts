/**
 * Helpers for the step-list editor used on the filling detail page
 * ([components/step-list-editor.tsx]).
 *
 * Instructions live in the DB as a single `string` field (no schema change).
 * Steps are stored one-per-line, without leading numbering — the numbering
 * is rendered from the array index in the UI, so insertion, deletion and
 * reordering never require manual renumbering.
 *
 * `parseSteps` is forgiving: it accepts both the new format (one step per
 * line, no numbering) and the legacy format (lines with `1. `, `2. `, `-`,
 * `*` markers left over from free-text instructions), stripping the markers
 * so old data displays cleanly.
 */

/** Split a stored instructions string into an array of step texts.
 *  - Empty lines are dropped.
 *  - Each line has any leading ordered-list marker (`1.`, `12)`),
 *    bullet marker (`-`, `*`, `•`), or whitespace stripped so that the
 *    rendered numbering always matches the array index.
 *  - Returns an empty array for empty / whitespace-only input. */
export function parseSteps(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map(stripLeadingMarker)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

/** Serialize an array of step texts into the stored instructions format.
 *  - Trims each step.
 *  - Drops empty steps.
 *  - Joins with a single newline so the stored shape is stable across
 *    parse → edit → serialize round-trips. */
export function serializeSteps(steps: readonly string[]): string {
  return steps
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .join("\n");
}

/** Strip a leading ordered-list marker ("1.", "12)", "3 -"), bullet
 *  marker ("-", "*", "•"), or any combination of those plus whitespace.
 *  Preserves the rest of the line exactly. */
function stripLeadingMarker(line: string): string {
  return line.replace(/^\s*(?:\d+[.)]\s+|[-*•]\s+)/, "");
}

/** Insert a new empty step at the given index and return the new array.
 *  Pure — safe to use in React state updaters. */
export function insertStepAt(steps: readonly string[], index: number, value = ""): string[] {
  const next = steps.slice();
  next.splice(Math.max(0, Math.min(index, steps.length)), 0, value);
  return next;
}

/** Remove the step at the given index (no-op if out of range). */
export function removeStepAt(steps: readonly string[], index: number): string[] {
  if (index < 0 || index >= steps.length) return steps.slice();
  const next = steps.slice();
  next.splice(index, 1);
  return next;
}

/** Replace the step at the given index with a new value. */
export function updateStepAt(steps: readonly string[], index: number, value: string): string[] {
  if (index < 0 || index >= steps.length) return steps.slice();
  const next = steps.slice();
  next[index] = value;
  return next;
}

/** Move a step from `from` to `to`, shifting the rest.
 *  Returns the input unchanged if either index is out of range. */
export function moveStep(steps: readonly string[], from: number, to: number): string[] {
  if (
    from < 0 || from >= steps.length ||
    to   < 0 || to   >= steps.length ||
    from === to
  ) {
    return steps.slice();
  }
  const next = steps.slice();
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}
