# 更新日志内容契约与时间线重构

## 目标

把 `docs/releases/feature-release-notes.md` 从“功能域 / 用户价值 / 技术摘要”表格改为按发布日期组织的公开 Changelog，并让 `/updates` 直接展示“日期、发布标题、新功能、改进、问题修复”。内容依据 `docs/histories/` 与 Git 历史补全，页面采用 Multica 式历史导航与连续正文，不虚构版本号。

## 范围

- 包含：
  - 重写 `docs/releases/feature-release-notes.md`，覆盖 2026-05 至 2026-07 已确认的用户可见更新。
  - 更新 `docs/releases/README.md` 和官网设计文档中的 release 契约。
  - 更新 `packages/site/src/lib/releases/**` 的数据模型、Markdown AST 解析和测试。
  - 重做 `/updates` 的紧凑页头、日期导航、连续正文、滚动 active 状态和移动端布局。
  - 同步 history，并按规则判断是否需要 learning。
- 不包含：
  - 不创建或伪造 `v0.x.y` 版本号、Git tag 或远程发布通道。
  - 不把纯内部重构、测试数量、文件路径和底层协议细节复制到公开更新日志。
  - 不修改桌面端、官网首页、文档页或博客页的既有功能。

## 背景

- 相关文档：
  - `docs/releases/README.md`
  - `docs/design-docs/website-introduction-site-design.md`
  - `docs/HISTORY_GUIDE.md`
  - `docs/FRONTEND_VERIFICATION.md`
- 相关代码路径：
  - `packages/site/src/lib/releases/`
  - `packages/site/src/components/updates/UpdateTimeline.astro`
  - `packages/site/src/pages/updates/index.astro`
- 已知约束：
  - Release Markdown 是更新页唯一事实来源。
  - 工作区存在其他未提交改动，本任务只修改上述 release、updates、计划和 history 路径。
  - 所有颜色只消费 `packages/site/src/styles/tokens.css` 的语义变量，并验证浅色与深色。
  - 静态 HTML 在没有 JavaScript 时仍必须完整可读；滚动 active 只做渐进增强。

## 内容与数据契约

Release Markdown 使用以下结构：

```md
## 2026-07

### 2026-07-28 — 发布标题

#### 新功能

- 变化条目。

#### 改进

- 变化条目。

#### 问题修复

- 变化条目。
```

- 每个日期只允许一个 release；标题必须存在。
- 分类只允许“新功能 / 改进 / 问题修复”，没有内容的分类直接省略。
- 每个分类至少包含一个无嵌套的 Markdown 列表，列表项允许 inline code、强调和安全链接。
- 解析器校验日期、月份归属、重复日期、未知分类、空分类和非法内容，并保留源文件行号。
- 稳定锚点使用 `release-YYYY-MM-DD`，标题修改不改变 URL。

## 页面结构

- 页头收敛为“更新日志”与一行说明，不再使用占据半屏的大型营销 Hero。
- 桌面端左侧 sticky 历史导航按月份列出日期和发布标题，使用连续竖线、空心节点和当前实心节点。
- 右侧每个 release 依次展示日期、主标题、存在的分类和灰色项目列表；不使用卡片、标签或折叠摘要。
- active 状态通过 hash 与 `IntersectionObserver` 同步；禁用 JavaScript 时首条 active，所有锚点仍可用。
- 小屏取消双栏，历史导航变成横向月份跳转，正文中的日期位于标题上方，不产生页面级横向滚动。

## 风险

- 风险：历史内容很多，机械复制会把内部实现噪音带入公开页面。
  - 缓解：按发布日期聚合，只写用户能观察到的变化；History 和 Git Log 只作为证据。
- 风险：Markdown 契约变化会让构建期解析失效。
  - 缓解：先写新 fixture 和失败用例，再迁移源文件与页面；错误继续包含路径、月份和行号。
- 风险：sticky 导航或脚本遮挡内容、破坏键盘访问。
  - 缓解：保留原生链接与稳定锚点，设置 scroll margin，脚本只切换 `aria-current` 和 class。
- 风险：与现有官网未提交改动冲突。
  - 缓解：不修改当前已变更的首页、Docs、Blog 和共享站点组件；提交前逐路径检查 diff。

## 里程碑

1. 从 History 与 Git Log 整理日期级发布清单，确定分类和公开措辞。
2. 迁移 release Markdown、README、数据模型、解析器和测试。
3. 重做更新页时间线与响应式交互。
4. 同步设计文档和 history，完成工程、主题与浏览器验证。

## 验证方式

- 命令：
  - `pnpm test:site -- parse-release-notes`
  - `pnpm check:site`
  - `pnpm build:site`
  - `pnpm check:frontend-theme`
  - `pnpm check:docs`
  - `git diff --check`
- 浏览器检查：
  - `/updates` 桌面宽度与 375px 小屏。
  - 浅色、深色、跟随系统。
  - 左侧日期跳转、滚动 active、直接访问 hash。
  - 无横向滚动，标题层级与正文对比度清楚。
- 观测检查：
  - 构建产物只从根 release Markdown 生成。
  - 页面不存在“用户价值”“技术摘要”和伪造版本号。

## 进度记录

- [x] 阅读仓库、release、主题、前端验证和 history 规范。
- [x] 检查 2026-05 至 2026-07 History 与 Git Log，确认当前 release 的遗漏与噪音。
- [x] 完成新 release 内容与 Markdown 契约。
- [x] 完成解析器、模型和测试迁移。
- [x] 完成更新页布局、导航与渐进增强脚本。
- [x] 完成文档、history 和全量验证。

## 决策记录

- 2026-07-28：用户确认删除“功能域 / 用户价值 / 技术摘要”表格，改为“日期 + 标题 + 新功能 / 改进 / 问题修复”。
- 2026-07-28：同一天的多个功能合并为一次发布，避免历史导航重复日期和正文碎片化。
- 2026-07-28：没有正式版本号时只展示日期，不借用 Multica 的版本标签。
- 2026-07-28：History 与 Git Log 用于补证据，公开文案不复制内部实现细节。
