#!/usr/bin/env bash
# Сборка transcript-firefox.zip для AMO (из каталога extension/).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "ERROR: $1 not found. Install Node.js 20+ from https://nodejs.org/" >&2
    exit 1
  }
}

need node
need npm

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "ERROR: Node.js 20+ required (found $(node -v))" >&2
  exit 1
fi

echo "==> Node $(node -v), npm $(npm -v)"
echo "==> npm ci"
npm ci

echo "==> npm run build:firefox"
npm run build:firefox

echo "==> zip dist-firefox -> transcript-firefox.zip"
rm -f transcript-firefox.zip
(cd dist-firefox && zip -rq ../transcript-firefox.zip .)

if [ -f scripts/validate-firefox-zip.mjs ]; then
  echo "==> validate"
  node scripts/validate-firefox-zip.mjs transcript-firefox.zip
fi

echo "OK: $ROOT/transcript-firefox.zip"
