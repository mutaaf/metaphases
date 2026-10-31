#!/usr/bin/env bash
# One idempotent command: install, wire secrets, build, serve.
#   npm run up        → production-like: build + wrangler dev on :8811
#   npm run up -- --dev → hot reload: vite on :5188 proxying API to wrangler on :8811
set -euo pipefail
cd "$(dirname "$0")/.."
[ -d node_modules ] || npm install
if [ ! -f .dev.vars ]; then
  SRC="$HOME/projects/market-digest/.env"   # keys are shared with Market Digest
  if [ -f "$SRC" ]; then
    grep -E '^(FINNHUB_API_KEY|FRED_API_KEY)=' "$SRC" > .dev.vars
    echo "› wrote .dev.vars from Market Digest's .env"
  else
    echo "FINNHUB_API_KEY=\nFRED_API_KEY=" > .dev.vars; echo "› add your keys to .dev.vars (free: finnhub.io, fred.stlouisfed.org)"
  fi
fi
if [ "${1:-}" = "--dev" ]; then
  [ -d dist ] || npx vite build
  exec npx concurrently -k -n api,web "npx wrangler dev --port 8811" "npx vite"
fi
npx tsc -b && npx vite build
echo "› Metaphases → http://localhost:8811"
exec npx wrangler dev --port 8811
