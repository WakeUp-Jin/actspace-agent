## [2026-05-28 16:32] | Task: Lab 页面视觉重构（去花哨化）

### 🤖 Execution Context

- **Agent ID**: `Cursor Agent`
- **Base Model**: `Claude Opus 4.7`
- **Runtime**: `Cursor IDE`

### 📥 User Query

> 这个 Lab 的页面调整优化一下，颜色、卡片、标题太丑（GPT 审美），加载前端/设计相关的 skill，参照 design-docs 一起调整设计。布局没问题，主要是颜色、卡片、标题这些细节。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer · Lab design doc

**Key Actions:**

- **[Topbar]**: 移除原本"白色卡片框 + 28px 内边距 + Lab 标题悬浮"的处理，回到一行简洁标题 + 右上紧凑按钮组（次操作 + 主操作）。主按钮加 `Plus` 前缀 icon，更接近桌面工作台节奏。同时删除曾短暂尝试过的"实验台 · 当前矩阵"副标题（违反 `frontend-page-design.md` 的"不展示页面解释文案"）。
- **[列容器]**: 四列底色统一回归 `bg-surface`（白）+ 极淡灰边框，不再使用饱和的纸张色 `#f3f7ff / #fff7ef / #eefbfc / #fffaf0`。
- **[列头]**: 新增 4-5% 阶段色背景块 + 左侧 3px 阶段色线作为身份徽章，承担"温和色块帮助区分阶段"的语义，同时不让色彩污染列体。列头数字徽标改 11px text-faint tabular-nums。
- **[卡片]**: 卡片胶囊高度从 22px 缩到 18px，字号统一 11px；卡片标题从 13px font-semibold 改为 13px font-medium 让视觉更克制；hover 状态去掉 `-translate-y-px` 抖动，回到纯颜色变化；selected 态由"整圈品牌色边框"改为"`border-brand` + `brand-soft/40` 背景 + 左侧 2px 蓝条"。
- **[空列处理]**: 移除每列 5 个虚线 placeholder 占位框（原本让晋升列变成一片虚框）。空列改为一行 `暂无{阶段名}。` 文本提示，让列自然结束。
- **[设计文档同步]**: 在 `docs/design-docs/lab-frontend-page-design.md` "视觉约束" 一节加入这次实现决策——白底列 + 列头色块、卡片不染色、不渲染空槽 placeholder，避免后续再回到老做法。

### 🧠 Design Intent (Why)

旧版四列各染一种饱和纸张色（淡蓝/淡橙/淡青/淡金）+ 每张卡片再叠一个高饱和度标签胶囊（主假说蓝/草稿灰/阻塞红/候选蓝/验证中黄/通过绿/CLI 青/待评审金）+ 每列 5 个虚线空 placeholder，结果是页面变成"幼儿园彩色看板"，违反 `docs/design-docs/front-全局视觉语言规范.md` 中"黑色负责阅读、灰白负责承载、蓝色负责行动；蓝色不用于大面积页面背景"的核心原则，也违反 `frontend-page-design.md` 中"四列可以有非常浅的纸张色区分，但不能变成彩色看板"。

这次的处理思路：**色彩只在列头作为身份徽章存在，列体保持白底；卡片只展示小而克制的标签胶囊**。这样桌面工作台的密度感和长时间阅读舒适度回到设计文档约定的基线。

### ✅ Verification

- `pnpm --filter @actspace/desktop test -- lab-page` → 5/5 passed。
- `pnpm --filter @actspace/desktop test` → 103/103 passed（全量）。
- `pnpm --filter @actspace/desktop build` → success（@actspace/shared + @actspace/agent-core + renderer vite + electron tsc 都通过）。
- LabPage.tsx 独立 tsc → no errors。仓库 typecheck 在 Kairos 测试上有遗留错误（`systemPromptSegments` 字段缺失），属于 working tree 上已有的未完成 Kairos 工作，跟本次 Lab 改动无关。
- ReadLints LabPage.tsx → no errors。
- 浏览器 mock 视觉确认：在 `http://127.0.0.1:5173/#/lab` 从 sidebar 打开 Lab，确认四栏矩阵、卡片选中态、详情弹窗渲染正确，并与 `public/lab/prototype-refresh.html` 静态原型 1:1 对齐。

### 🧪 Follow-up: HTML 原型 + 最终对账（17:06）

后续追加：

- **[Prototype]**: 新增 `docs/design-docs/public/lab/prototype-refresh.html` —— 一个 self-contained HTML 原型，把这次修改后的视觉抽出可独立预览的版本（不依赖 vite dev server），方便后续设计评审和回归对比。保留旧的 `public/lab/prototype.html` 作为对比基线，不覆盖。
- **[Design Doc 强化]**: `docs/design-docs/lab-frontend-page-design.md` "视觉约束" 一节加入具体实现决策——列底白色 + 列头温和色块 + 不渲染空槽 placeholder，避免后续重写又回到老做法。
- **[最终对账]**: React 应用与 HTML 原型并排截图对比，确认 1:1 对齐；跑完完整 typecheck（除 Kairos 历史遗留外干净）+ build + 103/103 测试全绿。

### 🔁 Follow-up: 卡片"实物感"加固（17:26）

用户在真实 Retina 屏 Electron 应用里反馈 "卡片好像没有边框"。原因：`--act-color-border: #dfe4ea` 与白底列体在 macOS HiDPI 抗锯齿下几乎融合，1px 边框被"吃掉"。补强：

- **[Card border]**: 卡片边框从 `border-line` (#dfe4ea) 升到 `border-line-strong` (#c8d1dc)；同时加 `shadow-[0_1px_2px_rgba(15,23,42,0.05)]` 极轻凸出阴影。在白底列体上重新建立"实物感"。
- **[Card hover]**: hover 边框 `#a8b3c0`、shadow 加深到 `0_2px_8px_rgba(15,23,42,0.08)`。
- **[Hover/Selected 优先级修复]**: 把卡片 hover 状态从 `cardClass` 拆到独立 `cardHoverClass`，selected 卡片不应用普通 hover，避免 Tailwind utility 同 variant 优先级冲突（普通 hover 会把 selected 的蓝边 override 成灰边）。
- **[Selected card]**: bg 从 `bg-brand-soft/40` 提到满饱和度 `bg-brand-soft`；左侧 brand 线从 2px 升到 3px（与列头 accent 对齐）；加 `shadow-[0_2px_8px_rgba(47,111,255,0.14)]` 蓝色调阴影增强"被选中"氛围感。
- **[Primary button]**: "+ 新实验" 按钮阴影从中性灰 `rgba(31,45,61,0.08)` 改成品牌蓝调 `rgba(47,111,255,0.28) + 0_0_0_1px rgba(47,111,255,0.12)`，让蓝色主操作真正"凸"出来。
- **[Prototype 同步]**: `public/lab/prototype-refresh.html` 同步以上所有改动，保持 React 实现 1:1 对齐。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/LabPage.tsx`
- `docs/design-docs/lab-frontend-page-design.md`
- `docs/design-docs/public/lab/prototype-refresh.html`（新增 + 二次同步）
