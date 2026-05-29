# 上下文压缩设计

本文是 actspace 主 Agent「上下文压缩」的长期设计事实来源。它回答：为什么压缩、压缩什么、在哪里压缩、压缩后如何恢复，以及哪些方案被排除。具体实施步骤见 `docs/exec-plans/active/20260529-context-compression.md`。

设计原则来源：`.agents/skills/llm-agent-dev/references/context/mgmt-compression.md`、`mgmt-token-strategies.md`、`references/tools/tool-scheduling.md`。

## 背景与现状缺口

actspace 的长期产品原则之一是「上下文的绝对控制」。但当前主 Agent 的压缩链路只有一处粗糙实现，且历史压缩完全缺位：

| 能力 | 现状 | 缺口 |
|---|---|---|
| 工具输出裁剪 | `tools/scheduler.ts#postProcess` 把渲染文本硬切到 `truncateThreshold`（默认 2000 字符），尾部与原文直接丢弃 | 无读取类极限保护、无落盘、无回读路径、无按工具语义保留关键信息 |
| Bash 输出 | `run-process` 内存上限 64000 字符 → scheduler 再切到 2000 | 全量结果无处可查，模型无法回看 |
| 历史压缩 | `ContextManager.needsCompression()` 存在但从未被调用，无 `compact()` 方法，`compressKeepRatio` 配置闲置 | 主 Agent 没有任何历史压缩，长会话会撑爆窗口 |
| 上下文窗口 | `ContextManager` 默认 `contextWindow=200_000`，`createForSession` 不传 config | 与 `modelSpec.contextWindow`（DeepSeek 1_000_000 / Kimi 256_000）脱节，阈值判断不准 |
| tmp 目录 | `<userData>/tmp` 已由 `main/index.ts` 创建并经 `AppDataRoots.tmpRoot` 传到 `agent-turn.ts` | 未透传进 agent-core，工具拿不到落盘目录 |

`packages/shared/src/session.ts` 的 `ToolExecutionResult` 已预留 `rawOutput` / `truncatedOutput` / `modelOutput` / `rawOutputRef: { kind: "inline" | "file" }` 四个字段，但 `engine/bridge.ts#createToolExecutionResult` 当前把它们都填成同一份截断文本。本设计正好把这四个字段填出真实语义。

## 设计目标与非目标

目标：

1. 工具输出在回填上下文前被合理压缩，且压缩后保留「关键锚点 + 可回读路径」。
2. 长会话在 token 水位达到阈值时自动压缩历史，压缩结果拼接完整历史文件路径，模型可按需回看。
3. 压缩用快速廉价模型（`deepseek-v4-flash`）执行，并在不可用时有确定性兜底。
4. 复用 shared 已有的 `ToolExecutionResult` 四字段语义与 `CompressionConfig`，不另起一套契约。

非目标（本期不做）：

- 不做 token 移除策略的多策略选择器（中间/最旧/混合自适应）。第一期历史压缩只做「LLM 摘要 + 保留最近 N%」一种策略。
- 不做用户手动增删改上下文条目（属于 `token-usage-and-context-state.md` 的后续）。
- 不做溢出文件的强一致清理（定时清理列为最后里程碑、可选）。
- 不做敏感路径 blocklist 与读审核（仅记录为后续债务，见「读边界放开」）。

## 整体模型

压缩分为三个相互独立的机制，对应「预防」与「治疗」两层：

```
┌─ 预防层：每次工具执行后立即处理（OutputTruncator）──────────────┐
│  Tier-1  读取类极限保护（read/grep/glob/list_directory）：           │
│          原文 > READ_HARD_CAP → 头尾确定性硬截断（保护摘要模型输入）   │
│  Tier-2  通用压缩（所有工具）：渲染文本 > 工具类阈值 → flash 摘要        │
│          · bash 额外把全量原文落盘到 <userData>/tmp/tool-output/      │
│          · 按工具类型选 system prompt，保留行号/路径等关键锚点          │
└──────────────────────────────────────────────────────────────────┘
┌─ 治疗层：每次模型调用前检查 token 水位（HistoryCompactor）────────┐
│  总 token ≥ contextWindow × compressionThreshold → 压缩历史：          │
│  · 保留最近 compressKeepRatio 的消息（且切点落在完整工具配对之后）       │
│  · 旧消息用 flash 8 节结构化摘要替换                                   │
│  · 摘要尾部拼接该会话 session.jsonl 的绝对路径，模型可 read_file 回看    │
└──────────────────────────────────────────────────────────────────┘
```

