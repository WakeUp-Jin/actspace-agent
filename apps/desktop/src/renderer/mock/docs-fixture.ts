import type {
  WorkspaceListMarkdownFilesResult,
  WorkspaceReadFileResult,
  WorkspaceStatFileResult,
  WorkspaceWriteMarkdownFileResult,
} from "@actspace/shared";
import { MARKDOWN_SHOWCASE_IMAGE_DATA_URL, MARKDOWN_SHOWCASE_IMAGE_PATH } from "./markdown-fixture";

/**
 * 浏览器 mock 模式下「文档」面板的数据：目录结构取自真实 docs 目录的一部分，对应 `md-file-tree-demo.html`。
 * 读写都落在内存里（刷新页面即复原），让预览、源码编辑、保存、已变化提示在没有 Electron 时也能检查。
 */

export const MOCK_DOCS_FILES: readonly string[] = [
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "docs/ARCHITECTURE.md",
  "docs/README.md",
  "docs/roadmap.md",
  "docs/markdown-showcase.md",
  "docs/design-docs/ActSpace产品概念思路初稿.md",
  "docs/design-docs/index.md",
  "docs/design-docs/自进化的方案设计/README.md",
  "docs/design-docs/自进化的方案设计/04-会话内自进化与Actor扩展边界.md",
  "docs/design-docs/自进化的方案设计/05-总体架构与DSH借鉴边界.md",
  "docs/design-docs/自进化的方案设计/10-V1实现与使用说明.md",
  "docs/design-docs/自进化的方案设计/11-Harness统计设计.md",
  "docs/design-docs/上下文管理引擎设计/README.md",
  "docs/design-docs/上下文管理引擎设计/agent-context-engine.md",
  "docs/design-docs/上下文管理引擎设计/agent-progressive-disclosure.md",
  "docs/design-docs/上下文管理引擎设计/agent-context-compaction.md",
  "docs/design-docs/frontend/front-右侧面板与文件渲染规范.md",
  "docs/design-docs/frontend/front-聊天输入框规范.md",
  "docs/design-docs/frontend/front-文档面板规范.md",
  "docs/exec-plans/active/20260926-frontend-ui-components-foundation.md",
  "packages/skill/official-skills/plugin-dev/SKILL.md",
  "packages/browser-tools/README.md",
];

const README_BODY = [
  "# Harness 自进化方案设计",
  "",
  "ActSpace 的一切都是插件。自进化就是让 Agent 在运行中**新增、修改、替换**自己的插件，并且每一次变化都可评估、可回退。",
  "",
  "> 先读 01 和 05 了解边界，再读 10 了解 V1 怎么用。V2 的触发方式见 11。",
  "",
  "## 当前状态",
  "",
  "| 阶段 | 能力 | 状态 |",
  "| --- | --- | --- |",
  "| V1 | 会话内新增与修改工具 | 已上线 |",
  "| V2 | 失败触发派生 + 沙箱评估 | 设计中 |",
  "| V3 | Actor 长成与记忆 | 未开始 |",
  "",
  "## 进化流程",
  "",
  "```mermaid",
  "flowchart LR",
  "  A[运行失败] --> B[派生新版本]",
  "  B --> C[沙箱评估]",
  "  C --> D[HMR 切换]",
  "```",
  "",
  "### 触发条件",
  "",
  "- 同一工具连续失败 3 次；",
  "- 用户明确说「换个做法」；",
  "- 评估分数低于基线。",
  "",
  "### 插件声明示例",
  "",
  "```ts",
  "export const manifest = defineBuiltinPluginManifest({",
  '  pluginId: "tool-plugin-manager",',
  '  title: { zh: "插件管理工具", en: "Plugin manager tool" },',
  '  scope: "session", // 会话插件：由 Agent 预设按会话组成',
  "});",
  "```",
  "",
  "## 待办",
  "",
  "- [x] V1：会话内新增与修改工具",
  "- [x] HMR 与运行时版本切换",
  "- [ ] V2：失败触发派生",
  "- [ ] 评估模块与基线分数",
  "",
  "---",
  "",
  "相关：[05-总体架构与DSH借鉴边界](https://example.com/05) · [10-V1实现与使用说明](https://example.com/10)",
  "",
].join("\n");

/**
 * Markdown 编辑器（预览 / 源码）的示例文档，覆盖 `front-Markdown编辑与渲染规范.md` §5 的全部元素。
 * 它在 `docs/` 下，所以相对路径的图片写成 `assets/arch.svg`，对应工作区里的 `docs/assets/arch.svg`（读取见 `mockReadMarkdown`）。
 */
export const MOCK_DOCS_SHOWCASE_PATH = "docs/markdown-showcase.md";

