#!/usr/bin/env node
/**
 * Проверка manifest для AMO Firefox.
 * node scripts/validate-firefox-zip.mjs [path/to.zip]
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const zipPath = process.argv[2] ?? path.join(root, 'transcript-firefox.zip');
const distManifest = path.join(root, 'dist-firefox', 'manifest.json');

const FORBIDDEN_PERMS = ['offscreen', 'tabCapture'];
const MIN_VERSION = 142;

function readManifestFromZip(zip) {
  return JSON.parse(execSync(`unzip -p "${zip}" manifest.json`, { encoding: 'utf8' }));
}

function validate(manifest, label) {
  const errors = [];
  const warnings = [];
  const gecko = manifest.browser_specific_settings?.gecko;

  if (!gecko?.id?.includes('@')) {
    errors.push('Нет gecko.id');
  }

  if (!gecko?.data_collection_permissions?.required?.length) {
    errors.push('Нет data_collection_permissions.required');
  }

  const min = parseFloat(String(gecko?.strict_min_version ?? '0'));
  if (min < MIN_VERSION) {
    errors.push(`strict_min_version ${gecko?.strict_min_version} < ${MIN_VERSION}`);
  }

  for (const p of manifest.permissions ?? []) {
    if (FORBIDDEN_PERMS.includes(p)) {
      errors.push(`Запрещённое permission для Firefox: ${p}`);
    }
  }

  if (manifest.background?.service_worker) {
    warnings.push('background.service_worker лучше убрать (Firefox использует scripts)');
  }
  if (!manifest.background?.scripts?.length) {
    errors.push('Нет background.scripts');
  }

  console.log(`\n=== ${label} ===`);
  if (warnings.length) console.log('warnings:', warnings.join('; '));
  if (errors.length) {
    console.log('FAIL:', errors.join('\n  '));
    return false;
  }
  console.log('OK');
  return true;
}

function scanZipForForbiddenApis(zip) {
  const hits = [];
  const list = execSync(`unzip -Z1 "${zip}"`, { encoding: 'utf8' })
    .split('\n')
    .filter((f) => f.startsWith('assets/') && f.endsWith('.js'));
  const patterns = ['tabCapture.getMediaStreamId', 'offscreen.createDocument', 'offscreen.Reason'];
  for (const file of list) {
    const body = execSync(`unzip -p "${zip}" "${file}"`, { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    for (const p of patterns) {
      if (body.includes(p)) hits.push(`${file}: ${p}`);
    }
  }
  return hits;
}

let ok = true;
if (fs.existsSync(distManifest)) {
  ok = validate(JSON.parse(fs.readFileSync(distManifest, 'utf8')), 'dist-firefox/manifest.json') && ok;
} else {
  console.warn('Нет dist-firefox/ — запустите: node scripts/patch-firefox-manifest.mjs');
  ok = false;
}

if (fs.existsSync(zipPath)) {
  ok = validate(readManifestFromZip(zipPath), path.basename(zipPath)) && ok;
  const forbidden = scanZipForForbiddenApis(zipPath);
  if (forbidden.length) {
    console.log('\n=== STT API в ZIP (должно быть пусто) ===');
    forbidden.forEach((h) => console.log('FAIL:', h));
    ok = false;
  }
}

process.exit(ok ? 0 : 1);
