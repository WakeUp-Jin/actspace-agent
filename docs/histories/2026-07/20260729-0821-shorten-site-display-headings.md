## [2026-07-29 08:21] | Task: 收紧官网展示标题

### 🤖 Execution Context

- **Agent ID**: `Codex /root`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 官网的大标题经常写成长句并以句号结尾，希望标题更短，尤其收紧博客首页标题。

### 🛠 Changes Overview

**Scope:** `packages/site`、官网设计文档

**Key Actions:**

- 将博客首页标题收紧为“Agent 工程手记”，文档首页标题收紧为“理解 Agent 的运行空间”。
- 移除首页 Hero、产品判断、最终行动区和 404 页面展示标题末尾的句号。
- 在官网设计文档中补充“展示标题简短、两行内、结尾不使用句号”的规则。
- 保持博客文章 frontmatter、文章原始标题和正文内容不变。

### 🧠 Design Intent (Why)

超大字号会放大标点的视觉重量，完整宣传句也容易占据三行以上，削弱页面层级。展示型标题改用短语或短判断句，让大字号承担识别与节奏，具体含义继续由紧邻的说明文字承载。

### 📁 Files Modified

- `packages/site/src/components/home/Hero.astro`
- `packages/site/src/components/home/ProductStory.astro`
- `packages/site/src/components/home/FinalCta.astro`
- `packages/site/src/pages/docs/index.astro`
- `packages/site/src/pages/blog/index.astro`
- `packages/site/src/pages/404.astro`
- `docs/design-docs/website-introduction-site-design.md`
- `docs/histories/2026-07/20260729-0821-shorten-site-display-headings.md`
