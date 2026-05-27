#!/usr/bin/env node
/**
 * Патч manifest.json в dist-firefox/ для AMO.
 * Сборка: FIREFOX_BUILD=1 vite build → dist-firefox/
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const firefoxDist = path.join(root, 'dist-firefox');

const FIREFOX_MIN_VERSION = '142.0';
const FIREFOX_PERMISSIONS = ['storage', 'scripting', 'activeTab'];

const manifestPath = path.join(firefoxDist, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
  console.error('Нет dist-firefox/manifest.json — запустите: FIREFOX_BUILD=1 npm run build');
  process.exit(1);
}

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

manifest.permissions = (manifest.permissions ?? []).filter((p) =>
  FIREFOX_PERMISSIONS.includes(p),
);

manifest.browser_specific_settings = {
  gecko: {
    id: 'transcript@dorofeevb1.github',
    strict_min_version: FIREFOX_MIN_VERSION,
    data_collection_permissions: {
      required: ['none'],
      optional: ['websiteContent'],
    },
  },
};

const sw = manifest.background?.service_worker;
if (!sw) {
  console.error('Нет background.service_worker в dist-firefox');
  process.exit(1);
}

manifest.background = {
  scripts: [sw],
  type: manifest.background.type ?? 'module',
};

if (manifest.web_accessible_resources) {
  manifest.web_accessible_resources = manifest.web_accessible_resources.filter(
    (war) => !war.resources?.some((r) => r.includes('offscreen')),
  );
  if (manifest.web_accessible_resources.length === 0) {
    delete manifest.web_accessible_resources;
  }
}

fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

const offscreenDir = path.join(firefoxDist, 'src/offscreen');
if (fs.existsSync(offscreenDir)) {
  fs.rmSync(offscreenDir, { recursive: true, force: true });
}

for (const name of fs.readdirSync(path.join(firefoxDist, 'assets'), { withFileTypes: true })) {
  if (name.isFile() && name.name.startsWith('offscreen-')) {
    fs.unlinkSync(path.join(firefoxDist, 'assets', name.name));
  }
}

console.log('Firefox dist:', firefoxDist);
console.log('  permissions:', manifest.permissions);
console.log('  gecko:', manifest.browser_specific_settings.gecko);
console.log('  background.scripts:', manifest.background.scripts);
