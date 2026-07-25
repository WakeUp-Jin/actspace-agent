## [2026-05-26 21:35] | Task: 左侧会话栏向 Cursor 对齐（Workspaces 分组 + Pinned + Lab/Usage 占位）

### 🤖 Execution Context

- **Runtime**: Cursor IDE
- **Base Model**: claude-opus-4.7

### 📥 User Query

> 我很喜欢 Cursor 的左侧边栏，想把这个项目的侧边栏和 Cursor 对齐。要求：
> 1. 搜索按钮放到顶部左上角（红绿灯右侧）、折叠按钮也放左上角，只保留 New Agent / Lab / Usage 三个主入口（英文）。
> 2. 新增 Pinned 分区，跨 Workspace 显示；状态点从行尾挪到行首，颜色用品牌主色蓝（`--color-brand`）。
> 3. 结构性也要对齐：把扁平的 Chats 改成 Workspaces 文件夹结构，按当前 `workspaceRoot`（cwd）的 basename 自动归类，每个 Workspace 默认展开、超过 8 条折叠 See more/less。Scheduled 保持顶层独立。
> 4. Settings 保持现状，不加账户卡片。
> 5. Lab 和 Usage 这一版只放 Coming soon 占位页；Pin 用 hover 露出图钉小图标。
> 6. 一次性完成、不分阶段；行为档位选 B（一次性）。
>
> 然后又补一句：注意 design-docs 里的全局样式规范要统一。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/agent-core`、`packages/desktop`、`docs/design-docs/front-*`、`docs/exec-plans/active`

**Key Actions:**

- **数据契约引入 Workspace + Pin 概念**：`SessionMeta`（`packages/shared/src/session.ts`）和 `SessionListItem`（`packages/shared/src/ipc.ts`）补 `workspaceRoot?: string` 与 `pinned?: boolean` 两个可选字段；`SessionCreateInput` 增加 `workspaceRoot?`，新增 `SessionPinInput / SessionPinResult` IPC 类型；`MetaUpdateFields`（`packages/agent-core/src/persistence/types.ts`）同步两个字段。两字段保持 `optional` 以兼容旧 `meta.json`。
- **持久化层支持 Workspace + Pin**：`createMeta` 接受 `workspaceRoot` option、新 session 默认 `pinned: false`；`updateMeta` 支持改 `workspaceRoot` 与 `pinned`；新增 `setSessionPinned(sessionRoot, sessionId, pinned)`；`createSessionRecord` 把 `input.workspaceRoot` 透传到 meta；`listSessionRecords` 用显式 `if` 赋值（而不是条件 spread）来返回 `workspaceRoot/pinned`，绕开 TS 把 `pinned?: boolean` 推断成 `pinned?: true` 的字面量收窄问题。
- **主进程 IPC**：`session:create` handler 在 `input.workspaceRoot` 缺省时从 `BootstrapState.roots.workspaceRoot` 自动注入；新增 `session:pin` handler 调用 `setSessionPinned`。`preload/index.ts` 通过 `contextBridge` 暴露 `pinSession`，`global.d.ts` 的 `Window.actspace` 接口同步补齐。
- **Sidebar.tsx 完全重写**：顶部 chrome row 放折叠按钮 + 搜索按钮（图标级）；中间三主入口 `New Agent (⌘N) / Lab / Usage` 走「图标 + 文字」按钮风格；分区结构按 `Pinned → Scheduled → Workspaces` 渲染；Workspace 名 = `path.basename(workspaceRoot)`，缺字段 fallback 到 `Default workspace`；每个分组 8 条折叠 See more / See less；会话行行首加 `data-state` 状态点，选中态或 streaming/有待审批工具时点亮品牌蓝；行内 hover 露出 Pin/Unpin 图标，Pinned 区行尾固定显示 Unpin。
- **Lab/Usage 占位页**：新增 `PlaceholderView.tsx` 通用占位组件，`WorkbenchLayout.tsx` 增加 `SidebarView` 状态（`chat | lab | usage`），非 `chat` 视图隐藏右侧 Panel；`App.tsx` 维护 `busySessionIds`（从 `isStreaming` 推导）与 `handleTogglePin`，把回调 + view 一起下传给 Sidebar。
- **fixture 扩展**：`workbenchFixture.ts` 新增 `hoursAgo / daysAgo` 工具、把 mockSessions 扩到覆盖两个 Workspace（`agent-harness-dev`、`actspace-agent`）+ Pinned 双例 + Scheduled 一例，方便前端调试和测试覆盖。
- **样式按现有 token 体系补齐**：`styles.css` 新增 `.sidebar-chrome-row / .sidebar-chrome-button / .sidebar-primary-actions / .sidebar-primary-action`、Workspaces 分组头、行首状态点、Pin 按钮 hover 显隐、See more/less、Placeholder 占位页等样式；`.session-row` min-height 36px 与 `.sidebar-primary-action` 对齐；`.nav-section-label` 字号 13px 与 Cursor 视觉密度一致；`.sidebar-primary-actions` 加 `margin-top: 22px` 避让顶部 absolute 定位的 chrome row。
- **前端测试**：新增 `renderer/test/sidebar.test.tsx` 覆盖主入口渲染、Workspaces 分组、Pinned 区、See more/less、行首状态点、Pin/Unpin 回调；`app-streaming-user-message.test.tsx` 里所有 `window.actspace` mock 都补上 `pinSession: async () => ({ ok: true })`，避免类型不全。
- **持久化测试**：`persistence/test/meta.test.ts` 增加「创建时落 `workspaceRoot`」与「`updateMeta` 改 `pinned/workspaceRoot`」两个用例；`persistence/test/session-store.test.ts` 增加「`createSessionRecord` 透传 `workspaceRoot`」与「`setSessionPinned` 双向切换 + `listSessionRecords` 透出」两个用例。
- **文档同步**：写 `docs/exec-plans/active/sidebar-cursor-alignment.md` 作为 plan + 进度记录；重写 `docs/design-docs/frontend/front-左侧会话栏规范.md`（信息架构、顶部窗口控件、三主入口、Pinned / Scheduled / Workspaces 三分区、状态点 + Pin 图标交互、Rail 折叠态、后端契约、设计原则）；`docs/design-docs/frontend/README.md` 同步导航条目。

### 🧠 Design Intent (Why)

**为什么把 Workspace 作为结构性概念引入**：Cursor 的左栏直觉里有两层结构（侧栏窗口 vs 站内项目分组），而 actspace 现在还是扁平 Chats，时间一长就会跨多个仓库混在一起。结构性对齐比单纯换皮更有价值——但 Cursor 的 Workspace 是用户手动管理的，actspace 现阶段没有这个产品空间，所以**取 cwd 自动归类**：每个 session 创建时把当前 `BootstrapState.workspaceRoot` 写进 meta，前端按 `path.basename(workspaceRoot)` 聚合。旧 session 缺字段时自然 fallback 到 `Default workspace`，对历史数据零破坏。手动新建/重命名/拖拽 Workspace 留给后续 plan，这一版只先把数据结构打底。

**为什么状态点从行尾挪到行首**：原本行尾的状态点和右侧 hover 出的 Pin 图标会争同一个视觉位置；同时行首点更接近 macOS / iOS 通知圆点的语义，扫读时定位「有事的会话」更快。颜色统一用 `--color-brand` 蓝（项目主色），不再用之前的灰/橙这种 ad-hoc 颜色，保证一眼能跟其他次级 UI 区分开。状态目前只做「选中 + 有 streaming / 待审批工具」二态合并，没有再细分未读/错误等子状态——保留扩展空间，避免一次性把语义压得太死。

**为什么 Pin 用 hover 露出小图标而不是常驻按钮**：跟 sidebar 的「轻量紧凑」基调一致。行内常驻 Pin 按钮会让每行都多一个视觉重量，但 Pin 又是低频操作；hover 才出符合 Cursor / Linear 同款的渐进披露习惯。Pinned 分区里改为行尾常驻 Unpin（带 ⓘ 提示），让已 pin 的会话有「明显可解除」的视觉锚点。

**为什么 Lab/Usage 这一版只放占位**：用户明确说一次性完成包含这两个入口，但实际功能（Skill/Tool playground、用量统计）都是独立大块，跟 sidebar 改造没强依赖。这次先把入口和路由打通，占位页明确写 `Coming soon` + 概述将做什么，避免用户误以为已经能用；同时把 `WorkbenchLayout` 的 `SidebarView` 状态机抽出来，后续直接挂真正的页面组件即可。

**为什么 `listSessionRecords` 改成显式 if 赋值**：第一版用条件 spread `...(meta.pinned ? { pinned: meta.pinned } : {})` 时 TS 把字段类型推断成 `pinned?: true`（字面量类型 + optional），跟 `SessionListItem` 声明的 `pinned?: boolean` 不兼容，typecheck 直接红。改为 `if (meta.pinned) item.pinned = true;` 这种朴素写法，TS 不会再做字面量收窄。这条坑值得 history 留底——以后再有同类「条件加可选 boolean 字段」的代码可以避开。

**为什么前端要把 `busySessionIds` 拿到 App 层算**：状态点的判定依赖「某个 session 是否正在 streaming / 有待审批工具」，这两份信息分别在 streaming 控制器和 approval registry 里。如果在 Sidebar 内部各自订阅，状态会跨多个 hook 散落；放到 App 顶层用 Set 聚合下发，Sidebar 只看一个 Set，rendering 干净也好测。

### 📁 Files Modified

**数据契约 / 后端：**
- `packages/shared/src/session.ts`（SessionMeta 加 workspaceRoot/pinned）
- `packages/shared/src/ipc.ts`（SessionListItem / SessionCreateInput / SessionPinInput / SessionPinResult）
- `packages/agent-core/src/persistence/types.ts`（MetaUpdateFields）
- `packages/agent-core/src/persistence/meta.ts`（createMeta workspaceRoot + updateMeta 支持新字段）
- `packages/agent-core/src/persistence/session-store.ts`（createSessionRecord 透传 + listSessionRecords 显式赋值 + setSessionPinned）
- `packages/agent-core/src/persistence/index.ts`（export setSessionPinned）

**主进程 / preload / 类型：**
- `packages/desktop/src/main/index.ts`（session:create 注入 workspaceRoot、新增 session:pin handler）
- `packages/desktop/src/preload/index.ts`（暴露 pinSession）
- `packages/desktop/src/global.d.ts`（Window.actspace.pinSession 类型）

**渲染层：**
- `packages/desktop/src/renderer/components/Sidebar.tsx`（整体重写）
- `packages/desktop/src/renderer/components/PlaceholderView.tsx`（新增）
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`（SidebarView 状态、view 切换）
- `packages/desktop/src/renderer/App.tsx`（busySessionIds + handleTogglePin + 传 props）
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`（mockSessions 扩展 workspaceRoot/pinned，Pinned/Scheduled/2 个 Workspace 覆盖）
- `packages/desktop/src/renderer/styles.css`（sidebar 顶部 chrome row、主入口、行首状态点、Pin 按钮显隐、Workspaces 分组、See more、Placeholder 占位页）

**测试：**
- `packages/agent-core/src/persistence/test/meta.test.ts`（workspaceRoot / pinned 用例）
- `packages/agent-core/src/persistence/test/session-store.test.ts`（createSessionRecord + setSessionPinned + listSessionRecords 用例）
- `packages/desktop/src/renderer/test/sidebar.test.tsx`（新增，覆盖主入口 / 分组 / Pinned / See more / 状态点 / Pin 回调）
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`（mock window.actspace 补 pinSession）

