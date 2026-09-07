# Agent 工具流式渲染修复设计

> 状态：已实施，2026-09-06；自动化与浏览器组件验收通过，真实 Electron 和 DeepSeek 验收保留为人工项。

## 目标与证据

Agent 输出期间，正文、思考和工具调用分别渲染。工具从参数生成、审批、执行到结束使用同一条消息，结束后重新读取 Session 时保持同样的工具类型、参数摘要和结果状态。

2026-09-06 修复前的只读诊断确认：

- `packages/core/agent-loop/src/loop.ts` 的 `collectStream()` 把 `tool-call-delta.argumentsDelta` 作为 `assistant-delta.message` 发出。
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts` 的 `toRendererStreamEvents()` 直接将其映射为正文；工具 progress 只能产生 generic preview，没有完整开始、结束转换。
- `apps/desktop/src/renderer/App.tsx` 运行中消费流式块；runAgent 返回后 getSession 重建并清除流式块，因此完成后恢复正常。
- 对用户所示会话的本地脱敏检查：15 次含工具调用的模型请求，其流式正文均等于最终正文加工具参数（按 JSON 值比较，忽略空白）；35 次工具调用均有结果记录。
- 两项现有 renderer 测试通过，但直接模拟 tool_started/tool_finished，绕过真实 Agent Loop 和 Host 转换。修复前受控输入运行 collectStream 与转换函数，可重现正文混入参数。

不把该会话的真实路径、请求正文、工具输出或凭据复制进 fixture。截图中的工具参数校验、审批超时、路径边界等真实失败，应如实显示；执行策略最初未改；后续已批准的工具体验调整见文末。

## 方案

最小止血方案是停止把工具参数发成正文；但这不能满足运行中展示工具的要求。本次补齐同一条事件链，复用现有 RuntimeStreamEvent 和 ToolUiPreview；不引入新的 IPC channel、后台服务或持久化存储。

```text
LLM typed stream
  -> Agent Loop: text / reasoning / tool arguments + tool lifecycle
  -> Desktop internal stream adapter: accumulate arguments, build safe typed preview
  -> existing agentStream IPC
  -> App tool entries keyed by session + run + call
  -> existing MessageBlock components

Tool result + Session Journal
  -> shared Desktop tool preview builder
  -> historical MessageBlock projection
