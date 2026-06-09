## [2026-06-09 09:13] | Task: README wordmark

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 参考给定图片，为 Actspace Agent 生成类似横向 logo wordmark，并放到适合 GitHub README 使用的位置。

### 🛠 Changes Overview

**Scope:** README 文档展示资产

**Key Actions:**

- **[README brand asset]**: 新增 `docs/assets/readme/actspace-agent-wordmark.svg` 作为可编辑源文件，并导出 `actspace-agent-wordmark.png` 供 GitHub README 稳定展示。
- **[README header]**: 将 README 顶部标题替换为居中的 `Actspace Agent` 横向 wordmark。
- **[Visual tuning]**: 二次调整 wordmark 的图标缩放、垂直位置、文字字号和词间距，让图标与文字更像同一组横向 lockup。

### 🧠 Design Intent (Why)

README 展示资产属于仓库文档资产，不应混入桌面端打包资源目录；放在 `docs/assets/readme/` 可以和仓库知识库同源维护，也方便后续继续沉淀 README 截图、封面和品牌图。PNG 用于 GitHub 稳定渲染，SVG 保留为后续微调源文件。

### 📁 Files Modified

- `README.md`
- `docs/assets/readme/actspace-agent-wordmark.svg`
- `docs/assets/readme/actspace-agent-wordmark.png`