const SHOWCASE_BODY = [
  "---",
  "title: Markdown 渲染示例",
  "owner: Astra",
  "status: 草稿",
  "tags: [design, markdown, preview]",
  "updated: 2026-11-02",
  "---",
  "",
  "# Markdown 渲染示例",
  "",
  "这份文档把「文档」面板预览里会出现的元素都放进来了。光标移到哪个元素上，就只露出那个元素的标记；点别处或切走窗口，回到纯阅读。",
  "",
  "## 行内格式",
  "",
  "行内有 *斜体*、**粗体**、***粗斜体***、~~删除线~~ 和 `行内代码`。一个[网页链接](https://example.com/docs)，一个自动链接 <https://openai.com>，还有一个裸地址 https://github.com/codemirror/dev/issues/1234 。",
  "",
  "Setext 标题（下划线写法）",
  "-----------------------",
  "",
  "### 三级标题",
  "",
  "#### 四级标题",
  "",
  "##### 五级标题",
  "",
  "## 路径与链接",
  "",
  "改动在 `apps/desktop/src/renderer/components/markdown-editor/core/config.ts`，规则写在 `docs/design-docs/frontend/front-文档面板规范.md:80`，示例图片是 `docs/assets/arch.svg`。",
  "",
  "本地链接：[文档面板规范](design-docs/frontend/front-文档面板规范.md)、[第 80 行](design-docs/frontend/front-文档面板规范.md:80)、[README](README.md)。锚点链接：[跳到表格](#表格)。",
  "",
  "版本号 `v1.2.3` 和命令 `pnpm dev` 不该被当成路径；普通文字里的 docs/design-docs/frontend/README.md 也不识别。",
  "",
  "## 列表",
  "",
  "- 无序列表第一项",
  "- 第二项，里面有 **粗体** 和 `code`",
  "  - 嵌套的子项",
  "    - 第三层",
  "  - 另一个子项",
  "- 第三项",
  "",
  "1. 有序列表第一步",
  "2. 第二步",
  "3. 第三步",
  "",
  "## 任务列表",
  "",
  "- [x] 已完成：确认框架用 CodeMirror 6",
  "- [x] 已完成：预览规则 D1–D12",
  "- [ ] 待办：Electron 里实测",
  "- [ ] 待办：性能样本 1MB",
  "",
  "## 引用与提示框",
  "",
  "> 唯变所适。好的工具应该退到内容后面。",
  "> 第二行引用，**依然可以加粗**。",
  ">",
  "> > 嵌套引用，竖条叠加。",
  "",
  "> [!NOTE]",
  "> 说明：GitHub 写法的提示框，竖条和标签用语义色。",
  "",
  "> [!TIP]",
  "> 提示：光标移到第一行会露出 `[!TIP]` 原文。",
  "",
  "> [!IMPORTANT]",
  "> 重要：保存之前先看一眼「已变化」提示条。",
  "",
  "> [!WARNING]",
  "> 注意：保存会覆盖磁盘上的版本。",
  "",
  "> [!CAUTION]",
  "> 警告：这一步不能撤销。",
  "",
  "---",
  "",
  "## 表格",
  "",
  "| 元素 | Codex 做法 | 说明 |",
  "| --- | --- | --- |",
  "| 标题 | 隐藏 `#` | 光标靠近时露出 |",
  "| 表格 | 行内伪表格 | 单元格可以直接改 |",
  "| 代码块 | 隐藏围栏 | 顶部写语言和复制 |",
  "| 链接 | 只显示文字 | 本地文件带文件图标 |",
  "",
  "## 代码块",
  "",
  "```ts",
  "import { EditorState, Compartment } from \"@codemirror/state\";",
  "import { EditorView, keymap, lineNumbers } from \"@codemirror/view\";",
  "import { markdown, markdownKeymap } from \"@codemirror/lang-markdown\";",
  "import { history, historyKeymap, defaultKeymap } from \"@codemirror/commands\";",
  "",
  "/** 预览和源码是同一个 view 上的两套扩展，切换时只重新配置 Compartment。 */",
  "const mode = new Compartment();",
  "",
  "export function createEditor(parent: HTMLElement, doc: string, source = false) {",
  "  const state = EditorState.create({",
  "    doc,",
  "    extensions: [",
  "      history(),",
  "      markdown(),",
  "      mode.of(source ? lineNumbers() : []),",
  "      keymap.of([...markdownKeymap, ...defaultKeymap, ...historyKeymap]),",
  "      EditorView.lineWrapping,",
  "    ],",
  "  });",
  "  const view = new EditorView({ state, parent });",
  "  return {",
  "    view,",
  "    setSource(next: boolean) {",
  "      // 文档、撤销历史、光标和滚动位置都保留",
  "      view.dispatch({ effects: mode.reconfigure(next ? lineNumbers() : []) });",
  "    },",
  "    destroy() {",
  "      view.destroy();",
  "    },",
  "  };",
  "}",
  "```",
  "",
  "```python",
  "def total(items):",
  "    return sum(i.price for i in items)",
  "```",
  "",
  "没有标语言的代码块，常见于报错日志：",
  "",
  "```",
  "Error: Cannot find module '@codemirror/view'",
  "    at Object.<anonymous> (/Users/me/project/index.js:3:15)",
  "```",
  "",
  "## Mermaid",
  "",
  "```mermaid",
  "flowchart LR",
  "  A[打开 .md] --> B{模式}",
  "  B -->|预览| C[CM6 + 装饰]",
  "  B -->|源码| D[CM6 原文]",
  "```",
  "",
  "## 数学公式",
  "",
  "行内公式 $E = mc^2$，价格 $5 和 $10 不是公式。块级公式：",
  "",
  "$$",
  "\\int_0^1 x^2 \\, dx = \\frac{1}{3}",
  "$$",
  "",
  "## 图片",
  "",
  "本地图片（相对当前文档所在目录）：",
  "",
  "![架构图](assets/arch.svg)",
  "",
  "远程图片不加载，显示原文：",
  "",
  "![徽章](https://img.shields.io/badge/build-passing-green)",
  "",
  "## 原始 HTML",
  "",
  "<details><summary>原始 HTML 按原文显示，不执行</summary>折叠内容。</details>",
  "",
  "最后一段普通文字。",
  "",
].join("\n");

