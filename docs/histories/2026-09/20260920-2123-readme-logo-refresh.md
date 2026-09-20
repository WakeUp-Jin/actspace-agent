## [2026-09-20 21:23] | Task: 更新 README 品牌图标

### 📥 User Query

> 更新 README 开头的图标，使用新的 Actspace logo。

### 🛠 Changes Overview

**Scope:** 根 README 品牌资源

**Key Actions:**

- **[README wordmark]**: 用用户提供的新透明 PNG 替换 README 顶部实际引用的 `actspace-agent-wordmark.png`。
- **[Compatibility]**: 保持 README 的资源路径和展示标记不变，避免影响其他内容。

### 🧠 Design Intent (Why)

README 顶部直接消费 PNG 资源；保持原路径可以让 GitHub 等 Markdown 渲染环境自动显示新 logo，同时不改动无关页面或应用代码。仓库中的 SVG 可编辑源文件未被新的 PNG 覆盖。

### 📁 Files Modified

- `docs/assets/readme/actspace-agent-wordmark.png`
- `docs/histories/2026-09/20260920-2123-readme-logo-refresh.md`
