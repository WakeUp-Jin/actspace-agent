# 流式 turn 控制体验打磨

## 用户诉求

发送消息后，用户输入应该立即显示；工具执行中应在 started 阶段就显示参数化标题；发送按钮在 Agent 执行中应切换为方块停止态并支持取消；取消后界面需要明确收尾，而不是像普通完成一样悄悄清场。

## 主要改动

- 修复 renderer streaming block 合并逻辑，避免 `turn_started` 或 assistant delta 覆盖 optimistic user message。
- 新增 desktop renderer 测试基建，覆盖用户消息即时显示、工具 started 预览和取消按钮行为。
- 扩展 `RuntimeStreamEvent.tool_started`，让后端在工具开始阶段就带上结构化 `ToolUiPreview`。
- `read_file`、`search_files`、`list_directory` 的流式工具行现在开始时就显示参数化内容，并在 running 状态使用 shimmer 扫光效果。
- 新增 `agent:abort-turn` IPC，renderer 的发送按钮在 streaming 时切换为方块 stop 按钮，点击后调用真实取消链路。
- 扩展 `AgentTurnResult.status` 支持 `aborted`，取消后保留已出现的本轮内容，并追加轻量 `Stopped` 状态行。
- stop 按钮继续使用品牌蓝色 token，符合“蓝色负责行动和运行中状态”的视觉规范。

## 设计动机

流式交互里，用户最需要的是确认感和可控感：消息发出后要立即有反馈，工具开始执行时要知道它在做什么，取消时要确认是自己主动停止了这轮执行。

本次没有把取消显示成 error，因为这是用户主动操作，不应该被渲染成故障。`Stopped` 作为轻量状态行更符合当前消息区语法。

stop 按钮没有使用黑色，因为黑色在当前视觉语言里主要负责阅读文本。运行中可取消仍然是一个主操作入口，应该沿用品牌蓝色来表达“可执行/可控制”。

## 关键文件

- `packages/shared/src/session.ts`
- `packages/shared/src/ipc.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/App.tsx`
- `packages/desktop/src/renderer/components/Composer.tsx`
- `packages/desktop/src/renderer/components/messages/ToolLogLine.tsx`
- `packages/desktop/src/renderer/test/app-streaming-user-message.test.tsx`

## 验证

- `pnpm --filter @actspace/shared build`
- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm --filter @actspace/desktop test`
- `pnpm --filter @actspace/desktop typecheck`
