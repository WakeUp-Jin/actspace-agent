## [2026-05-27 00:10] | Task: 全局字体策略对齐 Cursor IDE

### 🤖 Execution Context

- **Agent ID**: 本轮会话
- **Base Model**: Claude Opus 4.7
- **Runtime**: Cursor IDE (Plan → Agent 双段执行)

### 📥 User Query

> Cursor 的全局样式设计让人非常舒服，希望 actspace 的字体策略全面对齐 Cursor。GPT 已经从 `/Applications/Cursor.app` 抽取真实 workbench CSS 给出诊断：actspace 全局开了 `font-feature-settings: "cv11", "ss01"`、大量使用非标字重（430/440/520/650/720/800）、sidebar 字号偏大（13.5px）、markdown 标题加了负字距。建议关掉全局 OpenType feature、字重收敛到 400/500/600/700、sidebar 走 12/13px 中间档。

### 🛠 Changes Overview

**Scope:** `@actspace/desktop`（renderer CSS only）+ 三份 `docs/design-docs/front-index.md` 规范文档。

**Key Actions:**

1. **关闭全局 font-feature-settings**：`body` 从 `"cv11", "ss01"` 改为 `normal`，与 Cursor `.monaco-workbench` 全局策略一致。本机实测 Cursor workbench CSS 全局只在数字字段局部用 `"tnum"`、个别 hotkey 用 `"cv05" on`，从来不全局开 `cv11/ss01`。
2. **字重严格收敛到 400/500/600/700**：删掉所有非标档（430/440/520/540/620/650/680/720/800），共触达 ~25 处。规则：正文/工具行/file-diff 400、导航/按钮 500、卡片标题/表头 600、Markdown headings/Usage 大数字 700。
3. **Sidebar 字号下调到"中间档"**：会话标题 13.5→13、section 标题 13.5/440→12/500/faint、主入口 13.5→13、Settings 13.5→13、时间戳 12→11；分组标题改为"靠字号小一档 + 颜色更浅"区分语义，不再依赖 440 这种非标字重做层级。
4. **去除过度负字距**：Usage 区 `letter-spacing: -0.055em / -0.04em` 全部归到 `-0.02em` 上限；Markdown headings 的 `-0.02em` 直接归 `0`。
5. **三份设计规范同步更新**：把上面这些代码层决策写进 `全局视觉语言规范.md`、`左侧会话栏规范.md`、`front-usage-statistics.md`，防止规范和代码再次漂移。

### 🧠 Design Intent (Why)

- **为什么关 `cv11/ss01`**：这两个是 SF Pro 的拉丁 stylistic set / character variant，会把英文字符换形（单层 `a`、不同的 `g` 形态等）。全局开了之后整个 UI 的拉丁字符就和 macOS 系统 UI（Finder / Safari / 设置面板）不一致，肉眼一看就"不像 macOS 原生应用"。Cursor 没开是有理由的，actspace 跟上。
- **为什么禁用非标字重**：430/440/520 这类中间档在 macOS 系统字体下落点不稳定，本身视觉权重就不可控；早期版本曾用「主入口 520 / 分组标题 440」做"重一档 vs 轻一档"区分，结果在不同字号下落点摇摆。**改用"字号 + 颜色 token (text/muted/faint)"做层级**，比靠半档字重稳得多。
- **为什么不"完全照 Cursor"**：Cursor sidebar session title 是 12px / cell-text、section 是 11px。中文在 11px 下会发糊，所以我们取"中间档"——会话标题 13、分组 12、时间 11，比 Cursor 略大一档以照顾中文，但已经统一到 1px 步长内的标准值。
- **为什么 Usage 也一起拉**：用户明确选择 `usage_pull_back`。Usage 之前 prototype 大量使用 `font-weight: 800` 和 `letter-spacing: -0.055em` 是"dashboard 装饰风格"，与 actspace 全局"克制、IDE 工作台感"的视觉气质不一致。统一回 700 后大数字仍然是"主角"，但和 sidebar、聊天区有一致的语言。

### 📁 Files Modified

