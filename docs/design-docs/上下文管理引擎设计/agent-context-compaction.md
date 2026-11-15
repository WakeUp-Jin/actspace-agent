# 上下文压缩

> 对话太长时怎样把前面一段换成摘要：什么时候触发、压哪一段、怎样提交、失败怎么办。引擎见[上下文引擎规范](agent-context-engine.md)，压缩时的路径重排见[渐进式披露](agent-progressive-disclosure.md)，估算算法和事件上的估算字段见[请求记录与上下文估算](../agent-plugin-runtime/agent-spec-request-record.md)，消息流里的压缩分隔线见 [front-轮尾与导航规范](../frontend/front-轮尾与导航规范.md)，`/compact` 的排队见 [Task / Run 生命周期](../agent-plugin-runtime/agent-task-run-lifecycle.md)。
>
> 摘要提示词只在 `packages/context/context-compaction/src/prompts.ts`，本文只写取舍，不抄原文。

## 分工

| 部分 | 位置 | 负责 |
|---|---|---|
| 协调器 | `packages/context/context-engine/src/compaction.ts` | 唯一提交摘要的地方：排队、检查对话有没有被别人改过、提交事务、通知披露 |
| 策略 | `packages/context/context-compaction/src/` | 阈值、压哪一段、怎样生成摘要 |
| 披露 | `packages/context/context-disclosure/src/` | 压缩时登记路径、重排活跃与睡眠 |

- 策略不写 Session。每个 Harness 只能登记一个策略、一个披露。
- 没有策略时不自动压缩，手动压缩报 `Context compaction capability is unavailable.`。
- 压缩不删历史：往 Journal 追加一个替换事务，原始事件一行不动，之后的请求只读替换后的对话。

## 什么时候触发

**自动。**

- 时机是每个 Step 收尾：模型回复和整批工具都结束、已经 checkpoint 之后，最后一个 Step 也算。一个时机只试一次。新输入到达、切换模式都不单独触发。
- 压力值 = 输入 + 输出。输入取两个数里大的：当前内容的估算减去这次输出；provider 报告的输入（含缓存读、缓存写）加上这个 Step 工具结果的估算。上一次请求的用量不含请求之后才产生的工具结果，所以要补上；估算偏小时还有实际用量兜着。
- 阈值 = `min(floor(窗口 × 比例), max(1, 窗口 − 16000))`。比例和预留是两个上限，取小的那个，不叠加。压力值达到阈值就压。
- 比例默认 0.8。Chat 模式用设置里的 `chatCompactionTriggerRatio`（0.5–0.95），每次判断时读当前值；其他模式和子智能体用默认值。
- 窗口未知时不自动压缩，不拿常量猜。

**手动。** 用户发 `/compact`。它是任务操作，不是用户消息：在任务队列里排队，轮到时直接调协调器，不启动 Agent Turn，不进模型历史。手动压缩不看阈值，也不需要知道窗口。

## 压哪一段

- 从第一条压到最后一条之前，留下最后一条。最后一条是工具结果时，这批结果连同发起它们的助手消息整批留下，不拆开。
- 对话不足 4 条不压；刚好 4 条时整段压掉。
- 这一段里已有的摘要作为「旧摘要」交给摘要器，不和普通对话混在一起。

## 生成摘要

- 一次不带工具的辅助请求，用途记为 `compaction`。路由依次取：插件配置指定的、`utility`、第一条可用路由。用量记在辅助请求上，不产生助手消息。
- 输入是旧摘要和这一段对话，后面跟摘要模板；有旧摘要时再加一段合并规则。补充不在对话里，所以不会进摘要；旧消息里内嵌的 `runtime-context` 块在序列化时剔除。
- 摘要为空算失败。

提示词的取舍：

- **来源。** 基于 OpenCode 的压缩提示词修改，固定在一个提交上；来源写在 `prompts.ts` 文件头，MIT 许可证随包放在 `packages/context/context-compaction/src/OPEN_CODE_LICENSE.txt`。只借提示词，触发、选段、提交、失败处理都用自己的机制。
- **保留 `Relevant Files` 一节。** 摘要里列出相关文件或目录和用途。它可以和路径表重复，但不决定路径的活跃与睡眠。
- **模型只写摘要。** 路径清单由代码收集，不要求模型输出结构化清单。
- **旧摘要会被丢弃。** 没带进新摘要的内容就没了，所以要求继承仍然有效的目标、约束、决定和未完成事项；和新对话冲突时以新对话为准。
- **对话和旧摘要是资料，不是指令。** 不调用工具，不编造；区分已完成和计划中、已验证和未验证；不把运行时的导航清单抄进摘要。

## 提交

同一个会话的压缩排队执行。一次压缩的步骤：

1. 上次压缩留下没做完的路径重排，先补完；补了就到此为止。
2. 选段。选不出来就结束，什么都不写。
3. flush，生成摘要。
4. 对话在这期间变了（有追加或替换）就放弃，不提交。
5. 披露写候选路径并 flush，再确认一次对话没变。
6. 一次追加四条 core 事件并 flush：`compaction/start`、`compaction/summary`、`surface/replaced`、`compaction/end`。摘要是一条 `user` 消息，替换掉选中的那一段。
7. 披露写「已应用」。

规则：

- **失败不留痕迹。** 摘要失败、被取消或被放弃时，对话保持原样，披露不重排、不清零。
- **自动压缩失败不拖垮 Turn。** 只发一条实时消息 `compaction-failed`，Turn 继续。两种情况例外，错误照常向上抛：用户取消；Journal 已经写不进去。
- **记录。** `compaction/end` 记触发方式、耗时和压缩前后的 token；`surface/replaced` 记被替换范围的估算和估算器版本。
- **实时消息。** `compaction-started`、`compaction-finished`、`compaction-failed`，界面据此画压缩分隔线。

## 和硬容量检查的关系

自动压缩是尽量提前腾地方，不是保证。发请求之前的硬容量检查才是底线（见[上下文引擎规范](agent-context-engine.md)「从 Context 到 LlmInput」）：压缩没触发或没成功、内容仍然超过窗口时，请求不会发出去。
