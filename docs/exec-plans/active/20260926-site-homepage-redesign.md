# 官网首页改版与全站轻量统一

> 状态：2026-09-26 用户已确认首页 demo；T1–T9、T11 已完成，只剩 T10 真实截图（需要用户）。文档、博客、更新日志只做全站共享的轻量调整（见 T6–T8），不重新排版。

## 目标

按已确认的 demo 重做 `apps/site` 首页，解决"说不上来的奇怪"：首图用真实任务截图，滚动展示区图文对齐且比例统一，品牌紫克制地出现在首页，首页和博客看起来是同一个品牌。文档、博客、更新日志跟着换字体、箭头、强调色等全站设置，版式保持不变。

## 设计依据

- 设计稿：`docs/design-docs/website-redesign-demo.html`（直接用浏览器打开；右下角「显示改动说明」列出 ①–⑧ 每处改动）。
- 用户确认（2026-09-26）：demo 整体接受。
- 检查时发现的问题（改版原因）：
  1. 首图和"上下文"展示图是"多种编程语言代码格式测试"会话，和"真正能行动的空间"不符。
  2. 展示区图片比例不一（`skill-invocation.png` 为 1821×394），sticky 区域留大片空白，图文不对齐；非当前段 `opacity: .35` 像未加载。
  3. Logo PNG 无透明通道，在 `#fafaf9` 上露出白底。
  4. 字体栈首位是 Avenir Next，中英混排粗细不一；手机端 h1 把"空间"拆成两行。
  5. 标题字号层级太接近（48 / 40 / 40）；站内链接误用 ↗；按钮内间距 24px 过松。

## 范围

- 包含：
  - 首页 `src/pages/index.astro`、`src/components/FeatureShowcase.astro`、`src/scripts/showcase.ts`、`src/styles/showcase.css`、`src/styles/global.css` 中首页相关部分。
  - 全站共享：`tokens.css`（新增紫色 token、字体栈、清理重复与无用 token）、页头页脚、按钮、链接箭头、Logo 资源。
  - 文档、博客、更新日志的轻量统一（T6–T8）。
  - 删除已无引用的旧组件与脚本（T9）。
  - 同步 `apps/site/DESIGN.md`、`SHOWCASE_PLAN.md`、`SCREENSHOTS.md`、`src/lib/screenshots.json`。
- 不包含：
  - 文档三栏结构、博客列表筛选/排序逻辑、博客详情 12 列网格、更新日志 release parser。
  - 深色主题（site 仍只提供浅色）。
  - 新增首页区块或改写文案（文案沿用现有 `home-features.ts`，只改"了解Review"等缺空格处）。
  - 真实截图的拍摄：需要用户在应用里操作（见 T10），代码先用现有素材。
  - 部署、提交、推送。

## 背景

- 必读：`AGENTS.md`、`apps/site/DESIGN.md`、`docs/FRONTEND.md`、`docs/HISTORY_GUIDE.md`。
- 代码路径（均在 `apps/site/` 下）：
  - `src/styles/tokens.css`：`--site-*` 语义变量；第二个 `:root` 块重复定义 `--site-focus`（覆盖成绿色 `#33795c`）、`--site-page`，并有 `--canvas`/`--ink` 等别名层。
  - `src/styles/global.css`：页头、按钮、`.hero`、`.section-intro`、`.latest`、`.cta`、页脚、更新日志 `.release-entry`。
  - `src/styles/showcase.css` + `src/components/FeatureShowcase.astro` + `src/scripts/showcase.ts`：六组 sticky 图文。脚本已做渐进增强、焦点跟随、reduced-motion，保留其结构，只加进度条。
  - `src/components/Screenshot.astro`：构建期 WebP + srcset + 点击放大；名称必须存在于 `src/lib/screenshots.json`。
  - `src/components/SiteHeader.astro`、`SiteFooter.astro`：Logo 来自 `src/assets/brand/actspace-logo.png`（600×370，无 alpha）。
  - `src/layouts/DocsLayout.astro`（内联 CSS）、`src/styles/prose.css`、`src/styles/blog.css`、`src/components/updates/UpdateTimeline.astro`。
  - 博客角色插画：`src/assets/blog/covers/character-01.png`（背景色实测 `#fddfcf`～`#fee0cf`）。
- 已知约束：
  - 工作区有桌面端审批卡等未提交改动，与 `apps/site` 不重叠，不要动。
  - `review-workspace.png` 不在 `screenshots.json` 中，接入首图前要补条目，否则 `Screenshot.astro` 类型检查失败。

## 任务

按顺序执行；T6–T8 之间可并行。

