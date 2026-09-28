## [2026-09-28 22:40] | Task: 外观强调色

### 🤖 Execution Context

- Agent ID: claude-code
- Base Model: Claude Opus 5.5
- Runtime: Claude Code CLI

### 📥 User Query

> 按已确认的设计文档与执行计划实现外观强调色（默认 / 蓝 / 紫 / 粉 / 橙）。

### 🛠 Changes Overview

Scope: apps/desktop renderer、scripts、docs

Key Actions:

- 外观偏好新增 `accentPalette`，写 `<html data-accent>`；旧原型 ID 回落默认。
- `tokens.css` 用调色板源值 + 语义 token（accent / accent-hover / on-accent / toggle-on / link / focus-ring / selection）实现，默认调色板全部回落原 token。
- 发送按钮改用 `IconButton variant="accent"`，Toggle 与 Composer 开关改 `bg-toggle-on`。
- 外观页「强调色」改为一行 5 个选项；主题检查脚本校验注册表、色样和对比度。
- 对比 fixture 加入发送、开关、选中、运行中与审批琥珀，截图确认橙与警告色可区分。

### 🧠 Design Intent (Why)

强调色只落在小面积交互点上，让选择可感知，同时不破坏 Ink & Emerald 的中性工作台和状态色语义。开关属于控件状态而非运行状态，所以跟随强调色；运行中、已连接仍用翡翠绿。通过「源值 + 语义 token + 回落」三层，默认外观零变化，新增调色板只需注册表一行与一个 CSS 块。

### 📁 Files Modified

- apps/desktop/src/renderer/appearance/{types,storage,apply,accents}.ts
- apps/desktop/src/renderer/styles/{tokens,tailwind,markdown}.css
- apps/desktop/src/renderer/components/ui/IconButton.tsx
- apps/desktop/src/renderer/components/Composer.tsx
- apps/desktop/src/renderer/components/settings/{SettingsPage,SettingsPrimitives}.tsx
- apps/desktop/src/renderer/components/right-panel/ContextRenderView.tsx
- apps/desktop/src/renderer/test/{appearance.test.ts,settings-page.test.tsx,composer.test.tsx,settings-color-semantics.test.tsx}
- apps/desktop/src/renderer/test/fixtures/{accent-palette-preview.html,accent-palette-preview.tsx,settings-preview.tsx}
- scripts/check-frontend-theme-colors.mjs
- docs/design-docs/frontend/{front-accent-palette.md,front-主题与配色规范.md,README.md}、docs/design-docs/index.md
- docs/exec-plans/completed/20260928-accent-palette.md、docs/exec-plans/README.md、docs/exec-runs/20260928-accent-palette/

### 📚 Learning

- docs/learnings/2026-09/css-var-fallback-accent-palette.md：CSS 变量回落链做可切换、默认零变化的调色板。
