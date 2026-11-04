# Prompt Cache 诊断：归因、审计证据与最终 Wire

合并自五篇：缓存命中率需要原因分类、滚动快照式审计、受控变量矩阵、缓存策略必须落到最终 Wire、SDK 支持缓存为什么仍不命中。前缀设计原则见 [LLM 前缀缓存：静态前缀 + 持久化动态尾部](../2026-06/static-prefix-dynamic-suffix-for-prompt-cache.md)。

## 1. 命中率是症状，不是诊断

同样 60% 的命中率可能是：稳定前缀变了（bug 或配置漂移）；消息链不再 append-only（replay、compaction、恢复出问题）；前缀与历史都稳定，但新追加的工具结果很大（通常是预期行为）；客户端请求形状没问题，剩下缓存预热/过期/供应商策略。全部当一回事，就会调错东西：降工具输出阈值救不了前缀漂移，查供应商也救不了被改写的历史。

先分类再优化：① 比较稳定前缀 hash；② 比较逐消息 hash 确认 append-only；③ 度量变化/追加的尾部；④ 统计哪些 role 和工具贡献了尾部；⑤ 再决定修上下文稳定性、工具输出大小，还是供应商/预热。真实 usage 事实（命中了多少）与本地 diff 的分诊提示（可能原因）要分开存放。别指望 `cacheHit / (cacheHit + cacheMiss)` 总趋近 100%：工具密集的 turn 里每个新工具结果都是新鲜 prompt。

## 2. 滚动快照式审计：只在异常时保存证据

缓存失效不能只靠发送前猜测：发送前只知道是否疑似破坏 append-only，只有模型返回 usage 才知道真实命中率。每轮存完整上下文的代价：1M 级 context 磁盘膨胀；含用户输入/工具结果/文件片段，长期全量保存有隐私风险；大量正常样本淹没异常样本。

做法：平时只覆盖 `last.context.json`；低缓存真实发生时，才把它复制为 `previous.context.json`，并存本轮 `current.context.json`、`summary.json`、`diff.txt`。

```text
调用前: current=本次真实 provider 输入; previous=last.context.json; 算 hash 链 → prefixChanged/appendOnlyBroken
返回后: 若 cacheHitRatio < 阈值 → 写 summary.json、复制 last→previous、写 current、写 diff.txt
最后:   current 覆盖 last.context.json
```

`session.jsonl` 的 `llm_usage` 里只放索引（`cacheStatus`、`cacheAuditId`，见 `packages/util/shared/src/session.ts`），完整证据在旁路目录，不污染事实日志；分析脚本见 `scripts/diagnostics/analyze-cache-audit.mjs`（`last.context.json` 等文件名为当时实现，代码当前只保留索引字段，视为历史细节）。要点：异常以后验 usage 为准；发送前 hash 链只解释原因不定罪；`summary.json` 是小索引卡片，脚本先扫它再按需开大文件。陷阱：把审计字段写进会被 LLM 读到的消息会反过来改 prompt、制造新失效；只记“调用过 compact/addTool”不可靠，要比较送进 provider 的**最终** Context；只存当前低缓存上下文不够，必须有上一轮真实上下文才知道 append-only 从哪断。

## 3. 受控变量矩阵：不要凭一次请求断言“不支持缓存”

可复用前缀同时受协议、模型、system prompt、工具定义、缓存 key、网关节点、账户路由影响；一次改多个变量只能证明结果不同。构造足够长、固定、无业务数据的合成前缀，一次只改一个变量，每个场景至少重复两次（第一次冷启动/写入，第二次才有资格观察读取）。

```text
baseline: Chat + stable prefix
+ cache key: baseline + session-stable prompt_cache_key
+ tools:     cache key + byte-stable tool definitions
+ explicit:  tools + explicit cache breakpoint/options
+ protocol:  等价请求走 Responses API
+ gateway:   同请求走另一个文档化 hostname
```