### T1 Token 与字体（全站）
- `tokens.css`：
  - 新增 `--site-accent: #6d4fc2`、`--site-accent-soft: #f0ebfa`、`--site-accent-line: #cdbdf0`、`--site-peach: #fde0cf`。
  - `--site-font-sans` 改为 `-apple-system, BlinkMacSystemFont, "SF Pro Text", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif`。
  - 合并两个 `:root` 块：`--site-focus` 改为 `--site-accent`，`::selection` 改用 `--site-accent-soft`；`--site-page` 只保留一处。
  - 删除无引用的 `--site-hero-*`、`--site-inverse-*`（先 `grep -r` 确认零引用）。
  - 别名层 `--canvas`/`--ink`/… 暂保留（引用面广），在 `DESIGN.md` 记为"新代码用 `--site-*`"。
- 验证：`grep -rn "site-hero-\|site-inverse-" src` 为空；`pnpm --filter @actspace/site check` 通过。

### T2 Logo 透明化
- 用一次性 Node + sharp 脚本把 `actspace-logo.png` 的近白背景转成透明（按亮度算 alpha 并反预乘，保留抗锯齿边缘），输出为 `src/assets/brand/actspace-logo.png`（覆盖前把原图另存为 `actspace-logo-source.png`），同步 `public/media/actspace-logo.png`。
- 脚本不入库；在 exec-run 过程记录里写下参数。
- 验证：`sips -g hasAlpha` 为 yes；1440 截图中页头、页脚 Logo 周围无白框，放大到 300% 看边缘无白边。
- 回退：若边缘出现白晕，改为 SiteHeader/SiteFooter 的 `.brand-logo` 加 `mix-blend-mode: multiply`（demo 的做法）。

### T3 页头、按钮、链接、页脚（全站）
- `.nav a[aria-current="page"]`：去掉下划线，改为 `font-weight: 500` + 底部 2px 圆角紫条（demo `.nav a.active::after`）。
- 页头背景：`color-mix(in srgb, var(--canvas) 88%, transparent)` + `backdrop-filter: saturate(1.4) blur(12px)`。
- `.button`：`gap` 24px → 10px，`font-weight: 500`，悬停时箭头右移 3px（`.arrow` 过渡），`:active` 缩放 .97；`.text-link` 同样处理。
- 箭头规则：站内链接用 `→`，只有外链用 `↗`。改 `index.astro`、`FeatureShowcase.astro`、`SiteFooter.astro`（"开发计划 ↗" → "开发计划"）。
- 页脚：简化为 Logo + 导航 + 一行 `© 年份 ActSpace · 给模型一个真正能行动的空间`，去掉两行等宽大写小字。
- 验证：文档、博客、更新日志页头当前项显示紫条；全站 `grep -rn "↗" src` 只剩外链。

### T4 首页结构（`index.astro` + `global.css`）
- 首屏：
  - `.hero` 改为两栏网格（`1.25fr / 1fr`，`align-items: end`），左 h1、右说明 + 按钮；860px 以下单栏。
  - h1 `clamp(38px, 6vw, 80px)`、`font-weight: 600`；"空间"包 `<span class="nowrap"><em>` 并着紫色。
  - `.hero-media` → 浅紫底板（`--site-accent-soft`，圆角 20px，上左右内边距 `clamp(14px, 3.4vw, 48px)`，下边 0），截图顶部圆角 + 轻阴影、贴底出血；760px 以下截图宽 170% 只露聊天区（外层 `overflow: hidden`）。
  - 首图换为 `review-workspace.png`（先完成 T5 的 json 条目），更新 `sizes`。
- 引导段 `.section-intro`：h2 `clamp(32px, 4.2vw, 56px)` / 600，`align-items: end`。
- 更多能力：`.capability-link` 改为白底细边卡片（圆角 14px，悬停边框 `--site-accent-line` + 上移 2px + 箭头变紫右移）；h3 16px/600；网格间距 12px。
- 更新条 `.latest`：整条为链接卡片，左侧紫色胶囊"产品更新"+ 等宽日期 + 标题，右侧"查看更新 →"。
- 结尾 `.cta`：桃色（`--site-peach`）圆角 24px 卡片，左文案（"给下一项工作，<br>一个空间。"+按钮），右侧 `character-01.png`（用 `astro:assets` `<Image>`，WebP，`widths` 420/840）；860px 以下上下排列，图 3:2。
- 验证：1440 / 1100 / 760 / 390 四个宽度截图与 demo 对照；390 下 h1 不拆"空间"。

