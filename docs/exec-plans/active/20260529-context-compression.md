# 上下文压缩实现

## 目标

让主 Agent 在工具输出和会话历史两条路径上都具备压缩能力：工具输出回填上下文前按工具语义压缩并保留可回读路径（bash 全量落盘）；长会话在 token 水位达阈值时用 flash 模型摘要旧历史、保留最近 N% 并拼接 `session.jsonl` 路径。最终状态：tool-heavy 与长会话场景都不再撑爆窗口，且模型可按需回看被压缩的内容。

设计事实来源：`docs/design-docs/agent-core/context-compression.md`。本计划只回答「谁改哪些文件、按什么顺序、每步如何验证、失败如何回退」。

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
  - `docs/design-docs/agent-core/context-compression.md`（设计事实来源）
  - `docs/design-docs/agent-core/token-usage-and-context-state.md`
  - `docs/design-docs/storage-and-observability.md`
  - `.agents/skills/llm-agent-dev/references/context/mgmt-compression.md`、`mgmt-token-strategies.md`
- 相关代码路径：
  - 工具侧：`packages/agent-core/src/tools/{scheduler.ts,manager.ts,types.ts,workspace-guard.ts}`、`tools/tools/{read-file,grep,glob,list-directory,bash}/executor.ts`
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
2. M1 预防层：OverflowStore + OutputTruncator + 工具摘要 prompt + scheduler 异步化 + bridge 四字段。
3. M2 读边界放开：读取类四工具去守卫 + 安全文档同步。
4. M3 治疗层：HistoryCompactor + 8 节 prompt + ContextManager.compactIfNeeded + loop maybeCompact 钩子。
5. M4 观测：run-log + 可选 `context_compaction` 事件。
6. M5（可选/后置）：`cleanupOldToolOutputs` 定时清理。

里程碑顺序为强依赖：M1 依赖 M0 的 summarizer 与透传；M3 依赖 M0 的 config 与 summarizer；M2 与 M1/M3 弱依赖（可并行，但 bash 回读验收依赖 M2）。

## 任务清单

### M0 契约与地基

- [ ] T0.1 扩展 `CompressionConfig`
  - 文件：`packages/agent-core/src/context/types.ts`
  - 改动：在 `CompressionConfig` 增加 `compactKeepRatio`（沿用现 `compressKeepRatio` 或重命名为统一名）、`compactMinIntervalCalls`、`toolTruncateThreshold`(默认 2000)、`readTruncateThreshold`(默认 20000)、`bashOverflowThreshold`(默认 16000)、`absoluteMaxChars`(默认 100000) 字段，并给 `manager.ts` 的 `DEFAULT_CONFIG` 补默认值（见设计文档「配置与阈值」表）。
  - 验证：`pnpm --filter @actspace/agent-core typecheck` 通过。
  - 回退：还原 `context/types.ts` 与 `manager.ts`。

- [ ] T0.2 透传 `tmpRoot` / `sessionId` 到 ToolManager
  - 文件：`packages/agent-core/src/tools/types.ts`（`ToolManagerConfig` 增 `tmpRoot?` / `sessionId?` / `summarizer?`）、`packages/agent-core/src/engine/create-agent-deps.ts`（`buildAgentConfig` 入参增 `tmpRoot` / `sessionId`，填入 `toolManagerConfig`）、`packages/desktop/src/main/agent-turn.ts`（把 `roots.tmpRoot` + `input.sessionId` 传入 `buildAgentConfig`）。
  - 验证：`pnpm --filter @actspace/agent-core typecheck` + `pnpm --filter @actspace/desktop typecheck` 通过；既有 `create-agent-deps` 相关测试不回归。
  - 回退：还原上述三文件签名。

