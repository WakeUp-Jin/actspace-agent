## [2026-09-26 08:40] | Task: 官网首页改版与全站轻量统一

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI（交互模式）`

### 📥 User Query

> 觉得官网“有点奇怪但说不上来”。先做 demo（`docs/design-docs/website-redesign-demo.html`）并确认首页方向；文档、博客、更新日志只做全站统一的轻量调整。开工前确认：紫色从“只用于 Logo、插画、引用”改为全站唯一强调色、每屏最多两处大面积使用。随后按执行计划实施。

### 🛠 Changes Overview

**Scope:** `apps/site` 首页、全站 token 与页头页脚、文档/博客/更新日志轻量调整、site 设计文档

**Key Actions:**

- **Token 与字体**：`tokens.css` 合并为单个 `:root`，新增 `--site-accent`（#6d4fc2）、`--site-accent-soft`、`--site-accent-line`、`--site-peach`；焦点框改紫、选区改浅紫；字体栈改为 SF + 苹方；删除只被旧组件使用的 `--site-hero-*`、`--site-inverse-*`、`--site-backdrop`。
- **Logo 透明化**：一次性脚本按“前景色与白色混合”反解边缘 α（不是按亮度），只处理连到边框的背景及 3px 边缘带；原图保留为 `actspace-logo-source.png`，同步 `public/media/actspace-logo.png`。
- **页头、按钮、页脚**：导航当前项改为 2px 紫条；页头半透明模糊；按钮间距 24→10px、字重 500、箭头悬停右移；站内链接统一 `→`，只有 GitHub 用 `↗`；页脚简化为 Logo + 导航 + 一行版权。
- **首页**：首屏两栏、“空间”着紫且不换行、首图换成真实任务 `review-workspace.png` 放在浅紫底板上贴底出血；能力清单改为白底卡片；更新条改为带紫色标签的整条链接；结尾 CTA 改为桃色卡片 + 博客角色插画。
- **展示区**：每张图放进 16:10 浅灰底板，按截图比例（构建期写入 `--shot-ratio`）完整居中；新增 6 段紫色进度条；每段 58vh；非当前段只淡化正文与标签；“了解Review”补空格；矮屏（高 < 700px）退回顺序流。
- **文档/博客/更新日志**：文档当前项加紫色左边线、正文链接紫色下划线、标题 600；博客复选框选中紫色、卡片悬停改为紫边上移；更新日志“产品更新”改为共享 `.site-tag`，`:target` 条目短暂浅紫高亮。
- **清理**：删除无引用的 `components/home/`（7 个组件）、`ThemeControl`、`theme.ts`、`product-showcase.ts`、`DocsSidebar/Toc/Tabs`、`docs-search.ts`。
- **截图清单**：`screenshots.json` 新增 36 `review-workspace.png`，`context-detail.png` 标为 `needs-retake`。

### 🧠 Design Intent (Why)

“说不上来的奇怪”来自三处：首图与上下文图是代码格式测试会话，和“能行动的空间”不符；展示区图片比例不一、整段 .35 透明像没加载完；首页全灰而博客彩色，像两个网站。改版让品牌紫克制地贯穿全站（线、点、字为主，大面积只用于首图底板和 CTA），首页借用博客角色插画把两边连起来。文档、博客、更新日志只跟随共享设置，不改版式。

### 📁 Files Modified

- `apps/site/src/styles/tokens.css`、`global.css`、`showcase.css`、`prose.css`、`blog.css`
- `apps/site/src/pages/index.astro`
- `apps/site/src/components/FeatureShowcase.astro`、`SiteFooter.astro`、`updates/UpdateTimeline.astro`
- `apps/site/src/scripts/showcase.ts`
- `apps/site/src/layouts/DocsLayout.astro`
- `apps/site/src/lib/screenshots.json`
- `apps/site/src/assets/brand/actspace-logo.png`（透明化）、`actspace-logo-source.png`（新增，原图）、`apps/site/public/media/actspace-logo.png`
- 删除：`apps/site/src/components/home/*`、`ThemeControl.astro`、`components/docs/Docs{Sidebar,Toc,Tabs}.astro`、`scripts/{theme,product-showcase,docs-search}.ts`
- 文档：`apps/site/DESIGN.md`、`SHOWCASE_PLAN.md`、`SCREENSHOTS.md`；`docs/exec-plans/active/20260926-site-homepage-redesign.md`、`docs/exec-runs/20260926-site-homepage-redesign/`

### 📚 Learning

写了学习速记 [给白底 Logo 去背景](../../learnings/2026-09/20260926-logo-white-background-matting.md)：浅色品牌色会被“按亮度算透明度”误伤，应按前景/背景混合反解 α 并限定处理范围。另一个小技巧只在这里提一句：底板里的图片用 `container-type: size` + `min(100cqw, 100cqh * 比例)` 按比例完整居中，图片未加载时也能占住正确位置。
