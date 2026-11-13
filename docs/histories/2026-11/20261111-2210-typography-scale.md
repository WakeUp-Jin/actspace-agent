## [2026-11-11 22:10] | Task: 字号规范落地（三层字号）

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`（前半段规范与 demo 为 `claude-fable-5-2`）
- **Runtime**: `Claude Code CLI, worktree ../actspace-agent-typography, branch feat/typography-scale`

### 📥 User Query

> 页面整体字体大小不协调，大的很大、小的很小；有没有字体规范？给个最佳实践和 HTML demo。（看完 demo 选 B）写设计规范和执行计划，然后开始执行。

### 🛠 Changes Overview

**Scope:** `apps/desktop`（renderer 样式与组件）、`apps/web`（token、行高、一处字重）、`scripts/check-frontend-design-tokens.mjs`、`docs/design-docs/frontend/`

**Key Actions:**

- **[规范]**: 视觉 token §5 重写为三层字号（辅助 11–12 / 界面 13 / 阅读 15）、档位、行高、字重、聊天区一览；聊天 Markdown §4、中间消息区排版表同步。
- **[token]**: 新增 `text-act-base` 15px、`text-act-head` 18px；删除 `--act-font-reading`、`--md-chat-size`、`--md-h3-size`。
- **[聊天正文]**: 16.5px 衬线 → 15px 界面字体，标题 20/18/16/15，表头 12px 浅色。
- **[过程区与组件]**: 工具行、Thinking、`Worked for` 14 → 13px；用户消息、输入框 15px；底部状态行 12px。
- **[行高]**: 46 处 `leading-[…]` 收到 8 个刻度。
- **[检查]**: 新增 `line-height-literal`、`font-weight-off-scale`、`css-font-size-literal` 三条规则及用例。

### 🧠 Design Intent (Why)

原来界面 13px、正文 16.5px、标题 21.5px，同屏 7 种字号；正文是「西文衬线 + 中文苹方」，一行里数字和汉字两种字体；用户消息没设字号吃浏览器默认 16px。规范只管界面档位，正文样式各自写死。改成三层、每层差 2px、只用一种字体，并让检查脚本守住。对比稿选了 B（正文 15），A（14）长篇中文偏累，C（衬线 16）缺好用的中文衬线、跨平台不一致。

### 📁 Files Modified

- `apps/desktop/src/renderer/styles/{tailwind,tokens,markdown,markdown-editor,tool-result,diff,web-tool,electron}.css`
- `apps/desktop/src/renderer/components/messages/*`、`components/composer/*`、`components/conversation/*` 等约 45 个组件文件
- `apps/web/src/styles/tailwind.css`、`apps/web/src/pages/sessions/ListHeader.tsx`、`apps/web/src/ui/PageHeader.tsx`、`apps/web/src/pages/session/blocks/TodoCard.tsx`
- `scripts/check-frontend-design-tokens.mjs`、`scripts/test/frontend-design-tokens.test.mjs`、`scripts/spacing-literal-baseline.json`
- `docs/design-docs/frontend/{front-视觉token规范,front-聊天区Markdown渲染规范,front-中间消息区规范,front-Markdown编辑与渲染规范,front-web-pwa客户端规范,README}.md`、`docs/FRONTEND_VERIFICATION.md`
- `docs/exec-plans/completed/20261111-typography-scale.md`、`docs/exec-runs/20261111-typography-scale/*`
