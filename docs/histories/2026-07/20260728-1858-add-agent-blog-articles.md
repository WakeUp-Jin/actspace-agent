## [2026-07-28 18:58] | Task: 补充 ActSpace Agent 工程博客

### 🤖 Execution Context

- **Agent ID**: `Codex /root`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 从已有的上下文工程文章和 ActSpace 评估设计中补充官网博客，覆盖 Bash 后台运行与沙盒、Agent Team / Room、Browser Use、Pi LLM 模块、Skill 系统和 Agent 评估；博客只通过顶部 Tab 进入，不恢复首页博客区。

### 🛠 Changes Overview

**Scope:** `packages/site/src/content/blog`、`packages/site/src/assets/blog`、`packages/site/public/images/blog`

**Key Actions:**

- 从 `Practical-Guide-to-Context-Engineering` 中导入 Bash、Team / Room、Browser Use、Pi LLM 和 Skill 五篇原始文章，并从用户提供的 Markdown 导入 ActSpace 评估文章。
- 六篇文章的正文、代码、外部链接和措辞均以原始文件为准，不再做压缩、润色、补写或按当前实现重新解释。
- 仅将原文首个 H1 移入博客 Frontmatter、以原文首段生成列表摘要，并适配站点内的图片和文章链接路径；这些转换不改变原文可见内容。
- 将原文引用的 22 张本地配图原样复制到 `packages/site/src/assets/blog/source/`，交给 Astro 本地图片管线处理，避免导入后丢失正文图示。
- 修复 Markdown 根路径图片绕过 Astro `base` 的问题：正文配图改用 `../../assets/...` 源码相对路径，由构建过程生成包含当前部署 `base` 的图片 URL，不修改文章文字，也不硬编码 `/actspace-agent`。
- 站点启用 Astro passthrough image service，保留原图且不依赖仓库当前未安装的 Sharp；图片仍会复制到带哈希的构建资产目录。
- 新增博客资源单测，机械检查站内原文配图统一走 `../../assets/blog/source/...`、引用文件真实存在，避免再次回流为绕过 Astro `base` 的 `/images/...`。
- 为 6 篇文章新增同系列低饱和 SVG 架构封面；没有复用本机路径、私有飞书图片或带鉴权的远端资源。
- 按用户要求不修改首页博客区域，博客继续通过顶部导航进入。
- 根据发布后的视觉反馈重排博客详情页：封面由通栏大图收为保留 5:3 构图的小型视觉章，标题与摘要成为主列，分类、作者、发布日期和阅读时间组成宽屏右侧元信息列，并在窄屏按语义顺序下落。
- 博客正文改用主题主文字色 `Ink` 和 17–18px 无衬线阅读排版，避免浅色主题下继承 `Body` 后呈现为低对比度灰字；H2 保留博客独有的衬线出版语气。

### 🧠 Design Intent (Why)

官网博客此前只有一篇 Context 文章，无法承载已有的 Agent 工具、协作、浏览器、LLM、Skill 和评估长文。本次把已有文章转换为官网博客载体时，正文内容仍由原始 Markdown 单独拥有，官网只负责 Frontmatter、静态资源和阅读排版。初版曾对文章做重新组织和表述，超出了用户授权；本轮已全部恢复为原文，并在网站设计文档中补充“导入文章不得擅自改写”的约束。详情页采用“视觉章 + 编辑式标题区 + 元信息侧栏 + 窄正文”的层级，让格式改善与内容修改保持清楚边界。

本轮图片修复暴露了 Astro 子路径部署、Markdown 本地资产识别和默认 Sharp 服务之间的非显而易见边界，具有可迁移性和常见陷阱，因此补充学习文档 `docs/learnings/2026-07/astro-base-path-needs-source-assets.md`。

### 📁 Files Modified

- `packages/site/src/content/blog/actspace-agent-evaluation.md`
- `packages/site/src/content/blog/agent-skill-system.md`
- `packages/site/src/content/blog/agent-team-and-agent-room.md`
- `packages/site/src/content/blog/bash-background-and-sandbox.md`
- `packages/site/src/content/blog/browser-use-integration.md`
- `packages/site/src/content/blog/pi-llm-runtime-design.md`
- `packages/site/public/images/blog/*.svg`
- `packages/site/src/assets/blog/source/**/*`
- `packages/site/astro.config.mjs`
- `packages/site/src/lib/test/blog-assets.test.ts`
- `packages/site/src/pages/blog/[...slug].astro`
- `docs/design-docs/website-introduction-site-design.md`
- `docs/learnings/2026-07/astro-base-path-needs-source-assets.md`
- `docs/histories/2026-07/20260728-1858-add-agent-blog-articles.md`

### ✅ Validation

- `pnpm --filter @actspace/site build` 通过，成功生成原有文章与 6 篇新文章共 7 个博客详情路由。
- `pnpm check:site` 通过，Astro 检查 41 个文件，0 error / 0 warning / 0 hint。
- `pnpm test:site` 通过，11 个站点测试全部通过。
- `pnpm check:docs` 通过。
- `git diff --check` 通过。
- 6 张 SVG 通过 `xmllint`，并使用 macOS Quick Look 实际渲染为 PNG 完成视觉检查。
- 对六篇目标 Markdown 执行内容还原校验：仅规范化不影响渲染的行尾空白，移除博客 Frontmatter、恢复首个 H1 和资源路径后，正文文字、代码、链接与段落结构均与六个原始文件一致。
- 22 张原文配图通过 `cmp` 逐文件校验，与来源仓库中的二进制文件完全一致；静态构建通过 passthrough image service 输出全部 22 个带哈希图片资产。
- 静态产物检查确认 7 个文章链接、7 张封面和 Article JSON-LD 均已生成。
- 使用 in-app Browser 实际验收 1440px Web 宽屏、750px 窄窗口和 390px 手机布局：小封面、标题、元信息与正文顺序正确，没有页面级横向滚动。
- 使用构建产物预览实际验收 Team / Room 文章：4 张正文图均解析为 `/actspace-agent/_astro/...`，懒加载触发后 `complete` 全部为 `true`，自然尺寸分别为 2516×1526、1449×905、4339×2481、4778×2278。
- 重启 8765 开发服务后再次验收同一文章：4 张正文图均由 `/actspace-agent/_image/` 提供，懒加载后自然尺寸与构建产物一致；浏览器已恢复到文章顶部。
- 刷新评估文章后，浏览器首段依次显示原文的“在构建Agent的时候……”与“感觉添加这个工具会有效……”，确认页面消费的是恢复后的原始正文。
- 浅色主题正文计算色为 `rgb(27, 28, 25)`，深色主题正文与元信息计算色为 `rgb(240, 242, 236)`；验证后已恢复用户原有的“跟随系统”主题和默认浏览器视口。
