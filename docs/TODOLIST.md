# TODO List

这个文件只记录当前需要持续推进的仓库级任务。复杂任务的范围、依赖和验收以 `docs/exec-plans/active/` 中的计划为准。

## 当前焦点

| 事项 | 状态 | 入口 | 下一步 |
| --- | --- | --- | --- |
| Agent Team V1 | 待执行 | `docs/exec-plans/active/20260711-agent-team/README.md` | 按共享契约、存储、runtime、工具权限、桌面接入、Team UI 和端到端验收的依赖顺序推进。 |
| Bash 会话级动态 allowlist | 待执行 | `docs/exec-plans/active/Bash工具和工具权限调度开发计划/README.md` | 完成子命令拆分授权、会话与用户级 allowlist、审批 UI 和 session replay。 |
| 前端 UI 组件基础 | 待执行 | `docs/exec-plans/active/frontend-ui-components-foundation.md` | 先确认组件边界和迁移顺序，再以小切片替换重复实现。 |

## Bash Allowlist 验收重点

- 复合命令必须按子命令拆分授权，危险片段不能被安全前缀掩盖。
- `Run` 只允许本次执行；`Allow` 的授权范围必须可见并限制在当前会话。
- 会话级授权需要随 session replay 恢复，升级为用户级授权时必须经过 main 进程持久化。
- hard reject 仍直接拒绝，不进入可以被用户放行的审核面板。

## 未来方向

- Bash 全局执行策略选择器和网络隔离以 `docs/design-docs/execution-safety/agent-bash-policy-allowlist-design.md` 的 Phase 2 / Phase 3 为准，Phase 1 完成后再单独立项。
- 尚未进入 execution plan 的工作继续记录在 `docs/exec-plans/tech-debt-tracker.md`，不要为了占位创建空计划。

## 维护规则

- 新增跨多轮任务时，先在这里增加一行总控 TODO，再视复杂度创建 execution plan。
- 任务完成后从当前焦点移除，并将计划归档到 `completed/`；不在这里维护第二份完成清单。
- 被替代或放弃的计划移动到 `discarded/`，不要删除历史决策上下文。
