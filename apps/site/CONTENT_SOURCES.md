# 官网内容来源与维护

本文供维护者使用，维护官网的内容边界、页面归属和来源映射；视觉与交互的唯一规范是 [DESIGN.md](DESIGN.md)，截图任务见 [SCREENSHOTS.md](SCREENSHOTS.md)。官网功能文档依据当前 v2 文档与实现编写；博客保留作者原文，历史设计不自动视为当前能力。

## 产品目标

让第一次访问的人理解 ActSpace 的用途，找到安装或源码运行入口，并用真实界面了解上下文、工具、权限与审阅。既有用户应能查到功能边界和最近变化，贡献者应能进入源码与协作资料。

能力描述必须有当前实现或明确标注的未来计划支撑，不把历史设计、原型、自动化测试通过写成已经完成的产品体验。

## 页面与内容归属

| 页面 | 内容来源与职责 |
| --- | --- |
| `/` | 产品介绍、真实截图、快速开始与最近更新入口 |
| `/docs` | `src/content/docs/`；维护面向使用者的说明，通过下文来源映射对应当前源码和仓库文档 |
| `/blog` | `src/content/blog/`；保留作者原文与来源，不因网站排版改写文章观点 |
| `/updates` | 构建时读取仓库 `docs/releases/feature-release-notes.md`，不维护第二份手写日志 |
| `/roadmap` | 仓库 `docs/roadmap.md` 的公开能力与计划，明确已完成和未来方向 |

仓库的 `docs/` 用于开发协作，不全量公开为网站栏目。执行计划、内部验收日志和迁移历史不直接复制成用户文档；公开功能页提炼使用方法、限制与排障信息。功能来源变动时，同步检查下表对应的公开页面。

## 更新日志契约

发布源使用 `## YYYY-MM` 分月、`### YYYY-MM-DD — 标题` 分条目、`#### 新功能 / 改进 / 问题修复` 分组，每组至少一个非空列表项。发布日期必须合法、属于所在月份且不重复；条目使用单段无嵌套列表。解析器错误需带来源位置，不能静默跳过格式错误。

解析入口为 `src/lib/releases/parse-release-notes.ts`，行内 Markdown 经受控渲染；支持的媒体、链接和标签以 `render-inline-markdown.ts` 及测试为准，不能直接放开原始 HTML。发布内容的写法以 [发布记录指南](../../docs/releases/README.md) 为准。

## 功能文档来源

页面在 `src/content/docs/`。下列来源相对仓库根目录；实现与旧设计不一致时，以当前实现和最新执行摘要为准。

| 官网页面 | 事实来源 |
| --- | --- |
| [ActSpace 是什么](src/content/docs/what-is-actspace.md) | `README.md`、`docs/README.md`、`docs/ARCHITECTURE.md` |
| [快速开始](src/content/docs/getting-started.md) | `README.md`、`package.json`、`apps/site/package.json` |
| [完成第一个任务](src/content/docs/first-task.md) | `docs/design-docs/frontend/front-聊天输入框规范.md`、`docs/design-docs/core-review-change-sources.md`、`docs/design-docs/execution-safety/README.md` |
| [工作区与 Git Worktree](src/content/docs/workspaces.md) | `docs/design-docs/frontend/front-workspace-git-worktree-context.md`、`docs/design-docs/frontend/front-左侧会话栏规范.md` |
| [会话管理与分支](src/content/docs/sessions.md) | `docs/design-docs/frontend/front-左侧会话栏规范.md`、`docs/exec-plans/completed/20260915-progressive-session-loading.md` |
| [模式与输入](src/content/docs/modes-and-input.md) | `docs/design-docs/frontend/front-聊天输入框规范.md`、`apps/desktop/src/renderer/components/Composer.tsx` |
| [配置模型](src/content/docs/configure-a-model.md) | `README.md`、`docs/design-docs/model-context/agent-multi-provider-llm.md`、`apps/desktop/src/renderer/components/settings/models/ModelsPage.tsx`、`apps/desktop/src/renderer/components/settings/models/ConnectionDetailPage.tsx` |
| [模型选择与思考设置](src/content/docs/model-selection.md) | `docs/design-docs/model-context/agent-multi-provider-llm.md`、`docs/design-docs/model-context/agent-context-model-facts-and-composer.md`、`docs/design-docs/model-context/agent-model-catalog-and-usage-cost.md` |
| [上下文与压缩](src/content/docs/context.md) | `docs/design-docs/model-context/agent-token-usage-and-context-state.md`、`docs/design-docs/model-context/agent-context-model-facts-and-composer.md`、`packages/context/context-compaction/README.md`、`packages/context/context-compaction/src/plugin.ts` |
| [Token、缓存与费用](src/content/docs/usage.md) | `docs/design-docs/frontend/front-设置页规范.md`、`docs/design-docs/model-context/agent-model-catalog-and-usage-cost.md` |
| [文件读写与检索](src/content/docs/files-and-search.md) | `packages/fs/tool-fs-read/src/plugin.ts`、`docs/design-docs/index.md`、`docs/exec-plans/completed/20260913-tool-artifact-provider-image-ux.md` |
| [Bash 与后台任务](src/content/docs/bash.md) | `packages/shell/tool-shell/src/node-ports.ts`、`docs/design-docs/execution-safety/README.md` |
| [权限与审批](src/content/docs/tools-and-approvals.md) | `docs/design-docs/execution-safety/README.md`、`docs/design-docs/frontend/front-聊天输入框规范.md` |
| [联网搜索与网页读取](src/content/docs/web-tools.md) | `docs/design-docs/tool-system/agent-web-tools.md`、`apps/desktop/src/renderer/components/settings/SettingsPage.tsx` |
| [Browser Use](src/content/docs/browser.md) | `browser-bridge/README.md`、`browser-bridge/skill/SKILL.md`、`docs/design-docs/browser/agent-browser-use-index.md` |
| [图片理解与生成](src/content/docs/images.md) | `docs/design-docs/tool-system/agent-image-inspection-tool.md`、`docs/design-docs/tool-system/agent-image-generation-tool.md`、`apps/desktop/src/renderer/components/settings/SettingsPage.tsx`、`docs/exec-plans/completed/20260913-tool-artifact-provider-image-ux.md` |
| [文件预览](src/content/docs/file-preview.md) | `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`、`docs/exec-plans/completed/20260913-tool-artifact-provider-image-ux.md` |
| [代码审阅与 Git 操作](src/content/docs/review.md) | `docs/design-docs/core-review-change-sources.md` |
| [Skills](src/content/docs/skills.md) | `docs/design-docs/tool-system/agent-skill-loading.md` |
| [子 Agent 与 Explore](src/content/docs/subagents.md) | `packages/subagent/subagent/src/preset.ts`、`docs/design-docs/collaboration/agent-subagent-runtime.md`、`docs/exec-plans/completed/20260915-readonly-subagents.md` |
| [英语辅助学习](src/content/docs/english-learning.md) | `docs/design-docs/agent-plugin-runtime/agent-english-learning.md` |
| [设置与本地数据](src/content/docs/settings-and-data.md) | `apps/desktop/src/renderer/components/settings/SettingsNav.tsx`、`apps/desktop/src/renderer/components/settings/SettingsPage.tsx`、`README.md` |
| [常见问题](src/content/docs/troubleshooting.md) | `README.md`、`docs/design-docs/frontend/front-聊天输入框规范.md`、`docs/design-docs/frontend/front-workspace-git-worktree-context.md`、`docs/design-docs/model-context/agent-context-model-facts-and-composer.md` |
| [命令行使用](src/content/docs/cli.md) | `README.md`、`apps/cli/src/args.ts`、`apps/cli/package.json` |
| [一次 Agent 执行](src/content/docs/agent-turn.md) | `docs/ARCHITECTURE.md`、`docs/design-docs/agent-plugin-runtime/agent-task-run-lifecycle.md`、`packages/context/context-compaction/README.md` |
| [开发与贡献](src/content/docs/contributing.md) | `AGENTS.md`、`docs/REPO_COLLAB_GUIDE.md`、`docs/ARCHITECTURE.md`、`package.json` |

