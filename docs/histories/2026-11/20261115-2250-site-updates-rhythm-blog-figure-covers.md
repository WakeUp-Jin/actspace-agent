## [2026-11-15 22:50] | Task: 官网更新日志节奏线 + 博客封面改用文章配图

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI（worktree feat/site-updates-blog-covers）`

### 📥 User Query

> 1. 更新日志一次全部加载，信息量大了看不出所以然；顶部加一个类似 GitHub 提交数的统计，一眼看出哪天更新、更新了多少。
> 2. 博客封面改用文章里的配图；点进去的文章页精灵头部保留。

经过三轮 demo：统计面板（贡献格 / 三色叠柱 / 月份卡 / 月历）嫌太大太多；只加统计、不动原样式的几版也没选中；最终选定 E2「标题下一条细节奏线 + 只展开最近一个月」整页照搬。博客列表选 L2（精灵色底 + 白纸卡片放配图）且去掉精灵，文章页保持现状。

### 🛠 Changes Overview

**Scope:** `apps/site`

**Key Actions:**

- **更新日志**：新增 `ReleaseRhythm` 每日节奏线（柱高 = 当天条数，可悬停看标题、点击跳转，随筛选换成单类条数）；筛选改成纯文字并配一句「最近一次 · 近 30 天有 N 天在更新」；月份改为 `<details>`，只展开最近一个月，收起行显示随筛选变化的「N 次更新 · M 条」；发布条去掉竖时间线，收成两列、字号收小。跳到锚点（节奏线、首页更新条、直接带 hash 打开）时先展开所在月份，必要时切回「全部」。
- **每日统计**：`src/lib/releases/activity.ts` 在构建时从 release parser 的结果算出逐日条数、单日最大值、近 30 天活跃天数，附单测。
- **博客列表**：有配图的文章封面改为正文第一张配图（`firstArticleImage`，跳过代码块），放在精灵底色上的白纸卡片里、从底边升起，不再放角色和英文关键词；没配图的文章仍用角色封面。附单测确认每篇找到的图都存在。
- **文档**：`apps/site/DESIGN.md` 的「博客列表」「更新日志」两节按新设计重写；demo 留在 `docs/design-docs/site-updates-blog/demos/`。

### 🧠 Design Intent (Why)

84 次发布、近 500 条全部铺开时，页面太长，看不出更新的节奏。节奏线只占 30px，就能一眼看出哪几天在更新、哪天改得多；按月折叠把首屏之外的内容收成一行一个月。博客配图比角色插画更能说明文章内容，保留角色底色是为了和文章页头部的颜色对上。

### Unverified & Leftovers（未验证与遗留）

- **未验证**：只在无头 Chromium 下按 1440 / 390 两种宽度做了截图与交互检查，没在真机 Safari / iOS 上看过节奏线的触控（窄屏下每根柱子约 2px 宽，点中某一天比较难，主要靠看）。
- **遗留**：无。

### 📁 Files Modified

- `apps/site/src/lib/releases/activity.ts`
- `apps/site/src/lib/releases/test/activity.test.ts`
- `apps/site/src/components/updates/ReleaseRhythm.astro`
- `apps/site/src/components/updates/UpdateTimeline.astro`
- `apps/site/src/pages/updates/index.astro`
- `apps/site/src/styles/updates.css`
- `apps/site/src/lib/blog-presentation.ts`
- `apps/site/src/lib/test/blog-cover.test.ts`
- `apps/site/src/pages/blog/index.astro`
- `apps/site/src/styles/blog.css`
- `apps/site/DESIGN.md`
- `docs/design-docs/site-updates-blog/demos/*`
