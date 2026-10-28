import { PNG } from 'pngjs';

/**
 * Pixel analysis for the r3f (scene) render check. There is no DOM to query
 * bounding boxes from — the page is a WebGL canvas — so this module reads
 * the canvas's own rendered pixels back and works out where things are from
 * colour alone.
 */

export interface DecodedImage {
  readonly width: number;
  readonly height: number;
  /** RGBA, row-major, 4 bytes per pixel — pngjs's own decoded format. */
  readonly data: Buffer;
}

export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
}

export interface Bounds {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

export function decodePng(buffer: Buffer): DecodedImage {
  const png = PNG.sync.read(buffer);
  return { width: png.width, height: png.height, data: png.data };
}

function pixelAt(image: DecodedImage, x: number, y: number): Rgb {
  const offset = (y * image.width + x) * 4;
  const r = image.data[offset];
  const g = image.data[offset + 1];
  const b = image.data[offset + 2];
  if (r === undefined || g === undefined || b === undefined) {
    throw new Error(
      `pixel (${String(x)}, ${String(y)}) is out of bounds for a ` +
        `${String(image.width)}x${String(image.height)} image`,
    );
  }
  return { r, g, b };
}

function colorDistance(a: Rgb, b: Rgb): number {
  return Math.sqrt((a.r - b.r) ** 2 + (a.g - b.g) ** 2 + (a.b - b.b) ** 2);
}

/**
 * 0–1 relative luminance (ITU-R BT.709 weights, no sRGB gamma correction —
 * the theme's colours are far enough apart that this coarser approximation
 * still separates them cleanly; see the module-level colour table this is
 * checked against in `scene.spec.ts`).
 */
function relativeLuminance({ r, g, b }: Rgb): number {
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

/** Spread between a pixel's channels: near 0 for greys, high for a saturated colour like the theme's accent blue. */
function saturation({ r, g, b }: Rgb): number {
  return Math.max(r, g, b) - Math.min(r, g, b);
}

/**
 * A pixel counts as "text-like" when it is bright enough to be `renderer-three`'s
 * foreground or muted body-text colour, but not saturated enough to be its
 * accent-coloured divider line or panel border. Luminance alone
 * misclassifies the accent (`#3178c6`, relative luminance ≈0.43 — bright
 * enough to pass a naive threshold) as text; the saturation check rules it
 * back out, since the accent is a strongly saturated blue while both text
 * colours (`#e6e9f0`, `#9aa4b8`) are close to grey.
 */
function isTextLike(color: Rgb, minLuminance = 0.25, maxSaturation = 80): boolean {
  return relativeLuminance(color) >= minLuminance && saturation(color) <= maxSaturation;
}

/**
 * Bounding box of every pixel differing from `background` by more than
 * `tolerance`. There is nothing else in the scene besides the panel and its
 * contents, so this box is the panel — found by measuring the rendered
 * image directly rather than back-computing screen pixels from the 3D→2D
 * projection (camera position, fov, panel world size, `pixelSize`), which
 * would silently go stale if any of those changed.
 */
export function findContentBounds(
  image: DecodedImage,
  background: Rgb,
  tolerance = 12,
): Bounds | null {
  let left = Infinity;
  let top = Infinity;
  let right = -Infinity;
  let bottom = -Infinity;

  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      if (colorDistance(pixelAt(image, x, y), background) > tolerance) {
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
  }

  return Number.isFinite(left) ? { left, top, right, bottom } : null;
}

export interface TextCentroid {
  readonly centroidY: number;
  readonly minY: number;
  readonly maxY: number;
  readonly pixelCount: number;
}

/** Centroid row and vertical extent of every text-like pixel within `bounds`. */
export function textCentroid(image: DecodedImage, bounds: Bounds): TextCentroid | null {
  let sumY = 0;
  let count = 0;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let y = bounds.top; y <= bounds.bottom; y++) {
    for (let x = bounds.left; x <= bounds.right; x++) {
      if (isTextLike(pixelAt(image, x, y))) {
        sumY += y;
        count += 1;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  return count > 0 ? { centroidY: sumY / count, minY, maxY, pixelCount: count } : null;
}

/**
 * Polls `screenshot` until the decoded image contains at least one pixel
 * that differs from `background` (i.e. WebGL has actually painted
 * something), or throws a descriptive error after `timeoutMs`. Needed
 * because the canvas exists in the DOM the instant React mounts it, well
 * before r3f's first real frame — a screenshot taken too early is just the
 * clear colour.
 */
export async function waitForCanvasRendered(
  screenshot: () => Promise<Buffer>,
  background: Rgb,
  timeoutMs = 15_000,
  pollIntervalMs = 300,
): Promise<DecodedImage> {
  const deadline = Date.now() + timeoutMs;
  let lastImage: DecodedImage | undefined;

  while (Date.now() < deadline) {
    const image = decodePng(await screenshot());
    lastImage = image;
    if (findContentBounds(image, background) !== null) {
      return image;
    }
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  const sizeNote = lastImage
    ? ` (last frame was ${String(lastImage.width)}x${String(lastImage.height)})`
    : '';
  throw new Error(
    `canvas never rendered non-background pixels after ${String(timeoutMs)}ms — WebGL may not be ` +
      `initialising under these launch flags${sizeNote}`,
  );
}