不可压缩内容：系统提示词、规则、Skill 加载内容永不参与压缩，只有工具输出和会话历史是操作对象。

## 预防层：工具输出处理

### 分型与阈值

按工具语义分三类处理，避免「把逐字代码摘没」，且每类有独立的「摘要触发阈值」：

| 工具类型（`previewKind` / category） | 摘要触发阈值 | 超阈值处理 | 落盘 | 模型的恢复路径 |
|---|---|---|---|---|
| `read` / `grep` / `glob` / `directory_list` | `readTruncateThreshold`（默认 20000） | flash 摘要，prompt 要求**逐字保留行号、文件路径、匹配位置**，仅压缩重复/正文；加压缩标记 | 否 | `offset/limit` 翻页重读原文件 / 重跑搜索 |
| `bash` | `bashOverflowThreshold`（默认 16000） | flash 摘要（保留 exit code、报错行、关键输出）+ 落盘全量原文，摘要含落盘路径；加压缩标记 | **是**（同一门槛触发） | `read_file` 读落盘的全量原文 |
| `web_search` / `generic` / 其他 | `toolTruncateThreshold`（默认 2000） | flash 摘要（通用）；加压缩标记 | 否 | 重新搜索 / 抓取 |

要点：

- 读取类工具有自己的分页（`read_file` 默认 500 行 + `offset/limit`），常规读取很少全文，且 DeepSeek 1M / Kimi 256k 窗口能容纳；故其阈值（20000）显著高于通用阈值，让常规读取**逐字穿透、不被摘要**，只有极端大读取才触发摘要。
- **bash 落盘门槛独立且更高（16000）**：低于该值的 bash 输出直接原样穿透（既不摘要也不落盘）——小输出落盘无意义；高于该值才「摘要 + 落盘」同时发生。Skill 未规定落盘阈值（`tool-scheduling.md` 只描述「写临时文件 + 摘要含路径」技术），此门槛由本设计确定。

### bash 输出捕获上限

`tools/tools/bash/executor.ts` 当前 `MAX_OUTPUT_CHARS = 64_000`，即 bash 输出最多被捕获 64k，落盘文件也最多 64k。为让落盘对真正的大输出有意义，建议把该上限调高（默认 256_000）：`run-process` 捕获更多原文用于落盘，而回填上下文的仍是 flash 小摘要。该值可配置。

### 极限保护：absoluteMaxChars 头尾截断

所有工具在送入 flash 摘要前，先做确定性截断到 `absoluteMaxChars`（默认 100000，对齐 Skill），防止用超大输入撑爆摘要模型本身。这是确定性步骤、不调 LLM。

截断策略为**头尾保留**（优于 Skill 示例的纯掐头——bash 报错/exit 常在尾部，掐头会丢掉最关键信息）：

```text
headTailTruncate(text, cap):
  if len(text) <= cap: return text
  headLen = floor(cap * 0.7)
  tailLen = cap - headLen                      # 约 30%
  omitted = len(text) - cap
  return text[0:headLen]
       + `\n\n[... 中间省略 ${omitted} 字符（原始共 ${len(text)} 字符）...]\n\n`
       + text[len(text)-tailLen:]
```

- 头部保住命令/文件起始与上下文，尾部保住错误栈、exit code、结论。
- 截断后的文本再交给 flash 按工具类型摘要；被省略的中间段由「翻页重读 / 重跑 / bash 落盘文件」恢复。

### 压缩标记（所有被摘要的输出必加）

