"use client";

import { useEffect, useState } from "react";

type Shot = {
  src: string;
  caption: string;
};

const SHOTS: Shot[] = [
  {
    src: "/docs/screenshots/product-composition.png",
    caption: "Compose a product from shell, fillings, and mould.",
  },
  {
    src: "/docs/screenshots/filling-editor.png",
    caption: "Fillings are reusable recipes with derived allergens.",
  },
  {
    src: "/docs/screenshots/stock-products.png",
    caption: "Stock with sell-by pills and freezer state at a glance.",
  },
];

export function ScreenshotGallery() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const open = openIdx !== null ? SHOTS[openIdx] : null;

  useEffect(() => {
    if (openIdx === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenIdx(null);
      if (e.key === "ArrowRight") setOpenIdx((i) => (i === null ? i : (i + 1) % SHOTS.length));
      if (e.key === "ArrowLeft") setOpenIdx((i) => (i === null ? i : (i - 1 + SHOTS.length) % SHOTS.length));
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [openIdx]);

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {SHOTS.map((s, i) => (
          <figure
            key={s.src}
            className="bg-card border border-border rounded-lg overflow-hidden flex flex-col"
          >
            <button
              type="button"
              onClick={() => setOpenIdx(i)}
              aria-label={`Enlarge: ${s.caption}`}
              className="group block w-full cursor-zoom-in focus-visible:outline-2 focus-visible:outline-dashed focus-visible:outline-offset-[-2px]"
            >
              <img
                src={s.src}
                alt={s.caption}
                loading="lazy"
                className="block w-full h-auto transition-opacity group-hover:opacity-90"
              />
            </button>
            <figcaption className="text-xs text-muted-foreground px-4 py-3 border-t border-border leading-relaxed">
              {s.caption}
            </figcaption>
          </figure>
        ))}
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[100] bg-black/80 p-4 sm:p-8 overflow-auto cursor-zoom-out"
          onClick={() => setOpenIdx(null)}
          role="dialog"
          aria-modal="true"
          aria-label={open.caption}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpenIdx(null);
            }}
            aria-label="Close"
            className="fixed top-4 right-4 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 text-white text-xl border border-white/20 flex items-center justify-center"
          >
            ×
          </button>
          <div
            className="max-w-6xl mx-auto flex flex-col items-center gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <img
              src={open.src}
              alt={open.caption}
              className="block max-w-full h-auto rounded-lg shadow-2xl cursor-default"
            />
            <p className="text-sm text-white/80 text-center max-w-xl">
              {open.caption}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
