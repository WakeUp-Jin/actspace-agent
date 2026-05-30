#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! command -v rg >/dev/null 2>&1; then
  echo "缺少 ripgrep: 请先安装 rg 后再运行 secret 扫描。"
  exit 1
fi

patterns=(
  'sk-[A-Za-z0-9_-]{16,}'
  'Bearer[[:space:]]+[A-Za-z0-9_.-]{20,}'
  '(DEEPSEEK|KIMI|OPENAI|ANTHROPIC|MOONSHOT|API)_?[A-Z0-9_]*KEY[[:space:]]*=[[:space:]]*[^[:space:]#'\''"]+'
  '(authorization|x-api-key|api-key)[[:space:]]*[:=][[:space:]]*["'\''"]?[A-Za-z0-9_.-]{20,}'
)

allow_patterns=(
  'sk-\.\.\.'
  'sk-REDACTED'
  'sk-test'
  'sk-env-'
  'deepseek-key'
  'KIMI_API_KEY=sk-\.\.\.'
  'DEEPSEEK_API_KEY=sk-\.\.\.'
  'DEEPSEEK_API_KEY=$'
  'KIMI_API_KEY=$'
  'apiKey: "sk-test'
  'apiKey: "sk-env-'
)

tmp_file="$(mktemp)"
trap 'rm -f "${tmp_file}"' EXIT

rg_args=(
  --hidden
  --line-number
  --no-heading
  --color never
  --glob '!.git/**'
  --glob '!node_modules/**'
  --glob '!dist/**'
  --glob '!dist-electron/**'
  --glob '!build/**'
  --glob '!coverage/**'
  --glob '!target/**'
  --glob '!*.png'
  --glob '!*.jpg'
  --glob '!*.jpeg'
  --glob '!*.webp'
  --glob '!*.gif'
  --glob '!*.ico'
  --glob '!*.pdf'
  --glob '!*.zip'
  --glob '!*.tar'
  --glob '!*.gz'
  --glob '!*.tgz'
  --glob '!*.lock'
  --glob '!pnpm-lock.yaml'
  --glob '!scripts/check-secrets.sh'
)

for pattern in "${patterns[@]}"; do
  rg "${rg_args[@]}" -e "${pattern}" "${repo_root}" >>"${tmp_file}" || true
done

filtered_file="$(mktemp)"
trap 'rm -f "${tmp_file}" "${filtered_file}"' EXIT

while IFS= read -r line; do
  allowed=0
  for allow in "${allow_patterns[@]}"; do
    if [[ "${line}" =~ ${allow} ]]; then
      allowed=1
      break
    fi
  done

  if [[ "${allowed}" -eq 0 ]]; then
    printf '%s\n' "${line}" >>"${filtered_file}"
  fi
done <"${tmp_file}"

if [[ -s "${filtered_file}" ]]; then
  echo "发现疑似密钥或鉴权信息，请确认后再提交/推送："
  while IFS= read -r line; do
    file="${line%%:*}"
    rest="${line#*:}"
    lineno="${rest%%:*}"
    content="${rest#*:}"
    content="$(printf '%s' "${content}" | sed -E \
      -e 's/sk-[A-Za-z0-9_-]{8,}/sk-REDACTED/g' \
      -e 's/(Bearer[[:space:]]+)[A-Za-z0-9_.-]{8,}/\1<redacted>/Ig' \
      -e 's/((authorization|x-api-key|api-key)[[:space:]]*[:=][[:space:]]*["'\'']?)[A-Za-z0-9_.-]{8,}/\1<redacted>/Ig' \
      -e 's/((DEEPSEEK|KIMI|OPENAI|ANTHROPIC|MOONSHOT|API)_?[A-Z0-9_]*KEY[[:space:]]*=[[:space:]]*)[^[:space:]#'\''"]+/\1<redacted>/g')"
    rel="${file#${repo_root}/}"
    printf '  %s:%s: %s\n' "${rel}" "${lineno}" "${content}"
  done <"${filtered_file}"
  exit 1
fi

echo "密钥泄露扫描通过"