任何经过 flash 摘要回填给模型的工具结果，正文前必须拼一段**压缩标记**，让模型明确知道「这是压缩摘要、不是原文、原文如何获取」：

```text
[已压缩摘要 ⚠️ 原始输出 ${originalChars} 字符 → 以下为 flash 摘要，非完整原文。${recoveryHint}]
<摘要正文>
```

`recoveryHint` 按工具类型不同：

- read：`可用 offset/limit 翻页或重读原文件获取逐字内容`
- bash：`完整原文见 <落盘路径>，可用 read_file 读取`
- grep/glob：`可重跑搜索获取完整结果`
- web/generic：`可重新搜索/抓取获取完整内容`

未触发摘要（原样穿透）的输出不加该标记，避免误导模型以为内容被改过。

### Tier-2 通用压缩流水线

新增 `tools/output-truncator.ts`（异步纯函数），替换 `scheduler.ts#postProcess` 的一刀切。伪代码：

```text
processToolOutput(tool, renderedText, ctx):
  threshold = thresholdFor(tool.kind)      # read=20000 / bash=16000 / 其他=2000
  if len(renderedText) <= threshold:
      # 原样穿透：不摘要、不落盘、不加压缩标记
      return { modelOutput: renderedText, rawOutputRef: { kind: "inline", value: renderedText } }

  rawOutputRef = { kind: "inline", value: renderedText }

  # 仅 bash 落盘全量原文（与摘要同一门槛触发）
  if tool.kind == "bash":
      path = await overflowStore.write({ sessionId, turnId, toolCallId, toolName, content: renderedText })
      rawOutputRef = { kind: "file", value: path }

  # 极限保护：送 flash 前头尾截断到 absoluteMaxChars
  summaryInput = headTailTruncate(renderedText, absoluteMaxChars)

  summaryBody = summarizer
      ? await summarizer.summarizeToolOutput(tool.kind, summaryInput)   # flash + 按类型 prompt
      : headTailTruncate(renderedText, threshold)                       # flash 不可用时确定性兜底

  notice = compressedNotice(len(renderedText), recoveryHintFor(tool.kind, path))
  return {
    modelOutput: notice + "\n" + summaryBody,
    rawOutputRef,
  }
```

### OverflowStore（仅 bash）

新增 `tools/overflow-store.ts`：

- 落盘位置：`<userData>/tmp/tool-output/<sessionId>/<turnId>-<toolCallId>-<toolName>.txt`。
- 接口：`write({ sessionId, turnId, toolCallId, toolName, content }): Promise<string>`（返回绝对路径）。
- 仅在 bash 输出 `> bashOverflowThreshold` 时调用——其他工具的全量输出可由重读/重跑复现，小 bash 输出落盘也无意义。
- `tmpRoot` 由 `ToolManagerConfig` 注入（见「模块落点」）。

### 按工具类型的摘要 prompt

新增 `context/compression/tool-summary-prompts.ts`，按 `previewKind` 注册 system prompt：

- read：保留每个被保留片段的**行号前缀**、文件结构与关键符号/签名；折叠注释块与重复行；明确标注省略区间。
- grep/glob：保留**文件路径 + 行号 + 命中行原文**，压缩上下文行；保留命中总数。
- bash：保留 exit code、stderr/报错行、关键 stdout 行；显式带出落盘路径；丢弃噪声进度条。
- generic/web：通用摘要，保留结论性信息与链接。

每个 prompt 都硬约束输出长度上限（防止「摘要变扩写」）。

### 契约字段映射

`engine/bridge.ts#createToolExecutionResult` 改为如实区分（不再四字段同值）：

- `rawOutput`：渲染后的全量文本（Tier-1 截断前的、或落盘的原文）。
- `truncatedOutput` / `modelOutput`：回填给 LLM 的摘要（含 trailer）。
- `rawOutputRef`：bash 为 `{ kind: "file", value: path }`，其余为 `{ kind: "inline", value }`。
- `tokenEstimate`：基于 `modelOutput` 估算。

## 治疗层：历史会话压缩

### 触发位置与时机

