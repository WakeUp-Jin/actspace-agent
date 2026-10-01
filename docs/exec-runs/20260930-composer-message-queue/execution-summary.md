# Composer 消息队列与运行中插入 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260930-composer-message-queue.md`
- **执行过程**：`docs/exec-runs/20260930-composer-message-queue/execution-process.md`
- **执行模式**：交互
- **执行结果**：部分完成（代码、自动化测试与浏览器截图完成；Electron 实机验收待人工）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| Inbox `steer` 来源、`status()`；loop 发 `inbox-claimed`，有待读插入时多跑一步，回合开始丢弃遗留插入 | `packages/core/agent/src/inbox.ts`、`packages/core/agent-loop/src/loop.ts` | 插入必须在当前回合被读到，不能排到下一回合用户消息之后 |
| `agent:steer` / `agent:cancel-steer` IPC，`user_message_steered` 流事件 | `packages/shared`、`packages/desktop-app/src/service.ts`、`apps/desktop/src/main/runtime-v2/*`、preload | 插入复用 `runAgent` 的引用校验与附件准备；取消返回服务端真实状态 |
| `startSessionRun` 提取 | `apps/desktop/src/renderer/App.tsx` | 后台会话的队列也能自动发出 |
| 按会话内存队列、`continueQueue`、插入 / 撤回 / 编辑 / 上移 / 继续发送 | `App.tsx`、`session/message-queue.ts` | 正常结束发出队首；停止 / 失败 / 被拒暂停 |
| `MessageQueueTray`；Composer 运行中可输入、两种按钮样子 | `components/composer/MessageQueueTray.tsx`、`Composer.tsx` 等 | 与 demo 一致 |

## 人工验证指引

### 必须验证

1. **排队后依次发出**
   - 验证方式：`pnpm dev:log` 启动，发一个会跑几十秒的任务；运行中输入两条并回车。
   - 预期结果：托盘显示「2 条排队」；当前回合结束后第一条自动发出、成为新回合；它结束后第二条发出；托盘消失。
2. **工具执行中插入**
   - 验证方式：任务调用工具期间，对一条排队消息点「↳ 插入」。
   - 预期结果：行变为「下一步读取」；模型下一步开始时这条以普通用户消息出现在当前回合里，模型回应中考虑了它。
3. **模型写最终回复时插入**
   - 验证方式：在模型输出最后一段文字时点「↳ 插入」。
   - 预期结果：回合没有结束，多跑一步处理插入的消息。
4. **插入后立即停止**
   - 验证方式：点「↳ 插入」后立刻点停止。
   - 预期结果：没被读到的消息回到队列顶部，托盘显示「已暂停 · 继续发送」，不会自动发出；点「继续发送」后发出。
5. **压缩中排队**
   - 验证方式：输入 `/compact`，压缩进行中输入一条消息回车。
   - 预期结果：停止按钮置灰，托盘里「插入」置灰并提示原因；压缩完成后这条自动发出。
6. **后台会话**
   - 验证方式：会话 A 运行中排一条，切到会话 B 等待。
   - 预期结果：A 结束后自动发出排队消息（侧栏 A 再次显示运行中）。

### 建议验证

1. **浅色 / 深色主题下托盘与 `···` 菜单**
   - 验证方式：切换主题，打开 `···`。
   - 预期结果：颜色随主题翻转，菜单不被托盘滚动区裁掉，Esc / 点外部关闭。
2. **附件 / 引用排队后失效**
   - 验证方式：排一条带文件引用的消息，运行结束前删除该文件。
   - 预期结果：自动发出时被拒，正文回到输入框并显示原因，队列暂停。

## Agent 已完成的验证

- agent-loop 32 项（含 steer 5 项）、core-agent 18 项、desktop-app 11 项通过（T2–T4，恢复后复跑 steer 5 项 + main steer / stream 16 项通过）。
- Desktop 全量 vitest：964/965 通过；新增 `app-message-queue`（10 项）、`message-queue-tray`（8 项）全部通过；`app-streaming-user-message` 42 项回归通过。
- `tsc -p tsconfig.json`：仅既有 `editor-poc.test.tsx` prosemirror 依赖缺失错误；`tsc -p tsconfig.electron.json` 通过。
- `pnpm check:frontend-tokens`、`pnpm check:frontend-theme` 通过。
- 浏览器 fixture 浅色 / 深色截图：`queue-light.png`、`queue-dark.png`（本目录）。

## 已知风险和遗留事项

- `workspace-git-context-service.test.ts` 一项失败（期望 `not_repository`，实际 `failed`）：本次未改动相关代码，疑似本机 git 环境差异，需要单独排查。
- 队列只在渲染进程内存中，应用重启或渲染进程重载会丢失（设计取舍，与草稿一致）。
- 渲染进程重载后恢复的运行（recovered run）结束时也会继续发出队列，但重载本身已清空队列，实际只影响重载后新排的消息。

## 后续建议

- Electron 实机验收通过后，把计划移到 `completed/` 并更新 `docs/exec-plans/README.md`。
