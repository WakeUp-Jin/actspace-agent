# 聊天区 Markdown 对比 demo

结论（2026-11-02）：用户选定「A 书页」，规范见 [聊天区 Markdown 渲染规范](../front-聊天区Markdown渲染规范.md)。A1–A5 是落选的变体，留作对照。

把同一条 Agent 回复（`sample-chat.txt`）同时用两套代码渲染：

- **原版**：直接引用仓库里的 `components/messages/MarkdownProse.tsx` 和应用编译好的样式（`app.css`），也就是现在聊天区的样子。
- **改进版**：`src/improved.tsx`（插件和组件覆盖）、`src/code-block.tsx`（代码块）、`src/stream.ts`（流式末尾渐显、光标、平滑输出）。分块、高亮语言表直接复用仓库源码。共用样式在 `src/improved.css`。A 书页的样式在 `src/variants.css` 的 `.mdv-book`，A1–A5 各自的覆盖也在这个文件里。这些样式都只作用于 `.md-improved`，不影响原版。B–E 是更早一轮的方向，已经从 demo 里删掉。

顶栏可以切换：

- 并排（原版对照任一版本）或单栏；
- 版本：A 书页，以及 A1 宋体、A2 Claude 味、A3 印刷、A4 书页·有分寸、A5 暖纸；
- 回放流式（模拟真实网络分批到达），平滑输出开或关；
- 单个换行合并成一段，还是保留换行；
- 浅色或深色；
- 打开“编辑示例”，贴进任意 Markdown 实时对比。

## 构建

`demo.js`、`demo.css`、`app.css` 不进仓库，打开前需要先构建：

```bash
# 1. 仓库根目录先 pnpm install，并构建一次 desktop，得到 apps/desktop/dist/assets/index-*.css
# 2. 安装本目录的插件依赖，需要代理时先 export https_proxy=…
cd docs/design-docs/frontend/chat-md-demo
npm install --no-package-lock
npm run build
open index.html
```

如果依赖或构建产物在别的 checkout 里，可以用环境变量 `APP_NODE_MODULES`、`APP_DIST_ASSETS` 指定路径。

Mermaid 被设为 external，示例里没有 Mermaid 图。聊天区 Mermaid 的渲染规则不变，只有外壳样式跟着代码块改。
