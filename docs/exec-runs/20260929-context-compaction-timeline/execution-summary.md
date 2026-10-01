# 对话流里的上下文压缩 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260929-context-compaction-timeline.md`
- **执行过程**：`docs/exec-runs/20260929-context-compaction-timeline/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（Electron 实机验收待人工）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 自动压缩 live 事件 | `packages/compaction/src/plugin.ts`、`packages/core/agent-loop/src/loop.ts` | 以前 v2 从不发出压缩 stream 事件，自动压缩期间界面无说明；失败也不再让已完成的回合变成失败 |
| Stream 映射 | `apps/desktop/src/main/runtime-v2/fixed-renderer-stream-adapter.ts` | live 事件 → `context_compaction_started / finished / failed` |
| 契约收敛 | `packages/shared/src/session.ts`、`session-selectors.ts` | 去掉 trigger / stage / progress / summaryText，新增 startedAt / durationMs / summary / errorMessage |
| 投影保留旧消息 | `packages/client/src/sessions/chat.ts` | 被压缩的消息与工具继续显示；摘要挂到分隔线，不再显示成用户卡片；耗时 durable |
| 组件重写 | `CompactCommandBlock.tsx`、`styles/markdown.css` | 中文文案；计时 + 不确定进度条；可展开摘要 + 复制；失败 + 重试 |
| Composer | `Composer.tsx`、`ConversationView.tsx`、`WorkbenchLayout.tsx` | 压缩中停止按钮置灰；一次性状态提示 |
| App 接线 | `App.tsx` | 手动直接 running；skipped 提示；失败按会话保留；重试 |
| 文档 | `front-中间消息区规范.md`、demo | 规范按新结构重写；demo 去掉排队内容 |

## 人工验证指引

### 必须验证

1. **手动 `/compact`（长会话）**
   - 验证方式：Electron 中打开一个有较多轮次的会话，输入 `/compact` 发送。
   - 预期结果：立即出现「正在压缩上下文 · Ns」和绿色不确定进度条，停止按钮置灰（悬停提示「压缩完成后可继续」）；完成后变成「上下文已压缩 · N 条消息 · Ns」分隔线，上方旧消息仍在；点分隔线展开摘要，可复制。

2. **短会话 `/compact`**
   - 验证方式：新会话只聊一轮后输入 `/compact`。
   - 预期结果：输入框顶部出现「对话还很短，暂时不需要压缩」，约 3 秒消失，对话流不留记录。

3. **自动压缩**
   - 验证方式：用上下文较小的模型持续对话直到触发阈值。
   - 预期结果：回复结束后出现同样的 running 块，完成后留下分隔线，回合正常结束。

### 建议验证

1. **失败与重试**
   - 验证方式：断网或使用无效 key 后 `/compact`。
   - 预期结果：红色「上下文压缩失败 · 原因」+「重试」；恢复网络后点重试可成功。
2. **重启后回看**：已压缩会话重启应用后，分隔线仍显示条数与耗时，可展开摘要。

## Agent 已完成的验证

- shared 138 / compaction 7 / client 10 / agent-loop 27 项测试通过。
- Desktop renderer + electron typecheck 通过（既有 `editor-poc.test.tsx` 缺依赖除外）。
- Desktop 全量 vitest 935/936 通过；唯一失败为既有的 `workspace-git-context-service` 沙箱环境用例。
- `pnpm check:frontend-tokens`、`pnpm check:frontend-theme` 通过。
- 浏览器 fixture 浅色 / 深色截图：`compaction-light.png`、`compaction-dark.png`（本目录）。

## 已知风险和遗留事项

- 压缩失败不持久化：刷新或重启后失败分隔线消失（journal 无失败事件）。
- live 完成时还没有摘要（stream 不带摘要），分隔线暂时不可展开；运行结束重载 durable 投影后即可展开。
- 自动压缩只在回合结束后触发，压缩期间不能发送；排队发送由后续的消息队列功能提供。

## 后续建议

- 消息队列（Composer 上方托盘，↳ Steer / 删除）单独立项，届时放开压缩期间发送。
