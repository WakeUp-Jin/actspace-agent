## [2026-05-27 10:13] | Task: Usage overview card composition

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 将 Usage 页面右侧的时间范围、分享/刷新和输入/输出/缓存/推理指标收进 Token 总数大卡；暂不调整左右分栏布局，Tailwind 引入后续再设计。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer UI

**Key Actions:**

- **[Overview composition]**: 将范围切换、刷新/分享按钮移动到 Token 总数卡片顶部。
- **[Metric grouping]**: 将输入、输出、缓存、推理四个指标卡移动到 Token 总数卡片底部。
- **[Layout styling]**: 调整 Token 总数卡片内部间距与卡内工具栏布局，保留原有左右分栏宽度。

### 🧠 Design Intent (Why)

Usage 页面右侧第一屏应表达为一个完整 overview 模块，而不是工具栏、Token 总数和指标卡三块分散组件。先收敛 DOM 层级和视觉层级，后续再统一设计 Tailwind 与 12 栅格响应式布局。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `packages/desktop/src/renderer/styles.css`
