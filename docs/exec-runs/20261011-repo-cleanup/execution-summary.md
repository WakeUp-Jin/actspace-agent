# 仓库文档与 `packages` 清理 — 执行摘要

## 执行状态

本轮清理已完成。验证结果记录在“Agent 已完成的验证”中；未删除兼容层和 `@actspace/util`，其退役条件已写入对应 README。

## 更新日志边界

本轮属于仓库内部维护，没有新增用户可直接感知的功能、体验改进或问题修复，因此不新增 `docs/releases/feature-release-notes.md` 的公开条目。公开更新日志继续只记录用户可见变化；本轮的完整变更、决策和验证证据保留在本执行摘要、执行过程和 History 中。

可追溯入口：

- 计划：`docs/exec-plans/active/20261011-repo-cleanup.md`
- 过程：`docs/exec-runs/20261011-repo-cleanup/execution-process.md`
- History：`docs/histories/2026-10/20261011-repo-cleanup.md`

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261011-repo-cleanup.md`
- **执行过程**：`docs/exec-runs/20261011-repo-cleanup/execution-process.md`
- **History**：`docs/histories/2026-10/20261011-repo-cleanup.md`
- **执行模式**：交互
- **执行结果**：完成

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|---|---|---|
| 计划生命周期归档 | `docs/exec-plans/completed/20261005-desktop-frontend-refactor/` | 00、09–17 已执行计划移出 active，保留验收交接。 |
| 文档事实同步 | `docs/design-docs/`、`packages/boot/README.md` | 修正当前路径、实施状态和 demo/草稿状态。 |
| 忽略残留清理 | `packages/tools/core-tools/`、`apps/desktop/packages/` | 删除旧构建输出和嵌套测试依赖。 |
| 测试包边界收口 | `packages/cordis-adapter/tests/fixtures/`、`packages/cordis-adapter/tests/service-contract.spec.ts`、`packages/test-support/` | 将 Cordis fixture 内聚到 adapter 测试，移除深路径和反向依赖；`@actspace/test-support` 保留为独立公共测试入口。 |

## 人工验证指引

### 必须验证

1. 检查 `docs/exec-plans/README.md`，Desktop 前端重构应只在“最近完成”出现。
2. 确认 `packages/tools/core-tools/` 和 `apps/desktop/packages/desktop/node_modules/` 不再存在。
3. 运行本文“Agent 已完成的验证”中的全部命令；Computer Use 不在本轮范围内，因为没有修改 Desktop renderer 行为。

## Agent 已完成的验证

- `check:docs`、`check:current-docs`、`check:packages`、`check:package-cutover`、`check:repo`、`check:v2-legacy-removal --strict`：通过。
- `pnpm typecheck`、`pnpm build`、`pnpm run test:contract-matrix`：通过。
- `pnpm refactor:stats after --plan 20261011-repo-cleanup`、`git diff --check`：通过。
- 定向验证：`@actspace/test-support`、`@actspace/cordis-adapter`、`@actspace/context`、`@actspace/prompt` 测试通过。

## 已知风险和遗留事项

- `@actspace/util`、Context assembly 和 Prompt assembler 仍保留，需要后续兼容性决策。
- 历史文档继续保留 `core-tools` 等旧术语，不能把历史记录当作当前生产引用。
