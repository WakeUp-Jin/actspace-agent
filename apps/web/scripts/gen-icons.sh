#!/bin/sh
# 用无头 Chrome 把 SVG 渲染成 PNG；在 apps/web 目录运行。
set -e
CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
render() { # svg size out
  tmp=$(mktemp -d); svg="$(cd "$(dirname "$1")" && pwd)/$(basename "$1")"
  printf '<!doctype html><style>html,body{margin:0;background:transparent}img{display:block;width:%spx;height:%spx}</style><img src="file://%s">' "$2" "$2" "$svg" > "$tmp/i.html"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --default-background-color=00000000 --allow-file-access-from-files --screenshot="$3" --window-size="$2,$2" "file://$tmp/i.html" >/dev/null 2>&1
  rm -rf "$tmp"
}
render public/icons/icon.svg 192 public/icons/icon-192.png
render public/icons/icon.svg 512 public/icons/icon-512.png
render scripts/icon-full-bleed.svg 512 public/icons/icon-maskable-512.png
render scripts/icon-full-bleed.svg 180 public/icons/apple-touch-icon.png
