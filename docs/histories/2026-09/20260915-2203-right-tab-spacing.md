## 2026-09-15 22:03 | Task: 调整右侧 Tab 留白

### Execution Context

- Agent: Codex / GPT-6，桌面应用。

### 用户诉求

参考截图中 Browser 的边距，改善右侧 Tab 太扁、像小标签的观感。方案经用户批准。

### 改动与动机

- `apps/desktop/src/renderer/components/RightPanel.tsx`：Tab 高度调整为 30px、圆角 8px、字号 13px、选中字重 medium；标题左侧与关闭按钮前间距为 10px。
- 保留 44px 顶栏、4px 标签间距、关闭按钮固定占位和现有溢出机制；标题点击区域覆盖 Tab 全高。
- 同步 `docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`，保留该文档原有其他修改。

### 验证

- 前端主题 token 检查通过。
- Renderer TypeScript 检查通过。
- Desktop 完整 typecheck 受未触及的 main/runtime-v2/session-projection.ts 阻塞：desktop-app dist 未导出 DesktopBrowsePage。
- 浏览器临时显式样例验证浅色、多个标签、长中文标题、620px 与 320px 面板；完成后移除样例。
- 深色实际截图与真实 Electron 窗口尚未验收；开发应用标识无法通过 Computer Use 解析。
- 本轮为局部间距调整，不满足至少两条学习沉淀标准，无独立 learning。
