# Plan 3：Leader/成员工具、writeScope 与权限接入

状态：待执行

依赖：Plan 2

产物消费方：Plan 4-6

## 目标

把 TeamRuntime 以模型工具形式暴露给 Leader 和团队成员，并把成员身份、writeScope、审批等待和文件写入约束接入现有 ToolManager/ToolScheduler，确保权限是可执行的运行时规则，不只存在于 prompt。

## 附加必读

- `docs/design-docs/execution-safety/agent-权限设计规则和原则.md`
- `docs/design-docs/execution-safety/agent-bash工具设计文档.md`
- `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`
- `packages/agent-core/src/tools/manager.ts`
- `packages/agent-core/src/tools/scheduler.ts`
- `packages/agent-core/src/tools/tools/bash/permissions.ts`
- `packages/agent-core/src/tools/workspace-guard.ts`

## 允许修改的文件

- `packages/agent-core/src/team/tools/definitions.ts`（新增）
- `packages/agent-core/src/team/tools/leader-tools.ts`（新增）
- `packages/agent-core/src/team/tools/member-tools.ts`（新增）
- `packages/agent-core/src/team/tools/prompts.ts`（新增）
- `packages/agent-core/src/team/tools/test/*.test.ts`（新增）
- `packages/agent-core/src/tools/types.ts`
- `packages/agent-core/src/tools/manager.ts`
- `packages/agent-core/src/tools/scheduler.ts`
- `packages/agent-core/src/tools/index.ts`
- `packages/agent-core/src/tools/tools/bash/permissions.ts`
- `packages/agent-core/src/tools/tools/bash/command-rules.ts`
- 相关工具 permission tests
- `packages/shared/src/session.ts` / `ipc.ts`（仅 approval actor metadata）
- 对应文档和 history

## Leader 工具

注册：

- `create_task`
- `update_task`
- `spawn_member`
- `update_member_scope`
- `send_message`
- `terminate_member`
- `inspect_team`
- `finalize_team_work`

不注册：`assign_task`、`collect_results`、`read_inbox`。

`update_task` 修改 owner 时调用 TaskStore 原子分配，并写 `task_assignment_notification`；通知不是状态事实源。

## 成员工具

注册：

- `list_tasks`
- `get_task`
- `claim_task`
- `update_task`
- `send_message`

成员 `update_task` 只能操作 ownerId 等于自身且 assignmentVersion 匹配的 Task。成员不能修改 owner、其他成员 scope 或 lifecycle。

## 任务清单

### 3.1 ToolManager actor context

扩展 `ToolExecuteOptions`：

```typescript
callerAgent?: "main" | "kairos" | "team_member";
teamMember?: {
  sessionId: string;
  memberId: string;
  memberName: string;
  writeScope: WriteScope;
};
```

TeamMember 每次工具执行必须传 actor context。Leader 保持 `callerAgent:"main"`，但 Team write conflict 由 TeamRuntime port 在写工具执行前检查。

### 3.2 writeScope 守卫

在 ToolScheduler 权限检查前增加 `checkTeamWriteScope()`：

- readonly：拒绝 edit/write/delete；Bash 只允许新的只读命令集合。
- paths：edit/write/delete 的目标必须全部位于 paths 内。
- workspace：允许 workspace 内文件写入，仍走原有用户审批策略。
- 任意 scope 都不能扩大 workspace 边界或绕过已有 hard deny。
- Leader 写工具也要通过 TeamRuntime 的 active writer 冲突检查。

路径判断必须使用规范化绝对路径，禁止简单字符串前缀判断。

### 3.3 Bash 收紧策略

V1 使用保守、可测试的命令矩阵：

- 从 `command-rules.ts` 导出 `isReadOnlyDevelopmentCommand()`，只包含 `pwd`、`ls`、`git status`、`git diff`、版本查询等确认不写 workspace 的命令。
- readonly / paths 成员只允许该只读集合；其他 Bash 返回 deny，说明需要 workspace scope 或改用文件工具。
- workspace 成员复用现有 `bashCheckPermissions`、sandbox 和用户审核。
- `pnpm test/typecheck/build` 可能写缓存或产物，按 workspace 写命令处理。

这比静态猜测任意 shell 命令写入路径更保守，避免 V1 为 Bash 引入不可靠的副作用分析器。

### 3.4 writeScope 并发租约

- TeamRuntime 在成员开始写 Task 前登记 active writer。
- ToolScheduler 执行 edit/write/delete/Bash 前再次向 runtime port 校验当前成员仍持有写权限。
- paths scope 规范化后做相交检测。
- 冲突返回结构化 cancelled/blocked 结果，成员进入 waiting，不把它当普通工具错误反复重试。
- 成员停止、Task 完成、Task failed 时释放 active writer。

### 3.5 Approval actor metadata

扩展 `ToolApprovalRequest`、`PendingApprovalInfo` 和 stream event：

```typescript
actor?: {
  kind: "team_member";
  id: string;
  name: string;
};
```

- approval request 显示成员名称。
- approve/deny 仍由现有 PendingApprovalRegistry 根据 requestId 恢复原 Promise。
- 重复 decision 保持幂等。
- session 切换或应用恢复时不能自动执行过期 approval。

### 3.6 Prompt 与工具描述

Leader prompt 必须说明：

- Task 是唯一事实源。
- 何时启动成员，何时直接回答。
- 成员 idle 不等于完成。
- 用户可能直接指导成员，Leader 会收到 mirror notice。
- 完成前调用 `inspect_team`，满足条件后调用 `finalize_team_work`。

成员 addendum 必须说明：

- 普通文本其他成员不可见，协作必须 `send_message`。
- 任务完成必须 `update_task`。
- 不允许越过 writeScope。
- 收到用户直接消息时，范围变化要更新 Task 或请求 Leader。

## 测试要求

- Solo ToolManager 不注册 Team 工具。
- Leader 和成员拿到的工具集合严格不同。
- readonly 成员 edit/write/delete/Bash 写命令被拒绝。
- paths 成员范围内 edit/write 通过，范围外拒绝。
- workspace 成员仍触发原有 Bash/delete 审核。
- writeScope 冲突在模型工具执行前阻止写入。
- approval request 携带正确成员 actor，决策只恢复对应调用。
- 成员不能完成不属于自己的 Task。
- `send_message` 不修改 Task 状态。

## 验证命令

```bash
pnpm --filter @actspace/agent-core test -- src/team/tools/test
pnpm --filter @actspace/agent-core test -- src/tools/test/scheduler-approval.test.ts src/tools/test/bash.test.ts src/tools/test/edit-write.test.ts
pnpm --filter @actspace/agent-core typecheck
```

## 完成标准

- writeScope 和 actor 权限由 ToolScheduler 机械执行。
- TeamMember 无法通过 Bash 或文件工具绕过 scope。
- 现有 Main/Kairos caller 路径测试全部通过。

