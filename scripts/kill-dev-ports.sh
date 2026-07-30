#!/usr/bin/env bash
# 清掉本仓库 dev 常用的 Vite / Electron 残留监听，避免 Port already in use。
set -euo pipefail

ports=(5173 5174 5175 5176)

echo "== 当前占用 dev 端口的进程 =="
found=0
for port in "${ports[@]}"; do
  if lsof -nP -iTCP:"${port}" -sTCP:LISTEN >/tmp/actspace-lsof-"${port}".txt 2>/dev/null; then
    found=1
    echo "--- :${port} ---"
    cat /tmp/actspace-lsof-"${port}".txt
  fi
done
if [[ "${found}" -eq 0 ]]; then
  echo "(无进程监听 ${ports[*]})"
fi

echo
echo "== 结束监听进程 =="
for port in "${ports[@]}"; do
  pids="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "${pids}" ]]; then
    continue
  fi
  echo "  kill port ${port}: ${pids}"
  # 先 SIGTERM，顽固的再 SIGKILL
  kill ${pids} 2>/dev/null || true
  sleep 0.3
  still="$(lsof -tiTCP:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -n "${still}" ]]; then
    echo "  force kill port ${port}: ${still}"
    kill -9 ${still} 2>/dev/null || true
  fi
done

# 偶发残留：Electron main 已退但 node/vite 子进程还在
for pattern in \
  "electron dist-electron/main/index.js" \
  "node ./scripts/dev-electron-run.mjs" \
  "concurrently -k .*dev:renderer" \
  ; do
  pgrep -fl "${pattern}" 2>/dev/null || true
done

echo
echo "完成。可重新执行: pnpm dev:log  或  VITE_DEV_PORT=5174 pnpm dev:log"
