# 从 Session Journal 重建事件级活动视图

## 这次学到的模式

当产品需要展示“每次模型请求”和“每次工具调用”时，不要把 UI 表格直接当成新的账本。更稳妥的做法是：Journal 保存不可变运行事实，投影层从事实重建可分页的 `UsageActivitySnapshot`，页面只消费快照。

本模式在设置中心 P5 中用于把旧的 Agent Run 聚合 Usage 升级为 Maka 风格的活动明细，同时保留旧聚合作为兼容回退。

## 为什么需要事件级投影

运行级聚合适合快速回答“这个 Agent Run 用了多少 token”，但无法准确回答：

- 一次 retry 到底发出了几次真实请求？
- 哪个请求拿到了 provider usage，哪个请求只能显示 unknown？
- 某个工具调用从什么时候开始，到什么时候结束？
- 页面筛选或删除派生缓存后，能否回到同一个结果？

如果为 UI 另写一份可变 Usage 日志，就会产生第二个事实源，重启、崩溃和迁移时很容易分叉。事件级投影把“事实”和“查询形状”分开：Journal 负责恢复，projection 负责阅读体验。

## 核心实现

### 1. 一个真实活动对应一个稳定 ID

```text
${sessionId}:request:${requestId}
${sessionId}:tool:${callId}
```

ID 不依赖数组下标、页面排序或生成时间，因此冷启动重放、分页和重渲染都能稳定关联行。

### 2. 终态选择要有优先级

当前 Journal 同时可能有 `assistant/message` 和 `step/end`。两者都带 usage 时不能相加，否则一次请求会被算两次。投影采用：

```text
assistant/message（首选终态与 provider usage）
        ↓ 缺失时才回退
step/end（兼容回退）
```

Tool 则以 `tool/call` 开始，以 `tool/result` 或 `tool/recovery-outcome` 结束。

### 3. Retry 是多条请求，不是一次请求的覆盖更新

失败请求保留自己的 `requestId` 和错误状态；后续请求使用新的 `requestId`，并通过 `retryOfRequestId` 形成链。这样既能统计真实调用次数，也能解释“为什么成功结果之前出现了一条失败记录”。

### 4. 不完整数据必须显式表达

Token、成本和状态都可能缺失。投影使用 nullable 字段与 `costBasis`：

```text
costBasis = priced | estimated | unavailable
status    = running | success | error | aborted | unknown
```

`null` 不是零；缺少 currency 或可验证价格来源时显示 unknown / unavailable，不用默认价格伪造账单。

### 5. 水位让重建可验证

快照记录每个 Session 的 `throughJournalSeq`。它不是新的事实，只是“这份视图读到了 Journal 的哪里”的证据。删除 projection 缓存后，只要 Journal 仍在，就可以重新生成相同活动 ID 和相同排序结果。

## 常见陷阱

1. **把 assistant 和 step/end 的 usage 相加**：这会把一次模型请求重复计数。必须先定义终态优先级。
2. **用 Agent Run ID 代替 request ID**：retry 和同一 Run 内的多次请求会被覆盖，调用次数失真。
3. **把未知成本当成 0**：`$0.00` 看起来很确定，会误导用户。缺失价格应显示 unavailable。
4. **用当前模型目录补写历史成本**：目录价格会变化，历史活动只能使用事件中携带的价格快照或明确标为 estimated。
5. **把筛选状态写入 Journal**：筛选是 UI 偏好，应进入 `activity.usage`，不能污染运行事实。

## 自检问题

1. 如果同一 request 同时有 `assistant/message` 和 `step/end`，为什么只能选择一个作为 usage 来源？
2. 为什么 retry 的 successor 必须拥有新的 request ID，而不是修改原行的 attempt？
3. 删除 Usage 派生缓存后，哪些数据必须仍然存在，才能重建活动明细？

## 关联变更

- 设计与执行记录：`docs/histories/2026-08/20260830-1933-settings-center-redesign-spec.md`
- 执行摘要：`docs/exec-runs/20260830-actspace-settings-center-refactor/execution-summary.md`
- 当前产品规范：`docs/design-docs/frontend/front-设置中心重构规范.md`
