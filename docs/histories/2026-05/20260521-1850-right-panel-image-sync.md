## [2026-05-21 18:50] | Task: 同步右侧面板定稿图

### 🤖 Execution Context

- **Agent ID**: `local`
- **Base Model**: `gpt-5.5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 把右侧面板相关定稿图同步到文档和图片目录，让它成为可直接给新会话加载的稳定输入。

### 🛠 Changes Overview

**Scope:** `docs/design-docs`, `docs/histories`

**Key Actions:**

- **完善右侧规范**：补上右侧 Markdown / HTML / Image / Diff 定稿图引用。
- **完善图片说明**：在 `public/front/README.md` 中列出右侧面板全部定稿图。

### 🧠 Design Intent (Why)

右侧面板已收口为文件预览与会话级 diff，补齐图例后可以直接作为后续并行会话的输入基线。

### 📁 Files Modified

- `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`
- `docs/design-docs/frontend/README.md`
- `docs/histories/2026-05/20260521-1850-right-panel-image-sync.md`
