# 滚动快照式审计：只在异常时保存证据

## 是什么

滚动快照式审计是一种排障数据设计：系统平时只保存上一轮输入的轻量滚动副本；当异常真实发生时，再把“上一轮”和“当前轮”的完整输入固化到审计目录。它适合缓存命中率、上下文稳定性、策略选择等只有事后才能确认的问题。

## 为什么需要

缓存失效不能只靠发送前猜测判断。发送前可以知道上下文是否疑似破坏 append-only，但只有模型返回 usage 后，才知道真实 cache hit ratio 是否很低。

如果每轮都保存完整上下文，会带来三个问题：

- 1M 级 context 会快速膨胀磁盘。
- 上下文里可能包含用户输入、工具结果和文件片段，长期全量保存风险高。
- 大量正常样本反而淹没真正需要排查的异常样本。

滚动快照把成本推迟到异常发生时：平时只覆盖 `last.context.json`，低缓存时才复制它为 `previous.context.json`，同时保存本轮 `current.context.json`。

## 怎么用

核心流程：

```text
模型调用前：
  current = 本次真实 provider 输入
  previous = last.context.json
  对 previous/current 计算 hash 链，得到 prefixChanged / appendOnlyBroken

模型返回后：
  如果 cacheHitRatio < 阈值：
    写 summary.json
    复制 last.context.json -> previous.context.json
    写 current.context.json
    写 diff.txt

最后：
  current 覆盖 last.context.json，供下一轮使用
```

`session.jsonl` 中只放索引：

```json
{
  "type": "llm_usage",
  "payload": {
    "cacheStatus": true,
    "cacheAuditId": "20260531T153012Z-turn12-call0"
  }
}
```

完整证据在旁路目录里，不污染会话事实日志。

## 核心要点

- 异常事实以后验数据为准，例如模型返回的 cache hit ratio。
- 发送前 hash 链只负责解释原因，不负责最终定罪。
- session 只保存轻量索引，避免把排障材料混进 LLM 输入。
- `last.context.json` 是滚动文件，不是历史归档；异常发生时才固化。
- `summary.json` 是小索引卡片，脚本先扫它，再按需打开大上下文。

## 常见陷阱

- 把审计字段写进会被 LLM 读取的消息里，会反过来改变 prompt，制造新的缓存失效。
- 只记录“调用过 compact/addTool”不够可靠，真正要比较的是送进 provider 的最终 Context。
- 只保存当前低缓存上下文不够，必须保存上一轮真实上下文，否则无法判断 append-only 从哪里断。
- 每轮都保存完整 context 看似简单，实际会让磁盘、隐私和分析噪声同时恶化。

## 自检问题

- 如果 `previous.messageHashes` 是 `[a,b,c]`，`current.messageHashes` 是 `[a,b,c,d]`，这算缓存风险吗？
- 为什么 `cacheStatus` 应该由模型返回后的 usage 决定，而不是发送前猜测决定？
- 为什么低缓存时需要同时保存 previous 和 current 两份 Context？

