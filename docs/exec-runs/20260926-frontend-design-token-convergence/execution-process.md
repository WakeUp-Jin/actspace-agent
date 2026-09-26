# 前端设计 token 收口与视觉修复 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260926-frontend-design-token-convergence.md`
- **执行模式**：交互
- **开始时间**：2026-09-26
- **结束时间**：2026-09-26（代码与文档完成；Electron 验收待用户）

## 执行时间线

### 步骤 0：开工确认

- **操作**：用户确认 D1–D5 全部按推荐方案，T12 采用方案 B（迁移全部按钮常量）。Chat/Composer 在飞改动已在 `0d55d26` 提交，4 个锁定文件解除。在 HEAD 重新统计写死值：字号 537、默认字号类 72、圆角 41、z-index 31、时长 68、冷色阴影 10，与计划基本一致。
- **决定**：T5 与各任务中 Composer 的部分不再后置，按顺序一起做。

### 步骤 1：T1 样式快照工具

- **操作**：`tools/style-snapshot.mjs`，headless Chromium 经 CDP 打开 9 个设置 section 与 8 个 fixture（浅 / 深），记录每个可见元素的字号、行高、字重、四角圆角、阴影、z-index、过渡与动画时长、颜色、尺寸，并整页截图；`diff` 模式按 DOM 路径比较。
- **验证**：未改代码时连续两次快照差异为 0。
- **问题**：`english-learning-preview.html` 渲染为空白（与本任务无关），从快照列表中移除。

### 步骤 2：T2 chrome 横线与设置页顶部空带

- **操作**：删除 `.chrome-right` 常驻 `box-shadow`；设置页外壳改 `bg-app-bg`，导航列与内容区各自延伸到窗口顶部（导航 `pt-[strip+10px]`，内容区 `mt-[strip]`，窄窗口改为导航顶部留白）。
- **影响文件**：`styles/electron.css`、`settings/SettingsPage.tsx`、`settings/SettingsNav.tsx`
- **验证**：设置页浅 / 深 / 760px 截图无顶部色带；主界面面板收起时右上角无横线，打开时 tab 行下有且只有一条线。

### 步骤 3：T3–T5 阴影、消息块宽度、Composer

- **操作**：阴影 token 改暖色基底，新增 `xs`、`knob`、`thumb`、`float`（三个主题分支都写）；10 处冷色阴影按用途替换；Composer 两种外壳改 `rounded-act-lg`、去掉 `shadow-act-soft`；用户消息卡与贴顶提问卡去掉阴影；新增 `--conversation-block-max-width`，5 类消息块改用它。
- **发现**：`shadow-act-float` 被 8 处 dialog / 抽屉使用但从未定义，这些浮层一直没有阴影。补上 `--act-shadow-float`。
- **验证**：`grep 31,45,61` 为 0；fixture 中「未执行」标记右缘 1143px = Composer 右缘 1160px − 17px 文字内缩，用户卡与 Composer 左右缘一致。

### 步骤 4：T6–T8 字号

- **操作**：`@theme` 新增 `--text-act-*`。先用 Tailwind 编译确认 `text-act-sm` 只生成 `font-size`，而默认 `text-sm` 带 `line-height: var(--tw-leading, …)`。codemod（`tools/font-size-codemod.mjs`）等值替换 538 处，默认字号类替换时在同一行没有 `leading-*` 时补 `leading-4/5/7`。
- **问题**：快照出现 1 处差异（设置导航「返回应用」13px → 12px）。
  - **原因**：元素同时带基础常量的 `text-[13px]` 和调用处追加的 `text-[12px]`，Tailwind 生成顺序让 13px 生效；换成 `text-act-sm` / `text-act-xs` 后按类名排序，`xs` 排在后面，结果翻转。
  - **应对**：写脚本扫描「常量拼接」与 `cx(...)` 组合中的字号冲突，共 3 处（导航返回按钮、Sidebar 工作区标签、提示词编辑器），按原实际渲染值 13px 处理并拆出不含字号的基础常量。修复后 T7 快照差异为 0。
- **T8**：Composer 两处输入框 15px → 16px（D5）；其余 38 处规范外值按规则归档（9/10 → 11、11.5/12.5 → 12、15 → 14、17/18 → 16、22 → 20）。快照差异只包含这些预期变化。

### 步骤 5：T9–T11 圆角、层级、动效

