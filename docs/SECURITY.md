# 安全默认约束

这份文档用于把安全默认值讲清楚，避免实现逐步演进时越走越散。

## 密钥与环境变量管理

- **不提交密钥**：`.env` 已在 `.gitignore` 中，API Key 等敏感值只存在本地 `.env` 文件或系统环境变量中。
- **模板文件**：`.env.example` 列出全部可配置项和说明，新开发者克隆仓库后复制为 `.env` 即可。
- **集中管理**：所有环境变量通过 `packages/agent-core/src/env.ts` 统一读取和验证，禁止在业务代码中散落 `process.env.XXX` 直接读取。
- **DeepSeek API 格式边界**：`DEEPSEEK_API_FORMAT=openai|anthropic` 只影响 agent-core 里的 DeepSeek service 选择。当前默认是 `anthropic`，使用 `DEEPSEEK_ANTHROPIC_BASE_URL`；`openai` 是临时回退路线，使用 `DEEPSEEK_BASE_URL`。两个 base URL 都不应传入 renderer。
- **Kimi key 边界**：`KIMI_API_KEY` 可作为 Kimi 主模型密钥，也可作为 DeepSeek 主模型的联网搜索、网页读取和多模态辅助密钥。该 key 只在 main/agent-core 运行时读取，不进入 renderer、session 事件、前端状态或测试快照。
- **工具暴露最小化**：可通过 `ACTSPACE_DISABLED_TOOLS` 明确关闭不希望暴露给模型的工具，关闭发生在注册阶段，而不是只在执行时拒绝。
- **优先级**：`process.env` 已有值 > `.env` 文件值 > schema 默认值。这保证 CI/Docker 场景可通过系统变量覆盖。
- **验证前置**：`loadEnv()` 在应用启动时尽早调用，缺失 required 字段或值不合法时立即抛 `EnvValidationError`，不让无效配置流入运行时。
- **冻结对象**：解析后的 `env` 对象通过 `Object.freeze()` 冻结，运行时不可篡改。
- **提交前密钥扫描**：`scripts/check-secrets.sh` 会扫描仓库文本文件（包含 `logs/`）里的疑似 API Key、Bearer token、Authorization header 和非空 key 环境变量赋值；`scripts/check-repo-hygiene.sh` 与 `.githooks/pre-push` 都会调用它。新 clone 后运行 `scripts/install-git-hooks.sh`，把本地 Git 的 `core.hooksPath` 指向仓库内 `.githooks/`。

## Electron 进程隔离

- 使用 `contextIsolation: true` + `nodeIntegration: false`，renderer 不能直接访问 Node.js API。
- preload 通过 `contextBridge` 只暴露最小、类型化的 bridge API。
- 环境变量（含 API Key）只在 main 进程中可见，不会泄露到 renderer。
- 本地更新只通过 main 进程 IPC 暴露结构化操作：选择源码目录、读取状态、启动更新。renderer 不传 shell 命令；main 会验证所选目录是 `name: "actspace"` 且包含 `package:desktop:dmg` 与 `scripts/release-package.sh` 后，才写入 helper 脚本。helper 位于 `<userData>/tmp/local-update/`，日志写同目录 `update.log`。

## 文件系统访问控制

- **写类工具受 workspace 守卫**：`write_file` / `edit_file` / `bash` 的文件/目录写操作必须经 `workspace-guard.ts#guardWorkspacePath`，禁止 `..` 逃逸、禁止逃出 `workspaceRoot`。
- **读类工具放开 workspace 边界**：`read_file` / `grep` / `glob` / `list_directory` 改用 `workspace-guard.ts#resolveReadablePath`，**只解析路径、不做越界检查**。原因：上下文压缩会把 bash 大输出落盘到 `<userData>/tmp/tool-output/`、把完整历史指向 `<userData>/sessions/<id>/session.jsonl`，模型需要用读类工具回读这些 workspace 之外的 Agent 内部产物（见 `docs/design-docs/agent-context-compression.md`「读边界放开」）。
  - **本期明确接受的取舍**：放开读边界后，主 Agent 理论上可读任意本机文件（含 `~/.ssh`、密钥文件等）。用「读不应被 workspace 硬框」换「可回读 Agent 内部产物」。
  - **Kairos 不受影响**：Kairos 调用路径在 scheduler 层仍按 `allowedRoots + blocklist` 双校验（`checkKairosGuard`），读类工具放开只影响主 Agent。
  - **后续收口方向**（记入 `docs/exec-plans/tech-debt-tracker.md`）：补「敏感路径 blocklist + 按需读审核」，而不是恢复 workspace 硬限制。
