## [2026-11-10 00:55] | Task: 精细化官网首页（V4 风格不变，窗口与插件画得更真实）

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.1`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> 我觉得都不咋地，现在的官网你精细化一版看看，再把现在的官网做的更好一些看看呢

（此前给出的 6 个新风格方向原型均被否决；用户要的是把现有 V4 官网本身做精细、首页更真实。）

### 🛠 Changes Overview

**Scope:** `apps/site`

**Key Actions:**

- **窗口 chrome 真实化**：首屏窗口、功能块窗口、Harness 窗口共用 `--win-shadow`（1px 墨色描边 + 贴地短影 + 远处长影）和顶部 1px 白高光；窗口按钮从灰点改成 macOS 红黄绿三色（12px、内描边）。功能块标题栏加高到 38px、标题居中无衬线。
- **首屏舞台**：底部压一层淡暗角（`.hero-stage::after`），窗口像放在桌面上。
- **插件模块**：去掉圆点，每个插件带 15px 线性图标（path 写在 `Hero.astro` 的数组第 4 项），名字改无衬线 500，卡片加纸面阴影和悬停上浮；点亮时图标和开关转紫，关掉时图标变淡、名字划线。
- **连线**：`home-stage.ts` 的折线拐角倒成半径 8 的圆角（`roundedPath`）。
- **对话起点**：`PREVIOUS` 从两行扩成完整的上一轮（气泡、Worked、带 `code` 的回答、改动卡片、用量行），动画开场不再是空白窗口。
- **基础功能卡片**：`Capability` 增加 `icon` 字段，`TodaySection.astro` 渲染 34px 画布色图标块，悬停转紫。
- **文档同步**：`apps/site/DESIGN.md` 更新字体、首屏、功能块、基础功能和响应式描述。

### 🧠 Design Intent (Why)

用户反馈首页「不够真实」。V4 的结构和配色没问题，问题出在细节：灰色窗口按钮、单层阴影、示意图式的等宽插件胶囊、开场空白的对话，都让窗口看起来像示意图而不是产品截图。这一版只补这些细节，不动布局、token 和文案。

### 📁 Files Modified

- `apps/site/src/components/home/Hero.astro`
- `apps/site/src/components/home/TodaySection.astro`
- `apps/site/src/lib/home-features.ts`
- `apps/site/src/scripts/home-stage.ts`
- `apps/site/src/styles/home.css`
- `apps/site/DESIGN.md`
