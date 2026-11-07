## [2026-11-07 16:00] | Task: 流式 Markdown 尾部解析降频与解析器常驻

### 🤖 Execution Context

- **Agent ID**: `main`
- **Base Model**: `Claude Opus 5.5`
- **Runtime**: `Claude Code`（主仓库目录，分支 `fix/bug-batch-1104`）

### 📥 User Query

> 我觉得这两个都可以按照你的建议来做 开始吧。

### 🛠 Changes Overview

**Scope:** `packages/util/shared`、`apps/desktop`（渲染进程聊天区 Markdown）、`docs/`

**Key Actions:**

- **`hasVisibleText`：** 改用非全局正则 `test`，不再整串 `replace`。
- **处理器常驻：**
  - 新增 `markdown/processor.ts`：按管线对象缓存已冻结的 unified 处理器，`renderMarkdown` 替代 `<Markdown>`；
  - `splitMarkdownBlocks` 的 gfm 扩展提到模块级；
  - desktop 直接声明 unified、remark-parse、remark-rehype、hast-util-to-jsx-runtime、html-url-attributes、vfile。
- **尾部降频：** `MarkdownProse` 维护已解析的文字，最多每 100ms 推进一次。以下情况立即推进：
  - 新的一行；
  - 平滑输出追平网络；
  - 回复写完；
  - 内容不是追加。
  结尾还没定类型的行（只有块标记）先不放出。
- **原样尾巴：**
  - `rehypeStreamTail` 只放 `act-stream-tail`、`act-fade` 两种占位元素；
  - 新增 `markdown/StreamTail.tsx`，按 `StreamTailContext` 渲染尾巴文字、渐显和光标；
  - 没闭合的代码块里，尾巴接在代码区最后一行。
- **测试：**
  - 新增 `chat-markdown-throttle.test.tsx`，用假时钟逐帧回放，覆盖等价、降频、尾巴、代码块和处理器常驻；
  - fixture `test/fixtures/markdown-stream-real-reply.md` 是 run7 最长回复；
  - 改写 `chat-markdown-stream.test.tsx` 的尾部单测；
  - `render-count` / `lazy` 测试改为数 `renderMarkdown`。

### 🧠 Design Intent (Why)

run7 渲染进程里，聊天区 Markdown 每帧把最后一块解析两遍（切块一遍、渲染一遍），分配约 625 MB；`<Markdown>` 每次渲染还要重建处理器。

参考 kimi-cli 的限频、codex 的按行解析，以及四家都在用的常驻解析器：
- 尾部降到最多每 100ms 解析一次；
- 两次解析之间新放出的字原样显示，保证逐帧可见；
- 回复写完时完整解析一次，所以最终显示与直接渲染一致。

渐显和光标改由组件生成，是为了两次解析之间不重跑 rehype。

### 📁 Files Modified

- `packages/util/shared/src/visible-text.ts` 及其测试
- `apps/desktop/package.json`、`pnpm-lock.yaml`
- `apps/desktop/src/renderer/components/messages/`：
  - `MarkdownProse.tsx`、`markdown-blocks.ts`
  - `markdown/` 下：
    - `processor.ts`（新增）、`StreamTail.tsx`（新增）
    - `rehype-stream-tail.ts`、`MarkdownBlocks.tsx`、`pipeline.ts`、`components-map.tsx`
- `apps/desktop/src/renderer/test/`：
  - `chat-markdown-throttle.test.tsx`（新增）、`fixtures/markdown-stream-real-reply.md`（新增）
  - `chat-markdown-stream.test.tsx`、`chat-markdown-render-count.test.tsx`、`chat-markdown-lazy.test.tsx`
- `docs/design-docs/frontend/`：
  - `front-流式Markdown解析降频规范.md`（新增）
  - `front-聊天区Markdown渲染规范.md`、`README.md`
- `docs/exec-plans/active/20261107-markdown-stream-throttle.md`（新增）、`docs/exec-plans/README.md`
