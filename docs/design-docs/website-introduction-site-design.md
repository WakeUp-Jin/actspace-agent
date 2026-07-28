---
status: implemented-v1
owner: packages/site
product: ActSpace Website
visual_direction: Cloudfield & Ink
last_updated: 2026-07-27
---

# ActSpace 官网、文档、博客与更新页设计规范

## 1. 文档定位

本文档定义 ActSpace 对外网站的长期产品、内容、视觉和交付边界。首版工程已在 `packages/site` 落地；后续迭代继续以本文档作为事实与取舍入口。

网站包含四个主要产品面：

- `/`：ActSpace 产品介绍主页。
- `/docs`：公开使用文档。
- `/blog`：产品与技术博客。
- `/updates`：面向用户的功能更新记录。

本文档回答为什么做、做成什么样、内容从哪里来以及实现必须遵守哪些边界。具体依赖版本、文件创建顺序、GitHub Actions 配置和分阶段开发步骤应在实施前另写 execution plan。

## 2. 产品目标

ActSpace 官网不是桌面应用界面的网页复制，也不是只用于展示一句口号的单页海报。它需要同时完成四件事：

1. 在首屏说明 ActSpace 是什么，以及它和普通聊天界面的区别。
2. 用真实产品界面证明 Context、Tools、Browser、Skills、Usage 和 Kairos 已经形成可检查的运行空间。
3. 给第一次接触项目的人一条清楚的上手路径。
4. 持续承载公开文档、项目文章和用户可感知的更新记录。

核心叙事保持：

> 给模型一个真正能行动的空间。

补充解释保持克制和可验证：

> ActSpace 是一个本地优先的 Agent 桌面应用与 Harness。看见上下文、控制成本，让模型在真实工具和权限边界中完成工作。

网站不得使用“革命性”“无限可能”“颠覆一切”等无法验证的空泛营销语言。优先展示实际界面、真实能力边界、开源仓库和可执行的开始路径。

## 3. 目标用户与关键任务

### 3.1 目标用户

- 想寻找可本地运行、可检查执行过程的 Agent 桌面工具的开发者。
- 想理解 Agent Runtime、Context、Tools、权限、Usage 和自治模式如何组成完整系统的工程人员。
- 想从源码运行、改造或参与 ActSpace 的开源贡献者。
- 已经使用 ActSpace，需要查询配置、能力边界和最近变化的现有用户。

### 3.2 用户进入网站后的主要任务

- 在 10 秒内理解项目定位。
- 查看真实产品截图，而不是只阅读抽象功能描述。
- 找到安装或源码运行说明。
- 查阅某一项功能的公开文档。
- 了解最近新增了什么，以及变化对用户有什么价值。
- 阅读项目背后的产品判断、技术设计和开发故事。
- 前往 GitHub 查看源码、Issue 和 Release。

## 4. 内容与仓库边界

### 4.1 工程位置

官网工程固定放在：

```text
packages/site
```

当前 `pnpm-workspace.yaml` 已覆盖 `packages/*`，因此实现官网时不需要新增 `apps/*` 工作区层级。

目标目录结构：

```text
packages/site/
├── package.json
├── astro.config.mjs
├── tsconfig.json
├── public/
│   ├── brand/
│   ├── hero/
│   └── screenshots/
└── src/
    ├── components/
    ├── content/
    │   ├── docs/
    │   └── blog/
    ├── layouts/
    ├── lib/
    │   └── releases/
    ├── pages/
    │   ├── index.astro
    │   ├── docs/
    │   ├── blog/
    │   └── updates/
    └── styles/
```

这是目标结构，不要求第一轮一次性创建所有空目录。实现时按真实页面和模块需要创建，避免空壳工程。

### 4.2 内容事实来源

| 内容 | 唯一事实来源 | 网站行为 |
|---|---|---|
| 产品主页 | `packages/site` 页面与内容配置 | 直接构建为 `/` |
| 公开文档 | `packages/site/src/content/docs` | 生成 `/docs/**` |
| 博客 | `packages/site/src/content/blog` | 生成 `/blog/**` |
| 功能更新 | `docs/releases/feature-release-notes.md` | 构建时解析为 `/updates` |
| 内部设计与实现记录 | `docs/design-docs`、`docs/histories`、`docs/exec-plans` | 默认不公开 |

不得把仓库 `docs/` 整体直接发布成公开文档站。内部设计、history、质量记录、执行计划和安全说明只有经过明确选择和重新组织后，才能成为公开内容。

### 4.3 站点技术方向

首版推荐使用 Astro 的静态输出能力和 Markdown / MDX 内容集合，理由是网站以内容和静态页面为主，不需要常驻后端、数据库或客户端 SPA Runtime。

约束如下：

- `packages/site` 是私有 workspace package，不作为 npm 包发布。
- 首版必须能够完整静态构建。
- 页面默认不依赖服务端 API 才能展示核心内容。
- JavaScript 只用于主题、导航、搜索、展示切换和必要微交互。
- 具体 Astro、Markdown parser 和 GitHub Action 版本在实施阶段依据官方文档核对，并锁进 `package.json` 与 lockfile。
- 仓库中的 GitHub Action 继续 pin 到 commit SHA，不使用浮动 tag。

## 5. 信息架构

### 5.1 一级导航

正式顶部导航为：

