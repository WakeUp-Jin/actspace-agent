# Plan 4：Desktop main、preload、IPC 与 session 生命周期

状态：待执行

依赖：Plan 0-3

产物消费方：Plan 5、Plan 6

## 目标

把 TeamRuntime 接入 Electron 主进程：创建 Team session、管理全局预设/模板、按 session 恢复 runtime、为 Leader turn 注入 Team 工具、转发成员事件、处理用户直聊和应用退出 flush，同时保持 renderer 无文件系统权限。

## 附加必读

- `docs/design-docs/agent-turn-layers.md`
- `docs/design-docs/core-storage-and-observability.md`
- `docs/FRONTEND_VERIFICATION.md`
- `packages/desktop/src/main/agent-turn.ts`
- `packages/desktop/src/main/agent-runtime-context.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`

## 允许修改的文件

- `packages/desktop/src/main/team/team-runtime-registry.ts`（新增）
- `packages/desktop/src/main/team/team-ipc.ts`（新增）
- `packages/desktop/src/main/team/team-preset-service.ts`（新增或薄包装）
- `packages/desktop/src/main/team/test/*.test.ts`（新增）
- `packages/desktop/src/main/agent-turn.ts`
- `packages/desktop/src/main/agent-runtime-context.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/app-paths.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/shared/src/ipc.ts`（只允许契约修正，不重新发明类型）
- 对应文档和 history

## 任务清单

### 4.1 AppDataRoots 增加 agentFormsRoot

- 路径固定为 `<userData>/agent-forms`。
- `ensureDataDirectories()` 创建全局 preset/template 和 runtime 根目录。
- renderer 只从 BootstrapState 获取是否支持 Team，不暴露本地绝对 Team 文件路径。

### 4.2 Session 创建与 form 不可切换

- `session:create` 接收 Plan 0 的 `agentForm`。
- Solo 缺省行为不变。
- Team 创建时验证 template/tier binding，创建 session meta 后初始化 Team runtime snapshot。
- 初始化失败时删除刚创建但尚无 turn 的 session 目录，避免半成品 session 出现在 Sidebar。
- 不提供 form update IPC；切换 workspace 不改变 form。

### 4.3 TeamRuntimeRegistry

主进程维护：

```text
Map<sessionId, TeamRuntime>
```

职责：

- `getOrLoad(sessionId)`：读取 meta，只有 Team session 才加载。
- 为每个成员按 tier 创建 LLM service。
- 为每个成员创建受限 ToolManager 和 ApprovalGate。
- 转发 RuntimeStreamEvent 到 `agent:stream`。
- session archive/删除/应用退出时 shutdown runtime。
- registry 只保存活 runtime；文件 Store 才是恢复事实来源。

### 4.4 Leader turn 接入

`runAndPersistTurn()`：

- 读取 `SessionMeta.agentForm`。
- Solo 继续走原有 `createAgentForSession`。
- Team 获取 TeamRuntime port，把 Leader 工具注册进本轮 ToolManager，并向 system prompt 追加静态 Team coordination addendum 与动态轻量状态摘要。
- 动态摘要只包含成员状态、Task 列表摘要和未读协调通知，不注入成员完整 transcript。
- Leader turn abort 不默认终止全部成员；只 abort Leader 当前 turn。显式“停止全部”才调用 TeamRuntime shutdown。
- Team runtime 的成员事件在 Leader turn 外也可通过 `agent:stream` 推送。

### 4.5 Team IPC

注册：

- `team:get-state`
- `team:list-member-presets`
- `team:list-templates`
- `team:save-member-preset`
- `team:delete-member-preset`
- `team:save-template`
- `team:delete-template`
- `team:send-member-message`
- `team:stop-member`
- `team:update-member-scope`
- `team:get-member-transcript`

所有输入都验证 sessionId/memberId 与 Team session 归属。renderer 不能传任意文件路径。

### 4.6 Preload 与 global.d.ts

`window.actspace` 增加一组类型化 Team API。继续使用 invoke/on 模式，不暴露 `ipcRenderer`、fs 或 runtime 对象。

### 4.7 退出与恢复

- `before-quit` 在现有优雅关闭序列中 `await teamRuntimeRegistry.shutdownAll()`。
- 每个 runtime flush team-state 和 transcript，停止 timer。
- 强退超时沿用现有应用级兜底，不无限等待成员。
- 启动后不 eager 恢复全部 Team session；用户打开或 turn 到来时 lazy load。

### 4.8 日志

日志至少包含：

- sessionId、memberId、taskId、assignmentVersion。
- spawn/stop/lease expiry/writeScope conflict/approval wait/recovery。
- 不记录完整用户敏感消息、工具长输出或密钥。

## 测试要求

- Team session 创建成功后 meta 和 runtime snapshot 同时存在。
- 初始化失败不会留下可见半成品 session。
- 旧 Solo session 完全不创建 TeamRuntime。
- 同一 Team session 多次 getOrLoad 返回同一活 runtime。
- renderer 传跨 session memberId 被拒绝。
- 用户直聊 IPC 产生成员消息和 Leader mirror notice。
- before-quit 调用 shutdownAll，timer/disposer 被清理。
- Team Leader turn 注册 Team tools，Solo turn 不注册。

## 验证命令

```bash
pnpm --filter @actspace/desktop test -- src/main/team/test src/main/test/agent-runtime-context.test.ts
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/agent-core test
pnpm build
```

## 完成标准

- main 可以在没有 renderer 私有 mock 的情况下创建、运行、恢复 Team session。
- Team 事件能在 Leader turn 外实时到达 renderer。
- Solo IPC、turn、session 恢复无回归。
