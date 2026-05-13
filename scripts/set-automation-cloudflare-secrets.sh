#!/usr/bin/env bash
set -euo pipefail

if ! command -v npx >/dev/null 2>&1; then
  echo "npx was not found. Install Node.js/npm first, then rerun this script." >&2
  exit 1
fi

put_if_present() {
  local key="$1"
  local value="$2"
  local config="${3:-}"

  if [[ -z "${value}" ]]; then
    echo "Skipping ${key}"
    return
  fi

  if [[ -n "${config}" ]]; then
    printf "%s" "${value}" | npx wrangler secret put "${key}" --config "${config}"
  else
    printf "%s" "${value}" | npx wrangler secret put "${key}"
  fi
}

echo "Paste optional provider keys. Press Enter to skip any you do not have yet."
read -r -s -p "OPENAI_API_KEY: " OPENAI_API_KEY
echo
read -r -s -p "RESEND_API_KEY: " RESEND_API_KEY
echo
read -r -s -p "GOOGLE_SEARCH_API_KEY: " GOOGLE_SEARCH_API_KEY
echo
read -r -p "GOOGLE_SEARCH_CX: " GOOGLE_SEARCH_CX
read -r -p "ADZUNA_APP_ID: " ADZUNA_APP_ID
read -r -s -p "ADZUNA_APP_KEY: " ADZUNA_APP_KEY
echo

put_if_present OPENAI_API_KEY "${OPENAI_API_KEY}"
put_if_present RESEND_API_KEY "${RESEND_API_KEY}"
put_if_present GOOGLE_SEARCH_API_KEY "${GOOGLE_SEARCH_API_KEY}"
put_if_present GOOGLE_SEARCH_CX "${GOOGLE_SEARCH_CX}"
put_if_present ADZUNA_APP_ID "${ADZUNA_APP_ID}"
put_if_present ADZUNA_APP_KEY "${ADZUNA_APP_KEY}"

put_if_present OPENAI_API_KEY "${OPENAI_API_KEY}" "wrangler.agent.toml"
put_if_present GOOGLE_SEARCH_API_KEY "${GOOGLE_SEARCH_API_KEY}" "wrangler.agent.toml"
put_if_present GOOGLE_SEARCH_CX "${GOOGLE_SEARCH_CX}" "wrangler.agent.toml"
put_if_present ADZUNA_APP_ID "${ADZUNA_APP_ID}" "wrangler.agent.toml"
put_if_present ADZUNA_APP_KEY "${ADZUNA_APP_KEY}" "wrangler.agent.toml"

echo
echo "Optional automation secrets saved where provided."
