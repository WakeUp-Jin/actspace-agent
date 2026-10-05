---
status: current
owner: apps/site
product: ActSpace Website
last_updated: 2026-10-05
---

# ActSpace 官网与公开内容设计

官网工程位于 `apps/site`，承载产品介绍、使用文档、博客、更新日志和公开路线图。本页维护产品与内容边界；当前视觉和交互的唯一规范是 [apps/site/DESIGN.md](../../apps/site/DESIGN.md)，内容来源映射见 [CONTENT_SOURCES.md](../../apps/site/CONTENT_SOURCES.md)。

## 产品目标

让第一次访问的人理解 ActSpace 的用途，找到安装或源码运行入口，并用真实界面了解上下文、工具、权限与审阅。既有用户应能查到功能边界和最近变化，贡献者应能进入源码与协作资料。

首页围绕“给模型一个真正能行动的空间”组织说明。能力描述必须有当前实现或明确标注的未来计划支撑，不把历史设计、原型、自动化测试通过写成已经完成的产品体验。

## 页面与内容归属

| 页面 | 内容来源与职责 |
| --- | --- |
| `/` | 产品介绍、真实截图、快速开始与最近更新入口 |
| `/docs` | `apps/site/src/content/docs/`；维护面向使用者的说明，通过 CONTENT_SOURCES 映射当前源码和仓库文档 |
| `/blog` | `apps/site/src/content/blog/`；保留作者原文与来源，不因网站排版改写文章观点 |
| `/updates` | 构建时读取仓库 `docs/releases/feature-release-notes.md`，不维护第二份手写日志 |
| `/roadmap` | 仓库 `docs/roadmap.md` 的公开能力与计划，明确已完成和未来方向 |

仓库的 `docs/` 用于开发协作，不全量公开为网站栏目。执行计划、内部验收日志和迁移历史不直接复制成用户文档；公开功能页提炼使用方法、限制与排障信息。当前功能来源变动时，同步检查 CONTENT_SOURCES 中对应的公开页面。

博客搬运记录在 `apps/site/blog-migration.json`，记录来源、资源映射与正文摘要。文章正文图片与列表封面分别管理；历史文章保持原有语境，不自动成为当前架构事实。

## 更新日志契约

发布源使用 `## YYYY-MM` 分月、`### YYYY-MM-DD — 标题` 分条目、`#### 新功能 / 改进 / 问题修复` 分组，每组至少一个非空列表项。发布日期必须合法、属于所在月份且不重复；条目使用单段无嵌套列表。解析器错误需带来源位置，不能静默跳过格式错误。

解析入口为 `apps/site/src/lib/releases/parse-release-notes.ts`，行内 Markdown 经受控渲染。具体支持的媒体、链接和标签以 `render-inline-markdown.ts` 及测试为准，不能直接放开原始 HTML。发布内容的写法以 [发布记录指南](../releases/README.md) 为准。

## 视觉与资源

当前官网只提供浅色，使用品牌紫强调色和系统字体；桌面应用的主题规范不直接套用到网站。布局、组件、断点与交互由 apps/site/DESIGN.md 维护，本页不再保存另一套早期视觉方案。

- 真实截图、品牌与博客图片在 `apps/site/src/assets/` 维护，构建时按用途生成响应式资源。
- 缺少截图时明确说明要拍摄的页面和状态，不伪造应用画面或显示破图。
- 截图任务与完成状态见 [SCREENSHOTS.md](../../apps/site/SCREENSHOTS.md)，首页内容见 [SHOWCASE_PLAN.md](../../apps/site/SHOWCASE_PLAN.md)。
- [首页原型](website-redesign-demo.html) 是视觉对照，正式路由、正文与资源以 apps/site 为准。
- 图片预览、移动导航、复制与筛选必须支持键盘与窄屏；动态效果尊重 reduced-motion。具体验收点随视觉规范维护。

## 工程与部署

Astro 生成静态站点，Markdown 通过 content collections 和受控渲染链处理。站点地址与基础路径来自 `SITE_URL` / `SITE_BASE`；默认开发地址为 `http://127.0.0.1:8765/actspace-agent/`。站内链接和资源使用统一路径处理，兼容域名根路径与 GitHub Pages 子路径。

Netlify 使用根路径，GitHub Pages 保留手动备用部署；部署步骤见 [CI/CD](../CICD.md)。构建期生成 SEO 元数据与 sitemap，检查标题、描述、canonical 和资源路径，不在静态前端加入服务端凭证。

发布前检查外部链接、下载入口、示例配置和图片内容，避免暴露真实 API Key、个人路径、会话与浏览器私有数据。外链与媒体遵循实际渲染白名单；不能为了搬运文章解除 HTML 安全限制。

## 维护与验证

- 功能变化：更新对应公开文档和来源映射，必要时追加发布记录。
- 视觉变化：先更新 apps/site/DESIGN.md，再调整实现与截图要求；不重新维护相互冲突的设计副本。
- 网站实现变更执行 `pnpm --filter @actspace/site check`、`test`、`build`，并按视觉规范检查关键视口和交互。纯文档清理执行文档校验即可。
- 构建成功不代表截图、真实产品功能或视觉验收通过；未完成项仍由对应执行计划和截图清单跟踪。
