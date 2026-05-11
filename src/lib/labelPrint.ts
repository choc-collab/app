/**
 * Label print pipeline — template + contexts → PNG files → share sheet.
 *
 * Each `LabelContext` renders through `renderTemplateSvg` to a self-contained
 * SVG string, which is then rasterised to PNG via an offscreen `<img>` and
 * canvas at the requested DPI. The resulting files are shared via the Web
 * Share API on iOS/iPadOS Safari and Android Chrome, with an automatic fall-
 * back to per-file downloads on browsers without `navigator.share`.
 *
 * The pipeline is intentionally label-printer-agnostic: we produce PNGs the
 * user can save to Photos, AirDrop to a workstation, or open in whatever
 * label-printer app they prefer. Direct Bluetooth (B21 etc.) is out of scope
 * for now and can land later as a separate transport sharing this renderer.
 */

import type { Brand, LabelContext, LabelTemplate, MarketRegion } from "@/types";
import { renderTemplateSvg } from "@/lib/labelSvg";

/** One label to print — a context paired with the user's chosen template. */
export interface PrintLabelInput {
  template: LabelTemplate;
  /** One context per physical label. Order is preserved in the output files. */
  contexts: LabelContext[];
  brand: Brand;
  marketRegion: MarketRegion;
  /**
   * Target raster resolution in dots per inch. 203 covers Niimbot-class
   * thermal printers, 300 is the safe default for sharing/photo-export and
   * for desktop label printers that resample on their own.
   */
  dpi?: number;
  /** Filename prefix used on the generated PNG files. Defaults to "label". */
  filenamePrefix?: string;
}

export type PrintResult =
  | { success: true; method: "share" | "download"; count: number }
  | { success: false; error: string };

const DEFAULT_DPI = 300;
const MM_PER_INCH = 25.4;

/** Convert a millimetre measurement to pixels at the requested DPI. */
function mmToPx(mm: number, dpi: number): number {
  return Math.round((mm / MM_PER_INCH) * dpi);
}

/** Sanitise a free-text label into a filename-safe slug. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60) || "label";
}

/**
 * Render one SVG string into a PNG `Blob`. The SVG is loaded into an `Image`
 * via a blob URL — same-origin so Safari doesn't trip the canvas taint flag
 * on `toBlob`. The intermediate URL is revoked once decoding completes.
 */
async function rasterizeSvgToPng(
  svg: string,
  widthPx: number,
  heightPx: number,
): Promise<Blob> {
  const svgBlob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(svgBlob);
  try {
    const img = new Image();
    // Same-origin blob URLs don't taint the canvas, but set crossOrigin
    // defensively for the case where a future SVG references external assets.
    img.crossOrigin = "anonymous";
    img.decoding = "async";
    img.src = url;
    await img.decode();

    const canvas = document.createElement("canvas");
    canvas.width = widthPx;
    canvas.height = heightPx;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D context unavailable.");
    // Paint a white background — the SVG already includes one, but ensure
    // the canvas isn't transparent for printers/apps that interpret alpha.
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, widthPx, heightPx);
    ctx.drawImage(img, 0, 0, widthPx, heightPx);

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error("Canvas.toBlob returned null."))),
        "image/png",
      );
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Builds a stable, filesystem-friendly name for one rendered label. */
function buildFilename(prefix: string, ctx: LabelContext, index: number): string {
  const namePart = slugify(ctx.name);
  const idPart =
    ctx.batchNumber ||
    (ctx.source.kind === "filling-batch" ? ctx.source.stockId :
     ctx.source.kind === "collection-package" ? `${ctx.source.collectionId}_${ctx.source.packagingId}` :
     `${index + 1}`);
  return `${prefix}_${namePart}_${slugify(String(idPart))}.png`;
}

/**
 * Render every context against the template, rasterise to PNG, and hand the
 * resulting files to the user — share sheet when supported, downloads as the
 * fallback. The user dismissing a native share sheet counts as success
 * (matches platform conventions; `AbortError` is the iOS signal).
 */
export async function printLabels(input: PrintLabelInput): Promise<PrintResult> {
  const { template, contexts, brand, marketRegion } = input;
  const dpi = input.dpi ?? DEFAULT_DPI;
  const filenamePrefix = input.filenamePrefix ?? "label";

  if (contexts.length === 0) {
    return { success: false, error: "No labels to print." };
  }
  if (typeof window === "undefined") {
    return { success: false, error: "Label printing is only available in the browser." };
  }

  try {
    const widthPx = mmToPx(template.width, dpi);
    const heightPx = mmToPx(template.height, dpi);

    const files: File[] = [];
    for (let i = 0; i < contexts.length; i++) {
      const ctx = contexts[i];
      const svg = renderTemplateSvg(template, ctx, brand, { marketRegion, sizing: "mm" });
      const png = await rasterizeSvgToPng(svg, widthPx, heightPx);
      files.push(new File([png], buildFilename(filenamePrefix, ctx, i), { type: "image/png" }));
    }

    if (
      typeof navigator !== "undefined" &&
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files })
    ) {
      try {
        await navigator.share({ files, title: template.name });
        return { success: true, method: "share", count: files.length };
      } catch (err) {
        // User dismissing the share sheet is reported as AbortError on iOS.
        if (err instanceof Error && err.name === "AbortError") {
          return { success: true, method: "share", count: files.length };
        }
        throw err;
      }
    }

    // Download fallback — one anchor click per file.
    for (const file of files) {
      const fileUrl = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = fileUrl;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(fileUrl);
    }
    return { success: true, method: "download", count: files.length };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
