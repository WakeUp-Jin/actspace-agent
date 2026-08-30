#!/usr/bin/env bash
# Build the Browser Bridge CLI/native host and place the distributable binary in skill/scripts/.
set -euo pipefail

plugin_root="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cache_dir="${GOCACHE:-/private/tmp/abb-go-cache}"

mkdir -p "${plugin_root}/skill/scripts" "${cache_dir}"

(
  cd "${plugin_root}/apps/cli"
  GOCACHE="${cache_dir}" go build -o "${plugin_root}/skill/scripts/abb" .
)

chmod +x "${plugin_root}/skill/scripts/abb"
"${plugin_root}/skill/scripts/abb" help >/dev/null

echo "Built browser-bridge -> ${plugin_root}/skill/scripts/abb"