function genericBody(path: string): string {
  const name = path.split("/").pop()?.replace(/\.(md|markdown)$/i, "") ?? path;
  return [
    `# ${name}`,
    "",
    `\`${path}\``,
    "",
    "## 背景",
    "",
    "这是 mock 模式的占位内容。真实实现里，点击文件时才读取并渲染这一篇，不会预先读取整个目录。",
    "",
    "## 结论",
    "",
    "文件树本身只保存文件名和目录结构，开销很小；正文按需加载，切换文件时释放上一篇。",
    "",
  ].join("\n");
}

type MockDoc = { content: string; mtimeMs: number };
const BASE_MTIME = 1_730_000_000_000;
const docs = new Map<string, MockDoc>();

function ensure(path: string): MockDoc | null {
  if (!MOCK_DOCS_FILES.includes(path)) return null;
  let doc = docs.get(path);
  if (!doc) {
    const content = path === "docs/design-docs/自进化的方案设计/README.md" ? README_BODY : path === MOCK_DOCS_SHOWCASE_PATH ? SHOWCASE_BODY : genericBody(path);
    doc = { content, mtimeMs: BASE_MTIME };
    docs.set(path, doc);
  }
  return doc;
}

const byteLength = (text: string) => new TextEncoder().encode(text).length;

export function resetMockDocs(): void {
  docs.clear();
}

export function mockListMarkdownFiles(): WorkspaceListMarkdownFilesResult {
  return { ok: true, files: [...MOCK_DOCS_FILES], truncated: false, source: "git" };
}

export function mockReadMarkdown(relativePath: string): WorkspaceReadFileResult {
  if (relativePath === MARKDOWN_SHOWCASE_IMAGE_PATH) {
    return { relativePath, renderKind: "image", size: MARKDOWN_SHOWCASE_IMAGE_DATA_URL.length, mtimeMs: BASE_MTIME, dataUrl: MARKDOWN_SHOWCASE_IMAGE_DATA_URL };
  }
  const doc = ensure(relativePath);
  if (!doc) return { relativePath, renderKind: "external", size: 0, mtimeMs: 0, error: "not_found" };
  return { relativePath, renderKind: "markdown", size: byteLength(doc.content), mtimeMs: doc.mtimeMs, content: doc.content };
}

export function mockStatMarkdown(relativePath: string): WorkspaceStatFileResult {
  const doc = ensure(relativePath);
  if (!doc) return { relativePath, size: 0, mtimeMs: 0, error: "not_found" };
  return { relativePath, size: byteLength(doc.content), mtimeMs: doc.mtimeMs };
}

export function mockWriteMarkdown(relativePath: string, content: string): WorkspaceWriteMarkdownFileResult {
  const doc = ensure(relativePath);
  if (!doc) return { ok: false, error: "not_found" };
  doc.content = content;
  doc.mtimeMs += 1000;
  return { ok: true, mtimeMs: doc.mtimeMs, size: byteLength(content) };
}