只比较相邻场景（“无 key 不命中、有 key 命中”支持“缺稳定 cache key”，但不能证明工具定义稳定，因为都没带工具）。构造原则：静态前缀超过供应商门槛且字节稳定；变化只追加在尾部；每场景不同 cache key，避免预热污染；工具名/描述/JSON Schema/顺序都属于前缀（动态生成描述或无序序列化会失效）；每次运行带新 run id；输出限制尽量小；诊断文本不用真实会话内容；Key 只从环境读取，外部错误正文二次脱敏。

Usage 只是观测信号：输入可能是 `prompt_tokens`/`input_tokens`，缓存读取是 `prompt_tokens_details.cached_tokens`/`input_tokens_details.cached_tokens`/顶层兼容字段，写入是 `cache_write_tokens`/`cache_creation_input_tokens`。字段缺失不等于没发生（网关可能不完整转发 usage 明细）——保留 HTTP 状态、请求 id、总 token、耗时去供应商控制台对照，别强行归一成 0。陷阱：只重复完整 Agent 请求（system/工具/压缩历史每轮漂移）；首次请求就期待 cache read；所有场景共用一个 cache key；HTTP 400 就停矩阵（被拒本身是兼容性证据）；只看费用（倍率、缓存读价、账单延迟干扰）。

## 4. 缓存策略必须落到最终 Wire

同一模型协议既可直连 SDK，也可经本地代理或另一套兼容 SDK 时，“设置里启用缓存”不等于每条路径都发出缓存标记：主 SDK 的能力不会自动出现在兼容 backend 上。直连库可能接受 `cacheRetention`，代理路径可能要求手工给 system、tools、messages 内容块加 `cache_control`；只在业务层传一个开关，其中一条路径会静默失效。

排查分三层：
1. **策略**：业务决定缓存寿命（交互 Chat 用 1 小时，连续 Agent 工作用 5 分钟；连接显式关闭优先），并**绑定到单次请求**，避免重试读到变化后的设置。
2. **序列化**：检查送给 SDK 的 body，还要用真实 SDK + 本地假 fetch 检查最终 body；只断言传入 `cacheRetention: long` 无法证明网络请求含 `ttl: 1h`。
3. **服务商结果**：看 cache write 与 cache read。无写入就不能期待读取；有写入也可能因长度、前缀变化、过期、路由变化不命中。

设计：连接配置保存协议无关的策略语义，不存某 SDK 参数名；解析模型与连接时冻结本次策略；每条最终 wire adapter 把策略翻译成自己需要的字段；对最终 payload 测试；关闭策略必须显式删除字段，不能依赖上游忽略未知值；每条 backend 路线准备同一组正反例（短缓存、长缓存、关闭、非目标模型），关闭用例要与有标记的正例配对，否则“永远不发缓存参数”的实现也能通过。

Anthropic 短缓存断点的首版位置：system 最后一个可缓存内容块、最后一个工具定义、最近 user 消息的最后一个可缓存内容块——表达“前面可复用，后面更易变”。缓存命中不是配置成功的必然结果，只有 Provider 返回 cache read/write usage 才是运行时证据。陷阱：连接测试也带缓存标记；代理与直连默认值不同导致切换后行为变；文案写“最近工具结果”实现却标记工具定义；Provider 拒绝缓存字段后静默重试同一生成请求（重复输出和费用）。

别把两种比例混为一谈：Context 占用率 = 当前上下文 / 容量，缓存命中率 = 复用输入占比。0.42% 的 Context 整数展示应为 `<1%`，不要先 floor 成 0 再解释。

## 自检

1. 被比较的两个场景是否只改变了一个变量？第二次请求的可复用前缀是否 token 级一致且超过门槛？
2. usage 无缓存字段时，是否保留请求 id 与控制台对照路径？
3. 测试能否看到最终请求里缓存字段的数量和位置？关闭后所有 transport 是否完全不发？
4. 前缀 hash `[a,b,c]` → `[a,b,c,d]` 算缓存风险吗？（不算，append-only）为什么低缓存时要同时保存 previous 与 current？

来源：`docs/histories/2026-06/20260604-1936-cache-audit-diagnosis-script.md`、`docs/histories/2026-07/20260727-2321-duckcoding-multi-key-model-catalog.md`、`docs/histories/2026-09/20260925-0020-anthropic-custom-model-pricing.md`。
