/**
 * Shared helper for downscaling user-uploaded images before they get stored
 * as base64 data URLs in Dexie / synced via Dexie Cloud.
 *
 * A 12-megapixel phone photo or a high-res PNG logo easily reaches several
 * MB of base64 — overkill for the print sizes we target and a real problem
 * for Dexie Cloud's per-row size limit. We cap on the longest edge first
 * and re-encode through an offscreen canvas.
 */

export const IMAGE_MAX_DIMENSION = 1500;
export const IMAGE_DOWNSCALE_QUALITY = 0.92;

/**
 * Pure helper — works out the target dimensions for a given source size and
 * cap, preserving aspect ratio. Returns `null` when no resize is needed
 * (i.e. the longest edge is already at or below the cap).
 *
 * Extracted so the math is unit-testable in the node-only vitest env; the
 * canvas-based orchestrator below is exercised end-to-end via Playwright.
 */
export function computeDownscaleTarget(
  naturalWidth: number,
  naturalHeight: number,
  maxDimension: number = IMAGE_MAX_DIMENSION,
): { width: number; height: number } | null {
  if (
    !Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight) ||
    naturalWidth <= 0 || naturalHeight <= 0 || maxDimension <= 0
  ) {
    return null;
  }
  const longest = Math.max(naturalWidth, naturalHeight);
  if (longest <= maxDimension) return null;
  const scale = maxDimension / longest;
  return {
    width: Math.round(naturalWidth * scale),
    height: Math.round(naturalHeight * scale),
  };
}

/**
 * Read a user-picked File as a base64 data URL, downscaling first if its
 * longest edge exceeds `maxDimension`. PNGs stay PNG (preserve alpha for
 * logos with transparent backgrounds); everything else re-encodes as JPEG
 * to keep the resulting data URL small.
 */
export async function downscaleImageIfNeeded(
  file: File,
  maxDimension: number = IMAGE_MAX_DIMENSION,
): Promise<string> {
  const originalDataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") resolve(reader.result);
      else reject(new Error("FileReader returned non-string result"));
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed"));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image decode failed"));
    image.src = originalDataUrl;
  });

  const target = computeDownscaleTarget(img.naturalWidth, img.naturalHeight, maxDimension);
  if (!target) return originalDataUrl;

  const canvas = document.createElement("canvas");
  canvas.width = target.width;
  canvas.height = target.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return originalDataUrl;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, target.width, target.height);

  const outputType = file.type === "image/png" ? "image/png" : "image/jpeg";
  return canvas.toDataURL(
    outputType,
    outputType === "image/jpeg" ? IMAGE_DOWNSCALE_QUALITY : undefined,
  );
}
