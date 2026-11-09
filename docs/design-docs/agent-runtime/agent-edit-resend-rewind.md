# 编辑提问重发（从某一轮重来）与空闲发送不进队列

> 管：在消息流里改一条已发送的提问再发送，会话从这一轮重来；以及空闲会话发送时消息直接出现在消息流里，不经过排队托盘。
> 状态：已实现。执行计划见 [20261107-edit-resend-rewind](../../exec-plans/completed/20261107-edit-resend-rewind.md)。

## 1. 为什么做

- 消息流顶部的提问条点开是「提问」标题 + 全文 + 「跳到这条提问」，用户觉得抽象。用户要的是 Cursor 那样：点提问，原地变成输入框，改完直接发。
- 改完发送的语义是「重来」，不是分叉：五轮对话从第二轮改，第三到五轮消失，模型上下文只剩第一轮和改过的第二轮。
- 新建会话或空闲会话发送时，消息会先在输入框上方的排队托盘里闪一下再出现在消息流里。空闲时没有可排的队，这一下是多余的。

## 2. 结论

| 问题 | 结论 |
|---|---|
| 入口 | 点提问卡片原地变成输入框；吸顶提问条点一下滚回这一轮并直接进入编辑，不再有展开面板 |
| 编辑器 | 正文、附件（可删可加）、模型选择、取消、发送。回车发送，Shift+回车换行，Esc 或点外面取消 |
| 编辑时 | 编辑器以下全部变淡（本轮回复和之后所有轮次），不加任何提示文字 |
| 什么时候能编辑 | 会话空闲：没有运行中的 run、没有排队或已引导的消息、没有进行中的压缩。从父会话复制来的轮次（分叉、侧边对话继承的部分）不能编辑 |
| 发送后 | 被编辑的轮次和之后的轮次立刻从消息流移除，新提问以「发送中」出现在原位置；之后照常开始新的一轮 |
| 后端做法 | 整份旧日志归档到会话的 `recovery/`，日志重写成被编辑轮之前的前缀，释放会话后重新打开，所有投影从新日志推出 |
| 过期检查 | 前端带上它看到的日志位置；那之后又出现了新的轮次就拒绝，让用户先看最新内容 |
| 文件 | 不回滚工作区文件 |
| 被移除的轮次 | 界面上找不回；旧日志留在 `recovery/` 里，只用于排查 |
| 运行中的后台任务、子 Agent | 停掉，不发完成通知 |
| 被移除部分里创建的子 Agent 会话 | 整个目录移进父会话的 `recovery/` |
| 被移除部分里分出的分叉、侧边对话 | 保留为独立会话；父会话 transcript 里不再标它们的分出位置 |
| 会话设置 | 标题、置顶、归档、工作区、权限模式、工作模式保持回退前的值；会话授权（审批时选的「本会话允许」）跟随前缀，被移除部分里加的授权不保留 |
| 空闲发送 | 发送瞬间在消息流末尾显示这条提问，托盘不出现；只有真的排在运行中的 run 后面时才进托盘 |

## 3. 后端：从某一轮重来

### 3.1 入口

不新增 IPC 通道和 Host 方法。`tasks.submit` 的输入多两个可选字段：

```ts
type SubmitTaskInput = {
  // ...原有字段
  /** 从这一轮重来：先回退再接纳这条提问。 */
  readonly rewind?: { readonly runId: string; readonly expectedThroughSeq: number };
  /** 希望这条任务开始时使用的 run id；空闲会话的乐观显示用它对上 live run（§5.2）。 */
  readonly agentRunId?: string;
};
```

- `runId`：被编辑那一轮的 run（durable 用户块上的 `runId`）。
- `expectedThroughSeq`：前端当前看到的日志位置（cell 快照的 `throughJournalSeq`）。
- 提交仍按 `submissionId` 去重：同一个 `submissionId` 已有任务就直接返回它，不再回退。这样回退成功但回执丢失时，重试不会再回退一次。
- 远端 Host 的 `tasks.submit` 同样接受 `rewind`、`runId` 两个参数。

桌面端 `tasks.submit` 先照常准备内容（引用校验、附件导入），准备失败按现有方式拒绝，不动会话；准备好后有 `rewind` 就调 `registry.rewindAndSubmit(...)`，否则调 `submitTask`。

### 3.2 AgentApplication.rewindAndSubmit

`rewindAndSubmit(sessionId, rewind, submissionId, content, agentRunId?) => TaskReceipt`，按顺序：