在 `engine/loop.ts` 每次 `streamAssistantResponse` 之前插入一个可选 `maybeCompact` 钩子（保持 loop 仍是纯函数：钩子通过 `AgentLoopConfig` 注入）。这样单轮内大量工具调用也能在窗口溢出前压缩，符合 Skill「按 token 使用率动态触发，而非固定轮次」。

触发条件：`ContextManager.estimateTotalTokens() ≥ contextWindow × compressionThreshold`。`contextWindow` 取真实 `modelSpec.contextWindow`（需在 `createForSession` 透传 config）。同时设最小压缩间隔（默认 2 次模型调用），避免抖动反复触发。

### 压缩算法（HistoryCompactor）

新增 `context/compression/history-compactor.ts`，作用于 `ConversationContext` 的 `messages`：

1. 不动区 = 最近 `compressKeepRatio`（默认 0.3）比例的消息。
2. 可压区 = 其余较旧消息。**切点必须落在完整的 `assistant(toolCall) + 全部对应 toolResult` 配对之后、且尽量在 user 消息边界处**，避免把 `tool_calls` 与 `tool` 结果拆开导致 DeepSeek/Kimi OpenAI 格式报错。`llm/convert.ts` 已有孤儿兜底（跳过 error/aborted assistant、为孤儿 toolCall 插 synthetic toolResult），但压缩仍应主动切干净边界。
3. 把可压区序列化后调 `summarizer.complete()`，用 **ClaudeCode 8 节结构化摘要** prompt（主请求/意图、关键技术概念、文件与代码片段、错误与修复、问题解决、所有用户消息、待处理任务、当前工作）。8 节偏完整性，适合写代码场景。
4. 用一条合成消息替换可压区。合成消息为 `UserMessage`（`source: "compaction"`），正文 = 开篇语（「上下文已用结构化 8 节算法压缩，必要信息已保留」）+ 摘要正文 + **该会话 `session.jsonl` 绝对路径**（「完整历史见 `<path>`，可 `read_file` 读取」）。
5. `compressionCount += 1`，并 emit 观测事件（见「观测与持久化」）。

`compactKeepRatio` / `compressionThreshold` / `contextWindow` 复用并扩展 `context/types.ts` 的 `CompressionConfig`。

### 完整历史文件 = session.jsonl

压缩摘要拼接的「完整历史会话记录文件」直接指向该会话的 `session.jsonl`（`<userData>/sessions/<sessionId>/session.jsonl`）——它天生 append-only、durable，就是完整历史事实来源，无需额外导出增量快照文件。

已知局限：当前轮 mid-turn 产生的事件要到 turn 结束才由 `writeSessionResult` 落入 `session.jsonl`，所以摘要指向的 `session.jsonl` 完整到上一轮为止。但 mid-turn 的内容恰好是「最近、被 keepRatio 保留」的部分，不在可压区，影响很小。

### 廉价前置（可选优化）

超阈值时可先做一步零 LLM 成本的「工具消息裁剪」：把可压区里旧的 `toolResult` 正文替换为 `[结果已省略，见 rawOutputRef / session.jsonl]`，重算 token；若已降到阈值下就跳过 LLM 摘要。第一期可作为优化项实现，不作为核心路径的前置依赖。

## 读边界放开（read 类取消 workspace 限制）

为让「把绝对路径拼进上下文、模型按需 `read_file` 回读」真正生效，读取类工具不再被 `workspace-guard` 限制在 `workspaceRoot` 内（bash 落盘文件在 `<userData>/tmp/`、session.jsonl 在 `<userData>/sessions/`，都在 workspace 之外）。

边界：

- 放开：`read_file` / `grep` / `glob` / `list_directory` 四个**读取类**工具，允许读取 workspace 之外的路径。
- 不放开：`write_file` / `edit_file` / `bash`（写类）继续受 `guardWorkspacePath` 守卫，写操作不得逃逸 workspace。
- 路径不存在/越权等错误处理保留。

安全权衡（必须在实现时同步更新 `docs/SECURITY.md` 与 `docs/design-docs/agent-core/权限设计规则和原则.md`）：

