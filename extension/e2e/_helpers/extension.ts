import { chromium, type BrowserContext, type Page } from '@playwright/test';
import path from 'node:path';
import fs from 'node:fs';

/**
 * Resolve the unpacked extension directory.
 * Must be built (`npm run build`) before E2E runs.
 */
export function extensionDir(): string {
  const p = path.resolve(__dirname, '../../dist');
  if (!fs.existsSync(path.join(p, 'manifest.json'))) {
    throw new Error(
      `dist/manifest.json missing — run "npm run build" before "npm run test:e2e" (looked at ${p})`,
    );
  }
  return p;
}

/**
 * Launch a persistent Chrome context with the unpacked extension loaded.
 *
 * MV3 service workers do not start under `--headless`, so the headless flag
 * is forced off. CI must run this under `xvfb-run -a`.
 */
export async function launchWithExtension(): Promise<BrowserContext> {
  const ext = extensionDir();
  return chromium.launchPersistentContext('', {
    headless: false,
    args: [
      `--disable-extensions-except=${ext}`,
      `--load-extension=${ext}`,
      '--no-sandbox',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    // Required so the popup can issue cross-origin fetches without flake.
    acceptDownloads: true,
  });
}

/**
 * Resolve the extension ID by waiting for its service worker to register.
 */
export async function getExtensionId(ctx: BrowserContext): Promise<string> {
  let [sw] = ctx.serviceWorkers();
  if (!sw) {
    sw = await ctx.waitForEvent('serviceworker', { timeout: 15_000 });
  }
  return new URL(sw.url()).host;
}

/**
 * Open the popup HTML page directly (Playwright cannot click the toolbar icon).
 */
export async function openPopup(ctx: BrowserContext, extId: string): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`chrome-extension://${extId}/src/popup/popup.html`);
  return page;
}

/**
 * Skip a test when the CI runner has no internet access.
 * Set `CI_NO_NETWORK=1` to gate network-bound flows.
 */
export const NETWORK_SKIP = !!process.env.CI_NO_NETWORK;
