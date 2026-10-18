# 官网 V4：运行空间叙事与纸本插件舞台

> 2026-10-18 状态校准：阶段 A（T1–T9、H1 首屏精修）已合入 main；以 T9/H1 的真实截图与桌面插件舞台为最终实现。阶段 B 文档重写与截图标注尚未实施，另行立项。 下文保留原始实施决策与过程；最新分项证据见 [近期验收](../../exec-runs/20261018-recent-features-acceptance/acceptance.md)。
> 原实施阶段记录：状态：2026-10-17 阶段 A 已实现并经用户认可（未提交）；同日补做 T8（真实截图回归首页、全站相框统一、Logo 白框修复）。用户确认 D6 方向与「插件化只在首屏讲」原则，并要求直接写计划、改出一版。分支 `feat/site-redesign-v4`。本计划只执行阶段 A（视觉系统 + 首页 + 全站统一）；阶段 B（文档内容重写与截图裁切标注）在 A 验收后另立计划。

## 目标

把 `apps/site` 从 V3「给模型一个真正能行动的空间」改成 V4「会自我进化的 Agent 运行空间」：首页用 HTML/CSS 重绘的产品界面讲故事，不再依赖截图；首屏用插件舞台表达「一切都是插件」；文档、博客、更新日志、开发计划与首页共用同一套纸本视觉（暖纸画布、衬线标题、纸纹色场、品牌紫单一强调色）。

## 设计依据

- 视觉 demo：`docs/design-docs/site-v4/demos/D6-paper-plugin-stage.html`（用户选定，D1 纸本风格 + D4 插件结构）。对比页 `docs/design-docs/site-v4/demos/index.html` 保留前两轮 A–E、D1–D5 作为历史参考。
- 产品概念：`docs/design-docs/ActSpace产品概念思路初稿.md`（唯变所适；Agent → Actor → 名册 → Space；「有分寸」）。
- 用户已确认（2026-10-17）：
  1. 运行空间是主角，Actor 精灵不是主角；全首页精灵最多出现一处小面积（首屏窗口侧栏「Actor 名册」前的小图标）。不要「精灵当主角」的味道。
  2. 首页篇幅：现有 Coding Agent 能力约 30–40%，迭代方向约 60–70%。
  3. 路线图状态：上下文管理引擎「已上线」；Harness 自进化「进行中」；Actor 与 Space「进行中」。
  4. **插件化只在首屏讲。** 下面的功能块只讲各自的效果，不再画插件模块和连线；Harness 自进化块例外，因为「插件派生新版本」就是它的内容本身。
  5. 首页不用截图；真实截图只留在文档，阶段 B 用占位 + 局部放大标注。
  6. 首页叙事：首屏 → 现状 → 方向（带状态）→ 更新 → 结尾。每个功能块高度不超过一屏。
- V3 不舒服的根因（改版原因）：截图内容不对且过大需要滚动；节奏松散；首页、文档、博客像不同站点拼起来；交互与动效弱。

## 范围

- 包含：
  - 全站 token：`apps/site/src/styles/tokens.css`（画布、纸面、色场、衬线标题字体栈）。
  - 页头页脚：`src/components/SiteHeader.astro`、`SiteFooter.astro`、`src/styles/global.css` 的页头/按钮/页脚部分。
  - 首页重写：`src/pages/index.astro`、新增 `src/components/home/*.astro`、`src/styles/home.css`、`src/scripts/home-stage.ts`、`src/scripts/home-context.ts`、`src/lib/home-features.ts`（改为新首页文案数据）。
  - 删除首页旧件：`src/components/FeatureShowcase.astro`、`src/scripts/showcase.ts`、`src/styles/showcase.css`、`global.css` 中 `.hero*`、`.section-intro`、`.capability-*`、`.cta*` 等首页样式；`SHOWCASE_PLAN.md`。
  - 全站统一：文档（`src/layouts/DocsLayout.astro` 内联样式、`src/styles/prose.css`）、博客（`src/styles/blog.css`、`src/styles/editorial.css`）、更新日志（`src/pages/updates/index.astro`、`global.css` 的 `.changelog`/`.release-*`）、开发计划（`src/pages/roadmap.astro`）、404 页：只改字体、颜色、标题与卡片质感，不改结构和交互。
  - 「阅读产品理念」落点：在 `src/content/docs/what-is-actspace.md` 新增「产品理念」一节。
  - 文档同步：`apps/site/DESIGN.md` 重写为 V4 规范；`SCREENSHOTS.md` 去掉首页条目；`docs/exec-plans/README.md`；`docs/histories/`。
