## [2026-08-07 20:16] | Task: 精简本地更新弹窗头部

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 去掉本地更新弹窗状态圈外的彩色方框，并把“正在从源码构建 Actspace.app…”移到“本地更新”标题后面。

### 🛠 Changes Overview

**Scope:** `packages/desktop` renderer

**Key Actions:**

- **[Header layout]**: 状态图标改为无底板的独立线性图标，减少模板化视觉装饰。
- **[Status placement]**: 标题与动态进度文案改为同行排列，并保留窄宽度下的自然换行。
- **[Regression coverage]**: 补充测试，锁定标题与进度文案属于同一可换行容器。

### 🧠 Design Intent (Why)

更新弹窗属于高频状态反馈，应以进度信息为主。移除图标底板并收紧标题区，可以减少无意义的彩色面积，使视觉层级更符合 Ink & Emerald 的克制桌面工具方向。

本次改动范围较小，未达到独立学习文档的沉淀门槛。

### 📁 Files Modified

- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/desktop/src/renderer/test/settings-page.test.tsx`
- `docs/histories/2026-08/20260807-2016-local-update-dialog-header.md`
