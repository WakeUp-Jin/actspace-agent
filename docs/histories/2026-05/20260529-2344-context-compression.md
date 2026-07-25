## [2026-05-29 23:44] | Task: 上下文压缩（预防层 + 治疗层 + 读边界放开 + 观测 + 清理）

### 🤖 Execution Context

- **Agent ID**: 本地 Cursor 协作
- **Base Model**: Claude Opus 4.8
- **Runtime**: Cursor Desktop（IDE 内 Agent）

### 📥 User Query

> 设计并实现主 Agent 的上下文压缩，分三块：
>
> 1. 工具压缩两层：第一层只针对读取类工具（大于阈值才压缩），第二层是所有工具输出大于阈值就压缩。
> 2. bash 工具执行结果写入文件，最终输出处判断很大时，把临时文件路径写进压缩结果，模型可按需回读；文件落 userData/tmp，并预留定时清理。后续追加澄清：**bash 无论多少都该流式落盘**，避免大输出把变量/内存吃满；小输出 inline、大输出只 inline 头部 + 文件路径。
> 3. 短记忆/历史会话大于阈值要压缩，压缩结果拼接完整历史记录文件（session.jsonl）路径再传给模型。
>
> 先设计方案与规范、再出执行计划，最后执行。并在计划里追加一项：把这次优秀的 bash 设计总结成 llm-agent-dev skill 的「修复文档」（当前归档到 docs/references/llm-agent-dev-skill-fixes/），先写修复文档不直接改 skill。

### 🛠 Changes Overview

**Scope:** `packages/agent-core`、`packages/desktop`、`packages/shared`、`docs/`

整体分两层：**预防层**（工具输出进上下文前裁剪）+ **治疗层**（历史会话过水位时压缩），配套读边界放开、观测落盘与临时文件清理。分 M0–M5 推进。

**Key Actions:**

- **M0 契约与地基**：`CompressionConfig` 扩展全部阈值并新增 `DEFAULT_COMPRESSION_CONFIG` 单一默认来源；`ToolManagerConfig` / `AgentDeps` 串入 `tmpRoot` / `sessionId` / `summarizer`；`shared/session.ts` 新增 `context_compaction` 事件类型与 payload。
- **M1 预防层**：新增 `Summarizer`（flash 摘要封装）、`output-truncator`（非 bash：超阈值先头尾确定性截断再 flash 摘要，失败回退截断）、`tool-output-paths`；`run-process` 支持流式落盘 sink（内存只留头部缓冲、超 `bashInlineThreshold` 懒落盘、达 `bashDiskCap` 停写标记 truncated）；bash executor/render 改为头部截断 + 文件路径回看；`ToolResult` 增 `outputRef`。压缩/截断都带显式标记。
- **M2 读边界放开**：`read_file` / `grep` / `glob` / `list_directory` 去掉 workspace 守卫，改用 `resolveReadablePath`（只解析不越界）+ `displayReadablePath`（越界结果显示绝对路径），以便回读 tmp 落盘文件与 session.jsonl；写类工具仍受 `guardWorkspacePath`。同步 `SECURITY.md`、权限原则文档、tech-debt-tracker。
- **M3 治疗层**：新增 `HistoryCompactor` + `history-prompts`（ClaudeCode 8 节摘要 prompt）；`ConversationContext.planCompaction` / `applyCompaction` 找安全切点（不动区以 assistant turn 开头，不拆 tool 配对、避免连续 user）；`ContextManager.compactIfNeeded` 按 token 水位 + 最小间隔触发；loop 在每次模型调用前 `maybeCompact`。
- **M4 观测**：压缩事件经 bridge 落 run-log，并生成 `context_compaction` SessionEvent 追加 session.jsonl（trigger/threshold token、前后消息数、摘要字符数、历史 ref）。
- **M5 清理**：`cleanupOldToolOutputs`（按 mtime 删超 7 天落盘文件 + 回收空会话目录），desktop 在 turn 起始 best-effort 调用。
- **文档**：`context-compression.md` 设计事实来源、执行计划全勾选、llm-agent-fix-plan 修复文档、current-module-map 同步。

### 🧠 Design Intent (Why)

- **两层分工**：预防层在源头控制单次工具输出体积（边际成本低、命中率高），治疗层只在历史确实超水位时才花一次 flash 调用，避免对每轮都做昂贵压缩。
- **bash 强制流式落盘**：把完整输出留在变量里会随大命令直接打爆内存（实测 run-process 触发内存上限），改为流式落盘 + 头部缓冲，小输出不碰盘、大输出只 inline 头部 + 路径，兼顾内存安全与可恢复。
- **读边界放开换可恢复性**：压缩把产物落在 workspace 之外（userData/tmp、session.jsonl），模型必须能回读这些 Agent 内部产物；用「读不被 workspace 硬框」换「可回读」，并把敏感路径 blocklist 记为后续技术债而非恢复硬限制。
- **切点以 assistant turn 开头**：合成摘要是 UserMessage，DeepSeek 默认走 Anthropic-compatible route 要求严格交替，不动区以 assistant 开头才能保证 user→assistant 交替且不拆 tool 配对。
- **显式标记 + 历史 ref**：压缩/截断都明确告诉模型「这里被压过、原文在哪」，避免模型把截断当完整事实。

### 📁 Files Modified

- `packages/agent-core/src/context/types.ts`
- `packages/agent-core/src/context/manager.ts`
- `packages/agent-core/src/context/token-estimator.ts`
- `packages/agent-core/src/context/modules/conversation.ts`
- `packages/agent-core/src/context/compression/{summarizer,tool-summary-prompts,history-prompts,history-compactor}.ts`
- `packages/agent-core/src/tools/{types,index,manager,scheduler,output-truncator,tool-output-paths,cleanup-tool-outputs}.ts`
- `packages/agent-core/src/tools/subprocess/run-process.ts`
- `packages/agent-core/src/tools/tools/bash/{executor,render-result,index}.ts`
- `packages/agent-core/src/internal-tools.ts`
- `packages/agent-core/src/engine/{types,loop,agent,bridge,create-agent-deps}.ts`
- `packages/desktop/src/main/agent-turn.ts`
- `packages/shared/src/session.ts`
- `docs/design-docs/model-context/agent-context-compression.md`
- `docs/design-docs/agent-runtime/agent-current-module-map.md`
- `docs/design-docs/execution-safety/agent-权限设计规则和原则.md`
- `docs/references/llm-agent-dev-skill-fixes/fix-llm-agent-*.md`
- `docs/SECURITY.md`、`docs/exec-plans/tech-debt-tracker.md`、`docs/exec-plans/active/20260529-context-compression.md`
