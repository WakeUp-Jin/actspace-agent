# 工具输出、文件引用与图片输入

当前 v2 契约；历史 Bash 设计的核心原则继续有效：输出有界、完整结果可回读，超过内联阈值不等于执行失败。

## Bash 输出

`packages/shell/tool-shell/src/node-ports.ts` 执行期间持续写输出文件，内存头部上限为 8,000 字符；磁盘上限继续由 Bash runner 控制。短输出直接内联，长输出保留头部与总长度，并通过 `createArtifact` 保存完整 `text/plain` 文件。磁盘安全阀命中时明确标记截断，不能称其为无限完整输出。

工具 Journal 保存 `text + artifact`，artifact 包含 ID、MIME、大小、SHA-256，所有权由 Host store 记录。Agent Loop 在每次请求组装时通过 Host 的 `resolveArtifact(sessionId, artifactId)` 解析本会话文件，形成完整路径与 `read_file offset/limit`、`grep path/pattern` 引导，不自动展开全文。解析结果也进入本次 `request/context`，历史工具事实保持不变。

这使既有 v2 Journal 的大输出引用可以直接恢复，不需要重写旧日志。文件被删除、损坏或不属于该 Session 时返回明确的不可用提示，不把文件引用误当成图片，也不自动重跑可能有副作用的命令。

读取类工具对工作区文件维持原规则；仅对本 Session 拥有、通过 Host metadata/digest/realpath 校验的 artifact 文件增加精确读取与搜索例外。写入、删除和目录遍历不因此获得工作区外权限。Desktop 与 CLI 使用相同解析接口，ephemeral CLI 的文件生命周期仍随运行结束。

## 工具结果的体积上限

一条工具结果有两个硬约束：会话记录单条事件不超过 1 MiB（`session-journal` 的 `MAX_JSON_BYTES`），以及它要和后面的请求一起放进模型的上下文窗口。自动压缩不压最后一批工具结果，所以这一批放不进窗口时，压缩救不回来，之后每次请求都会被容量检查拦下。上限分四层，每一层只管自己知道的事：

| 层 | 位置 | 管什么 |
|---|---|---|
| 工具自己 | 各工具的 `node-ports.ts` | 知道怎么截才有用：按整行截、写明下一次从哪里读 |
| tool-runtime 兜底 | `tool-runtime/src/output-limits.ts` 的 `boundToolResult` | 任何工具（含插件贡献的工具）的一条结果都写得进会话记录 |
| 按窗口的批次额度 | `agent-loop/src/tool-output-budget.ts`、`tool-runtime` 的 `ToolOutputBudget` | 这一批结果合计放得进上下文窗口 |
| 回合收尾 | `session-persistence/src/recovery.ts` 的 `settleOpenTurnWork` | 前三层都没拦住、一条记录没写进去时，会话不卡死 |

### 工具自己的上限

| 工具 | 上限 | 超出时 |
|---|---|---|
| `read_file` | 输出 64,000 字符；单行 2,000 字符；图片 25 MiB | 停在整行上，尾注写明下一次的 `offset`；超长的行只留开头并写明被截了几行；开头 8 KB 含 NUL 字节的按二进制拒绝（`BINARY_FILE`）；图片过大返回 `IMAGE_TOO_LARGE` |
| `list_directory` | 输出 64,000 字符 | 尾注写明显示了多少条、一共多少条 |
| `write_file`、`edit_file` | diff 64,000 字符；单行 2,000 字符 | diff 截短并说明文件已完整写入；增删行数是按全文算的真实值 |
| `grep`、`glob` | 64,000 字符；100 / 200 条结果 | 尾注提示缩小搜索范围 |
| `web_fetch` | 正文 50,000 字符；响应 5 MiB | 正文截短并写明原长度；响应过大返回 `WEB_FETCH_TOO_LARGE` |
| Bash | 内联 8,000 字符 | 见上一节，完整输出存成文件 |

`read_file` 按需流式读取，不再把整个文件读进内存。界面上的 diff 卡片和目录条目数读结果的 `detail`（真实的增删行数、条目总数），不从给模型的文本里解析，所以文本被截短不影响界面上的数字。

64,000 和 2,000 这两个数由 `@actspace/tool-runtime` 导出（`TOOL_OUTPUT_TEXT_CHARS`、`TOOL_OUTPUT_LINE_CHARS`），新工具直接用，不各写一份。

### tool-runtime 兜底

`PreparedToolExecution.finalize()` 在结果提交前调用 `boundToolResult`。量法和会话记录一样：各部分序列化成 JSON 之后的 UTF-8 字节数。

| 部分 | 上限 | 超出时 |
|---|---|---|
| `modelOutput` | 256 KiB | 文本和 json 块合并后保留开头（尽量停在整行上），完整输出存成会话拥有的 `text/plain` 文件，结果末尾加一句 `[Output truncated: …]` 说明和这个文件的引用 |
| `detail` | 256 KiB | 逐块处理，放不下的块换成一句说明，后面放得下的小块照常保留 |
| `renderer.props` | 64 KiB | 整个去掉，界面退回通用工具卡片 |
| `summary`、`failure.message` | 各 16 KiB | 保留开头 |

几项加起来约 608 KiB，一条 `tool/result` 写得进去。兜底不改结果的状态和失败码：走到这里时副作用已经发生，把成功改成失败只会让模型重做一遍。完整输出没能保存时照样截短，说明里写明没有保存。

工具自己的上限远低于这里。这一层是给没有自己设限的工具准备的，正常输出不会被截第二次。

### 按窗口的批次额度

模型一次回复里的全部工具调用是一批。Agent Loop 在执行这一批之前算出它合计能给模型多少字符，取两个限制里小的那个：