1. **占住会话**。`AgentService.hold(sessionId)`：被占住的会话不开始新 run（`canStart` 返回 false），可以接纳任务、取消任务。同一会话同时只能有一次回退，`submitTask`、改工作模式等写操作在回退期间返回 `SESSION_BUSY`。
2. **检查空闲**。有运行中 run、有 claimed 任务、队列里有用户任务时返回 `SESSION_BUSY`。队列里只有后台唤醒任务时取消它们。
3. **过期检查**。`flush` 后，`expectedThroughSeq` 之后出现了 `turn/start` 或 `user/message` 就返回 `REWIND_CONFLICT`。后台结算、标题更新这类事件不算冲突。
4. **停掉后台工作**。运行中的子 Agent 用新方法 `SubagentManager.stopAll(rootId)` 停掉：中断并等它结算，结算不写收件箱、不唤醒主 Agent，`delivery` 记 `lost`。运行中的后台 Bash 用 `registry.stop(sessionId, taskId, "rewind")`（已有，结果不通知）。等全部结算完。
5. **算切点**（§3.3），得到前缀、收尾事件和要清理的子会话。
6. **重写日志**（§3.4），拿到重新打开的会话。
7. **清缓存**（§3.5），然后用重新打开的会话句柄追加 `session/rewound`。
8. **接纳新提问**。`runs.service.submit(sessionId, submissionId, content)`，有 `agentRunId` 时登记成这条任务的 run id。然后解除占住，`kick` 让它开始。发 `application/run-preparing`（和 `submitTask` 一样）。
9. 发同进程通知 `application/session-rewound`（`{ sessionId, cutSeq }`）。

任一步失败都解除占住。第 6 步之前失败，会话不变。第 6 步换日志是一次 rename，失败时旧日志原样保留，重新打开旧会话后抛错。

只接受主会话和它的分叉、侧边对话；子 Agent 会话返回 `REWIND_UNAVAILABLE`。临时会话（ephemeral）和不支持重写的存储也返回 `REWIND_UNAVAILABLE`。

### 3.3 切点

纯函数 `resolveRewindCut(events, registry, runId, inheritedThroughSeq)`，放在 `@actspace/agent-service`。

一轮在日志里的顺序是：`task accept` →（标题等辅助请求）→ `run start` → `task claim` → `user/message` → `turn/start` … `turn/end` → `run finish`。

- 找 `run start` 里 `runId` 对应的事件和它的 `taskId`，再找这个任务的 `accept`。找不到，或者这个 run 不是由用户提问开始的（后台唤醒、压缩），返回 `REWIND_TURN_NOT_FOUND`。
- 候选切点依次是 `accept` 的 seq、`run start` 的 seq。取第一个满足下面条件的：前缀（切点之前的事件，不含切点）没有未结束的 turn / step / 请求 / 工具调用，辅助请求成对，按前缀投影的任务账本里没有运行中的 run 和 claimed 任务。任务在上一轮运行时就被接纳的话，`accept` 落在上一轮中间，就退到 `run start`。
- 切点 ≤ `inheritedThroughSeq` 返回 `REWIND_INHERITED`。两个候选都不满足返回 `REWIND_UNAVAILABLE`。
- 和侧边对话的「安静前缀」不同，这里允许前缀里有未读的收件箱消息：它们在原来的时间线里由被编辑的这一轮读取，重来后由新的一轮读取。

收尾事件：前缀末尾还有没结束的东西，按下面规则补齐，写在前缀后面：

| 前缀末尾的状态 | 收尾事件 |
|---|---|
| 待执行任务（被编辑轮的原任务、上一轮运行时排的其他消息） | `task cancel` |
| 已开始未结算的后台任务 | 复制旧日志里它的结算事件；结算时 `delivery` 是 `notified` 的，再复制对应的收件箱入队事件。第 4 步已经把仍在运行的停掉，所以旧日志里一定有结算 |
| 已开始未结算的子 Agent activation | 同上 |
| 会话设置在被移除部分里改过 | 下面每种类型，被移除部分里最后一条原样复制：`session/title-set`、`session/title`、`session/pinned-set`、`session/archived-set`、`session/workspace-set`、`permission/mode-set`、`agent/mode-set` |

`session/rewound`（§3.6）不在收尾事件里：存储重写不经过会话句柄，监听者收不到事件。重新打开会话、清完缓存后，由会话句柄追加这一条，渲染进程、远端 Host、transcript、英语学习都从这条普通的日志事件得知回退。

这样新的一轮能收到切点之后才完成、本该通知的后台结果；被停掉的不通知。会话设置保持回退前的值。会话授权（`permission/grant-*`）不复制，跟随前缀。

复制的事件保留 `type`、`eventVersion`、`source`、`data`、`surface`、`provenance`，seq 和时间重新分配。

