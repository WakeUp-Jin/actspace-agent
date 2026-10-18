# 轨迹系统提示词 / 工具显示修复执行摘要

状态：2026-10-18 实现完成并通过自动化测试和真实 journal 对比；未提交、未推送。Computer Use 逐条验收已完成，详见 [验收报告](acceptance-20261018.md)：30 项中 21 项通过、2 项失败、7 项未完整覆盖。核心旧会话提示词和 Schema 修复在已覆盖场景中通过；上下文开始时间与子工具展示仍需修复，详见 [问题记录](acceptance-issues-20261018.md)。

## 问题

对照 DSH 轨迹页，用 3 个本机真实会话做对比：一份走历史窗口精简，一份读完整 journal。

- 历史窗口把较早的 `request/context` 收敛成身份字段，把 `renderedSystemPrompt` 和 `tools` 一起丢掉了。重开会话后：「初始系统提示词」行是空的（「本次请求没有系统提示词 / 工具」）；最新一次请求处多出一条假的「系统提示词已更新」；早期工具调用的 Schema 全部不可用（会话中 2/2、55/55 丢失）。
- 系统行的签名包含请求选项，换模型或改温度也会被判为「系统提示词已更新」；只改了工具时，文字也是「系统提示词已更新」。
- 字段审计中顺带发现：真实 `user/message` 不带 `turnId`，而且写在 `turn/start` 之前，所以用户行落在轮次外；两步之间的「上下文」行没有开始时间；只有思考的助手消息搜索预览为空。

## 改动

| 范围 | 内容 |
| --- | --- |
| runtime `slimHistoryWindow` | 被收敛的请求在窗口内第一次出现或提示词 / 工具变化时保留 `renderedSystemPrompt / systemPrompt / system / tools`，其余标 `promptUnchanged: true`；最新一份仍完整保留 |
| renderer `trajectory/builder.ts` | `promptUnchanged` 的请求沿用上一份提示词，工具调用因此能拿到 Schema；系统行只比较系统提示词正文和工具，没有正文的请求不产生系统行；四种文字按前后对比决定；用户消息按 `agentRunId` 归到下一个 `turn/start`；上下文行开始时间取事件时间；助手预览回退到摘要 |
| 测试 | runtime 新增窗口保留 / 标记用例；renderer `trajectory-real-journal.test.ts` 新增两条真实形状用例（精简窗口、四种变化文字与换模型不出行） |
| 文档 | `agent-spec-runtime-projection.md` 历史页精简规则补充 `promptUnchanged` |

## 核对

| 检查 | 结果 |
| --- | --- |
| 真实 journal 对比（064981ac / 8e8221d1 / 075e242e） | 精简与完整一致：一条「初始系统提示词」（12967 / 13060 字，21 个工具）；Schema 2/2、55/55、13/13；用户行无缺轮次；上下文行无缺时间。唯一差异是 `systemPromptParts` 未保留，界面只在没有 `systemPrompt` 时才读它，不影响显示 |
| `session-projection.test.ts` | 17 项通过 |
| `pnpm --filter @actspace/runtime test` | 20 文件 59 项通过 |
| Desktop 两个 tsconfig typecheck | 通过 |
| `pnpm --filter @actspace/desktop test` | 240 文件通过、2 跳过；1954 项通过、7 跳过 |
| `check:frontend-tokens` / `check:frontend-theme` / `check:renderer-bridge` / `git diff --check` | 通过 |

## 未覆盖

本机没有压缩、子智能体、请求失败重试的会话，这几类行没有用真实数据核对，已写进 Codex 验收 F 节。仍剩 1–6 条只有工具调用的助手消息预览为空，界面显示「（仅工具调用）」，与 DSH 一致。
