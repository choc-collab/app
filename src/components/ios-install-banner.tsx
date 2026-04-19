"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { isCloudConfigured } from "@/lib/db";

const DISMISS_KEY = "ios-install-banner-dismissed";

export function IosInstallBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (isCloudConfigured) return;
    if (localStorage.getItem(DISMISS_KEY) === "true") return;

    const ua = window.navigator.userAgent;
    const isIos = /iPad|iPhone|iPod/.test(ua) || (ua.includes("Mac") && "ontouchend" in document);
    if (!isIos) return;

    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari uses a non-standard property
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    if (isStandalone) return;

    setShow(true);
  }, []);

  if (!show) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "true");
    setShow(false);
  }

  return (
    <div className="sticky top-0 z-50 bg-primary text-primary-foreground px-4 py-2.5 text-xs flex items-start gap-3">
      <div className="flex-1 leading-relaxed">
        <strong className="font-semibold">Tip:</strong> Tap the Share button and &ldquo;Add to Home
        Screen&rdquo; so Safari doesn&apos;t clear your data after a few weeks of inactivity.
      </div>
      <button
        onClick={dismiss}
        aria-label="Dismiss"
        className="shrink-0 p-1 -m-1 rounded hover:bg-primary-foreground/10 transition-colors"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
