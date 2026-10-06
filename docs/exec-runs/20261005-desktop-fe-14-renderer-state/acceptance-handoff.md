# 14 状态层验收交接

- 主线提交：`refactor/desktop-frontend` @ `07e0f2b8`
- 子分支：`refactor/desktop-fe-14`（`c83c3d4f` 起：T0–T21 按计划拆分的提交、你中途做的临时提交 `dbfab197`、两个修复提交、一个收尾提交）
- 状态：**可以交给验收**
- 启动方式：
  - 先运行 `pnpm install`（如有需要）和 `pnpm --filter @actspace/shared build`，再运行 `pnpm --filter @actspace/desktop build`。
  - Electron：在 `apps/desktop` 下运行 `ACTSPACE_DATA_DIR=$(mktemp -d) node_modules/electron/dist/Electron.app/Contents/MacOS/Electron dist-electron/main/index.js`。验证真实模型时可以改用已有数据目录。

## 阶段：14 全部（T0–T21，单阶段）

### 用户能感知到的变化

- **大部分没有可见变化。** 状态的存放位置、合并规则、订阅方式都变了，界面和交互应与重构前一致。
- **会话同步失败会显示出来**：以前读页、刷新队列失败只打控制台；现在会话里显示错误，bridge 自动退避重试。
- **本地会话的未确认提交，重启后也能恢复**：以前本地会话存 sessionStorage，重启即丢；现在与远端会话一样存 localStorage。恢复前先核对 Runtime 的任务快照，已收到的不恢复；恢复时提示「上次提交尚未确认，再次发送将核对同一次提交。」，永不自动重发。
- **侧栏会话多时更省**：改标题、run 结束不再触发对全部会话的审批和队列刷新（100 个会话时从 200 次 IPC 降到 0）。
- **归档、移除工作区后释放内存**：被归档会话的本地状态、live run、队列、cell 都会释放。

### 我已完成的验证

| 项 | 方式 | 结果 | 证据 |
| --- | --- | --- | --- |
| typecheck | `pnpm --filter @actspace/desktop typecheck` | 通过 | — |
| test | desktop vitest、shared、client | desktop 文件 158 通过 / 1 失败 / 1 跳过，用例 1162 / 1 / 2，唯一失败是基线中已知的 `workspace-git-context-service`；比 13 结束时多 13 个文件、64 个用例。shared 149、client 23 通过 | `execution-process.md` 各 T「结果」 |
| 脚本检查 | `check:renderer-bridge`、`check:frontend-tokens`、`check:ipc-channels`、`check:current-docs` | 通过 | — |
| IPC 与投影次数 | `session-ipc-budget.test.tsx`，与 T0 对比 | 改标题 100 + 100 → 0 + 0；加载 10 页早期历史时 `createMessageBlocks` 30 → 10；挂载和打开长会话 5 → 3 | `execution-summary.md`「T0 基线对比」 |
| 用例确实能拦住错误 | 变异验证 | 每个 T 的关键判断、复核修复 4 个、`useShallowStable` 2 个，全部有用例失败 | `execution-process.md` |
| Electron ①：流式中切换会话再切回 | 临时数据目录 + 本机 mock 模型（慢速流式），CDP | 通过：后台流继续；切回时显示到「片段25」；结束后完整，无重复 | `screenshots/check1-back-to-a-streaming.png`、`check1-a-finished.png` |
| Electron ②：流式中重载渲染进程 | 同上，`Page.reload` | 通过：run 恢复，停止按钮在，用户消息不重复，结束后完整回复出现。重载后到 run 结束前看不到实时文本，属既有行为（见已知问题） | `check2-after-reload.png`、`check2-finished.png` |
| Electron ③：加载更早历史后收到新消息 | 填到 47 轮（约 2400 条事件，超过一页），重载后打开 | 通过：先显示最近 20 轮，滚到顶部依次加载到 40、46 轮，无重复；再发一条新消息，追加为第 47 轮 | `check3-earlier-loaded.png`、`check3-new-after-earlier.png` |
| Electron ④：归档 20 个会话后内存 | 循环「新建 → 发送 → 切回 → 归档」，每 5 轮强制 GC 后读 JS 堆 | **先不通过，修复后通过**。修复前每轮约 +1.9 MB，不收敛（20 轮 23 → 60 MB）；基线 `d86be81f` 为 10.5 → 19.2 MB；修复后 30 轮里第 10 轮起稳定在 15.0–15.1 MB | `execution-process.md`「Electron 检查与内存修复」 |
| Electron ⑤：提交后立刻强杀，重启 | 输入后回车，紧接 `pkill -9`；等 30 秒以上再启动 | 通过：这次 Runtime 已收到，重启后消息只显示一次，输入框为空，没有残留记录。另在 localStorage 写入一条 Runtime 没见过的记录（模拟 main 收到之前就崩溃），重启后草稿和提示回到输入框，没有重发 | `check5-after-kill.png`、`check5-restored-draft.png` |
| 范围复核 | Sonnet 只读子智能体 | 3 个本计划引入的问题已修复，4 条既有行为记入已知问题 | `execution-process.md`「复核处理」 |

