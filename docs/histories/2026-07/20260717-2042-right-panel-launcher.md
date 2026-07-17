## [2026-07-17 20:42] | Task: 调整右侧面板对象启动页

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: GPT-5
- **Runtime**: Codex desktop

### 📥 User Query

> 右侧面板打开时参考 Cursor 的方块入口形式，但入口数量和名称使用 Actspace 自己的对象定义，最终收口为 Files、Review、Context、Kairos、Reply 五项。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer、前端设计文档

**Key Actions:**

- **新增对象启动页**：右侧面板默认不再常驻 Kairos Tab，没有打开对象时展示五格启动入口；前四项为 `2 × 2`，`Reply` 同尺寸居中。
- **接通现有对象行为**：Files 进入 Workspace 浏览态，Review、Context、Kairos、Reply 打开各自现有视图；关闭最后一个 Tab 后回到启动页。
- **收口用户可见命名**：将 `Reply HTML` 改为 `Reply`，保留内部 `replyHtml` 类型与 HTML 渲染实现，不向入口暴露格式细节。
- **同步视觉与无障碍**：使用语义主题 token、Lucide 图标、键盘焦点和 disabled 状态，并完成浅色 / 深色检查。
- **补充回归测试**：覆盖五个启动入口、Review / Context / Kairos / Reply 打开行为、关闭 Tab 返回启动页及 Workspace 浏览态切换。

### 🧠 Design Intent (Why)

右侧面板是对象浏览工作区，默认直接打开 Kairos 会把一个具体业务对象误当成面板首页。改为对象启动页后，用户先看到 Actspace 当前真实存在的五类对象；方块形式借鉴 Cursor 的低干扰入口密度，但不复制 Cursor 的 Browser / Terminal 定义，也不为了凑满网格虚构能力。

### ✅ Verification

- `pnpm exec vitest run src/renderer/test/right-panel-kairos.test.tsx src/renderer/test/right-panel-workspace.test.tsx src/renderer/test/right-panel-review.test.tsx`：13 tests passed。
- `pnpm typecheck`（`packages/desktop`）：通过。
- `pnpm build:renderer`：通过；仅保留既有 chunk size warning。
- `git diff --check`：通过。
- 浏览器 renderer：验证默认右侧宽度下的五格排布和入口可达性。
- 浅色 / 深色：验证语义 surface、border、text token 均随主题翻转。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/RightPanel.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/renderer/components/right-panel/RightPanelContext.tsx`
- `packages/desktop/src/renderer/components/right-panel/RightPanelObjectMenu.tsx`
- `packages/desktop/src/renderer/components/right-panel/ReplyHtmlRenderView.tsx`
- `packages/desktop/src/renderer/test/right-panel-kairos.test.tsx`
- `packages/desktop/src/renderer/test/right-panel-review.test.tsx`
- `packages/desktop/src/renderer/test/right-panel-workspace.test.tsx`
- `docs/design-docs/front-右侧面板与文件渲染规范.md`
- `docs/design-docs/front-index.md`
- `docs/design-docs/index.md`

### 📚 Learning Check

本次主要是既有对象模型上的 UI 空态与命名收口，没有命中新概念、深原理或可迁移陷阱，不单独新增 learning 文档。