- **现在还剩多少**：窗口 − 留给下一次回复的 − 已经占用的。这样即使压缩没成功，下一次请求也发得出去。
- **压缩之后可用空间的一半**：（窗口 − 留给下一次回复的 − 压缩后仍然留着的）÷ 2。压缩后仍然留着的是系统提示词、工具定义和发出这一批调用的那条助手消息；另一半留给摘要和后面的步骤。

其中：

- 留给下一次回复的 = 请求指定的最大输出 token 数与 16,000 中大的那个；窗口不到 64,000 时把 16,000 换成窗口的四分之一。
- 已经占用的 = 发出这一批调用的那次请求的估算输入加上助手消息，与 Provider 报的输入加输出用量中大的那个。
- token 和字符的换算用上下文估算的同一个比例（4 个字符 1 token，`@actspace/shared` 的 `CHARS_PER_TOKEN`）。
- 模型的窗口大小未知时不设额度，只受上一层的字节上限约束。

额度经 `ToolPreparedEnvironment.modelOutputBatchChars` 传给 tool-runtime，一批内部由 `ToolOutputBudget` 分配：调用按出结果的先后来取，先出结果的可以用剩下的全部额度，只给每个还没出结果的调用留一份（8,000 字符；剩下的不够这样留时平分）。不按调用数平分，是因为一批里常常只有一两个大结果，平分会把它们截短，而其他调用根本用不完自己那份。没到工具体就结束的调用（参数不合法、被拒绝）不占额度。超出额度的结果和上一层一样截短并转存完整输出，说明里写的是窗口放得下多少；额度再小，一条结果也保留 2,048 字符，放得下说明、文件引用和一小段开头。

已知限制：

- 4 个字符 1 token 对中文这类文字偏低（一个汉字通常就占 1 个 token 左右）。额度和容量检查、自动压缩用的是同一个估算器，以中文为主的大输出仍可能比估算的多占窗口。Provider 报了用量时「已经占用的」是准的，偏差只在这一批新结果上。改估算器会同时影响上下文面板、自动压缩和容量检查，没有放在这里做。
- 并行调用谁先出结果由执行快慢决定，一批整体超出额度时，各调用被截到多长不是固定的。

### 回合收尾

一条记录没写进去时（超过 1 MiB 的助手消息或工具调用参数、数据里带被禁止的敏感字段名、钩子抛错），这个回合里已经开始的请求和工具调用没有结果，`step/end` 和 `turn/end` 写不了，同一个会话之后每条消息都会报 `Cannot start Turn … while … is open`。Agent Loop 的失败处理现在先调用 `settleOpenTurnWork`：按崩溃恢复的同一套分类把这个回合里没有结果的请求和工具调用了结，再正常写 `step/end` 与带失败原因的 `turn/end`。这个回合失败，会话可以继续用。它只读这个回合 `turn/start` 之后的记录，工作量不随会话长度增长。

## 三种表示

| 层 | 普通文件 | 图片 |
|---|---|---|
| Journal / Surface | 带 MIME 的 artifact 引用 | 带 MIME 的 artifact 引用 |
| LLM logical request / snapshot | 元信息、可读路径与检索提示 | `image` block，只有 artifactId、mimeType、alt |
| Provider wire | 有界文本，不自动读全文 | 此时才读取字节并编码为协议要求的图片内容 |

`artifact` 是存储引用，不是媒体类型。Core 只有在 MIME 是 `image/*` 时才生成逻辑 image block。Provider 的支持格式、文件签名和请求体上限仍由图片适配器校验。

## 工具图片与协议

- OpenAI Chat Completions / Responses：保留原工具文本结果与 call ID，在同一批所有 tool results 之后追加 user visual observation。不能在并行调用的结果中间插入 user 消息。
- Anthropic：保留 `tool_result` 内的结构化 text + image。
- pi-ai 直连与 legacy proxy 两条适配路径遵循同一角色归一化规则；字节只在 wire adapter 读取。
- text-only 模型得到明确“无法看图”的元信息与按需 `inspect_image` 提示，不触发隐式视觉模型调用。
- 图片历史的选择/压缩仍属于 Context 策略；本修复不引入自动删除图片历史或额外图片预算。

## 失败事实

失败回合的 `turn/end` 可携带脱敏、有界的 `failure`。运行时通知与 durable renderer projection 消费同一原因；重新加载 Session 后仍可显示错误。旧 `reason=failed` 没有 failure 时显示通用失败提示，不猜测原始原因。错误不是模型文本，不加入 Surface。

## 验证入口

- `tool-fs-read`、`tool-fs-write` 的 `node-ports.test.ts`：3 MB 单行文件、超大 `limit`、二进制文件、5 万条目目录、超大 diff。
- `tool-runtime` 的 `output-limits.test.ts`、`runtime.test.ts`：各部分的字节上限、完整输出转存、`ToolOutputBudget` 的分配、一批调用合计不超过额度。
- `agent-loop` 的 `tool-output-budget.test.ts`：额度的算法；小窗口下一批并行读取被截短后下一次请求仍然发得出去。
- `agent-loop` 的 `turn-settlement.test.ts`、`session-persistence` 的 `recovery-fork.test.ts`：一条记录写入失败后回合闭合、会话可以继续。
- Core `output-references.test.ts`：普通文件不变图片、失败原因脱敏并持久化。
- Desktop `runtime-v2-output-reference-flow.test.ts`：真实大 Bash 输出、下一次请求路径、末尾分页/搜索、跨会话拒绝。
- pi-ai `tool-images.test.ts`：并行调用顺序、三个协议、两条适配路径与 text-only 行为。
- Desktop `runtime-v2-fixed-renderer-projection.test.ts`：新旧失败记录恢复为错误块。
