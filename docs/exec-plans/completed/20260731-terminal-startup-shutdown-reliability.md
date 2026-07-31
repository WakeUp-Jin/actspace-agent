# Terminal 启动、关闭与开发进程可靠性修复计划

## 目标

修复本地开发命令收到 Ctrl+C 后无法可靠退出的问题，消除数据目录重复初始化日志，并把右侧 Terminal 的首次启动与关闭过程变成单一、可见、可回收的状态流；保持现有 PTY 安全边界、背压和会话归属不变。

## 范围

- 包含：
  - 用 Node 进程监督器管理 desktop dev 子进程组、日志复制和 SIGINT / SIGTERM 转发。
  - 将 `ensureDataDirectories()` 改为失败可重试的 single-flight 初始化。
  - Terminal 点击后立即创建 starting Tab，并行执行 PTY 创建与 xterm chunk 加载。
  - Terminal 创建失败时保留明确错误 Tab；用户提前关闭 starting Tab 时回收随后创建成功的 PTY。
  - Terminal Tab 关闭期间显示 `Closing…` 并阻止重复关闭。
  - 更新可靠性、Terminal 设计、测试、history 和计划状态。
- 不包含：
  - 修改 Agent Bash、Terminal IPC 契约或 `node-pty` backend 架构。
  - 引入独立 PTY Host、跨 App 重启持久化或新的终端 addon。
  - 调整终端颜色、字体、scrollback、背压阈值和数量上限。

## 背景

- 相关文档：
  - `docs/RELIABILITY.md`
  - `docs/FRONTEND_VERIFICATION.md`
  - `docs/design-docs/frontend/front-右侧终端与会话生命周期规范.md`
- 相关代码路径：
  - `scripts/dev-with-logs.sh`
  - `packages/desktop/package.json`
  - `packages/desktop/src/main/index.ts`
  - `packages/desktop/src/renderer/components/RightPanel.tsx`
  - `packages/desktop/src/renderer/components/right-panel/RightPanelContext.tsx`
  - `packages/desktop/src/renderer/components/right-panel/useOpenTerminal.ts`
- 已知约束：
  - renderer 仍只能通过 typed preload 创建和关闭 Terminal。
  - 未使用 Terminal 时不得在应用启动关键路径加载 xterm 或 `node-pty`。
  - 关闭 Tab 必须先确认 main 已完成资源清理，不能静默遗留 shell。
  - 所有 UI 颜色只使用现有主题语义 token。

## 风险

- 风险：进程监督器错误地只终止直接子进程，留下 Vite、tsc 或 Electron 后代。
  - 缓解方式：Unix 为受管命令创建独立进程组，信号发送到整个进程组；增加真实 Ctrl+C smoke 和退出后进程检查。
- 风险：用户在 Terminal 创建期间关闭 Tab，PTY 创建完成后成为无 UI 的孤儿会话。
  - 缓解方式：Context 提供“仅当原 Tab 仍存在才替换”的原子方法；替换失败时立即调用 close IPC。
- 风险：数据目录初始化失败被永久缓存。
  - 缓解方式：初始化 Promise reject 时清空缓存，下一次调用允许重试。

## 里程碑

1. 开发进程监督器与日志链路。
2. main 初始化 single-flight。
3. Terminal starting / error / closing 状态与并行加载。
4. 自动化、真实 Electron 和 Ctrl+C 验证。
5. 文档、history、学习沉淀与计划归档。

## 验证方式

- 命令：
  - `pnpm run test:dev-runner`
  - `pnpm --filter @actspace/desktop exec vitest run src/renderer/test/right-panel-kairos.test.tsx src/main/terminal/test/terminal-session-service.test.ts`
  - `pnpm typecheck`
  - `pnpm build`
  - `pnpm check:frontend-theme`
  - `pnpm run ci`
  - `git diff --check`
- 手工检查：
  - 首次点击 Terminal 后立即出现 starting Tab，最终只进入一次真实终端视图。
  - 关闭 Terminal 时 Tab 显示 `Closing…`，随后 shell PID 消失。
  - 浅色、深色主题下 starting / error / closing 状态均可读。
- 观测检查：
  - `pnpm dev:log` 收到 Ctrl+C 后，Vite、tsc、Electron 和子 shell 均退出。
  - `logs/latest-dev.log` 仍持续接收 stdout / stderr，且数据目录初始化日志每次 App 启动只出现一次。

## 进度记录

- [x] 完成源码审计、真实 Electron 测量和方案批准。
- [x] 完成开发进程监督器与 single-flight 初始化。
- [x] 完成 Terminal 状态流和并行加载。
- [x] 完成自动化与真实 Electron 验证。
- [x] 完成文档、history 和计划归档。

## 决策记录

- 2026-07-31：不只修 `dev-with-logs.sh`；真实验证表明直接 `pnpm dev` 也无法稳定响应 Ctrl+C，因此由 Node 监督器统一承担进程组和日志职责。
- 2026-07-31：保持“main 确认清理后再移除 Tab”的正确性语义，用 `Closing…` 补足感知反馈，不采用先隐藏 UI、后台 best-effort 清理的方案。
- 2026-07-31：继续懒加载 xterm，但在用户明确触发或 hover / focus 时预取；PTY 创建与 renderer chunk 加载并行，不把 xterm放回应用启动关键路径。
