## [2026-10-07 22:39] | Task: 忽略执行过程图片

### Execution Context

- Agent ID: `/root`
- Base Model: 本次会话未提供可核验的精确型号
- Runtime: Codex desktop

### User Query

> 忽略 exec-runs 等中间运行过程产生的图片，减少代码库增长；批准取消已有图片跟踪并保留本地文件。

### Changes Overview

- 根 `.gitignore` 仅忽略 `docs/exec-runs/` 下常见图片格式，保留文本验收记录及其他目录的产品图片。
- 取消执行时已跟踪的 674 张图片的 Git 跟踪，保留全部本地文件。此前检查为 664 张，执行时以当前索引为准。
- 更新执行记录规范：本地图片不随仓库分发，关键共享证据另行归档，旧图片可从移除跟踪前的历史提交回溯。
- 未重写 Git 历史；此变更防止后续图片增长，不清理既有历史对象。

### Validation

- 全部 674 张图片取消跟踪前后 SHA-256 一致，且均命中忽略规则。
- 验证执行摘要 Markdown、官网和 Desktop 产品图片示例路径未被忽略。
- `pnpm check:docs` 通过。
- `git diff --check` 与 `git diff --cached --check` 通过。

### Files Modified

- `.gitignore`
- `docs/exec-runs/README.md`
- `docs/exec-runs/` 下已有图片的索引记录

### Learning Assessment

本次为常规 Git 忽略与索引维护，未达到至少两项学习沉淀标准，不单独生成 learning。
