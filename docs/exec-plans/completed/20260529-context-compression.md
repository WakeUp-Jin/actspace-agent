# 上下文压缩实现

## 目标

让主 Agent 在工具输出和会话历史两条路径上都具备压缩能力：工具输出回填上下文前按工具语义压缩并保留可回读路径（bash 全量落盘）；长会话在 token 水位达阈值时用 flash 模型摘要旧历史、保留最近 N% 并拼接 `session.jsonl` 路径。最终状态：tool-heavy 与长会话场景都不再撑爆窗口，且模型可按需回看被压缩的内容。

设计事实来源：`docs/design-docs/agent-context-compression.md`。本计划只回答「谁改哪些文件、按什么顺序、每步如何验证、失败如何回退」。

## 范围

- 包含：
  - 工具输出压缩流水线（Tier-1 读取极限保护 + Tier-2 通用 flash 摘要）。
  - bash 全量落盘到 `<userData>/tmp/tool-output/` 与回读。
  - 按工具类型的摘要 system prompt。
  - 历史压缩（mid-loop 触发、8 节摘要、保留最近 N%、配对安全、`session.jsonl` ref）。
  - 读取类工具放开 workspace 限制 + 安全文档同步。
  - flash `summarizer` 构造与不可用兜底。
  - 观测（run-log + 可选 `context_compaction` 事件）。
- 不包含：
  - 用户手动增删改上下文条目（属 `token-usage-and-context-state.md` 后续）。
  - 多策略 token 移除选择器。
  - 敏感路径 blocklist / 读审核（记入 tech-debt-tracker）。
  - 前端「查看完整输出」入口（仅留契约字段，不动 renderer）。
  - 溢出文件强一致清理（M5 可选）。

## 背景

- 相关文档：
  - `docs/design-docs/agent-context-compression.md`（设计事实来源）
  - `docs/design-docs/agent-token-usage-and-context-state.md`
  - `docs/design-docs/core-storage-and-observability.md`
  - `.agents/skills/llm-agent-dev/references/context/mgmt-compression.md`、`mgmt-token-strategies.md`
- 相关代码路径：
  - 工具侧：`packages/agent-core/src/tools/{scheduler.ts,manager.ts,types.ts,workspace-guard.ts}`、`tools/subprocess/run-process.ts`、`tools/tools/{read-file,grep,glob,list-directory,bash}/executor.ts`、`tools/tools/bash/render-result.ts`
  - 上下文侧：`packages/agent-core/src/context/{types.ts,manager.ts}`、`context/modules/conversation.ts`
  - 引擎侧：`packages/agent-core/src/engine/{loop.ts,types.ts,agent.ts,create-agent-deps.ts,bridge.ts}`
  - 共享契约：`packages/shared/src/session.ts`（`ToolExecutionResult` / `ToolOutputRef` / `SessionEventType`）、`packages/shared/src/model-config.ts`
  - 桌面侧：`packages/desktop/src/main/{agent-turn.ts,index.ts}`
- 已知约束：
  - `scheduler.postProcess` 当前同步；接 flash 摘要后必须改异步，`runHandler` 链路 await。
  - DeepSeek/Kimi 走 OpenAI/Anthropic 格式，`tool_calls` 与 `tool` 结果必须配对；历史压缩切点不得拆对。
  - `summarizer` 用 `deepseek-v4-flash`，需 DeepSeek key；无 key 时走确定性兜底。
  - 读边界放开只动读取类四工具，写类（write/edit/bash）保持守卫。

## 风险

- 风险：`postProcess` 改异步波及调度链路与既有测试。
  - 缓解：M1 先改类型与 await 链路，跑 `scheduler` 既有测试确认无回归，再接 flash。
- 风险：历史压缩切点拆开工具配对导致 provider 报错。
  - 缓解：compactor 单测覆盖「切点落在配对后」「孤儿兜底」用例；保留 `convert.ts` 现有 sanitize。
