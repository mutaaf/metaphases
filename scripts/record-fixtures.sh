#!/usr/bin/env bash
# Re-record e2e fixtures from production. The tests freeze the clock at 2026-10-31, so only
# re-record if you also move that date in tests/e2e/fixtures.ts.
set -euo pipefail
B=${1:-https://metaphases.com}
cd "$(dirname "$0")/../tests/fixtures"
curl -fsS "$B/api/macro" > macro.json
curl -fsS "$B/api/calendar?from=2026-11-02&to=2026-12-04" > calendar-2026-11.json
curl -fsS "$B/api/calendar?from=2026-10-01&to=2026-10-31" > calendar-2026-10.json
curl -fsS "$B/api/ticker/NVDA" > ticker-NVDA.json
