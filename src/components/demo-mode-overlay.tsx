"use client";

import { useEffect, useState } from "react";

type Ripple = { id: number; x: number; y: number };

let nextId = 0;

export function DemoModeOverlay() {
  const [enabled, setEnabled] = useState(false);
  const [ripples, setRipples] = useState<Ripple[]>([]);

  useEffect(() => {
    setEnabled(localStorage.getItem("demo-mode") === "true");

    function onDemoModeChanged() {
      setEnabled(localStorage.getItem("demo-mode") === "true");
    }
    // Cross-tab sync
    function onStorage(e: StorageEvent) {
      if (e.key === "demo-mode") setEnabled(e.newValue === "true");
    }

    window.addEventListener("demo-mode-changed", onDemoModeChanged);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("demo-mode-changed", onDemoModeChanged);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (!enabled) return;

    function onTouch(e: TouchEvent) {
      const touches = Array.from(e.changedTouches);
      setRipples((prev) => [
        ...prev,
        ...touches.map((t) => ({ id: nextId++, x: t.clientX, y: t.clientY })),
      ]);
    }

    window.addEventListener("touchstart", onTouch, { passive: true });
    return () => window.removeEventListener("touchstart", onTouch);
  }, [enabled]);

  if (!enabled || ripples.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[9999]">
      {ripples.map((r) => (
        <span
          key={r.id}
          onAnimationEnd={() =>
            setRipples((prev) => prev.filter((x) => x.id !== r.id))
          }
          style={{ left: r.x, top: r.y }}
          className="absolute w-14 h-14 rounded-full border-2 border-primary bg-primary/15 animate-demo-ripple"
        />
      ))}
    </div>
  );
}
