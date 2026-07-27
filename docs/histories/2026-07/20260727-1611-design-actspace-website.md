## [2026-07-27 16:11] | Task: 设计 ActSpace 官网与内容站规范

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 为 ActSpace 设计正式介绍主页，并确定文档、博客、更新三个一级菜单；官网工程放在 `packages/site`，更新页从仓库 release 文档生成。继续比较 Claude、Cursor 和 Multica 的博客、文档与更新页后，把确认的取舍收口到长期规范。

### 🛠 Changes Overview

**Scope:** `docs/design-docs`、`docs/histories`

**Key Actions:**

- **[Website Design]**: 新增官网长期设计规范，定义主页、Docs、Blog、Updates 的信息架构、视觉系统、内容 Schema、响应式、可访问性、SEO 和验收边界。
- **[Release Integration]**: 确定 `docs/releases/feature-release-notes.md` 是更新页唯一事实来源，并规定 Markdown AST 解析、校验、排序和稳定锚点要求。
- **[Repository Boundary]**: 确定官网工程位于 `packages/site`，公开内容与内部 design docs、histories、execution plans 保持隔离。
- **[Delivery]**: 确定首版采用静态构建，通过仓库 GitHub Actions 部署到 GitHub Pages，延续 Action pinning 和仓库检查约束。
- **[Navigation]**: 在设计文档索引中增加官网与公开内容阅读入口。
- **[Blog Refinement]**: 确定 Claude 风格视觉卡片为默认博客布局，定义三类 ActSpace 封面、窄阅读列、博客衬线标题和后续 Cursor 式 List 归档策略。
- **[Docs Refinement]**: 确定 Claude Code 式分类导航与三栏文章骨架，并采用 Cursor 式文档首页、真实截图和任务入口；首版不提供虚假的 AI 问答入口。
- **[Changelog Refinement]**: 确定 Multica 式月份历史导航与连续时间轴；当前数据不虚构版本号，Cursor 式富媒体详情只保留给未来重大版本。

### 🧠 Design Intent (Why)

官网需要同时承担产品介绍、真实能力证明、上手引导和长期内容承载，不能停留在一次性 Landing Page。设计延续桌面端 `Ink & Emerald` 的语义职责，同时通过 `Cloudfield & Ink` 的云海主视觉和编辑式排版形成独立、可识别的官网表达。博客需要拥有技术出版物的视觉记忆点，文档需要保持工具手册的高效率，更新页则保持连续、准确和可追溯。更新内容继续由现有 release 文档单向生成，避免出现网站和仓库两份事实来源。

### 📁 Files Modified

- `docs/design-docs/website-introduction-site-design.md`
- `docs/design-docs/index.md`
- `docs/histories/2026-07/20260727-1611-design-actspace-website.md`
