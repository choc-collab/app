/**
 * A one-line channel for reporting failed autosaves.
 *
 * Autosaving pages have no Save button to go red, so a write that throws would
 * otherwise fail in total silence — the user sees their typed value sitting in
 * the field and assumes it's stored. The partial-update helpers in `hooks.ts`
 * report failures here; the toast provider subscribes and surfaces them.
 *
 * It exists as a plain module-level emitter rather than React context because
 * the helpers that need it are non-React functions called from event handlers.
 */

export interface WriteError {
  /** What the user was editing, e.g. "Notes" or "Purchase pricing". */
  description: string;
  /** Replays exactly the same write — never a whole-record save. */
  retry: () => Promise<void>;
  error: unknown;
}

type Listener = (err: WriteError) => void;

const listeners = new Set<Listener>();

export function subscribeWriteErrors(listener: Listener): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function reportWriteError(err: WriteError): void {
  // Always log: a toast can be dismissed, and with no listener mounted (tests,
  // a background write) this is the only trace left.
  console.error(`Failed to save ${err.description}:`, err.error);
  for (const listener of listeners) listener(err);
}

/**
 * Run a write, reporting rather than throwing if it fails.
 *
 * Callers are fire-and-forget event handlers — an unhandled rejection there
 * would be swallowed by the browser, so failures are routed to the toast
 * instead. Returns whether the write landed, for the rare caller that cares.
 */
export async function guardedWrite(description: string, write: () => Promise<void>): Promise<boolean> {
  try {
    await write();
    return true;
  } catch (error) {
    reportWriteError({ description, error, retry: write });
    return false;
  }
}
