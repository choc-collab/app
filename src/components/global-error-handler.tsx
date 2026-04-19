"use client";

import { useEffect } from "react";

export function GlobalErrorHandler() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      console.error("Unhandled error:", event.error ?? event.message);
    }
    function onUnhandledRejection(event: PromiseRejectionEvent) {
      console.error("Unhandled promise rejection:", event.reason);
    }
    // Select-all on focus for number inputs so typing replaces the existing value
    // rather than appending to it (e.g. avoids "02" when editing a "0" field).
    function onFocusIn(event: FocusEvent) {
      if (event.target instanceof HTMLInputElement && event.target.type === "number") {
        event.target.select();
      }
    }
    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    document.addEventListener("focusin", onFocusIn);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
      document.removeEventListener("focusin", onFocusIn);
    };
  }, []);

  return null;
}
