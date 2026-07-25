## [2026-07-25 22:25] | Task: 补齐模型、Review 与右侧 Tab 悬浮反馈

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 模型列表中选中状态应只显示勾，鼠标悬浮项显示浅灰背景；Composer Review 按钮和右侧视图 Tab 也需要明确的悬浮颜色反馈，并参考 Cursor 的克制中性状态。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer

**Key Actions:**

- **模型列表状态分离**: 取消选中模型的常驻灰底，只保留勾图标；行 hover 使用主题感知的中性 overlay，键盘聚焦继续提供 selected 背景。
- **Review 操作反馈**: 为 Review 预览按钮与更多按钮补充背景、边框和文字颜色的 hover 过渡，并保持 loading 禁用态稳定。
- **右侧 Tab 反馈**: 未激活 Tab hover 时显示中性灰背景并增强文字，激活 Tab 继续使用 selected 状态。
- **回归覆盖**: 补充 Composer 与 RightPanel renderer 测试，锁定 hover、selected 与勾图标职责。

### 🧠 Design Intent (Why)

选中态、悬浮态和运行状态承担不同语义。模型选择用勾表达持久选中，灰色背景只表达当前鼠标或键盘落点；Review 与右侧 Tab 使用同一套 neutral token，使用户在点击前即可确认将触发的目标，同时保持浅深主题自动翻转。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/RightPanel.tsx`
- `packages/desktop/src/renderer/test/composer.test.tsx`
- `packages/desktop/src/renderer/test/right-panel-kairos.test.tsx`

### ✅ Validation

- `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/composer.test.tsx src/renderer/test/right-panel-kairos.test.tsx`：29/29 通过。
- `pnpm --filter @actspace/desktop test`：60 个测试文件、479/479 通过。
- `pnpm --filter @actspace/desktop typecheck`：通过。
- `pnpm --filter @actspace/desktop build:renderer`：通过；保留既有大 chunk 警告。
- `pnpm check:frontend-theme`：通过。
- `pnpm check:docs`：通过。
- 目标文件 `git diff --check`：通过。
- 浏览器 mock 浅色验收：模型选中项为透明底 + 勾；右侧激活 Tab 使用 selected，未激活 Tab 消费 hover overlay。

### 📚 Learning Check

本次是既有语义 token 和交互状态规范的局部修正，未同时命中新概念、可迁移深度或新陷阱等至少两项条件，不新增独立 learning 文档。
