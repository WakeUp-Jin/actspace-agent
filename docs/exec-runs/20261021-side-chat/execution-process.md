# 侧边对话 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261021-side-chat.md`
- **执行模式**：交互
- **开始时间**：2026-10-21
- **结束时间**：2026-10-21 22:40

## 执行时间线

### 步骤 0：调研与方案

- **操作**：
  - 读了 Codex 本地源码（`/side`、`thread/fork`、`send_message`），以及 Cursor、Claude Code 的公开资料。
  - 梳理了本仓库现有的 fork、插件、会话目录和右栏结构。
  - 交互 Demo 经两轮修改后，用户确认。
- **影响文件**：
  - `docs/design-docs/frontend/side-chat-demo.html`
  - `docs/design-docs/collaboration/side-chat-design.md`
  - `docs/exec-plans/completed/20261021-side-chat.md`
- **决定**：
  - 「只读」复用 Plan 模式；
  - 标记用 `lineage.origin = "side-chat"`；
  - 边界提示走提示词扩展。

  理由见设计文档「被排除的方案」。

### 步骤 1：后端 B1–B5

- **操作**：
  - B1：`lineage.origin` 增加 `"side-chat"`，journal / persistence 测试补用例。
  - B2：新建 `packages/side-chat`。
    - `resolveSideChatBoundary`：主会话空闲时整段继承，运行中截到最后一个已平衡的 `turn/end`；前缀里有待领取的 inbox 消息时继续往前找。
    - 插件在 `session/created` 时给侧边会话注册边界提示，`session/disposed` 时移除。
  - B3：`AgentApplication.openSideChat`。
    - 先 flush 父会话，再算分叉点并 fork（origin `side-chat`）。
    - 父会话有工作区且不是 Chat 时切到 Plan。
    - 拒绝从侧边对话或子代理会话再分出。
  - B4：IPC `sessions.openSideChat` / `sessions.listSideChats`，guard、mock、registry。
  - B5：`SessionListItem.sideChatParentId` / `sideChatCount`。
    - SQLite 目录加 `side_chat_parent_id` 列：新库建表时带上，schema-9 旧库在打开时 `ALTER TABLE` 补列，不重建。
    - 分页查询排除侧边对话并带出数量；`paginateSessionSummaries` 同样处理。
    - `listSideChats` 直接用运行时会话列表按父 id 过滤。
- **影响文件**：
  - `packages/session/{journal,persistence}`、`packages/side-chat/`
  - `packages/agent-service/src/application.ts`、`packages/runtime/{cordis.yml,package.json,src/profiles/composition.ts}`
  - 根和 `apps/desktop` 的 `package.json`
  - `packages/shared/src/{ipc.ts,session-list-page.ts,runtime-v2/fixed-renderer.ts,desktop-bridge/contract.ts}`
  - `apps/desktop/src/main/{ipc/guards.ts,runtime-v2/*}`、`apps/desktop/src/renderer/mock/*`
- **验证**：
  - `@actspace/side-chat` 5 个测试、runtime 64、agent-service 34、boot 22、journal 20、persistence 46，全部通过；
  - `check-package-boundaries`、build graph `--check`、`check:ipc-channels`、desktop typecheck 通过；
  - desktop 相关测试 65 个通过。

### 步骤 2：前端 F1–F7

- **操作**：
  - F1：`App.tsx` 抽出 `sendToSession` / `abortSession` 和 `useSessionTranscript`，主会话改为调用它们。新增 `SideChatRuntimeContext`（send、abort、setMode、markRead、rename、retain），打开的侧边对话加入 cell 保留。
  - F2：`SessionProjectionScope(sessionId)` 用 `bridge.watch` 给非当前会话提供投影。
  - F3：`SideChatView`：分隔线 → 消息 → 空状态 → Composer（Plan 标签、权限控件、模型选择、上下文胶囊，不带消息队列）。新增 `useStickToBottom`；斜杠菜单 DOM id 改用 `useId`。
  - F4：右栏 `sideChat` tab，只显示当前主会话的侧边对话；运行中转圈、后台完成未读点；启动列表和 `+` 菜单加入口，「本会话的侧边对话 · 已收起」列表；tab 动词为「收起」。远端运行目标不显示入口。
  - F5：`/side [问题]`。菜单选中时插入 `/side `，发送前拦截；Chat 形态不提供；主会话运行中也可用。
  - F6：左侧会话栏隐藏侧边对话，主会话行显示 GitFork 图标和数量。
  - F7：mock 分叉截到最后一轮已完成的回复；新增 `side-chat` 场景（主会话第 4 轮运行中，两个已收起的侧边对话）；侧边会话用单独回复。
  - 追加：侧边对话第一次有问题时用 `sessions.rename` 把它写成标题，收起后的列表才认得出。
