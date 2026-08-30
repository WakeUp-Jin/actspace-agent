#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

"${repo_root}/scripts/check-docs.sh"
"${repo_root}/scripts/check-repo-hygiene.sh"
"${repo_root}/scripts/check-action-pinning.sh"

for module in "${repo_root}/packages/protocol" "${repo_root}/apps/cli"; do
  if [[ -d "$module" ]]; then
    (
      cd "$module"
      GOCACHE="${TMPDIR:-/tmp}/abb-go-cache" go test ./...
    )
  fi
done

if [[ -f "${repo_root}/apps/chrome-extension/src/background.js" ]]; then
  node --check "${repo_root}/apps/chrome-extension/src/background.js"
fi

while IFS= read -r file; do
  bash -n "$file"
done < <(find "${repo_root}/scripts" -type f -name '*.sh' | sort)

echo "基础 CI 与 Browser Bridge 当前验证通过"
