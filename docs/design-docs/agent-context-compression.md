# 上下文压缩设计

本文是 actspace 主 Agent「上下文压缩」的长期设计事实来源。它回答：为什么压缩、压缩什么、在哪里压缩、压缩后如何恢复，以及哪些方案被排除。具体实施步骤见 `docs/exec-plans/active/20260529-context-compression.md`。

设计原则来源：`.agents/skills/llm-agent-dev/references/context/mgmt-compression.md`、`.agents/skills/llm-agent-dev/references/context/mgmt-token-strategies.md`、`.agents/skills/llm-agent-dev/references/tools/tool-scheduling.md`。

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
- 不做用户手动增删改上下文条目（属于 `agent-token-usage-and-context-state.md` 的后续）。
- 不做溢出文件的强一致清理（定时清理列为最后里程碑、可选）。
- 不做敏感路径 blocklist 与读审核（仅记录为后续债务，见「读边界放开」）。

## 整体模型

压缩分为三个相互独立的机制，对应「预防」与「治疗」两层：

```
┌─ 预防层 A：bash 流式落盘（在 run-process 内，不进 flash 流水线）──────┐
│  执行期把输出流式写盘（内存只留 ≤ headBufferCap 的头部缓冲）           │
│  · ≤ bashInlineThreshold → 不落盘，头部缓冲即全部，原样 inline         │
│  · > bashInlineThreshold → 落盘全量（≤ bashDiskCap），回填头部+文件路径 │
└──────────────────────────────────────────────────────────────────┘
┌─ 预防层 B：非 bash 工具 flash 摘要（OutputTruncator）────────────────┐
│  渲染文本 > 工具类阈值 → flash 摘要（送入前 absoluteMaxChars 头尾截断） │
│  · 按工具类型选 system prompt，保留行号/路径等关键锚点                  │
│  · 回填前加压缩标记；恢复路径 = offset/limit 翻页 / 重跑               │
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

bash 与非 bash 工具走两条不同的路径——bash 用流式落盘 + 头部截断（确定性、无 flash），非 bash 用 flash 摘要：

| 工具类型（`previewKind` / category） | 触发阈值 | 超阈值处理 | 落盘 | 模型的恢复路径 |
|---|---|---|---|---|
| `bash` | `bashInlineThreshold`（默认 4000） | **流式落盘** + 回填**逐字头部 4000 字符** + 截断标记 + 文件路径（**不调 flash**） | **是**（> 阈值才保留文件） | `read_file` 读落盘的全量原文（配 offset/limit） |
| `read` / `grep` / `glob` / `directory_list` | `readTruncateThreshold`（默认 20000） | flash 摘要，prompt 要求**逐字保留行号、文件路径、匹配位置**，仅压缩重复/正文；加压缩标记 | 否 | `offset/limit` 翻页重读原文件 / 重跑搜索 |
| `web_search` / `generic` / 其他 | `toolTruncateThreshold`（默认 2000） | flash 摘要（通用）；加压缩标记 | 否 | 重新搜索 / 抓取 |

要点：

- **bash 不用 flash**：其全量原文已在磁盘且可逐字翻页，头部通常最有用（命令回显/前段输出/报错），逐字头部 + 文件路径比摘要更可信，也省掉每次 bash 都叫一次 flash 的延迟与成本，避免 flash 把日志里的精确数字/路径摘错。flash 摘要只服务「重跑才能恢复、且适合摘要」的 read/grep/glob/web/generic。
- 读取类工具有自己的分页（`read_file` 默认 500 行 + `offset/limit`），常规读取很少全文，且 DeepSeek 1M / Kimi 256k 窗口能容纳；故其阈值（20000）显著高于通用阈值，让常规读取**逐字穿透、不被摘要**，只有极端大读取才触发 flash 摘要。

### bash 流式落盘（核心）

问题：bash 输出大小不可控，若像现在的 `run-process` 那样在内存变量里累加全量字符串，长输出会吃光内存（把内存上限调大只是把问题推后，治标不治本）。

方案：在 `tools/subprocess/run-process.ts` 增加一个**流式落盘 sink**，bash 使用它，**根本不在内存里累加全量**：

1. **执行期**：内存只保留一个有界**头部缓冲**（`bashInlineThreshold`，默认 4000 字符）+ 一个总字节计数器。
   - 输出 ≤ 4000：头部缓冲即全部内容，**不创建任何文件**。
   - 输出 > 4000：从超出那一刻起**懒创建临时文件并流式写盘**：`<userData>/tmp/tool-output/<sessionId>/<turnId>-<toolCallId>-bash.txt`。
   - 内存占用恒定 ≈ 头部缓冲大小，与输出总量无关。
2. **磁盘安全阀**：写盘硬上限 `bashDiskCap`（默认 5MB，远大于内存阈值），防跑飞命令撑爆磁盘；超过即停写并标记 `truncated`。`timeout` 仍生效。这是唯一的"硬限制"，且落在磁盘而非内存。
3. **执行后构造工具输出**（在 `tools/tools/bash/executor.ts` / `render-result.ts`）：
   - 未落盘（≤ 4000）：直接 inline 全部内容，无截断标记。
   - 已落盘（> 4000）：工具输出 = 逐字头部 4000 字符 + 截断标记（含「显示前 4000/共 N 字符，完整原文见 `<path>`，可 read_file 读取」）+ 文件路径。
   - 「inline 后删小文件」由「小输出根本不落盘」天然实现，无小文件残留；只有大输出文件被保留，交 M5 清理。

`BashResult` 增加 `stdoutFilePath?` / `outputTruncated` 字段，供 bridge 填 `rawOutputRef`（大输出为 `{ kind:"file" }`）。`tmpRoot` 由 `ToolManagerConfig` 注入。

### 极限保护：absoluteMaxChars 头尾截断（仅非 bash 工具）

非 bash 工具在送入 flash 摘要前，先做确定性截断到 `absoluteMaxChars`（默认 100000，对齐 Skill），防止用超大输入撑爆摘要模型本身。这是确定性步骤、不调 LLM。

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

- 头部保住文件/输出起始与上下文，尾部保住结论。
- 截断后的文本再交给 flash 按工具类型摘要；被省略的中间段由「翻页重读 / 重跑」恢复。

### 压缩标记

两条路径都必须让模型明确知道「内容不完整、原文如何取」，但形式不同：

- **flash 摘要（非 bash）**：正文前拼压缩标记 `[已压缩摘要 ⚠️ 原始 ${N} 字符 → 以下为 flash 摘要，非完整原文。${recoveryHint}]`。`recoveryHint`：read=`可用 offset/limit 翻页或重读原文件`；grep/glob=`可重跑搜索获取完整结果`；web/generic=`可重新搜索/抓取`。
- **bash 头部截断**：头部正文后拼截断标记 `[输出截断：显示前 ${N}/共 ${M} 字符，完整原文见 <path>，可 read_file 读取]`。

未触发任何压缩（原样穿透）的输出不加标记，避免误导模型以为内容被改过。

### 非 bash 工具压缩流水线（OutputTruncator）

新增 `tools/output-truncator.ts`（异步纯函数），替换 `scheduler.ts#postProcess` 的一刀切。**bash 不走此流水线**（bash 在 run-process/executor 自处理）。伪代码：

