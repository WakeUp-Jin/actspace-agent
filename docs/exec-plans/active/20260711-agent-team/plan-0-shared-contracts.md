# Plan 0：共享契约与会话形态地基

状态：待执行

依赖：无

产物消费方：Plan 1-6

## 目标

在 `packages/shared` 和 session persistence 契约中建立 Agent Team 的唯一类型来源，确保 Team Form 在创建会话时持久化、旧 session 默认按 Solo 恢复，并为后续 runtime、IPC 和 renderer 锁定稳定字段。

## 附加必读

- `docs/design-docs/collaboration/agent-form-team.md`
- `docs/design-docs/model-context/agent-token-usage-and-context-state.md`
- `packages/shared/src/session.ts`
- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/persistence/meta.ts`
- `packages/agent-core/src/persistence/session-store.ts`

## 允许修改的文件

- `packages/shared/src/team.ts`（新增）
- `packages/shared/src/index.ts`
- `packages/shared/src/session.ts`
- `packages/shared/src/ipc.ts`
- `packages/shared/src/test/team.test.ts`（新增）
- `packages/shared/src/test/session-selectors.test.ts`（仅 form/list 回归）
- `packages/agent-core/src/persistence/types.ts`
- `packages/agent-core/src/persistence/meta.ts`
- `packages/agent-core/src/persistence/session-store.ts`
- `packages/agent-core/src/persistence/test/meta.test.ts`
- `packages/agent-core/src/persistence/test/session-store.test.ts`
- 对应设计文档和 history

不得修改 renderer、Team runtime 或工具实现。

## 锁定的类型

在 `packages/shared/src/team.ts` 定义并从 `@actspace/shared` 导出：

- `ModelTier`
- `TierBinding`
- `ToolPermission`
- `WriteScope`
- `MemberPreset`
- `TeamTemplate`
- `TeamConfigSnapshot`
- `MemberStatus`
- `MemberWaitingReason`
- `TeamMember`
- `TeamTaskStatus`
- `TeamTask`
- `TeamMessageType`
- `TeamMessage`
- `TeamRuntimeState`
- `PersistedAgentForm`

`PersistedAgentForm` 固定为：

```typescript
type PersistedAgentForm =
  | { kind: "solo" }
  | {
      kind: "team";
      teamTemplateId: string;
      tierBinding: TierBinding;
    };
```

Room 尚未实施，不进入持久化联合类型。未来实现 Room 时再追加，不先放不可运行分支。

## 任务清单

### 0.1 新增共享 Team 类型

- 类型字段逐项对齐 `agent-form-team.md`。
- `TeamTask` 只保留 `blockedBy`，不增加反向 `blocks`。
- `TeamMember.currentTaskId` 与 `TeamTask.ownerId` 均可选，但测试 helper 必须能检测不一致。
- 增加纯函数：
  - `resolvePersistedAgentForm(metaForm)`：缺省返回 `{kind:"solo"}`。
  - `isTeamAgentForm(form)`。
  - `isRunnableTeamTask(task, allTasks)`：pending、无未完成依赖。
  - `writeScopesOverlap(a, b, workspaceRoot)`：供 Plan 2/3 复用。

验证：`packages/shared/src/test/team.test.ts` 覆盖旧 meta 缺 form、依赖派生、路径 scope 重叠和 readonly 不冲突。

### 0.2 扩展 SessionMeta 和 session 列表

- `SessionMeta` 增加可选 `agentForm?: PersistedAgentForm`。
- `SessionListItem` 增加可选 `agentForm?: PersistedAgentForm`，Sidebar 后续可以显示 Team 标记。
- 旧 meta 不写回迁移；读取时由 helper 解释为 Solo。
- `SessionRecord` 继续通过 meta 暴露 form，不复制第二份字段。

### 0.3 扩展 SessionCreateInput

- `SessionCreateInput` 增加可选 `agentForm?: PersistedAgentForm`。
- 缺省创建 Solo。
- `createMeta()`、`createSessionRecord()` 接收并持久化 `agentForm`。
- 不增加更新 Agent Form 的 MetaUpdateFields，也不增加 setter，机械保证会话级不可切换。

### 0.4 定义 Team IPC 和实时事件契约

在 `packages/shared/src/ipc.ts` 增加：

- `TeamGetStateInput/Result`
- `TeamListMemberPresetsResult`
- `TeamListTemplatesResult`
- `TeamSaveMemberPresetInput/Result`
- `TeamSaveTemplateInput/Result`
- `TeamSendMemberMessageInput/Result`
- `TeamStopMemberInput/Result`
- `TeamUpdateMemberScopeInput/Result`
- `TeamGetMemberTranscriptInput/Result`

在 `RuntimeStreamEvent` 增加四类事件：

- `team_state_updated`：完整轻量 `TeamRuntimeState` 快照。
- `team_task_updated`：单个 Task 增量。
- `team_message_updated`：新消息或 read 状态变化。
- `team_member_event`：memberId + 一条成员 `SessionEvent`。

这些事件必须携带 `sessionId`，renderer 不依赖当前 active session 猜归属。

### 0.5 锁定 Team 配置快照

`TeamConfigSnapshot` 必须包含：

- TeamTemplate 的完整值。
- 所有被引用 MemberPreset 的完整值。
- resolved TierBinding。
- `createdAt` 和 schemaVersion。

全局模板后续被编辑时，已有 session 继续使用 snapshot。

## 测试要求

- 缺少 `agentForm` 的旧 meta 恢复为 Solo。
- Team meta 创建后 list/read 往返保持不变。
- MetaUpdateFields 无法修改 form。
- TeamConfigSnapshot 不只保存 preset ID。
- `writeScopesOverlap` 对 readonly、workspace、paths 相交/不相交均有用例。
- `isRunnableTeamTask` 正确处理 completed 依赖和失败依赖。

## 验证命令

```bash
pnpm --filter @actspace/shared test
pnpm --filter @actspace/shared typecheck
pnpm --filter @actspace/agent-core test -- src/persistence/test/meta.test.ts src/persistence/test/session-store.test.ts
pnpm --filter @actspace/agent-core typecheck
```

## 完成标准

- 后续 Plan 不再自行定义 Team 类型。
- Team Form 能随 session 创建、列表和恢复稳定往返。
- 旧 session 不需要迁移即可继续使用 Solo。
- 仓库中不存在修改既有 session Agent Form 的 API。