```text
ActSpace    文档    博客    更新             GitHub ↗    开始使用
```

路由行为：

| 项目 | 路由 | 说明 |
|---|---|---|
| ActSpace | `/` | 返回主页顶部 |
| 文档 | `/docs` | 进入公开文档首页 |
| 博客 | `/blog` | 进入博客列表 |
| 更新 | `/updates` | 进入功能更新时间轴 |
| GitHub | 外部仓库地址 | 新标签页打开，并明确外链语义 |
| 开始使用 | `/docs/getting-started` | 进入安装与首次运行文档 |

“产品”“能力”“架构”不占用一级菜单。主页只保留必要的产品叙事和能力展示，不在顶部导航混合站内页面与单页锚点。

在正式签名、notarization 和稳定公共下载通道完成前，“开始使用”不能伪装为一键下载安装，而应进入真实可执行的源码运行与本地构建说明。

### 5.2 页脚

页脚至少包含：

- 产品：核心能力、开始使用。
- 资源：文档、博客、更新。
- 社区：GitHub、Issue。
- 法务与状态：Apache-2.0、版权信息；隐私或遥测说明在真实需要时加入。

不得为了填满页脚加入不存在的 Discord、Twitter、商业支持、云服务状态页或下载平台。

## 6. 主页内容结构

### 6.1 Hero：空间建立

Hero 使用已确认的 `C Cloud Expanse` 云海图作为首版主视觉母版。它需要覆盖标题、说明、按钮和产品界面展示区，形成一个连续场景。

内容顺序：

1. `LOCAL-FIRST AGENT RUNTIME` 小型 eyebrow。
2. 主标题“给模型一个真正能行动的空间。”
3. 一段不超过两行到三行的产品解释。
4. 主 CTA“探索 ActSpace”或“开始使用”。
5. 次 CTA“查看源代码”。
6. Context、Tools、Browser、Skills、Kairos 能力索引。
7. 从首屏下方进入的真实桌面产品截图。

视觉约束：

- 背景图必须是 Hero 的单一连续媒体层，不能在标题与产品截图之间切断。
- 产品截图下方仍应保留足够背景空间，再过渡到正文色块。
- 背景叠加渐变与暗角只服务于文字对比度，不使用明显滤镜制造霓虹科技感。
- 桌面端尽可能保留云海横向空间和两侧结构；移动端允许裁掉边缘结构，优先保护标题、中央光源、云层和产品截图。
- 图片不得承载文字，因此不同语言或文案变化不需要重新生成 Hero。

### 6.2 产品判断

第二段从图像叙事切换到编辑式文字叙事：

> 不是另一个聊天窗口，而是模型的运行空间。

该 section 解释：

- Agent 的价值不只在生成答案。
- 模型需要持续获得正确 Context。
- 工具调用需要明确权限和可检查状态。
- 成本、缓存和执行历史需要可追溯。
- ActSpace 把这些能力放入同一个本地工作台。

页面应使用大标题、宽留白和短段落，不把产品判断拆成大量营销卡片。

### 6.3 产品价值表达

“看见上下文”“控制执行”“主动 Agent”和“成本透明”不再单独重复为一段抽象价值列表，而是在产品界面展示中与真实截图、用户价值和文档入口绑定。首页避免连续出现两段含义相同的产品判断。

### 6.4 产品界面展示

真实产品界面是 ActSpace 最重要的品牌素材。首页展示顺序固定为：

1. Context：上下文组成和 token 占用。
2. Tools：工具执行、审批和结果反馈。
3. Kairos：主动观察、运行轨迹和通知。
4. Usage：成本、token 和缓存透明度。

Browser、Skills、Review 等能力继续在 Hero 索引、公开文档和后续内容中说明；没有合适公开截图时，不用不相关界面补足首页 Tab 数量。

展示组件可以使用左侧文字索引加右侧大图，或上方横向 tab 加下方大图。切换时只做短促淡入和轻微位移，不做 3D 翻转、自动轮播或持续缩放。

每一项必须包含：

- 能力名称。
- 一句用户价值。
- 一张当前真实截图。
- 必要时链接到对应公开文档。

### 6.5 内容页面边界

架构拓扑、开发边界和贡献方式进入公开文档，不在产品首页重复展开。博客与更新日志保留一级导航和独立列表页，首页不自动铺文章卡片或更新时间轴，避免产品介绍被持续内容截断。

公开文案只能描述仓库已经确认的事实。不得暗示未实现的云端运行、账号同步、多人在线协作或正式自动更新。

### 6.6 最终行动区

最终 CTA 强调项目所有权和开源边界：

> 这是你的运行空间。

主要操作为“开始使用”，次要操作为“在 GitHub 查看”。

## 7. 文档站设计

### 7.1 公开文档边界

首版公开文档建议包含：

```text
开始使用
  - ActSpace 是什么
  - 环境要求
  - 从源码运行
  - 本地构建与安装
  - 配置第一个模型
  - 完成第一个任务

核心概念
  - Agent Turn
  - Context
  - Tools 与审批
  - Workspaces 与本地数据
  - Usage 与成本

功能指南
  - Browser
  - Skills
  - Explore / SubAgent
  - Kairos
  - Review 与文件预览

开发与贡献
  - 仓库结构
  - 本地开发
  - 测试与验证
  - 插件
  - 贡献指南
```

