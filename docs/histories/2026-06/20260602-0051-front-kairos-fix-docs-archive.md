## [2026-06-02 00:51] | Task: 收口前端 / Kairos 设计文档并归档 fix 修复记录

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 继续执行设计文档收口计划：合并前端右侧渲染与 Kairos 视图相关文档，归档 `fix-*` 修复分析，并更新索引、架构入口、AGENTS、旧链接、检查脚本和 history。

### 🛠 Changes Overview

**Scope:** `docs/design-docs`, `docs/references`, `docs/exec-plans`, `docs/histories`, design references in packages

**Key Actions:**

- **[Right Panel Merge]**: 将 Markdown 渲染、HTML 沙箱、Context 完整视图、消息可视化转换和 Workspace 文件浏览器的关键契约合并到 `front-右侧面板与文件渲染规范.md`。
- **[Kairos Merge]**: 将 Kairos 上下文 Sheet 与聊天态右侧 compact view 合并到 `front-Kairos监控页规范.md`，保留完整页与紧凑视图的边界。
- **[Fix Archive]**: 将 `fix-llm-agent-*` 修复分析从 `docs/design-docs/` 移到 `docs/references/llm-agent-dev-skill-fixes/`，让主线设计目录只承载长期事实来源。
- **[Navigation Sync]**: 更新 `docs/design-docs/index.md`、`front-index.md`、`AGENTS.md`、`ARCHITECTURE.md`、`docs/references/README.md` 和相关 active / completed plan、history、代码注释中的旧链接。
- **[Learning Decision]**: 本轮命中“有模式 / 可迁移”，但核心模式已由 `docs/learnings/2026-06/design-docs-flat-prefix-public-assets.md` 覆盖；本记录只补充“设计事实来源 vs 参考归档”的取舍，不再新增重复 learning。

### 🧠 Design Intent (Why)

前端右侧渲染相关文档原本按能力拆得很细，适合实现期并行推进，但进入稳定期后会增加索引、链接和 Agent 阅读成本。把渲染、文件浏览、Context 和 Reply HTML 收到右侧面板母规范，可以让“右侧对象浏览区”成为单一事实来源。Kairos 的 Sheet 和 compact view 都是 Kairos 监控体验的一部分，收进监控页母规范后，完整页与聊天态投影的差异更容易对比。

`fix-*` 文档不是长期架构事实来源，而是对 `llm-agent-dev` skill 的历史修复分析；放在 `docs/references/` 更符合“可追溯但不干扰主线设计阅读”的定位。

### 📁 Files Modified

- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
- `docs/design-docs/kairos/front-Kairos监控页规范.md`
- `docs/design-docs/frontend/README.md`
- `docs/design-docs/index.md`
- `docs/references/README.md`
- `docs/references/llm-agent-dev-skill-fixes/*`
- `AGENTS.md`
- `docs/ARCHITECTURE.md`
- `docs/exec-plans/active/20260527-right-panel-views.md`
- `docs/exec-plans/active/20260528-kairos-right-panel-compact-view.md`
- `docs/exec-plans/active/20260530-workspace-file-explorer.md`
- `docs/histories/2026-06/20260602-0051-front-kairos-fix-docs-archive.md`
