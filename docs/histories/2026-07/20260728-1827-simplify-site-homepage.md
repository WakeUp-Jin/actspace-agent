## [2026-07-28 18:27] | Task: 精简 ActSpace 官网首页叙事

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 首页的核心价值、架构和更新区块信息重复或意义不足，希望与原始 HTML Demo 的核心产品信息对齐，并修复最终行动区的布局。

### 🛠 Changes Overview

**Scope:** `packages/site`、官网设计规范

**Key Actions:**

- **[Homepage Structure]**: 首页收敛为 Hero、产品判断、四项真实能力展示、最终 CTA 和 Footer；博客、更新和架构内容继续保留独立页面，不在首页重复展开。
- **[Product Showcase]**: 产品展示与原始 Demo 对齐为 Context、Tools、Kairos、Usage 四项，移除缺少独立首页价值的 Review Tab。
- **[CTA Layout]**: 将过宽的 `.final-cta div` 选择器收敛为 `.final-actions`，避免外层页面容器被错误设置为横向 flex。
- **[Navigation Integrity]**: 页脚核心能力链接改为现存的 `#showcase`，移除已经下线的 `#principles` 和 `#architecture` 锚点。

### 🧠 Design Intent (Why)

首页的任务是快速说明 ActSpace 是什么、展示真实产品能力并提供开始路径，而不是同时承担架构文档、博客索引和完整更新日志。减少重复 section 后，视觉节奏更接近产品介绍页，独立内容页面的边界也更清楚。

### 📁 Files Modified

- `packages/site/src/pages/index.astro`
- `packages/site/src/components/home/ProductStory.astro`
- `packages/site/src/components/home/ProductShowcase.astro`
- `packages/site/src/components/home/FinalCta.astro`
- `packages/site/src/components/SiteFooter.astro`
- `docs/design-docs/website-introduction-site-design.md`

### ✅ Validation

- `pnpm check:site`：39 个 Astro 文件，0 errors / warnings / hints。
- `pnpm test:site`：7 个 release parser 测试通过。
- `pnpm build:site`：16 个静态页面构建成功。
- 浏览器验证覆盖 973px 与 390px：首页仅保留 4 个主要 section，无页面级横向滚动；CTA 和能力 Tab 交互正常，控制台无错误。