```text
processToolOutput(tool, renderedText, ctx):     # tool.kind != bash
  threshold = thresholdFor(tool.kind)            # read/grep/glob/list=20000 / 其他=2000
  if len(renderedText) <= threshold:
      return { modelOutput: renderedText, rawOutputRef: { kind: "inline", value: renderedText } }

  # 极限保护：送 flash 前头尾截断到 absoluteMaxChars
  summaryInput = headTailTruncate(renderedText, absoluteMaxChars)
  summaryBody = summarizer
      ? await summarizer.summarizeToolOutput(tool.kind, summaryInput)   # flash + 按类型 prompt
      : headTailTruncate(renderedText, threshold)                       # flash 不可用时确定性兜底
  notice = compressedNotice(len(renderedText), recoveryHintFor(tool.kind))
  return {
    modelOutput: notice + "\n" + summaryBody,
    rawOutputRef: { kind: "inline", value: renderedText },
  }
```

### 按工具类型的摘要 prompt（非 bash）

新增 `context/compression/tool-summary-prompts.ts`，按 `previewKind` 注册 system prompt：

- read：保留每个被保留片段的**行号前缀**、文件结构与关键符号/签名；折叠注释块与重复行；明确标注省略区间。
- grep/glob：保留**文件路径 + 行号 + 命中行原文**，压缩上下文行；保留命中总数。
- generic/web：通用摘要，保留结论性信息与链接。

每个 prompt 都硬约束输出长度上限（防止「摘要变扩写」）。bash 不在此注册表（不走 flash）。

### 契约字段映射

`engine/bridge.ts#createToolExecutionResult` 改为如实区分（不再四字段同值）：

- `rawOutput`：渲染后的全量文本（Tier-1 截断前的、或落盘的原文）。
- `truncatedOutput` / `modelOutput`：回填给 LLM 的摘要（含 trailer）。
- `rawOutputRef`：bash 为 `{ kind: "file", value: path }`，其余为 `{ kind: "inline", value }`。
- `tokenEstimate`：基于 `modelOutput` 估算。

## 治疗层：历史会话压缩

### 手动压缩入口（`/compact`）

