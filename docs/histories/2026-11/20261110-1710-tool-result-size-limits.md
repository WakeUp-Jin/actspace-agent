## [2026-11-10 17:10] | Task: 给工具结果的体积设上限，一次工具调用不再让会话卡死

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.2`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> （代码库审查后的讨论）那你看看 H4 怎么修……工具结果的体积上限放到 loop 的请求，这里估计要仔细讨论一下。……都可以按照你的建议去做吧。

这是审查修复批次的第 2 个 PR，计划见 `docs/exec-plans/active/20261110-codebase-review-fixes.md`。

### 🛠 Changes Overview

**Scope:** `tool-fs-read`、`tool-fs-write`、`tool-runtime`、`agent-loop`、`session-persistence`、`client`、`apps/desktop`

**Key Actions:**

- **`read_file`**：按需流式读取，不再把整个文件读进内存。输出最多 64,000 字符，停在整行上，尾注写明下一次的 `offset`；单行超过 2,000 字符只留开头并写明被截了几行；开头 8 KB 含 NUL 字节的按二进制拒绝；图片超过 25 MiB 拒绝。
- **`list_directory`**：输出最多 64,000 字符，尾注写明显示了多少条、一共多少条。
- **`write_file`、`edit_file`**：返回的 diff 最多 64,000 字符，超长的行只留开头；增删行数按全文计算后写进 `detail`。
- **界面读 `detail`**：目录卡片的条目数原先从给模型的文本里数，文本被截短后数字会变，现在优先读结果 `detail` 里的真实条目数（旧会话没有这一项时才从文本里数）。文件修改卡片的增删行数本来就读 `detail`，补了「diff 被截短后卡片仍然显示真实行数、说明行不被当成 diff 行」的测试。Harness 统计把「单行被截短」的标记也算作输出被截断。
- **tool-runtime 兜底**：`finalize()` 提交结果前按序列化后的 UTF-8 字节数检查。给模型的输出超过 256 KiB 时保留开头，把完整输出存成会话拥有的文件并附说明；`detail` 256 KiB、`renderer.props` 64 KiB、`summary` 与 `failure.message` 各 16 KiB。不改结果的状态和失败码。
- **按窗口的批次额度**：Agent Loop 在执行一批工具调用前算出这一批合计能给模型多少字符，经 `ToolPreparedEnvironment.modelOutputBatchChars` 传给 tool-runtime；一批内部由 `ToolOutputBudget` 按出结果的先后分配。
- **回合收尾**：回合中途一条记录没写进去时，先用恢复事务了结这个回合里没有结果的请求和工具调用，再正常写 `step/end` 和 `turn/end`。恢复计划支持只了结请求和工具调用、不关回合，并能处理只写了 `request/start` 的请求。

### 🧠 Design Intent (Why)

一条工具结果有两个硬约束：会话记录单条事件不超过 1 MiB，以及它要和后面的请求一起放进上下文窗口。原先 `read_file`、`list_directory`、`write_file`、`edit_file` 都没有上限，任何一个超限都会让会话卡死：

- 超过 1 MiB 时写记录抛错，回合没有闭合，之后每条消息都报上一个回合还开着，直到会话从磁盘重新打开。
- 没到 1 MiB 但超过窗口剩余空间时，结果已经写进会话，而自动压缩不压最后一批工具结果，之后每次请求都被容量检查拦下。

分四层是因为每一层知道的事不同。工具知道怎么截才有用（按整行、告诉模型下一次从哪里读）。tool-runtime 不知道内容的结构，但它是所有工具结果的必经之路，能保证一条结果一定写得进会话记录。窗口还剩多少只有 Agent Loop 知道，所以由它算额度、由 tool-runtime 执行。回合收尾是最后一道：前面都没拦住，或者写不进去的是助手消息、工具调用参数这类不归工具结果管的记录时，会话仍然可以继续用。

几个取舍：

- 兜底不把成功改成失败。走到这一步时副作用已经发生，改成失败只会让模型重做一遍。
- 批次额度取「现在还剩多少」和「压缩之后可用空间的一半」里小的那个。前一个保证压缩没成功时下一次请求也发得出去，后一个给摘要和后面的步骤留出空间。
- 一批内部不按调用数平分。一批里常常只有一两个大结果，平分会把它们截短，而其他调用根本用不完自己那份；所以先出结果的可以用剩下的全部，只给每个还没出结果的调用留 8,000 字符。
- 额度用上下文估算的同一个比例（4 个字符 1 token）。它对中文偏低，以中文为主的大输出仍可能多占窗口。估算器由上下文面板、自动压缩和容量检查共用，改它不在这次范围内，限制写在设计文档里。
- 回合收尾复用崩溃恢复的分类和记录格式，不另造一套「运行中失败」的记录。只读这个回合 `turn/start` 之后的记录，工作量不随会话长度增长。

### ✅ Verification

- `tool-fs-read`、`tool-fs-write`：3 MB 单行文件、超大 `limit`、二进制文件、5 万条目目录、超大 diff。
- `tool-runtime`：各部分的字节上限、完整输出转存与转存失败、状态不变、`ToolOutputBudget` 的分配、一批调用合计不超过额度、没到工具体的调用不占额度。
- `agent-loop`：额度的算法；20,000 token 的窗口下 4 个并行读取各返回 30,000 字符，结果被截短，下一次请求发得出去；去掉额度后同一个用例报 `Context exceeds model capacity`。
- `agent-loop`、`session-persistence`：工具结果、请求上下文记录、超过 1 MiB 的助手消息写入失败以及钩子抛错后，回合闭合，下一个回合正常完成。
- `pnpm check:hot-path-reads`、`pnpm check:scale-tests` 通过。

### 📁 Files Modified

- `packages/fs/tool-fs-read/src/line-range.ts`
- `packages/fs/tool-fs-read/src/node-ports.ts`
- `packages/fs/tool-fs-write/src/node-ports.ts`
- `packages/core/tool-runtime/src/output-limits.ts`
- `packages/core/tool-runtime/src/prepared-execution.ts`
- `packages/core/tool-runtime/src/scheduler.ts`
- `packages/core/agent-loop/src/tool-output-budget.ts`
- `packages/core/agent-loop/src/loop.ts`
- `packages/core/agent-loop/src/testing.ts`
- `packages/session/session-persistence/src/recovery.ts`
- `packages/client/client/src/sessions/tool-card.ts`
- `apps/desktop/src/main/runtime-v2/harness-stats-projection.ts`
- `docs/design-docs/tool-system/agent-tool-output-references.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-session-format-v1.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-tool-runtime-abi.md`
- `docs/design-docs/上下文管理引擎设计/agent-progressive-disclosure.md`
- `docs/releases/feature-release-notes.md`
- `packages/core/README.md`
- `packages/fs/README.md`