- 风险：每个 bash/web 输出都触发 flash 摘要，turn 延迟上升。
  - 缓解：阈值可配置；读取类用独立高阈值穿透；`summarizer` 失败即兜底不阻塞主流程。
- 风险：放开读边界扩大可读文件面（密钥等）。
  - 缓解：本期明确接受并文档化；后续 blocklist 记入 tech-debt-tracker。
- 风险：flash 不可用（无 key / 报错）阻塞 turn。
  - 缓解：summarizer 调用 try/catch，失败回退确定性截断 / 丢弃最旧消息，不抛错到主循环。

## 里程碑

1. M0 契约与地基：扩展 `CompressionConfig`、透传 `tmpRoot/sessionId`、构造 `summarizer`、扩展 shared 契约。
2. M1 预防层：bash 流式落盘（run-process sink + executor 读回）+ 非 bash flash 摘要（OutputTruncator + 工具摘要 prompt）+ scheduler 异步化 + bridge 四字段。
3. M2 读边界放开：读取类四工具去守卫 + 安全文档同步。
4. M3 治疗层：HistoryCompactor + 8 节 prompt + ContextManager.compactIfNeeded + loop maybeCompact 钩子。
5. M4 观测：run-log + 可选 `context_compaction` 事件。
6. M5（可选/后置）：`cleanupOldToolOutputs` 定时清理。

里程碑顺序为强依赖：M1 依赖 M0 的 summarizer 与透传；M3 依赖 M0 的 config 与 summarizer；M2 与 M1/M3 弱依赖（可并行，但 bash 回读验收依赖 M2）。

## 任务清单

### M0 契约与地基

- [x] T0.1 扩展 `CompressionConfig`
  - 文件：`packages/agent-core/src/context/types.ts`
  - 改动：在 `CompressionConfig` 增加 `compactKeepRatio`（沿用现 `compressKeepRatio` 或重命名为统一名）、`compactMinIntervalCalls`、`toolTruncateThreshold`(默认 2000)、`readTruncateThreshold`(默认 20000)、`bashInlineThreshold`(默认 4000)、`bashDiskCap`(默认 5MB)、`absoluteMaxChars`(默认 100000) 字段，并给 `manager.ts` 的 `DEFAULT_CONFIG` 补默认值（见设计文档「配置与阈值」表）。
  - 验证：`pnpm --filter @actspace/agent-core typecheck` 通过。
  - 回退：还原 `context/types.ts` 与 `manager.ts`。

- [x] T0.2 透传 `tmpRoot` / `sessionId` 到 ToolManager
  - 文件：`packages/agent-core/src/tools/types.ts`（`ToolManagerConfig` 增 `tmpRoot?` / `sessionId?` / `summarizer?`）、`packages/agent-core/src/engine/create-agent-deps.ts`（`buildAgentConfig` 入参增 `tmpRoot` / `sessionId`，填入 `toolManagerConfig`）、`packages/desktop/src/main/agent-turn.ts`（把 `roots.tmpRoot` + `input.sessionId` 传入 `buildAgentConfig`）。
  - 验证：`pnpm --filter @actspace/agent-core typecheck` + `pnpm --filter @actspace/desktop typecheck` 通过；既有 `create-agent-deps` 相关测试不回归。
  - 回退：还原上述三文件签名。

- [x] T0.3 构造 flash `summarizer`
  - 文件：新增 `packages/agent-core/src/context/compression/summarizer.ts`；在 `engine/create-agent-deps.ts` 用 `MODEL_REGISTRY["deepseek-v4-flash"]` + `buildLLMConfig` + `createLLMService` 构造，无 DeepSeek key 时返回 `undefined`。
  - 接口：`summarizeToolOutput(kind, input): Promise<string>`、`summarizeHistory(serialized): Promise<string>`（内部 `llm.complete`，try/catch 失败抛 `SummarizerUnavailable`，由调用方兜底）。
  - 验证：新增 `context/compression/test/summarizer.test.ts`，用 `MockLLMService` 注入预设响应，断言 prompt 选择与输出透传；`pnpm --filter @actspace/agent-core test` 通过。
  - 回退：删除新增文件与构造点。

