# 压缩的前端回显（A1） — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261025-compaction-display.md`
- **执行过程**：`docs/exec-runs/20261025-compaction-display/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（代码与自动化验证、浏览器 mock 截图）；Electron 人工验收待做
- **分支**：`feat/compaction-display`（worktree `../actspace-agent-compaction-display`，基于 main 485a5361）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 后端记录 | `packages/context/engine/src/compaction.ts`、`packages/session/journal/src/compaction.ts`、`packages/context/compaction/src/plugin.ts` | `compaction/end` 写 `trigger`、`beforeTokens`（实测）、`afterTokens`（估算）；`onFinished` 回传 |
| 实时事件 | `packages/core/agent-loop/src/loop.ts`、`packages/shared/src/runtime-v2/live-event.ts` | `compaction-finished` 带同一组字段 |
| 投影 | `packages/shared/src/session*.ts`、`packages/client/src/sessions/chat.ts`、`packages/client/src/live/*` | 消息块加字段、去掉 `summary`；修 `triggerTokens` 取当前用量 |
| 对话 A1 | `apps/desktop/src/renderer/components/messages/CompactCommandBlock.tsx`、`styles/base.css` | 居中分隔线三态、两侧扫光、「在轨迹中查看」 |
| 轨迹 | `apps/desktop/src/renderer/trajectory/{reveal,builder,contract,strings}.ts`、`components/trajectory/details/RecordOverview.tsx` | `{ compactionId }` 跳转；概述加触发方式、压缩消息数、Token；时长取记录值 |
| mock | `apps/desktop/src/renderer/mock/scenarios/compaction.ts` | `?mock=compaction` 三态 |

## 验证

- core-agent-loop 54、context-compaction 20、context-engine 27、session-journal 37、shared 179、client 50、web 124、desktop 2029 项通过；desktop typecheck 通过。
- `check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge` 通过；`check:current-docs` 失败在既有的 `20261021-model-acquisition-picker` 截图链接，与本分支无关。
- 浏览器 mock 截图：[浅色完成](screenshots/1-light-completed.png)、[深色完成](screenshots/2-dark-completed.png)、[进行中](screenshots/3-light-running.png)、[深色失败](screenshots/4-dark-failed.png)、[480px](screenshots/5-light-480-completed.png)、[轨迹详情](screenshots/6-light-trajectory.png)。

## 人工验证指引（Electron，需要模型 Key）

1. 手动 `/compact`：分隔线进行中显示计时与扫光；完成后显示「以上 N 条消息已压缩 · X → 约 Y tokens · Ns」；轨迹详情触发方式为「手动」。
2. 长会话自动压缩：同上，触发方式为「自动」；压缩前 token 与压缩前一刻输入框旁 Context 用量大致一致。
3. 点「在轨迹中查看」：中间切到轨迹并选中压缩行。
4. 打开压缩功能上线前的旧会话：分隔线只有条数和耗时，轨迹 Token 为「—」。

## 已知边界

- 压缩后 token 是估算值，和下一次请求的实测输入会有出入。
- 压缩行不在已加载的轨迹历史里时，跳转后顶部提示没找到，需要先加载更早历史。
