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
import { labelTemplateFormat } from "@/types";
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
   * for desktop label printers that resample on their own. Ignored for PDF
   * output (PDF is vector — DPI is irrelevant).
   */
  dpi?: number;
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

/** Sanitise a free-text string into a filesystem-friendly filename component.
 *  Keeps case and spaces (every desktop / mobile OS handles those fine);
 *  only swaps characters that are illegal on Windows or that break common
 *  shells. Length-caps at 80 chars so 50-product batches don't produce
 *  filenames that exceed the 255-char path limit on some filesystems. */
function sanitizeForFilename(input: string): string {
  return input
    .replace(/[/\\:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80) || "label";
}

/** ISO YYYY-MM-DD in local time — sortable, locale-neutral, the natural
 *  archival format. Local time (not UTC) so a batch finished at 11pm
 *  doesn't land on the next day's filename. */
function toIsoDate(d: Date): string {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/** Pick the most informative identifier for one context: the batch number
 *  if set, else the production / packing date, else today. */
function pickIdentifier(ctx: LabelContext): string {
  if (ctx.batchNumber) return sanitizeForFilename(ctx.batchNumber);
  if (ctx.producedAt) return toIsoDate(ctx.producedAt);
  return toIsoDate(new Date());
}

/** Builds the filename for one rendered label (PNG path). Shape:
 *  `{ContextName}_{Identifier}.png`. The identifier picks batch-number first
 *  so multiple batches of the same product stay distinguishable, then falls
 *  back to date for archival sorting. */
function buildLabelFilename(ctx: LabelContext, extension: string): string {
  const name = sanitizeForFilename(ctx.name || "label");
  return `${name}_${pickIdentifier(ctx)}.${extension}`;
}

/** Builds the filename for a multi-context PDF. When every context shares
 *  one batch number (production / filling batch run), the PDF represents
 *  the *batch* as a whole — name it after the batch, not the first
 *  product. Single-context PDFs (shop, stock relabel) fall through to the
 *  per-label convention. */
function buildPdfFilename(contexts: LabelContext[]): string {
  if (contexts.length === 0) return "labels.pdf";
  const first = contexts[0];
  const sharedBatch = contexts.length > 1
    && first.batchNumber
    && contexts.every((c) => c.batchNumber === first.batchNumber)
    ? first.batchNumber
    : null;
  if (sharedBatch) {
    const dateStr = first.producedAt ? toIsoDate(first.producedAt) : toIsoDate(new Date());
    return `${sanitizeForFilename(sharedBatch)}_${dateStr}.pdf`;
  }
  return buildLabelFilename(first, "pdf");
}

/** Resolve in-print-run collisions ` (2)` / ` (3)` / … so two labels with
 *  the same product name don't overwrite each other in the share-sheet
 *  payload. The OS handles cross-run collisions on disk. */
function deduplicateFilename(name: string, used: Set<string>): string {
  if (!used.has(name)) { used.add(name); return name; }
  const dot = name.lastIndexOf(".");
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; n < 1000; n++) {
    const candidate = `${base} (${n})${ext}`;
    if (!used.has(candidate)) { used.add(candidate); return candidate; }
  }
  used.add(name);
  return name;
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

/**
 * Detect a touch-first mobile/tablet device where the OS share sheet is the
 * natural save flow (iOS Photos extension, AirDrop, etc.). Everything else —
 * macOS, Windows, Linux, ChromeOS desktops — routes through the download
 * path instead, because the macOS / Chromebook share sheets don't offer
 * useful "Save to Photos" / "Save as…" options for PNG files, and users
 * expect a downloaded file.
 *
 * iPadOS Safari reports a Mac user-agent in its desktop-mode default; we
 * disambiguate by checking `navigator.maxTouchPoints` (real Macs report 0).
 */
function isShareSheetPreferred(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPod|iPad/.test(ua)) return true;
  if (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1) return true; // iPadOS desktop UA
  return false;
}

/**
 * svg2pdf.js doesn't reliably honour `dominant-baseline="hanging"` — it
 * tends to place the `<text>` y coordinate at the alphabetic baseline rather
 * than the top of the glyph box, so any text drawn near y=0 has its
 * ascenders clipped above the PDF page edge. The browser canvas (PNG path)
 * renders the same SVG correctly because it honours `hanging` exactly.
 *
 * We pre-process the parsed SVG: strip the hanging attribute and shift y
 * down by ~0.8 × font-size (the approximate cap-height for Latin fonts) so
 * the PDF rendering matches the on-screen preview.
 */
const HANGING_BASELINE_SHIFT_RATIO = 0.8;

function normalizeBaselineForPdf(svgEl: SVGElement): void {
  const texts = svgEl.querySelectorAll('text[dominant-baseline="hanging"]');
  for (const node of Array.from(texts)) {
    const t = node as SVGTextElement;
    const fontSize = parseFloat(t.getAttribute("font-size") || "0");
    if (!Number.isFinite(fontSize) || fontSize <= 0) continue;
    const y = parseFloat(t.getAttribute("y") || "0");
    t.setAttribute("y", String(y + fontSize * HANGING_BASELINE_SHIFT_RATIO));
    t.removeAttribute("dominant-baseline");
  }
}

/**
 * Render every context into one PDF — one page per label. The vector path
 * (svg2pdf.js → jsPDF) preserves scalable text and shapes; raster `<image>`
 * fields embed as PNG by default. jsPDF maps SVG font-family to its 14 core
 * fonts (Helvetica / Times / Courier) — display fonts will substitute, which
 * is acceptable for v1 (font embedding would inflate the bundle by megabytes
 * per typeface).
 *
 * Returns one PDF Blob covering every context, packaged as a single File so
 * the share sheet / download handler treats the print run as one artifact.
 */
async function renderTemplatesToPdf(
  template: LabelTemplate,
  contexts: LabelContext[],
  brand: Brand,
  marketRegion: MarketRegion,
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const { svg2pdf } = await import("svg2pdf.js");

  // The first page sets the document dimensions; later pages are added with
  // matching dimensions so every label keeps its mm-accurate size.
  const pdf = new jsPDF({
    unit: "mm",
    format: [template.width, template.height],
    orientation: template.width >= template.height ? "landscape" : "portrait",
  });

  for (let i = 0; i < contexts.length; i++) {
    if (i > 0) pdf.addPage([template.width, template.height]);
    const svgString = renderTemplateSvg(template, contexts[i], brand, { marketRegion, sizing: "mm" });
    // svg2pdf needs a parsed SVG element, not a string.
    const parser = new DOMParser();
    const doc = parser.parseFromString(svgString, "image/svg+xml");
    const svgEl = doc.documentElement as unknown as SVGElement;
    normalizeBaselineForPdf(svgEl);
    await svg2pdf(svgEl, pdf, {
      x: 0,
      y: 0,
      width: template.width,
      height: template.height,
    });
  }

  return pdf.output("blob");
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
  const format = labelTemplateFormat(template);

  if (contexts.length === 0) {
    return { success: false, error: "No labels to print." };
  }
  if (typeof window === "undefined") {
    return { success: false, error: "Label printing is only available in the browser." };
  }

  try {
    const files: File[] = [];
    if (format === "pdf") {
      // One PDF for the whole print run — one page per label. The filename
      // reflects what's *inside* (the batch or the box), so a Downloads
      // folder with many runs stays scannable.
      const pdfBlob = await renderTemplatesToPdf(template, contexts, brand, marketRegion);
      files.push(new File([pdfBlob], buildPdfFilename(contexts), { type: "application/pdf" }));
    } else {
      const widthPx = mmToPx(template.width, dpi);
      const heightPx = mmToPx(template.height, dpi);
      // Track collisions within this print run — two products with the same
      // name on one batch (rare but possible) would otherwise overwrite each
      // other in the share-sheet payload.
      const usedNames = new Set<string>();
      for (const ctx of contexts) {
        const svg = renderTemplateSvg(template, ctx, brand, { marketRegion, sizing: "mm" });
        const png = await rasterizeSvgToPng(svg, widthPx, heightPx);
        const name = deduplicateFilename(buildLabelFilename(ctx, "png"), usedNames);
        files.push(new File([png], name, { type: "image/png" }));
      }
    }

    // Only invoke the OS share sheet on touch-first devices (iOS/iPadOS,
    // Android). On macOS / Windows / Linux desktops the share sheet exists
    // but doesn't offer useful save-to-disk actions for PNGs — users expect
    // to receive a downloaded file instead.
    if (
      isShareSheetPreferred() &&
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