- [ ] T0.3 构造 flash `summarizer`
  - 文件：新增 `packages/agent-core/src/context/compression/summarizer.ts`；在 `engine/create-agent-deps.ts` 用 `MODEL_REGISTRY["deepseek-v4-flash"]` + `buildLLMConfig` + `createLLMService` 构造，无 DeepSeek key 时返回 `undefined`。
  - 接口：`summarizeToolOutput(kind, input): Promise<string>`、`summarizeHistory(serialized): Promise<string>`（内部 `llm.complete`，try/catch 失败抛 `SummarizerUnavailable`，由调用方兜底）。
  - 验证：新增 `context/compression/test/summarizer.test.ts`，用 `MockLLMService` 注入预设响应，断言 prompt 选择与输出透传；`pnpm --filter @actspace/agent-core test` 通过。
  - 回退：删除新增文件与构造点。

- [ ] T0.4 扩展 shared 契约（可选事件 + 确认 ref 字段）
  - 文件：`packages/shared/src/session.ts`：确认 `ToolOutputRef.kind: "inline" | "file"` 满足落盘需求（已满足，无需改）；新增 `SessionEventType` 成员 `context_compaction` 与对应 payload 类型 `ContextCompactionPayload`（trigger token、beforeCount、afterCount、summaryChars、historyRefPath）。
  - 验证：`pnpm --filter @actspace/shared typecheck` + `pnpm --filter @actspace/shared build`；`pnpm --filter @actspace/agent-core typecheck`（确认 re-export 不破坏）。
  - 回退：还原 `session.ts`。

### M1 预防层（工具输出）

- [ ] T1.0 调高 bash 输出捕获上限
  - 文件：`packages/agent-core/src/tools/tools/bash/executor.ts`。
  - 改动：`MAX_OUTPUT_CHARS` 从 64_000 调高到 256_000（或经 config 注入），让大 bash 输出能被捕获后落盘；回填上下文仍走摘要。
  - 验证：更新 bash executor 测试断言截断阈值；`pnpm --filter @actspace/agent-core test`。
  - 回退：还原为 64_000。

- [ ] T1.1 OverflowStore（仅 bash 落盘）
  - 文件：新增 `packages/agent-core/src/tools/overflow-store.ts`。
  - 实现：`write({ sessionId, turnId, toolCallId, toolName, content }): Promise<string>`，目录 `<tmpRoot>/tool-output/<sessionId>/`，文件名 `<turnId>-<toolCallId>-<toolName>.txt`，`mkdir -p` + 原子写（复用 `tools/tools/shared/write-atomic.ts`）。仅在 bash 输出 `> bashOverflowThreshold` 时由 truncator 调用。
  - 验证：新增 `tools/test/overflow-store.test.ts`，用临时目录断言文件落盘与路径返回；`pnpm --filter @actspace/agent-core test`。
  - 回退：删除文件。

- [ ] T1.2 工具摘要 prompt 注册表 + 压缩标记
  - 文件：新增 `packages/agent-core/src/context/compression/tool-summary-prompts.ts`，按 `previewKind`（read/grep/glob/directory_list/bash/web_search/generic）返回 system prompt，read/grep 类硬约束「保留行号/路径/命中行」，统一约束输出长度上限；同文件导出 `compressedNotice(originalChars, recoveryHint)` 与 `recoveryHintFor(kind, overflowPath?)`（见设计文档「压缩标记」）。
  - 验证：新增 `context/compression/test/tool-summary-prompts.test.ts` 断言每个 kind 返回非空且含关键约束词、`compressedNotice` 含「已压缩摘要」与字符数、bash recoveryHint 含路径占位；`pnpm --filter @actspace/agent-core test`。
  - 回退：删除文件。

