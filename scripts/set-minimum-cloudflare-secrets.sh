#!/usr/bin/env bash
set -euo pipefail

if ! command -v npx >/dev/null 2>&1; then
  echo "npx was not found. Install Node.js/npm first, then rerun this script." >&2
  exit 1
fi

echo "This sets the minimum production secrets for the main Worker."
echo "Use the same admin token you want to type into the Admin Gateway."
read -r -s -p "ADMIN_TOKEN: " ADMIN_TOKEN
echo

if [[ -z "${ADMIN_TOKEN}" ]]; then
  echo "ADMIN_TOKEN cannot be empty." >&2
  exit 1
fi

read -r -s -p "PROMO_CODE (leave blank to skip): " PROMO_CODE
echo

if command -v openssl >/dev/null 2>&1; then
  EDIT_CODE_PEPPER="$(openssl rand -hex 32)"
else
  EDIT_CODE_PEPPER="$(date +%s)-$(uuidgen)-$(uuidgen)"
fi

printf "%s" "${ADMIN_TOKEN}" | npx wrangler secret put ADMIN_TOKEN
printf "%s" "${EDIT_CODE_PEPPER}" | npx wrangler secret put EDIT_CODE_PEPPER
if [[ -n "${PROMO_CODE}" ]]; then
  printf "%s" "${PROMO_CODE}" | npx wrangler secret put PROMO_CODE
  echo "PROMO_CODE saved."
fi

echo
echo "Minimum secrets saved."
echo "Remember your ADMIN_TOKEN. The generated EDIT_CODE_PEPPER is stored in Cloudflare and does not need to be remembered."
