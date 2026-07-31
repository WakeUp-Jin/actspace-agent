## [2026-07-31 01:30] | Task: 修复 Terminal 启动、关闭与开发进程退出

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> Terminal 第一次点击会加载，启动开发环境后 Ctrl+C 不好关闭；分析性能和内存负担后，批准按建议完成修复。

### 🛠 Changes Overview

**Scope:** 本地开发进程监督、Electron main 初始化、右侧 Terminal 状态流与可靠性验证

**Key Actions:**

- **[Dev supervisor]**: 用 Node 监督器替代 `pnpm dev | tee` 管道；受管命令使用独立进程组，SIGINT / SIGTERM 转发到整棵子进程树，超时后再 SIGKILL；根命令报错退出时也收割残留进程组，日志由监督器同时写终端和 `logs/latest-dev.log`。
- **[Single-flight init]**: 数据目录初始化 Promise 只执行和记录一次；失败后清空缓存，后续调用仍可重试。
- **[Terminal startup]**: 点击后立即创建 `Starting…` Tab，PTY 创建与 xterm 动态模块加载并行；成功后原位替换，失败时保留明确错误状态。
- **[Cancellation safety]**: 用户在创建期间关闭 Tab 时记录 request cancellation；如果 PTY 随后创建成功，立即调用 main close 回收，避免隐藏会话。
- **[Closing feedback]**: 运行中 Terminal 关闭时显示 `Closing…`、禁用重复点击，main 确认进程树清理后才移除 Tab。
- **[Verification]**: 新增进程组、CLI / `pnpm dev` SIGINT、失败阶段孤儿进程测试，以及 renderer starting / closing / cancellation 测试；完成 593 个 Desktop 测试、production build、主题门禁和真实 Electron 状态/PID 验收。

### 🧠 Design Intent (Why)

日志复制、开发 watcher 和 Electron 必须由一个明确的进程所有者治理，否则 Ctrl+C 很容易只写入 PTY 或命中中间 wrapper。Terminal 的 UI 生命周期也不能晚于底层资源生命周期：先建立可关闭的 starting 对象，再在完成回调中处理取消和补偿性清理，才能同时改善感知速度并避免后台孤儿资源。

### 📁 Key Files

- `scripts/desktop-dev.mjs`
- `scripts/dev-process-runner.mjs`
- `scripts/test/dev-process-runner.test.mjs`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/renderer/components/RightPanel.tsx`
- `packages/desktop/src/renderer/components/right-panel/useOpenTerminal.ts`
- `packages/desktop/src/renderer/components/right-panel/terminal-render-loader.ts`
- `packages/desktop/src/renderer/test/right-panel-kairos.test.tsx`
- `docs/RELIABILITY.md`
- `docs/design-docs/frontend/front-右侧终端与会话生命周期规范.md`
