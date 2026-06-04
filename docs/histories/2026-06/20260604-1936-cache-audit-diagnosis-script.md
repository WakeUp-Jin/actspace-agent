## [2026-06-04 19:36] | Task: Enhance cache audit diagnosis

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 缓存效率只有约 82%，希望先把缓存分析脚本做得更好，暂不修改 read_file 等工具策略。

### 🛠 Changes Overview

**Scope:** scripts / docs

**Key Actions:**

- **[Script Diagnostics]**: Enhanced `scripts/analyze-cache-audit.mjs` with weighted cache hit overview, worst-entry summary, recursive audit lookup, and per-entry diagnosis categories.
- **[Context Delta Analysis]**: Added message delta sizing, role/source counts, separated tool call/result counts, reusable prefix size, request size, and new/changed share output.
- **[Docs Sync]**: Updated cache audit design notes with the new diagnosis categories and clarified that character sizing is only a local triage signal.

### 🧠 Design Intent (Why)

The original script could show whether prefix or append-only changed, but most low-cache samples had stable prefix and append-only history. The enhanced script separates structural cache loss from normal large appended suffixes, so future tuning can target real causes instead of chasing one aggregate percentage.

### 📁 Files Modified

- `scripts/analyze-cache-audit.mjs`
- `docs/design-docs/agent-cache-loss-audit.md`