- **操作**：新增 `--act-radius-group`；27 处写死圆角归档，1–3px 保留并登记 allowlist。z-index 按分层表替换 31 处，新增 `--act-z-drawer`，`electron.css` 改用 `var(--act-z-chrome)`。68 处时长改 `duration-(--motion-*)`，`base.css` 加全局 `prefers-reduced-motion` 兜底。
- **决定**：WorkbenchLayout 的 `z-[50]` 是窄窗口抽屉，必须低于标题栏（60）、高于拖拽柄（30），新增 drawer 层；portal 到 body 的菜单归 popover 层。
- **验证**：Tailwind 编译确认 `z-(--act-z-pane)`、`z-[calc(var(--act-z-chrome)+1)]`、`duration-(--motion-fast)` 输出正确；CDP 模拟 reduce 时入场动画与按钮过渡计算值为 0.01ms，关闭时为 260ms / 120ms。

### 步骤 6：T12 Button / IconButton

- **操作**：新增 `components/ui/Button.tsx`（5 个 variant、3 个 size、pill 形状、busy）与 `IconButton.tsx`（`label` 必填并生成 Tooltip，4 个 variant、4 个 size、round 形状）。迁移：原 `SettingsButton` / `settingsButtonClass` 及 7 个文件的用法、`BTN_*`、`PLUGIN_BTN_SECONDARY`、Skills 页按钮、设置与工作区对话框底部按钮、`ApprovalButton`、Composer 回形针 /「+」/ 发送 / Review 胶囊与「…」、Sidebar 分组折叠 / 排序 / 添加工作区 / 会话状态 / 工作区新建会话、右侧面板「查看源码」/ 导出 / 刷新、子 Agent 弹窗关闭。Sidebar 与可视化回复里原来只有 `title` 的图标按钮改为 Tooltip。
- **决定**：
  - 计划中的「SettingsPage BTN_* h-8」已被 9-25 设置改版替换为 `SettingsButton`（28px / 12px）；审批卡 28px 按钮为 13px。`Button` 的 `sm` 采用审批卡的 13px（审批卡要求零差异；规范设置正文与输入框均 13px），设置按钮因此变为 13px。
  - 45 份「按钮常量」中菜单项、下拉触发器、分段控件、可点卡片、`ScrollToBottomButton` 等不属于 Button，未迁移，清单写入基础组件规范与技术债。
  - 与 36px 输入框同排的表单控件不改，避免对不齐。
  - Composer「+」需要浅底描边外观，`IconButton` 新增 `soft` variant。
- **焦点（问题 10）**：逐条复核无替代焦点样式的 `outline-none`：多数由父级 `focus-within` 或同组件 focus-visible 提供；修 4 处（轨迹搜索框焦点色由 info 改 focus-ring、Composer 面板 `focus-within:border-line-strong`、ToolLogLine 可聚焦容器补焦点环、文件树过滤框补 ring）。菜单内自动聚焦的搜索框（模型、分支）保持不变。
- **验证**：新增 `test/ui-button.test.tsx`（6 例，含 `@ts-expect-error` 类型断言）；更新 3 个断言旧类名的测试；审批卡按钮新旧类名逐条比对，默认态一致。

### 步骤 7：T13 检查脚本

- **操作**：`scripts/check-frontend-design-tokens.mjs` + `pnpm check:frontend-tokens`，接入 `check-repo-hygiene.sh`（CI 的 `scripts/ci.sh` 会调用）。在计划规则之外增加「组件引用的 `text-act-*` / `rounded-act-*` / `shadow-act-*` / `--act-*` / `--motion-*` 必须已定义」。`scripts/test/frontend-design-tokens.test.mjs` 5 例。
- **验证**：在组件中临时注入 9 类违规全部命中（首轮发现 token 名含数字时漏检，已修正）；恢复后检查通过。

### 步骤 8：T14 文档

- 更新 `front-全局视觉语言规范.md`（字号类名、圆角 group、阴影表、z-index 分层、动效、按钮）、`front-基础组件封装规范.md`、`front-主题与配色规范.md`、`front-icon-button-tooltip-guidelines.md`、`front-tailwind-style-architecture.md`、`docs/FRONTEND.md`、`tech-debt-tracker.md`、foundation 计划与 `exec-plans/README.md`；计划移入 completed。

## 遇到的问题

- **问题**：`src/main/test/workspace-git-context-service.test.ts` 的「non-repository」用例失败（期望 `not_repository`，实际 `failed`）。
  - **原因**：测试在临时目录里调用 `git`，结果依赖本机环境；本次没有改 `src/main` 与 packages。
  - **应对**：记录，不处理。
- **问题**：字号 token 化后「同一元素两个字号类」的生效结果翻转。见步骤 4。

## 跳过或推迟的事项

- Electron 窗口验收：当前环境没有 Computer Use，交给用户（执行摘要有清单）。
- T1 的 before / after 截图没有提交进仓库（每轮约 34 张整页 PNG）；需要时用 `tools/style-snapshot.mjs capture` 重新生成。
- dialog 的 `rounded-act-xl`（18px）未收敛到 12px：不在 D1–D5 范围，记入技术债。
