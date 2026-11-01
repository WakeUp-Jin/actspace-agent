import type {
  WorkspaceListMarkdownFilesResult,
  WorkspaceReadFileResult,
  WorkspaceStatFileResult,
  WorkspaceWriteMarkdownFileResult,
} from "@actspace/shared";

/**
 * 浏览器 mock 模式下「文档」面板的数据：目录结构取自真实 docs 目录的一部分，对应 `md-file-tree-demo.html`。
 * 读写都落在内存里（刷新页面即复原），让预览、源码编辑、保存、已变化提示在没有 Electron 时也能检查。
 */

export const MOCK_DOCS_FILES: readonly string[] = [
  "AGENTS.md",
  "CLAUDE.md",
  "README.md",
  "docs/ARCHITECTURE.md",
  "docs/FRONTEND.md",
  "docs/PRODUCT_SENSE.md",
  "docs/README.md",
  "docs/roadmap.md",
  "docs/design-docs/ActSpace产品概念思路初稿.md",
  "docs/design-docs/core-beliefs.md",
  "docs/design-docs/index.md",
  "docs/design-docs/自进化的方案设计/README.md",
  "docs/design-docs/自进化的方案设计/01-Harness自进化草稿梳理.md",
  "docs/design-docs/自进化的方案设计/02-架构对照与讨论起点.md",
  "docs/design-docs/自进化的方案设计/03-工具自进化第一版骨架.md",
  "docs/design-docs/自进化的方案设计/04-会话内自进化与Actor扩展边界.md",
  "docs/design-docs/自进化的方案设计/05-总体架构与DSH借鉴边界.md",
  "docs/design-docs/自进化的方案设计/10-V1实现与使用说明.md",
  "docs/design-docs/自进化的方案设计/11-V2失败触发说明.md",
  "docs/design-docs/上下文管理引擎设计/README.md",
  "docs/design-docs/上下文管理引擎设计/agent-compaction-prompt.md",
  "docs/design-docs/上下文管理引擎设计/上下文管理引擎V2/README.md",
  "docs/design-docs/上下文管理引擎设计/上下文管理引擎V2/01-增量上下文.md",
  "docs/design-docs/上下文管理引擎设计/上下文管理引擎V2/02-路径卡片.md",
  "docs/design-docs/frontend/front-右侧面板与文件渲染规范.md",
  "docs/design-docs/frontend/front-聊天输入框规范.md",
  "docs/design-docs/frontend/front-文档面板规范.md",
  "docs/exec-plans/active/架构优化-减法.md",
  "packages/official-skills/plugin-dev/SKILL.md",
  "packages/browser-tools/README.md",
];

/** 「本会话改过」绿点在 mock 里的数据来源（真实数据来自会话里的 edit_diff / write_diff 消息块）。 */
export const MOCK_DOCS_EDITED_PATHS: readonly string[] = [
  "docs/design-docs/自进化的方案设计/README.md",
  "docs/design-docs/自进化的方案设计/11-V2失败触发说明.md",
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
    doc = { content: path === "docs/design-docs/自进化的方案设计/README.md" ? README_BODY : genericBody(path), mtimeMs: BASE_MTIME };
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
