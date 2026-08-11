# 安全默认约束

这份文档用于把安全默认值讲清楚，避免实现逐步演进时越走越散。

## 密钥与环境变量管理

- **不提交密钥**：`.env` 与 Desktop `secrets.json` 都属于本机运行数据，不进入仓库；API Key 等敏感值只允许存在于这两类本地文件、系统环境变量或进程内存中。
- **模板文件**：`.env.example` 列出全部可配置项和说明，新开发者克隆仓库后复制为 `.env` 即可。
- **集中管理**：所有环境变量通过 `packages/agent-core/src/env.ts` 统一读取和验证，禁止在业务代码中散落 `process.env.XXX` 直接读取。
- **DeepSeek API 格式边界**：DeepSeek 固定使用 OpenAI-compatible Chat Completions，配置只保留 `DEEPSEEK_BASE_URL`（默认 `https://api.deepseek.com`）。旧 `DEEPSEEK_API_FORMAT` / `DEEPSEEK_ANTHROPIC_BASE_URL` 不再读取；官方 `/anthropic` 设置值只在 main 进程加载时迁移为默认根地址，renderer 仍不接收实际运行时 URL 或密钥。
- **Kimi key 边界**：`KIMI_API_KEY` 只作为 Kimi 主模型密钥使用。该 key 只在 main/agent-core 运行时读取，不进入 renderer、session 事件、前端状态或测试快照。
- **本地凭据文件**：Desktop 设置页录入的 LLM、搜索和图片服务 Key 以明文写入 `<userData>/secrets.json` v2；目录沿用 `userData`，文件在创建、原子替换和启动读取时都收紧为 `0600`。`0600` 表示仅文件所有者可读写，避免 `0644` 允许同机其他用户读取，但它不是加密：当前 macOS 账号下的进程、备份或同步工具仍可能读取该文件。开发版与安装版共用同一 `userData` 和同一份凭据，稳定性优先于应用身份绑定的系统密钥串。
- **主进程边界**：`secrets.json` 只由 Electron main 读取；renderer、typed preload、settings view、session、Trace 和普通日志只接收 `hasApiKey`、连接状态或脱敏错误码，不接收文件正文或明文 Key。凭据不提交到仓库，也不得复制到 `settings.json`。
- **OpenRouter key 边界**：OpenRouter 调用 Key 与 Management Key 在 `secrets.json` 中使用独立字段；renderer 只读取是否已配置、连接状态和脱敏诊断，不读取明文。
- **模型目录边界**：OpenRouter 目录由 main 进程使用对应 provider 连接读取，不携带用户凭据。外部目录响应仍按不可信数据处理，只归一化白名单字段并限制响应和字符串大小。
- **服务商级代理目标边界**：代理配置归属于单个 LLM 服务商，只注入该服务商的 HTTP client，不写入全局 `HTTP_PROXY` / `HTTPS_PROXY`，也不影响工具、更新器或其他服务商。首版只接受 `http://` / `https://` 代理地址，不在代理 URL 中保存用户名和密码。
- **搜索 provider key 边界**：`ZHIPU_API_KEY` / `TAVILY_API_KEY` / `TINYFISH_API_KEY` / `EXA_API_KEY` 是 `web_search` 工具的外部搜索 API 密钥，边界与 LLM key 相同——经设置页写入 main-only `secrets.json`，只在 main/agent-core 运行时读取，不进入 renderer 明文状态。
- **图片生成 key 边界**：`IMAGE_GENERATION_API_KEY` 经设置页写入 main-only `secrets.json`，并以内存配置注入 `generate_image` executor；renderer 只接收 `hasApiKey`、Base URL、模型名和本地产物引用。上游 Base64、Authorization header、签名 URL 与原始错误正文不得进入 session、renderer 或日志。
- **凭据迁移与故障保护**：旧 `secrets.json` v1 密文只在 main 使用 `safeStorage` 迁移。必须先把所有字段完整解密并校验成功，再以 `0600` 原子写入 v2；任何读取、格式、权限或迁移失败都保留原文件、停止所有凭据新增/替换/删除，并向设置页返回脱敏错误，禁止把空内存状态覆盖到磁盘。
- **图片分析凭据边界**：`inspect_image` 只引用 Kimi / OpenRouter 已有的默认或附加 Key；settings 只保存 provider-qualified 模型 ID 与 `credentialId`，renderer 不接收明文。被图片分析配置引用的附加 Key 禁止删除，调用失败不回落其他 Key 或 Provider。
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
- `generate_image` 只允许 main Runtime 注入的 session artifact root，图片写入 `<userData>/sessions/<sessionId>/artifacts/generated-images/`；远程 URL 必须先通过 HTTPS/公网地址检查并下载到本地，不能直接作为 renderer 成功产物。
- `inspect_image` 只允许读取 workspace 内普通文件、当前轮显式注册的图片附件，或当前 session `artifacts/` 子树；执行器对目标与允许根目录做 `realpath` 复验，拒绝符号链接逃逸、目录、设备、远程 URL 和未登记的工作区外路径。只接受文件签名匹配的 JPEG / PNG / WebP，单张上限 20 MiB。
- renderer 不允许通过生成图片绝对路径自行拼接 `file://`。右侧预览必须走 `session:read-artifact`，main 使用 realpath 校验目标仍位于当前 session `artifacts/` 子树，并按大小和文件魔数确认后才返回 data URL。
- Artifact 右键菜单里的打开、复制和 Finder 定位也是 main-owned 能力。Renderer 只能传递 `sessionId + artifactPath` 或 `workspaceRoot + relativePath`，main 必须重新校验 realpath 仍位于对应 session artifacts / workspace 边界内，不得直接对 renderer 传入的任意绝对路径调用 `shell.openPath` 或 `showItemInFolder`。
- Sidebar 的 `Open in IDE` 同样是 main-owned Workspace 能力。Renderer 只传稳定 `workspaceId`，main 从 `<userData>/workspaces.json` 重新解析路径，并确认条目未隐藏、目标存在且是目录后，才能启动 Cursor；不接受 renderer 指定的任意绝对路径。
- 顶部 Environment 的分支创建、Commit、Push，以及“在编辑器中打开”都是 main-owned 本机能力。Renderer 只能传稳定 action / tool id；main 每次都把 `workspaceRoot` 解析回 workspace registry 或已有 session 中登记的路径，再使用固定 Git argv 或固定应用映射执行，不能让 renderer 用任意绝对路径、应用名或 argv 扩大能力边界。

