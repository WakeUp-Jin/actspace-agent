# 14 状态层 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261005-desktop-frontend-refactor/14-状态层执行计划.md`
- **执行过程**：`docs/exec-runs/20261005-desktop-fe-14-renderer-state/execution-process.md`
- **现行规范**：`docs/design-docs/frontend/front-会话状态与数据流规范.md`
- **执行模式**：交互，连续执行
- **执行结果**：完成。T0–T21 全部完成，另有两个修复提交：一个处理只读复核的发现，一个修复 Electron 检查中发现的内存回归。界面应当没有可见变化。有三处可感知的行为改变：
  - 会话同步失败和队列刷新失败会显示出来，不再静默；
  - 本地会话的未确认提交在重启后也能恢复；
  - 列表变化不再触发 2N 次 IPC。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 纯函数迁出（T1、T2） | `R/session/live-runs/stream-state.ts`、`stream-blocks.ts`、`R/session/session-title.ts` | 函数体原样搬迁；App.tsx 从 2516 行降到 1967 行 |
| 增量补齐（T3） | `App.tsx` | 每个会话 id 只补齐一次审批和任务快照；Host 重连后补齐它的后台会话；复核后改为只补齐侧栏可见的会话 |
| SessionLocalStore（T4–T6） | `R/session/session-local-store.ts`、`App.tsx` | 8 份按会话的 Map 和镜像 state 合并成一个 store，用 `useSessionLocalState` 选取；版本号改为全局递增 |
| evict（T7、T8） | `App.tsx`、`C/sessions/session.ts` | 归档会话、归档工作区、移除工作区时释放全部 renderer 状态；运行中的会话等 run 结束再释放 |
| cell 作唯一事实源（T9、T10） | `R/session/session-store.ts`、`R/session/session-pages.ts`、`App.tsx` | 删除 `sessionRecord` state 和手工合并；cell 只保留最近 5 个（LRU）；`loadEarlier` 同一时间只发一个请求，过期的页丢弃 |
| identity 字段（T11–T13） | `S/` 的 `MessageBlock` / `SessionEvent`、`C/sessions/` 投影、live 块 | 新增 `runId`、`sourceSeq`，可选、按条件写入 |
| `mergeTranscript`（T14、T15） | `R/session/transcript.ts`、`App.tsx`、批注 | 按 runId 合并 durable 和 live，与旧实现做深度对照；renderer 不再解析 id 字符串 |
| live run 与任务队列（T16） | `R/session/live-runs/live-run-store.ts`、`R/session/task-queue.ts` | 从 App 迁出；terminal runId 改为有界集合（200） |
| live 事件分发器（T17） | `R/api/live-events.ts` | 全局只订阅 `sessionLive` 一次，按消息类型分发 |
| 三个 Context（T18） | `R/app/providers.tsx`、`R/session/*-context.tsx`、`R/components/composer/composer-context.tsx`、`R/test/helpers/workbench.tsx` | 当前会话、输入框、会话操作改为 Context；测试 helper 用键表在增减字段时编译报错 |
| 错误可见（T19） | `SessionProjectionContext`、`desktop-session-bridge.ts`、App | 同步和队列刷新失败显示在会话里；bridge refresh 退避重试 |
| 未确认提交（T20） | `R/session/pending-submission.ts`、App | 本地和远端会话统一存 localStorage，7 天 TTL；激活会话时先核对快照再恢复草稿，永不自动重发 |
| 文档（T21） | 新规范、`02` §7 更正、README、`check-current-docs.mjs` | 现行规范 12 节；02 标注已实施，列 13 条出入 |
| 复核修复 | App 与 3 个测试文件 | 发送进行中不恢复草稿；不覆盖已输入的内容；evict 后迟到的快照丢弃；移除工作区后不再补齐它的会话 |
| 内存修复 | `R/session/session-store.ts`（`useChatSessionRecord`）、`R/hooks/useShallowStable.ts`、App | cell 和 Context value 不再进入 App 的渲染作用域，归档的会话能被释放 |

## T0 基线对比（`session-ipc-budget.test.tsx`）

| 场景 | listPending | tasks.command | getPage | createMessageBlocks |
| --- | --- | --- | --- | --- |
| 100 个会话挂载 | 100 → 100 | 102 → 102 | 1 → 1 | 5 → **3** |
| 重命名 1 个标题（增量） | **100 → 0** | **100 → 0** | 0 → 0 | 0 → 0 |
| 分页多出 15 个会话（增量，T3 新增场景） | — → 15 | — → 15 | — → 0 | — → 0 |
| 打开 2000 条事件的会话（增量） | 1 → 1 | 2 → 2 | 1 → 1 | 5 → **3** |
| 连续加载 10 页早期历史（增量） | 0 → 0 | 0 → 0 | 10 → 10 | 30 → **10** |