### 请验收方执行

| # | 步骤 | 预期 | 为什么我做不了 |
| --- | --- | --- | --- |
| A1 | 连上真实模型，发一条较长的回复；输出中切到另一个会话再切回；再发一条，输出中按 Cmd+R | 切回后接着显示，不重复；重载后 run 恢复，结束后显示完整回复 | 我用的是本机 mock 模型，真实模型的工具调用、思考块没有覆盖 |
| A2 | 发一条会触发工具调用和审批的消息，审批卡片出现时切走再切回，再点「运行」 | 审批徽标、卡片、工具日志与重构前一致；侧栏的待审批标记随之消失 | 需要真实模型产生工具调用 |
| A3 | 断开网络或停掉模型服务后发送，使结果未知；重启应用，打开该会话；原样再发一次 | 草稿和提示「上次提交尚未确认…」回到输入框；再发不会出现两条相同的用户消息 | 我只能用写入 localStorage 的方式模拟「结果未知」，真实的 IPC 失败路径没有走到 |
| A4 | 中文输入法输入一半时切到别的会话再切回；输入框有内容时打开一个有未确认提交的会话 | 草稿保留；已输入的内容不会被恢复的草稿覆盖 | 需要真实 IME |
| A5 | 连续新建、发送、归档十几个会话，在 DevTools → Memory 手动 GC，看 JS 堆 | 不随次数持续增长 | 我已经用 CDP 测过；这里请在真实数据目录、真实模型下复看 |
| A6 | 侧栏移除一个工作区，再随意触发一次列表刷新（改个标题） | 被移除工作区的会话不再出现，也不会在后台重新拉取它们的审批 / 队列 | 已有单测；请在真实界面上确认没有残留的徽标 |
| A7 | 连接一台远端 Host，在 Host 会话里发送；断开再重连 | 重连后后台会话的审批 / 队列徽标恢复正确 | 没有真实 Host |

### 回归冒烟（每份计划都要做）

- 新建会话并发送一条消息，流式输出正常结束
- 切换会话；打开设置任意两页；打开终端；打开 Review
- 本计划额外：
  - 置顶、重命名、归档、分叉会话；归档整个工作区；
  - 消息队列：运行中再发两条，排队、上移、插入（steer）、撤回、编辑；
  - 上下文压缩：触发一次压缩，压缩中「插入」被禁用，完成后自动发送；
  - 在回复上加批注。

### 已知问题与未覆盖

- 测试中唯一的失败是基线中已知的那一个，与本计划无关。
- **重载后恢复的 run 看不到实时文本**：渲染进程重载后，恢复的 run 丢弃 `assistant_text_delta` / `assistant_thinking_delta`，run 结束后才显示完整回复。基线代码相同，不是本计划引入。
- **强杀后 30 秒内重启，会话写不进去**（需要你判断是否单独处理）：
  - 被杀进程的写锁心跳不到 30 秒时，启动补齐的第一次 `tasks.command` 得到 `SESSION_WRITER_LOCKED`，这一刻是对的。但 `AgentService.#manager`（`packages/agent-service/src/service.ts:107-121`）按设计缓存失败的打开，之后这个会话的快照和发送一直报同一个错，直到再次重启。
  - main 没有 SIGTERM 处理，`before-quit` 在 SIGTERM / 强杀时不触发，锁留在磁盘上。界面上能看到错误（T19），草稿留在输入框。
  - 不在 renderer 范围内，涉及 agent-service 的恢复语义，本计划没有动。
- 复核列出的既有行为，本计划没有改：
  - 同一会话重叠发送共用一条未确认记录；
  - 切回会话时草稿会再次写入输入框；
  - `sessionRecord` 为空时跳过 worktree 校验；
  - 恢复中的 run 如果 durable 和 live 都有 todo，会出现两块。
- 强杀后被打断的那一轮不会自动续上（没有回复、也不在运行）。这是 Runtime 的恢复行为，renderer 只负责不重复、不丢草稿。
- 内存问题的规则（不用带工厂的 `useMemo` 拼 Context value，cell 不放在 App 局部）写在规范 §8，没有自动检查。
- `execution-process.md` 里的路径用了 `R/`、`C/`、`S/` 缩写，含义见计划文档开头。

## 验收反馈记录

| 轮次 | 日期 | 项 | 结果 | 现象 | 处理（提交） |
| --- | --- | --- | --- | --- | --- |
