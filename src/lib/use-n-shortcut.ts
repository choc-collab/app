import { useEffect } from "react";

/**
 * Registers a keyboard shortcut that fires `onActivate` when the user presses "n"
 * while no text input is focused. Standard in all pantry list pages to open the
 * quick-add form.
 *
 * @param onActivate  Called when "n" is pressed and the form is not already open.
 * @param disabled    Pass `true` to suppress the shortcut (e.g. while the form is open).
 *
 * @example
 * useNShortcut(() => setShowAdd(true), showAdd);
 */
export function useNShortcut(onActivate: () => void, disabled?: boolean): void {
  useEffect(() => {
    if (disabled) return;
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.key === "n" && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        onActivate();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onActivate, disabled]);
}
