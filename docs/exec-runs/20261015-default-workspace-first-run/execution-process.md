# 默认工作区改为首次启动兜底 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261015-default-workspace-first-run.md`
- **执行模式**：交互
- **开始时间**：2026-10-15 20:40
- **结束时间**：2026-10-15 22:46

## 执行时间线

### 步骤 1：调研与讨论

- **操作**：看了 DeepSeek Harness（首次启动建 `~/Documents/.../default-workspace`、登记成普通工作区）、Codex、opencode 对「没有项目就想聊天」的处理；和用户逐项确认 8 条决策（见计划）。
- **决定**：选 DSH 式「首次启动兜底」，不做欢迎页；旧会话不写删除逻辑，只是不显示。

### 步骤 2：shared 与 main（T1–T3）

- **操作**：`WorkspaceEntryKind` 收窄为 `"folder"`，去掉 `defaultWorkspaceId`；registry 读取时丢弃旧 `kind: "default"` 条目，合并会话后仍为空才 `mkdir -p` 兜底目录并登记「默认工作区」；空选择、缺 root 的访问一律拒绝；`defaultWorkspaceRoot` 改为 `<Documents>/ActSpace/default-workspace`。
- **影响文件**：`packages/shared/src/ipc.ts`、`apps/desktop/src/main/{index,workspace-registry-service,workspace-access}.ts` 及两份 main 单测。
- **验证**：重建 shared dist 后 `pnpm typecheck` 通过；两份 main 单测 20 条通过。

### 步骤 3：renderer（T4–T5）

- **操作**：兜底工作区从 `bootstrapState.workspaceRoot` 改为「registry 里按活跃度排第一的可见工作区」；隐藏/归档工作区没有可切会话时回到新建会话页；readiness 新增 `workspace-required`，Composer 本机目标也走 readiness；侧栏去掉默认分组和「不可移除」，没有路径也匹配不到工作区的本地会话（`isOrphanSession`）不显示。
- **影响文件**：`App.tsx`、`Composer.tsx`、`composer-run-context.ts`、`target/readiness.ts`、`Sidebar.tsx`、`sidebar/{session-grouping.ts,WorkspaceSection.tsx}`、`quick-open-routing.ts`、`ShortcutSettings.tsx`、mock。
- **验证**：typecheck 通过。

### 步骤 4：测试夹具（T6）

- **操作**：全量 vitest 首次 40 条失败，主要是夹具里的会话列表项没有 `workspaceRoot`，按新规则被当成旧会话隐藏；统一补 `/tmp/workspace`。其余按新行为改断言（readiness、「选择工作区」文案、默认工作区可移除）。
- **验证**：233 个文件 / 1884 条通过，7 条跳过（既有）。

### 步骤 5：浏览器 mock 验收与两处修复

- **操作**：新增 `?mock=no-workspace` 场景；用 headless Chromium 跑 `empty` 和 `no-workspace`。
- **验证**：`no-workspace` 发送按钮为「请先选择工作区」、工作区按钮显示「选择工作区」；`empty` 发一条消息后移除唯一工作区，回到「新建会话」页、0 个会话行、发送被拦截；无页面错误。

### 步骤 6：文档（T7）

- **影响文件**：`front-左侧会话栏规范.md`（旧会话归组、Archive All 落点、Remove from Sidebar、验收矩阵）、`FRONTEND_VERIFICATION.md`（mock 场景表）、本目录、history、计划索引。
- **验证**：`check:docs`、`check:current-docs` 通过。

## 遇到的问题

- **问题**：`app-worktree-create` 失败——会话目录还在重建（`sessions.listPage` 未返回）时找不到发送按钮。
  - **原因**：启动时用 `Promise.all` 同时等会话目录和工作区列表，目录没回来前 registry 一直是 null；以前有 `bootstrapState.workspaceRoot` 兜底所以看不出来，现在兜底依赖 registry，发送被 `workspace-required` 拦住。
  - **应对**：工作区列表返回后立即写入 state，不再等会话目录。
- **问题**：浏览器验收时，移除唯一工作区后侧栏仍显示它的空文件夹。
  - **原因**：侧栏会把分页列表（`sessions.listPage`）返回的分组补成空文件夹，而这些分组从未按已隐藏工作区过滤。这是旧问题，默认工作区可移除后更容易遇到。
  - **应对**：App 传给侧栏的分组过滤掉已隐藏工作区的本地分组；在「隐藏工作区」App 测试里加断言（不修时失败、修后通过）。
- **问题**：zsh 不对 `$files` 分词、BSD `grep -Z` 行为不同，批量 sed 失败。
  - **应对**：改用 `for f in $(grep -rl ...)` 逐个处理。

## 跳过或推迟的事项

- Electron 实机验收：需要真实数据目录，交给用户。
- 用户本地旧会话数据清理：按约定不写进代码，另行确认后手动清理。
