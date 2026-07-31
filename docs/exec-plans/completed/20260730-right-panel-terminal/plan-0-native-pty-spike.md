# Plan 0：native PTY 与制品链路技术验证

## 目标

在不接入右侧面板、Terminal IPC 和产品会话的前提下，证明 `node-pty` 可在 ActSpace 当前 Electron 39、macOS arm64、pnpm deploy 和签名链路中稳定工作，并形成可审查的 Go / No-Go 结论。

## 准入条件

- 用户已批准本计划的文件范围、依赖变化和本机制品验证。
- 开始时重新检查 `git status --short --branch`，不覆盖用户或其他任务的变更。
- 重新读取 `AGENTS.md`、`docs/REPO_COLLAB_GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/CODING_BEHAVIOR.md`、`docs/SECURITY.md`、`docs/SUPPLY_CHAIN_SECURITY.md` 和本计划。

## 允许修改的范围

- `packages/desktop/package.json`
- `pnpm-lock.yaml`
- `scripts/terminal-native-spike/`
- 本计划文件，记录命令、制品和结果
- 本轮 history 与必要的 learning 文档

禁止修改：

- `packages/shared/src/ipc.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/**`
- `scripts/release-package.sh`
- 任何 Agent Bash 工具、审批、沙盒或任务注册表

## 实验设计

### Task 0.1：锁定候选依赖

- 以本机 Codex Desktop 已使用的稳定 `node-pty@1.1.0` 作为第一候选。
- 使用 `--save-exact` 写入精确版本，不使用 caret，不直接复制 Cursor 的 beta 版本。
- 查看安装包中的 native 文件、build scripts、license 和依赖树，把供应链结论记入本文。

验证：

- `pnpm why node-pty`
- `pnpm list --filter @actspace/desktop node-pty`
- 记录 package version、license、postinstall / build 行为和 native artifact 位置。

失败回退：

- 候选版本安装、license 或 ABI 不符合时，先回退该依赖变更，记录 No-Go 证据；未经用户确认不连续试用多个未审查版本。

### Task 0.2：构建隔离 Electron spike

在 `scripts/terminal-native-spike/` 创建与产品 renderer / preload 无关的最小 Electron 入口，它只执行：

1. 从明确 cwd 启动默认 shell。
2. 发送 `pwd`、ANSI 输出和中文输出。
3. 执行一个可中断的前台命令并发送 Ctrl+C。
4. 启动一个子孙常驻进程，关闭 PTY 后检查其不再存活。
5. 调用 resize，记录 cols / rows 变化后的行为。
6. 产生有限压力输出，使用可控测试背压骨架，不运行无界 `yes`。

spike 用结构化 JSON 输出每个断言的通过 / 失败、PID、exit code、字节数和耗时，不记录用户环境变量值。

验证：

- spike 进程以非交互命令返回明确 exit code。
- 一次失败定位到具体断言，不依赖人工观察“好像正常”。

### Task 0.3：Electron ABI 和架构验证

- 使用当前 Desktop package 的 Electron 39 对 `node-pty` 进行可重复 rebuild。
- 检查 `pty.node`、`spawn-helper` 和 Electron executable 架构。
- 确认 `spawn-helper` 具有可执行权限。
- 将 rebuild 命令收口为 package script 或专用脚本，不只把一次性终端命令记在聊天中。

验证：

- `file <electron executable>`
- `file <pty.node>`
- `file <spawn-helper>`
- 用当前 Electron executable 运行 spike，不用系统 Node 代替 ABI 验证。

### Task 0.4：deploy 和打包验证

- 运行 Desktop production deploy，确认 `node-pty` 和 native artifacts 进入 deploy 目录。
- 构建一个基于同一 Electron runtime、同一 deploy 产物和同一签名顺序的临时 spike `.app`。
- 临时制品使用 `mktemp -d` 的精确目录，不删除工作区、仓库根或用户家目录。
- 先签名 `pty.node` 和 `spawn-helper`，再签名外层 `.app`。
- 从 Finder 启动等价的图形应用环境运行 spike，验证 login-shell PATH 问题。

验证：

- `pnpm --filter @actspace/desktop --prod deploy --legacy ...`
- native artifact 存在与权限检查。
- `codesign --verify --deep --strict --verbose=2 <spike.app>`
- 打包制品的结构化 spike 结果。
- 制品退出后检查子孙进程不存在。

### Task 0.5：输出 Go / No-Go 报告

在本文追加实施记录，必须包含：

- 实际锁定的 Electron、Node ABI、`node-pty` 和目标架构。
- 开发态和打包制品的测试结果。
- Ctrl+C、resize、子孙清理和压力输出的证据。
- deploy 后 native artifact 位置、权限和签名顺序。
- 未解决风险、是否阻断产品实现和最小后续建议。

结论只能是：

- `Go`：设计文档 Phase 0 六条通过条件全部有证据。
- `No-Go`：任一通过条件未满足。

不使用“基本通过”、“应该可以”或“打包以后再看”作为结论。

## 验证命令类别

- 依赖与供应链：`pnpm list`、`pnpm why`、package metadata 检查。
- 工程：Desktop typecheck / build，专用 spike 测试。
- native：Electron rebuild、`file`、文件权限、addon 加载。
- 制品：production deploy、临时 `.app`、nested codesign、外层 codesign。
- 进程：PID / process group / descendant 检查，不使用模糊进程名全局杀进程。
- 仓库：`pnpm check:docs`、`pnpm check:repo`、`git diff --check`。

## 进度记录

- [x] 用户批准 Plan 0。
- [x] 锁定并审查 `node-pty@1.1.0`。
- [x] 完成隔离 Electron spike。
- [x] 完成 ABI / architecture / process-tree 验证。
- [x] 完成 deploy / codesign / packaged app 验证。
- [x] 记录 Go / No-Go 结论。
- [x] 用户批准全部计划后进入 Plan 1。

## 实施记录与结论

- Electron：`39.8.10`；Electron Node：`22.22.1`；modules ABI：`140`；N-API：`10`。
- 目标平台：macOS arm64；`node-pty`：`1.1.0`，使用包内 `prebuilds/darwin-arm64/pty.node` 与 `spawn-helper`。
- 开发态 Electron spike 通过 cwd、ANSI、中文、`80×24 -> 101×37` resize、Ctrl+C、约 224 KiB 压力输出、pause / resume 和子孙进程清理。
- production deploy 临时 `.app` 使用同一 Electron runtime 和 production dependencies；嵌套 native 文件 ad-hoc 签名后通过各自 strict 校验，外层应用按现有本地发布基线通过签名验证并成功运行同一组断言。
- `spawn-helper` 安装后可能缺少 executable bit，因此引入显式 `native:prepare`，不依赖包管理器忽略的 install script。
- 原始 Electron.app 即无法通过本项目期望的 strict deep 资源封印验证；Developer ID 发布仍以正式 identity、nested signing、outer signing 和 notarization 为独立门禁。

结论：**Go**。native addon、架构、权限、PTY 行为、背压骨架、进程树与打包应用均有可重复证据，不阻断产品实现。
