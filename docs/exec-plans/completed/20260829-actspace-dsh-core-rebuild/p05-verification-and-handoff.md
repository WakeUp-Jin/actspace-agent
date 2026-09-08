# P05：旧模型清理与最终验证

状态：完成候选（P05 已实施，待计划归档）

## 目标与依赖

在 P04 通过后删除旧事件生产者/消费者和兼容分支，完成工具 parity、fault injection、文档与 history 收口。P05 是本计划唯一的清理和最终验收包。

## 文件范围

- P00–P04 中仍引用旧事件的生产代码和测试；
- `packages/session/**`、`packages/core/agent-loop/**`、`packages/runtime/**`、`apps/cli/src/runtime-v2/**` 的旧名称引用；
- `docs/histories/2026-08/` 新 history；必要时 `docs/learnings/YYYY-MM/`；
- 验证脚本和本计划状态。

不删除用户 Session 数据目录，不删除无关 dirty-worktree 文件，不修改具体工具实现以掩盖 parity 差异。

## 步骤与验证

1. `rg` 搜索并删除 `turn/started`、`request/snapshot`、`llm/chunk`、`llm/usage`、`llm/error`、`llm/aborted` 的运行时引用。
2. 删除 v1 fallback/compatibility 分支；新格式从空 Session 开始。
3. 运行所有相关 package tests/typechecks、工具 parity、replay/golden、fault injection、package boundary 和 current-docs checks。
4. 依据 `docs/HISTORY_GUIDE.md`、`docs/QUALITY_SCORE.md` 和 `docs/learnings/WRITING_GUIDE.md` 记录变更与可迁移学习。
5. 另列真实 Provider、Electron、Chrome、签名/公证为外部人工验收，不把自动检查等同于发布通过。

验证命令：

```bash
pnpm test
pnpm run typecheck
pnpm run check:docs
pnpm run check:current-docs
pnpm run check:package-cutover
pnpm run check:v2-legacy-removal
```

通过标准：旧事件无生产引用；全局验收矩阵全部有证据；新 plan 可移入 completed 前，所有剩余外部门禁已明确写入执行摘要。
