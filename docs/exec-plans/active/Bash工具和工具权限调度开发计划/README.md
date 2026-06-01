# Bash 工具和工具权限调度开发计划

这个文件夹收拢 Bash 工具、工具权限调度、审核 UI、暂停恢复与会话边界、会话级 allowlist 五条相互依赖的计划。后续继续推进时，先读本文件，再进入仍在 active 的子计划。

## 计划列表

| 顺序 | 计划 | 当前状态 | 说明 |
| --- | --- | --- | --- |
| 1 | `../../completed/actspace-tool-permission-scheduler-plan.md` | 已完成并归档 | 权限三态、调度层、权限检查、awaiting approval、ApprovalGate 异步等待、engine/runtime 事件、单测已完成。 |
| 2 | `../../completed/actspace-bash-tool-plan.md` | 已完成并归档 | Bash definition、permissions、executor（已改用 runProcess）、render result、注册和测试已完成。 |
| 3 | `../../completed/actspace-bash-approval-ui-plan.md` | 基本完成并归档 | Bash 普通执行 UI、审核态 UI、fixture、浏览器 mock 和 Electron smoke 已完成；真实 pending Bash 触发仍需回归。 |
| 4 | `actspace-tool-pause-session-boundary-plan.md` | 大部分完成 | PendingApprovalRegistry、暂停模型、幂等 decision、IPC 通道已完成；待 Electron 手动验收。 |
| 5 | `actspace-bash-session-allowlist-plan.md` | 待执行 | 会话级动态 allowlist + Allow 子命令拆分授权（A+B）。设计依据见 `docs/design-docs/agent-bash-policy-allowlist-design.md`。 |

## 当前结论

- Bash 工具本体已经可用。
- Bash UI 两种形态已经存在：
  - 普通工具调用 UI：折叠行 + 展开后的单层命令输出框。
  - 审核状态 UI：pending approval 面板，包含命令、原因、策略和 `Skip / Allow / Run` 操作。
- 工具权限调度、Bash 工具本体和审核 UI 已经完成并归档。
- 当前剩余焦点是两条：
  - 对 `ask -> runtime approval event -> frontend approval panel -> user decision -> resume/deny execution` 做真实 Bash 回归和 Electron 手动验收。
  - 执行会话级动态 allowlist + Allow 子命令拆分授权（A+B）。

## 推荐继续顺序

1. 回归真实 Bash 审核触发。
   - 用真实 Bash ask 触发审核面板。
   - 验证 `Run / Allow / Skip` 后 UI 状态能正确变为 running、success、failed、cancelled 或 expired。
2. 完成 `actspace-tool-pause-session-boundary-plan.md` 的 Electron 验收记录。
   - 覆盖会话切换、刷新/重启、超时、重复点击和 approve/deny 幂等。
3. 执行 `actspace-bash-session-allowlist-plan.md`。
   - 从共享契约、split-for-authorization、store、permissions/scheduler、renderer dropdown 和 session replay 推进。

## 验收重点

- `allow`：不显示审核面板，直接进入执行。
- `deny`：硬拒绝，不显示审核面板，消息流保留拒绝原因。
- `ask`：生成 approval request，并在消息流中显示 Bash 审核面板。
- 用户选择 `Run`：只允许本次执行。
- 用户选择 `Allow`：允许本会话内相似操作，具体范围必须可见。
- 用户选择 `Skip`：取消本次执行，消息流显示 cancelled。
- 会话切换或应用重启后：pending 状态不能丢失、不能重复执行、不能错误自动放行。

## 相关设计文档

- `docs/design-docs/agent-权限设计规则和原则.md`：权限系统总原则。
- `docs/design-docs/agent-bash-policy-allowlist-design.md`：Bash 全局策略 + 动态 allowlist 设计，含 Phase 1/2/3 路线图。
- `docs/design-docs/front-中间消息区规范.md`：审核面板属于消息区的一部分，遵守消息区规范。