- session 数据存储在 Electron `userData` 目录下，路径固定、可预测。
- 本地更新源码目录路径存储在 `<userData>/local-update.json`，不存密钥；该路径可暴露用户本机目录结构，日志或截图外发前应按需脱敏。
- Agent 文件工具的工作区由 `ACTSPACE_WORKSPACE_ROOT` 或当前仓库根目录确定，不使用 `userData` 作为代码文件读取目录，避免把应用数据目录和用户工作区混淆。
- Bash 工具当前以当前进程的 `process.env` 启动子进程，因此命令执行不会把密钥提交到 Git，但允许被执行命令读取运行时环境变量。后续如要开放更高风险命令，应改为白名单环境变量或显式脱敏环境。
- Bash 大输出流式落盘到 `<userData>/tmp/tool-output/<sessionId>/`，不写进 workspace；落盘文件由后续定时清理回收（见 context-compression.md「M5 清理」）。

## 真实模型调用

- 真实 DeepSeek 与 Kimi 请求仅从 main 进程内的 Agent runtime 发起，renderer 只接收结构化事件与最终结果。
- 普通会话默认使用真实 DeepSeek provider，且 DeepSeek 默认走 Anthropic-compatible route；`LLM_PROVIDER=kimi` 可切换 Kimi 主模型。Electron 真实 turn 不允许被 mock 配置静默替代，mock 仅用于测试、浏览器 fixture 或显式 demo。
- Usage 页 DeepSeek 余额查询通过 main 进程调用 `GET /user/balance`，renderer 只接收已裁剪的余额展示模型，不接触 `DEEPSEEK_API_KEY`、鉴权头或 DeepSeek 原始响应。
- DeepSeek OpenAI-compatible 路线下，主模型的 `web_search`、`analyze_media` 工具由 Kimi 辅助调用实现；只有配置 Kimi key 时才注册，工具结果会被裁剪后回填给主模型。`web_search` 统一处理关键词搜索和 URL 读取。
- DeepSeek Anthropic-compatible 路线下，联网搜索由 DeepSeek provider-native server tool `web_search_20250305` 执行，不需要 `KIMI_API_KEY`；同名 Kimi-backed 本地 `web_search` 默认不暴露，避免模型看到两套搜索入口。
- Anthropic server `server_tool_use`、`web_search_tool_result` 属于 provider 响应协议，不应当作为本地 ToolManager 执行日志写入；session / run log 只保留 `serverToolUse` 请求计数，不应将未裁剪网页全文或 provider tool result 原文写入 session。
- 验收真实 provider 时应先发送不含仓库内容和隐私的固定探针，确认连接后再决定是否允许工具结果进入外部模型上下文。
- API 错误仅暴露必要的结构化诊断信息，不把鉴权请求头或密钥写入日志、session 或界面。

## 待补强

- 认证与授权约束。
- 依赖治理与供应链安全要求（见 `docs/SUPPLY_CHAIN_SECURITY.md`）。
- 数据分级、脱敏与保留策略。
- 对外 API、Webhook、文件上传和沙箱执行的规则。
- API Key 轮换与更完整的错误脱敏策略。
- Bash 工具子进程环境变量白名单。
- 读类工具放开 workspace 边界后的「敏感路径 blocklist + 按需读审核」（见 `docs/exec-plans/tech-debt-tracker.md`）。
