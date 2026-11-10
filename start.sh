#!/usr/bin/env sh
# Starts Meydan locally (macOS / Linux).
set -e
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required: https://nodejs.org"
  echo "Online version: https://numanak-b221210105.github.io/meydan/"
  exit 1
fi
[ -d node_modules ] || npm install
npm run dev -- --open
