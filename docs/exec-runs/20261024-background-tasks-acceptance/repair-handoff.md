# 后台任务验收：缺陷排查与修复交接

日期：2026-10-24。验收基线：`40320e0b38f3f18b36e1a0905b979b7733a4cba4`，功能提交 `ce19e4d6`。

本轮只验收与排查；产品代码、测试代码均未修改。以下是供后续模型实施的建议，不表示修复已经完成，也没有执行修复后的红绿测试。

## BGT-001 · P2 · 后台 Bash 流式卡片提前显示 Ran

### 问题与复现

真实 Electron 中请求 `bash(command="echo START; sleep 35; echo DONE", blockMs=0)`，让父 Agent 在工具返回后继续输出一段足够长的文本。启动器立即返回后台任务 ID，此时进程仍在 sleep。

- 父回合流式输出期间，Bash 卡片显示 `Ran` 和「后台」。
- 同一父回合结束后，同一卡片恢复为 `Running`。
- 实际任务结束后，持久状态与通知分别正确显示成功或失败。

预期：后台任务未 settle 时始终显示 `Running`，实际完成后才显示 `Ran` / `Failed`，停止或失联按既有取消映射展示。运行中的错误文案会误导用户判断是否还需等待；本轮没有发现它提前停止进程或阻断完成通知。

完整时间线、任务 ID、截图和源码链路见 [缺陷记录](bugs.md)。关键截图：本地证据目录中的 `g2-bash-running.png`、`g4-bash-live-start.png`、`g4-bash-durable-running.png`。

### 已确认根因

`packages/client/src/live/stream-blocks.ts` 的 `getStreamingBashStatus()` 将“启动工具已返回”当成“后台任务已结束”，覆盖了 preview 中正确的 `running`。

链路如下：

1. `packages/client/src/sessions/tool-card.ts:58` 检测 `backgroundTaskId`，没有 settle 时生成 `status=running`，符合设计。
2. `packages/client/src/live/stream-adapter.ts:148` 为后台启动工具的即时成功结果生成该 preview，发出 `tool_finished`。这是启动器调用的完成，语义正确，不应将工具永远留在未完成状态。
3. `packages/client/src/live/live-run.ts:252` 消费 `tool_finished`，存下 preview 并设置 `finished=true, isError=false`。
4. `packages/client/src/live/stream-blocks.ts:95` 调用 `getStreamingBashStatus(tool, preview.status)`；该函数第 17 行只保留 denied/expired/cancelled，第 21 行将 finished 且非 error 映射为 success，丢掉 preview 的 running。
5. `BashRunBlock` 按 success 展示 `Ran`。父回合结束后转用 Journal 持久投影，后者从 `background/task` 事实读到 running，因此文案又恢复正确。

主智能体还用本轮已构建的当前 dist 做了无文件改动的确定性探针：将 `preview.status=running, background=true, backgroundTaskId=bash_repro` 与 `finished=true, isError=false` 送入 `toolEntryToBlock()`，实际 `block.status=success`，预期 running；直接调用 helper 得到相同结果。这证明错误发生在共享投影层，与模型输出、网络、实际进程耗时或组件颜色无关。该探针是根因证据，不计入 79 项通过的测试。

### 建议修改范围与顺序

1. 在共享 `packages/client/src/live/stream-blocks.ts` 修正 Bash 状态选择。优先保留审批 pending 和工具尚未返回的行为；工具已经返回时，对带后台任务标识的 Bash preview 使用任务状态，而不是仅用 `finished/isError` 决定 success。至少必须保留后台 running，并确保 success/failed/cancelled 仍以任务终态为准。
2. 建议让 helper 接收所需的后台标识，或在 `toolEntryToBlock()` 的 Bash 分支中选择状态；选其一即可，不要维护两份状态机。前台 Bash 缺省状态与历史兼容 fallback 保持原语义。
3. 不要通过修改 `BashRunBlock` 文案、增加延时或将启动器工具保持 `finished=false` 解决。后者会把工具调用生命周期与任务生命周期再次混在一起，还可能影响主 Agent 继续执行、waitingForModel 与回合结束。
4. 在 `packages/client/src/test/` 增加面向行为的回归测试，可沿用 `directory-preview.test.ts` 的 `toolPreview → toolEntryToBlock` 双投影测试方式。Desktop 当前重导出共享实现，无需复制一份 Desktop helper。
5. 检查实际任务在父回合仍流式时结束的路径：若持久 settle 已到达，最终 UI 应选用最新任务事实。若现有合并逻辑已正确，无需扩改；若发现仍停留 running，另列证据并做最小跟进，不能仅凭本次静态阅读声称该分支通过。

预计核心范围是一个共享实现文件、一个聚焦测试文件以及修复 history。实现前按仓库规则由接手模型描述最终方案并取得批准；本交接文档本身不构成产品代码修改授权。

### 自动化回归与真实复验

回归测试应在原实现先失败，修复后通过，至少覆盖：

