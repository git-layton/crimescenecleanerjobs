#!/usr/bin/env bash
# Usage: ./scripts/set-secrets.sh wrangler.applianceinstalljobs.toml
# Reads secrets from .dev.vars and sets them on the target worker.

set -e

CONFIG="${1:-wrangler.toml}"
VARS_FILE="$(dirname "$0")/../.dev.vars"

if [ ! -f "$VARS_FILE" ]; then
  echo "Error: .dev.vars not found at $VARS_FILE"
  exit 1
fi

echo "Setting secrets for config: $CONFIG"

while IFS='=' read -r key value; do
  [[ "$key" =~ ^#.*$ || -z "$key" ]] && continue
  key=$(echo "$key" | xargs)
  value=$(echo "$value" | xargs)
  [ -z "$value" ] && echo "Skipping $key (empty)" && continue
  echo "  → $key"
  echo "$value" | npx wrangler secret put "$key" --config "$CONFIG"
done < "$VARS_FILE"

echo "Done."