- 不包含：
  - 文档正文的大规模重写、截图重拍/裁切/标注（阶段 B）。
  - 博客正文（用户自己写）。
  - 深色主题、Web 字体托管（中文 Web 字体在国内加载不稳，标题用系统衬线）。
  - macOS 安装包下载：仓库目前没有 release，首屏主按钮用「快速开始 →」指向 `/docs/getting-started/`；有安装包后由用户提供链接再换。
  - 部署、推送、PR（用户要求时再做）。

## 背景

- 必读：`AGENTS.md`、`apps/site/DESIGN.md`（V3，执行中重写）、`docs/HISTORY_GUIDE.md`、本计划「设计依据」列出的 demo。
- 开发：`pnpm --filter @actspace/site dev`，`http://127.0.0.1:8765/actspace-agent/`；所有站内链接走 `sitePath()`。
- 已知约束：
  - `Screenshot.astro` 只被首页旧组件使用；首页改完后它仍保留给将来文档组件用，不删。
  - `src/lib/test/*` 与 `releases/test/*` 不覆盖首页；首页没有单测，靠截图验收。
  - `home-features.ts` 的 `homeFeatures` 引用 `screenshots.json` 的类型，重写时去掉该依赖。
  - 博客已是 Claude 博客式版式（用户特别喜欢），只换画布色与卡片底色，不动布局。

## 视觉系统（阶段 A 的契约）

- 颜色（`tokens.css`）：画布 `--site-canvas: #f2f1ed`，次级面 `--site-canvas-soft: #ebe9e3`，纸面 `--site-paper: #fbfaf7`，正文墨色 `--site-ink: #1d1c1a`，正文灰 `--site-body: #5d5a53`，弱化 `--site-muted: #8a8780`，细线 `--site-line: #dcd9d1`。品牌紫 `--site-accent: #6d4fc2` 仍是唯一强调色，`--site-accent-soft: #f2eefb`。状态色：已上线 `--site-live`/`--site-live-soft`（墨绿 / 浅绿），进行中 `--site-wip`/`--site-wip-soft`（赭 / 浅赭）。色场：桃 + 灰蓝（`--stage-peach*`、`--stage-slate*`）、薄荷 + 柠檬（`--stage-mint`、`--stage-lemon`）。
- 字体：正文系统无衬线不变；标题 `--site-font-display: Charter, "Songti SC", "Noto Serif SC", "Noto Serif CJK SC", "Source Han Serif SC", Georgia, serif`，字重 500，与博客 `--blog-serif` 合并为同一变量。首页 h1 46px，h2 40px（手机 34 / 30）。
- 舞台：圆角 28px，多层径向渐变 + 内联 SVG 噪点纹理（opacity .2，multiply）。全站每屏大面积色块不超过两处。
- 产品窗口：纸面底、12px 圆角、细边 + 柔和投影；界面文字 ≥12px。
- 动效：只在视口内播放（IntersectionObserver），离开视口暂停；`prefers-reduced-motion` 直接显示终态。

## 首页结构

