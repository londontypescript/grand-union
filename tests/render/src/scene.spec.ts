import { VERTICAL_ALIGN } from '@lts/vocabulary';
import { expect, test, type Page } from '@playwright/test';
import { SCENE_URL, SCREENSHOT_DIR } from './config.ts';
import { expectedRegion, MonotonicOrder } from './layout-regions.ts';
import {
  decodePng,
  findContentBounds,
  textCentroid,
  waitForCanvasRendered,
  type Rgb,
} from './pixel-analysis.ts';

// Mirrors `packages/renderer-three/src/theme.ts`'s `color.background`.
const SCENE_BACKGROUND: Rgb = { r: 0x0b, g: 0x0f, b: 0x19 };

function screenshotCanvas(page: Page): () => Promise<Buffer> {
  return () => page.locator('canvas').screenshot();
}

// One test, not one per align — see web.spec.ts.
test('scene renders each align value in its expected region, in order', async ({ page }) => {
  const order = new MonotonicOrder();

  for (const align of VERTICAL_ALIGN) {
    await test.step(`align=${align}`, async () => {
      await page.goto(`${SCENE_URL}/?align=${align}`);
      // The canvas exists the instant React mounts it, well before r3f's
      // first real frame — wait for an actual paint before measuring.
      await waitForCanvasRendered(screenshotCanvas(page), SCENE_BACKGROUND);

      const buffer = await page.locator('canvas').screenshot({
        path: `${SCREENSHOT_DIR}/scene-${align}.png`,
      });
      const image = decodePng(buffer);

      const panelBounds = findContentBounds(image, SCENE_BACKGROUND);
      if (panelBounds === null) {
        throw new Error(`scene align=${align}: no panel detected against the scene background`);
      }

      const centroid = textCentroid(image, panelBounds);
      if (centroid === null) {
        throw new Error(
          `scene align=${align}: no text-like pixels found within panel bounds ` +
            JSON.stringify(panelBounds),
        );
      }

      const panelHeight = panelBounds.bottom - panelBounds.top;
      const relativeCentre = (centroid.centroidY - panelBounds.top) / panelHeight;
      const region = expectedRegion(align);

      expect(
        relativeCentre,
        `scene align=${align}: text centroid at row ${centroid.centroidY.toFixed(1)} ` +
          `(${String(centroid.pixelCount)} text-like px, vertical extent ${String(centroid.minY)}-` +
          `${String(centroid.maxY)}), panel rows ${String(panelBounds.top)}-${String(panelBounds.bottom)} ` +
          `(height ${String(panelHeight)}px), relative centre ${relativeCentre.toFixed(3)}, ` +
          `expected within [${region.low.toFixed(3)}, ${region.high.toFixed(3)}]`,
      ).toBeGreaterThanOrEqual(region.low);
      expect(relativeCentre).toBeLessThanOrEqual(region.high);

      order.check(align, relativeCentre);
    });
  }

  // Guards against the ordering check regressing into a no-op again: this
  // fails if `check` ran fewer times than the loop above implies.
  expect(order.comparisons).toBe(VERTICAL_ALIGN.length - 1);
});
