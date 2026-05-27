#!/usr/bin/env bash
# Архив исходников для AMO (без node_modules, dist, бинарных артефактов).
set -euo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
OUT="$REPO/extension/transcript-source-amo.zip"

cd "$REPO"

echo "==> Creating $OUT"
rm -f "$OUT"

zip -rq "$OUT" \
  extension/package.json \
  extension/package-lock.json \
  extension/manifest.json \
  extension/vite.config.ts \
  extension/tsconfig.json \
  extension/src \
  extension/scripts \
  extension/_locales \
  extension/icons \
  Makefile \
  README.md \
  docs/SOURCE-AMO.md \
  docs/PUBLISHING_FIREFOX.md \
  docs/USER_GUIDE.md \
  docs/DEVELOPER.md

# exclude if present (zip -x only works for added paths; we don't add these)
echo "Excluded: node_modules, dist, dist-firefox, transcript-*.zip, whisper-server"

SIZE="$(du -h "$OUT" | cut -f1)"
echo "OK: $OUT ($SIZE)"
