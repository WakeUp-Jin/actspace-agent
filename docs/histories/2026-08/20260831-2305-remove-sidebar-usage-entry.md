## [2026-08-31 23:05] | Task: 移除侧边栏 Usage 入口

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 去掉主工作区侧边栏中的 Usage 入口，但保留 Usage 页面及相关能力。

### 🛠 Changes Overview

**Scope:** `apps/desktop`

**Key Actions:**

- **[Sidebar]**: 移除主工作区侧边栏的 Usage 按钮及其图标。
- **[Navigation]**: 删除侧边栏 Usage 入口对应的回调链，避免通过该入口跳转设置中心。
- **[Tests]**: 更新 Sidebar 测试，确认 Usage 不再出现在主侧边栏。

### 🧠 Design Intent (Why)

Usage 已经作为设置中心中的活动分析页面存在，主工作区再保留一个同名入口会造成导航重复。此次只收窄入口，不删除设置中心页面、Usage 数据加载、持久化状态或对话内上下文用量显示。

### 📁 Files Modified

- `apps/desktop/src/renderer/components/Sidebar.tsx`
- `apps/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `apps/desktop/src/renderer/test/sidebar.test.tsx`
