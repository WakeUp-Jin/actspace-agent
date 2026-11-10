#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
failed=0

while IFS= read -r line; do
  file="${line%%:*}"
  content="${line#*:}"
  # 仓库内的 composite action（uses: ./.github/actions/...）随 commit 走，没有 SHA 可钉。
  if [[ "${content}" =~ uses:[[:space:]]*\./ ]]; then
    continue
  fi
  if [[ ! "${content}" =~ @[0-9a-f]{40}([[:space:]]|$) ]]; then
    echo "发现未固定 SHA 的 GitHub Action 引用: ${line}"
    failed=1
  fi
done < <(grep -RIn 'uses:' "${repo_root}/.github/workflows" "${repo_root}/.github/actions" || true)

if [[ "${failed}" -ne 0 ]]; then
  exit 1
fi

echo "GitHub Action 固定 SHA 检查通过"