### T5 展示区（`FeatureShowcase.astro`、`showcase.css`、`showcase.ts`、`screenshots.json`）
- `screenshots.json` 增加 `review-workspace.png` 条目（`status: ready`，用途"首页首屏"）。
- 统一底板：`.product-shot` 在展示区内包一层 `.showcase-frame`（`aspect-ratio: 16/10`，`--surface` 底，圆角 18px，内边距 5.5%，图片 `object-fit: contain` + 轻阴影）。sticky 区与 inline 区都用它。
- 桌面增强态：
  - 两栏比例 `40fr / 60fr`，`column-gap: 64px`；每段 `min-height: 58vh`（原 72vh）、`align-content: center`。
  - 非当前段：正文/列表/链接 `opacity: .4`，标签 `.5`，h3 颜色 `--muted`；当前段全部恢复。删除 `.showcase-copy { opacity: .35 }`。
  - sticky 顶部：`top: calc(var(--site-header-height) + max(40px, (100svh - var(--site-header-height) - 560px) / 2))`，去掉固定 `height` 和 slide 的 `align-items: center` 定位方式，改为 `.slides { aspect-ratio: 16/10 }` 内绝对定位叠放。
  - 新增进度条：`showcase-stage` 下 6 段 3px 圆角条，已看过/当前的为紫色；`showcase.ts` 的 `select()` 同步 `is-active`（`i <= index`），条带 `aria-hidden`。
- 标签：`.feature-label` 改紫色 + 6px 圆点；列表勾改为紫色细线勾（CSS 边框画法）。
- 标题层级：`.showcase-copy h3` `clamp(24px, 2.4vw, 32px)` / 600。
- 文案：`了解{feature.label}` 在 label 以英文开头时补空格（"了解 Review""了解 Skills""了解子 Agent"）。
- 验证：1440 下逐段滚动，每段图片与文字垂直居中对齐；Skills 细长图居中在底板上；键盘 Tab 到某段链接时对应图片和进度条切换；`prefers-reduced-motion` 下无过渡。

### T6 文档（轻量）
- 字体与页头随 T1/T3 自动生效。
- `DocsLayout.astro`：删除被覆盖的 `.docs-group a[aria-current=page]{color:var(--site-focus)}` 旧规则，只保留中性底色版本；当前项左侧加 2px 紫色内阴影（`box-shadow: inset 2px 0 0 var(--site-accent)`）。
- `prose.css`：正文链接下划线颜色改 `--site-accent-line`，悬停变 `--site-accent`；h2/h3 `font-weight` 500 → 600，与首页一致。
- 验证：`/docs/getting-started/` 1440 与 390 截图；引用块、代码块、表格不变。

### T7 博客（轻量）
- 分类复选框选中色 `--ink` → `--site-accent`。
- `.blog-card:hover` 背景从 `--site-line`（偏灰）改为保持底色 + 边框 `--site-accent-line` + 上移 2px，与首页能力卡片一致。
- 博客详情不改。
- 验证：`/blog/` 勾选/取消分类、悬停卡片；列表视图不受影响。

### T8 更新日志（轻量）
- `UpdateTimeline.astro`：左栏"产品更新"改为紫色胶囊（与首页更新条同一样式，抽成共享 class `.site-tag` 放 `global.css`）。
- `.release-content h2` 字重 500 → 600；首页"查看更新"跳转到的锚点条目加 `:target` 高亮（浅紫左边线，1.2s 后淡出，reduced-motion 下不做动画）。
- 验证：从首页更新条点击，落点条目可辨认。

### T9 清理无用代码
- 先 `grep -rn` 确认零引用，再删除：
  - `src/components/home/`：`Hero`、`ProductShowcase`、`ArchitectureSection`、`FinalCta`、`LatestPosts`、`ProductStory`、`LatestUpdates`（整目录）
  - `src/components/ThemeControl.astro`、`src/scripts/theme.ts`、`src/scripts/product-showcase.ts`
  - `src/components/docs/DocsSidebar.astro`、`DocsToc.astro`、`DocsTabs.astro`、`src/scripts/docs-search.ts`（DocsLayout 已内联实现）
- `index.astro` 统一缩进。
- 验证：`check`、`build` 通过；构建页数与改动前一致（改动前先记录一次 build 输出的页数）。

### T10 真实截图（需要用户）
- 由用户在 ActSpace 里跑一个真实任务（建议：给某个示例项目加一个小功能 → 读代码 → 修改 → 跑测试 → Review），在不同阶段截图，替换：`context-detail.png`（当前是格式测试会话，优先）、`workspace-overview.png`（文档仍在用）。其余四张可保留。
- `SCREENSHOTS.md` 与 `screenshots.json` 把 `context-detail.png` 标为 `needs-retake`，写明拍摄要求（窗口 1440×900、浅色、隐藏私人路径、右侧打开上下文面板）。
- 截图到位前页面照常使用现有图，不阻塞 T1–T9 验收。

