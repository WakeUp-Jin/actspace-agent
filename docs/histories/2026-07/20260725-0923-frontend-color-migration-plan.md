## [2026-07-25 09:23] | Task: 生成前端配色迁移计划

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 根据已确认的 `Ink & Emerald / 墨色与翡翠绿` 设计系统，生成一份可执行的前端配色调整计划。

### 🛠 Changes Overview

**Scope:** 前端配色迁移 execution plan

**Key Actions:**

- **[Current-state audit]**: 扫描 renderer 中当前 `brand` 消费基线，记录 40 个文件、159 行相关使用和高频 utility。
- **[Semantic migration]**: 将迁移拆为 neutral、action、operational、semantic、visualization 和 diff 职责，明确禁止全局换绿。
- **[Staged delivery]**: 安排视觉样板、token 地基、Sidebar / Composer / Settings 黄金切片、工作台页面、legacy alias 清理和 Electron 验收。
- **[Regression guard]**: 计划增加主题 token 完整性和非主题颜色防回流脚本。

### 🧠 Design Intent (Why)

当前 `brand` 同时承担导航选中、hover / focus、Toggle、running、主按钮和图表，直接替换色值会让全站从“满屏蓝”变成“满屏绿”。因此计划先锁定颜色职责和三个视觉样板，再逐切片迁移并最后删除旧 alias。

### 📁 Files Modified

- `docs/exec-plans/active/20260725-frontend-color-system-migration.md`
- `docs/histories/2026-07/20260725-0923-frontend-color-migration-plan.md`

