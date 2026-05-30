#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

required_files=(
  ".gitignore"
  ".editorconfig"
  "CODEOWNERS"
)

failed=0

for path in "${required_files[@]}"; do
  if [[ ! -f "${repo_root}/${path}" ]]; then
    echo "缺少必要文件: ${path}"
    failed=1
  fi
done

"${repo_root}/scripts/check-secrets.sh"

if [[ "${failed}" -ne 0 ]]; then
  exit 1
fi

echo "仓库基础卫生检查通过"