要清理的子会话：切点之后的 `subagent/spawned` 里的 `agentId`。切点之前创建、之后又被继续的子 Agent 保留，它的会话里会留着被移除部分里的那次运行。

### 3.4 重写日志

`RuntimeSessionController.rewrite(sessionId, input)`：

1. 会话必须已打开。所有 release gate 的 `canRelease` 都要为 true（Agent 服务没有运行、没有排队），否则 `SESSION_BUSY`。pin 和「有渲染进程在看」不拦：调用方已经停掉后台工作，有人在看的会话正是要回退的会话。
2. 记进 `#closing`，期间别处的 `resume` 等它结束。从 `#open` 移除，gate 释放（丢掉任务账本），`flush`、`close`。
3. 存储重写：`storage.rewritePrefix(sessionId, { keepThroughSeq, closing, label })`。
4. 子会话：已打开的先同样关闭；正被子 Agent 管理器持有的（external）返回 `SESSION_BUSY`。再 `storage.retireInto(childId, sessionId, label)`。这一步失败只报告，不让回退失败：留下的子会话目录没有入口，不影响父会话。
5. 全局摘要索引 `remove` 这个会话和清理掉的子会话（`replace` 拒绝更小的 seq，所以要先删）；`#models`、`#changes`、投影缓存里的这几项删掉。
6. 发 `session/disposed`，再 `resume`（会发 `session/created`，侧边对话提示、transcript 照常挂上）。返回新的会话句柄。

JSONL 存储的两个新方法（`SessionStorage` 上可选，内存测试存储也实现）：

- `rewritePrefix`：拿写入租约（别人持有写入者时失败）；读出并校验整份日志；把旧文件复制到 `recovery/rewind-<时间>.journal.jsonl` 并 fsync；用 `SessionJournal` 以前缀为种子追加收尾事件（分配 seq、时间并校验）；写临时文件、fsync、rename 覆盖、fsync 目录。和现有的断尾修复（`repair.ts`）同一套步骤。返回归档文件的相对路径。
- `retireInto`：拿子会话的写入租约，把整个目录 rename 到 `<父会话>/recovery/rewind-<时间>/sessions/<子会话 id>`。

### 3.5 回退后要清掉的缓存

日志的 seq 变小了。下面这些地方按「seq 只增不减」缓存，要显式清掉：

| 位置 | 处理 |
|---|---|
| 全局会话摘要索引 | §3.4 第 5 步 |
| 上下文实例（`context.engine` 的 instances，按 `main:<sessionId>` 和 `main` 两个 scope） | `evict`。不清的话，新请求的上下文 seq 比缓存小，会继续用旧的对话 |
| `ManagedRuns` 的任务状态 | `runs.initialize(sessionId)` |
| 后台任务登记表 | 新方法 `forget(sessionId, taskIds)` 删掉切点之后开始的任务；切点之前开始的保留（它们的状态已是停止或完成，`task_output` 还能查） |
| 子 Agent 管理器 | 不用清：停掉后 activation 已移除，子 Agent 树从日志推出 |
| transcript | 收到 `session/rewound` 事件后重写这个会话的 transcript（§3.6） |
| 英语学习 | 收到所绑定会话的 `session/rewound` 事件后，用新句柄重新绑定，水位线取新日志末尾 |
| 冷缓存（JournalCache）、用量统计 | 不用处理：它们按文件身份和大小发现日志被替换，整份重读；被移走的子会话按「会话不存在」处理 |

### 3.6 `session/rewound` 事件

新的持久化扩展事件（加进 `PERSISTED_EXTENSION_EVENT_TYPES`，校验字段），`surface: null`，重新打开后由会话句柄追加：

```ts
{ cutSeq: number; droppedThroughSeq: number; runId: string; archive: string; rewoundAt: string }
```

- `cutSeq`：第一条被移除事件原来的 seq，也是新日志里这条之后事件开始的位置附近；`droppedThroughSeq`：回退前最后一条事件的 seq；`archive`：归档文件相对会话目录的路径。
- 用途一：客户端收到这个类型的日志更新就整体重载会话（§5.4），桌面本机、远端 Host、Web 都靠它，不需要额外的通知通道。
- 用途二：transcript 的分出标记。分叉、侧边对话的分出位置 `boundarySeq ≥ cutSeq`、且创建时间早于 `rewoundAt` 的，不再在父会话 transcript 里标出（它们分出的那段已被移除，seq 也被新内容复用了）。`TranscriptBranch` 多记一个 `createdAt`。

### 3.7 错误

