# 左侧会话栏向 Cursor 对齐执行计划

## 目标

把 `packages/desktop` 的左侧会话栏向 Cursor 桌面端侧边栏对齐：视觉密度、信息架构、状态点位置三层都做调整，并引入 **Workspaces 分组结构**（按本地仓库 cwd 自动归类），同时为后续的 `Lab` 和 `Usage` 页面预留占位入口。

## 范围

### 包含

- 顶部入口重构为 `New Agent / Lab / Usage` 三项，搜索按钮上移到顶栏（红绿灯右侧）作为图标按钮。
- 折叠按钮保持在左上角，紧邻红绿灯。
- 新增 `Pinned` 分区（跨 Workspace，行首蓝色状态点）。
- 把原本扁平的 `Chats` 分区改为 `Workspaces → sessions[]` 的两级结构；Workspace 名 = `path.basename(workspaceRoot)`。
- `Scheduled` 保留为顶层独立分区。
- 会话行状态点从行尾挪到行首，颜色用 `--color-brand`（蓝），表示「当前选中 + 有运行中 turn / 有待审批工具」。
- 每个分组超过 8 条用 `See more / See less` 折叠。
- Hover session 行时在右侧露出图钉小图标，可钉/取消钉。
- 底部 `Settings` 保持现状。
- `Lab` 和 `Usage` 点击切换到中间区的 `Coming soon` 占位页（保留 sidebar）。
- 后端 `SessionMeta` 增加 `workspaceRoot` 与 `pinned` 字段，创建 session 时写入当前 `workspaceRoot`，IPC 增加 `pinSession`。
- 设计文档 `docs/design-docs/frontend-ui/左侧会话栏规范.md` 重写。

### 不包含

- Workspace 的手动新建、重命名、拖拽迁移（后续 plan）。
- Lab、Usage 页面的真正功能实现（这一版只放占位页）。
- 账户卡片、Refer friends 卡片。
- 站内全局搜索面板的实际实现（只保留触发入口，行为暂沿用旧逻辑）。
- 状态点细化区分（未读、错误等），首版只区分 active 与 has-activity 两态。
- Rail 折叠态的视觉重做（保持当前实现，只确保新增元素在 rail 态隐藏正确）。

## 背景

### 相关文档

- `docs/design-docs/frontend-ui/左侧会话栏规范.md`（旧版，本计划完成后重写）
- `docs/design-docs/frontend-ui/index.md`
- `docs/design-docs/frontend-ui/工作台布局与面板交互规范.md`
- `docs/design-docs/storage-and-observability.md`

### 相关代码路径

- `packages/desktop/src/renderer/components/Sidebar.tsx`：需要重写
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`：需要接 `activeView`
- `packages/desktop/src/renderer/App.tsx`：管理 view 切换 + streaming/approval 聚合
- `packages/desktop/src/renderer/styles.css`：sidebar 段、新增 Lab/Usage 占位页样式
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`：mock 加 `workspaceRoot` 与 `pinned`
- `packages/desktop/src/main/index.ts`：传入 `workspaceRoot`，注册 `session:pin` IPC
- `packages/desktop/src/preload/index.ts`：暴露 `pinSession`
- `packages/desktop/src/global.d.ts`：补 `pinSession` 类型
- `packages/shared/src/session.ts`：`SessionMeta` 加 `workspaceRoot?: string` 与 `pinned?: boolean`
- `packages/shared/src/ipc.ts`：`SessionListItem` 同步增字段；新增 `SessionPinInput` / `SessionCreateInput.workspaceRoot`
- `packages/agent-core/src/persistence/session-store.ts`：创建写入 workspaceRoot；list 透出 workspaceRoot/pinned
- `packages/agent-core/src/persistence/meta.ts`：`updateMeta` 支持 `workspaceRoot` 与 `pinned`
- `packages/agent-core/src/persistence/types.ts`：`MetaUpdateFields` 同步

### 已知约束

