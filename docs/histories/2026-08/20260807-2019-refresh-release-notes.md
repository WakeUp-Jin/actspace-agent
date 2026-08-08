## [2026-08-07 20:19] | Task: 补充最近修复的发布记录

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 检查最近提交是否同步到更新日志，并补充遗漏内容。

### 🛠 Changes Overview

**Scope:** 发布记录与文档 history。

**Key Actions:**

- **[窄窗口布局]**: 将 Bash 审批卡片在窄窗口下不再被裁切的修复补入 2026-08-05 更新。
- **[HTML 预览]**: 新增 2026-08-06 更新，记录固定尺寸 HTML 画布会随预览区宽度适配的修复。

### 🧠 Design Intent (Why)

发布记录按用户可感知结果聚合，不按 commit 逐条复制；两个修复分别归入对应完成日期，保持最新月份和日期倒序结构。

### 📁 Files Modified

- `docs/releases/feature-release-notes.md`
- `docs/histories/2026-08/20260807-2019-refresh-release-notes.md`
