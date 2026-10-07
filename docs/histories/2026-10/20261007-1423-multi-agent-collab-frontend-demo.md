## [2026-10-07 14:23] | Task: 多智能体协作（Space）前端演示

### 🤖 Execution Context

- **Agent ID**: `claude-code`
- **Base Model**: `claude-opus-5-5`（T1–T3、T5–T10 的子智能体用 Sonnet）
- **Runtime**: `Claude Code CLI（macOS，工作树 actspace-agent-multi-agent，分支 feat/multi-agent-collab-fe）`

### 📥 User Query

> 多智能体协作先只做前端，后端不碰，数据全 mock，界面上标明「开发中演示 / 不能真实使用」。设计以 `space-demo.html` 和 `front-space-工作台设计.md` 为准。左栏顺序：新建会话 → 新建 Space → 扩展 → Actor 名册 → Space → 已置顶 → 工作区；输入框用现有的；右栏复用现有外壳；旧的 Member / Room / Team 设计删掉；样式以真实桌面端为准；普通会话的右栏启动页一起改成列表，单独立一个小任务。

### 🛠 Changes Overview

**Scope:** `apps/desktop/src/renderer/`、`scripts/native-button-baseline.json`、`docs/`

**Key Actions:**

- **Space 演示（只在开发构建出现）**：在 `components/space/` 下实现以下部分：
  - 内存 store 和模拟脚本
  - 标题栏中间的标签栏
  - 协调 Agent 和 Actor 对话
  - 审批托盘、状态胶囊，以及现有 Composer 的接入
  - 右栏：Actor 分组 / 库 / 记忆，以及模拟的文件、终端、Review、上下文
  - Actor 名册和一对一对话
  - 新建 Space 和演示说明弹窗
  - 常驻的「开发中演示」提示条和「重置演示」
- **接入工作台**：
  - `SidebarView` 新增 `"space"`。
  - 左栏加入口和 Space 分区；一对一对话放在工作区会话列表里。
  - `WorkbenchLayout` 按视图切换中栏、标题栏中间区域、右栏，以及右栏开关的数据来源。
  - 名册页没有右栏；窄窗进入 Space 时先收起右栏浮层。
- **普通会话右栏**：
  - 启动页改成白底列表（`RightPanelLauncherList`）。
  - 标签栏和工作区操作栏拆成独立文件，`RightPanel.tsx` 降到 445 行。
- **Composer**：加 `placeholder`、`statusRow` 两个可选 prop。
- **主题**：
  - `space.css`：星空、工作光环、留下 Actor 的星尘、行 FLIP。
  - `--act-space-*` token，浅色和深色都有。
- **文档**：
  - 设计文档状态改为「已实施（演示）」。
  - `FRONTEND_VERIFICATION.md` 加 7 步走查。
  - 计划进度、执行过程与摘要。
  - 删掉旧的 `collaboration/agent-form-room.md`、`agent-form-team.md`、`agent-members.md` 和两个预览页。

### 🧠 Design Intent (Why)

- **只做前端**：先让产品形态能看、能点，再决定后端怎么接。数据形状按设计文档 §9 的实体拆分；组件只读选择器结果、只调 store 的动作，以后换成真实数据源时不用重写 UI。
- **不复用 `RightPanelContext`**：它全局只有一份，而且绑定真实会话和 IPC；Space 的右栏要按「协调 Agent / 某个 Actor / 一对一」分别记标签。所以只共用展示组件，也就是标签栏和启动页。
- **给 Composer 开两个口子**：协调 Agent 没有分支和权限（D31），不开口子就只能改 DOM、用 CSS 藏状态行。两个 prop 不传时行为不变。
- **入口只在开发构建出现**：用 `import.meta.env.DEV` 判断，避免演示被当成能用的功能。代码本身也不进生产包：hook 在模块层面二选一，顶层的 store 单例和 `memo()` 加了 `/* @__PURE__ */`（见学习文档 `20261007-pure-annotation-tree-shaking`）。

验证：
- desktop typecheck 通过。
- `pnpm test`：203 个文件，1668 个用例通过。
- `check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge` 通过。
- `check:current-docs` 只剩 main 原有的一处断链。
- `build:renderer` 通过，主 chunk 从 1913KB 降到 1833KB，产物 JS 里没有演示代码。
- 浏览器 mock 截图核对了：协调 Agent、Actor 标签（深色）、名册、一对一、「留下」后加托盘、窄窗。

Electron 验收还没做。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/space/**`（新增：`model/`、`avatar/`、`tabs/`、`thread/`、`dock/`、`panel/`、`roster/`、`dialogs/`、`SpaceWorkbench.tsx`、`SpaceRightPanel.tsx`、`SpaceSidebarSection.tsx`、`SpaceDemoNotice.tsx`、`SpaceNoticeToast.tsx`、`space-demo-enabled.ts`）
- `apps/desktop/src/renderer/assets/space/**`（新增）
- `apps/desktop/src/renderer/components/right-panel/{RightPanelLauncherList,RightPanelTabStrip,WorkspaceOperationBar}.tsx`（新增）
- `apps/desktop/src/renderer/components/{RightPanel,Sidebar,WorkbenchLayout,WindowChromeBar,Composer}.tsx`
- `apps/desktop/src/renderer/components/composer/composer-types.ts`
- `apps/desktop/src/renderer/styles/{tokens.css,index.css,space.css}`
- `apps/desktop/src/renderer/test/{space-*.test.ts(x),right-panel-launcher-list.test.tsx}`（新增）
- `scripts/native-button-baseline.json`
- `docs/design-docs/多智能体协作/**`、`docs/FRONTEND_VERIFICATION.md`、`docs/exec-plans/active/20261007-multi-agent-collab-frontend-demo.md`、`docs/exec-runs/20261007-multi-agent-collab-frontend-demo/**`
- `docs/learnings/2026-10/{20261007-pure-annotation-tree-shaking,20261007-tailwind-same-property-order}.md`（新增）