- 放开读边界后，模型理论上可读任意本机文件（含 `~/.ssh`、密钥文件等）。这是本期明确接受的取舍：用「读不应被 workspace 硬框」换「可回读 Agent 内部产物」。
- 后续应补「敏感路径 blocklist + 按需读审核」来收口（记入 `docs/exec-plans/tech-debt-tracker.md`），而不是恢复 workspace 硬限制。

## 配置与阈值

扩展 `context/types.ts` 的 `CompressionConfig` 与新增工具侧配置：

| 配置 | 默认 | 说明 |
|---|---|---|
| `contextWindow` | `modelSpec.contextWindow` | 历史压缩按真实窗口判断，不再写死 200k |
| `compressionThreshold` | 0.85 | 历史压缩触发比例（大窗口模型可调高） |
| `compressKeepRatio` | 0.3 | 历史压缩保留最近比例 |
| `compactMinIntervalCalls` | 2 | 两次历史压缩之间的最小模型调用间隔 |
| 通用阈值 `toolTruncateThreshold` | 2000 字符 | web/generic 超此值即 flash 摘要 |
| 读取类阈值 `readTruncateThreshold` | 20000 字符 | read/grep/glob/list 超此值才摘要，让常规 500 行读取逐字穿透 |
| bash 阈值 `bashOverflowThreshold` | 16000 字符 | bash 超此值才「摘要 + 落盘」，低于则原样穿透 |
| `absoluteMaxChars` | 100000 字符 | 任意工具送入 flash 前的头尾截断上限（对齐 Skill） |
| bash 捕获上限 `MAX_OUTPUT_CHARS` | 256000 字符（建议从 64000 调高） | `run-process` 捕获的 bash 输出上限，决定落盘文件最大体积 |

成本/延迟提示：通用 `toolTruncateThreshold=2000` 会让多数 web/generic 输出触发一次 flash 摘要，给工具密集 turn 叠加额外往返；读取类与 bash 用独立的更高阈值规避「小输出也被摘要/落盘」。所有阈值可配置，后续按实测调整。

读取类阈值取 20000 的理由：`read_file` 默认 500 行 + `offset/limit` 分页，常规读取很少全文；即便模型一次性大读取，20000 字符（约 5.7k token）相对 DeepSeek 1M / Kimi 256k 窗口仍可接受，故让其逐字穿透、不被摘要。

摘要模型：统一用 `deepseek-v4-flash`，通过独立的 `summarizer` LLMService（由 `MODEL_REGISTRY["deepseek-v4-flash"]` + env 构造，复用 `buildLLMConfig`）。无 DeepSeek key 时 `summarizer` 为空：工具侧退化为确定性头尾截断；历史侧退化为「廉价前置工具消息裁剪 + 丢弃最旧可压消息」。

## 模块落点与契约改动

新增：

- `packages/agent-core/src/tools/overflow-store.ts`：bash 全量落盘。
- `packages/agent-core/src/tools/output-truncator.ts`：Tier-1/Tier-2 流水线（异步）。
- `packages/agent-core/src/context/compression/tool-summary-prompts.ts`：按工具类型的摘要 prompt。
- `packages/agent-core/src/context/compression/history-compactor.ts`：历史压缩。
- `packages/agent-core/src/context/compression/history-prompts.ts`：8 节摘要 prompt。
- `packages/agent-core/src/context/compression/summarizer.ts`：flash `summarizer` 构造与 `summarizeToolOutput` / `complete` 封装。

改动：