- [x] T0.4 扩展 shared 契约（可选事件 + 确认 ref 字段）
  - 文件：`packages/shared/src/session.ts`：确认 `ToolOutputRef.kind: "inline" | "file"` 满足落盘需求（已满足，无需改）；新增 `SessionEventType` 成员 `context_compaction` 与对应 payload 类型 `ContextCompactionPayload`（trigger token、beforeCount、afterCount、summaryChars、historyRefPath）。
  - 验证：`pnpm --filter @actspace/shared typecheck` + `pnpm --filter @actspace/shared build`；`pnpm --filter @actspace/agent-core typecheck`（确认 re-export 不破坏）。
  - 回退：还原 `session.ts`。

### M1 预防层（工具输出）

bash 走流式落盘 + 头部截断（T1.0/T1.1，无 flash）；非 bash 工具走 flash 摘要（T1.2/T1.3）。

- [x] T1.0 run-process 流式落盘 sink
  - 文件：`packages/agent-core/src/tools/subprocess/run-process.ts`、新增 `packages/agent-core/src/tools/tool-output-paths.ts`。
  - 改动：`RunProcessOptions` 增 `outputFile?` / `headBufferCap?` / `diskCap?`；当 `outputFile` 设置时，stdout 不在内存累加全量——内存只留前 `headBufferCap` 字符 + 总字节计数，超出 `headBufferCap` 后懒创建文件流式写盘，达到 `diskCap`（默认 5MB）停写并标记 truncated。`RunProcessResult` 增 `headBuffer` / `totalBytes` / `outputFilePath?`。`tool-output-paths.ts` 负责 `<tmpRoot>/tool-output/<sessionId>/<turnId>-<toolCallId>-bash.txt` 路径构造。
  - 验证：新增 `tools/subprocess/test/run-process-stream.test.ts`：小输出不创建文件（`outputFilePath` 为空、`headBuffer` 即全部）、大输出懒创建文件且内存 headBuffer 恒定、超 diskCap 标记 truncated。`pnpm --filter @actspace/agent-core test`。
  - 回退：移除流式 sink，run-process 回到内存累加。

- [x] T1.1 bash executor 读回与回填
  - 文件：`packages/agent-core/src/tools/tools/bash/{executor.ts,render-result.ts}`。
  - 改动：bash 用流式 sink（传 `outputFile` 路径 + `headBufferCap = bashInlineThreshold(4000)` + `diskCap = bashDiskCap`）；输出 ≤ 4000 → inline 全部、无文件、无标记；> 4000 → 回填头部 4000 + 截断标记（`[输出截断：显示前 4000/共 N 字符，完整原文见 <path>，可 read_file 读取]`）+ 路径，保留文件。`BashResult` 增 `stdoutFilePath?` / `outputTruncated`。`tmpRoot` / `sessionId` 由 `ToolManagerConfig` 经 executor 上下文取得。
  - 验证：更新 `tools/tools/bash` 测试：小输出 inline 无标记无文件、大输出头部+标记+路径且文件存在、内存不累加全量（mock 大输出）。`pnpm --filter @actspace/agent-core test`。
  - 回退：还原 bash executor 为旧内存截断版。

- [x] T1.2 工具摘要 prompt 注册表 + 压缩标记
  - 文件：新增 `packages/agent-core/src/context/compression/tool-summary-prompts.ts`，按 `previewKind`（read/grep/glob/directory_list/bash/web_search/generic）返回 system prompt，read/grep 类硬约束「保留行号/路径/命中行」，统一约束输出长度上限；同文件导出 `compressedNotice(originalChars, recoveryHint)` 与 `recoveryHintFor(kind, overflowPath?)`（见设计文档「压缩标记」）。
  - 验证：新增 `context/compression/test/tool-summary-prompts.test.ts` 断言每个 kind 返回非空且含关键约束词、`compressedNotice` 含「已压缩摘要」与字符数、bash recoveryHint 含路径占位；`pnpm --filter @actspace/agent-core test`。
  - 回退：删除文件。

