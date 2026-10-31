# 子进程执行规范

## 边界

工具可通过 Host 端口运行受控 CLI，例如 Grep/Glob 使用 `rg`，Bash 执行经过权限 admission 的命令。进程创建不能自行绕过 Tool Runtime 的资源、审批和 Host ceiling。

- 使用 `spawn` / `execFile`，命令与 argv 分开；Grep/Glob 不拼接 shell 字符串。
- workspace、canonical path、Session Grant 与 artifact 例外由资源/权限层判定；执行前复验已批准资源。
- runner 处理 timeout、abort、输出上限、退出码和清理；工具层解释命令语义。
- stdout/stderr 必须有界；超限明确标记，不能将输出截断自动视为业务成功。

## 当前 Grep/Glob Host 实现

入口为 `packages/tools/filesystem-search/src/node-ports.ts`。

- 使用显式 `ripgrepPath`；未提供时通过 PATH 启动 `rg`。
- 当前没有 `ACTSPACE_RG_PATH` 自动解析、版本探测或 bundled `@vscode/ripgrep` fallback。
- 默认 timeout 为 15 秒；stdout/stderr 各保留最多 128,000 字符；timeout / abort 发送 SIGTERM。
- exit 1 表示无匹配；其他非零退出按失败处理。ENOENT 返回缺少 ripgrep 的清晰提示。
- Grep 的 pattern 在 `--` 后作为单独参数传入；`glob` 仅是过滤条件。
- Glob 使用 `rg --files`；简单文件名 pattern 补成递归匹配，结果按 mtime 降序、路径次序排序，最多展示 200 项。

## 当前 Bash Host 实现

入口为 `packages/tools/shell-tools/src/plugin.ts`、`command-rules.ts`、`node-ports.ts`。

- Bash permission 合同先提取 process resource，再应用命令 hard guard；通过后 default 请求审批或匹配已有会话前缀授权，full-access 自动放行。模式切换会撤销旧等待并重新评估；硬拒绝在所有模式下生效，沙箱只在 `default`、`auto-review` 下生效，`full-access` 不进沙箱（见[沙箱设计](../execution-safety/agent-沙箱设计.md)第 9 节）。
- macOS 使用 `/bin/zsh -lc`，其他平台使用 `/bin/bash -lc`；沙箱经 Harness `sandbox` 服务（macOS：nono，其次 Seatbelt）。这是 Bash 工具专用 shell 边界。
- block 等待默认 30 秒；超过等待边界转为后台任务，不等于命令失败；后台任务登记到 Host 的后台任务登记表，完成时自动通知 Agent，Agent 用 `task_output` / `task_stop` / `task_wait` 查看和管理（见 [后台任务](../collaboration/agent-background-tasks.md)）。
- 每 Session 最多 8 个后台任务，运行上限 30 分钟；进程注册表属于 Host 端口并在 dispose 时关闭。
- 内存输出头部最多 8,000 字符，磁盘上限 5 Mi 字符，超限终止进程并标记截断。长前台输出经受管 artifact 回读。
- 终止先发 SIGTERM，500ms 后需要时升级 SIGKILL；平台支持时针对进程组发送。

输出事实与 artifact 规则见[工具输出与引用](agent-tool-output-references.md)，权限见[执行安全入口](../execution-safety/README.md)。

## 后续共用 helper 的约束

若提取共用 runner，必须保留各工具现有的权限、退出码、后台任务和输出治理语义。建议返回 stdout、stderr、exitCode、signal、duration、timedOut、truncated 与启动失败；不能用一个通用 timeout 接口抹掉 Bash 的后台生命周期。

这是一项待评审的内部整理方向，不是已有 `run-process.ts` 实现。当前验收仍直接覆盖各 package 的 Node 端口：退出码、参数边界、超限、abort、后台清理与权限复验。

取消检查必须位于异步路径解析、沙箱准备之后且 spawn 之前，防止准备期间已取消的调用仍创建进程。`blockMs` 到期表示转后台，返回 taskId；不应把它解释为命令执行失败。