### T11 文档同步与收尾
- `apps/site/DESIGN.md`：
  - "紫色用于 Logo、插画及引用" 改为：紫色 `--site-accent` 是唯一强调色，用于导航当前项、标签、进度、链接下划线、卡片悬停边框；每屏不超过两处大面积使用（首图底板、CTA 桃色卡片）。
  - 字体改为系统 SF + 苹方；首页章节按新结构重写（首屏两栏、展示区 16:10 底板 + 进度条、能力卡片、更新条、插画 CTA）；箭头规则；删除"更新入口为紧凑横行"等过期描述。
- `SHOWCASE_PLAN.md` 同步展示区参数（58vh、进度条、淡化规则）。
- `docs/exec-plans/README.md` 登记本计划；完成后移入 `completed/`。
- `docs/exec-runs/20260926-site-homepage-redesign/` 写过程与摘要；`docs/histories/2026-09/` 写 history。

## 验证方式

- 命令（在仓库根目录）：
  - `pnpm --filter @actspace/site check`：零错误零警告。
  - `pnpm --filter @actspace/site test`：现有 17 个测试通过。
  - `pnpm --filter @actspace/site build`：构建成功，页数与改动前一致。
- 截图（dev 服务 `pnpm --filter @actspace/site dev`，8765 端口，用 headless Chrome + CDP 脚本分段截图）：
  - 首页 1440、1100、760、390 各一组，逐段与 `website-redesign-demo.html` 同宽截图对照。
  - 文档 `/docs/getting-started/`、博客 `/blog/`、更新日志 `/updates/`、博客详情任一篇，1440 与 390 各一张，确认只有 T6–T8 列出的变化。
- 手工检查：
  - 展示区滚动、键盘 Tab 切换、reduced-motion；点击截图放大仍打开原图 PNG。
  - 手机菜单展开/Escape 收起；360px 以下品牌文字隐藏规则仍生效。
  - 首页 Lighthouse 或 DevTools 查看首图仍为 eager/high，CTA 插画为 lazy WebP。

## 风险

- Logo 去白底边缘出白晕：按 T2 回退到 `mix-blend-mode: multiply`。
- 系统字体在 Windows 回落到微软雅黑，与 Mac 观感不同：可接受，DESIGN.md 注明。
- 展示区 sticky 定位在矮屏（高 < 700px）上图文重叠：`top` 使用 `max(40px, …)` 并在 `max-height: 700px` 下退回普通顺序流。
- 删除旧组件误删仍被引用的文件：T9 每个文件先 grep，build 通过才算完成。

## 决策记录

- 2026-09-26：用户确认首页 demo。紫色从"只用于 Logo/插画/引用"扩展为全站唯一强调色，但限量使用。
- 2026-09-26：文档、博客、更新日志不重新排版，只跟随全站 token、字体、箭头、强调色，外加 T6–T8 列出的小调整。
- 2026-09-26：首图暂用 `review-workspace.png`（真实架构分析任务），不等新截图；`context-detail.png` 标为待重拍。
- 2026-09-26：开工前用户再次确认紫色规则改为“全站唯一强调色、每屏最多两处大面积”。
- 2026-09-26：计划留在 `active/`，等 T10 截图替换后再移入 `completed/`。

## 进度记录

- [x] T1 Token 与字体（`--site-hero-*`/`--site-inverse-*` 只被 T9 要删的旧组件引用，因此与 T9 一起完成）
- [x] T2 Logo 透明化（改用“前景/背景混合反解 α”，亮度法会让浅紫身体变半透明；未用到 multiply 回退）
- [x] T3 页头、按钮、链接、页脚
- [x] T4 首页结构（h1 流体部分由 6vw 调为 5.6vw，1100px 下“空间”不再单独成行）
- [x] T5 展示区（底板按截图比例居中，构建期写入 `--shot-ratio`；底板内不显示图注）
- [x] T6 文档轻量调整
- [x] T7 博客轻量调整
- [x] T8 更新日志轻量调整（`:target` 高亮改为向两侧外扩的浅紫底，不用左边线，避免压到日期）
- [x] T9 清理无用代码（构建仍为 45 页）
- [ ] T10 真实截图（用户）：`SCREENSHOTS.md` 与 `screenshots.json` 已标记 `context-detail.png` 待重拍
- [x] T11 文档同步与收尾

## 执行模式

- **交互模式**：视觉改动需要逐段截图对照，且 T10 依赖用户操作。

## 执行文档

执行开始时，在 `docs/exec-runs/20260926-site-homepage-redesign/` 从 `docs/exec-runs/templates/` 复制 `execution-process.md` 与 `execution-summary.md`；摘要重点写同宽截图对照清单与 T10 的剩余事项。
