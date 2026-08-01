# Workspace Registry 持久化执行计划

## 目标

把当前由 session list 临时推断出来的 Workspaces，收敛为一个稳定的本地注册表：`<dataRoot>/workspaces.json`。左侧 Workspaces 分组和 Composer 初始态 workspace selector 都从这份注册表读取；每个 session 仍由自己的 `meta.json` 保存归属。默认工作区改为用户确认的 Downloads 路径，顶部 chrome 的 workspace 下拉移除。

## 范围

- 包含：
  - 设计并落地 `<dataRoot>/workspaces.json` schema。
  - 新增 workspace registry main service，负责初始化、读取、迁移和最小写入。
  - 新增 shared IPC 类型、main IPC、preload bridge、renderer global 类型。
  - App 启动时读取 workspace registry，并把同一组选项传给 Sidebar 和 Composer。
  - 移除 `WindowChromeBar` 顶部 workspace select。
  - 让左侧 Workspaces 显示 registry 中所有 workspace；没有 session 的 workspace 也显示。
  - Composer 初始态 workspace selector 使用 registry 列表，不再从 session list 临时拼。
  - 更新存储设计文档、前端侧栏/Composer 相关设计文档和 history。
- 不包含：
  - 不做 workspace 重命名、删除、排序拖拽 UI。
  - 不做批量迁移所有旧 session meta 的破坏性写回；旧 session 读取时按 `workspaceRoot` 兼容匹配。
  - 不把每个 workspace 下的 session id 列表写入 `workspaces.json`。
  - 不改 Agent 工具执行根目录的核心语义；仍以 session 当前 workspace 归属决定 turn 根目录。

## 背景

- 相关文档：
  - `docs/REPO_COLLAB_GUIDE.md`
  - `docs/ARCHITECTURE.md`
  - `docs/design-docs/core-beliefs.md`
  - `docs/design-docs/core-storage-and-observability.md`
  - `docs/FRONTEND_VERIFICATION.md`
