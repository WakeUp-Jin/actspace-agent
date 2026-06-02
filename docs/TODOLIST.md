# TODO List

这个文件记录当前需要持续推进的仓库级任务。它不替代 execution plan；复杂任务仍以 `docs/exec-plans/` 中的计划文件为准。

## 当前焦点

| 事项 | 状态 | 入口 | 下一步 |
| --- | --- | --- | --- |
| 2026-05-27 使用问题拆分计划 | 进行中 | `docs/exec-plans/active/20260527-bugfix-foundation_代码编完需手动验证.md`、`docs/exec-plans/active/20260527-agent-tool-capabilities.md`、`docs/exec-plans/active/20260527-frontend-interaction-polish/README.md`、`docs/exec-plans/active/20260527-right-panel-views.md` | 按各 plan 的并行边界推进，避免同时改同一块 UI / tool contract。 |
| Bash 真实审核与暂停恢复验收 | 待验收 | `docs/exec-plans/active/Bash工具和工具权限调度开发计划/README.md`、`docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-tool-pause-session-boundary-plan.md` | 用真实 Bash `ask` 触发审核面板，覆盖 `Run / Allow / Skip`、会话切换、刷新/重启、超时和幂等。 |
| Bash 会话级动态 allowlist + Allow 子命令拆分授权 | 待执行 | `docs/design-docs/agent-bash-policy-allowlist-design.md`、`docs/exec-plans/active/Bash工具和工具权限调度开发计划/actspace-bash-session-allowlist-plan.md` | 按 Phase 1 plan 从共享契约、split-for-authorization、store、permissions/scheduler、renderer dropdown 和 session replay 推进。 |
| Tailwind 样式架构迁移 | 进行中 | `docs/exec-plans/active/actspace-tailwind-style-architecture.md`、`docs/exec-plans/active/20260528-tailwind-remaining-ui-migration.md` | Usage 样板和 Lab V0 已完成；下一步按剩余 UI 迁移计划优先推进 RightPanel / Kairos Compact 切片。 |

## 验收缺口

- Bash `allow` 应直接执行，不显示审核面板。
- Bash `deny` 应硬拒绝，不进入审核面板。
- Bash `ask` 应生成 approval request，并显示 Bash 审核面板。
- `Run` 应只允许本次命令。
- `Allow` 应允许本会话内相似操作，授权范围必须可见。
- `Skip` 应取消本次执行，并在消息流中显示 cancelled。
- 会话切换或应用重启后，pending 状态不能丢失、重复执行或错误自动放行。
- `docs/exec-plans/completed/actspace-ui-bug-fix-plan.md` 与 `docs/exec-plans/completed/actspace-workbench-split-view-foundation.md` 仍保留 Electron 真实验收缺口；后续可在相关前端回归中一并补验。

## 已完成入口

- Bash 工具、权限调度和审核 UI 已归档到：
  - `docs/exec-plans/completed/actspace-tool-permission-scheduler-plan.md`
  - `docs/exec-plans/completed/actspace-bash-tool-plan.md`
  - `docs/exec-plans/completed/actspace-bash-approval-ui-plan.md`
- DeepSeek + Kimi 混合能力已归档到 `docs/exec-plans/completed/actspace-deepseek-kimi-hybrid-capabilities.md`。
- Grep / Glob / rg 工具链已归档到 `docs/exec-plans/completed/actspace-grep-glob-rg-tools-and-ui.md`。
- Sidebar Cursor 对齐已归档到 `docs/exec-plans/completed/sidebar-cursor-alignment.md`。
- Kairos v1 七份基础计划已归档到 `docs/exec-plans/completed/kairos_*.md`。
- Kairos 监控页产品化已归档到 `docs/exec-plans/completed/kairos-monitor-page-redesign.md`。
- Token Usage / Context Control 数据地基已归档到 `docs/exec-plans/completed/actspace-token-usage-context-control-foundation.md`。
- Usage Statistics session.jsonl 计划已归档到 `docs/exec-plans/completed/actspace-usage-statistics-session-jsonl-plan.md`。

## 未来方向

- Bash 全局执行策略选择器和真沙箱以 `docs/design-docs/agent-bash-policy-allowlist-design.md` 的 Phase 2 / Phase 3 为准，Phase 1 验收完成后再单独立项。
- Settings -> General -> Typography 已移入 `docs/exec-plans/tech-debt-tracker.md`，并由 `docs/exec-plans/active/20260527-frontend-interaction-polish/05-settings-typography.md` 承接。

## 后续维护规则

- 新增跨多轮任务时，先在这里加一行总控 TODO，再视复杂度落 execution plan。
- 完成任务后，把状态改为 `完成`，并链接 history 或 completed plan。
- 如果 TODO 已经沉淀成独立计划簇，保留这里的摘要和入口，不把所有细节复制进来。
