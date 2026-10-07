## 2026-10-06 05:55 | Task: Desktop 前端重构 14：状态层

### 执行上下文

- Agent：Claude Code 主智能体；只读复核子智能体用 Sonnet 5.5。
- Base Model：Claude Opus 5.5。
- Runtime：Claude Code CLI，本机仓库；分支 `refactor/desktop-fe-14`。
- 状态：完成，已交给验收。
- Runtime 补充：子分支 `refactor/desktop-fe-14`，squash 回 `refactor/desktop-frontend`。Electron 检查用临时数据目录、本机 mock 模型（OpenAI 兼容慢速流式）和 CDP。

### 用户诉求

> 按 00 总执行计划连续执行 Desktop 前端重构；第五份是 14：会话正文只有一个事实源（durable 来自 `ClientSessionStore`，live 来自 `live-run-store`，由纯函数 `transcript.ts` 合并），去重改用类型化的 `runId` / `sourceSeq`，按会话的本地状态集中到 `SessionLocalStore` 并在归档时释放，修复会话列表变化触发 2N 次 IPC 和几处吞错，本地与远端会话的未确认提交走同一套规则。

### 主要改动

- **纯函数迁出**：流式块生成和状态 helper 移到 `renderer/session/live-runs/`，`getSessionTitle` 移到 `session/session-title.ts`。
- **增量补齐**：每个会话 id 只补齐一次审批和任务快照；Host 重连后补齐它的后台会话；只补齐侧栏可见的会话。改标题时的 IPC 从 100 + 100 次降到 0。
- **SessionLocalStore**：草稿、composer 状态、压缩失败、bash 更新、发送参数、审批 / 失败标记、消息队列、页 / 审批版本号合并到一个 store，`useSessionLocalState` 选取；版本号改为全局递增。
- **evict**：归档会话、归档工作区、移除工作区时释放全部 renderer 状态，运行中的会话等 run 结束；evict 计数让迟到的快照作废。
- **cell 作唯一事实源**：删除 `sessionRecord` state 和手工合并；cell 只保留最近 5 个；`loadEarlier` 同一时间只发一个请求，过期的页丢弃。每加载一页早期历史，投影从 3 次降到 1 次。
- **identity**：`MessageBlock` / `SessionEvent` 新增 `runId`、`sourceSeq`；client 投影写入 `sourceSeq`，live 块写入 `runId`。
- **`mergeTranscript`**：按 runId 合并 durable 和 live，与旧实现做深度对照；renderer 不再解析 id 字符串，批注按 `sourceSeq` 判断。
- **live run 与任务队列**：`live-run-store`、`task-queue` 迁出 App；terminal runId 改为有界集合。
- **live 事件**：全局只订阅 `sessionLive` 一次的分发器。
- **Context**：当前会话、输入框、会话操作三个 Context，测试 helper 用键表跟随字段增减。
- **错误可见**：同步和队列刷新失败显示在会话里，bridge refresh 退避重试。
- **未确认提交**：本地和远端统一存 localStorage，7 天 TTL；激活会话时核对快照后恢复草稿；发送进行中或已有输入时不恢复；永不自动重发。
- **内存**：cell 投影移入 `useChatSessionRecord`，Context value 改用 `useShallowStable`，使已归档会话不再被 App 的旧渲染作用域留住。Electron 实测：修复前每次归档后约 +1.9 MB 不收敛，修复后稳定在 15 MB。
- **文档**：新增 `docs/design-docs/frontend/front-会话状态与数据流规范.md`；`02` 标注已实施并列出 13 条出入。

### 设计动机

App.tsx 同时承担流式块生成、页缓存、去重、按会话状态和提交恢复，事实源有多个写入者，去重靠解析字符串 id，按会话的 Map 从不清理。

### 学习沉淀

- [同一个函数里的闭包共用一个作用域：大组件为什么会留住旧数据](../../learnings/2026-10/20261006-closure-scope-retention.md)：store 已正确 evict，但 App 的 `useCallback` 链留住了旧渲染的作用域；定位方法是按字符串内容做堆快照差，再求最短持有路径。

### 文件

- `packages/shared/src/`（`MessageBlock` / `SessionEvent` 的 identity 字段）、`packages/client/src/sessions/`（`evict`、`sourceSeq` 投影）
- `apps/desktop/src/renderer/App.tsx`、`session/`（local store、live runs、task queue、transcript、pending submission、session store、三个 Context）、`api/live-events.ts`、`hooks/useShallowStable.ts`、`app/providers.tsx`、`components/composer/`、`ConversationView` 与批注相关组件
- `apps/desktop/src/renderer/test/` 新增 15 个测试文件，`test/helpers/workbench.tsx`
- `scripts/check-current-docs.mjs`
- `docs/design-docs/frontend/`、`docs/desktop-frontend-refactor/02-Renderer状态层与会话数据流.md`、`docs/exec-runs/20261005-desktop-fe-14-renderer-state/`
