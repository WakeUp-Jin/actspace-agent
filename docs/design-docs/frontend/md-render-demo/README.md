# MD 渲染 demo

「MD 功能渲染」的交互 demo，用来和用户逐项确认预览规则与样式。结论写在 [Markdown 编辑与渲染规范](../front-Markdown编辑与渲染规范.md)，截图在 `shots/`。

`editor.bundle.js`（约 600KB）不进仓库，打开 demo 前先构建一次：

```bash
cd docs/design-docs/frontend/md-render-demo
npm install --no-package-lock   # 需要代理时先 export https_proxy=…
npm run build
open index.html
```

- `src/editor.js`：demo 的编辑器逻辑（CodeMirror 6 + Lezer）。
- `index.html`：面板外壳、右侧规则开关（D1–D12）、顶栏的排版 / 字体 / 主题 / 强调色切换和示例文档。
- KaTeX 与 Mermaid 在 demo 里从 jsdelivr 按需加载；正式实现改为本地依赖。
- 这里的代码只为评审服务，正式实现在 `apps/desktop/src/renderer/components/markdown-editor/`，不从这里复制粘贴。