```

Core 和 Tools 只描述执行事实，不依赖 React、ToolUiPreview 或 Electron。Desktop 内部适配器承担参数增量提取和展示转换。Runtime 通用 live/revision 通道继续为 Session/Trajectory 提供现有能力，新增的工具参数原文不通过通用 live envelope 直接广播给 renderer。

## 契约与事件所有权

| 事实 | 生产位置 | 内容与前端行为 |
| --- | --- | --- |
| 正文、思考增量 | AgentLoop.collectStream | 保留 messageId、requestId、stepId；仅真实正文进入 assistant_text_delta |
| 工具参数增量 | AgentLoop.collectStream | 独立 tool-call-delta，携带 callId、name、argumentsDelta、requestId；Main 累积并发出 typed tool_call_streaming |
| 工具已准备 | AgentLoop.runTools，tool/call append 成功后、executeBatch 前 | 完整参数和身份；发出一次初始/补全预览。即使 Provider 只在 done 返回工具，也能出现条目 |
| 真正开始执行 | ToolPreparedExecution，通过策略、审批与 checkpoint，进入 body 前 | 增加可选的内部 onExecutionStarted 回调，携带调用身份；发 tool_started。校验失败、拒绝不伪造 started |
| 等待审批、审批决定 | 现有 Desktop approvalRegistry 回调 | 保留权限逻辑和单一生产者；按 callId 更新同一条工具。resolved 不代表工具已完成 |
| 工具进度 | 现有 reportProgress | 更新现有 typed preview；不能覆盖成 generic 或把终态重新变成 running |
| 工具结束 | AgentLoop 的 journal.commitResult，tool/result append 成功后 | tool-finished 携带标准化结果和 result event id；每个 call 独立完成，包括校验失败、拒绝、超时、中止 |

AgentLoopLiveEvent 改成可辨别联合类型，Runtime/Host 使用公开类型引用，去掉 Desktop 两处复制的三种 kind 限制。tool-finished 结果使用已标准化、经过既有脱敏流程的 ToolExecutionResult；它仍是内部事实，Main 再生成允许给 renderer 的 preview。

新增 Main 内部 `FixedRendererStreamAdapter`（普通模块对象，不是服务）管理本轮缓存。Registry 增加内部 `subscribeRendererStream` 订阅，fixed-renderer-ipc 把它发布到既有 agentStream channel，替换原有通用 live -> fixed stream 转换，防止正文和 progress 双发。原有 Session live 订阅、cursor/replay、revision 刷新保持原职责。

requestId 是模型请求身份；llmCallId 兼容字段映射实际 requestId，不继续以 stepId 代替。缓存键至少包括 sessionId、agentRunId、callId，请求关联还包含 requestId。Core 在工具结果回调中保留请求关联。

## 参数与预览

从 fixed-renderer-projection.ts 提取 `toolPreview` 到 `fixed-renderer-tool-preview.ts`，提供参数生成、准备、执行、终态所需的纯转换。实时与回放共用终态转换和工具名称到 previewKind 的映射。

- Read/List/Grep/Glob：参数明确后显示路径或查询摘要；结果到达才显示条目数量。
- Bash：参数生成时显示稳定占位，prepared 后一次显示 command 摘要；审批与执行状态继续实时更新，结果展示 stdout/stderr。
- Write/Edit：参数生成只显示动作占位，prepared 后一次显示路径；不发送 streamingContent，diff 与统计在结果到达后补齐。
- Delete、Web、图像工具、Todo、Agent/Explore：复用现有 previewKind；未知插件使用明确的 generic fallback。
- 提取过程中顺带核对映射是否覆盖当前注册表中的规范工具名；只修复本预览映射的遗漏，不进行工具命名迁移。
- 不直接复用终态默认值：running 不得显示 Tool completed、success、伪造的 diff 或统计；拒绝和中止不能全部映射成普通 failed。没有专用终态枚举的 UI 用失败展示并保留明确原因，不谎报成功。
- 工具参数增量只触发一次稳定占位，不解析、不缓存 partial JSON；prepared 一次补齐摘要。已移除 50ms 参数合并定时器与 64 KiB 部分参数缓冲；底层工具参数事件与完整参数校验保留。
- 不向 renderer 发送未筛选 args/ToolExecutionResult；输出沿用现有 redaction、artifact 和 DTO 边界。正文中的用户合法 JSON 不能被前端正则删除。

工具预览规范中的 `engine/streaming-preview-extractors.ts` 等是旧路径，本次采用上述 Main 模块并同步规范，不恢复旧 engine。

## 前端合并与收尾

- tool_call_streaming、tool_started、审批和 tool_finished 必须 upsert 同一工具条目。终态先到也创建条目，不要求之前收到 started。
- finished/denied/aborted 后，迟到的参数、progress、approval-resolved 不得降级终态。同一结果重复送达不重复插入。
- 按调用首次出现的位置保持正文/工具顺序；并行调用分别提交结果；已轮到的结果不等待整批 body 或模型最终回复。Journal 仍按调用顺序提交，所以后发先完成的工具需等待前序结果提交，不另建未持久化的终态通道。
- run 完成、失败、中止都取消 Main 和 renderer 本轮预览缓存；Session 重新读取以现有请求可见性检查为准，旧会话异步结果不得覆盖当前会话。
- 中途取消且只有参数尚未生成 tool/call 时，清理未执行的临时条目；已经执行或已记录结果的工具保留真实投影。不得凭 run 结束将未知结果写成成功。
- 正常结束前后比较工具数量、previewKind、参数摘要、结果状态和正文；ID 可以依现有历史投影变化，但不应新增重复块或丢结果。

## 范围与风险

这是超过 8 个实现文件的跨层修复，预期 12–16 个实现文件及配套测试、文档，作为一个完整可发布切片交付。任务顺序不代表中间状态可发布。

最初流式修复的边界是不改 Provider 网络协议、工具输入 schema、审批策略、沙箱规则、Journal 版本；不复活分析观测；不全量迁移 App 到 SessionStore；不新增重连恢复运行中流式内容能力；当时不扩展子 Agent transcript 或 Bash 后台订阅功能，只保证本轮调用条目与现有结果正确对齐。后续获批扩展以文末为准。

最主要风险是事件排序与双通道重复发送。用明确的单一生产者、callId upsert、终态优先和受控乱序测试约束。展示回调失败必须隔离，不能使工具重复执行或把成功结果变成执行失败。

Journal 保留原有 assistant/chunk 容器；新增工具 kind 时保存 callId/name/requestId 关联，不再把新工具参数记成正文。旧数据原位保留，回放继续以 assistant/message 与 tool/result 为准。append/live 不等于 fsync；不得更改现有 checkpoint 或宣称 UI 事件提供额外持久化保证。

执行计划：[工具流式渲染修复](../../exec-plans/completed/20260906-agent-tool-stream-rendering/README.md)。

## 实施补充与验收

- `packages/tools/runtime/src/scheduler.ts` 在每个并行 body 结束后立即提交结果，OrderedToolCommitQueue 保留原来的调用顺序。`onExecutionStarted` 位于实际 executor 调用前，不在整批 stage 阶段提前触发。
- CLI Host 过滤新增的工具内部事件，只把原有 text/reasoning/run 事件发到通用 live DTO，避免将工具参数重新串成正文。
- Shared selector 和 ToolLogLine 补齐失败、拒绝、中止状态；终态先到、重复结果和迟到审批不会覆盖已完成结果。
- 真实 AgentLoop fixture 贯穿 Main adapter、App 与 Journal rehydrate，覆盖无 delta、无 started、正文 JSON、逐工具完成和终态优先。
- [执行摘要](../../exec-runs/20260906-agent-tool-stream-rendering/execution-summary.md) 记录命令、浏览器结果和人工验收边界。

## 后续工具体验调整（2026-09-06）

- Thinking 开关与 effort 经 fixed-renderer IPC、Desktop App、RunController、AgentLoop 到 LLM options；Desktop adapter 按模型能力规范化，直连和代理传输都携带请求选项。
- 默认内置工具仅 Bash 弹操作审批；Browser 保留规范命令检查和 Bridge preflight，文件工具保留 schema、能力、workspace/符号链接边界。
- 工作空间路径由 Node path.relative 计算：根为 `.`，内部相对路径，外部绝对路径；Raw 与实际调用不改。
- 轨迹页隐藏整个 composer-zone，但保留挂载；草稿、附件、模型选择不会因切换卸载。运行时顶部保留 Stop。
- Subagents 使用右侧列表/详情导航。委派 requested 记录 childSessionId；列表每秒刷新，运行中详情每 750ms 刷新，关闭/切换时释放轮询并忽略迟到响应。详情 IPC 返回 SessionEvent，与前端契约一致，展示未提交正文/Thinking chunk 和已准备的运行工具，完成后以持久消息代替 chunk。Todo UI 保持现状。
