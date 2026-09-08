# Kairos Agent Inbox 上下文摘要

记录时间：2026-06-02 12:27

用途：供上下文压缩使用的临时摘要，不是长期设计事实来源。

## 一句话概览

本轮在做 Kairos 的 V0 文件收件箱：Main Agent / Lab Agent 向各自的 Markdown inbox 追加观察信号，Kairos 每次 tick 主动读取，并把内容拼入 system prompt 的观测摘要段。

## 计划已落地的部分

- 已创建 active plan：`docs/exec-plans/active/20260602-kairos-agent-inbox.md`
- 已把该计划登记到 `docs/exec-plans/README.md`
- 已更新设计文档：
  - `docs/design-docs/agent-kairos-autonomous-mode.md`
  - `docs/design-docs/core-storage-and-observability.md`
  - `docs/design-docs/lab-runtime-architecture.md`
- 已创建 history：
  - `docs/histories/2026-06/20260602-1151-kairos-agent-inbox-plan.md`

## 计划内容

- inbox 文件固定两份：
  - `<userData>/kairos/inbox/main-agent.md`
  - `<userData>/kairos/inbox/lab-agent.md`
- 写入方只做 append，不做实时对话、消息总线、ack、锁文件或数据库。
- Kairos 每次 tick 读取两份 inbox，把最近内容截断后放进 system prompt 的 `[5] 观测摘要段`。
- inbox 是观察信号，不是授权，不可越过原有权限边界。

## 当前完成度

- 设计文档和 plan 已补齐。
- 文档里已经明确 V0 的边界、消息格式、读取预算和写入入口。
- 代码实现还没开始。
- 下一步是实现 `packages/agent-core/src/kairos/inbox.ts`，以及 prompt assembler 对 inbox 的接入。

## 当前状态判断

- 现在适合继续做代码实现。
- 如果要压缩上下文，优先保留：
  - active plan
  - 3 份设计文档
  - 这份临时摘要
- 其余聊天记录可以作为次要上下文丢掉。