- 相关代码路径：
  - `packages/shared/src/ipc.ts`
  - `packages/shared/src/session.ts`
  - `packages/desktop/src/main/index.ts`
  - `packages/desktop/src/preload/index.ts`
  - `packages/desktop/src/global.d.ts`
  - `packages/desktop/src/renderer/App.tsx`
  - `packages/desktop/src/renderer/components/Sidebar.tsx`
  - `packages/desktop/src/renderer/components/Composer.tsx`
  - `packages/desktop/src/renderer/components/ConversationView.tsx`
  - `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
  - `packages/desktop/src/renderer/components/WindowChromeBar.tsx`
  - `packages/agent-core/src/persistence/session-store.ts`
- 已知约束：
  - renderer 不能直接访问文件系统，workspace registry 必须通过 preload + IPC 读取。
  - `userData` 目录是应用数据事实来源；macOS 当前为 `~/Library/Application Support/actspace/`。
  - session 的会话事实来源仍是 `sessions/<sessionId>/meta.json` 和 `session.jsonl`。
  - 用户确认 Default workspace 可以指向 `/Users/wakeup-jin/Downloads`。

## `workspaces.json` Schema

文件路径：

```text
<dataRoot>/workspaces.json
```

建议内容：

```json
{
  "version": 1,
  "defaultWorkspaceId": "default",
  "items": [
    {
      "id": "default",
      "kind": "default",
      "label": "Default workspace",
      "path": "/Users/wakeup-jin/Downloads",
      "order": 0,
      "createdAt": "2026-06-02T00:00:00.000Z",
      "updatedAt": "2026-06-02T00:00:00.000Z"
    },
    {
      "id": "ws_actspace_agent",
      "kind": "folder",
      "label": "actspace-agent",
      "path": "/Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent",
      "order": 1,
      "createdAt": "2026-06-02T00:00:00.000Z",
      "updatedAt": "2026-06-02T00:00:00.000Z"
    }
  ]
}
```

类型边界：

- `version`: 当前固定为 `1`。
- `defaultWorkspaceId`: 默认 workspace 的稳定 id，初始为 `default`。
- `items[].id`: renderer 和 session 归属可引用的稳定 id。`default` 固定；folder 可以用路径派生 slug/hash，避免 label 改名导致断链。
- `items[].kind`: `"default" | "folder"`。
- `items[].label`: UI 显示名。folder 默认取路径 basename。
- `items[].path`: 真实绝对路径。Default workspace 初始为 `/Users/wakeup-jin/Downloads`。
- `items[].order`: UI 排序。Default 固定最前，其余按首次注册顺序。
- `createdAt` / `updatedAt`: 本地审计与后续设置页管理使用。

不存 `sessionIds`。会话列表从 `sessions/*/meta.json` 派生：每个 session 自己保存归属，避免 registry 和 session meta 双写不一致。

## Session 归属设计

目标形态：

```json
{
  "id": "session-...",
  "title": "Learning doc plan",
  "workspaceId": "default",
  "workspaceRoot": "/Users/wakeup-jin/Downloads"
}
```

实施方式：

- 在 `SessionMeta` 中新增可选 `workspaceId?: string`。
- 新创建 session 时：
  - 如果用户选择 Default workspace：写 `workspaceId: "default"` 和 `workspaceRoot: "/Users/wakeup-jin/Downloads"`。
  - 如果用户选择普通 folder：写对应 `workspaceId` 和 `workspaceRoot`。
- 旧 session 兼容：
  - 如果有 `workspaceId`，优先按 id 匹配 registry。
  - 如果没有 `workspaceId` 但有 `workspaceRoot`，按 path 匹配 registry。
  - 如果都没有，归到 `defaultWorkspaceId`。
- 不在本计划里批量改写所有旧 session；只在 session 创建、发送前 workspace 迁移、后续明确用户操作时写当前 session。

## 风险

- 风险：Default workspace 与 `actspace-agent` 路径曾经相同，按 path 去重会吞掉 `actspace-agent`。
  - 缓解方式：registry item 按 `id` 保留；UI 展示 registry items，不再只从 path map 推断。
- 风险：`workspaces.json` 损坏导致 UI 无法显示 workspace 列表。
  - 缓解方式：main service 读取失败时返回内置 default + 从 session meta 派生的 fallback，并把错误写 main log；必要时原文件保留不覆盖。
- 风险：session meta 和 registry path 不一致。
  - 缓解方式：读取时优先 `workspaceId`，缺 id 时 path 兼容；发送 turn 时以 resolved workspace entry 的 path 写入 session meta。
- 风险：Downloads 默认路径在不同平台不同。
  - 缓解方式：main 侧使用 `app.getPath("downloads")` 初始化 default path，而不是硬编码平台路径；测试中使用注入 roots/fakes。
- 风险：移除顶部 chrome select 可能影响已有测试。
  - 缓解方式：更新测试目标到 Composer 初始态 selector；顶部 chrome 只保留标题。

## 里程碑

1. 契约与 main service
   - 在 `packages/shared/src/ipc.ts` 增加 `WorkspaceEntry`、`WorkspaceRegistry`、`WorkspaceListResult`。
   - 在 `packages/shared/src/session.ts` 给 `SessionMeta` 增加 `workspaceId?: string`。
   - 新增 `packages/desktop/src/main/workspace-registry-service.ts`。
   - 初始化逻辑：
     - default item 使用 `app.getPath("downloads")`。
     - 当前 `roots.workspaceRoot` 注册为 folder item。
     - 扫描现有 session summaries/meta，把 `workspaceRoot` 非空且不重复的路径注册为 folder item。
   - 验证：main service 单测覆盖初始化、损坏 fallback、旧 session path 迁移。

2. IPC 与 preload
   - `main/index.ts` 注册 `workspace:list`。
   - `preload/index.ts` 暴露 `listWorkspaces()`。
   - `global.d.ts` 补 `window.actspace.listWorkspaces`。
   - 验证：类型检查通过；renderer 测试 mock 补齐 bridge。

3. Session 创建与迁移
   - `SessionCreateInput` 增加 `workspaceId?: string`。
   - `SessionWorkspaceInput` 增加 `workspaceId?: string`，保留 `workspaceRoot` 兼容。
   - `createSessionRecord()` / `setSessionWorkspace()` 支持写 `workspaceId`。
   - `agent-turn.ts` 仍使用 session meta resolved path 作为 turn workspace root。
   - 验证：`session-store.test.ts` 覆盖 `workspaceId + workspaceRoot` 写入与保留。

4. Renderer 数据流
   - `App.tsx` 启动后调用 `listWorkspaces()`。
   - `workspaceOptions` 从 registry 派生，不再从 sessions 临时推断。
   - 当前选中值改为 workspace id 或包含 id/path 的轻量对象，避免 path 去重吞项。
   - 选择 Composer workspace 只更新本地 selected workspace；发送时才写 session meta，然后 run turn。
   - 验证：`app-streaming-user-message.test.tsx` 覆盖“选择不立即写、发送时才写 workspaceId/path”。

5. UI 收口
   - `WindowChromeBar.tsx` 移除 workspace select 和相关 props。
   - `WorkbenchLayout.tsx` 不再向 WindowChromeBar 透传 workspace props。
   - `Sidebar.tsx` 从 registry items 渲染 Workspaces 文件夹；每组 session 由 session summaries 按 `workspaceId/path` 派生。
   - `Composer.tsx` 初始态 selector 显示 registry 列表：`Default workspace`、`wakeup-Jin-wiki`、`code-tool-work`、`actspace-agent` 等。
   - 验证：`sidebar.test.tsx`、`composer.test.tsx` 覆盖空 workspace 显示、Default 与 actspace-agent 不互吞、Composer 下拉完整。

6. 文档、history 与验收
   - 更新 `docs/design-docs/core-storage-and-observability.md` 的 Workspace Root 边界。
   - 更新左侧侧栏/Composer 相关前端设计文档。
   - 更新或补充 `docs/histories/2026-06/`。
   - 运行验证命令和真实 Electron 窗口观察。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/desktop exec vitest run src/main/test/workspace-registry-service.test.ts`
  - `pnpm --filter @actspace/agent-core exec vitest run src/persistence/test/session-store.test.ts`
  - `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/composer.test.tsx src/renderer/test/sidebar.test.tsx src/renderer/test/app-streaming-user-message.test.tsx`
  - `pnpm --filter @actspace/desktop typecheck`
- 浏览器 mock 检查：
  - 打开 `http://127.0.0.1:5173/`。
  - 确认顶部 chrome 没有 workspace 下拉。
  - 初始 Composer selector 展示 registry items。
- Electron 真实检查：
  - 启动/复用 Electron 窗口。
  - 确认左侧 Workspaces 包含 `Default workspace`、`wakeup-Jin-wiki`、`code-tool-work`、`actspace-agent`。
  - 确认 Composer 初始态下拉包含同一组。
  - 选择 workspace 后不立即迁移 session；发送消息前才写 session meta。
- 文件检查：
  - `<dataRoot>/workspaces.json` 存在。
  - default item path 为 `app.getPath("downloads")` 对应路径。

## 进度记录

- [x] 确认 Default workspace 现状：当前由 `BootstrapState.workspaceRoot` fallback 得来，本机为仓库根目录。
- [x] 确认目标语义：Default workspace 指向 Downloads；workspace 列表写入 `<dataRoot>/workspaces.json`；session 列表不写进 registry。
- [ ] 完成契约与 main service。
- [ ] 完成 IPC/preload/global 类型。
- [ ] 完成 session meta `workspaceId` 兼容写入。
- [ ] 完成 renderer 数据流和 UI 收口。
- [ ] 完成测试、文档和真实窗口验收。

## 决策记录

- 2026-06-02：`workspaces.json` 只存 workspace registry，不存 `sessionIds`。原因是 session 归属已经由每个 session 的 `meta.json` 持久化，双写 session 列表会引入不一致风险。
- 2026-06-02：Default workspace 作为真实 registry item 存在，path 使用 Downloads。原因是它需要在 UI 中稳定显示，并作为旧 session / 无显式 workspace session 的归属。
- 2026-06-02：移除顶部 chrome workspace select，仅保留 Composer 初始态 selector。原因是顶部 select 造成重复入口，用户明确不需要。
- 2026-06-02：旧 session 不做批量破坏性迁移，读取时兼容 `workspaceRoot`，后续写入当前 session 时补 `workspaceId`。原因是降低本地数据风险。