## 博客搬运规则

`blog-migration.json` 记录 Practical 源路径、正文摘要、资源映射与 SHA-256。9 篇相关文章中 5 篇既有、4 篇本次新增。原项目文件保留，官网仅添加元数据和调整呈现所需路径，不改写正文与代码。

新增文章日期采用当前源路径在 Git 中首次加入的日期，用作站点排序依据，不声称已确认作者首次公开发表日期。HTML 图片转为 Markdown 图片，以进入 Astro 资产管线；Grep/Glob 文章的 VitePress details 语法适配成原生 details，折叠内容不变。

36 张 Practical 本地图片逐一核对内容哈希。现有评估文章原有飞书鉴权地址失效，改用用户提供的 `1280X1280.PNG`，保存为 `src/assets/blog/source/evaluation/architecture.png`；正文和插图位置不变。Context 文章原本没有正文配图，保留无图形式。列表封面是独立的角色插画，不替代文章正文配图。

## 图片与链接

正文图片放入 `src/assets/`，通过 Markdown 相对路径引用，使 Astro 正确处理部署基础路径。不要使用带鉴权参数的临时图片链接。迁移时同时处理 Markdown 图片、HTML img 和图片引用定义，不能只检查一种语法。

文档截图按 [SCREENSHOTS.md](SCREENSHOTS.md) 补充。占位是可读说明，不生成失效图片请求；补图后删除对应占位并更新清单。站内文档链接使用相邻路由，例如 `../context/`，新增页面需要同步内容 schema 和侧栏分组。构建时 docsLinks 将文档相对链接解析为含部署基础路径的地址，保证欢迎文档在 /docs/ 和自身路由下都能正确跳转。

## 验证

站点地址与基础路径来自 `SITE_URL` / `SITE_BASE`，站内链接和资源统一经过路径 helper，兼容域名根路径与 GitHub Pages 子路径；构建期生成 SEO 元数据与 sitemap，不在静态前端加入服务端凭证。发布前检查外部链接、下载入口、示例配置和图片内容，避免暴露真实 API Key、个人路径、会话与浏览器私有数据；外链与媒体遵循实际渲染白名单，不能为了搬运文章解除 HTML 安全限制。图片预览、移动导航、复制与筛选必须支持键盘与窄屏，动态效果尊重 reduced-motion。

运行 `pnpm check:site`、`pnpm test:site`、`SITE_URL=https://example.com SITE_BASE=/ pnpm build:site` 与 `pnpm check:docs`。构建后检查 Netlify 根路径下的文档链接、图片、博客筛选与文章折叠代码；GitHub Pages 手动备用部署使用 `/actspace-agent/` 基础路径。部署步骤见 [CI/CD 说明](../../docs/CICD.md)。网站内容验证不代替真实模型、Chrome 或 Electron 功能验收。