- `packages/desktop/src/renderer/styles.css`（核心：~30 处字号/字重/letter-spacing 改动 + 全局 body feature-settings）
- `docs/design-docs/front-全局视觉语言规范.md`（字体栈、字号阶梯、字重段重写，新增「字体特性」段）
- `docs/design-docs/front-左侧会话栏规范.md`（「分组标题统一规范」与「字号基准」段重写）
- `docs/design-docs/front-usage-statistics.md`（「字体与数字」段重写）

### ✅ Verification

- 工程层：`pnpm typecheck` 通过（纯 CSS 改动，不会破坏 TS 类型）。
- 浏览器 mock：通过 `pnpm dev:log` 启动 `http://127.0.0.1:5173/`，逐屏比对 sidebar / topbar / assistant / Usage 字形与密度。
- Electron 真机：`font-feature-settings: normal` 改动在浏览器和 Electron 都生效，但实际字形（SF Pro on macOS）只在 Electron 窗口下才是用户最终看到的样子，需要用户在窗口下确认。
- 当前 Agent 无 Computer Use，需用户提供截图。

### 🔗 Related

- 上一轮 `20260526-2230-sidebar-polish-round2.md` 引入 `font-feature-settings: cv11, ss01` 与 13.5px 字号，本轮将其纠正。
- 上一轮 `20260526-2240-sidebar-polish-round3.md` 把分组标题统一到 13.5px/520，本轮改为 12px/500/faint。
- 学习沉淀：本轮命中"新概念"（OpenType character variant / stylistic set 与系统 UI 一致性；冷调背景下纯中性灰文字的色相对立问题）+ "有陷阱"（全局开 feature-settings 会悄悄拉跨系统原生感；冷背景上用独立灰 hex 会"飘"）+ "可迁移"（任何 `-apple-system` 字体栈的 Electron 桌面应用都会撞到；色相协调的"主前景透明梯度"是跨主题的稳态做法）。可考虑后续按 `docs/learnings/WRITING_GUIDE.md` 写一份学习文档。

### 📝 Follow-up：色板调整（同一轮）

字体策略对齐 Cursor 之后，用户立刻反馈"actspace 背景是浅蓝色，灰色字在浅蓝背景上不明显也奇怪"。诊断：

- actspace 背景偏冷（`--color-bg: #fbfcff`、`--color-sidebar: #f3f5f7`）。
- 之前 `--color-text-muted: #5f6670` / `--color-text-faint: #8b949e` 是独立的"纯中性灰" hex。
- 纯中性灰文字 + 冷蓝背景 → 色相对立，文字看起来"飘在背景上"。

去 Cursor `.monaco-workbench` CSS 实测，它的灰文字不是独立灰，而是**主前景色 + alpha 梯度**（`color-mix(in srgb, var(--vscode-foreground) 74%/54%/36%, transparent)`）。文字色因此会"吸收"背景色调，跨白卡片 / 浅蓝 sidebar / 灰 popup 都协调。

跟进改动：

- `packages/desktop/src/renderer/styles.css`：
  - `--color-text-muted: #5f6670` → `rgba(32, 33, 36, 0.72)`（对齐 Cursor secondary）
  - `--color-text-faint: #8b949e` → `rgba(32, 33, 36, 0.54)`（对齐 Cursor tertiary）
  - 新增 `--color-text-subtle: rgba(32, 33, 36, 0.36)`（对齐 Cursor quaternary，用于占位、kicker、最弱图标）
  - 两处硬编码灰（`bash-output-text #6d727a`、`bash-approval-command #5f6670`）收回 `var(--color-text-muted)`。
  - `tool-log-line.is-running` 的 shimmer 基色 `#6f7681` 保持纯灰，是 shimmer 动画的有意设计（[中间消息区规范.md](../../design-docs/front-中间消息区规范.md) 已说明）。
- `docs/design-docs/front-全局视觉语言规范.md`：「基础色板」段更新 token 定义，新增「关于文字色用 `rgba(主前景, α)` 而不是独立灰 hex 的设计意图」小节；「文本颜色」段补充 `--color-text-subtle`。
