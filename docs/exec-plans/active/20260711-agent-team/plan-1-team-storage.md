# Plan 1：Team 文件存储、锁与恢复原语

状态：待执行

依赖：Plan 0

产物消费方：Plan 2-6

## 目标

在 `agent-core` 建立不依赖 Electron 的 Team 存储层，实现成员预设、Team 模板、配置快照、runtime state、Task、Mailbox 和成员 transcript 的安全文件读写，为多成员并发和应用恢复提供确定性基础。

## 附加必读

- `docs/design-docs/agent-form-team.md`
- `docs/design-docs/core-storage-and-observability.md`
- `packages/agent-core/src/persistence/jsonl.ts`
- `packages/agent-core/src/persistence/session-store.ts`
- `packages/agent-core/src/tools/tools/shared/write-atomic.ts`
- `packages/agent-core/src/kairos/storage/notification-store.ts`

## 允许修改的文件

- `packages/agent-core/src/team/index.ts`（新增）
- `packages/agent-core/src/team/storage/paths.ts`（新增）
- `packages/agent-core/src/team/storage/file-lock.ts`（新增）
- `packages/agent-core/src/team/storage/json-file.ts`（新增）
- `packages/agent-core/src/team/storage/member-preset-store.ts`（新增）
- `packages/agent-core/src/team/storage/team-template-store.ts`（新增）
- `packages/agent-core/src/team/storage/runtime-store.ts`（新增）
- `packages/agent-core/src/team/storage/task-store.ts`（新增）
- `packages/agent-core/src/team/storage/mailbox-store.ts`（新增）
- `packages/agent-core/src/team/storage/transcript-store.ts`（新增）
- `packages/agent-core/src/team/storage/test/*.test.ts`（新增）
- `packages/agent-core/src/index.ts`（追加导出）
- 对应文档和 history

不得接入 desktop IPC、LLM 或 renderer。

## 路径契约

`createTeamStorePaths(dataRoot, sessionId)` 返回：

```text
<dataRoot>/agent-forms/
├── member-presets/
├── teams/
└── runtime/<sessionId>/
    ├── team-config.json
    ├── team-state.json
    ├── tasks/.highwatermark
    ├── tasks/<taskId>.json
    ├── inboxes/leader.json
    ├── inboxes/<memberId>.json
    └── transcripts/<memberId>.jsonl
```

所有 sessionId、memberId、presetId、templateId、taskId 都必须经过安全 path segment 校验。

## 任务清单

### 1.1 文件锁和原子 JSON 写入

- 实现 `withTeamFileLock(targetPath, fn)`。
- 锁文件使用 `${targetPath}.lock`，通过 `open(..., "wx")` 获取。
- 重试：10 次，5ms 起步，最大 100ms。
- 锁文件记录 pid、createdAt 和随机 owner ID。
- 锁 mtime 超过 30 秒视为 stale；删除前重新 stat，避免删掉刚更新的锁。
- finally 必须释放自己 owner ID 对应的锁。
- JSON 写入使用同目录唯一 tmp 文件 + rename，禁止多个写入者共享固定 `.tmp`。

测试：并发 20 次 append/update 不丢数据；异常 throw 后锁可释放；stale lock 可恢复。

### 1.2 成员预设与 Team 模板 Store

实现：

- `listMemberPresets()` / `readMemberPreset()` / `saveMemberPreset()` / `deleteMemberPreset()`。
- `listTeamTemplates()` / `readTeamTemplate()` / `saveTeamTemplate()` / `deleteTeamTemplate()`。
- built-in 项不允许删除；编辑 built-in 时返回明确错误，UI 通过复制产生用户版本。
- 保存 TeamTemplate 前验证引用的 preset 均存在、成员名称不重复、TierBinding 同 provider。

### 1.3 Team runtime 初始化和快照

实现 `initializeTeamRuntime()`：

1. 读取 TeamTemplate。
2. 读取全部 MemberPreset。
3. 生成 `TeamConfigSnapshot`。
4. 创建 runtime 目录。
5. 写入 `team-config.json` 和初始 `team-state.json`。
6. 初始化 `leader.json` Inbox 与 tasks highwatermark。

该操作必须幂等：同一 session 已初始化时只读取，不覆盖运行状态。

### 1.4 TaskStore

实现：

- `createTask()`：列表锁内递增 highwatermark。
- `getTask()` / `listTasks()`。
- `updateTask()`：Task 文件锁内执行 compare-and-update。
- `claimTask()`：原子检查 status、owner、blockedBy、成员忙碌状态和 expected assignmentVersion。
- `assignTask()`：只作为 store 内部原语；模型工具仍统一叫 `update_task`。
- `completeTask()`：强制 owner 和 assignmentVersion 匹配，并要求 result/resultRefs。
- `retryTask()`：failed → pending，清 owner/lease，retryCount + 1，assignmentVersion + 1。
- `releaseExpiredLeases(now)`。
- 依赖环检测；拒绝自依赖和间接环。

Task 更新返回最新完整 Task，不返回调用方传入的旧对象。

### 1.5 MailboxStore

实现：

- `appendMessage(inboxOwnerId, messageWithoutRead)`。
- `listUnreadMessages(inboxOwnerId)`。
- `markMessagesRead(inboxOwnerId, messageIds)`。
- `pruneReadMessages(inboxOwnerId, keepLast=100)`。

规则：

- 文件是 JSON 数组，不是 JSONL。
- append 和 mark read 都在同一 Inbox 文件锁内重读最新数组。
- 新消息固定 `read:false`。
- 标记已读按 message ID，不按数组 index，避免并发 append 后 index 漂移。
- prune 保留全部 unread 和最近 100 条 read。

### 1.6 TranscriptStore

- `appendMemberEvents(memberId, events)` 复用现有 JSONL append 格式。
- `readMemberTranscript(memberId)` 对坏行容错，并返回 parse errors。
- transcript 中 event.sessionId 使用父 sessionId；turnId 使用稳定的 member turn ID。
- 不把成员 transcript 混写进主 `session.jsonl`。

## 测试要求

- highwatermark 在并发创建 Task 时无重复 ID。
- 两个成员同时 claim 同一 Task 只有一个成功。
- 旧 assignmentVersion completion 被拒绝。
- 依赖环被拒绝。
- 过期 lease 正确释放，completed Task 不被释放。
- Mailbox 多写者不丢消息，mark read 不误标新追加消息。
- Inbox prune 不删除 unread。
- transcript 坏行不阻塞其他事件恢复。
- 非安全 path segment 被拒绝。

## 验证命令

```bash
pnpm --filter @actspace/agent-core test -- src/team/storage/test
pnpm --filter @actspace/agent-core typecheck
```

## 回退策略

本阶段尚未接入真实 session。若 Store 设计失败，删除新增 `team/` 目录和导出即可，Solo 路径不受影响。不得为兼容未发布格式编写迁移脚本。

## 完成标准

- 所有 Team 文件操作都通过 Store，不允许 Plan 2-5 直接 `readFile/writeFile` Team 路径。
- 并发 Task/Mailbox 测试稳定重复通过。
- 初始化和恢复不依赖 Electron 或 renderer。

