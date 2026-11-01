#!/usr/bin/env bash
# Bridge until Cloudflare Workers Builds is connected: deploy origin/main when it moves and its CI is green.
# Installed as launchd job com.mutaaf.metaphases.autodeploy (every 10 min). Log: ~/Library/Logs/metaphases-autodeploy.log
set -euo pipefail
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
DIR="$HOME/projects/metaphases-deploy"   # dedicated clone, never the working checkout
STATE="$HOME/.metaphases-deployed-sha"
[ -d "$DIR/.git" ] || git clone -q https://github.com/mutaaf/metaphases "$DIR"
cd "$DIR"
git fetch -q origin main
SHA=$(git rev-parse origin/main)
[ "$(cat "$STATE" 2>/dev/null)" = "$SHA" ] && exit 0
CONC=$(gh run list -R mutaaf/metaphases --workflow ci.yml --commit "$SHA" --json conclusion,status --jq '[.[] | select(.status=="completed")][0].conclusion // ""')
if [ "$CONC" != "success" ]; then echo "$(date -u +%FT%TZ) main@${SHA:0:7} CI='$CONC' — waiting"; exit 0; fi
git reset -q --hard "$SHA"
npm ci --silent
npx vite build >/dev/null
npx wrangler deploy 2>&1 | grep -E "Version ID|rror" || true
echo "$SHA" > "$STATE"
echo "$(date -u +%FT%TZ) deployed main@${SHA:0:7}"