## 真实模型调用

- 真实 DeepSeek 与 Kimi 请求仅从 main 进程内的 Agent runtime 发起，renderer 只接收结构化事件与最终结果。
- OpenRouter 的连接测试、模型目录拉取和真实模型请求都由 main 进程发起，renderer 只消费裁剪后的服务商、模型与连接状态；供应商级代理不写全局代理环境变量。
- 普通会话默认使用真实 DeepSeek provider，并固定走 OpenAI-compatible Chat Completions；`LLM_PROVIDER=kimi` 可切换 Kimi 主模型。Electron 真实 turn 不允许被 mock 配置静默替代，mock 仅用于测试、浏览器 fixture 或显式 demo。
- Usage 页 DeepSeek 余额查询通过 main 进程调用 `GET /user/balance`，renderer 只接收已裁剪的余额展示模型，不接触 `DEEPSEEK_API_KEY`、鉴权头或 DeepSeek 原始响应。
- `web_search`（外部搜索 API 双通道）任一搜索 provider key 存在时注册，`web_fetch`（本地抓取）始终注册（见 `agent-web-tools.md`）。缺 key 时 executor 的兜底错误只提示需要配置的 key 名，不泄露其它运行时信息。
- `generate_image` 仅在配置图片服务 Key 时向主 Agent 注册；默认模型为 `gpt-image-2`，但模型名和 Base URL 均由设置页覆盖。完整生成请求不自动重试，避免上游已计费时产生重复费用。
- 图片附件在当前模型 `input` 包含 `image` 时直接进入主 LLM 请求；text-only 主模型只接收附件元信息、runtime model 状态和可用时的 `inspect_image` 调用指引。`inspect_image` 的视觉请求只包含固定 system prompt、问题、安全文件名和单张图片，不携带主会话历史、主 system prompt 或其他附件。
- `inspect_image` 的图片 Base64 只存在于单次视觉请求内存，不进入工具输出、session、renderer 或日志。图片内文字一律视为不可信证据；视觉模型只返回最终观察，不返回隐藏推理。单次请求 90 秒超时、SDK 重试为 0，失败不自动切换 Kimi / OpenRouter，避免重复计费和不可解释的数据发送。
- DeepSeek 当前 OpenAI-compatible 路线不声明 provider-native server search，联网能力统一由受密钥和工具权限控制的本地 `web_search` / `web_fetch` 提供。历史 Anthropic 路线的 DSML guard 只为协议兼容测试与旧记录保留。
- 历史 session 中的 Anthropic server `server_tool_use`、`web_search_tool_result` 属于 provider 响应协议，不应当作为本地 ToolManager 执行日志写入；session / run log 只保留 `serverToolUse` 请求计数，不应将未裁剪网页全文或 provider tool result 原文写入 session。
- 验收真实 provider 时应先发送不含仓库内容和隐私的固定探针，确认连接后再决定是否允许工具结果进入外部模型上下文。
- API 错误仅暴露必要的结构化诊断信息，不把鉴权请求头或密钥写入日志、session 或界面。