1. **首屏**（1440×900 一屏看全舞台上下边缘）：眉题「唯变所适」，h1「会自我进化的 / Agent 运行空间」，说明「每一个问题，都有它的空间。……长成各自专业的 Actor。」，按钮「快速开始 →」+ 文字链「阅读产品理念 →」。舞台照搬 D6：工具（读取文件 / 编辑 / 终端 / Browser Use）、行为（Skills / 审批策略 / 子 Agent）、上下文（渐进披露 / 压缩 / 上下文面板）共 10 个插件，随任务点亮、可悬停、可开关；窗口内任务「把登录页的表单校验补完，跑一下测试」，终端叠层，计数器。
2. **现状**：h2「基础功能」（不加口号和说明）+ 8 项能力索引（读取与检索、编辑与 Review、终端、审批策略、Skills、子 Agent、模型与推理、Browser Use），每项一句话并链到对应文档。纯文字卡片，不放截图。
3. **方向**：h2「接下来，它会长成你的 Actor。」+ 三段状态条（已上线 / 进行中 / 进行中，锚点跳到下面三块）。随后三个功能块，左文右舞台，交替左右：
   - 上下文管理引擎 · 已上线 ·「长任务，不会失忆。」薄荷柠檬舞台 + 上下文面板压缩动画（168k → 61k，旧行收拢与摘要出现重叠）。**不画插件。**
   - Harness 自进化 · 进行中 ·「插件会按问题，长出新版本。」桃色舞台，示意：插件「编辑」v1 → 派生 v2（配置差异两行）→ 沙箱评估 → 接受 / 撤销。卡片角标「示意 · 尚未上线」。
   - Actor 与 Space · 进行中 ·「一个 Space，几位 Actor，一起解决一个问题。」灰蓝舞台，示意：Space 窗口里你只和协调 Agent 对话，三位 Actor（前端 / 测试 / 文档）各自状态行。角标「示意 · 尚未上线」。Actor 用字母圆点，不用精灵插画。
4. **更新**：沿用最新发布条（`loadReleaseNotes()[0]`），换成纸本样式。
5. **结尾**：桃色纸纹舞台条「给下一个问题，一个空间。」+「快速开始 →」+「在 GitHub 查看 ↗」。不放角色插画。

## 任务

按顺序执行；T6 与 T3–T5 可并行（文件不重叠）。

### T1 Token 与字体
- 改 `tokens.css` 为「视觉系统」一节的变量；保留 `--canvas`/`--ink` 等别名指向新值；`--blog-serif` 改为 `var(--site-font-display)`。
- 验证：`grep -rn "site-hero-\|site-inverse-" apps/site/src` 为空；`pnpm --filter @actspace/site check` 通过。

### T2 页头、按钮、页脚
- 页头 64px，背景画布 85% + 模糊；品牌字 17px/600 去掉负字距；导航 14px；当前项保留 2px 紫条。主按钮黑底胶囊，悬停转品牌紫。
- 页脚：画布底、细线；左品牌 + 一句「唯变所适 · 会自我进化的 Agent 运行空间」，右导航（文档 / 博客 / 更新日志 / 开发计划 / GitHub ↗）。
- 验证：1440 与 390 截图，首页、文档、博客页头一致；手机菜单 Escape 收起正常。

### T3 首屏插件舞台
- 新增 `src/components/home/Hero.astro`（结构）+ `src/scripts/home-stage.ts`（D6 的 `Stage`/`Clock` 逻辑改写为 TS 模块，导出 `createPluginStage`、`createClock`、`playWhenVisible`、`initializeHeroStage`）。头像用 `astro:assets` 的 `getImage` 生成 `character-01` 的 108px WebP（36px 显示，3x）。
- 只在舞台进入视口时播放，离开暂停后重新开始。
- 验证：1440×900 首屏完整；分时截图 1–9 秒每帧窗口无大片空白；点击「终端」后计数减少、终端不出现；390 宽模块收拢到窗口下方，无横向滚动。

### T4 现状与方向区块
- 新增 `src/components/home/TodaySection.astro`、`DirectionStrip.astro`、`ContextBlock.astro`、`HarnessBlock.astro`、`SpaceBlock.astro`；文案数据集中在 `src/lib/home-features.ts`。
- `src/scripts/home-context.ts`：压缩动画（D6 `fRun` 去掉插件部分）。Harness / Space 块用 `data-loop` 声明步骤，`src/scripts/home-loop.ts` 按时间切换 `data-p`，样式按步骤定义；reduced-motion 下静止终态。
- 验证：每个功能块在 1440×900 下高度 ≤ 视口 − 页头；分时截图压缩面板 1–8 秒无空白帧；两个「进行中」块都有「示意 · 尚未上线」。

### T5 首页组装与旧件删除
- 重写 `src/pages/index.astro`；新增 `src/styles/home.css`（并接入 `initializeLoops()`）；页面标题「ActSpace — 会自我进化的 Agent 运行空间」。
- 删除 `FeatureShowcase.astro`、`showcase.ts`、`showcase.css`、`SHOWCASE_PLAN.md`，以及 `global.css` 中只属于旧首页的样式。
- 验证：`grep -rn "FeatureShowcase\|showcase" apps/site/src` 为空；`check`、`test`、`build` 通过。

