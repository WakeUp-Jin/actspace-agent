# Bash 工具和工具权限调度开发计划

这个文件夹收拢 Bash 工具、工具权限调度、审核 UI、暂停恢复与会话边界四个相互依赖的计划。后续继续推进时，先读本文件，再进入对应子计划。

## 计划列表

| 顺序 | 计划 | 当前状态 | 说明 |
| --- | --- | --- | --- |
| 1 | `actspace-tool-permission-scheduler-plan.md` | 部分完成 | 已完成权限三态、调度层、权限检查和 awaiting approval 结构化结果；还缺 approval request 扩展到 engine/runtime 事件，以及收尾测试与文档同步。 |
| 2 | `actspace-bash-tool-plan.md` | 已完成 | Bash definition、permissions、executor、render result、注册和测试已完成。 |
| 3 | `actspace-bash-approval-ui-plan.md` | 基本完成 | Bash 普通执行 UI、审核态 UI、fixture、浏览器 mock 和 Electron smoke 已完成；真实 pending Bash 触发依赖权限调度闭环。 |
| 4 | `actspace-tool-pause-session-boundary-plan.md` | 未开始 | 负责 pending registry、会话切换、恢复、过期、取消和幂等 decision。 |

## 当前结论

- Bash 工具本体已经可用。
- Bash UI 两种形态已经存在：
  - 普通工具调用 UI：折叠行 + 展开后的单层命令输出框。
  - 审核状态 UI：pending approval 面板，包含命令、原因、策略和 `Skip / Allow / Run` 操作。
- 工具权限调度现在只完成到工具层和调度层的结构化 `ask` 结果。
- 真实闭环还没完成：`ask -> runtime approval event -> frontend approval panel -> user decision -> resume/deny execution`。

## 推荐继续顺序

1. 继续 `actspace-tool-permission-scheduler-plan.md`。
   - 把 approval request 扩展为 engine/runtime 事件。
   - 让 renderer 可以从真实 stream 中收到 pending approval。
   - 补充对应测试。
2. 再执行 `actspace-tool-pause-session-boundary-plan.md`。
   - 设计 pending registry。
   - 定义会话切换、刷新、超时、重复点击、恢复后的幂等行为。
3. 回归 `actspace-bash-approval-ui-plan.md`。
   - 用真实 Bash ask 触发审核面板。
   - 验证 `Run / Allow / Skip` 后 UI 状态能正确变为 running、success、failed、cancelled 或 expired。

## 验收重点

- `allow`：不显示审核面板，直接进入执行。
- `deny`：硬拒绝，不显示审核面板，消息流保留拒绝原因。
- `ask`：生成 approval request，并在消息流中显示 Bash 审核面板。
- 用户选择 `Run`：只允许本次执行。
- 用户选择 `Allow`：允许本会话内相似操作，具体范围必须可见。
- 用户选择 `Skip`：取消本次执行，消息流显示 cancelled。
- 会话切换或应用重启后：pending 状态不能丢失、不能重复执行、不能错误自动放行。

## 相关设计文档

- `docs/design-docs/agent-core/权限设计规则和原则.md`
- `docs/design-docs/frontend-ui/中间消息区规范.md`
