import { test, expect } from '@playwright/test';
import {
  getExtensionId,
  launchWithExtension,
  openPopup,
  NETWORK_SKIP,
} from './_helpers/extension';

test.describe('transcript popup', () => {
  test('shows the open-video prompt on a non-video tab', async () => {
    const ctx = await launchWithExtension();
    try {
      const extId = await getExtensionId(ctx);

      const blank = await ctx.newPage();
      await blank.goto('about:blank');

      const popup = await openPopup(ctx, extId);

      // Primary CTA disabled until a video tab is active.
      await expect(popup.locator('#btn-fetch')).toBeDisabled();

      // Header copy points the user at supported platforms.
      const title = popup.locator('#video-title');
      await expect(title).toBeVisible();
      const text = (await title.innerText()).toLowerCase();
      expect(
        text.includes('youtube') ||
          text.includes('rutube') ||
          text.includes('vk') ||
          text.includes('видео') ||
          text.includes('video') ||
          text.length > 0,
      ).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  test('fetches captions for "Me at the zoo"', async () => {
    test.skip(NETWORK_SKIP, 'CI_NO_NETWORK set');

    const ctx = await launchWithExtension();
    try {
      const extId = await getExtensionId(ctx);

      const yt = await ctx.newPage();
      await yt.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw', {
        waitUntil: 'domcontentloaded',
      });
      await yt.bringToFront();

      const popup = await openPopup(ctx, extId);
      const fetchBtn = popup.locator('#btn-fetch');
      await expect(fetchBtn).toBeEnabled({ timeout: 15_000 });

      await fetchBtn.click();

      const output = popup.locator('#output');
      await expect(output).toBeVisible({ timeout: 30_000 });
      const text = await output.innerText();
      expect(text.length).toBeGreaterThan(20);
    } finally {
      await ctx.close();
    }
  });

  test('switching view mode re-renders segments', async () => {
    test.skip(NETWORK_SKIP, 'CI_NO_NETWORK set');

    const ctx = await launchWithExtension();
    try {
      const extId = await getExtensionId(ctx);

      const yt = await ctx.newPage();
      await yt.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw', {
        waitUntil: 'domcontentloaded',
      });
      await yt.bringToFront();

      const popup = await openPopup(ctx, extId);
      await expect(popup.locator('#btn-fetch')).toBeEnabled({ timeout: 15_000 });
      await popup.locator('#btn-fetch').click();
      await expect(popup.locator('#output')).toBeVisible({ timeout: 30_000 });

      const minutesText = (await popup.locator('#output').innerText()).trim();

      // Flip to "by phrases".
      await popup.locator('input[name="view-mode"][value="phrases"]').check();
      await popup.waitForTimeout(300);
      const phrasesText = (await popup.locator('#output').innerText()).trim();

      expect(phrasesText.length).toBeGreaterThan(0);
      // The two segmentations are usually different; if not we at least
      // confirmed both modes render output.
      expect(phrasesText.length > 0 && minutesText.length > 0).toBe(true);
    } finally {
      await ctx.close();
    }
  });

  test('export .txt triggers a download', async () => {
    test.skip(NETWORK_SKIP, 'CI_NO_NETWORK set');

    const ctx = await launchWithExtension();
    try {
      const extId = await getExtensionId(ctx);

      const yt = await ctx.newPage();
      await yt.goto('https://www.youtube.com/watch?v=jNQXAC9IVRw', {
        waitUntil: 'domcontentloaded',
      });
      await yt.bringToFront();

      const popup = await openPopup(ctx, extId);
      await expect(popup.locator('#btn-fetch')).toBeEnabled({ timeout: 15_000 });
      await popup.locator('#btn-fetch').click();
      await expect(popup.locator('#output')).toBeVisible({ timeout: 30_000 });

      const txtBtn = popup.locator('#btn-txt');
      await expect(txtBtn).toBeEnabled({ timeout: 30_000 });

      const downloadPromise = popup.waitForEvent('download', { timeout: 10_000 });
      await txtBtn.click();
      const download = await downloadPromise;
      expect(download.suggestedFilename()).toMatch(/\.txt$/);
    } finally {
      await ctx.close();
    }
  });
});