除了自动 token 水位触发外，主聊天流支持手动 `/compact`：

1. Renderer 在 Composer 发送前识别 `text.trim() === "/compact"`，走 `context:compact` IPC，不创建 `user_message`，也不把 `/compact` 送入 LLM conversation。
2. Main Process 为当前 session 重新装配与普通 turn 相同的 Agent deps（含 `ContextManager`、`ToolManager`、summarizer 和 session path），调用 `compactContextWithAgent`。
3. `ContextManager.compactNow(summarizer)` 跳过 token 阈值和最小调用间隔检查，但仍复用 `HistoryCompactor` 的安全切点、结构化摘要和 fallback 逻辑。
4. 无可压区时返回 `skipped`，消息流显示 `Nothing to compact`；有可压区时写入 `context_compaction` 和最新 `context_snapshot`，刷新 `context-state.json`。

手动压缩是系统事件，不递增普通对话 `turnCount`，但会更新 session `updatedAt`，便于侧边栏按最近操作排序。

### 触发位置与时机

在 `engine/loop.ts` 每次 `streamAssistantResponse` 之前插入一个可选 `maybeCompact` 钩子（保持 loop 仍是纯函数：钩子通过 `AgentLoopConfig` 注入）。这样单轮内大量工具调用也能在窗口溢出前压缩，符合 Skill「按 token 使用率动态触发，而非固定轮次」。

触发条件：`ContextManager.estimateTotalTokens() ≥ contextWindow × compressionThreshold`。`contextWindow` 取真实 `modelSpec.contextWindow`（需在 `createForSession` 透传 config）。同时设最小压缩间隔（默认 2 次模型调用），避免抖动反复触发。

### 压缩算法（HistoryCompactor）

新增 `context/compression/history-compactor.ts`，作用于 `ConversationContext` 的 `messages`：

1. 不动区 = 最近 `compressKeepRatio`（默认 0.3）比例的消息。
2. 可压区 = 其余较旧消息。**切点必须落在完整的 `assistant(toolCall) + 全部对应 toolResult` 配对之后，且让不动区以 assistant turn 开头**——这样既不拆 `tool_calls`/`tool` 结果，又能与合成的 `UserMessage` 摘要天然形成 `user→assistant` 交替（Anthropic 格式要求严格交替，连续两条 user 会被拒；DeepSeek 默认走 Anthropic-compatible route，故不能让摘要 user 后紧跟另一条 user）。最近的 user 提问位于尾部、本就在不动区，不受影响。实现见 `ConversationContext.planCompaction`（找 target 之后第一条 assistant，兜底第一条非 toolResult）。`llm/convert.ts` 已有孤儿兜底，但压缩仍主动切干净边界。
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

安全权衡（必须在实现时同步更新 `docs/SECURITY.md` 与 `docs/design-docs/agent-权限设计规则和原则.md`）：

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
| bash 头部/落盘阈值 `bashInlineThreshold` | 4000 字符 | bash 超此值才落盘并回填头部 4000，低于则原样 inline、不落盘 |
| bash 磁盘硬上限 `bashDiskCap` | 5MB | `run-process` 流式写盘上限，防跑飞命令撑爆磁盘 |
| `absoluteMaxChars` | 100000 字符 | 非 bash 工具送入 flash 前的头尾截断上限（对齐 Skill） |

成本/延迟提示：通用 `toolTruncateThreshold=2000` 会让多数 web/generic 输出触发一次 flash 摘要，给工具密集 turn 叠加额外往返；读取类用更高阈值穿透；bash 全程不调 flash。所有阈值可配置，后续按实测调整。

读取类阈值取 20000 的理由：`read_file` 默认 500 行 + `offset/limit` 分页，常规读取很少全文；即便模型一次性大读取，20000 字符（约 5.7k token）相对 DeepSeek 1M / Kimi 256k 窗口仍可接受，故让其逐字穿透、不被摘要。

摘要模型：统一用 `deepseek-v4-flash`，通过独立的 `summarizer` LLMService（由 `MODEL_REGISTRY["deepseek-v4-flash"]` + env 构造，复用 `buildLLMConfig`）。无 DeepSeek key 时 `summarizer` 为空：工具侧退化为确定性头尾截断；历史侧退化为「廉价前置工具消息裁剪 + 丢弃最旧可压消息」。

## 模块落点与契约改动

新增：

- `packages/agent-core/src/tools/tool-output-paths.ts`：bash 落盘临时文件的路径构造 + 清理 helper（`<userData>/tmp/tool-output/`）。
- `packages/agent-core/src/tools/output-truncator.ts`：非 bash 工具的 flash 摘要流水线（异步）。
- `packages/agent-core/src/context/compression/tool-summary-prompts.ts`：按工具类型的摘要 prompt。
- `packages/agent-core/src/context/compression/history-compactor.ts`：历史压缩。
- `packages/agent-core/src/context/compression/history-prompts.ts`：8 节摘要 prompt。
- `packages/agent-core/src/context/compression/summarizer.ts`：flash `summarizer` 构造与 `summarizeToolOutput` / `complete` 封装。