| 代码 | 什么时候 | 前端提示 |
|---|---|---|
| `SESSION_BUSY` | 有运行、有排队，或者正在回退 | 正在运行或有排队消息，结束后再编辑。 |
| `REWIND_CONFLICT` | 前端看到的位置之后又有了新的一轮 | 这段对话有了新内容，看过最新内容后再编辑。 |
| `REWIND_TURN_NOT_FOUND` / `REWIND_INHERITED` / `REWIND_UNAVAILABLE` | 见上 | 这条提问不能再编辑。 |

桌面端把它们转成 `TaskSubmissionResult` 的 `submission-failed` / `rejected`，带上面的提示文案。远端 Host 用 `HostError("CONFLICT" | "BUSY" | ...)`，桌面远端适配器转成同样的结果。

## 4. 附件重发

编辑器里的原附件已经存在这个会话的 artifacts 里，重发时不依赖原来的本机路径（截图粘贴的临时文件可能已经没了）。

- `ComposerAttachment` 多一个可选字段 `artifactId`：本机会话里已存在的附件。远端会话沿用已有的 `remoteArtifact`。
- 桌面 `toRunContent` 遇到有 `artifactId`、没有 `path` 的附件，先 `resolveArtifact` 拿到它在 artifacts 里的文件路径，再走原来的导入流程。Agent 模式下文件附件仍是 `Attached file: 名称 (artifactId)` 文本，Chat 模式仍带文本内容。
- 编辑器的初始内容从任务快照里这一轮的任务取：`original.userInput` 是正文，`original.fileReferences`、`original.responseAnnotations` 原样保留；附件从 `prepared` 里解析——artifact 块（图片和 Chat 模式的文件）和 `Attached file: 名称 (id)` 文本行，得到 `artifactId`、名称、类型。远端会话用已有的 `taskAttachments`。
- 找不到任务（很旧的会话）时，退回用 durable 用户块的正文和附件。

## 5. 前端

### 5.1 原地编辑器

新组件 `conversation/TurnPromptEditor.tsx`，样式照 demo 的 A1：

- 外框用 Composer 的聚焦边框、`rounded-act-xl`、柔和阴影；正文 textarea 自动长高，最高 240px 后内部滚动。
- 下方一行：`+` 添加附件（系统文件选择，和 Composer 一样的格式与大小限制）、模型选择（和 Composer 共用这个会话的模型设置）、空白、`取消`（ghost）、圆形发送按钮。附件以小卡片列在正文下面，每个带删除。
- 原提问里的文件引用、回复批注照原样带上，显示在正文上方（和发送后的提问卡片一样），可以删，编辑器里不新增 `@` 引用。
- 回车发送（输入法组字时不发）；Shift+回车换行；Esc 取消；在编辑器外按下鼠标取消，编辑器打开的弹层（模型菜单）里的点击不算外部。
- 没有正文也没有附件时发送按钮禁用；内容没改也能发（就是重新回答）。
- 会话变忙（比如从下面的 Composer 发了消息）时自动取消编辑。

`TurnPrompt` 的卡片可编辑时 hover 边框加深、光标是文本光标；点击进入编辑。正在选中文字时点击不进入编辑。不可编辑时（会话忙、继承的轮次、后台唤醒轮）卡片和现在一样，不响应点击。

### 5.2 变淡与发送

- 编辑时，编辑器所在轮的正文、轮尾，以及之后所有轮次加一个变淡类：`opacity 0.3`、降低饱和度、不响应鼠标。只用 token 和已有工具类，不写死颜色。
- 发送：
  1. 被编辑轮和之后的轮次用 0.24s 淡出后从消息流移除（会话本地状态 `rewinding = { fromRunId }`，消息流按它过滤）。
  2. 生成新的 run id，立刻在 `LiveRunStore` 里挂一个乐观 run：用户块就是编辑后的内容，`waitingForModel = true`。界面上它出现在原位置，显示「发送中」。
  3. 调 `tasks.submit`，带 `rewind` 和 `agentRunId`。
  4. 成功：会话整体重载（§5.4），重载完清掉 `rewinding`。Host 用这个 run id 开始 run，`agent_run_started` 对上同一个 run，用户块原地继续，不重挂。
  5. 失败：卸下乐观 run，清掉 `rewinding`，这一轮重新进入编辑，编辑器里是刚才的内容，下方 Composer 的提示行显示 §3.7 的文案。

### 5.3 吸顶提问条

`PinnedTurnPrompt` 去掉展开面板（全文、任务清单、「跳到这条提问」都去掉）。一行：提问摘要（截断）+ 任务进度胶囊（有 Todo 时）。

- 点击：平滑滚到这一轮（卡片顶部留 8px），可编辑就直接进入编辑，不可编辑只滚动。
- 编辑时不显示提问条。

