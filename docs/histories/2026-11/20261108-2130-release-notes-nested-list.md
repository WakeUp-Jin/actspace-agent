## [2026-11-08 21:30] | Task: 修复更新日志嵌套列表导致的官网构建失败

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> Netlify deploy-preview 失败：`apps/site` 构建时报 `docs/releases/feature-release-notes.md` 第 19 行「更新条目必须是单段、无嵌套的 Markdown 列表项」，main 上就是坏的，单独起一个 PR 修一下。

### 🛠 Changes Overview

**Scope:** `docs/releases`

**Key Actions:**

- 把 2026-11-08「改进」里「右侧「上下文」面板：」下的 5 条嵌套子项拉平为 5 条顶层列表项，每条前面补上「上下文」面板的主语，内容不变。

### 🧠 Design Intent (Why)

- `docs/releases/README.md` 明确列表项不使用嵌套列表，站点 parser（`apps/site/src/lib/releases/parse-release-notes.ts`）按这条规则校验并在构建时直接抛错，所以嵌套列表会让整个官网构建失败。
- 拉平而不是删内容：这几条都是用户可感知的变化，只是写法违反了格式约束。

### 📁 Files Modified

- `docs/releases/feature-release-notes.md`
