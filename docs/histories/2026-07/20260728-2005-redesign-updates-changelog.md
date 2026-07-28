## [2026-07-28 20:05] | Task: 重构公开更新日志内容与时间线

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 参考 Multica 的更新日志，去掉“用户价值”和“技术摘要”，按日期、大标题以及“新功能 / 改进 / 问题修复”展示；同时结合 history 与 Git Log，把现有 release 补充完整。

### 🛠 Changes Overview

**Scope:** 公开 release 内容契约、站点解析器、`/updates` 页面与相关文档

**Key Actions:**

- **[Release Content]**: 将公开发布记录从“功能域 / 用户价值 / 技术摘要”表格迁移为按日期组织的 Changelog，并依据 History 与 Git Log 补齐 2026 年 5 月至 7 月的用户可见更新。
- **[Content Contract]**: 统一采用“日期 + 发布标题 + 新功能 / 改进 / 问题修复”结构；分类没有内容时省略，不虚构版本号，也不暴露内部实现噪音。
- **[Parser]**: 重写 Markdown AST 解析与数据模型，校验日期、月份归属、重复日期、分类名称、空分类和非法节点，并保留安全的行内 Markdown。
- **[Timeline UI]**: 桌面端增加 sticky 日期时间线和滚动 active 状态，正文使用大标题与灰色功能条目；移动端改为横向月份导航。
- **[Progressive Enhancement]**: 使用稳定日期锚点、原生链接与静态正文作为基础，JavaScript 只负责 hash 和当前条目的同步高亮。
- **[Documentation]**: 更新 release 维护说明、官网设计文档和 execution plan，明确后续发布记录的写作与验证流程。

### 🧠 Design Intent (Why)

公开更新日志应该直接回答“哪天发布了什么”，而不是要求读者先理解内部功能域或展开技术摘要。内容模型与页面层级保持一致后，编辑者只需维护一次信息，页面也不再需要表格、标签和折叠层来解释同一批变化。

History 与 Git Log 只作为事实证据：最终公开内容按发布日期聚合，并改写成用户能够观察到的变化。这样既补齐了遗漏，又避免把文件路径、测试数量和内部协议细节带到产品页面。

### 📁 Files Modified

- `docs/releases/README.md`
- `docs/releases/feature-release-notes.md`
- `docs/design-docs/website-introduction-site-design.md`
- `docs/exec-plans/completed/20260728-updates-changelog-redesign.md`
- `docs/learnings/2026-07/public-changelog-content-model-should-match-reading-order.md`
- `packages/site/src/lib/releases/model.ts`
- `packages/site/src/lib/releases/render-inline-markdown.ts`
- `packages/site/src/lib/releases/parse-release-notes.ts`
- `packages/site/src/lib/releases/test/parse-release-notes.test.ts`
- `packages/site/src/components/updates/UpdateTimeline.astro`
- `packages/site/src/pages/updates/index.astro`

### ✅ Validation

- `pnpm test:site -- parse-release-notes` 通过：10/10。
- `pnpm check:site` 通过：0 错误、0 警告、0 提示。
- `pnpm build:site` 通过：22 个静态页面生成完成。
- 浏览器验证桌面端与 375px 小屏、浅色与深色主题、日期锚点、点击跳转和滚动 active；均无页面级横向滚动或控制台错误。
- 完整站点测试、主题检查、文档检查与 `git diff --check` 见本轮最终验证结果。
