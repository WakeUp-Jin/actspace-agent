#!/usr/bin/env bash
# 构建 fs-watch 并把二进制放进 skill/scripts/，使 skill/ 成为可整体分发的单元。
set -euo pipefail
cd "$(dirname "$0")"

cargo build --release

target_dir="${CARGO_TARGET_DIR:-target}"
mkdir -p skill/scripts
cp "${target_dir}/release/fs-watch" skill/scripts/fs-watch
chmod +x skill/scripts/fs-watch

echo ""
echo "fs-watch 构建完成："
ls -lh skill/scripts/fs-watch
