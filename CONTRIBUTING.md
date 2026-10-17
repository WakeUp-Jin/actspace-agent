# 参与协作

这个仓库是为 Agent-first 开发准备的，但这些规则对人和 Agent 都一样适用。

## 基本协作方式

- 从 `AGENTS.md` 开始，再按任务类型去读对应文档。
- 仓库级知识要落在版本化文件里，不要只存在聊天记录、口头同步或工单评论里。
- 如果行为变了，就一起更新代码、文档、测试和 release/history 记录。
- 遇到跨度大、风险高、会分多轮推进的任务，先在 `docs/exec-plans/active/` 下建 execution plan。

## 分支与 PR 流程

功能和 Bug 修复统一采用：从最新 main 开独立分支 → 实现与验证 → 推送任务分支 → 创建 PR → 评审者审核并合并 → 本地 main 执行 `git pull --ff-only origin main`。不直接在 main 开发或推送，不复用已合并任务分支。完整规则见 [仓库协作约定](docs/REPO_COLLAB_GUIDE.md#功能开发与-bug-修复的默认交付流程)。

## 发起 Pull Request 之前

- 运行 `npm run ci`。
- 如果本次改动涉及代码或仓库流程，补齐或更新对应 history。
- 如果变更对用户可感知，补齐 release note。
- 确认示例、脚本、说明文档和当前实现一致。

## Review 默认要求

- 优先拆成范围清晰的小 PR。
- 明确写出风险点、迁移影响和后续待办。
- 如果上下文复杂，直接链接对应 plan、spec 或 history，不要依赖评审者自己猜。