## 沙箱执行

夜间模式使用 [nono](https://github.com/nolabs-ai/nono) 作为 Agent 的唯一安全边界。nono 在操作系统内核层（macOS Seatbelt / Linux Landlock）强制隔离，不依赖 Agent 自身的权限控制或提示词约束。

### 隔离设计

- **单层沙箱**：Codex 自身沙箱关闭（`--dangerously-bypass-approvals-and-sandbox`），隔离完全交给 nono。避免双层沙箱互相干扰导致难以排查的失败。
- **最小权限**：profile 从 `default` 起步，逐项显式授权。未授权的路径默认全拒；写权限仅工作目录和 `~/.codex`；删除由 `unlink_protection` 组全局兜底。
- **网络白名单**：只放行模型 API 域名。即使 Agent 读到凭证文件，也没有外传通道；push 远端同样被封死。
- **内核级拦截**：越界操作在系统调用层被拒，与 Agent 内部逻辑无关。deny 规则优先于一切授权。

### Profile 审查

nono profile 分两份维护：仓库通用模板在 `docs/nono-profiles/`，本机副本在 `~/.config/nono/profiles/`（含真实 API 域名和个人敏感目录的 deny，不入库）。修改 profile 等同于修改安全边界，应按代码变更对待：

- 每次修改说明为什么需要新增授权。
- 用 `nono why -p <profile> --path <target> --op <read|write|readwrite>` 验证路径授权，用 `--host <domain>` 验证网络授权。
- 用 `nono profile show <profile>` 查看完整解析结果。
- 完整验证清单见 `docs/nono-profiles/README.md` 的"Profile 维护"章节。

### 残余风险与缓解

nono 挡住了边界外的破坏，但边界内仍有需要人工兜底的风险：

- **工作目录内的破坏**：Agent 对 workdir 有完整写删权。缓解：启动时加 `--rollback` 打快照，次日可整体还原；nono 审计日志默认开启。
- **`.git/hooks` 投毒**：夜间 Agent 可写入 git 钩子，钩子会在次日沙箱外执行。缓解：晨检时先看 `.git/hooks/` 再跑任何 git 命令。
- **`~/.codex` 配置污染**：Agent 对 codex 状态目录有写权，可能改动 `config.toml` 影响白天沙箱外的 codex。缓解：晨检核对 `config.toml`。
- **读取范围内的数据外流**：所有可读内容都可能经模型 API 通道进入 provider。缓解：只读授权按需添加，个人敏感目录显式 deny。

### 已知注意事项

- `/private/tmp` 在内置组 `system_write_macos` 中默认可写，profile 里必须显式 `deny`（实测验证）。
- deny 优先于 allow/read，不要 deny 工作目录的祖先目录，否则沙箱直接不可用（实测验证）。
- 提示词预授权用于绕过工作流级别的审批规则，但它**不是安全边界**——安全边界只有 nono 一层。提示词失效的最坏后果是空转，不是做坏事。

## 待补强

- 认证与授权约束。
- 依赖治理与供应链安全要求（见 `docs/SUPPLY_CHAIN_SECURITY.md`）。
- 数据分级、脱敏与保留策略。
- 对外 API、Webhook、文件上传和沙箱执行的规则。
- API Key 轮换与更完整的错误脱敏策略。
- Bash 工具子进程环境变量白名单。
- 读类工具放开 workspace 边界后的「敏感路径 blocklist + 按需读审核」（见 `docs/exec-plans/tech-debt-tracker.md`）。
