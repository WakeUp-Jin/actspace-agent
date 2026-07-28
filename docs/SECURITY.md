# 安全默认约束

这份文档用于把安全默认值讲清楚，避免实现逐步演进时越走越散。

## 密钥与环境变量管理

- **不提交密钥**：`.env` 已在 `.gitignore` 中，API Key 等敏感值只存在本地 `.env` 文件或系统环境变量中。
- **模板文件**：`.env.example` 列出全部可配置项和说明，新开发者克隆仓库后复制为 `.env` 即可。
- **集中管理**：所有环境变量通过 `packages/agent-core/src/env.ts` 统一读取和验证，禁止在业务代码中散落 `process.env.XXX` 直接读取。
- **DeepSeek API 格式边界**：`DEEPSEEK_API_FORMAT=openai|anthropic` 只影响 agent-core 里的 DeepSeek service 选择。当前默认是 `anthropic`，使用 `DEEPSEEK_ANTHROPIC_BASE_URL`；`openai` 是临时回退路线，使用 `DEEPSEEK_BASE_URL`。两个 base URL 都不应传入 renderer。
- **Kimi key 边界**：`KIMI_API_KEY` 只作为 Kimi 主模型密钥使用。该 key 只在 main/agent-core 运行时读取，不进入 renderer、session 事件、前端状态或测试快照。
- **OpenRouter key 边界**：OpenRouter API Key 与 DeepSeek / Kimi 使用同一安全边界，通过 Electron `safeStorage` 加密落盘；renderer 只读取是否已配置、连接状态和脱敏诊断，不读取明文。
- **DuckCoding 多 Key 边界**：默认 Key 沿用 provider 级 `safeStorage` 密文；额外 Key 以 `<provider>:<credentialId>` 为密文索引，普通 settings 只保存稳定 id、label、倍率和连接状态。模型只保存同 provider 的 `credentialId` 引用，renderer 不能读取、回显或在模型页创建 Key。被模型引用的额外 Key 禁止删除，缺失引用不得静默回退默认 Key。
- **模型目录边界**：OpenRouter 目录由 main 进程使用对应 provider 连接读取；DuckCoding 的 Codex/Grok 档案随应用打包，不读取外部目录，也不携带用户凭据。外部目录响应仍按不可信数据处理，只归一化白名单字段并限制响应和字符串大小。
- **服务商级代理目标边界**：代理配置归属于单个 LLM 服务商，只注入该服务商的 HTTP client，不写入全局 `HTTP_PROXY` / `HTTPS_PROXY`，也不影响工具、更新器或其他服务商。首版只接受 `http://` / `https://` 代理地址，不在代理 URL 中保存用户名和密码。
- **搜索 provider key 边界**：`ZHIPU_API_KEY` / `TAVILY_API_KEY` / `TINYFISH_API_KEY` / `EXA_API_KEY` 是 `web_search` 工具的外部搜索 API 密钥，边界与 LLM key 相同——只在 main/agent-core 运行时读取，经设置页加密落盘，不进入 renderer 明文状态。
- **工具暴露最小化**：可通过 `ACTSPACE_DISABLED_TOOLS` 明确关闭不希望暴露给模型的工具，关闭发生在注册阶段，而不是只在执行时拒绝。
- **优先级**：`process.env` 已有值 > `.env` 文件值 > schema 默认值。这保证 CI/Docker 场景可通过系统变量覆盖。
- **验证前置**：`loadEnv()` 在应用启动时尽早调用，缺失 required 字段或值不合法时立即抛 `EnvValidationError`，不让无效配置流入运行时。
- **冻结对象**：解析后的 `env` 对象通过 `Object.freeze()` 冻结，运行时不可篡改。
- **提交前密钥扫描**：`scripts/check-secrets.sh` 会扫描仓库文本文件（包含 `logs/`）里的疑似 API Key、Bearer token、Authorization header 和非空 key 环境变量赋值；`scripts/check-repo-hygiene.sh` 与 `.githooks/pre-push` 都会调用它。新 clone 后运行 `scripts/install-git-hooks.sh`，把本地 Git 的 `core.hooksPath` 指向仓库内 `.githooks/`。

## Electron 进程隔离

