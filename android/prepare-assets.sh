#!/usr/bin/env bash
#
# prepare-assets.sh — populate android/app/src/main/assets/ with a fully-offline
# build of the Banacos web app for the WebView APK.
#
# The app is served from a virtual https origin (https://appassets.androidplatform.net/)
# by WebViewAssetLoader, so the web app's root-absolute paths ("/js/...", "/staff/...")
# resolve unchanged. This script copies the runtime asset closure, vendors the CDN
# libraries locally, and neutralises every remaining network reference so the app works
# with no connectivity. The ONLY intentional online dependency is the solfege example
# dataset, which streams from https://ear.uh-oh.wtf (see SOLFEGE_ASSET_BASE below).
#
# It rewrites COPIES under assets/ only; the committed web source is never modified.
# Re-runnable: it wipes and rebuilds assets/ each time.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ASSETS="$SCRIPT_DIR/app/src/main/assets"
VENDOR_SRC="$SCRIPT_DIR/vendor"
SOLFEGE_BASE="https://ear.uh-oh.wtf"

cd "$ROOT_DIR"

log() { printf '  %s\n' "$*"; }

echo "==> Rebuilding $ASSETS"
rm -rf "$ASSETS"
mkdir -p "$ASSETS"

# --- 1. Top-level entry + icons + manifest -----------------------------------
echo "==> Copying top-level files"
for f in index.html site.webmanifest \
         favicon.ico favicon-16x16.png favicon-32x32.png \
         apple-touch-icon.png apple-touch-icon-precomposed.png \
         android-chrome-192x192.png android-chrome-512x512.png; do
  if [[ -e "$f" ]]; then cp -a "$f" "$ASSETS/"; else log "WARN: missing $f"; fi
done

# --- 2. Feature pages + shared code/styles -----------------------------------
echo "==> Copying app directories"
for d in intervals intervals-runner keyboard ledger solfege css js; do
  if [[ -d "$d" ]]; then cp -a "$d" "$ASSETS/"; else log "WARN: missing dir $d"; fi
done

# --- 3. Staff / VexFlow integration ------------------------------------------
# The app references BOTH /staff/* and /www/staff/* for the same files, and APK zips
# do not preserve symlinks, so materialise the directory under both paths.
echo "==> Materialising staff -> assets/staff and assets/www/staff"
mkdir -p "$ASSETS/www"
cp -a www/staff "$ASSETS/www/"   # -> $ASSETS/www/staff
cp -a www/staff "$ASSETS/staff"  # -> $ASSETS/staff
# Drop non-runtime files from each copy: build tools, backup/orig fonts, server
# snippets, and the standalone staff demo page (not shipped; it would need abcjs,
# which we deliberately do not vendor).
for base in "$ASSETS/www/staff" "$ASSETS/staff"; do
  rm -rf "$base/tools"
  rm -f  "$base/"*.bak.otf "$base/"*.orig.otf "$base/"*.caddy \
         "$base/mime.types" "$base/ear-smufl-mime.conf" "$base/index.html"
done

# --- 4. Vendored CDN libraries -----------------------------------------------
echo "==> Vendoring CDN libraries into assets/vendor"
mkdir -p "$ASSETS/vendor"
cp -a "$VENDOR_SRC/"*.js "$ASSETS/vendor/"

# --- 5. Rewrite CDN <script src> in copied HTML to the local vendor copies ----
echo "==> Rewriting CDN script references to /vendor/*"
sed -i \
  -e 's|https://cdn.jsdelivr.net/npm/tonal@4.14.2/browser/tonal.min.js|/vendor/tonal.min.js|g' \
  "$ASSETS/index.html" "$ASSETS/keyboard/index.html" "$ASSETS/solfege/index.html"
sed -i \
  -e 's|https://cdnjs.cloudflare.com/ajax/libs/tone/14.8.40/Tone.min.js|/vendor/Tone.min.js|g' \
  -e 's|https://cdn.jsdelivr.net/npm/opensheetmusicdisplay@1.9.3/build/opensheetmusicdisplay.min.js|/vendor/opensheetmusicdisplay.min.js|g' \
  "$ASSETS/solfege/index.html"

# --- 6. Point solfege at the remote dataset host (it streams; not bundled) -----
# Injected before the first <script> so window.SOLFEGE_ASSET_BASE is set before
# SolfegeLibrary.resolveAssetUrl() runs. Under the appassets https origin the
# library's file:// auto-detection does not fire, so the explicit base is required.
echo "==> Injecting SOLFEGE_ASSET_BASE into solfege/index.html"
sed -i "0,/<script/s||<script>window.SOLFEGE_ASSET_BASE='${SOLFEGE_BASE}';</script>\n    <script|" \
  "$ASSETS/solfege/index.html"

# --- 7. Neutralise remaining network font references --------------------------
echo "==> Repointing remote font fallbacks to local /staff/*.otf"
# GitHub-raw .otf fallbacks in @font-face src lists and smufl-core.js -> local /staff
find "$ASSETS/css" "$ASSETS/staff" "$ASSETS/www/staff" -type f \( -name '*.css' -o -name '*.js' \) -print0 \
  | xargs -0 sed -i -E 's#https://raw\.githubusercontent\.com/[^"'"'"' )]*/([A-Za-z]+)\.otf#/staff/\1.otf#g'
# VexFlow Font.HOST_URL (jsdelivr) -> empty so no code path can reach the CDN
find "$ASSETS/staff" "$ASSETS/www/staff" -type f -name 'font.js' -print0 \
  | xargs -0 sed -i 's#https://cdn.jsdelivr.net/npm/@vexflow-fonts/##g'

touch "$ASSETS/.gitkeep"

# --- 8. Report ----------------------------------------------------------------
echo "==> Done. Asset tree summary:"
du -sh "$ASSETS" | sed 's/^/    total /'
echo "    leftover network references in our HTML/CSS (should be empty; vendored libs excluded):"
grep -rIlE "https?://(cdn\.jsdelivr|cdnjs\.cloudflare|raw\.githubusercontent)" "$ASSETS" \
  --exclude-dir=vendor 2>/dev/null \
  | sed 's/^/      LEAK: /' || true
echo "    symlinks in assets (should be empty):"
find "$ASSETS" -type l | sed 's/^/      SYMLINK: /' || true