- [x] T1.3 OutputTruncator 流水线（非 bash）
  - 文件：新增 `packages/agent-core/src/tools/output-truncator.ts`（异步纯函数 + `headTailTruncate` 工具函数），实现设计文档「非 bash 工具压缩流水线」伪代码：按工具类型取阈值、低于阈值原样穿透（不加标记）、送 flash 前 `headTailTruncate(text, absoluteMaxChars)`、调 summarizer、summarizer 不可用走 `headTailTruncate(text, threshold)` 兜底、回填前拼 `compressedNotice`。**bash 不进此流水线**。
  - 验证：新增 `tools/test/output-truncator.test.ts`，覆盖：小输出原样穿透（无压缩标记）、读取类 < 20000 穿透 / > 20000 摘要且带标记、读取类 > absoluteMaxChars 头尾截断（保留头尾、中间省略标记）、web/generic > 2000 摘要、summarizer 为空走头尾截断兜底（注入空 summarizer）。
  - 回退：删除文件。

- [x] T1.4 scheduler 异步化并接入流水线
  - 文件：`packages/agent-core/src/tools/scheduler.ts`（`postProcess` 改 `async`，对**非 bash 工具**调用 `output-truncator`，bash 已在 executor 自处理则原样透传；`runHandler` await；`ToolSchedulerConfig` 增 `summarizer`）、`packages/agent-core/src/tools/manager.ts`（构造 scheduler 时传入 `summarizer`；把 `tmpRoot` / `sessionId` 透传给 bash executor 上下文）。
  - 验证：`pnpm --filter @actspace/agent-core test`（scheduler 既有测试 + 新增异步路径用例）；重点确认权限/审核路径不回归。
  - 回退：还原 `scheduler.ts` / `manager.ts` 至同步 slice 版本。

- [x] T1.5 bridge 四字段如实填充
  - 文件：`packages/agent-core/src/engine/bridge.ts#createToolExecutionResult`。
  - 改动：`rawOutput`=全量、`truncatedOutput`/`modelOutput`=摘要、`rawOutputRef`= bash 为 `{kind:"file"}` 其余 `{kind:"inline"}`、`tokenEstimate` 基于 `modelOutput`。需从工具执行记录拿到原文与 ref（经 `ToolResult` 透传 ref，或在 scheduler record 上附带）。
  - 验证：`pnpm --filter @actspace/agent-core test`（`engine/test/bridge.test.ts` 增 bash 落盘 ref 断言）。
  - 回退：还原为四字段同值。

### M2 读边界放开

- [x] T2.1 读取类工具去 workspace 守卫
  - 文件：`packages/agent-core/src/tools/tools/{read-file,grep,glob,list-directory}/executor.ts`、`packages/agent-core/src/tools/workspace-guard.ts`（新增 `resolveReadablePath` / `displayReadablePath`）。
  - 改动：读类四工具改用 `resolveReadablePath`（只解析、不越界检查），保留不存在/EISDIR 等错误处理；glob 对 workspace 外结果显示绝对路径（`displayReadablePath`）。`write-file`/`edit-file-diff`/`bash` 仍走 `guardWorkspacePath`。
  - 验证：新增 `tools/test/read-boundary.test.ts`（read_file/list_directory 读 workspace 外、相对路径仍基于 workspace）；`pnpm --filter @actspace/agent-core typecheck` + `test` 全绿（460 passed）。
  - 回退：恢复读取类的 `guardWorkspacePath` 调用。

- [x] T2.2 安全文档同步
  - 文件：`docs/SECURITY.md`（「文件系统访问控制」节注明读类放开 + 取舍 + Kairos 不受影响）、`docs/design-docs/agent-权限设计规则和原则.md`（原则 3 补读边界放开、原则 10 补 bash 流式落盘策略）、`docs/exec-plans/tech-debt-tracker.md`（登记「敏感路径 blocklist + 读审核」债务）。
  - 验证：人工通读确认措辞与 `context-compression.md`「读边界放开」一致。
  - 回退：还原文档。

