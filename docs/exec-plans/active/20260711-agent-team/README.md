# Agent Team V1 执行计划总览

状态：待执行

设计来源：

- `docs/design-docs/collaboration/agent-form-team.md`
- `docs/design-docs/collaboration/agent-subagent-runtime.md`
- `docs/design-docs/execution-safety/agent-权限设计规则和原则.md`
- `docs/design-docs/agent-runtime/agent-testing.md`

## 目标

在不改变 Solo 现有行为的前提下，为 actspace 增加用户创建会话时主动选择、会话级不可切换的 Team 形态。Team 会话由一个 Leader 与多个长期运行的团队成员组成，使用共享 Task、成员级 writeScope、文件 Mailbox、独立 transcript 和统一工具权限调度完成编程协作；用户可以查看并直接指导成员，应用重启后可以恢复任务、成员和未读消息。

本计划按 **V1 基础版** 实施，不先做一次性 Demo。V1 必须包含持久化、并发写入保护、权限审核、异常恢复和真实 Electron 验收。

## 核心约束

- Agent Form 由用户创建会话时决定，Team 会话不能切换为 Solo 或 Room。
- 旧 session 缺少 `agentForm` 时按 Solo 恢复，不批量迁移历史数据。
- Team roster 扁平：只有 Leader 能启动团队成员，成员不能继续启动成员。
- Task 是 owner、状态、依赖和结果的唯一事实来源。
- 不引入 Attempt；Task 使用 `assignmentVersion`、`leaseExpiresAt`、`retryCount` 防止旧结果覆盖和支持恢复。
- Mailbox 使用每成员 JSON 数组和 `read` 状态，不使用 cursor，也不只读取最后一条。
- writeScope 属于团队成员，支持 `readonly`、`paths`、`workspace`。
- Renderer 只展示和提交用户操作，不直接读写 Team 文件或执行工具。
- Team 成员复用现有 `runAgentLoop`、LLM service、ToolManager、ToolScheduler、ContextManager 和 SessionEvent；不实现第二套执行引擎。
- 设计文档保持单文件；实施过程中发现设计需要调整时，直接同步 `agent-form-team.md`。

## 分阶段路线

```text
Plan 0：共享契约与会话形态地基
    ↓
Plan 1：Team 文件存储、锁与恢复原语
    ↓
Plan 2：TeamRuntime 与长期运行成员循环
    ↓
Plan 3：Leader/成员工具、writeScope 与权限接入
    ↓
Plan 4：Electron main / preload / IPC / session 生命周期
    ↓
Plan 5：Renderer Team 创建、任务页、成员页与直聊
    ↓
Plan 6：端到端恢复、并发、安全和真实桌面验收
```

Plan 5 的纯组件骨架可以在 Plan 0 契约完成后并行准备，但不得在 Plan 4 IPC 契约完成前接入假文件系统或私有 mock 状态。最终合并与验收仍按顺序执行。

## 子计划清单

| Plan | 目标 | 主要产物 | 依赖 |
|------|------|----------|------|
| [Plan 0](plan-0-shared-contracts.md) | 锁定 Team 类型、session form 和 stream/IPC 契约 | `packages/shared/src/team.ts`、SessionMeta/IPC 扩展 | 无 |
| [Plan 1](plan-1-team-storage.md) | 建立成员预设、模板、Task、Mailbox、runtime state、transcript 存储 | `packages/agent-core/src/team/storage/` | Plan 0 |
| [Plan 2](plan-2-team-runtime.md) | 建立 TeamRuntime、MemberRuntime、Task 调度、租约和成员 transcript | `packages/agent-core/src/team/runtime/` | Plan 0、1 |
| [Plan 3](plan-3-team-tools-permissions.md) | 注册 Leader/成员工具，接入 writeScope 和统一权限 | `packages/agent-core/src/team/tools/`、ToolScheduler 扩展 | Plan 2 |
| [Plan 4](plan-4-desktop-integration.md) | 接入 session 创建、main registry、IPC、重启恢复和退出 flush | `packages/desktop/src/main/team/`、preload 契约 | Plan 0-3 |
| [Plan 5](plan-5-renderer-team-ui.md) | 实现 Team 创建、标签、任务页、成员 transcript、直聊与设置管理 | renderer Team 组件和状态 hook | Plan 0、4 |
| [Plan 6](plan-6-e2e-acceptance.md) | 完成跨层回归、故障注入、安全和 Electron 验收 | E2E tests、验收记录、文档收尾 | Plan 0-5 |

## 全局共享契约

### Session 是 Agent Form 的事实来源

- `SessionMeta.agentForm` 是会话形态唯一事实来源。
- `session:create` 接收 form；`agent:run` 不允许 renderer 每次 Agent Run 覆盖 form。
- Team runtime 从 session meta 和 Team runtime snapshot 恢复。
- 不新增 `setSessionAgentForm` IPC。

### Team 配置快照

创建 Team session 时，把所选 TeamTemplate 与引用的 MemberPreset 解析为不可变 runtime snapshot：

```text
<userData>/agent-forms/runtime/<sessionId>/team-config.json
```

