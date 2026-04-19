/**
 * Label printing via Web Share API (PNG images).
 * Generates one PNG per label and opens the iOS/iPadOS share sheet.
 * Falls back to browser download if the Share API is unavailable.
 */

import type { LabelData } from "./labelRenderer";

export type { LabelData };

export type PrintResult =
  | { success: true }
  | { success: false; error: string };

/** Always true — we support every browser via the download fallback. */
export function isPrinterSupported(): boolean {
  return typeof window !== "undefined";
}

/**
 * Generates PNG label images and shares them via the share sheet
 * (navigator.share with files — works on iOS/iPadOS Safari).
 * Falls back to triggering a file download on unsupported browsers.
 */
export async function printLabels(labels: LabelData[]): Promise<PrintResult> {
  if (labels.length === 0) {
    return { success: false, error: "No labels to print." };
  }

  const { renderDesignCanvas } = await import("./labelRenderer");

  try {
    const files: File[] = [];
    for (const label of labels) {
      const canvas = renderDesignCanvas(label);
      const blob = await canvasToBlob(canvas);
      const safeName = label.productName.replace(/[^a-z0-9]/gi, "_").toLowerCase();
      files.push(
        new File([blob], `label_${safeName}_${label.batchNumber}.png`, {
          type: "image/png",
        }),
      );
    }

    // Use the share sheet when available (iOS/iPadOS Safari, Chrome Android)
    if (
      typeof navigator.canShare === "function" &&
      navigator.canShare({ files })
    ) {
      await navigator.share({ files, title: "Batch labels" });
      return { success: true };
    }

    // Fallback: download each PNG
    for (const file of files) {
      const url = URL.createObjectURL(file);
      const a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    }
    return { success: true };
  } catch (err) {
    // User dismissed the share sheet — treat as success
    if (err instanceof Error && err.name === "AbortError") {
      return { success: true };
    }
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to generate PNG from canvas"));
    }, "image/png");
  });
}
