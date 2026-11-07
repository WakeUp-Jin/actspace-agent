## [2026-11-05 23:00] | Task: 流式输出只走实时通道（assistant/chunk 不再持久化）

### 🤖 Execution Context

- **Agent ID**: `main`
- **Base Model**: `Claude Opus 5.5`
- **Runtime**: `Claude Code`（主仓库目录，分支 `fix/bug-batch-1104`）

### 📥 User Query

> 主进程内存问题要彻底改好：按建议的决策 1–8 执行，先补设计规范，再写计划，最后执行。

### 🛠 Changes Overview

**Scope:** `packages/core/agent-loop`、`packages/session/*`、`packages/core/runtime`、`packages/host/agent-host`、`packages/client/client`、`packages/util/shared`、`apps/desktop`、`apps/web`、`docs/design-docs`

**Key Actions:**

- **chunk 不进日志**：Agent Loop 只走实时通道，`assistant/message` 记录 `firstTokenAt`；计时读取方优先读它，旧会话从 chunk 补算。
- **每事件开销**：`requestContext` 对无关事件返回原状态；投影注册表深冻结共享，不再深拷贝；关系校验只在 codec 声明 `readsHistory` 时读历史；删除无调用方的实时事件缓冲。
- **实时底稿**：`LiveOutputBuffer`（shared）保存未定稿的正文与思考，全局 revision；桌面 `sessions.liveOutput`、远程 `sessions.output { afterRevision }`；恢复运行先缓存增量，拿到底稿后按 revision 截断。
- **子 Agent 面板、轨迹**：读子会话底稿与实时运行；轨迹按未结算请求生成占位，流式层按 requestId 填字。
- **删除 chunk 专用路径**：`live-envelope-batcher`、bridge chunk 排队、`onlyStreamChunksSince`、`includePendingChunks`、轨迹 chunk 拆分与累加器。

### 🧠 Design Intent (Why)

2026-11-05 的全程记录显示，主进程 58% 的分配来自每个 chunk 触发的投影深拷贝，17% 来自每次写入读整段历史做关系校验，跑完后常驻的 307 MB 来自没人读的实时事件缓冲。根因是每个 token 片段都写成持久事件，后面每一层都按 token 数放大。参照 DeepSeek harness，让流式片段只走实时通道，日志只留定稿消息；界面需要补回未定稿文字时读主进程的实时底稿，用 revision 保证不重复、不缺字。

### 📁 Files Modified

- 规范与计划：`docs/design-docs/agent-plugin-runtime/agent-spec-live-assistant-stream.md`（新增）、`docs/exec-plans/active/20261105-live-assistant-stream.md`（新增）、`docs/exec-runs/20261105-live-assistant-stream/`（新增）
- 前端规范：`front-会话状态与数据流规范.md`、`front-轨迹视图规范.md`、`front-聊天输入框规范.md`、`front-web-pwa客户端规范.md`、`docs/tools/session-viewer/README.md`
- 代码与测试：完整清单见执行过程 `execution-process.md`
