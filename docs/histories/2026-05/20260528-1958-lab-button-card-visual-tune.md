## [2026-05-28 19:58] | Task: 调整 Lab 按钮与卡片视觉

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop app`

### 📥 User Query

> Lab 页面样式需要继续贴近目标图，这一轮只调整两处：`新实验` 按钮保持蓝底主按钮风格；卡片需要更有“一块一块”的分块感，边框可以更深灰，并保留一定阴影层次。

### 🛠 Changes Overview

**Scope:** `packages/desktop`

**Key Actions:**

- **[主按钮样式回调]**: 把 `Lab` 页顶部 `新实验` 按钮调整为更明确的蓝底主按钮，补足边框与阴影层次，贴近目标图的主操作感。
- **[卡片块感增强]**: 提升 Lab 卡片边框对比度，保留但收敛阴影，并同步优化 hover / selected 阴影，让卡片分块更清楚。
- **[全局 reset 收窄]**: 排查发现旧 `styles.css` 在 Tailwind 之后加载，裸 `button` reset 覆盖了 `新实验` 的背景、边框和文字色；将 reset 收窄到旧 UI 容器，避免继续污染 Tailwind 页面。
- **[Kairos 回归修复]**: 收窄全局 reset 后，补齐 Kairos header 主按钮自身的背景、边框和文字色，让 `开启` 按钮不再依赖旧全局 reset。

### 🧠 Design Intent (Why)

这次不是结构改动，而是针对视觉识别做小范围回调。`新实验` 需要保持主按钮身份，普通白底按钮会削弱顶栏操作重心；卡片则需要通过更明确的边框和轻量阴影建立分块感，避免在桌面端页面里糊成一片。

后续排查确认，主按钮颜色不生效的根因不是 Tailwind class 写法，而是 CSS cascade：旧 `styles.css` 的全局 `button { background: none; color: inherit; border: 0; }` 在 Tailwind 之后加载，并作为未分层 author CSS 覆盖了 utility 输出。修复重点因此从“调按钮颜色”转成“收窄旧 CSS 作用域”，让新 Tailwind 页面拥有自己的样式所有权。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/LabPage.tsx`
- `packages/desktop/src/renderer/pages/KairosPage.tsx`
- `packages/desktop/src/renderer/styles.css`