- [ ] T1.3 OutputTruncator 流水线
  - 文件：新增 `packages/agent-core/src/tools/output-truncator.ts`（异步纯函数 + `headTailTruncate` 工具函数），实现设计文档「Tier-2 通用压缩流水线」伪代码：按工具类型取阈值、低于阈值原样穿透（不加标记）、bash 超 `bashOverflowThreshold` 时先落盘、送 flash 前 `headTailTruncate(text, absoluteMaxChars)`、调 summarizer、summarizer 不可用走 `headTailTruncate(text, threshold)` 兜底、回填前拼 `compressedNotice`。
  - 验证：新增 `tools/test/output-truncator.test.ts`，覆盖：小输出原样穿透（无压缩标记）、读取类 < 20000 穿透 / > 20000 摘要且带标记、读取类 > absoluteMaxChars 头尾截断（保留头尾、中间省略标记）、bash < 16000 穿透 / > 16000 落盘+摘要+标记且 recoveryHint 含落盘路径、summarizer 为空走头尾截断兜底（注入空 summarizer）。
  - 回退：删除文件。

- [ ] T1.4 scheduler 异步化并接入流水线
  - 文件：`packages/agent-core/src/tools/scheduler.ts`（`postProcess` 改 `async`，调用 `output-truncator`；`runHandler` await；`ToolSchedulerConfig` 增 `overflowStore` / `summarizer` / `sessionMeta`）、`packages/agent-core/src/tools/manager.ts`（构造 scheduler 时传入新依赖，从 `ToolManagerConfig` 取 `tmpRoot` 构造 OverflowStore）。
  - 验证：`pnpm --filter @actspace/agent-core test`（scheduler 既有测试 + 新增异步路径用例）；重点确认权限/审核路径不回归。
  - 回退：还原 `scheduler.ts` / `manager.ts` 至同步 slice 版本。

- [ ] T1.5 bridge 四字段如实填充
  - 文件：`packages/agent-core/src/engine/bridge.ts#createToolExecutionResult`。
  - 改动：`rawOutput`=全量、`truncatedOutput`/`modelOutput`=摘要、`rawOutputRef`= bash 为 `{kind:"file"}` 其余 `{kind:"inline"}`、`tokenEstimate` 基于 `modelOutput`。需从工具执行记录拿到原文与 ref（经 `ToolResult` 透传 ref，或在 scheduler record 上附带）。
  - 验证：`pnpm --filter @actspace/agent-core test`（`engine/test/bridge.test.ts` 增 bash 落盘 ref 断言）。
  - 回退：还原为四字段同值。

### M2 读边界放开

- [ ] T2.1 读取类工具去 workspace 守卫
  - 文件：`packages/agent-core/src/tools/tools/{read-file,grep,glob,list-directory}/executor.ts`。
  - 改动：对绝对路径不再调用 `guardWorkspacePath` 拒绝越界（仍解析相对路径相对 workspaceRoot、保留不存在/EISDIR 等错误处理）。`write-file`/`edit-file-diff`/`bash` 不动。
  - 验证：新增/更新对应 executor 测试：断言可读 workspace 外的临时文件；写类越界仍被拒。`pnpm --filter @actspace/agent-core test`。
  - 回退：恢复读取类的 `guardWorkspacePath` 调用。

- [ ] T2.2 安全文档同步
  - 文件：`docs/SECURITY.md`（「文件系统访问控制」节注明读取类放开 + 取舍）、`docs/design-docs/agent-core/权限设计规则和原则.md`（补读边界规则）、`docs/exec-plans/tech-debt-tracker.md`（登记「敏感路径 blocklist + 读审核」债务）。
  - 验证：`pnpm check:docs`（若该脚本校验文档链接/索引）；人工通读确认措辞与 `context-compression.md`「读边界放开」一致。
  - 回退：还原文档。

### M3 治疗层（历史压缩）

- [ ] T3.1 ConversationContext 区间替换能力
  - 文件：`packages/agent-core/src/context/modules/conversation.ts`。
  - 改动：新增 `replaceRange(keepRatio, summaryMessage)`（或 `compactOlderThan`），返回被替换的旧消息（供序列化），并保证切点落在完整工具配对之后、user 边界优先。
  - 验证：新增 `context/test/conversation-compact.test.ts`，覆盖配对不被拆开、keepRatio 边界、空历史不报错。`pnpm --filter @actspace/agent-core test`。
  - 回退：删除新增方法。