### 5.4 回退后的整体重载

`ClientSessionStore` 只接受更大的 seq，回退后要显式重置：

- 新方法 `ClientSessionStore.reset(sessionId)`：`requestGeneration + 1`（丢弃进行中的旧读取），记一个「下次整体替换」标记。标记在时：这个会话的日志增量更新直接丢掉；下一次 `applyEnvelope` 不和旧窗口、旧消息合并，整体替换快照、窗口、投影值，然后清掉标记。旧内容在新内容到达前继续显示，不闪加载态。
- `DesktopSessionBridge`：收到类型为 `session/rewound` 的日志更新，先 `reset` 再刷新；新方法 `reset(sessionId)` 供发起回退的窗口在提交成功后直接调用。
- App：收到 `session/rewound` 后，`TaskQueueStore.evict(sessionId)`（任务快照的 revision 也变小了）并重新取任务快照；本地状态里清掉 `messageQueue`、`compactionFailure`、`bashUpdates`。
- 远端会话：桌面远端适配器把 Host 的日志更新照常转成 live 日志更新，类型判断在 bridge 里，不另加通道。
- Web 客户端：`SessionObserver` 收到 `session/rewound` 的投影更新，同样 `reset` 再刷新，并重新取任务快照、卸下 live run。Web 端本次不提供编辑入口。

### 5.5 空闲发送不进队列

问题在于：发送后先刷新任务快照，此时任务还是待执行，托盘把它当排队消息显示；直到 run 开始才出现在消息流里。

- 发送时会话空闲（没有 live run、队列为空、没暂停）：生成 run id，和 §5.2 一样立刻挂乐观 run，用户块显示在消息流末尾；提交时带 `agentRunId`。Host 空闲时立刻开始这条任务并用这个 id。
- 托盘投影 `projectTaskQueue` 跳过「正在开始」的任务：当前 live run 是乐观 run，且它的 run id 是为这条任务申请的（`TaskQueueStore` 记 `submissionId → runId`）。
- 提交失败：卸下乐观 run，草稿照原样恢复到输入框。
- 别的 run 抢先开始（比如后台唤醒）：live run 换成那个 run，乐观 run 不再是当前 run，这条任务就按排队显示在托盘里。这时它确实在排队。
- Host 没用申请的 run id（老版本远端 Host）：`agent_run_started` 的 id 对不上，按现有逻辑换成新 run，再从任务快照补用户块。功能正常，只是这一下会重挂。
- 乐观阶段点停止：run 还没开始，改为取消这条待执行任务。
- Web 客户端的托盘同样跳过空闲时队首那条正在开始的任务。

Host 端：`ManagedRuns` 现有的 `#requestedRunIds` 改为由 `submitTask` 也能登记，任务开始时取用并删除；任务被取消时删除。

## 6. 不做

- 不回滚工作区文件，不提示「文件不会回滚」。
- 不提供找回被移除轮次的界面。
- Web 客户端不提供编辑入口（只处理回退后的重载和托盘）。
- 不清理被移除轮次留下的 artifacts（归档日志还引用它们）。
- 子 Agent 的会话、后台唤醒轮、压缩分隔线不能编辑。

## 7. 验证

- 单元：`resolveRewindCut`（在 accept 切、退到 run start、继承轮拒绝、找不到、收尾事件复制结算和收件箱、待执行任务取消）；JSONL `rewritePrefix` / `retireInto`（归档内容、租约冲突、rename 原子性）；`ClientSessionStore.reset`；`projectTaskQueue` 跳过正在开始的任务。
- 运行时集成：五轮会话从第二轮重来后，日志只有第一轮 + 新的第二轮；新请求的上下文里没有第三到五轮；运行中的后台 Bash 和子 Agent 被停掉且没有通知；被移除部分的子会话目录在 `recovery/` 下；`REWIND_CONFLICT`、`SESSION_BUSY` 各一例；回退后标题、权限模式不变。
- Host：`tasks.submit` 带 `rewind` 的参数校验和错误映射。
- Renderer：点卡片进入编辑、Esc / 点外面取消、忙时不可编辑、变淡范围、回车发送后被编辑轮及之后移除且新提问在原位置、失败恢复编辑；吸顶条点击滚动并编辑；空闲发送托盘不出现、排队时托盘出现。
- 检查：desktop typecheck / test、`check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge`、`check:ipc-channels`、`check:hot-path-reads`、`check:current-docs`。
- Electron 实机：本机会话从中间轮重来、带附件重来、有运行中后台任务时重来；新建会话发送不闪托盘；运行中发送进托盘。