### M3 治疗层（历史压缩）

- [x] T3.1 ConversationContext 区间替换能力
  - 文件：`packages/agent-core/src/context/modules/conversation.ts`。
  - 改动：新增 `replaceRange(keepRatio, summaryMessage)`（或 `compactOlderThan`），返回被替换的旧消息（供序列化），并保证切点落在完整工具配对之后、user 边界优先。
  - 验证：新增 `context/test/conversation-compact.test.ts`，覆盖配对不被拆开、keepRatio 边界、空历史不报错。`pnpm --filter @actspace/agent-core test`。
  - 回退：删除新增方法。

- [x] T3.2 8 节摘要 prompt + HistoryCompactor
  - 文件：新增 `packages/agent-core/src/context/compression/history-prompts.ts`（ClaudeCode 8 节 system prompt + 开篇语常量）、`packages/agent-core/src/context/compression/history-compactor.ts`（序列化可压区 → `summarizer.summarizeHistory` → 合成 `UserMessage`（`source:"compaction"`）正文 = 开篇语 + 摘要 + `session.jsonl` 绝对路径）。
  - 验证：新增 `context/compression/test/history-compactor.test.ts`，用 MockLLMService 断言：摘要消息含 session.jsonl 路径、含开篇语、可压区被替换为单条、summarizer 失败时走兜底（丢弃最旧）。
  - 回退：删除新增文件。

- [x] T3.3 ContextManager.compactIfNeeded + contextWindow 透传
  - 文件：`packages/agent-core/src/context/manager.ts`。
  - 改动：`createForSession` 接受并透传 `contextWindow`（来自 `modelSpec.contextWindow`）与 `sessionPath`（构造 ref 路径）；新增 `async compactIfNeeded(summarizer)`：判断 `estimateTotalTokens() ≥ contextWindow × compressionThreshold` 且距上次压缩 ≥ `compactMinIntervalCalls`，命中则调 HistoryCompactor 并 `compressionCount++`。
  - 验证：新增 `context/test/manager-compact.test.ts`，覆盖阈值触发/不触发、最小间隔抑制、压缩后 token 下降。`pnpm --filter @actspace/agent-core test`。
  - 回退：还原 `manager.ts`。

- [x] T3.4 loop maybeCompact 钩子接入
  - 文件：`packages/agent-core/src/engine/types.ts`（`AgentLoopConfig` 增 `maybeCompact?: () => Promise<void>`）、`packages/agent-core/src/engine/loop.ts`（每次 `streamAssistantResponse` 前 `await config.maybeCompact?.()`，并在压缩后重新 `getContext` 刷新 `context.messages`）、`packages/agent-core/src/engine/agent.ts`（把 `() => contextManager.compactIfNeeded(summarizer)` 作为 `maybeCompact` 传入，并在压缩后同步 context 引用）、`engine/create-agent-deps.ts`（把 summarizer 传到 Agent）。
  - 验证：新增 `engine/test/loop-compaction.test.ts`，构造超阈值历史 + MockLLMService，断言模型调用前触发压缩、压缩后续跑不报错、配对完整。`pnpm --filter @actspace/agent-core test`。
  - 回退：移除钩子字段与调用，loop 行为回到无压缩。

### M4 观测

- [x] T4.1 压缩观测落 run-log + 可选事件
  - 文件：`packages/agent-core/src/engine/types.ts`（`AgentEvent` 增 `context_compaction` + `ContextCompactionInfo`/`CompactionOutcome`）、`packages/agent-core/src/context/manager.ts`（`compactIfNeeded` 返回 `ContextCompactionReport` 携带 trigger/threshold token、前后消息数、ref）、`packages/agent-core/src/engine/loop.ts`（压缩后 emit `context_compaction`）、`packages/agent-core/src/engine/bridge.ts`（收集压缩事件 → run-log `context_compaction` + 生成 `context_compaction` SessionEvent 追加 `sessionEvents`）。
  - 验证：`pnpm --filter @actspace/agent-core test`（bridge 新增「压缩事件 + run-log」断言、loop-compaction 断言压缩在模型调用前触发）全绿。
  - 回退：移除事件与 run-log 写入。