改动：

- `tools/subprocess/run-process.ts`：增加流式落盘 sink（`outputFile` / `headBufferCap` / `diskCap` 选项），bash 用它替代内存累加；返回 `{ headBuffer, totalBytes, outputFilePath?, truncated }`。
- `tools/tools/bash/{executor.ts,render-result.ts}`：用流式 sink；按 `bashInlineThreshold` 决定 inline 全部 vs 头部 + 截断标记 + 路径；`BashResult` 增 `stdoutFilePath?` / `outputTruncated`。
- `tools/scheduler.ts`：`postProcess` 改为 `async`，对非 bash 工具调用 `output-truncator`；`runHandler` await 之。`ToolSchedulerConfig` 增加 `summarizer`。
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
- `context_compaction` `SessionEventType`（`@actspace/shared/session.ts`）写入 `session.jsonl`，便于回溯和恢复到主消息流。payload 保留 `triggerTokens`、`thresholdTokens`、`beforeCount`、`afterCount`、`summaryChars`、`historyRefPath`，并补充 `trigger: "manual" | "auto"`、`status: "compacted" | "skipped" | "failed"`、`removedCount`、`reductionRatio?`、`reason?`。旧事件缺新字段时按 `auto/compacted` 兼容。
- `RuntimeStreamEvent` 暴露 `context_compaction_started/progress/finished/failed` 生命周期，供 renderer 展示 pending、running 和完成/跳过/失败状态。
- bash 落盘文件路径进入 `ToolExecutionResult.rawOutputRef`，前端「工具结果」可据此提供「查看完整输出」入口（前端改动不在本期范围，仅留契约）。

## 对 DeepSeek prompt cache 的影响

历史压缩会改写请求前缀，使 DeepSeek prompt cache 命中失效。但压缩只在 token 水位 ≥ 85% 时偶发，且能换来后续多轮请求重新进入稳定前缀，整体收益为正。工具输出摘要发生在 messages 尾部，对系统提示词/工具定义等高复用前缀无影响。

## 被排除的方案

- **每个工具输出都跑 LLM 摘要、读取类也摘要**：会把代码/行号摘没，破坏模型可用性；读取类改为「高阈值穿透 + 行号保留 prompt + 翻页回读」。
- **所有工具都落盘**：grep/glob/web 可重跑复现，落盘只增加 tmp 垃圾与清理负担；只 bash 落盘，且小 bash 输出（≤ 4000）根本不落盘。
- **把 bash 内存上限调大（如 256k）**：内存里累加全量字符串是「内存被吃光」的根因，调大只是推后问题；改为流式写盘，内存恒定 ≤ headBufferCap（4000），磁盘才设 5MB 硬上限。
- **bash 也用 flash 摘要**：bash 全量已永久落盘且可逐字翻页，头部截断 + 文件路径比摘要更可信、零额外 LLM 延迟、不会摘错日志里的数字/路径；flash 只留给 read/grep/glob/web/generic。
- **纯掐头截断（Skill 示例做法）**：非 bash 工具送 flash 前的截断改为头尾保留（head 70% + tail 30%），避免丢掉文件/输出结尾。
- **用 workspace 白名单放行 tmp/session 目录**：比直接放开读边界更绕，且与「读不应被 workspace 硬框」的产品取向相悖；改为放开读类 + 后续 blocklist。
- **历史压缩只在 turn 之间触发**：单轮工具风暴仍会溢出；改为 mid-loop 模型调用前触发。
- **为历史压缩单独导出增量快照文件**：`session.jsonl` 已是完整历史，单独导出多一套生命周期；摘要直接指向 `session.jsonl`。
- **多策略 token 移除选择器（中间/最旧/混合自适应）**：第一期复杂度过高，先做单一「摘要 + 保留最近 N%」策略，留待后续。

## 关联文档

- `agent-token-usage-and-context-state.md`：token 估算、`context_snapshot`、`context-state.json` 的数据分层。
- `core-storage-and-observability.md`：`<userData>/tmp`、`session.jsonl`、run-log 边界。
- `agent-kairos-autonomous-mode.md` + `kairos/compression/`：Kairos 短期记忆压缩，prompt 风格可借鉴但与主 Agent 解耦。
- `agent-tool-preview-design-guidelines.md`：`previewKind` 与 `ToolUiPreview` 契约（分型依据）。
- `agent-权限设计规则和原则.md` / `docs/SECURITY.md`：读边界放开需同步更新。