| 场景 | 预期 |
| --- | --- |
| 后台启动器成功返回、任务未 settle、父回合仍运行 | 卡片 running，保留后台标识 |
| 任务最终 completed / failed | 卡片 success / failed，和持久投影一致 |
| task_stop 或重启 lost | 按已有 cancelled 映射，不误报 success |
| 前台 Bash 成功/失败 | 保持 success/failed |
| 审批 pending/denied/expired、工具 aborted | 保留既有状态语义 |

建议验证命令（由修复模型实际执行并记录）：

```bash
pnpm --filter @actspace/client test
pnpm --filter @actspace/desktop exec vitest run src/renderer/test/transcript.test.ts src/renderer/test/bash-run-block-tooltip.test.tsx src/renderer/test/live-run-store.test.ts
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop build
```

真实 Electron Computer Use 定向复验：同一条 35 秒命令，分别捕获启动工具返回后且父轮仍流式、父轮结束且任务仍运行、任务最终成功/失败三个状态；确认全程没有提前 `Ran`，不会在 live→durable 切换时状态倒退。再核对通知只领取一次、停止父回合仍不杀后台任务。浅/深两主题复用该路线检查即可，无需重跑整套验收。

## BGT-002 · P3 · Host 错误跨 Harness 打包边界后丢失 TASK_NOT_FOUND

### 复现、影响与根因

新会话 `task_list` 返回 0，读取另一会话的任务正确失败，但实际 `failure.code=BACKGROUND_TASK_FAILED`，没有保留设计承诺的 `TASK_NOT_FOUND`。界面拒绝与隔离语义通过；精确错误码约定失败。具体 Journal seq183 和截图见 [缺陷记录](bugs.md)。

根因已确认：`packages/tools/background-tasks/src/tools.ts:78` 用 `instanceof BackgroundTaskError` 判断 Host 服务抛出的异常；实际 Harness artifact 内联了第二个同名错误类，因此不能识别 Host 的类实例。字符串 name 与 code 虽然相同，构造器身份不同。

确定性探针使用本轮实际制品，给两个工具实现注入同一个 Host `BackgroundTaskRegistry`、读取同一个未知任务：

| 探针 | 结果 |
| --- | --- |
| Host 类与 artifact 内联类 `===` | false |
| Host 错误 `instanceof` artifact 内联类 | false |
| 未打包工具的 failure.code | TASK_NOT_FOUND |
| 实际打包工具的 failure.code | BACKGROUND_TASK_FAILED |

这解释了为何现有 lifecycle 测试通过，真实应用却不同。探针没有写任何产品代码，也没有执行实际后台任务。

### 建议修复方案

1. 在工具错误映射边界识别稳定的数据契约，不依赖跨 Host/Harness 的类身份。可以在 `@actspace/background-tasks` 提供可复用的错误识别函数，检查非空对象、`name === "BackgroundTaskError"`、字符串 message 与已知 code 白名单（当前 `TASK_NOT_FOUND` / `TASK_ID_CONFLICT`），然后由工具保留该 code；普通未知异常继续返回 `BACKGROUND_TASK_FAILED`。
2. 同时审查错误 message 的读取，确保识别函数对来自独立 realm/序列化边界的数据也可工作；不要只把 `instanceof Error` 替换成无校验的 `error.code` 透传。
3. 本地 `BackgroundTaskInputError` 仍在工具内产生，不受这次 Host 类复制影响；保留 INVALID_ARGUMENTS 行为。无需为修复一个错误码重构整个打包系统或改变会话归属检查。
4. 把真实构建边界加入回归：由 Host 原始模块创建 registry，让构建后的 Harness 工具调用它。测试 `task_output` / `task_stop` / `task_wait` 对另一会话或不存在的 ID 都返回 TASK_NOT_FOUND，且 message 不泄露任务内容；普通 Error 仍走通用失败，非法参数仍为 INVALID_ARGUMENTS。
5. 按用户规则，实施前由接手模型确认最终改动范围；本轮仅交付方案。

建议验证：先让打包边界测试在当前实现失败，再修复后通过；运行 `@actspace/background-tasks` 与 `@actspace/tools-background-tasks` 测试和实际默认 Harness/Desktop 构建。最后 Computer Use 新建两个会话，真实执行归属隔离路径，并只读核对 Journal 的 `failure.code`；仅依赖模型口头解释或测试中的 JSON 字符串包含 TASK_NOT_FOUND 不足以签收。

## BGT-003 · P2 · 窄窗尺寸落入布局空档，子智能体面板打开后立即关闭

### 复现、影响与归属

真实 Electron 缩为约 832×760 逻辑像素，点击已有子智能体卡片或右上「打开面板」，均不能打开右侧详情。原尺寸的真实子对话/轨迹可用，窄窗主会话卡与通知也可读；受影响的是详情入口。截图及邻近尺寸对照见 [Computer Use 结果](computer-use-results.md)，完整缺陷记录见 [缺陷](bugs.md)。

