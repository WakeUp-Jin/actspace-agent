## 2026-10-06 00:05 | Task: Desktop 前端重构 10：冗余清理

### 执行上下文

- Agent：Claude Code 主智能体；只读复核子智能体用 Sonnet 5.5。
- Base Model：Claude Opus 5.5。
- Runtime：Claude Code CLI，本机仓库；分支 `refactor/desktop-fe-10`，squash 回 `refactor/desktop-frontend`。Electron 检查用 CDP。
- 状态：完成，已交给验收。

### 用户诉求

> 按 00 总执行计划连续执行 Desktop 前端重构；第一份是 10：删除已确认无用的文件、prop、分支、目录和 channel，让轨迹 fixture 不再进入生产包，用户功能不变。

### 主要改动

- 删除只被测试引用的 LabPage、ExploreRunBlock 和 Sheet，以及它们的测试。token 检查脚本不再为 LabPage 设跳过名单。Lab 导航占位页保留。
- 删除没有调用方的 `terminal-ipc.ts` 和 4 个空目录。
- 删除 `projection-ipc.ts`（18 个 handler）以及 `approvalRequired` / `liveEvent` 的发送端。`shared/runtime-v2/desktop-ipc.ts` 只保留仍被引用的类型。
- 删除 DESKTOP_SHELL 命名空间的重复注册、`capabilities` handler 和双发事件，删除 `shared/runtime-v2/desktop-shell.ts`。现在只剩 FIXED 一套 channel。
- 删除 Composer 链路上的死 prop（`agentForm`、`onAgentFormChange`、`locked`），以及 `useSessionProjection` 和 `handleSend` 中的裸块。
- 轨迹 fixture 改为在 DEV / test 守卫内动态 import。生产主 chunk 少了 42,538 字节，产物里搜不到 fixture。新增懒加载测试。
- 07、08、01、05 和 README 标注执行结果，并更正过期描述。

### 设计动机

后面 13–16 要重写 IPC、状态层和组件，先把没有消费者的代码删掉，避免它们被误当成需要迁移的接口。删除 channel 前，先 grep 了 channel 的**字符串值**，而不只是常量名，排除 preload 用字面量订阅的可能。

### 学习沉淀

命中「可迁移」和「有陷阱」，写了 [让只在开发时用的代码真正离开生产包](../../learnings/2026-10/20261006-dev-only-code-out-of-bundle.md)。

### 文件

- `apps/desktop/src/main/index.ts`、`main/runtime-v2/desktop-shell-ipc.ts`，以及删除的 `main/runtime-v2/projection-ipc.ts`、`main/terminal/terminal-ipc.ts`
- `apps/desktop/src/renderer/App.tsx`、`components/{Composer,ConversationView,WorkbenchLayout,TrajectoryView}.tsx`、`session/SessionProjectionContext.tsx`、`trajectory/index.ts`，以及删除的 `components/LabPage.tsx`、`components/messages/ExploreRunBlock.tsx`、`components/ui/Sheet.tsx`
- `apps/desktop/src/{main,renderer}/test/*`（删除 4 个、改写 1 个、新增 1 个用例）、`renderer/test/fixtures/*-preview.tsx`
- `apps/desktop/tsconfig.electron.json`
- `packages/shared/src/runtime-v2/{desktop-ipc,index}.ts`，以及删除的 `desktop-shell.ts`
- `scripts/check-frontend-design-tokens.mjs`、`scripts/test/frontend-design-tokens.test.mjs`
- `docs/desktop-frontend-refactor/{README,01,05,07,08}`、`docs/learnings/2026-05/agent-transparent-inspection-via-sheet.md`、`docs/learnings/2026-10/20261006-dev-only-code-out-of-bundle.md`
- `docs/exec-runs/20261005-desktop-fe-10-redundancy-cleanup/`