公开文档应面向使用者和贡献者重新组织，不直接按内部设计文档目录结构生成导航。

### 7.2 文档首页

文档首页不是普通文章页，而是从产品认知进入具体指南的入口。整体参考 [Cursor Docs](https://cursor.com/cn/docs) 的任务导向首页，但使用 ActSpace 自己的内容和视觉语言。

首页内容顺序：

1. `ActSpace 文档` 标题和一段产品解释。
2. 一张当前真实的桌面应用截图。
3. “从这里开始”入口组。
4. “你可以用 ActSpace 做什么”任务入口。
5. 公开文档分组和更多资源。

首版“从这里开始”建议包含：

```text
快速开始      配置模型      核心概念
Browser       Skills        Kairos
```

- 入口卡片只用于文档首页和明确的任务分流，不扩散到所有文章导航。
- 每张入口卡片包含标题和一句任务结果，不能只写功能名称。
- 首页截图服务于建立产品认知，不代替具体操作说明。
- 首页避免直接展示长模型表格、完整 API reference 或全部功能清单。

### 7.3 文档文章布局

具体文档文章采用类似 [Claude Code Docs](https://code.claude.com/docs/en/overview) 的“分类导航 + 三列阅读”骨架：

```text
全局网站导航

开始使用 / 工作原理 / 能力指南 / 开发者        搜索

左侧文档导航 | 文章正文 | 当前页面目录
```

全局网站导航继续承载“文档、博客、更新”等站点入口；文档分类导航只在 `/docs/**` 内出现，用来切换公开文档的四个稳定领域。`/docs` 归入“开始使用”，并在左侧以“概览”作为当前入口，不额外增加第五个顶部 Tab。

文章区域规则：

- 左侧导航保持紧凑列表，不使用卡片式目录。
- 顶部分类只切换知识领域，左侧只展示当前领域的文章；移动端允许折叠，但桌面和常见分屏宽度不把所有页面平铺到正文上方。
- 当前页面使用中性 selected surface，不使用绿色或彩色大底。
- 正文使用稳定阅读宽度，不能随超宽屏无限拉伸。
- 右侧目录只显示当前页面二级、三级标题。
- 页面顶部显示标题、描述和最后更新时间。
- 上一篇 / 下一篇只在同一文档分组内移动。
- 移动端把左右导航收进可访问的抽屉或折叠入口。
- 技术文档标题和正文都使用无衬线字体，保持工具手册的清晰感；博客的衬线标题不进入 Docs。

响应式收口顺序固定为：先隐藏右侧页内目录，再隐藏左侧文档导航。约 900–1000px 的桌面分屏仍保留左侧列表；只有进入手机宽度后，左侧列表才收进当前分类的折叠入口。

文档顶部搜索应是稳定入口。首版不加入“向 AI 提问”按钮；只有真实检索、引用和回答边界完成后，才能增加该能力，不能用装饰性输入框伪装成已实现功能。

### 7.4 文档内容 Schema

文档 frontmatter 至少包含：

```yaml
title: 配置第一个模型
description: 连接服务商并在 Composer 中选择可用模型。
section: getting-started
order: 40
updatedAt: 2026-07-27
draft: false
```

可选字段包括 `redirectFrom`、`keywords` 和 `tocDepth`。导航顺序必须来自显式 `section + order`，不能依赖文件系统枚举顺序。

### 7.5 搜索

首版搜索应基于静态构建产物生成本地索引，不要求远端搜索服务。搜索结果至少区分 Docs、Blog 和 Updates，并展示标题、摘要、类型和命中片段。

如果第一阶段工期有限，可以先交付无搜索版本，但导航与 URL 结构不能依赖未来搜索能力才能使用。

### 7.6 页面工具

- 代码块复制属于首版可用工具。
- “复制页面 Markdown”可以后续加入，优先级低于正确导航、搜索和内容质量。
- 页面反馈入口只有在存在真实 Issue 模板或反馈通道时才显示。
- 不加入账号相关收藏、阅读历史和评论功能。

## 8. 博客设计

### 8.1 内容定位

博客不是第二份 release notes。适合发布：

- 产品设计判断。
- Agent Runtime、Context、工具和权限等机制解析。
- 重要功能从问题到方案的开发故事。
- 项目阶段总结与路线思考。
- 可迁移到其他 Agent 项目的工程经验。

不适合发布：

- 只有内部文件变动的流水账。
- 没有用户或工程价值的 commit 汇总。
- 与 release 更新页完全重复的短条目。

从已有长文导入博客时，原始文件是正文内容的唯一事实来源。未经作者单独授权，不得改写、压缩、补充或按当前实现重新校正文意；只允许适配 Frontmatter、标题层级、资源路径和 Markdown 渲染格式，并且应通过机械对比确认适配后的正文仍可还原为原文。

博客正文配图默认随仓库版本管理，存放在 `packages/site/src/assets/blog/`，并由 Astro 的本地图片管线生成带部署 `base` 的构建 URL。当前保留原始图片、不要求构建时变换，因此站点使用 Astro passthrough image service，避免为静态图示引入 Sharp 原生依赖。`src/content/blog/*.md` 使用 `../../assets/blog/` 形式引用这些源码资源；不得使用绕过 base 的 `/images/` 根路径，也不得硬编码 `/actspace-agent`。不为当前约 3 MB 的静态图示引入独立云存储，只有视频、用户上传或需要独立生命周期的大型媒体资源再评估对象存储与 CDN。

### 8.2 博客 frontmatter

```yaml
title: 为什么 Agent 需要一个可见的运行空间
description: 从上下文、工具、审批和成本解释 ActSpace 的产品出发点。
publishedAt: 2026-07-27
updatedAt: 2026-07-27
authors:
  - WakeUp-Jin
tags:
  - Agent
  - Product Design
draft: false
cover: /blog/agent-runtime-space.webp
```

文章 slug 来自稳定文件名或显式字段，发布后不得因为标题调整而随意变化。

### 8.3 博客首页

博客首页以 [Claude Blog](https://claude.com/blog) 的视觉卡片体验为主要参考。ActSpace 的博客应该像一本有封面的技术杂志，而不是文档目录或更新日志的重复。

桌面端默认使用三列卡片，平板两列，手机单列：

```text
Blog
关于 Agent、工具、上下文与产品设计的思考。

[全部] [产品] [Agent] [工程] [设计]              [搜索]

┌────────────┐ ┌────────────┐ ┌────────────┐
│ 视觉封面     │ │ 视觉封面     │ │ 视觉封面     │
├────────────┤ ├────────────┤ ├────────────┤
│ 日期         │ │ 日期         │ │ 日期         │
│ 文章标题      │ │ 文章标题      │ │ 文章标题      │
│ 分类 · 阅读时间│ │ 分类 · 阅读时间│ │ 分类 · 阅读时间│
└────────────┘ └────────────┘ └────────────┘
```

卡片规则：

- 上部视觉封面约占卡片高度的 45%–55%。
- 下部包含日期、标题、主要分类和阅读时间。
- 标题是卡片最强文字层级，分类不使用高饱和 badge 抢夺注意力。
- 卡片使用 warm canvas、hairline 和适度圆角，不叠加厚阴影。
- hover 以图片轻微位移、边框或标题变化表达，不让整张卡片夸张放大。
- 整张卡片是同一个可访问链接，内部不能嵌套额外链接。

第一阶段不复制 Claude 的常驻左侧复杂筛选栏。文章数量较少时只提供顶部分类和搜索；排序默认按发布日期倒序。

### 8.4 博客封面系统

ActSpace 不复制 Claude 的手绘手掌或外部品牌插画。封面分成三种稳定来源：

1. **产品文章**：真实 ActSpace 界面或经过脱敏的局部截图。
2. **技术文章**：架构拓扑、代码结构、事件流或数据关系图。
3. **产品思考**：云海、远程空间和线性结构组成的抽象视觉笔记。

封面色板从以下低饱和家族选择：

```text
Cloud Blue
Fog Gray
Moss Green
Dust Rose
Muted Violet
Warm Sand
```

- 每篇文章选择一个主色家族，不在单张封面中堆多组渐变。
- 封面不能使用通用 AI 光球、紫色霓虹或无内容关系的生成图。
- 同一系列文章应共享可识别的构图语法。
- 封面必须在浅色和深色卡片外壳中都成立。

### 8.5 博客文章页

文章阅读体验参考 [Claude 的编辑式文章页](https://claude.com/blog/how-the-product-designer-who-built-claude-design-uses-it-to-explore-ideas-before-building-them)：

- 正文阅读列约 600–680px，避免超宽正文。
- 文章头部按“小型封面 → 标题与摘要 → 附加元信息 → 正文”的语义顺序组织，不使用通栏大封面打断阅读入口。
- 小型封面保留原始构图比例，作为文章的视觉识别章；不为了模仿参考页面而强制裁成正方形。
- Web 宽屏中，标题与摘要占主列，分类、作者、发布日期和阅读时间组成右侧元信息列；窄屏按语义顺序纵向排列。
- 中文博客标题与 H2 允许使用适合长文阅读的衬线字体；正文、元数据、代码和控件继续使用无衬线或等宽字体。
- 正文基础字号建议为 17–20px，并保持舒适行高。
- 正文使用主题主文字色 `Ink`；`Body` 和 `Muted` 只用于摘要、说明与元信息，浅色主题下不能让正文呈现为低对比度灰字。
- 图片、表格、架构图和代码示例可以突破正文列，最大扩展到内容容器宽度。
- 标题层级保持清楚，不在正文 H2 前强制添加装饰性 `#`。
- 文章结尾展示相关文档、GitHub 链接和最多三篇相关文章。
- 不加入无实际后端的评论区。

博客的衬线排版是内容出版语气，不改变主页、Docs 或桌面端的无衬线产品语言。

### 8.6 归档增长策略

[Cursor Blog](https://cursor.com/cn/blog) 的紧凑列表适合大量文章归档，但不作为 ActSpace 首版默认布局。

- 文章少于约 20 篇时只提供卡片网格。
- 内容增长后可以增加 Grid / List 切换。
- List 模式展示日期、分类、标题、作者和阅读时间。
- Grid 与 List 必须消费同一份内容数据和筛选状态。
- 不为尚不存在的大规模内容提前建设多维企业级筛选器。

## 9. 更新页与 release 解析

### 9.1 唯一数据源

更新页唯一数据源为：

```text
docs/releases/feature-release-notes.md
```

该文件遵守以下约定：

- 按 `## YYYY-MM` 分月。
- 每个日期使用 `### YYYY-MM-DD — 发布标题`，同一天只对应一次发布。
- 发布内容按“新功能 / 改进 / 问题修复”分类，没有内容的分类直接省略。
- 同月内最新内容在最上面。
- 只记录用户可感知的变化，不复制实现路径、测试数量和内部重构过程。
- 不等同于正式版本号、Git tag 或远程发布通道。

网站不得在 `packages/site` 内复制一份 updates JSON 或 Markdown 快照作为第二事实来源。

### 9.2 规范化数据模型

构建时将 release Markdown 规范化为：

```ts
interface ReleaseEntry {
  date: string
  month: string
  title: string
  sections: Array<{
    type: "feature" | "improvement" | "fix"
    itemsHtml: string[]
  }>
  anchor: string
  sourcePath: "docs/releases/feature-release-notes.md"
}
```

其中：

- `date` 为 `YYYY-MM-DD`。
- `month` 来自所属 `## YYYY-MM` 标题，并与日期交叉校验。
- `title` 是该发布日期的编辑式标题。
- `sections` 只包含源文件实际存在的分类，列表项保留安全的行内 Markdown。
- `anchor` 固定为 `release-YYYY-MM-DD`；标题微调不破坏已经分享的链接。

### 9.3 解析规则

- 使用 Markdown AST 解析器，不使用按行正则作为主要实现。
- 只解析 `## YYYY-MM` 下的 `### YYYY-MM-DD — 发布标题`、四级分类标题和无序列表。
- 分类只允许“新功能 / 改进 / 问题修复”，同一次发布不能重复分类。
- 每个日期只允许一次发布，每个已出现的分类至少包含一个单段、无嵌套的列表项。
- 保留列表项中的 inline code、强调、链接等行内 Markdown 语义，并清理原始 HTML、脚本和危险 URL。
- 校验日期格式、月份归属、重复日期、未知分类、空分类和非法内容。
- 解析结果再次按日期倒序，避免页面正确性完全依赖人工排序。
- 格式错误时构建失败，并报告源文件、月份和可定位的行信息。
- History 与 Git Log 只用于撰写时核对完成范围，构建过程不能从它们自动猜测公开文案。

解析路径必须从仓库根或显式配置解析，不能假设 CI 的 `process.cwd()` 永远等于 `packages/site`。

### 9.4 更新页表现

更新页以 [Multica Changelog](https://multica.ai/changelog) 的“历史导航 + 连续正文”结构为主要参考：

```text
左侧历史导航            右侧更新正文

2026 年 7 月             更新日志
28  图片生成与模型体验    2026 年 7 月 28 日
26  会话分支与执行反馈    图片生成、DuckCoding 与更清晰的模型体验
25  多供应商模型          新功能
                         · 主 Agent 可以生成图片……
                         改进
                         · 模型等待时显示运行提示……
```

左侧历史导航：

- 按月份分组，并列出当月存在更新的日期与发布标题。
- 当前更新使用实心节点、文字强调和 `aria-current`；滚动、点击与直接访问 hash 时保持一致。
- 桌面端 sticky 且允许独立滚动；移动端收口为横向月份跳转。
- 当前 release 数据没有正式版本号，因此禁止仿造 `v0.x.y` 标签。

右侧连续时间轴：

```text
2026 年 7 月 26 日
会话分支、执行反馈与可视化恢复

新功能
· 现有会话可以分叉成独立的新会话……

改进
· 每个工具按自己的完成时间立即更新……

问题修复
· 修复回复可视化偶尔显示空白面板的问题……
```

- 日期作为视觉锚点，但不能比功能名称更抢眼。
- 发布标题使用清晰的大标题，分类标题和灰色列表项形成稳定阅读层级。
- 不展示“功能域”“用户价值”“技术摘要”标签，不使用折叠摘要。
- 同一天的变化聚合为一次发布，避免正文和历史导航碎片化。
- 日常更新不使用独立卡片、Hero 图片、营销 CTA 或装饰性动画。
- 无 JavaScript 时所有内容和锚点仍可阅读；滚动 active 只作为渐进增强。
- 更新页和未来任何 release 摘要入口必须复用同一规范化数据。

[Cursor Changelog](https://cursor.com/cn/changelog/router) 的独立富媒体发布页只作为未来重大版本的可选模式。只有某项更新确实拥有独立文章、截图、视频或迁移说明时，时间轴条目才可以链接到详情页；普通 release 条目不为追求丰富度而自动生成空洞详情页。

## 10. 视觉系统

### 10.1 系统关系

桌面端继续使用：

> ActSpace Editor Design System — Ink & Emerald / 墨色与翡翠绿

网站使用它的叙事化延伸：

> ActSpace Web — Cloudfield & Ink / 云境与墨色

两者共享语义职责，不共享完全相同的密度和组件外观：

- Neutral：承载主要空间和信息层级。
- Ink Action：承载最重要操作。
- Emerald Operational：只表达运行、连接、开启和成功。
- Semantic：warning、danger、info 独立。
- Visualization：图表和 Context 数据颜色独立。

官网不能成为“黑绿科技站”，也不能复制 Cursor Orange。它的记忆点来自云海空间、真实产品界面、编辑式排版和克制的 operational green。

### 10.2 主题机制

网站支持 `light`、`dark` 和 `system` 三态：

- 颜色只通过 `--site-color-*` 语义变量消费。
- `system` 使用 `prefers-color-scheme` 翻转。
- 主题选择可持久化，但在 JavaScript 不可用时仍应正常阅读。
- Hero 图片属于媒体内容，可保持同一图片；其遮罩、导航文字、边框和浮层必须适配主题。
- 不能在普通组件中直接使用 `text-black`、`bg-white` 或主题相关 hex 字面量。

网站 token 与桌面 renderer token 分开维护，避免营销站改动意外改变 Electron 界面；命名职责应保持一致。

### 10.3 颜色目标

Light 起点：

| Role | Target | Usage |
|---|---:|---|
| Canvas | `#F3F2EC` | 主要内容背景 |
| Canvas Soft | `#F8F7F2` | 文档与文章柔和区块 |
| Surface | `#FFFEFA` | 导航、代码外壳、必要浮层 |
| Ink | `#1B1C19` | 标题、正文、主 action |
| Body | `#5F625C` | 描述和次级正文 |
| Muted | `#8A8D85` | 日期、caption、弱信息 |
| Line | `#D9DAD3` | hairline 与内容分隔 |
| Operational | `#2B9A68` | 运行、连接、成功 |
| Operational Soft | `#DCEEE4` | operational 弱背景 |
| Warning | `#A87218` | 风险与等待 |
| Danger | `#C74747` | 错误与危险操作 |

Dark 起点：

| Role | Target | Usage |
|---|---:|---|
| Canvas | `#111512` | 主要内容背景 |
| Canvas Soft | `#171D19` | 柔和区块 |
| Surface | `#1D2420` | 导航、代码外壳、浮层 |
| Ink | `#F0F2EC` | 标题、正文、主 action |
| Body | `#B6BBB2` | 描述和次级正文 |
| Muted | `#828980` | 日期、caption、弱信息 |
| Line | `#303830` | hairline 与内容分隔 |
| Operational | `#53C58B` | 运行、连接、成功 |
| Operational Soft | `#173829` | operational 弱背景 |
| Warning | `#D2A14D` | 风险与等待 |
| Danger | `#E06B6B` | 错误与危险操作 |

上述值是实现样板起点，不替代对比度验收。所有正文、交互控件、focus 和状态组合必须在真实背景上检查。

### 10.4 字体

中文是首发主要语言。字体策略优先保证中文渲染、开源可交付和性能：

- Homepage / Docs / UI：选择一套适合中文的无衬线字体栈；允许为英文标题配一套有性格的拉丁字体，但不能让中英文像两个品牌。
- Blog Display：博客文章标题和 H2 可以使用中文衬线字体，形成技术出版物语气；博客正文仍以清晰的无衬线字体为主。
- Code / Metadata：使用 `SFMono-Regular`、`JetBrains Mono`、`Cascadia Code` 等等宽字体。
- 不依赖只有设计者电脑存在且无法合法分发的字体作为唯一呈现。
- 首版如无合适的自托管中文字体，优先使用高质量系统 CJK fallback；后续再通过真实加载和文件体积测试决定是否自托管。

建议字号区间：

| Role | Desktop | Mobile |
|---|---:|---:|
| Hero title | 72–104px | 43–62px |
| Section title | 48–72px | 36–48px |
| Article title | 48–64px | 36–46px |
| Body lead | 18–22px | 16–18px |
| Body | 16–18px | 15–17px |
| Navigation | 14px | 14px |
| Metadata | 11–13px | 11–12px |

大标题采用正常或中等字重和紧凑字距，不使用粗黑字制造技术感。正文行长以中文约 28–42 个全角字符为舒适范围。

### 10.5 空间、形状与层级

- 主页 section 使用 96–160px 的桌面纵向节奏，移动端为 72–104px。
- 内容容器最大宽度约 1240–1320px，文章正文单独限制阅读宽度。
- hairline 优先于阴影。
- 只有按钮、输入、截图外壳和浮层使用必要圆角。
- 不使用“每个内容块都是带阴影圆角卡片”的布局。
- 产品截图可以使用 12–18px 外壳圆角和轻微边框，但不能漂浮成手机模型或假设备框。

## 11. 核心组件规范

### 11.1 Site Header

- Hero 顶部为透明或低干扰背景，文字使用可读的反色。
- 滚动离开 Hero 后切换为主题 surface、hairline 和适度 backdrop blur。
- 当前页面通过文字权重或短下划线表达，不用绿色大面积底色。
- 桌面端保持 Brand、主导航、操作区三段布局。
- 移动端保留 Brand 和“开始使用”，其余导航进入菜单。
- 必须提供跳到主要内容的 skip link。

### 11.2 Buttons

- Primary：主题反色 ink action。
- Secondary：透明或 surface + hairline。
- Operational green 不作为普通营销 CTA 背景。
- 外链使用箭头或外链图标，并提供可访问名称。
- hover、pressed、focus、disabled 均需定义，focus 不能只靠轻微颜色变化。

### 11.3 Product Window

- 使用真实应用截图。
- 外壳只模拟必要的桌面窗口语义，不绘制复杂假浏览器 chrome。
- 图片保持原始比例，不拉伸。
- 截图文案或敏感数据必须在进入官网资产前检查。
- 每张图提供描述其界面内容的 alt；纯装饰外壳使用空 alt 或隐藏。

### 11.4 Update Timeline

- 时间、功能域和用户价值形成明确层级。
- 技术摘要默认弱化。
- 展开控件使用原生 button 语义或 `details/summary`，支持键盘和屏幕阅读器。
- 不用绿色表示“新”，避免 operational 语义污染。

### 11.5 Code Block

- 代码块提供语言标签和复制按钮。
- 复制成功使用短文字反馈，不只改变图标颜色。
- 浅深主题分别校准背景、注释和语法色。
- 长行允许横向滚动，不压缩到不可读。

## 12. 动效

网站动效服务于叙事顺序和空间感：

- Hero 首次进入：eyebrow、标题、正文、操作和产品截图依次出现。
- 滚动 reveal：轻微位移加透明度，持续 300–600ms。
- Hero 背景允许极弱视差，但移动距离必须有上限。
- 产品展示切换：120–240ms 淡入和轻微缩放。
- Header 状态切换：160–240ms。
- 不使用持续漂浮光球、跟随鼠标粒子、无限自动轮播和夸张 3D 卡片。
- 所有动画尊重 `prefers-reduced-motion`；禁用后内容顺序和可见性不得受影响。

## 13. 响应式行为

### Desktop

- Hero 保持完整空间叙事，产品截图宽度约为 viewport 的 80%–90%。
- 文档使用三列布局。
- 产品展示允许左右分栏。

### Tablet

- Header 收紧间距。
- 产品展示由左右分栏转为上下排列。
- Docs 右侧目录可以隐藏，保留左侧导航。

### Mobile

- Hero 高度根据标题、按钮和产品截图内容决定，不使用固定桌面高度硬裁。
- 两个 CTA 纵向排列并保持足够点击区域。
- 背景优先保留中央云海和光源，允许裁掉环形结构边缘。
- 产品截图允许展示完整缩略图，不要求读取截图中的所有小字。
- 更新页时间轴转为日期在上、正文在下。
- 文档导航和 TOC 不同时占据屏幕宽度。

任何断点都不得产生页面级横向滚动。

## 14. 资产规范

### 14.1 Hero

- 原始 Hero 资产进入 `packages/site/public/hero` 或由构建脚本从明确源文件生成。
- 不引用 Downloads、临时目录或个人路径。
- 保留一份高质量母版。首版按用户决定直接使用带固有尺寸的 PNG，不引入 Sharp；AVIF / WebP 响应式转换在真实部署性能测量后作为独立优化接入。
- 首屏图片明确尺寸并合理 preload，降低 LCP 与布局跳动；引入响应式衍生图后再切换为 `<picture>`。
- 默认禁止在 CSS 中内嵌超大 base64 Hero。

### 14.2 产品截图

- 官网只使用当前真实版本截图。
- 截图文件名表达页面与状态，例如 `context-overview-light.webp`。
- 截图更新应和相关功能或文案变化同轮完成。
- 不直接引用未来可能移动的个人设计稿路径。

### 14.3 品牌资产

- Logo、wordmark、favicon 和 Open Graph 图使用统一源文件生成。
- 图标需要适配浅色、深色和透明背景。
- 外部品牌图标只使用其官方颜色，属于主题颜色字面量的合法例外。

## 15. SEO、分享与可发现性

每个页面必须具备：

- 唯一 title 和 description。
- canonical URL。
- Open Graph / social preview。
- 正确的 heading 层级。
- sitemap 和 robots 配置。
- 文档、博客和更新之间的站内链接。

博客文章可以输出 Article 结构化数据；主页只有在字段真实可靠时才输出 SoftwareApplication 等结构化数据，不能虚构价格、评分、操作系统支持或下载量。

首发语言为简体中文，URL 不增加无必要的 `/zh` 前缀。未来引入英文站时再设计显式 locale 路由和 canonical / hreflang，不提前创建空语言入口。

## 16. 可访问性

- 目标达到 WCAG 2.2 AA 的核心要求。
- 所有可交互元素可通过键盘操作。
- focus ring 清晰可见。
- 状态不能只通过颜色表达。
- 导航、tab、折叠、代码复制和移动菜单使用正确语义。
- 图片提供有意义的 alt，装饰图片不重复朗读。
- 正文和按钮对比度在浅深主题分别验证。
- 支持 `prefers-reduced-motion`。
- 触控目标推荐不小于 44px。

## 17. 性能与渐进增强

首版性能目标：

- 核心内容由静态 HTML 提供。
- 没有 JavaScript 时仍能阅读主页、文档、博客和更新。
- Hero 图片之外的非首屏图片延迟加载。
- 避免为简单交互引入整套客户端 UI Runtime。
- 避免把所有文档正文打进首页 JavaScript bundle。
- 字体采用 subset、preload 和 `font-display` 策略，防止字体阻塞首屏。
- 以常见移动网络下 LCP 不超过 2.5s 为优化目标，并在真实部署环境测量。

性能目标是验收方向，不允许为了追求分数删除必要可访问性或让内容不可读。

## 18. 部署与 CI/CD

首版采用静态站点 + GitHub Pages + GitHub Actions：

```text
push / merge main
        |
        v
checkout full repository
        |
        v
install workspace dependencies
        |
        v
validate public content and release Markdown
        |
        v
build packages/site
        |
        v
upload Pages artifact
        |
        v
deploy GitHub Pages
```

约束：

- 更新页依赖根目录 `docs/releases`，因此 CI 必须 checkout 完整仓库。
- 部署 workflow 在现有 CI/CD 骨架上扩展，不另起无法复用的个人脚本。
- 所有 GitHub Action pin 到 commit SHA。
- 构建失败不能部署旧数据伪装成功。
- 自定义域名、CNAME 和 base path 由环境配置，不在组件中硬编码。
- PR preview 是后续能力；首版不为它引入服务端基础设施。

## 19. 安全与公开内容检查

- 网站构建不能读取或打包 `.env`、用户数据、logs、session、Context snapshot 或本地密钥。
- 公开截图在提交前检查用户名、路径、API Key、会话内容和其他个人信息。
- Markdown 中的原始 HTML 按明确策略处理，不默认信任任意脚本。
- 外部链接使用安全的 `rel` 属性。
- 依赖继续纳入现有 supply-chain、lockfile 和 Action pinning 检查。
- SEO、统计和遥测脚本只有在明确决定后才能加入；首版默认不接第三方追踪。

## 20. 验收标准

### 20.1 内容

- 首页在不查看 GitHub 的情况下能说明项目定位和开始路径。
- 文档、博客、更新的边界清楚。
- 更新页内容只来自 `docs/releases/feature-release-notes.md`。
- 不公开内部设计与 history 内容。

### 20.2 视觉

- C Cloud Expanse 覆盖标题与产品截图，首屏没有断层。
- 官网能被识别为 ActSpace，而不是 Cursor、Multica 或通用 AI 模板的复刻。
- Emerald 只用于 operational / success 等真实状态。
- 浅色、深色、system-light 和 system-dark 均完成代表页面检查。

### 20.3 响应式与可访问性

- Desktop、Tablet、Mobile 无页面级横向滚动。
- Header、导航、tab、折叠和移动菜单可使用键盘。
- Reduced Motion 下页面内容完整。
- 图片 alt、focus、对比度和 heading 层级通过检查。

### 20.4 构建与数据

- release Markdown 合法时构建结果稳定。
- release 表格格式错误时构建明确失败。
- `/updates` 继续从 release Markdown 稳定生成，不依赖首页镜像数据。
- 静态部署不依赖运行时后端。

### 20.5 验证路径

实现阶段至少执行：

- `packages/site` typecheck、test 和 production build。
- 根仓库 docs、repo hygiene、secrets、Action pinning 检查。
- 桌面与移动浏览器视觉检查。
- 浅色、深色、system-light、system-dark 检查。
- 真实 GitHub Pages base path 或自定义域名构建检查。
- `git diff --check`。

## 21. 非目标

首版不包含：

- 用户账号、登录和云端同步。
- 在线 Agent 执行环境。
- CMS、数据库和评论系统。
- 未经确认的下载中心和自动更新承诺。
- 把所有内部设计文档公开化。
- 多语言空壳。
- 复杂产品定价页。
- 第三方广告或默认遥测。

## 22. 已确认决策

- 官网工程位于 `packages/site`。
- 一级菜单为“文档、博客、更新”。
- “开始使用”进入 `/docs/getting-started`。
- 主页使用 C Cloud Expanse 作为首版 Hero 主视觉。
- 官网视觉方向为 `Cloudfield & Ink / 云境与墨色`。
- 博客默认采用 Claude 风格的视觉卡片网格，内容增长后再提供 Cursor 风格列表归档。
- 博客文章采用窄阅读列，并允许标题使用中文衬线字体。
- 更新页采用 Multica 风格的左侧日期导航和右侧连续正文，正文按“新功能 / 改进 / 问题修复”展示，不虚构版本号。
- 文档文章采用 Claude Code 风格的分类导航与三栏阅读骨架，文档首页采用 Cursor 风格的任务入口和真实截图。
- 首版 Docs 不提供没有真实检索链路的“向 AI 提问”。
- 更新页从 `docs/releases/feature-release-notes.md` 构建时生成。
- 公开文档和内部仓库文档保持明确边界。
- 首版优先静态生成并通过 GitHub Actions 部署到 GitHub Pages。
- GitHub Pages 构建从 monorepo 根目录执行，复用根 `pnpm-lock.yaml`，输出目录指向 `packages/site/dist`；这是 Astro 官方 Action 在 pnpm workspace 下的实际配置边界。
- 首版首页产品展示使用通过脱敏检查的 Context、Tools、Kairos 与 Usage 截图；Review 素材保留给文档或后续内容。仓库暂时没有可公开的 Browser 实机截图，不用不相关图片伪装该能力。
- 实现前另写 execution plan，不在本设计文档中维护逐步施工流水账。

## 23. 维护规则

- 页面结构、公开内容来源、release schema、主题机制或部署边界发生变化时，同轮更新本文档。
- 具体实现清单不持续堆入本文档，实施步骤放 `docs/exec-plans`，完成记录放 `docs/histories`。
- 如果未来官网形成至少两份长期强关联设计文档，再评估迁入 `docs/design-docs/website/` 专题目录；在此之前保持根层独立文档。
- 外部参考、竞品截图和调研底稿放 `docs/references`，不把它们当作 ActSpace 设计事实来源。
