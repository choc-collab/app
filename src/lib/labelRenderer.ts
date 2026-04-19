/**
 * Canvas-based label renderer for Niimbot B21 (203 DPI).
 *
 * Physical label: 50×40mm.
 * B21 printhead: 384 px wide (≈48mm at 203 DPI).
 * Feed direction: 40mm → 320px.
 *
 * We design on a landscape canvas (384 wide × 320 tall) that matches the
 * printed label orientation, then rotate it 90° clockwise so the printer
 * (which uses printDirection "left") outputs it correctly.
 */

export type LabelData = {
  productName: string;
  batchNumber: string;
  bestBeforeDate: Date | null; // null if product has no shelfLifeWeeks
  allergens: string[];         // e.g. ["gluten", "nuts"]
  vegan: boolean;
};

/** Design dimensions (landscape, as the sticker will read) */
const W = 384;
const H = 320;
const PAD = 22;

/** Returns the human-readable landscape canvas (for PNG export / sharing). */
export function renderDesignCanvas(data: LabelData): HTMLCanvasElement {
  return createDesignCanvas(data);
}

/** Returns the rotated canvas for direct Bluetooth printing (B21 feed direction). */
export function renderPrintCanvas(data: LabelData): HTMLCanvasElement {
  const design = createDesignCanvas(data);
  return rotateCW(design);
}

function createDesignCanvas(data: LabelData): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000000";

  const usableW = W - PAD * 2;
  let y = PAD + 10;

  // — Product name (centered, large bold) —
  const NAME_SIZE = 28;
  const NAME_LINE_H = 34;
  ctx.font = `bold ${NAME_SIZE}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";

  const nameLines = wrapTextLines(ctx, data.productName.toUpperCase(), usableW);
  for (const line of nameLines) {
    ctx.fillText(line, W / 2, y);
    y += NAME_LINE_H;
  }

  // Leaf icon to the right of the last name line (if vegan)
  if (data.vegan) {
    const lastLine = nameLines[nameLines.length - 1];
    const textW = ctx.measureText(lastLine).width;
    const leafCX = W / 2 + textW / 2 + 18;
    const leafCY = y - NAME_LINE_H / 2 - 2;
    drawLeaf(ctx, leafCX, leafCY, 11, 18);
  }

  y += 18; // gap after name

  // — Batch number —
  const INFO_SIZE = 18;
  ctx.font = `${INFO_SIZE}px sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";

  ctx.font = `${INFO_SIZE}px monospace`;
  ctx.fillText(`Batch  ${data.batchNumber}`, PAD, y);
  y += 24;

  // — Best before —
  if (data.bestBeforeDate) {
    ctx.font = `${INFO_SIZE}px sans-serif`;
    ctx.fillText(`Best before  ${formatDate(data.bestBeforeDate)}`, PAD, y);
    y += 24;
  }

  y += 14; // gap before allergens

  // — Allergens —
  ctx.font = `bold ${INFO_SIZE}px sans-serif`;
  const allergenText = data.allergens.length > 0
    ? `Contains: ${data.allergens.join(", ")}`
    : "No known allergens";
  const allergenLines = wrapTextLines(ctx, allergenText, usableW);
  for (const line of allergenLines) {
    ctx.fillText(line, PAD, y);
    y += 24;
  }

  return canvas;
}

/** Rotate a canvas 90° clockwise (used to produce the print canvas for the B21). */
function rotateCW(src: HTMLCanvasElement): HTMLCanvasElement {
  const dst = document.createElement("canvas");
  dst.width = src.height;  // 320
  dst.height = src.width;  // 384
  const ctx = dst.getContext("2d")!;
  ctx.translate(src.height, 0);
  ctx.rotate(Math.PI / 2);
  ctx.drawImage(src, 0, 0);
  return dst;
}

/** Draw a small filled leaf shape centred at (cx, cy). */
function drawLeaf(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,  // half-width
  ry: number,  // half-height
) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(-Math.PI / 6); // slight tilt
  ctx.fillStyle = "#000000";
  ctx.beginPath();
  ctx.moveTo(0, -ry);
  ctx.bezierCurveTo(rx, -ry * 0.4, rx, ry * 0.4, 0, ry);
  ctx.bezierCurveTo(-rx, ry * 0.4, -rx, -ry * 0.4, 0, -ry);
  ctx.fill();
  // White centre vein
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1.5, rx * 0.3);
  ctx.beginPath();
  ctx.moveTo(0, -ry + 2);
  ctx.lineTo(0, ry - 2);
  ctx.stroke();
  ctx.restore();
}

/** Wrap text into lines that fit within maxWidth. Returns at most 3 lines. */
function wrapTextLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width > maxWidth && current) {
      lines.push(current);
      current = word;
      if (lines.length === 2) { current = `${word}…`; break; }
    } else {
      current = candidate;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}