- **影响文件**：
  - `apps/desktop/src/renderer/{App.tsx,app/providers.tsx}`
  - `components/{Composer.tsx,RightPanel.tsx,composer-slash-commands.ts}`、`components/composer/{SlashMenu.tsx,composer-types.ts}`、`components/conversation/ConversationComposerSlot.tsx`
  - `components/right-panel/{RightPanelContext.tsx,RightPanelLauncherList.tsx,RightPanelObjectMenu.tsx,RightPanelTabStrip.tsx}`、`components/right-panel/side-chat/*`
  - `components/sidebar/{SessionRow.tsx,SidebarSessions.tsx}`
  - `session/{SessionProjectionContext.tsx,session-local-store.ts}`
  - `mock/{handlers.ts,mock-db.ts,stream-player.ts,scenarios/index.ts,scenarios/side-chat.ts}`
  - 测试：`right-panel-side-chat.test.tsx`、`side-chat-transcript.test.ts`、`session-projection-scope.test.tsx`（新增），以及 composer、slash 菜单、slash 命令、sidebar、mock-bridge 测试补用例
- **验证**：
  - `tsc`（`tsconfig.json`、`tsconfig.electron.json`）通过；
  - desktop vitest：245 文件，1986 项通过，7 跳过；
  - `check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge`、`check:ipc-channels`、`check:packages`、`check:desktop-build-graph` 通过；
  - 浏览器 `?mock=side-chat` 浅色、深色、480px 截图，无控制台错误（`screenshots/`）。

### 步骤 3：文档

- 更新右侧面板、slash 命令、聊天输入框、左侧会话栏、preload bridge 与 mock 规范，`FRONTEND_VERIFICATION.md`（场景、矩阵和 Electron 7 步），`design-docs/index.md`。
- `pnpm gen:contract-matrix` 重新生成插件契约矩阵（含 `@actspace/side-chat`）。
- 计划移到 `completed/`，写 history。

## 遇到的问题

- Cordis Loader 按仓库根解析插件包名（`ERR_MODULE_NOT_FOUND`）。和 english-learning 一样，在根 `package.json` 和 `apps/desktop/package.json` 加依赖。
- 用量目录 schema 版本不一致时会走「重建」路径，不能简单升版本号。改为打开时按列补齐（主表和两张 staging 表都补，保证 `SELECT *` 列序一致）。
- 集成测试在 jsdom 默认窄宽度下，打开右栏会自动收起侧栏。测试里把 `innerWidth` 设为 1800。
- 重新打开已收起的侧边对话时，region 名还是「侧边对话 N」。原因是分叉时标题从主会话复制，被当成了「没有自己的标题」。改为 `sideChatOwnTitle` 优先，并在第一条问题出现时写回标题。
- `check:frontend-tokens` 报 `SideChatView` 里两个原生 `<button>`，换成 ui `Button`。
- 浏览器截图脚本在 480px 下找不到侧栏行：先在 1440 宽打开再缩窗截图。

## 与计划的偏差

- 「只读」用 Plan 模式实现：Demo 里「只读 / 需审批 / 自动执行」下拉改为 Plan 标签加现有权限控件。
- 远端运行目标通过 `available: isLocalTarget` 隐藏入口，没有走 `capabilitiesOf`。
- 重新打开的 tab 分隔线只显示「继承主会话 N 轮」，不带「不含进行中」后缀（重开时没有分叉当时的运行状态）。
- 侧边对话的 Composer 显示的是主会话的运行目标（`RunTargetContext`）。
- `ConversationView` 没有改用 `useStickToBottom`，只有侧边对话用。
- 计划里的 `side-chat-view.test.tsx` 改成 App 级集成测试 `right-panel-side-chat.test.tsx`，覆盖面更大。
- 新增标题写回（`sessions.rename`），计划里没有。
- `/side` 在主会话运行中仍可用（分叉本来就只带已结束的轮次）。
- 未做 `+` 菜单 Esc / 焦点回到触发器的手工键盘检查。
