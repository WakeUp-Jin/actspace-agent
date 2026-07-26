# 会话 Fork 与 Copy 执行计划

## 目标

在左侧会话行右键菜单中增加 `Copy ID`、`Copy Transcript` 与 `Fork`，让用户能复制稳定的会话标识、导出可读对话文本，并从当前持久化事实创建一个可继续交互的独立会话分支。

## 范围

- 包含：
  - `Copy` 二级菜单与 `Fork` 菜单项。
  - 仅导出 User / Assistant 正文与附件名的 Markdown transcript。
  - Fork 复制 session 目录内的事件、Context 状态、附件、SubAgent transcript 与其他会话 sidecar。
  - Fork 重写新会话的 `sessionId` 和会话目录绝对路径引用，并继承原 workspace。
  - 运行中或等待审批的会话禁止 Fork。
  - shared 契约、preload、IPC、renderer、测试、设计文档与 history 同步。
- 不包含：
  - Mark as Unread。
  - 按某一条消息截断 Fork；本轮只支持从会话当前已持久化 head 分叉。
  - 复制 Thinking、工具原始输出或 diff 到剪贴板 transcript。

## 背景

- 相关文档：
  - `docs/design-docs/core-storage-and-observability.md`
  - `docs/design-docs/frontend/front-左侧会话栏规范.md`
  - `docs/FRONTEND_VERIFICATION.md`
- 相关代码路径：
  - `packages/agent-core/src/persistence/session-store.ts`
  - `packages/shared/src/ipc.ts`
  - `packages/desktop/src/main/index.ts`
  - `packages/desktop/src/preload/index.ts`
  - `packages/desktop/src/renderer/App.tsx`
  - `packages/desktop/src/renderer/components/Sidebar.tsx`
- 已知约束：
  - renderer 不直接访问文件系统，Fork 必须走 preload + IPC。
  - `session.jsonl` 是恢复事实来源，Fork 后的事件顶层 `sessionId` 不能继续指向源会话。
  - 当前 worktree 有其他未提交修改，所有编辑必须保持外科手术式范围，不覆盖相邻改动。

## 风险

- 风险：复制过程中保留旧 `sessionId` 或旧 session 绝对路径，导致恢复、Context 或 SubAgent transcript 串回源会话。
- 缓解方式：对 session 目录内结构化 JSON / JSONL 做键感知重写，并用持久化测试覆盖主事件、Context 与 SubAgent sidecar。
- 风险：运行中复制到半截 turn。
- 缓解方式：renderer 禁用操作，main 进程再次检查 active turn 并拒绝。
- 风险：剪贴板 transcript 过长或泄露工具原始输出。
- 缓解方式：只序列化 User / Assistant 与附件名，不读取工具 raw payload。

## 里程碑

1. 先补 Fork 持久化、Transcript 格式化和菜单交互测试。
2. 实现 agent-core Fork、shared IPC 与 Electron bridge。
3. 接入 App / Workbench / Sidebar 行为并验证交互。
4. 同步设计文档、history，完成工程与桌面验收。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/agent-core test -- src/persistence/test/session-store.test.ts`
  - `pnpm --filter @actspace/shared test`
  - `pnpm --filter @actspace/desktop test -- src/renderer/test/sidebar.test.tsx`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm check:frontend-theme`
  - `pnpm check:docs`
- 手工检查：
  - 右键菜单 Copy 子菜单 hover / click / keyboard 可达。
  - Copy ID 与 Copy Transcript 写入预期文本。
  - Fork 后自动打开新会话，源会话不变，新会话可继续发送消息。
  - 浅色、深色主题下菜单层级、边框、hover 与 disabled 状态正确。
- 观测检查：
  - Fork 后新 session 目录拥有独立 `meta.json` / `session.jsonl`。
  - 新事件与 Context 的 `sessionId` 指向新会话。

## 进度记录

- [x] 2026-07-26：确认产品语义、代码边界与现有脏 worktree 风险。
- [x] 2026-07-26：完成持久化、shared formatter、Electron bridge、renderer 菜单与行为测试。
- [x] 2026-07-26：同步存储、Sidebar 设计文档、history 与学习笔记。
- [x] 2026-07-26：定向测试、仓库 typecheck/build、主题/文档检查与浏览器交互验收通过；Electron 主进程成功加载新 preload 与开发 renderer。

## 决策记录

- 2026-07-26：Fork 复制会话当前已持久化 head，不做消息级截断，保持首版边界清晰。
- 2026-07-26：Transcript 只包含 User / Assistant 正文和附件名，避免把 Thinking、工具输出与 diff 扩散到剪贴板。
- 2026-07-26：新标题使用 `<原题> (fork)`，继承 workspace 与 turnCount，但默认取消 pinned / archived 状态。
