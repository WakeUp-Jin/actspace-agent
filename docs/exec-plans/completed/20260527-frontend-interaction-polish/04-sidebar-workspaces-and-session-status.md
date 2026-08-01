# 04 Workspaces 添加项目与会话状态按钮

## 目标

完成 `#12` 和 `#18`。Workspaces 父级的添加项目按钮不再无响应，第一版通过目录选择并创建该 workspace 下的新会话，让列表出现项目名；会话列表项旁的状态按钮可区分 idle、running、waiting_approval、failed、scheduled，并可点击查看简短详情。

这一轮需要先收清 Workspaces 的产品语义：**添加的是一个项目目录 / workspace root，但列表里展示的仍然是 session 分组**。第一版没有独立 Workspace 实体，因此选择目录后必须创建该目录下的首个 session；如果只保存一个空目录，左侧没有可展示、可选中的对象。

## 范围

包含：

- Workspaces 父级 `FolderPlus` 按钮接入目录选择。
- 选择目录后创建新 session，并带 `workspaceRoot`；该 session 刷新后出现在 Workspaces 下对应项目文件夹里。
- 取消目录选择时 UI 无副作用。
- 单个 workspace 文件夹本身点击只负责展开 / 折叠；进入工作内容仍通过其下 session 完成。
- 单个 workspace 文件夹右侧 `Plus` 在该 workspaceRoot 下创建新 session。
- 会话行展示状态按钮或状态点，状态至少覆盖 `idle`、`running`、`waiting_approval`、`failed`、`scheduled`。
- 点击状态按钮展示简短状态菜单或详情。
- 状态按钮不挤压会话标题和时间，键盘可访问。

不包含：

- 不新增独立 Workspace 数据模型。
- 不支持空 workspace 文件夹；没有 session 的目录不会单独显示在列表中。
- 不把 workspace 文件夹点击做成 workspace 首页 / 文件视图入口。
- 不做 workspace 重命名、排序、删除或拖拽。
- 不实现 Scheduled 真实定时任务；scheduled 只展示已有 mock 或后续契约能提供的状态。
- 不改 Bash 审核调度核心，只消费已有 pending approval 信息或 renderer 当前状态。

## 背景

相关文档：

- `docs/design-docs/frontend/front-左侧会话栏规范.md`
- `docs/design-docs/frontend/front-工作台布局与面板交互规范.md`
- `docs/FRONTEND_VERIFICATION.md`

相关代码路径：

- `packages/shared/src/ipc.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/components/Sidebar.tsx`
- `packages/desktop/src/renderer/test/sidebar.test.tsx`
- `packages/desktop/src/renderer/fixtures/workbenchFixture.ts`
- `packages/desktop/src/renderer/styles/index.css`
- `packages/desktop/src/renderer/styles/tokens.css`（仅在需要新增全局 token 时修改）

已知现状：

- 单个 Workspace 文件夹行右侧 `Plus` 已能调用 `onNewSession`，但不会指定 workspaceRoot。
- Workspaces 父级 `FolderPlus` 仍是 `coming soon`。
- `createSession({ workspaceRoot })` 契约已存在，main 会用传入 workspaceRoot 写入 session meta。
- 当前 `busySessionIds` 只能表达 active session running，不能表达 waiting approval / failed / scheduled。
- renderer 里的 workspace 分组目前只有 `key` / `label` / `sessions`，其中 default workspace 使用内部 sentinel key；实现单个 workspace `Plus` 时不能把该 sentinel 当真实路径传给 main，需要在 group view model 中保留 `workspaceRoot?: string`。

## 实施任务

### Step 1: 目录选择 IPC

- 新增目录选择 bridge，例如 `selectWorkspaceDirectory()`。
- main 使用 Electron dialog 选择目录，只允许目录。
- 取消时返回 null 或 cancelled result。
- preload 和 `global.d.ts` 同步暴露。

验收：

- Electron 下点击 Workspaces 添加按钮能打开目录选择器。
- 取消选择无副作用。

### Step 2: Workspaces 添加项目行为

- Sidebar 为 Workspaces 父级 `FolderPlus` 增加 `onAddWorkspace` 回调。
- Workspaces 父级添加按钮的语义是“选择项目目录并创建首个 session”，不是创建一个可为空的 workspace 实体。
- WorkbenchLayout / App 实现 `handleAddWorkspace`：
  - Electron 环境选择目录。
  - 成功后调用 `createSession({ title: "New chat", workspaceRoot })`。
  - 刷新 sessions，并选中新 session。
  - mock 环境添加 fallback workspace session。