- [ ] T3.2 8 节摘要 prompt + HistoryCompactor
  - 文件：新增 `packages/agent-core/src/context/compression/history-prompts.ts`（ClaudeCode 8 节 system prompt + 开篇语常量）、`packages/agent-core/src/context/compression/history-compactor.ts`（序列化可压区 → `summarizer.summarizeHistory` → 合成 `UserMessage`（`source:"compaction"`）正文 = 开篇语 + 摘要 + `session.jsonl` 绝对路径）。
  - 验证：新增 `context/compression/test/history-compactor.test.ts`，用 MockLLMService 断言：摘要消息含 session.jsonl 路径、含开篇语、可压区被替换为单条、summarizer 失败时走兜底（丢弃最旧）。
  - 回退：删除新增文件。

- [ ] T3.3 ContextManager.compactIfNeeded + contextWindow 透传
  - 文件：`packages/agent-core/src/context/manager.ts`。
  - 改动：`createForSession` 接受并透传 `contextWindow`（来自 `modelSpec.contextWindow`）与 `sessionPath`（构造 ref 路径）；新增 `async compactIfNeeded(summarizer)`：判断 `estimateTotalTokens() ≥ contextWindow × compressionThreshold` 且距上次压缩 ≥ `compactMinIntervalCalls`，命中则调 HistoryCompactor 并 `compressionCount++`。
  - 验证：新增 `context/test/manager-compact.test.ts`，覆盖阈值触发/不触发、最小间隔抑制、压缩后 token 下降。`pnpm --filter @actspace/agent-core test`。
  - 回退：还原 `manager.ts`。

- [ ] T3.4 loop maybeCompact 钩子接入
  - 文件：`packages/agent-core/src/engine/types.ts`（`AgentLoopConfig` 增 `maybeCompact?: () => Promise<void>`）、`packages/agent-core/src/engine/loop.ts`（每次 `streamAssistantResponse` 前 `await config.maybeCompact?.()`，并在压缩后重新 `getContext` 刷新 `context.messages`）、`packages/agent-core/src/engine/agent.ts`（把 `() => contextManager.compactIfNeeded(summarizer)` 作为 `maybeCompact` 传入，并在压缩后同步 context 引用）、`engine/create-agent-deps.ts`（把 summarizer 传到 Agent）。
  - 验证：新增 `engine/test/loop-compaction.test.ts`，构造超阈值历史 + MockLLMService，断言模型调用前触发压缩、压缩后续跑不报错、配对完整。`pnpm --filter @actspace/agent-core test`。
  - 回退：移除钩子字段与调用，loop 行为回到无压缩。

### M4 观测

- [ ] T4.1 压缩观测落 run-log + 可选事件
  - 文件：`packages/agent-core/src/context/compression/history-compactor.ts`（emit 压缩元数据）、`packages/agent-core/src/engine/bridge.ts`（把压缩元数据写 run-log，并按 T0.4 生成 `context_compaction` SessionEvent 追加到 `sessionEvents`）。
  - 验证：`pnpm --filter @actspace/agent-core test`（bridge 测试断言压缩事件出现）；手工跑一次长会话 turn 看 `logs/agent-runs/*.jsonl` 出现压缩记录。
  - 回退：移除事件与 run-log 写入。

### M5（可选 / 后置）

