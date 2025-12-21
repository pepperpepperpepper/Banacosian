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

echo "Syncing immutable assets (images/fonts/etc)..."
aws s3 sync . "s3://${BUCKET}/" --delete \
  --cache-control 'public, max-age=31536000, immutable' \
  --metadata-directive REPLACE \
  "${COMMON_EXCLUDES[@]}" \
  --exclude "*.html" --exclude "*.css" --exclude "*.js" --exclude "*.json" --exclude "*.webmanifest" \
  --only-show-errors

echo "Syncing CSS/JS/JSON (must-revalidate cache-control)..."
aws s3 sync . "s3://${BUCKET}/" \
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