- `BootstrapState.workspaceRoot` 已经存在，可以直接用于新建 session 时的默认值。
- `session.meta.json` 是用户可见的本地文件，新加字段保持可选，避免破坏旧 session 读取。
- Sidebar 是 `-webkit-app-region: drag` 的范围，新增按钮要显式标 `no-drag`。
- 设计原则约束（来自 `core-beliefs.md`）：保持 sidebar 轻量、紧凑文本风格，不要做成卡片导航。

## 风险

| 风险 | 缓解方式 |
|---|---|
| 修改 `SessionMeta` schema 可能影响已有 session 的反序列化 | 新字段都是 `optional`，老 meta 缺字段时 fallback 到「未分组」；旧 session 在 UI 上显示在专门的 `Default workspace` 分组 |
| `workspaceRoot` 来源唯一（启动时确定），用户改不了 | 这一版只支持自动归类；手动迁移留给后续 plan |
| 按 Workspace 分组后，多 Workspace 不存在时只会看到一组，效果和现在差别小 | 接受，至少为后续做好结构 |
| 顶部三个入口里 Lab/Usage 是占位，可能让用户误以为已有功能 | 占位页明确写 `Coming soon` 并解释将做什么 |
| 状态点从行尾换到行首会和现有点位约定不同 | 一并更新设计文档；测试覆盖切换的样式 |

## 里程碑

1. 数据契约改造（shared + agent-core + IPC）。
2. 前端结构重写（Sidebar + App view 切换 + fixture）。
3. 样式与占位页（styles.css + LabPage + UsagePage）。
4. 测试与文档（前端测试 + 设计文档 + index.md）。
5. 验证 + history 记录。

## 验证方式

### 命令

- `pnpm --filter @actspace/shared typecheck`
- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm --filter @actspace/agent-core test`
- `pnpm --filter @actspace/desktop typecheck`
- `pnpm --filter @actspace/desktop test`
- `pnpm --filter @actspace/desktop lint`（如有）

### 手工检查

- 浏览器 mock 启动后，sidebar 顶部能看到 `New Agent / Lab / Usage` 三入口和搜索按钮。
- Pinned 分区在有 `pinned: true` 的 mock session 时出现。
- Workspaces 分组按 `workspaceRoot` 的 basename 聚合；fixture 覆盖至少两个 workspace。
- 选中一条会话时，行首蓝点出现；非选中且 streaming 中的会话也亮点。
- 每个分组超过 8 条出现 `See more`，点击后展开剩余。
- Hover 任意 session 行，右侧出现图钉小图标；点击切换 pin 状态，刷新后保持。
- 点击 `Lab` 和 `Usage` 切换到 `Coming soon` 占位页，sidebar 仍然可见。
- 切回 chat（点击 `New Agent` 或任意 session）能正常回到会话视图。
- 折叠按钮收起后，sidebar 进 rail 态，新增元素正确隐藏。

### 观测检查

- 真实 Electron 启动 1 次（`pnpm dev:log`），创建一次 session，确认 `meta.json` 里多了 `workspaceRoot` 字段。
- 在 Sidebar 上 pin 一次 session，重启 app 确认 `pinned: true` 仍在。

## 进度记录

- [x] 完成 plan 落地（本文件）。
- [x] 完成 shared schema 改造。
- [x] 完成 agent-core 持久化改造。
- [x] 完成 main/preload IPC 改造。
- [x] 完成 fixture 调整。
- [x] 完成 Sidebar 重写。
- [x] 完成 Lab/Usage 占位页 + App view 切换。
- [x] 完成 styles.css 调整。
- [x] 完成前端测试。
- [x] 完成设计文档重写。
- [x] 完成 typecheck / test / lint 验证。
- [x] 完成 history 记录。

## 决策记录

- 2026-05-26：选择档位 A（视觉对齐）+ 结构性对齐（Workspaces 分组）的组合方案。Workspace 来源用 cwd 自动归类，不引入手动管理。Pinned 跨 Workspace、仅作用于会话。状态点表示「选中 + 运行中 / 待审批」二态合并。`Lab` 和 `Usage` 一期只放占位页。