- Sidebar / WorkbenchLayout / App 将 `onNewSession` 升级为可接收 `{ workspaceRoot?: string }`。
- 单个 workspace 文件夹右侧 `Plus` 创建该 workspace 下的新会话，而不是默认 workspace。
- Default workspace 的 `Plus` 不传内部 sentinel；可以不传 `workspaceRoot`，由 main 使用默认 `roots.workspaceRoot` 兜底。
- 点击 workspace 文件夹 icon 或名称仍只切换展开 / 折叠，不选中 session，也不打开新的 workspace-level 页面。

验收：

- 成功选择目录后左侧 Workspaces 出现项目名。
- 新建 session 的 `workspaceRoot` 为所选目录。
- 单个 workspace 文件夹右侧 `Plus` 新建出的 session 仍归在同一 workspace 分组下。
- 点击 workspace 文件夹名称不会创建 session、不会切换到未知页面，只改变展开 / 折叠状态。

### Step 3: 会话状态模型

- 在 renderer 定义轻量 `SessionUiStatus`，至少包含：
  - `idle`
  - `running`
  - `waiting_approval`
  - `failed`
  - `scheduled`
- 状态来源第一版：
  - active streaming session -> `running`
  - pending approval 信息 -> `waiting_approval`
  - mock / future fixture 可展示 `failed`、`scheduled`
  - 默认 -> `idle`
- 如需要在 shared 类型中长期暴露状态，先评估是否必须；第一版优先 renderer view model，避免扩大持久化契约。

验收：

- 当前运行会话、等待审核会话、失败会话能在 UI 上区分。

### Step 4: 状态按钮与详情菜单

- 会话 row 左侧 marker 或邻近位置改为可点击状态按钮，但保留 pin hover 交互不冲突。
- 点击状态按钮展示简短详情，例如 Running / Waiting approval / Failed / Scheduled。
- 菜单支持 Escape 或外部点击关闭。
- 键盘 focus-visible 明确。

验收：

- 状态按钮不会挤压 session title 和 time。
- 键盘可访问。

### Step 5: 测试

- 更新 `sidebar.test.tsx`：
  - Workspaces 父级添加按钮调用 `onAddWorkspace`。
  - 单个 workspace plus 带 group workspaceRoot。
  - 不同 status 渲染对应 class / aria label。
  - 状态按钮点击显示详情菜单。

## 风险

- 风险：状态按钮与现有 pin hover 叠层冲突。
  - 缓解：明确 marker 内状态和 pin 的切换规则，必要时把详情入口放在 title 行内稳定位置。
- 风险：新增 workspace 数据模型会扩大范围。
  - 缓解：只通过新建 session 形成 workspace 分组，不维护独立 workspace 列表。
- 风险：把 workspace group 的内部 key 误当真实路径传给 main，导致 default workspace 创建到 `__default__` 之类的伪路径。
  - 缓解：group view model 显式区分 `key` 和 `workspaceRoot?: string`；Default workspace 新建时不传 root。
- 风险：用户期待点击 folder 进入 workspace 文件视图。
  - 缓解：本计划把 folder 点击定义为折叠 / 展开；workspace-level view 需要单独产品语义和计划，不塞进本轮。
- 风险：pending approval 来源可能异步更新。
  - 缓解：第一版可在打开状态菜单时查询，或沿用 streaming event 状态；不要阻塞基本 UI。

## 验证方式

- `pnpm --filter @actspace/desktop test -- sidebar`
- `pnpm --filter @actspace/desktop typecheck`
- 浏览器 mock 验证 workspace fallback、状态按钮和菜单。
- Electron 真实验证目录选择、取消选择、创建后 session list 刷新。

## 进度记录

- [ ] 完成目录选择 IPC。
- [ ] 完成 Workspaces 父级添加项目行为。
- [ ] 完成单个 workspace plus 传递 workspaceRoot。
- [ ] 确认 workspace folder 点击只折叠 / 展开，不承担进入 workspace 的语义。
- [ ] 完成会话状态 view model。
- [ ] 完成状态按钮和详情菜单。
- [ ] 完成测试和 Electron 真实验证。

## 决策记录

- 2026-05-28：Workspaces 第一版不新增独立实体，只通过 `SessionMeta.workspaceRoot` 和 `createSession({ workspaceRoot })` 形成真实列表效果。
- 2026-06-02：确认 Workspaces 父级添加按钮选择的是项目目录，但落地必须创建该目录下的首个 session；workspace folder 本身点击只折叠 / 展开，不作为 workspace 首页入口。
