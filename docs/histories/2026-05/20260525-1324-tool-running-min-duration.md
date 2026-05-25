# 工具执行中最小展示时间

## 用户诉求

工具执行很快时，前端看起来像是工具完成后才闪一下状态。希望在不改变后端工具 started/finished 语义的前提下，让工具卡片至少保持一小段“执行中”状态，增强流式体验可读性。

## 主要改动

- 在 `packages/desktop/src/renderer/App.tsx` 中新增 `MIN_TOOL_RUNNING_MS = 300`。
- streaming 工具状态新增 `startedAt`，收到 `tool_finished` 时根据 elapsed time 决定立即完成或延迟完成。
- 增加工具完成 timer 管理：
  - 新 turn 开始、创建/切换 session、组件卸载时清理 timer。
  - 延迟完成时仍保留当前 streaming user block，避免刷新丢失用户消息。

## 设计动机

后端当前语义已经是 `tool_start -> tool_started -> 执行工具 -> tool_end -> tool_finished`，不是工具完成后才推 started。体验问题主要来自快工具和 React 状态批处理。前端加最小展示时间比改后端时序更小、更符合现有架构边界。

## 验证

- `pnpm typecheck`
- `pnpm --filter @actspace/desktop build`
