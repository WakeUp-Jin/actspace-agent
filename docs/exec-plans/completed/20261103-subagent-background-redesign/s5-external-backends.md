# S5 外部子智能体（Codex / Claude Code）

## 目标

两个可选插件，用本机的 `codex` / `claude` 跑一次性子智能体，返回最终回复与原生会话记录路径，路径登记进活跃路径并免审批读取。默认关闭。

## 范围

- 包含：设计 [04](../../../design-docs/子智能体和后台任务设计规范/04-外部子智能体设计规范.md) 全部（插件页的展示由 S6 做）。
- 不包含：续聊、打包 CLI、ACP、结构化输出。

## 必读

- 设计 04；S3 的 `SubagentManager`（外部子智能体也走它的并发计数、事件、通知、`list_agents`）；S1 的 `actspace.host-readable-files`
- `~/.claude/skills/codex-cu/scripts/codex-cu.mjs`（app-server 的 initialize → thread/start → turn/start → turn/completed、item/completed、turn/interrupt 用法）
- `codex app-server` 协议类型：本机 `codex app-server generate-ts --out <临时目录>` 生成后看 `v2/Thread.ts`、`ThreadStartParams`
- `claude --help`（`-p`、`--output-format stream-json`、`--verbose`、`--session-id`、`--permission-mode`、`--model`）
- DSH：`tmp/deepseek-harness/packages/subagent/{subagent-codex,subagent-claude-code}/`
- 插件清单与 manifest `display`：`packages/core/runtime/src/plugin-catalog.ts`、[02 插件结构设计](../../../design-docs/架构优化/02-插件结构设计.md) §5

## 步骤

1. **外部后端接口**：`packages/subagent/subagent/src/external.ts` 定义 `ExternalSubagentBackend { kind; available(): Promise<{ ok: true; command: string } | { ok: false; reason: string }>; start(input: { prompt; cwd; model?; signal }): Promise<ExternalRun> }`，`ExternalRun { transcriptPath; result: Promise<{ status; text; error? }>; interrupt(): Promise<void> }`。`SubagentManager` 新增 `spawnExternal(backend, args)`：写 `subagent/spawned`（`kind`）、`subagent/activation`，等记录文件出现（最多 10 秒），把路径加进 `actspace.host-readable-files`，结束时写 `settle`、发通知（summary 用外部文案），状态 `closed`。`send_message` 对 `closed` 返回设计 04 的错误。重启时 `recoverLost` 把外部激活标 `lost`，并从 `subagent/spawned` 恢复放行名单。
2. **CLI 查找**：`packages/subagent/subagent/src/external-cli.ts`：`resolveCommand(name)` 用 `$SHELL -lc 'command -v <name>'`（超时 5 秒），缓存到插件重载。
3. **Codex 包** `packages/subagent/subagent-codex`（`@actspace/subagent-codex`，manifest、`plugin.ts`、`backend.ts`、README、测试）：
   - 起 `codex app-server`，JSON-RPC 按行读写；`initialize`、`initialized`、`thread/start { cwd, approvalPolicy, sandbox, model?, ephemeral: false }`，记录路径 = 返回的 `thread.path`；`turn/start`；收集 `item/completed` 的 `agentMessage`；`turn/completed` 结束。
   - 服务端请求（审批、elicitation）一律回错误拒绝。
   - 停止：`turn/interrupt`，2 秒后杀进程。
   - 设置：`approvalPolicy`（默认 `never`）、`sandbox`（默认 `workspace-write`），放插件配置。
   - 注册工具 `agent_codex`，描述逐字照设计 04 §2。
4. **Claude Code 包** `packages/subagent/subagent-claude-code`（`@actspace/subagent-claude-code`）：
   - 生成 UUID；记录路径 `~/.claude/projects/<编码 cwd>/<uuid>.jsonl`，编码函数单独导出并用真实运行核对一次；
   - 起 `claude -p --output-format stream-json --verbose --session-id <uuid> --permission-mode <模式> [--model]`，prompt 写 stdin 后关闭；读到 `type: "result"` 取 `result` / `is_error`；
   - 停止：`SIGTERM`，2 秒后 `SIGKILL`；
   - 设置：`permissionMode`（默认 `dontAsk`）；
   - 注册工具 `agent_claude_code`。
5. **登记**：两个包加入插件清单，`display` 为 `{ scope: "session", defaultEnabled: false, canDisable: true }`；`host` 要求进程能力（不可用时插件页显示原因，见 S6）。`agent-mode-policy.ts` 的 `agent` 模式已在 S3 加入两个工具名。生成文件用脚本重新生成。
6. **错误文字**：退出码非 0、没登录、流解析失败时 `status: "failed"`，summary 带 CLI 错误首行；找不到 CLI 时插件 `available()` 返回 `本机没有找到 codex 命令` / `本机没有找到 claude 命令`。

## 验证

- 单测（不调真实 CLI）：用假可执行脚本（放测试临时目录、写死 JSON-RPC / stream-json 输出）覆盖成功、失败、中断、记录文件迟到、找不到命令。
- 真实运行（手工，本机已装 codex-cli 0.163.0、Claude Code 2.1.317）：各跑一个「列出 packages/subagent 下的包」任务，确认记录路径存在、能免审批读取、通知带最终回复；记录到执行过程文档。
- 权限测试：放行名单里的精确文件放行，同目录其他文件仍要审批。
- `pnpm check:packages`、`pnpm test:plugin-catalog`、`pnpm test:package-readmes` + 统一验证命令。

## 回滚

revert 本提交：两个包与工具消失；已记录的外部子智能体在父会话里仍可显示（事件由 S1 支持）。
