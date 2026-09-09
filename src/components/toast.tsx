"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { X } from "lucide-react";
import { subscribeWriteErrors, guardedWrite } from "@/lib/writeErrors";

/**
 * Toasts — the only feedback autosaving pages have.
 *
 * Deliberately narrow: a successful write is *never* toasted, because the value
 * sitting in the field is already the confirmation. Toasts exist for the cases
 * the field alone can't express — a write that failed, an action worth undoing,
 * and a sync that hasn't happened yet.
 *
 *   destructive — a write failed. Stays until dismissed or retried.
 *   neutral     — a completed action, optionally undoable. Auto-dismisses.
 *   warn        — offline / pending sync. Auto-dismisses, never actionable.
 */

export type ToastVariant = "destructive" | "neutral" | "warn";

export interface ToastAction {
  label: string;
  onClick: () => void | Promise<void>;
}

export interface Toast {
  id: string;
  message: string;
  variant: ToastVariant;
  action?: ToastAction;
}

interface ToastContextValue {
  /** Push a toast. Returns its id so a caller can dismiss it early. */
  show: (toast: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Failed writes persist until the user deals with them; everything else clears
 *  itself so the corner doesn't accumulate stale chrome. */
const AUTO_DISMISS_MS: Record<ToastVariant, number | null> = {
  destructive: null,
  neutral: 6000,
  warn: 6000,
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timersRef = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const seqRef = useRef(0);

  const dismiss = useCallback((id: string) => {
    const timer = timersRef.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timersRef.current.delete(id);
    }
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (toast: Omit<Toast, "id">) => {
      // A counter rather than a random id: stable across renders and trivially
      // unique, and tests can't race two toasts onto the same key.
      const id = `toast-${++seqRef.current}`;
      setToasts((prev) => [...prev, { ...toast, id }]);
      const ttl = AUTO_DISMISS_MS[toast.variant];
      if (ttl != null) {
        timersRef.current.set(id, setTimeout(() => dismiss(id), ttl));
      }
      return id;
    },
    [dismiss],
  );

  const value = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  // A failed autosave is the one thing the field itself cannot communicate: the
  // typed value stays on screen either way. Surface every one, with a retry
  // that replays the same single-field write.
  useEffect(() => subscribeWriteErrors((err) => {
    show({
      variant: "destructive",
      message: `${err.description} wasn't saved.`,
      action: {
        label: "Retry",
        // A failing retry reports through the same channel and raises a fresh
        // toast, so the user is never left thinking it worked.
        onClick: async () => { await guardedWrite(err.description, err.retry); },
      },
    });
  }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside a ToastProvider");
  return ctx;
}

const VARIANT_CLASS: Record<ToastVariant, string> = {
  destructive: "border-destructive/30 bg-destructive/5 text-destructive",
  neutral: "border-border bg-card text-foreground",
  warn: "border-status-warn-edge bg-status-warn-bg text-status-warn",
};

function ToastViewport({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  if (toasts.length === 0) return null;
  return (
    <div
      // Offset past the side nav so the stack sits in the content area, not on
      // top of the nav rail. Newest at the bottom, so the stack grows upward.
      className="fixed bottom-4 z-50 flex flex-col gap-2 pointer-events-none px-4"
      style={{ left: "var(--nav-w)" }}
      role="status"
      aria-live="polite"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto flex items-center gap-3 rounded-lg border shadow-sm px-3 py-2 text-sm max-w-md ${VARIANT_CLASS[toast.variant]}`}
        >
          <span className="flex-1 min-w-0">{toast.message}</span>
          {toast.action && (
            <button
              onClick={async () => {
                // Clear first: a retry that fails will push its own fresh toast,
                // and leaving this one up would read as the retry doing nothing.
                onDismiss(toast.id);
                await toast.action!.onClick();
              }}
              className="shrink-0 underline underline-offset-2 font-medium"
            >
              {toast.action.label}
            </button>
          )}
          <button
            onClick={() => onDismiss(toast.id)}
            aria-label="Dismiss"
            className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
    </div>
  );
}
