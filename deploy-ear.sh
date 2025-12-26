#!/usr/bin/env bash
set -euo pipefail

BUCKET="${EAR_S3_BUCKET:-ear.uh-oh.wtf}"
CF_DISTRIBUTION_ID="${EAR_CF_DISTRIBUTION_ID:-E232GY8CG5NMHX}"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: '$cmd' is required." >&2
    exit 1
  fi
}

require_cmd aws

COMMON_EXCLUDES=(
  --exclude ".git/*"
  --exclude ".github/*"
  --exclude "node_modules/*"
  --exclude "raw_data/*"
  --exclude "scripts/*"
  --exclude "android/*"
  --exclude "untracked/*"
  --exclude "package-lock.json"
  --exclude "package.json"
  --exclude "DEV_SETUP.md"
  --exclude "cleanupplan.md"
  --exclude "refactor_plan.md"
  --exclude "server.log"
  --exclude "start-dev.sh"
  --exclude "stylelint.config.js"
  --exclude "foo.txt"
  --exclude "V5bwNXH6.txt"
  --exclude "deploy-ear.sh"
)

echo "Deploying to s3://${BUCKET}/"

maybe_sync_solfege_dataset() {
  if [[ ! -d "raw_data" ]]; then
    return
  fi

  local force="${EAR_DEPLOY_RAW_DATA:-}"
  local has_musicxml="false"
  local has_midi="false"

  # Fast check: avoid scanning local raw_data/ on every deploy unless it's missing remotely
  if [[ "${force}" == "1" ]]; then
    has_musicxml="false"
    has_midi="false"
  else
    if aws s3 ls "s3://${BUCKET}/raw_data/musicxml/" 2>/dev/null | head -n 1 | grep -q "."; then
      has_musicxml="true"
    fi
    if aws s3 ls "s3://${BUCKET}/raw_data/midi/" 2>/dev/null | head -n 1 | grep -q "."; then
      has_midi="true"
    fi
  fi

  if [[ -f "raw_data/solfege_manifest.json" ]]; then
    if [[ "${force}" == "1" ]] || ! aws s3 ls "s3://${BUCKET}/raw_data/solfege_manifest.json" >/dev/null 2>&1; then
      echo "Uploading Solfege manifest..."
      aws s3 cp "raw_data/solfege_manifest.json" "s3://${BUCKET}/raw_data/solfege_manifest.json" \
        --cache-control 'public, max-age=0, must-revalidate' \
        --metadata-directive REPLACE \
        --content-type 'application/json' \
        --only-show-errors
    fi
  fi

  if [[ "${has_musicxml}" != "true" && -d "raw_data/musicxml" ]]; then
    echo "Uploading Solfege MusicXML dataset (this is large; set EAR_DEPLOY_RAW_DATA=1 to force re-upload)..."
    aws s3 sync "raw_data/musicxml" "s3://${BUCKET}/raw_data/musicxml" --delete \
      --cache-control 'public, max-age=31536000, immutable' \
      --metadata-directive REPLACE \
      --content-type 'application/vnd.recordare.musicxml+xml' \
      --only-show-errors
  fi

  if [[ "${has_midi}" != "true" && -d "raw_data/midi" ]]; then
    echo "Uploading Solfege MIDI dataset..."
    aws s3 sync "raw_data/midi" "s3://${BUCKET}/raw_data/midi" --delete \
      --cache-control 'public, max-age=31536000, immutable' \
      --metadata-directive REPLACE \
      --content-type 'audio/midi' \
      --only-show-errors
  fi
}

maybe_sync_solfege_dataset

echo "Syncing immutable assets (images/fonts/etc)..."
aws s3 sync . "s3://${BUCKET}/" --delete \
  --cache-control 'public, max-age=31536000, immutable' \
  --metadata-directive REPLACE \
  "${COMMON_EXCLUDES[@]}" \
  --exclude "*.html" --exclude "*.css" --exclude "*.js" --exclude "*.json" --exclude "*.webmanifest" \
  --only-show-errors

echo "Uploading CSS/JS/JSON (must-revalidate cache-control)..."
aws s3 cp . "s3://${BUCKET}/" --recursive \
  --cache-control 'public, max-age=0, must-revalidate' \
  --metadata-directive REPLACE \
  "${COMMON_EXCLUDES[@]}" \
  --exclude "*" --include "*.css" --include "*.js" --include "*.json" --include "*.webmanifest" \
  --only-show-errors

echo "Uploading HTML (no-cache cache-control)..."
aws s3 cp . "s3://${BUCKET}/" --recursive \
  --cache-control 'no-cache, no-store, must-revalidate' \
  --metadata-directive REPLACE \
  "${COMMON_EXCLUDES[@]}" \
  --exclude "*" --include "*.html" \
  --only-show-errors

if [[ -n "${CF_DISTRIBUTION_ID}" ]]; then
  echo "Invalidating CloudFront distribution ${CF_DISTRIBUTION_ID}..."
  aws cloudfront create-invalidation --distribution-id "${CF_DISTRIBUTION_ID}" --paths '/*' >/dev/null
fi

echo "Done: https://ear.uh-oh.wtf/"