### T6 全站统一（文档 / 博客 / 更新日志 / 开发计划 / 404）
- 文档：h1 用展示衬线 36px/500；侧栏底色 `--site-canvas-soft`；正文 h2 衬线 26px/500，h3 无衬线 600；引用、代码块底色随新 token。
- 博客：画布与卡片底色随 token；卡片底 `--site-paper`。不改布局、筛选、排序。
- 更新日志：标题衬线；条目卡片纸面底 + 细边；日期等宽。
- 开发计划：标题衬线；状态胶囊用 `--site-live`/`--site-wip`。
- 验证：每页 1440 与 390 截图；博客筛选、排序、视图切换、文档复制页面、移动目录各点一次。

### T7 产品理念落点与文档同步
- `what-is-actspace.md` 新增「产品理念」：唯变所适、Agent → Actor → Space 三层、三个方向及状态（与首页一致），首屏文字链指向 `/docs/what-is-actspace/#产品理念`。
- 重写 `apps/site/DESIGN.md` 为 V4；`SCREENSHOTS.md` 删首页段落；`docs/exec-plans/README.md` 登记本计划；写 `docs/histories/` 与 `docs/exec-runs/20261017-site-v4-redesign/`。

### T8 真实截图与相框统一（验收后追加）
- [x] `components/home/RealShots.astro`：「现状」末尾的「实拍」区，三张真实截图，点击放大看原图。
- [x] `media.css` / `prose.css`：截图与正文插图统一纸面相框。
- [x] 清理 `docs/context-popup.png` 顶部残字；更新 `screenshots.json` 用途、`SCREENSHOTS.md` 重拍清单与 `DESIGN.md`。
- [x] Logo 改名修复白框；favicon、apple-touch、OG 图重新生成。

### T9 真实界面功能块、开发计划对齐与文档补充（第二轮验收后追加）
- [x] 删除「实拍」区（RealShots）、旧上下文与 Space 的重绘演示；新增 `FeatureShot.astro` + `scripts/home-focus.ts`：左文右图，截图依次聚焦到每条要点对应的区域。
- [x] 首页功能块改为五个真实界面块（改动与交付、执行轨迹、审批、上下文面板、Space 演示）+ Harness 重绘演示；截图来自桌面端浏览器 mock，示例数据。
- [x] 开发计划：`docs/roadmap.md` 条目与首页三个方向对齐，补齐 9–10 月已完成项；页面顶部加三个方向卡（已完成 / 下一步），标题缩小、改中文眉题。
- [x] 文档：新增 `harness-tools.md`（Harness 自进化 V1）；`context.md` 补上下文面板、渐进披露与摘要结构；`agent-turn.md` 改为「查看执行轨迹 / 返回对话」并换图；`what-is-actspace.md` 去掉重复导语、换首图。
- [x] 小问题：手机首屏顶部消息改为长淡出；引用块改暖色。

## 风险

- 系统衬线与 demo 的 Noto Serif SC 观感不同（Mac 上为 Songti SC + Charter）。缓解：T1 后先截首屏比对；若用户不满意，再评估自托管子集字体。
- 首屏舞台依赖绝对定位，1100–1300 宽可能拥挤。缓解：1180 以下隐藏窗口侧栏，900 以下切成纵向布局；验收补 1100 宽截图。
- 动画定时器在后台标签页累积。缓解：`visibilitychange` 与 IntersectionObserver 时停表重来。

## 验证方式

- 命令：`pnpm --filter @actspace/site check`、`pnpm --filter @actspace/site test`、`pnpm --filter @actspace/site build` 全部通过。
- 截图：首页 1440×900、1100×800、390×844 整页分屏截图；首屏和压缩面板分时单帧；文档 / 博客 / 更新日志 / 开发计划 1440 与 390。
- 交互：插件悬停说明、点击开关、键盘 Tab 聚焦；reduced-motion 下首屏与面板为终态；`scrollWidth <= innerWidth`。

## 回退

- 所有改动在 `feat/site-redesign-v4` 分支；任一阶段不满意可 `git checkout main -- apps/site` 回到 V3。

## 进度记录

