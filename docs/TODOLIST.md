# TODO List

这个文件记录当前需要持续推进的仓库级任务。它不替代 execution plan；复杂任务仍以 `docs/exec-plans/` 中的计划文件为准。

## 当前焦点：Bash 工具与工具权限调度

计划入口：

- `docs/exec-plans/active/Bash工具和工具权限调度开发计划/README.md`
- `docs/design-docs/agent-core/权限设计规则和原则.md`

### 状态总览

| 任务 | 状态 | 当前情况 | 下一步 |
| --- | --- | --- | --- |
| 工具权限调度 | 进行中 | 已完成权限三态、调度层、权限检查和 awaiting approval 结构化结果。 | 将 approval request 扩展为 engine/runtime 事件，并补测试与文档同步。 |
| Bash 工具 | 完成 | Bash definition、permissions、executor、render result、注册和测试已完成。 | 等权限调度闭环接通后，做真实审核触发回归。 |
| Bash 审核 UI | 基本完成 | 普通 Bash 工具调用 UI 和 pending 审核面板已完成；浏览器 mock 和 Electron smoke 已验收。 | 等 runtime approval event 接通后，用真实 Bash ask 触发审核面板。 |
| 暂停恢复与会话边界 | 未开始 | 计划已写好，尚未实现 pending registry、会话切换、恢复、过期和幂等 decision。 | 在权限调度 runtime 事件之后开始。 |

### 推荐推进顺序

1. 继续工具权限调度计划。
   - 接入 `ask -> approval request -> runtime stream event`。
   - 让前端能收到真实 pending approval。
2. 实现暂停恢复与会话边界。
   - 定义 pending registry。
   - 处理会话切换、刷新、超时、重复点击和恢复后的幂等行为。
3. 回归 Bash 审核 UI。
   - 用真实 Bash `ask` 触发审核面板。
   - 验证 `Run / Allow / Skip` 后状态正确转换。

### 验收缺口

- `allow` 应直接执行，不显示审核面板。
- `deny` 应硬拒绝，不进入审核面板。
- `ask` 应生成 approval request，并显示 Bash 审核面板。
- `Run` 应只允许本次命令。
- `Allow` 应允许本会话内相似操作，授权范围必须可见。
- `Skip` 应取消本次执行，并在消息流中显示 cancelled。
- 会话切换或应用重启后，pending 状态不能丢失、重复执行或错误自动放行。

## 后续维护规则

- 新增跨多轮任务时，先在这里加一行总控 TODO，再视复杂度落 execution plan。
- 完成任务后，把状态改为 `完成`，并链接 history 或完成的 plan。
- 如果 TODO 已经沉淀成独立计划簇，保留这里的摘要和入口，不把所有细节复制进来。
