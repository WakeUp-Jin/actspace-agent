#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

git -C "${repo_root}" config core.hooksPath .githooks

echo "Git hooks 已启用: core.hooksPath=.githooks"
echo "之后执行 git push 时会自动运行 .githooks/pre-push"
