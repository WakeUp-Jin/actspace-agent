# LLM 前缀缓存：静态前缀 + 持久化的动态尾部

合并自两篇（Kairos 提示词缓存优化 2026-06；稳定 Prompt 前缀与持久化动态尾部 2026-09）。诊断与最终 wire 见 [prompt-cache 归因与最终 Wire](../2026-07/20260728-prompt-cache-diagnosis-controlled-variable-matrix.md)。

## 1. 前缀匹配与唯一设计原则

LLM 供应商的 prompt 缓存（DeepSeek、Anthropic、OpenAI 都有）按**前缀匹配**：请求序列化后从头比对，遇到第一个不同字节，之后的全部 token 都算 miss。DeepSeek 还按 64-token 块对齐——命中量永远是 64 的整数倍。

→ **上下文中越靠前的内容，变化频率必须越低。** 缓存断裂点 = 第一个变化的字节；“必变内容”在前面，后面稳定内容全部陪葬。

## 2. 案例：时间戳毒死缓存（Kairos）

Kairos 每个 tick 重组 system prompt，第 ~640 token 处嵌了 `[当前时间] <ISO 秒级时间戳>`：

```
call 7 | hit=4480 miss= 107  ← tick 内第 2+ 次调用（前缀没动）
call 8 | hit= 640 miss=3911  ← 新 tick 第 1 次调用：只命中时间戳前 10 个块
call 9 | hit=4608 miss= 127
```

640 = 10 × 64，正好是时间戳位置；看到 `hit=640` 这种规整数字就能反推断裂位置。一个秒级时间戳让每个 tick 白付约 4000 token 的 miss。

修复不是“少放内容”，而是**重排**——按变化频率分层，高频往后挪（成本从每次 miss 变为一次 miss）：

| 层 | 内容 | 变化时机 |
|---|---|---|
| system prompt 头部 | 指令、人设 | 改代码才变 |
| system prompt 中部 | 配置 tips、用户规则 | 改配置才变 |
| system prompt 末段 | 历史摘要 | 压缩产出新摘要才变（本来就断历史，不额外亏） |
| messages 历史 | 已落盘对话 | 只追加，不改写 |
| **最后一条 user message** | 时间、phase、观测增量 | **每 tick 必变 → 只能放这里** |

时间精度也降到分钟（`YYYY-MM-DD HH:mm`）：秒级对决策无价值，纯属缓存毒药。历史也是前缀的一部分：落盘事件重放出的消息必须与现场发送逐字节一致（见 [事件回放保真块顺序](event-replay-must-preserve-block-order.md)），否则历史中段照样断。

## 3. 三层事实模型（ActSpace v2 实现）

随机 run ID 写进 system prompt 就足以让缓存从变化字节处失效。把输入分三层：

1. `prompt-section`：稳定身份、安全规则、显式选择的完整指令正文；
2. `model-fact`：模型需要看见的稳定结构化事实（descriptor、capability 摘要）；
3. `request-fact`：只用于审计/诊断的动态事实（run、request、Host invocation identity）。

system prompt 只渲染 `modelFacts`，审计用的 id 记在请求事件上、不进提示词——不为缓存牺牲可审计性。一个事实若只用于 Trajectory 调试，不该进 `modelFacts`。

（历史：最初 snapshot 同时保存 `facts` 与 `modelFacts`。现在提示段和模型事实写在 `request/system-prompt`，requestId、turnId、stepId 写在 `request/header` 和 `request/context`；`request-fact` 这个种类只剩旧的 `RequestAssembler` 还认。）

## 4. 逐轮动态信息必须随消息持久化

若某项逐轮事实模型必须知道（如 Agent 当前是 Plan 还是 Agent），只在 dispatch 前临时拼接不够：下一轮从 Journal 重放旧消息，找不到当时的临时尾部，“现场请求”与“历史重放”不等价。正确做法是把动态块与用户消息一起持久化并放在当前上下文末尾：

```text
system:  stable prompt sections + stable model facts
history: durable Journal Surface
current user: text / attachments / runtime-context
```

（历史：最初动态块拼在 `user/message` 里。现在模式、日期这类运行状态是独立的补充事件 `plugin/actspace.context/supplement`，挂在写入时的对话末尾，内容变了才追加新版本，见[上下文引擎规范](../../design-docs/上下文管理引擎设计/agent-context-engine.md)「补充与临时插槽」。结论不变：动态信息必须落盘，并且放在末尾。）

UI、标题、自然语言摘要可以隐藏内部块，但 token 估算仍要计入，因为模型确实收到了它。

文本附件同理：只在第一次 dispatch 从本地路径读取，重放时文件可能消失或变化。把校验后的正文随 `user/message` 持久化，Artifact 保留原始字节，才能同时获得可恢复性、用户可见附件、模型输入一致。

## 常见陷阱

- 把审计 ID 放进 system prompt，再用“模型需要上下文”解释缓存抖动。
- 只在内存里追加动态尾部，后续重放缺失；为隐藏内部块而从 token estimate 中删掉，低估真实上下文。
- 文本附件只存路径，重启后依赖易失文件；创建第一个 Artifact 后才校验后续文件，失败留孤儿数据。

## 自检

- system prompt 里有没有时间戳、计数器、随机 id 这类每次必变的东西？必须注入实时信息时，它能不能成为“最后一条消息”？
- 用量日志里 cacheHit 是否呈现固定值反复出现？该值 ÷ 64 就是断裂前的块数。
- 为什么逐轮 mode 不能只在 LLM adapter 内临时追加？附件正文、原始 Artifact、UI attachment chip 各承担什么职责？

来源：`docs/histories/2026-06/20260610-1030-kairos-prompt-cache-optimization.md`、`docs/histories/2026-09/20260924-2308-main-chat-form.md`。
