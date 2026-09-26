## [2026-09-26 14:00] | Task: 前端设计 token 收口、视觉修复与基础按钮组件

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI（macOS，交互模式）`

### 📥 User Query

> 按 20260926 前端设计 token 收口计划执行 T1–T14；D1–D5 全部采用推荐方案；T12 采用方案 B，把按钮常量都迁到统一的 Button，让以后的实现有规范可循。

### 🛠 Changes Overview

**Scope:** `apps/desktop`（renderer）、`scripts`、`docs`

**Key Actions:**

- **[Token 化]**: 新增 `text-act-*` 字号档、`rounded-act-group`、暖色阴影 token（xs / knob / thumb / soft / popover / float）、8 层 `--act-z-*`，把 576 处字号、41 处圆角、31 处 z-index、68 处时长、10 处冷色阴影换成 token；`base.css` 加全局减少动态效果兜底。
- **[视觉修复]**: 去掉右上角面板开关下的孤立横线和设置页顶部空带；Composer 改 12px 圆角并去掉常驻阴影，用户消息卡去阴影；消息块与内容列同宽（880px）；小于 11px 的字提到 11px，Composer 输入 16px；补上一直未定义的 `shadow-act-float`。
- **[基础组件]**: 新增 `components/ui/Button.tsx`、`IconButton.tsx`（`label` 必填并生成 Tooltip），替换 `SettingsButton` 与设置、扩展、审批、Composer、Sidebar、右侧面板和对话框中的按钮样式常量；补 4 处缺失的焦点提示。
- **[防回流]**: `pnpm check:frontend-tokens` 禁止写死字号 / 圆角 / 层级 / 时长 / 冷色阴影，并检查引用的 token 是否已定义；接入 `check-repo-hygiene.sh`。
- **[工具]**: 执行记录目录下的 CDP 样式快照工具与字号 codemod，用于前后 0 差异校验。

### 🧠 Design Intent (Why)

规范早已定好字号、圆角、阴影和层级，但从未映射成可用的 class，组件只能各写各的，于是出现 18 个 z-index 值、13 处旧蓝色阴影、45 份按钮样式常量。把规范变成 token 和组件，再用检查脚本挡住回流，比逐页修视觉更持久。字号选 `text-act-*` 而不覆盖 Tailwind 默认 `text-sm`，避免同名不同值；Button 只收真正的按钮，菜单项、触发器和分段控件留给 `DropdownMenu` / `Tabs`，避免 variant 膨胀。

执行中发现：同一元素上两个字号类（常量拼接或调用处追加）谁生效取决于 Tailwind 的生成顺序，token 改名会让结果翻转，已按原渲染值修正 3 处，并写入规范和学习文档。

### 📁 Files Modified

- `apps/desktop/src/renderer/styles/tokens.css`、`tailwind.css`、`base.css`、`electron.css`
- `apps/desktop/src/renderer/components/ui/Button.tsx`、`IconButton.tsx`（新增）
- `apps/desktop/src/renderer/components/Composer.tsx`、`Sidebar.tsx`、`settings/*`、`messages/*`、`right-panel/*` 等 74 个组件文件
- `apps/desktop/src/renderer/test/ui-button.test.tsx`（新增）、`composer.test.tsx`、`settings-color-semantics.test.tsx`
- `scripts/check-frontend-design-tokens.mjs`、`scripts/test/frontend-design-tokens.test.mjs`（新增）、`scripts/check-repo-hygiene.sh`、`package.json`
- `docs/design-docs/frontend/front-全局视觉语言规范.md`、`front-基础组件封装规范.md`、`front-主题与配色规范.md`、`front-icon-button-tooltip-guidelines.md`、`front-tailwind-style-architecture.md`、`docs/FRONTEND.md`
- `docs/exec-plans/completed/20260926-frontend-design-token-convergence.md`、`docs/exec-plans/README.md`、`tech-debt-tracker.md`、`active/frontend-ui-components-foundation.md`
- `docs/exec-runs/20260926-frontend-design-token-convergence/`（执行过程、摘要、工具）
- `docs/learnings/2026-09/20260926-tailwind-utility-conflict-order.md`（新增）
