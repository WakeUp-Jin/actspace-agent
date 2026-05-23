#!/usr/bin/env bash
set -o pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
log_dir="${repo_root}/logs"
timestamp="$(date '+%Y%m%d-%H%M%S')"
log_file="${log_dir}/dev-${timestamp}.log"
latest_log="${log_dir}/latest-dev.log"

mkdir -p "${log_dir}"
find "${log_dir}" -type f -name '*.log' -mtime +2 -delete

{
  echo "actspace dev log"
  echo "started_at=$(date '+%Y-%m-%d %H:%M:%S %z')"
  echo "command=pnpm dev"
  echo
} > "${log_file}"

ln -sfn "$(basename "${log_file}")" "${latest_log}"

cd "${repo_root}" || exit 1
pnpm dev 2>&1 | tee -a "${log_file}"
