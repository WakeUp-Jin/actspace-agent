# 执行摘要

状态：实现完成；自动化通过，真实 Provider/Electron 连续运行验收仍待执行。

## 自动化证据

- `pnpm --filter @actspace/desktop typecheck` 通过。
- `pnpm --filter @actspace/desktop build:renderer` 通过。
- `pnpm --filter @actspace/desktop build:electron` 通过。
- 后台切换专项 9 项通过，覆盖并发、工具终态、子 Agent、Bash、失败恢复、停止竞态、审批竞态和缓存淘汰。
- 受影响测试批次 113 项中 111 项通过；2 项既有失败已用原始 App 基线复现：Write 工具展示断言、工作区创建参数断言。

## 人工验收

打开 `apps/desktop/test-fixtures/session-background-runs.html`，确认 A 运行时点击 B，再回 A，A 的用户消息、进度和工具卡片连续；完成 A 后 B 的停止按钮仍然有效。真实 Electron 中用两个隔离会话重复同一路径，并至少让一个工具进入审批或后台 Bash 状态。

## 验收目标

- A 调用工具时切 B，再回 A，进度连续且没有重复消息。
- A/B 并发运行，停止按钮、待授权和失败状态按会话隔离。
- A 在后台结束，返回显示持久最终结果。
- 快速切换和旧历史响应不覆盖新消息；后台 Bash 在主回合结束后仍更新。
- 自动化与真实 Electron 的证据在完成时分别记录。
