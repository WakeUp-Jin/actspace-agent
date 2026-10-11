## [2026-10-07 22:35] | Task: 修复桌面验收 B03、B08、B12

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: Codex 主智能体；真实 Computer Use 由指定的 `gpt-6.1-sol` 子智能体执行。
- **Runtime**: Codex desktop，本地 main 工作区。

### 📥 User Query

> 先修复 Review 不自动更新、断开智谱后仍参与搜索、新建工作树未生效这三个 bug。方案已批准。

### 🛠 Changes Overview

**Scope:** desktop、shared、client、runtime、agent-service、session-journal。

- B03：对已经授权并进入Review的工作区安装文件监听，包含linked-worktree外置Git目录与共同refs；过滤lock噪声，复用coordinator合并通知，退出关闭监听。
- B08：搜索端口每次调用读取最新凭据，同端口断开/重连/换Key即时作用于后续请求。
- B12：将运行位置与起点分支从新建页送入建会话IPC，主进程复用Git准备/回滚服务，真实cwd与可选worktree绑定写入Session header；快照、列表、fork、client投影保留绑定。新建按钮统一延迟创建至首次发送，避免提前建本机会话吞掉工作树选择；创建失败不提交任务、不回退原仓库。
- 新增真实Git/文件监听、动态凭据、IPC与输入边界、App首发、冷重开和header兼容回归。

### 🧠 Design Intent (Why)

三项均为跨层事实没有持续传递：Review缺外部变更输入、搜索端口缓存创建时凭据、工作树选择只停在UI。修复对应断点并复用既有服务，避免添加第二套会话存储或重建Runtime来掩盖问题。

### 📁 Files Modified

- `apps/desktop/src/main/review-workspace-watcher.ts`
- `apps/desktop/src/main/runtime-v2/{desktop-shell-ipc,tool-host-services,fixed-renderer-ipc,runtime-registry}.ts`
- `apps/desktop/src/renderer/{App.tsx,session/session-gateway.ts}`
- `packages/session/journal/src/header.ts`
- `packages/runtime/src/{session/session-controller,projection/durable-session}.ts`
- `packages/agent-service/src/application.ts`
- shared/client契约和投影；对应测试见执行记录。

### 验证与剩余门禁

- 完整Desktop：1680通过、2跳过；受影响shared/client/journal/agent-service包：230通过；Runtime投影及冷重开19通过。
- 独立新增linked-worktree监听1项、header兼容/fork1项通过；IPC channel、renderer bridge、包边界检查通过。
- 构建与typecheck、真实Electron复验及恢复结果以[执行摘要](../../exec-runs/20261007-desktop-acceptance-b03-b08-b12/execution-summary.md)为准；此记录在复验中持续更新。
- 其它验收问题仍只记录，未纳入修复。主智能体未暂存、提交或推送；工作期间外部提交收录了一部分变更，后续以当前工作区继续验证。
- 命中“可迁移、陷阱、模式”，补充[长生命周期工具端口与实时配置](../../learnings/2026-10/live-configuration-in-long-lived-ports.md)。

- 真实Electron：B03连续外部新增/撤销均自动刷新；B08同会话断开后仅Tavily、原配置恢复2/4；B12真实创建与切换、正常冷重启后的工具cwd/branch一致，均通过。逐项截图与恢复范围见执行摘要。