这是本轮发现的既有共享布局缺陷：相关实现来自 `72dd0a45`，早于后台任务功能提交 `ce19e4d6`；不能归因于后台 Agent 新增实现。它仍会阻断本功能的 A11 窄窗使用路径。

### 已确认根因

`apps/desktop/src/renderer/components/workbench/use-panel-layout.ts` 的主区最小宽为 560、右栏最小宽为 320，但 compact 阈值只有 820。

- 容器约 832 时，`isCompactLayout=false`，所以 `WorkbenchLayout.tsx` 不渲染右侧覆盖层。
- `toggleRightPanel()` 先打开右栏，随后布局 effect 发现 `832 - 320 < 560`，立即关闭。左栏已经隐藏，仍无法满足并排布局。
- 源码推导的空档为 `820 < containerWidth < 880`；真实现场只对明确记录的尺寸负责，不把该区间称为逐点实测。
- 现有 `workbench-responsive.test.tsx` 覆盖较窄 compact 场景与 1120 宽屏，没有夹在两种布局之间的边界。

### 建议修复范围与回归

1. 将覆盖层选择条件与并排布局实际最小宽统一。建议由 `MAIN_MIN_WIDTH + RIGHT_MIN_WIDTH` 推导无法并排的阈值，保证在宽度不足时仍可通过覆盖层打开右栏；明确 `<` / `<=` 的边界，避免 880 处抖动。若使用可用宽而非容器宽，还应一致处理左栏收起后的空间。
2. 让自动收栏与打开逻辑使用同一容量判断。不要只移除自动关闭保护，也不要降低主区最小宽、挤压内容到不可读或把问题藏到按钮禁用里；目标是在所有尺寸保留可用详情入口。
3. 优先限制在 `use-panel-layout.ts`、必要的 `WorkbenchLayout.tsx` 调用适配和响应式行为测试，不扩改任务调度或子会话模型。没有必要修改主题颜色。
4. 在当前实现先补能够失败的边界回归：820、821、832、879、880、881；点击工具栏和子智能体卡片均能打开详情，窄窗为覆盖层、足够宽时为并排栏。覆盖左栏原来打开/隐藏、跨阈值缩放与关闭后重新打开，检查不会一帧打开后被 effect 关闭。
5. 保留已有覆盖层 Escape、焦点返回、背景遮挡与桌面布局回归；不要仅断言按钮 click 回调发生，必须断言面板最终可见且保持打开。
6. Desktop 响应式定向测试、typecheck、build 通过后，Computer Use 在约 800、832、900 逻辑像素检查同一真实子会话详情。浅/深两主题复用路线观察对话与轨迹、滚动、切换和关闭，留必要截图。既有主会话卡/通知应仍可用。

实施前由接手模型说明最终方案并取得批准。本轮没有修改布局或添加测试，不能把以上方案计为修复通过。

## OBS-001 · 正常退出时出现 Agent service is closed

- 现场：第一次 Cmd+Q 后，`electron.log:507` 出现 `runtime-v2:fixed-renderer:task-command` handler 的 `Agent service is closed`；专属进程退出码仍为 0，随后重启与 lost 处理成功，未发现对应用户界面故障。
- 分类：退出期异常日志观察，当前没有足够证据列为已确认功能 Bug，也没有证据说明由本次功能引入。
- 静态线索：`apps/desktop/src/main/index.ts` 的 before-quit 先发 appShuttingDown，再 await runtime dispose，最后才释放 fixedRendererIpc；`packages/agent-service/src/service.ts` 的 dispose 会先置 closed，后续 snapshot 会拒绝。因此关闭中的窗口若还有请求在途，存在 IPC 仍可调用而服务已关闭的窗口。这是符合堆栈的候选解释，尚未用定向时序记录证明具体请求来自哪个 renderer 回调。
- 后续排查方案：在独立修复任务中记录 shutdown 开始、renderer 收到通知与停止请求、task-command 的 op/到达时刻、service closed、IPC dispose 的顺序；不要记录消息正文或凭据。复现后优先在 IPC 生命周期边界拒绝新请求或返回明确的 shutting-down 结果，并取消 renderer 尚未发出的刷新。不要全局吞掉 `Agent service is closed`，避免掩盖非退出场景的故障。
- 验证：空闲与有后台 Bash/Agent 的正常退出都应有界退出，既无意外 handler 拒绝，也不改变下次启动的 lost 语义。没有上述证据前不实施或签收这项修复。

## 交接边界

- 79 项现有定向测试、Desktop 构建和类型检查已通过，但未覆盖 BGT-001 的组合状态、BGT-002 的真实打包边界与 BGT-003 的布局空档；全部通过不能抵消真实界面与工具契约缺陷。
- 本次没有修改源码、增加测试或提交代码；没有修复后验证结论。
- 本轮验收矩阵与主题/窗口实际覆盖见 [Computer Use 结果](computer-use-results.md)，总结果见 [验收摘要](execution-summary.md)。
