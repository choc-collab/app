"use client";

import { useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

/**
 * Warns the user before navigating away when there are unsaved changes.
 *
 * - Registers a `beforeunload` listener (browser close/refresh/tab leave).
 * - Intercepts all <a href> clicks via capture-phase event delegation, covering
 *   Next.js <Link> components and the side navigation.
 * - Returns `safeBack()` to use instead of `router.back()` on Back buttons.
 *
 * @param isDirty  true when the form has unsaved changes
 * @param onConfirmLeave  optional async callback fired when the user confirms
 *   they want to leave. Use to clean up incomplete records (e.g. delete a
 *   half-created product on `?new=1` pages). The navigation happens after
 *   this callback resolves.
 */
export function useNavigationGuard(isDirty: boolean, onConfirmLeave?: () => void | Promise<void>) {
  const router = useRouter();

  // Prevent browser close / page refresh when dirty
  useEffect(() => {
    if (!isDirty) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  // Intercept anchor-link clicks (Next.js <Link>, side nav) when dirty.
  // Runs in capture phase so it fires before Next.js's own click handler.
  useEffect(() => {
    if (!isDirty) return;
    function handleClick(e: MouseEvent) {
      const anchor = (e.target as Element).closest("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
      if (anchor.target === "_blank") return;
      if (!window.confirm("You have unsaved changes. Leave without saving?")) {
        e.preventDefault();
        e.stopPropagation();
      } else if (onConfirmLeave) {
        // User confirmed — fire cleanup but let the navigation proceed
        // (async cleanup is best-effort; navigation shouldn't block on it)
        Promise.resolve(onConfirmLeave()).catch(() => {});
      }
    }
    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, [isDirty, onConfirmLeave]);

  /** Use this instead of `router.back()` on Back buttons. */
  const safeBack = useCallback(async () => {
    if (isDirty && !window.confirm("You have unsaved changes. Leave without saving?")) {
      return;
    }
    if (isDirty && onConfirmLeave) {
      await onConfirmLeave();
    }
    router.back();
  }, [isDirty, onConfirmLeave, router]);

  return { safeBack };
}
