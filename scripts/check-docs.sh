#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

required_files=(
  "AGENTS.md"
  "README.md"
  "CONTRIBUTING.md"
  "docs/README.md"
  "docs/REPO_COLLAB_GUIDE.md"
  "docs/HISTORY_GUIDE.md"
  "docs/PLANS_GUIDE.md"
  "docs/ARCHITECTURE.md"
  "docs/CICD.md"
  "docs/RELIABILITY.md"
  "docs/SECURITY.md"
  "docs/design-docs/index.md"
  "docs/design-docs/frontend/README.md"
  "docs/design-docs/frontend/front-新功能开发清单.md"
  "docs/design-docs/frontend/front-视觉token规范.md"
  "docs/design-docs/frontend/front-文案与状态表达规范.md"
  "docs/design-docs/frontend/front-组件与交互模式规范.md"
  "docs/learnings/README.md"
  "docs/references/README.md"
  "docs/exec-plans/README.md"
  "docs/exec-plans/templates/execution-plan.md"
  "docs/exec-plans/tech-debt-tracker.md"
  "docs/histories/template.md"
  "docs/releases/feature-release-notes.md"
)

missing=0

for path in "${required_files[@]}"; do
  if [[ ! -f "${repo_root}/${path}" ]]; then
    echo "缺少必要文件: ${path}"
    missing=1
  fi
done

for dir in docs/exec-plans/active docs/histories; do
  if [[ ! -d "${repo_root}/${dir}" ]]; then
    echo "缺少必要目录: ${dir}"
    missing=1
  fi
done

# 完成的计划和它的执行记录直接删除，不归档（docs/PLANS_GUIDE.md「计划完成时」）。
# 只看 Markdown：本机目录里可能还留着被 .gitignore 忽略的截图或 .DS_Store。
has_markdown() {
  [[ -d "$1" && -n "$(find "$1" -type f -name '*.md' -print -quit)" ]]
}

if has_markdown "${repo_root}/docs/exec-plans/completed"; then
  echo "docs/exec-plans/completed/ 已停用：完成的计划直接删除，不归档"
  missing=1
fi

for run_dir in "${repo_root}"/docs/exec-runs/*/; do
  name="$(basename "${run_dir}")"
  [[ "${name}" != "templates" ]] || continue
  has_markdown "${run_dir}" || continue
  if [[ ! -e "${repo_root}/docs/exec-plans/active/${name}.md" && ! -d "${repo_root}/docs/exec-plans/active/${name}" ]]; then
    echo "docs/exec-runs/${name}/ 没有对应的 active 计划：计划完成后执行记录要一起删除"
    missing=1
  fi
done

plans_index="${repo_root}/docs/exec-plans/README.md"

for entry in "${repo_root}"/docs/exec-plans/active/*; do
  [[ -e "${entry}" ]] || continue
  name="$(basename "${entry}")"

  if ! grep -Fq "active/${name}" "${plans_index}"; then
    echo "active 计划未登记到 docs/exec-plans/README.md: ${name}"
    missing=1
  fi

  entry_file="${entry}"
  if [[ -d "${entry}" ]]; then
    entry_file="${entry}/README.md"
  fi
  if [[ -f "${entry_file}" ]] && head -n 8 "${entry_file}" | grep -Eq '状态[：:].*(已完成|代码.*完成|里程碑.*完成)'; then
    echo "active 计划顶部声明已经完成，应按 docs/PLANS_GUIDE.md「计划完成时」收尾并删除: ${name}"
    missing=1
  fi
done

if ! grep -q "docs/" "${repo_root}/AGENTS.md"; then
  echo "AGENTS.md 应明确指向 docs/，说明它是仓库知识的正式来源"
  missing=1
fi

if [[ "${missing}" -ne 0 ]]; then
  exit 1
fi

node "${repo_root}/scripts/check-package-readmes.mjs"
node "${repo_root}/scripts/check-current-docs.mjs"

echo "文档骨架检查通过"
