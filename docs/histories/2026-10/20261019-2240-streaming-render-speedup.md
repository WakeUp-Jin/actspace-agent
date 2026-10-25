## [2026-10-19 22:40] | Task: 流式输出渲染提速（按帧合并 + Markdown 分块）

### 🤖 Execution Context

- **Agent ID**: `Claude Code 主会话`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI（macOS）`

### 📥 User Query

> 流式输出看起来一个字一个字蹦得很慢，同样的 API 在 DeepSeek Harness 里很快。检查前端渲染，参考 DSH 的做法给出判断和推荐。确认后：做第一期（按帧合并通知、只重渲染正在写的消息）和第二期方案 B（保留 react-markdown，按块拆分 + memo 复用已完成的块），后端 chunk 打包不做。

### 🛠 Changes Overview

**Scope:** `apps/desktop`（renderer）、`packages/client`（live run store）

**Key Actions:**

- **按帧合并通知**：新增 `frame-batch.ts` 共用帧调度器；`createLiveRunStore` 新增 `scheduleNotify` 选项，文本 / 思考 / 工具参数增量下一帧统一通知；Session bridge 新增 `scheduleStreamFlush`，增量 live 事件排队后在一次 `store.batch` 里应用，结构性事件先冲掉队列再立即生效。
- **投影复用**：`useChatSessionRecord` 在只追加了 `assistant/chunk` 时复用上一次的聊天 record（`onlyStreamChunksSince`），历史消息块引用不变。
- **按引用跳过渲染**：`TurnView`（逐条比较消息块引用）、`AssistantReply`、`MarkdownProse` 改为 `memo`；Markdown 的 plugins / components 提成模块常量，工作区链接回调改走 context。
- **Markdown 分块（方案 B）**：新增 `markdown-blocks.ts`，用 `mdast-util-from-markdown` + GFM 扩展按顶层块切分，除最后两块外冻结复用，只重新解析尾部；引用定义 / 脚注退回整块；未闭合的代码围栏不做语言自动识别。desktop 显式依赖 `mdast-util-from-markdown@2.0.3`、`mdast-util-gfm@3.1.0`、`micromark-extension-gfm@3.0.0`（与锁文件已有版本一致）。
- **测试与文档**：新增 `stream-frame-batching.test.ts`、`markdown-blocks.test.tsx`；会话状态规范新增 2.2「流式输出的渲染预算」，Mermaid 设计文档同步 source context 的含义。

### 🧠 Design Intent (Why)

慢在渲染进程：每个 delta 触发三次通知、整个 App 重渲染、整段会话重新投影出新块对象，再把整条回复交给 react-markdown 全量解析并对代码块做语言自动识别，成本随回复长度增长。DSH 用动画帧发布 + 增量 Markdown 解析避开了同一问题。这次把渲染次数压到每帧一次、渲染范围压到正在写的那条回复、解析量压到尾部一两个块；保留 react-markdown，避免更换渲染框架带来的样式和 Mermaid / 链接 / 批注行为回归。jsdom 下模拟 2.3k 字回复每次追加 40 字，单次渲染平均从约 13–15ms 降到约 3ms，且不再随长度增长。

### 📁 Files Modified

- `apps/desktop/src/renderer/session/frame-batch.ts`
- `packages/client/src/live/live-run.ts`
- `apps/desktop/src/renderer/App.tsx`
- `apps/desktop/src/renderer/session/desktop-session-bridge.ts`
- `apps/desktop/src/renderer/session/SessionProjectionContext.tsx`
- `apps/desktop/src/renderer/session/session-store.ts`
- `apps/desktop/src/renderer/components/messages/markdown-blocks.ts`
- `apps/desktop/src/renderer/components/messages/MarkdownProse.tsx`
- `apps/desktop/src/renderer/components/messages/AssistantReply.tsx`
- `apps/desktop/src/renderer/components/conversation/TurnView.tsx`
- `apps/desktop/src/renderer/test/stream-frame-batching.test.ts`
- `apps/desktop/src/renderer/test/markdown-blocks.test.tsx`
- `apps/desktop/package.json`、`pnpm-lock.yaml`
- `docs/design-docs/frontend/front-会话状态与数据流规范.md`
- `docs/design-docs/frontend/front-chat-mermaid-diagrams.md`
