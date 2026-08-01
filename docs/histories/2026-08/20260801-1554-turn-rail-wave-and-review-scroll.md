## [2026-08-01 15:54] | Task: 优化轮次导航波形并修复 Review 行级滚动条

### 🤖 Execution Context

- **Agent ID**: Codex
- **Base Model**: GPT-5
- **Runtime**: Codex desktop main workspace

### 📥 User Query

> 让长会话轮次导航更接近 Codex 的山峰波浪反馈，并修复 Review 长代码行各自出现横向滚动条的问题。

### 🛠 Changes Overview

**Scope:** `packages/desktop`、前端设计文档

**Key Actions:**

- **Turn Rail 波形**: hover 或键盘 focus 某个轮次时，相邻刻度按距离逐级缩短；当前阅读轮次保持独立深色语义，按钮命中区不随视觉宽度变化。
- **Review 滚动所有权**: 移除单行代码的横向滚动，把横向位置统一交给 Diff Canvas；根据全部结构化行预估稳定内容宽度，避免虚拟行切换导致滚动范围跳变。
- **Word Wrap**: 开启折行时把 Canvas 宽度收回到面板宽度，保留现有代码列折行行为。
- **Regression**: 增加 Turn Rail 邻近宽度、Review 单滚动容器和 word wrap 的针对性测试。

### 🧠 Design Intent (Why)

导航波形应该提供连续的位置反馈，而不是只有 hover 单点突然变长。代码审阅则必须让同一阅读平面共享滚动位置；行级滚动会制造大量视觉噪音，也让不同行无法对齐比较。虚拟列表不会让这个原则失效，但需要由未挂载的结构化行提前提供稳定宽度。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/ConversationTurnRail.tsx`
- `packages/desktop/src/renderer/components/review/ReviewDiffCanvas.tsx`
- `packages/desktop/src/renderer/test/conversation-view-tooltip.test.tsx`
- `packages/desktop/src/renderer/test/review-diff-virtualization.test.tsx`
- `docs/design-docs/frontend/front-中间消息区规范.md`
- `docs/design-docs/core-review-change-sources.md`
- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
- `docs/learnings/2026-08/one-axis-one-scroll-owner.md`