### M5（可选 / 后置）

- [x] T5.1 溢出文件定时清理
  - 文件：新增 `packages/agent-core/src/tools/cleanup-tool-outputs.ts`（按文件 mtime 删除 `<tmpRoot>/tool-output/` 下超 `maxAgeMs`（默认 7 天）文件，并回收空会话子目录）；`tools/index.ts` 导出；`desktop/src/main/agent-turn.ts` turn 开始时 best-effort 调用（失败不影响 turn）。
  - 验证：新增 `tools/test/cleanup-tool-outputs.test.ts`（超期删除/保留新文件/回收空目录/根目录不存在静默）；`pnpm --filter @actspace/agent-core test` 全绿（479 passed）。
  - 回退：删除文件与调用点。

### M6 文档沉淀（skill 修复留待统一执行）

- [x] T6.1 沉淀 bash 流式落盘设计到 llm-agent-dev 修复文档
  - 文件：`docs/design-docs/fix-llm-agent-06-skill-bash-tool-fix.md`（已写）、`docs/design-docs/fix-llm-agent-plan-index.md`（已登记）。
  - 说明：本任务**只产出修复文档**。`.agents/skills/llm-agent-dev` 源文件（`references/tools/bash-tool.md`、`references/tools/tool-scheduling.md`、`references/context/mgmt-compression.md`、`examples/bash-tool.ts`、`examples/run-process.ts`）的实际修补不在本 active plan 内，按 `fix-llm-agent-plan-index.md` 既有约定（见 `04`/`05` 决策记录）留待后续统一修复 skill 源码时按 `06` 执行。
  - 验证：`pnpm check:docs`。
  - 回退：删除 `fix-llm-agent-06-skill-bash-tool-fix.md` 并还原 `README.md` 表格。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/agent-core test`
  - `pnpm --filter @actspace/agent-core typecheck`
  - `pnpm --filter @actspace/shared build`（契约改动后）
  - `pnpm --filter @actspace/desktop typecheck`（透传改动后）
  - `pnpm typecheck` + `pnpm test`（整仓收尾）
  - `pnpm check:docs`（文档同步后）
- 手工检查：
  - 跑一个会产生大 bash 输出（> 4000 字符，如 `yes | head -c 200000`）的 turn，确认 `<userData>/tmp/tool-output/<sessionId>/` 出现全量文件、模型回填是头部 4000 + 截断标记 + 路径；再跑一个小 bash 输出，确认原样 inline、无文件、无标记；用一个超大输出确认内存不被打爆且文件在 5MB 处截断。
  - 让模型 `read_file` 读该落盘路径与 `session.jsonl`，确认 workspace 外也能读到（M2 生效）。
  - 构造长会话直到 token 水位过 85%，确认出现一条 `source:"compaction"` 的合成消息，含 8 节摘要与 `session.jsonl` 路径，且后续 turn 正常。
- 观测检查：
  - `logs/agent-runs/*.jsonl` 中出现历史压缩记录（trigger token、前后消息数、摘要长度、ref 路径）。
  - 若实现 T4.1 事件：`session.jsonl` 出现 `context_compaction` 事件。

## 进度记录

- [x] M0 契约与地基完成并 typecheck 通过。
- [x] M1 预防层完成，工具输出测试通过，bash 落盘验收。
- [x] M2 读边界放开完成，读类可读 workspace 外、写类仍守卫，安全文档同步。
- [x] M3 治疗层完成，历史压缩按 token 水位触发、配对安全（不动区以 assistant turn 开头，避免连续 user）、ref 注入。
- [x] M4 观测完成（run-log `context_compaction` + session.jsonl `context_compaction` 事件）。
- [x] （可选）M5 清理完成（cleanupOldToolOutputs + turn 起始 best-effort 调用）。
- [x] M6 bash skill 修复文档 `fix-llm-agent-06-skill-bash-tool-fix.md` 已沉淀并登记 README（skill 源文件修补留待统一执行）。
- [x] 整仓 `pnpm typecheck` + `pnpm test` 通过（agent-core 479、desktop 145、shared 全绿），`current-module-map.md` 同步新增模块，`check:docs` 通过，落 history（`docs/histories/2026-05/20260529-2344-context-compression.md`）。

## 决策记录

- 2026-05-29：工具输出压缩用 flash 摘要而非确定性截断（截断成本低但效果差）；read/grep/glob/list_directory 用「高阈值穿透 + 行号保留 prompt」而非摘要，避免摘没逐字代码。
- 2026-05-29：仅 bash 落盘全量原文；其他工具可重读/重跑复现，不落盘。
- 2026-05-29（最终）：bash 改为**流式落盘 + 头部截断 + 路径，不调 flash**——全量原文已永久落盘且可逐字翻页，头部 + 路径比摘要更可信、零额外 LLM 延迟、不会摘错日志数字/路径。flash 只留给 read/grep/glob/web/generic。
- 2026-05-29（最终）：bash 不在内存累加全量字符串（这是内存被吃光的根因，调大上限只是推后问题）；`run-process` 加流式 sink，内存只留 `bashInlineThreshold`(4000) 头部缓冲，超出懒落盘，磁盘硬上限 `bashDiskCap`(5MB)。小输出（≤4000）根本不落盘，等价于「inline 后删小文件」但更省 IO。
- 2026-05-29（最终）：废弃上一轮的 `bashOverflowThreshold`(16000) 与「把 `MAX_OUTPUT_CHARS` 调到 256k」；bash 用 `bashInlineThreshold`(4000) + `bashDiskCap`(5MB)。
- 2026-05-29（修正）：把原 `READ_HARD_CAP`(200k)/`SUMMARY_INPUT_CAP`(64k) 合并为单个 `absoluteMaxChars`(默认 100000，对齐 Skill `context-compressor.ts`)，作为**非 bash 工具**送 flash 前的头尾截断上限。
- 2026-05-29（修正）：flash 送入前的截断改为头尾保留（head 70% + 中间省略标记 + tail 30%），优于 Skill 示例的纯掐头。
- 2026-05-29（修正）：两条路径都加「不完整」标记——非 bash flash 摘要加压缩标记前缀；bash 头部截断加截断标记（含路径）；原样穿透不加标记。
- 2026-05-29：历史压缩在 mid-loop 每次模型调用前按 token 水位触发；完整历史 ref 指向 `session.jsonl`。
- 2026-05-29（实现修正）：可压区切点由「user 边界优先」改为「不动区以 assistant turn 开头」。合成摘要是 UserMessage，若不动区也以 user 开头会产生连续两条 user，而 DeepSeek 默认走 Anthropic-compatible route（严格交替、拒连续 user）。assistant 边界同样落在完整 tool 配对之后，且最近 user 提问在尾部不动区不受影响。summarizer 失败兜底为「丢弃最旧 + 仅留 session.jsonl 指针」。
- 2026-05-29：取消读取类工具的 workspace 硬限制（写类保持守卫），以让「拼路径让模型回读」生效；敏感路径 blocklist + 读审核作为后续债务，不恢复 workspace 硬框。
- 2026-05-29：通用工具截断阈值默认 2000、读取类独立高阈值（默认 20000），均可配置。
- 2026-05-29：bash 流式落盘设计沉淀为 skill 修复文档 `docs/design-docs/fix-llm-agent-06-skill-bash-tool-fix.md`；`llm-agent-dev` skill 现有 bash 指导（`maxBuffer` 全量缓冲、无截断/落盘/回读）太粗糙。skill 源文件实际修补不进本 active plan，沿用 `llm-agent-fix-plan` 既有约定留待统一修复。
