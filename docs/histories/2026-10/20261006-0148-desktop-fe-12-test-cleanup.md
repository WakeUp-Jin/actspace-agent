## 2026-10-06 01:48 | Task: Desktop 前端重构 12：测试整理

### 执行上下文

- Agent：Claude Code 主智能体；只读复核子智能体用 Sonnet 5.5。
- Base Model：Claude Opus 5.5。
- Runtime：Claude Code CLI，本机仓库；分支 `refactor/desktop-fe-12`。
- 状态：完成，已交给验收。
- Runtime 补充：子分支 `refactor/desktop-fe-12`，squash 回 `refactor/desktop-frontend`。Electron 检查用 CDP。

### 用户诉求

> 按 00 总执行计划连续执行 Desktop 前端重构；第三份是 12：去掉读源码 / CSS 文本做断言的测试，颜色和样式约束交给 token 检查脚本，组件语义改为渲染后断言 `aria-*` / `data-state`。

### 主要改动

- `scripts/check-frontend-design-tokens.mjs` 新增 CSS 块规则：按选择器精确截取 `styles/*.css` 中的块，检查禁用值和必需声明；三条规则守住工具日志扫光不用 operational、reduced motion 下隐藏扫光层、diff 展开区域有界滚动。
- 同一脚本新增两条 TSX 规则：Tailwind 调色板色名、旧的彩色焦点环。现有代码 0 处命中，纯防回流。
- 侧栏会话状态点、设置页 `StatusDot` 增加 `data-state`。
- 删除 3 个读源码的 `*-color-semantics` 测试和 `file-diff-block` 中读 CSS 的用例；新增 `sidebar-semantics`、`settings-semantics`，渲染组件后断言 `aria-current`、`role="switch"` / `aria-checked`、`data-state`。
- 08 设计文档同步脚本名和执行情况。

### 设计动机

读源码文本的测试守的是写法而不是行为：把类名挪进常量或 `cx()` 就会误报，换一种写法引入同样的问题又会漏报。

### 学习沉淀

检查后没有命中「可迁移且有陷阱」的新结论，不新增学习文档。

### 文件

- `scripts/check-frontend-design-tokens.mjs`、`scripts/test/frontend-design-tokens.test.mjs`
- `apps/desktop/src/renderer/components/Sidebar.tsx`、`components/settings/SettingsPrimitives.tsx`
- `apps/desktop/src/renderer/test/`：删除 `sidebar-color-semantics.test.tsx`、`settings-color-semantics.test.tsx`、`tool-log-shimmer-color-semantics.test.ts`；新增 `sidebar-semantics.test.tsx`、`settings-semantics.test.tsx`；修改 `file-diff-block.test.tsx`
- `docs/desktop-frontend-refactor/08-测试与验证整理.md`
- `docs/exec-runs/20261005-desktop-fe-12-test-cleanup/`
