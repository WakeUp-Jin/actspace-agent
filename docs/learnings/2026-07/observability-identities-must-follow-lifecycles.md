# 观测 ID 必须跟随真实生命周期

来源：Agent 分析观测数据对齐任务，`docs/histories/2026-07/20260729-2324-align-agent-observability-data.md`。原 HTML，已转 md。

页面标签可以随时改名，但关联键必须表达实体何时创建、何时结束、何时重试；否则日志看似完整，却回答不了“这次请求属于哪一步”。

```text
agentRunId   一次用户输入触发的完整 Agent 运行        agent_start → agent_end
  ↓ 包含多个
turnId       一次内部推理及其后续工具执行步骤         turn_start → turn_end
  ↓ 正常一次，重试多次
llmCallId    一次真实 provider API 请求               llm_call_start → llm_call_end
attempt      重试序号
```

## 问题从哪来

最常见的错误：把“用户看到的一轮对话”直接命名为 Turn，忽略后端真实的内部 Turn。Abort、usage、重试、持久化于是共享一个含义模糊的 ID（同一个 `turnId` 同时表示两种生命周期）。正确顺序：先找生产事件的代码，再画生命周期，最后命名 ID；不要从按钮文字或数据库字段名倒推领域模型。

## 重试是最好的验尸刀

不确定两个 ID 是否该分开，就问：失败后自动重试时，哪个实体继续存在、哪个重新创建？Agent Run 不变（用户没重新提交）；Turn 不变（仍在完成同一个内部步骤）；LLM Call 改变（发生了新的真实网络请求）。同一内部步骤重试三次 = 1 个 Turn、3 个 LLM Call。

## 恢复事实与分析证据分开

完整请求快照适合分析，却放大会话文件并引入敏感信息风险。事件存储只保留恢复所需的稳定事实；深度 Trace 独立、脱敏、可删除：`session.jsonl` 恢复消息与状态，`traces/*.jsonl` 存请求、响应、差异、耗时；删除 Trace 不破坏会话恢复。

长 Trace 的三件套：`trace.jsonl`（append-only 证据）、`trace.summary.json`（原子写的导航索引）、bounded reader（字节/事件/symlink 上限）。列表只读 sidecar，选中后才懒加载完整 Trace；sidecar 损坏只重建该对象，不拖垮会话；达到体积上限时停止记录分析证据，主业务继续。

## 陷阱

- 只重命名 TypeScript 字段，不改事件生产位置。
- 用数组索引当长期 ID，过滤或排序后关联失效。
- 失败重试覆盖前一次 usage，成本与耗时少算（见[按模型调用计量](rendered-message-is-not-a-billing-boundary.md)）。
- 把 Authorization、data URL、上游错误体原样写入 Trace。
- 让 renderer 直接拼文件路径读本地分析数据。

## 自检

1. 同一内部步骤重试三次，有几个 Turn、几个 LLM Call？
2. 删除分析 Trace 后历史会话还能完整恢复吗？
3. 字段名来自 UI 文案还是事件生命周期？
