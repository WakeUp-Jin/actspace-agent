# TODO List

这个文件只记录当前需要持续推进的仓库级任务。复杂任务的范围和下一步以 active 计划为准；实现完成后的人工门禁继续在 completed 计划及执行摘要中跟踪。

## 当前焦点

| 事项 | 状态 | 入口 | 下一步 |
| --- | --- | --- | --- |
| ActSpace v2 多包插件化发布门禁 | 实现完成，外部门禁待验收 | `docs/exec-plans/completed/20260824-actspace-v2-package-layout-and-plugin-packaging/README.md` | 继续真实 Provider、Electron、DMG/签名验收；Browser Bridge 按用户要求从本轮分离，后续单独修复。 |
| Agent 重构最终收尾 | 已完成批准范围并验收 | [最终计划](exec-plans/completed/20261005-agent-refactor-final-closeout/README.md) | 代码、文档、根目录结算与自动化通过；35/35 CU 签收，旧 CLI retry/error 欠账关闭。证据与限制见收尾摘要。 |
| Context 模型事实 | 实现与自动化回归完成，人工待验收 | [Context 计划](exec-plans/completed/20260901-actspace-context-model-facts/README.md) | 完成 Electron、真实 Provider 与截图 G2 人工验收。 |
| 前端 UI 组件基础 | 待执行 | `docs/exec-plans/active/frontend-ui-components-foundation.md` | 先确认组件边界和迁移顺序，再以小切片替换重复实现。 |

## 未来方向

- Bash 沙箱：独立设计执行隔离、自动放行边界、升级审批和跨平台失败关闭策略。
- Bash 命令前缀授权：独立设计命令拆分、会话/用户级 allowlist、撤销与审批入口。

- Agent Team / Room 保留为 `future-product-design`，不能继续执行已丢弃的 v1 计划；需要时从 v2 Session、Tool ABI 和插件生命周期重新立项。
- Bash 动态 allowlist 与全局执行策略尚未作为 v2 能力排期；需要时以 `docs/design-docs/execution-safety/README.md` 为当前边界新建计划。
- 尚未进入 execution plan 的工作继续记录在 `docs/exec-plans/tech-debt-tracker.md`，不要为了占位创建空计划。

## 维护规则

- 新增跨多轮任务时，先在这里增加一行总控 TODO，再视复杂度创建 execution plan。
- 任务完成后从当前焦点移除，并将计划归档到 `completed/`；不在这里维护第二份完成清单。
- 被替代或放弃的计划移动到 `discarded/`，不要删除历史决策上下文。