- [x] T1 Token 与字体
- [x] T2 页头、按钮、页脚
- [x] T3 首屏插件舞台
- [x] T4 现状与方向区块
- [x] T5 首页组装与旧件删除
- [x] T6 全站统一
- [x] T7 产品理念落点与文档同步
- [x] T8 真实截图与相框统一
- [x] T9 真实界面功能块、开发计划对齐与文档补充

## 决策记录

- 2026-10-17：首屏主按钮用「快速开始 →」而非「下载 macOS 版」，因为仓库没有 release，不写不存在的下载。
- 2026-10-17：标题用系统衬线不加载 Web 字体，避免 Google Fonts 在国内阻塞渲染。
- 2026-10-17：插件化只在首屏表达；功能块只讲效果（用户确认）。
- 2026-10-17：结尾 CTA 去掉角色插画，遵守「精灵最多一处」。
- 2026-10-17：终端叠层在 1440 宽下移到舞台右下（bottom 44px），1180 以下移到舞台右下角，避免遮住用户消息和「子 Agent」插件。
- 2026-10-17：V3 计划 `20260926-site-homepage-redesign.md` 的 T10（重拍首页截图）因首页不再用截图而失效，用户确认后已删除该计划。
- 2026-10-17：用户认为真实截图能减弱「AI 感」，要求首页补回。首页演示仍用重绘界面，真实截图只放在「现状」末尾的「实拍」区（Review 全景大图 + 上下文弹层 + 审批卡片）；露出本机路径或私人会话名的截图不上首页。
- 2026-10-17：文档、博客、更新日志与首页实拍共用纸面相框（圆角 12px、细描边、柔和投影），阴影画在外框上。
- 2026-10-17：页头 Logo 白框是开发服务器 `_image` 地址按文件路径缓存一年导致的旧图残留；Logo 改名为 `actspace-mark.png` 让地址变化，并重新生成透明背景的 favicon、apple-touch 图标与 V4 OG 图。
- 2026-10-17：文档链接测试原来只认 `/docs/*`，补上 `/roadmap/`、`/updates/`、`/blog/` 等站内页面，让「产品理念」能链到开发计划。

- 2026-10-17：用户否决「实拍」区：截图要放进对应功能块里，有创意地呈现。改为左文右图的真实界面聚焦块，用户认可这种形式，但要求增加核心功能块；新增改动与交付、执行轨迹、审批三块。
- 2026-10-17：消息队列块放弃：浏览器 mock 里发送不经过队列，拍不出真实画面，不做假图。
- 2026-10-17：截图角标写「产品界面 · 示例数据」/「开发中演示 · 示例数据」，不叫实拍；mock 数据不冒充真实任务。
- 2026-10-17：聚焦放大上限 1.7 倍；聚焦框放进截图画布并反向抵消缩放，避免放大后框和截图错位。
- 2026-10-17：旧界面文档截图能换的换（`workspace-overview`、`trajectory-inspector`、上下文面板），换不了的不动，不放占位图（用户确认）。
- 2026-10-18：「现状」区去掉口号标题和说明，标题改为「基础功能」（用户要求）。
- 2026-10-18：聚焦放大后截图发糊：画布改为按 1.7 倍排版、平时缩小显示，去掉 `will-change: transform`，放大倍数不超过截图分辨率（上下文面板截图 1320px 宽，最多约 1.5 倍）。
- 2026-10-18：首页文案精简：功能块标题去句号、缩短，说明压到一句，要点一行内说完（用户要求）。
- 2026-10-18：首屏窗口按桌面端真实界面重画（H1 demo 经用户确认后实现）：用到的插件各对应窗口里一处可见变化（子 Agent 卡片、审批卡片、压缩分隔线、上下文面板等），开关后按新配置重跑；去掉叠层终端窗口，测试输出进对话流。Browser Use 只留按钮，不在窗口里演示（用户要求）。1400 以下收侧栏，1180 以下纵向。
- 2026-10-18：首屏去掉眉题「唯变所适」（用户认为没有意义），收紧顶部间距，首屏最小高度 700 → 760px：视口约 760px 高的笔记本上窗口从约 320px 高到约 450px，代价是底部插件行略出首屏（用户要求窗口更高）。

## 执行模式

交互模式。

## 执行文档

`docs/exec-runs/20261017-site-v4-redesign/execution-process.md`、`execution-summary.md`。
