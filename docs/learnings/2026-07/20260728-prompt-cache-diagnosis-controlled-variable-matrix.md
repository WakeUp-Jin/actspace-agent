# Prompt Cache 归因需要受控变量矩阵

来源：`docs/histories/2026-07/20260727-2321-duckcoding-multi-key-model-catalog.md`

## 核心问题

看到“相似请求没有缓存命中”时，不能直接断言供应商不支持缓存。LLM 请求的可复用前缀同时受协议、模型、system prompt、工具定义、缓存 key、网关节点和账户路由影响；一次请求里同时改变多个变量，只能证明结果不同，不能说明原因。

可靠做法是构造一份足够长、内容固定、没有业务数据的合成前缀，并用矩阵一次只改变一个变量。每个场景至少重复两次：第一次负责冷启动或写入，第二次才有资格观察缓存读取。

## 最小归因矩阵

```text
baseline:        Chat + stable prefix
+ cache key:     baseline + session-stable prompt_cache_key
+ tools:         cache key + byte-stable tool definitions
+ explicit:      tools + explicit cache breakpoint/options
+ protocol:      equivalent request over Responses API
+ gateway:       same request through another documented hostname
```

相邻场景才适合比较。例如“无 key 不命中、有 key 命中”支持“runtime 缺少稳定 cache key”的判断；它不能证明工具定义是否稳定，因为这两个场景都没有工具。

## 请求构造原则

- 静态前缀必须超过供应商缓存门槛，并在同一场景的重复请求中保持字节稳定。
- 变化内容只能追加在尾部，例如不同的 probe iteration；不要修改 system prompt 中间位置。
- 每个场景使用不同 cache key，避免上一场景预热污染下一场景。
- 工具名称、描述、JSON Schema 和顺序都属于前缀；动态生成描述或无序序列化可能让缓存失效。
- 每次脚本运行加入新的 run id，避免把旧缓存误判为本轮首次写入。
- 输出限制尽量小，降低付费探针成本；诊断文本不得使用真实会话或仓库内容。

## Usage 只是观测信号

不同兼容网关可能使用不同字段报告相同事实：

- 输入：`prompt_tokens` 或 `input_tokens`。
- 缓存读取：`prompt_tokens_details.cached_tokens`、`input_tokens_details.cached_tokens` 或顶层兼容字段。
- 缓存写入：`cache_write_tokens`、`cache_creation_input_tokens` 等。

字段不存在不等于缓存一定没有发生。网关可能转发了推理结果却没有完整转发 usage 明细。此时应保留 HTTP 状态、请求 id、总 token 数和耗时，再去供应商控制台对照；不要把缺失字段强行归一成零。

## 常见陷阱

- 只重复完整 Agent 请求：system prompt、工具、压缩历史或运行选项可能每轮都漂移，无法归因。
- 第一次请求就期待 cache read：冷请求通常只能产生 cache write。
- 所有场景共用一个 cache key：跨场景污染会让不兼容参数看起来也能命中。
- HTTP 400 就停止矩阵：协议或显式参数被拒绝本身就是兼容性证据，其他场景仍应继续。
- 只看费用：价格倍率、缓存读取价和供应商账单延迟都会干扰判断，应先看 token 明细。
- 把 Key 写进参数或日志：探针应只从环境读取，并对外部错误正文做二次脱敏。

## 自检问题

1. 两个被比较的场景是否真的只改变了一个变量？
2. 第二次请求的可复用前缀是否在 token 级保持一致，且超过缓存门槛？
3. usage 没有缓存字段时，是否保留了请求 id 和控制台对照路径，而不是直接判定缓存失效？