App.tsx：2516 → 1565 行。

## 偏差

- **T3**：计划外补了 Host 重连后的补齐。旧的全量刷新顺带覆盖了这条路径，改成增量后要单独处理。
- **T5**：版本号改为全局递增。按会话计数在 evict 之后会从 0 重来，在途的旧响应可能和新请求撞号。
- **T10**：标题改为优先取列表项。新建和分叉会话改为把原始 projection 写进 store。
- **T18**：Context 拆分和 App 行数目标挪到 15。那一部分依赖 `RunTargetContext`。
- **T21**：初稿写「只打控制台的路径都要有注释」，与代码不符：设置、工作区等路径还有约 25 处没有注释。改为如实写明范围。
- **复核和 Electron 检查后的两个修复提交**：计划里没有，记录在执行过程的「复核处理」「Electron 检查与内存修复」两节。
- `dbfab197`「临时切换main分支，任务进行到一半」是你中途为切换分支做的临时提交，内容是复核修复的代码和前 3 个用例。squash 后不单独出现。

## 人工验证指引

### 必须验证

1. **真实模型下的流式输出、切换、重载**
   - 验证方式：
     - 发一条较长的回复，流式输出中切到另一个会话再切回；
     - 再发一条，输出中按 Cmd+R；
     - 让一个回复中带工具调用和审批。
   - 预期结果：
     - 切回后接着显示，不重复；
     - 重载后 run 恢复、停止按钮在，结束后显示完整回复；重载后到 run 结束前看不到实时文本，这是既有行为，见已知问题；
     - 工具卡片和审批与重构前一致。
2. **未确认提交**
   - 验证方式：断开模型或网络后发送，使结果未知，然后重启应用。
   - 预期结果：草稿回到输入框，并提示「上次提交尚未确认，再次发送将核对同一次提交。」；原样再发不会产生重复消息。
3. **归档 / 移除工作区后的内存**
   - 验证方式：连续新建、发送、归档十几个会话，在 DevTools Memory 面板手动 GC 后看 JS 堆。
   - 预期结果：不随次数持续增长。

### 建议验证

- 在长会话中滚到顶部加载更早历史，然后发一条新消息。
- 中文输入法输入时，切换会话再切回，草稿保留。

## Agent 已完成的验证

- typecheck：desktop 0 错误。
- 测试：
  - desktop：文件 158 通过 / 1 失败 / 1 跳过，用例 1162 / 1 / 2。唯一失败是基线中已知的 `workspace-git-context-service`。与 13 结束时相比，多 13 个文件、64 个用例。
  - shared：149 个用例；client：23 个用例。
- 脚本检查：`check:renderer-bridge`（318 个文件）、`check:frontend-tokens`、`check:ipc-channels`（160 个 channel）、`check:current-docs` 通过。
- 变异验证：每个 T 的关键判断都做了变异，全部有用例失败（详见执行过程各 T）。复核修复 4 个、`useShallowStable` 2 个也都被用例拦住。
- Electron（临时数据目录 + 本机 mock 模型，CDP 驱动）：5 项检查全部完成，第 4 项先发现回归，修复后通过。结果见交接文档。
- Sonnet 只读复核：发现 3 个本计划引入的问题，已修复；另有 4 条既有行为记入已知问题。

## 已知风险和遗留事项

- 渲染进程重载后，恢复的 run 丢弃文本和思考增量，run 结束前看不到实时文本。基线代码相同，不是本计划引入。
- 强杀后 30 秒内重启，相关会话在这次运行中一直写不进去：`AgentService` 按设计缓存失败的打开，加上 main 没有 SIGTERM 处理。不在 renderer 范围内，需要你判断是否单独立项。
- 复核列出的既有行为：
  - 同一会话重叠发送共用一条未确认记录；
  - 切回会话时草稿会再次写入输入框；
  - `sessionRecord` 为空时跳过 worktree 校验；
  - 恢复中的 run 可能出现两块 todo。
- 内存问题的根因是 App 太大，闭包共用一个作用域。规范 §8 写了规则（不用带工厂的 `useMemo` 拼 Context value，cell 不放在 App 局部），但没有自动检查。15 拆 App 之后，这类风险会小很多。
- 学习文档：`docs/learnings/2026-10/20261006-closure-scope-retention.md`。

## 后续建议

- 进入 15（`RunTargetContext` 与 App 拆分）。