- `tools/scheduler.ts`：`postProcess` 改为 `async`，调用 `output-truncator`；`runHandler` await 之。`ToolSchedulerConfig` 增加 `overflowStore` / `summarizer` / `sessionMeta`。
- `tools/manager.ts` + `tools/types.ts`：`ToolManagerConfig` 增加 `tmpRoot` / `sessionId` / `summarizer`。
- `context/types.ts`：扩展 `CompressionConfig`。
- `context/manager.ts`：`createForSession` 透传 `contextWindow` 与 `sessionPath`（供 ref）；新增 `compactIfNeeded(summarizer)`。
- `context/modules/conversation.ts`：新增按区间替换消息的能力（供 compactor）。
- `engine/loop.ts` + `engine/types.ts`：`AgentLoopConfig` 增加 `maybeCompact?`，在每次模型调用前 await。
- `engine/agent.ts`：把 `contextManager.compactIfNeeded` 包成 `maybeCompact` 传入 loop。
- `engine/create-agent-deps.ts`：`buildAgentConfig` 增加 `tmpRoot` / `sessionId` 入参并填 `ToolManagerConfig`；构造 `summarizer`。
- `engine/bridge.ts`：`createToolExecutionResult` 如实填四字段。
- `desktop/src/main/agent-turn.ts`：把 `roots.tmpRoot` + `input.sessionId` 透传进 `buildAgentConfig`。
- 读取类四工具 executor + `workspace-guard`：放开读边界。

## 观测与持久化

- 历史压缩发生时写 `logs/agent-runs/*.jsonl`（run-log），记录 trigger token、压缩前后消息数、摘要长度、ref 路径。
- 可选新增 `context_compaction` `SessionEventType`（`@actspace/shared/session.ts`），payload 含上述字段，写入 `session.jsonl` 便于回溯。`ContextUsageSnapshot.compressionCount` 已存在，沿用。
- bash 落盘文件路径进入 `ToolExecutionResult.rawOutputRef`，前端「工具结果」可据此提供「查看完整输出」入口（前端改动不在本期范围，仅留契约）。

## 对 DeepSeek prompt cache 的影响

历史压缩会改写请求前缀，使 DeepSeek prompt cache 命中失效。但压缩只在 token 水位 ≥ 85% 时偶发，且能换来后续多轮请求重新进入稳定前缀，整体收益为正。工具输出摘要发生在 messages 尾部，对系统提示词/工具定义等高复用前缀无影响。

## 被排除的方案

- **每个工具输出都跑 LLM 摘要、读取类也摘要**：会把代码/行号摘没，破坏模型可用性；读取类改为「高阈值穿透 + 行号保留 prompt + 翻页回读」。
- **所有工具都落盘**：grep/glob/web 可重跑复现，落盘只增加 tmp 垃圾与清理负担；只 bash 落盘，且落盘门槛（16000）独立于摘要门槛，小 bash 输出不落盘。
- **纯掐头截断（Skill 示例做法）**：`slice(0, cap)` 会丢掉尾部，而 bash 报错/exit、文件结尾往往在尾部；改为头尾保留（head 70% + tail 30%）。
- **bash 摘要/落盘共用通用 2000 阈值**：2000 太小，会让小 bash 输出也被摘要+落盘，无意义；bash 用独立 16000 门槛。
- **用 workspace 白名单放行 tmp/session 目录**：比直接放开读边界更绕，且与「读不应被 workspace 硬框」的产品取向相悖；改为放开读类 + 后续 blocklist。
- **历史压缩只在 turn 之间触发**：单轮工具风暴仍会溢出；改为 mid-loop 模型调用前触发。
- **为历史压缩单独导出增量快照文件**：`session.jsonl` 已是完整历史，单独导出多一套生命周期；摘要直接指向 `session.jsonl`。
- **多策略 token 移除选择器（中间/最旧/混合自适应）**：第一期复杂度过高，先做单一「摘要 + 保留最近 N%」策略，留待后续。

## 关联文档

- `token-usage-and-context-state.md`：token 估算、`context_snapshot`、`context-state.json` 的数据分层。
- `storage-and-observability.md`：`<userData>/tmp`、`session.jsonl`、run-log 边界。
- `kairos-autonomous-mode.md` + `kairos/compression/`：Kairos 短期记忆压缩，prompt 风格可借鉴但与主 Agent 解耦。
- `tool-preview-design-guidelines.md`：`previewKind` 与 `ToolUiPreview` 契约（分型依据）。
- `权限设计规则和原则.md` / `SECURITY.md`：读边界放开需同步更新。