- 使用 `contextIsolation: true` + `nodeIntegration: false`，renderer 不能直接访问 Node.js API。
- preload 通过 `contextBridge` 只暴露最小、类型化的 bridge API。
- 环境变量（含 API Key）只在 main 进程中可见，不会泄露到 renderer。
- 本地更新只通过 main 进程 IPC 暴露结构化操作：选择源码目录、读取状态、启动更新。renderer 不传 shell 命令；main 会验证所选目录是 `name: "actspace"` 且包含 `package:desktop:dmg` 与 `scripts/release-package.sh`，并确认当前进程路径解析出的目标是 `Actspace.app` / `actspace.app` 且不是 `node_modules` 下的 Electron 开发 runtime 后，才写入 helper 脚本。helper 位于 `<userData>/tmp/local-update/`，日志写同目录 `update.log`，阶段状态写 `status.json`；main 只在 helper 报告 `ready_to_replace` / `waiting_for_exit` / `replacing` 后触发 app 退出，避免构建阶段提前关闭当前应用。helper 默认对本地更新构建启用 ad-hoc signing，并在替换前验证新 `.app` 的 bundle 元数据、主可执行文件和 code signature；替换后如果系统无法打开新 app，会尝试恢复旧版本。

## 文件系统访问控制

- **写类工具受 workspace 守卫**：`write_file` / `edit_file` / `bash` 的文件/目录写操作必须经 `workspace-guard.ts#guardWritablePath`，禁止 `..` 逃逸、禁止逃出 `workspaceRoot`。
  - **写越界改为用户审批（2026-07-05）**：`write_file` / `edit_file` 目标越界时不再硬拒绝，权限检查器返回 `ask`（medium 风险、不提供 allow_similar），用户批准后 scheduler 以 `sanitizedArgs` 执行，executor 依据其中的 `APPROVED_OUTSIDE_BOUNDARY_ARG` 标记放行该次写入。该标记只由权限检查器写入，模型自行在参数中传入会在检查阶段被剥除，无法绕过审批。bash 的写路径守卫不变。
- **读类工具放开 workspace 边界**：`read_file` / `grep` / `glob` / `list_directory` 改用 `workspace-guard.ts#resolveReadablePath`，**只解析路径、不做越界检查**。原因：上下文压缩会把 bash 大输出落盘到 `<userData>/tmp/tool-output/`、把完整历史指向 `<userData>/sessions/<id>/session.jsonl`，模型需要用读类工具回读这些 workspace 之外的 Agent 内部产物（见 `docs/design-docs/model-context/agent-context-compression.md`「读边界放开」）。
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
- OpenRouter 的连接测试、模型目录拉取和真实模型请求都由 main 进程发起，renderer 只消费裁剪后的服务商、模型与连接状态；供应商级代理不写全局代理环境变量。
- DuckCoding 复用 main 进程的 OpenAI-compatible runtime。每次调用先按模型 `credentialId` 解析同 provider 的目标密钥；默认 Key 与额外 Key 的连接状态、倍率和密文彼此独立，不做自动轮询或失败切换。Codex 使用 Responses API，推理强度只改变精确请求模型名，不向请求体增加 OpenRouter 风格的 reasoning effort 属性；Grok 与未知手动模型默认使用 Chat Completions。
- DuckCoding Codex 的 `prompt_cache_key` 由 session id 单向哈希派生，避免把原始本地 session 标识发送给外部服务。Responses 请求使用 `store: false`，不依赖外部会话存储；供应商返回的加密 reasoning item 会作为 opaque signature 随本地 session 事件持久化并在工具循环中回放，不应记录进普通日志、当作可读思考展示或传给无关 provider/API。
- 普通会话默认使用真实 DeepSeek provider，且 DeepSeek 默认走 Anthropic-compatible route；`LLM_PROVIDER=kimi` 可切换 Kimi 主模型。Electron 真实 turn 不允许被 mock 配置静默替代，mock 仅用于测试、浏览器 fixture 或显式 demo。
- Usage 页 DeepSeek 余额查询通过 main 进程调用 `GET /user/balance`，renderer 只接收已裁剪的余额展示模型，不接触 `DEEPSEEK_API_KEY`、鉴权头或 DeepSeek 原始响应。
- `web_search`（外部搜索 API 双通道）任一搜索 provider key 存在时注册，`web_fetch`（本地抓取）始终注册（见 `agent-web-tools.md`）。缺 key 时 executor 的兜底错误只提示需要配置的 key 名，不泄露其它运行时信息。
- 图片附件只在当前模型 `input` 包含 `image` 时进入 LLM 请求；本地图片会在 turn 边界临时转成 data URL，但不会写入 session、renderer 状态或日志。text-only 模型只接收附件元信息和 runtime model 能力提示。
- 2026-07-06 起 DeepSeek Anthropic-compatible 路线不再声明 provider-native server tool `web_search_20250305`（server 搜索与本地工具混用会触发网关 DSML 泄漏，见 `agent-deepseek-kimi-hybrid-capabilities.md` 决策记录）。
- 历史 session 中的 Anthropic server `server_tool_use`、`web_search_tool_result` 属于 provider 响应协议，不应当作为本地 ToolManager 执行日志写入；session / run log 只保留 `serverToolUse` 请求计数，不应将未裁剪网页全文或 provider tool result 原文写入 session。
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