- [ ] T5.1 溢出文件定时清理
  - 文件：新增 `packages/agent-core/src/tools/cleanup-tool-outputs.ts`（仿 `observability/agent-run-log.ts#cleanupOldAgentRunLogs`，删除 `<tmpRoot>/tool-output/` 下超 `maxAgeMs`（默认 7 天）文件）；在 `desktop/src/main/agent-turn.ts` turn 开始时调用。
  - 验证：新增 `tools/test/cleanup-tool-outputs.test.ts`，临时目录造新旧文件断言只删超期。`pnpm --filter @actspace/agent-core test`。
  - 回退：删除文件与调用点。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/agent-core test`
  - `pnpm --filter @actspace/agent-core typecheck`
  - `pnpm --filter @actspace/shared build`（契约改动后）
  - `pnpm --filter @actspace/desktop typecheck`（透传改动后）
  - `pnpm typecheck` + `pnpm test`（整仓收尾）
  - `pnpm check:docs`（文档同步后）
- 手工检查：
  - 跑一个会产生大 bash 输出（> 16000 字符）的 turn，确认 `<userData>/tmp/tool-output/<sessionId>/` 出现全量文件，且模型回填文本带「已压缩摘要」标记 + 落盘路径；再跑一个小 bash 输出，确认原样穿透、无落盘、无压缩标记。
  - 让模型 `read_file` 读该落盘路径与 `session.jsonl`，确认 workspace 外也能读到（M2 生效）。
  - 构造长会话直到 token 水位过 85%，确认出现一条 `source:"compaction"` 的合成消息，含 8 节摘要与 `session.jsonl` 路径，且后续 turn 正常。
- 观测检查：
  - `logs/agent-runs/*.jsonl` 中出现历史压缩记录（trigger token、前后消息数、摘要长度、ref 路径）。
  - 若实现 T4.1 事件：`session.jsonl` 出现 `context_compaction` 事件。

## 进度记录

- [ ] M0 契约与地基完成并 typecheck 通过。
- [ ] M1 预防层完成，工具输出测试通过，bash 落盘验收。
- [ ] M2 读边界放开完成，读类可读 workspace 外、写类仍守卫，安全文档同步。
- [ ] M3 治疗层完成，历史压缩按 token 水位触发、配对安全、ref 注入。
- [ ] M4 观测完成。
- [ ] （可选）M5 清理完成。
- [ ] 整仓 `pnpm typecheck` + `pnpm test` 通过，`current-module-map.md` 同步新增模块，落 history。

## 决策记录

- 2026-05-29：工具输出压缩用 flash 摘要而非确定性截断（截断成本低但效果差）；read/grep/glob/list_directory 用「高阈值穿透 + 行号保留 prompt」而非摘要，避免摘没逐字代码。
- 2026-05-29：仅 bash 落盘全量原文；其他工具可重读/重跑复现，不落盘。
- 2026-05-29（修正）：bash 落盘门槛独立且更高（`bashOverflowThreshold` 默认 16000），与摘要同一门槛触发，低于则原样穿透——小输出落盘无意义；Skill 未规定落盘阈值，由本设计确定。
- 2026-05-29（修正）：把原 `READ_HARD_CAP`(200k)/`SUMMARY_INPUT_CAP`(64k) 合并为单个 `absoluteMaxChars`(默认 100000，对齐 Skill `context-compressor.ts`)，作为所有工具送 flash 前的输入上限。
- 2026-05-29（修正）：极限截断改为头尾保留（head 70% + 中间省略标记 + tail 30%），优于 Skill 示例的纯掐头——bash 报错/exit 常在尾部。
- 2026-05-29（修正）：所有被 flash 摘要的工具输出，回填前一律加压缩标记前缀，明确告知模型「这是压缩摘要、非原文、原文如何获取」；原样穿透的不加标记。
- 2026-05-29（修正）：bash `run-process` 捕获上限从 64000 调高到 256000，让落盘对大输出有意义。
- 2026-05-29：历史压缩在 mid-loop 每次模型调用前按 token 水位触发；完整历史 ref 指向 `session.jsonl`。
- 2026-05-29：取消读取类工具的 workspace 硬限制（写类保持守卫），以让「拼路径让模型回读」生效；敏感路径 blocklist + 读审核作为后续债务，不恢复 workspace 硬框。
- 2026-05-29：通用工具截断阈值默认 2000、读取类独立高阈值（默认 20000），均可配置。
