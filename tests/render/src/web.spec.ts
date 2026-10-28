import { VERTICAL_ALIGN } from '@lts/vocabulary';
import { expect, test } from '@playwright/test';
import { SCREENSHOT_DIR, WEB_URL } from './config.ts';
import { expectedRegion, MonotonicOrder } from './layout-regions.ts';

// One test, not one per align: with `fullyParallel`, per-align tests can run
// in separate workers, each with its own `MonotonicOrder`, and the ordering
// assertion then never fires.
test('web renders each align value in its expected region, in order', async ({ page }) => {
  const order = new MonotonicOrder();

  for (const align of VERTICAL_ALIGN) {
    await test.step(`align=${align}`, async () => {
      await page.goto(`${WEB_URL}/?align=${align}`);

      const header = page.locator('.lts-header');
      // `home` (packages/pages/src/home.tsx) has two `Paragraph` children
      // either side of a `DividingLine`; "last paragraph" is the second one.
      const paragraphs = page.locator('.lts-paragraph');
      await expect(header).toBeVisible();
      await expect(paragraphs.last()).toBeVisible();

      const headerBox = await header.boundingBox();
      const lastParagraphBox = await paragraphs.last().boundingBox();
      const viewport = page.viewportSize();
      if (headerBox === null || lastParagraphBox === null || viewport === null) {
        throw new Error(`web align=${align}: could not measure the content box or viewport size`);
      }

      const contentTop = headerBox.y;
      const contentBottom = lastParagraphBox.y + lastParagraphBox.height;
      const centre = (contentTop + contentBottom) / 2 / viewport.height;
      const region = expectedRegion(align);

      expect(
        centre,
        `web align=${align}: content centre at ${centre.toFixed(3)} of viewport height ` +
          `(header top ${String(contentTop)}px, last paragraph bottom ${String(contentBottom)}px, ` +
          `viewport height ${String(viewport.height)}px), expected within ` +
          `[${region.low.toFixed(3)}, ${region.high.toFixed(3)}]`,
      ).toBeGreaterThanOrEqual(region.low);
      expect(centre).toBeLessThanOrEqual(region.high);

      order.check(align, centre);

      await page.screenshot({ path: `${SCREENSHOT_DIR}/web-${align}.png` });
    });
  }

  // Guards against the ordering check regressing into a no-op again: this
  // fails if `check` ran fewer times than the loop above implies.
  expect(order.comparisons).toBe(VERTICAL_ALIGN.length - 1);
});