后续用户修改全局成员预设或 Team 模板，只影响新 session，不改变已经存在的 Team session。

### 文件路径

```text
<userData>/agent-forms/
├── member-presets/
├── teams/
└── runtime/<sessionId>/
    ├── team-config.json
    ├── team-state.json
    ├── tasks/
    ├── inboxes/
    └── transcripts/
```

### 事件与 UI

- Team 运行时文件是恢复事实来源。
- `RuntimeStreamEvent` 负责 renderer 实时更新。
- 成员 transcript 内部继续使用现有 `SessionEvent`。
- Leader 主 `session.jsonl` 不展开写入所有成员工具事件，避免主上下文膨胀。

### 权限

- TeamMember 工具调用继续走 `ToolScheduler`。
- 审核请求必须携带成员 ID/名称，前端明确显示是谁请求权限。
- Leader 或 Peer 不能替用户扩大高风险授权。
- writeScope 检查在统一调度路径完成，不能只写进 prompt。

## 全局非目标

- 不实现 Room。
- 不实现 Team/Solo/Room 中途切换。
- 不实现 tmux、独立进程或远程 TeamMember。
- 不实现成员创建成员。
- 不引入 Attempt、消息 cursor、消息队列服务或数据库。
- 不实现自动 worktree 合并；V1 使用 writeScope 串行化重叠写入。
- 不实现跨 provider TierBinding。
- 不让 TeamMember 继承 Leader 完整对话。
- 不把现有通用 Agent/Explore SubAgent 改成 TeamMember；两者保持不同生命周期。

## 全局风险

| 风险 | 缓解方式 |
|------|---------|
| Team 改动破坏 Solo | 所有 Team 注册和分支都由 `SessionMeta.agentForm.kind === "team"` 门控；保留 Solo 回归测试 |
| 多成员同时写同一路径 | 任务启动前 scope 冲突检测 + 工具执行前路径二次校验 |
| 旧成员迟到结果覆盖新 owner | `assignmentVersion` 强制匹配 |
| 进程退出导致 Task 永久 in_progress | Task lease + 启动恢复扫描 |
| Mailbox 忙碌时误标已读 | 只有成功注入或可靠处理后标记 read；消息 ID 去重 |
| 成员工具审批失去用户可见性 | approval request 增加 actor metadata，复用现有 PendingApprovalRegistry |
| Leader 上下文被成员 transcript 污染 | 主 session 只接收 Task 结果摘要、状态事件和必要消息 |
| Renderer 直接操纵文件状态 | 所有状态变更只经类型化 IPC 调 main/runtime |
| 全量 Team UI 一次合入难验收 | 先做 shared/runtime tests，再接 IPC，最后逐页面接真实状态 |

## 总体验收

工程命令：

```bash
pnpm --filter @actspace/shared typecheck
pnpm --filter @actspace/agent-core test
pnpm --filter @actspace/agent-core typecheck
pnpm --filter @actspace/desktop test
pnpm --filter @actspace/desktop typecheck
pnpm build
pnpm check:docs
```

真实桌面验收至少覆盖：

1. 创建 Solo session，行为与现状一致。
2. 创建 Team session，重启后仍是 Team，无法切换 Agent Form。
3. Leader 创建两个无依赖 Task，并行启动两个 readonly 成员。
4. 两个 paths 成员范围不重叠时并行，范围重叠时后启动成员进入 waiting。
5. 成员完成 Task 后结果写入 Task，Leader 页面正确汇总。
6. 用户在成员 Tab 直接发送消息，成员收到，Leader 同时看到镜像协调通知。
7. 成员等待权限时 UI 显示成员身份，批准/拒绝能恢复对应成员，不影响 Leader turn。
8. 强制结束应用后恢复：过期 lease 被释放，未读消息继续投递，已完成 Task 不重复执行。
9. 浅色、深色主题下 Team 标签、任务页、成员页和权限状态均可读。

## 必读文档

开始任一子计划前必须先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/design-docs/collaboration/agent-form-team.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/HISTORY_GUIDE.md`
- 本子计划文件列出的附加文档

## 进度记录

- [x] 设计规范完成并形成实施拆分。
- [ ] Plan 0：共享契约与会话形态地基。
- [ ] Plan 1：Team 文件存储。
- [ ] Plan 2：TeamRuntime 和 MemberRuntime。
- [ ] Plan 3：工具、writeScope 和权限。
- [ ] Plan 4：Desktop main / preload / IPC。
- [ ] Plan 5：Renderer Team UI。
- [ ] Plan 6：端到端验收和收尾。

## 决策记录

- 2026-07-11：按 V1 基础版规划，不先做无法恢复的一次性 Demo。
- 2026-07-11：采用总控 README + 7 个分阶段计划，共享契约先行。
- 2026-07-11：SessionMeta 保存 Agent Form，Team runtime 保存模板和成员预设快照。
- 2026-07-11：TeamMember 复用 `runAgentLoop`，不复用 Explore 专用 runner。
- 2026-07-11：Team runtime 文件是恢复事实来源，主 session 不展开成员完整 transcript。
- 2026-07-11：V1 不引入 worktree 自动合并，先用 writeScope 约束并行写入。