**文档：**
- `docs/exec-plans/active/sidebar-cursor-alignment.md`（新增 execution plan + 进度记录）
- `docs/design-docs/frontend/front-左侧会话栏规范.md`（整体重写）
- `docs/design-docs/frontend/README.md`（导航更新）

### ✅ Verification

- `pnpm typecheck`：3 个 workspace 全部通过（shared / agent-core / desktop，desktop 还跑了 `tsconfig.electron.json`）。
- `pnpm test`：agent-core 33 文件 / 262 用例通过，desktop 3 文件 / 20 用例通过（含新增的 `sidebar.test.tsx` 6 例）。
- `pnpm check:docs`：文档骨架检查通过。
- Vite 浏览器 mock 验证：手工在浏览器（CDP）确认 sidebar 顶部 chrome row 与三主入口不再重叠（primary-actions margin-top 22px 生效），Workspaces 分组按 fixture 数据聚合到 `agent-harness-dev` / `actspace-agent` 两组，Pinned 区行首蓝点常驻、Settings 留在底部。
- 已知风险：本次没跑真 Electron 启动验证 `meta.json` 落盘行为，留待下一轮联调（plan 已记录观测检查项）。

### 🔮 Follow-ups

- Lab / Usage 占位页要接真页面（Skill/Tool playground、用量统计），路由钩子已经留好。
- Sidebar 当前没有「手动新建/重命名/迁移 Workspace」的入口，多仓库场景目前完全靠 cwd 自动归类，等用户反馈再决定要不要做手动管理。
- 全局搜索面板这次只放了入口按钮，行为暂沿用旧逻辑；后续可以接入跨 session 搜索。
- Rail（折叠）态目前只确保新元素隐藏正确，没有重做折叠态的视觉，下一轮 sidebar 调整时一并打磨。
- 真 Electron 端联调一次：创建 session → 看 `meta.json` 里 `workspaceRoot/pinned` 是否落盘正确；pin 一次 session 后重启 app 看是否仍 pinned。
