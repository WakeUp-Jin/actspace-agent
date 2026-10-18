# 安全默认约束

这份文档用于把安全默认值讲清楚，避免实现逐步演进时越走越散。

## 密钥与环境变量管理

- **不提交密钥**：Desktop `secrets.json`、CLI 显式环境变量和进程内存都属于本机运行数据，不进入仓库；`.env.example` 只列出 CLI、CI、调试开关和非敏感首次默认值，不表示 Desktop 会自动加载仓库 `.env`。
- **Desktop 凭据入口**：模型、搜索和图片服务 Key 只从应用内设置页写入 main-only `<userData>/secrets.json` v2，再由 Host credential resolver 按请求解析。Desktop 不从仓库 `.env` 或 renderer 状态读取 provider key。
- **CLI 凭据入口**：CLI Host 只读取启动进程显式提供的 provider 环境变量，例如 `DEEPSEEK_API_KEY`、`KIMI_API_KEY` 或 `OPENROUTER_API_KEY`。仓库没有通用 `loadEnv()` / dotenv 启动层，若开发者自行使用 `.env`，必须在启动 CLI 前显式导入到当前 shell。
- **集中管理**：Runtime 只通过 LLM credential port 接收短生命周期凭据；Desktop 与 CLI 各自在 Host 边界解析来源，领域 package 不直接读取 provider key。
- **DeepSeek API 格式边界**：Desktop 的 DeepSeek Base URL 与 Key 来自设置存储；CLI 的默认 Base URL 是 `https://api.deepseek.com`，并使用 OpenAI-compatible Chat Completions。旧 `DEEPSEEK_API_FORMAT` / `DEEPSEEK_ANTHROPIC_BASE_URL` 不是 v2 Runtime 配置面。
- **Kimi key 边界**：Desktop Kimi Key 来自主进程凭据存储；CLI 才读取显式 `KIMI_API_KEY`。两种 Host 都不得把 Key 写入 renderer、Session Journal、Runtime Projection 或测试快照。
- **本地凭据文件**：Desktop 设置页录入的 LLM、搜索和图片服务 Key 以明文写入 `<userData>/secrets.json` v2；目录沿用 `userData`，文件在创建、原子替换和启动读取时都收紧为 `0600`。`0600` 表示仅文件所有者可读写，避免 `0644` 允许同机其他用户读取，但它不是加密：当前 macOS 账号下的进程、备份或同步工具仍可能读取该文件。开发版与安装版共用同一 `userData` 和同一份凭据，稳定性优先于应用身份绑定的系统密钥串。
- **主进程边界**：`secrets.json` 只由 Electron main 读取；renderer、typed preload、settings view、session、Trace 和普通日志只接收 `hasApiKey`、连接状态或脱敏错误码，不接收文件正文或明文 Key。凭据不提交到仓库，也不得复制到 `settings.json`。
- **OpenRouter key 边界**：OpenRouter 调用 Key 与 Management Key 在 `secrets.json` 中使用独立字段；renderer 只读取是否已配置、连接状态和脱敏诊断，不读取明文。
- **模型目录边界**：OpenRouter 目录由 main 进程使用对应 provider 连接读取，不携带用户凭据。外部目录响应仍按不可信数据处理，只归一化白名单字段并限制响应和字符串大小。
- **服务商级代理目标边界**：代理配置归属于单个 LLM 服务商，只注入该服务商的 HTTP client，不写入全局 `HTTP_PROXY` / `HTTPS_PROXY`，也不影响工具、更新器或其他服务商。首版只接受 `http://` / `https://` 代理地址，不在代理 URL 中保存用户名和密码。
- **搜索 provider key 边界**：`ZHIPU_API_KEY` / `TAVILY_API_KEY` / `TINYFISH_API_KEY` / `EXA_API_KEY` 是 `web_search` 工具的外部搜索 API 密钥，边界与 LLM key 相同——经设置页写入 main-only `secrets.json`，只在 main Host / Runtime 运行时读取，不进入 renderer 明文状态。
- **图片生成 key 边界**：`IMAGE_GENERATION_API_KEY` 经设置页写入 main-only `secrets.json`，并以内存配置注入 `generate_image` executor；renderer 只接收 `hasApiKey`、Base URL、模型名和本地产物引用。上游 Base64、Authorization header、签名 URL 与原始错误正文不得进入 session、renderer 或日志。
- **凭据迁移与故障保护**：旧 `secrets.json` v1 密文只在 main 使用 `safeStorage` 迁移。必须先把所有字段完整解密并校验成功，再以 `0600` 原子写入 v2；任何读取、格式、权限或迁移失败都保留原文件、停止所有凭据新增/替换/删除，并向设置页返回脱敏错误，禁止把空内存状态覆盖到磁盘。
- **图片分析凭据边界**：`inspect_image` 只引用 Kimi / OpenRouter 已有的默认或附加 Key；settings 只保存 provider-qualified 模型 ID 与 `credentialId`，renderer 不接收明文。被图片分析配置引用的附加 Key 禁止删除，调用失败不回落其他 Key 或 Provider。
- **工具暴露最小化**：可通过 `ACTSPACE_DISABLED_TOOLS` 明确关闭不希望暴露给模型的工具，关闭发生在注册阶段，而不是只在执行时拒绝。
- **非敏感进程变量**：Desktop 可以在首次创建 `settings.json` 时读取 `LLM_TEMPERATURE`、`LLM_MAX_TOKENS`、`ACTSPACE_DISABLED_TOOLS` 和 `ACTSPACE_BASH_ALWAYS_ASK` 作为默认值；设置文件建立后以 main-owned 设置状态为准。
- **运行时快照**：Host 在每次请求或 Runtime boot 边界生成不可变 credential、composition 和 request snapshot；不得把可变 `process.env` 对象直接暴露给领域 package 或 renderer。
- **提交前密钥扫描**：`scripts/check-secrets.sh` 会扫描仓库文本文件（包含 `logs/`）里的疑似 API Key、Bearer token、Authorization header 和非空 key 环境变量赋值；`scripts/check-repo-hygiene.sh` 与 `.githooks/pre-push` 都会调用它。新 clone 后运行 `scripts/install-git-hooks.sh`，把本地 Git 的 `core.hooksPath` 指向仓库内 `.githooks/`。

## Electron 进程隔离

- 使用 `contextIsolation: true` + `nodeIntegration: false`，renderer 不能直接访问 Node.js API。主窗口还显式写出 `sandbox: true`、`webviewTag: false`（`main/window-security.ts`）；preload 是单文件 bundle，只能 `require("electron")`，由 `runtime-v2-preload-bundle.test.ts` 守住。
- preload 通过 `contextBridge` 只暴露最小、类型化的 bridge API。
- **IPC sender 校验 fail-closed**：所有 `ipcMain.handle` / `on` 注册点都调用 `main/ipc/trusted-sender.ts` 的 `assertTrustedSender`。没有主窗口、窗口已销毁、sender 不是主窗口的 webContents、或 senderFrame 不是 mainFrame，任一成立就拒绝。
- **IPC channel 审计**：`pnpm check:ipc-channels` 核对 shared 中的 channel 常量、main 的注册 / 发送、preload 的引用三者一致；main 不能用常量表之外的字面量注册或发送 channel。
- **导航防护**：主窗口拒绝一切新窗口（`setWindowOpenHandler` 返回 `deny`），顶层导航到非应用 URL 时取消（`will-navigate`）；两种情况都把 URL 交给 `openExternalSafely`。应用 URL 在生产是 dist 下 `index.html` 的精确 file URL，dev 是 dev server 的同源 URL。任何 webContents 都不允许挂 `<webview>`。
- **外部打开白名单**：main 中打开外部 URL 一律经 `main/platform-actions.ts` 的 `openExternalSafely`，只放行 `https:`、`http:`、`mailto:`；`file:`、`javascript:`、自定义协议和无法解析的字符串直接丢弃。「在 Cursor 中打开」等平台动作也收在同一文件，只接受 main 已 realpath 校验过的本机路径。
- **主文档 CSP**：目前没有。严格 CSP 会破坏 HTML 预览和 mermaid 样式，见「待补强」。
- **生命周期**：窗口关闭时销毁该窗口拥有的终端；退出时 dispose Browser Bridge（终止在途子进程）和本地更新服务（只清定时器，更新脚本必须比应用活得久）；`uncaughtExceptionMonitor` / `unhandledRejection` 写入主进程日志，不改变 Electron 的默认处理。
- Desktop 的 provider Key 只在 main 进程凭据存储和短生命周期 Runtime credential 中可见，不会泄露到 renderer。CLI 环境变量只属于 CLI Host 进程。
- 本地更新只通过 main 进程 IPC 暴露结构化操作：选择源码目录、读取状态、启动更新。renderer 不传 shell 命令；main 会验证所选目录是 `name: "actspace"` 且包含 `package:desktop:dmg` 与 `scripts/release-package.sh`，并确认当前进程路径解析出的目标是 `Actspace.app` / `actspace.app` 且不是 `node_modules` 下的 Electron 开发 runtime 后，才写入 helper 脚本。helper 位于 `<userData>/tmp/local-update/`，日志写同目录 `update.log`，阶段状态写 `status.json`；main 只在 helper 报告 `ready_to_replace` / `waiting_for_exit` / `replacing` 后触发 app 退出，避免构建阶段提前关闭当前应用。helper 默认对本地更新构建启用 ad-hoc signing，并在替换前验证新 `.app` 的 bundle 元数据、主可执行文件和 code signature；替换后如果系统无法打开新 app，会尝试恢复旧版本。

## 文件系统访问控制

- **文件工具边界**：v2 Tool Runtime 在审批前 canonicalize file resource，并由 `default/full-access`、敏感分类、Tool Permission 与 Host capability 合并决策；`default` 的 workspace 外读写需要审批，Desktop 可对非敏感核心文件签发当前 Session/当前主 Agent 的 exact 或显式 subtree Grant，CLI 不签发或消费。Grant 仍按 action/access/audience/policyVersion 和当前资源完整覆盖复验；`full-access` 只扩大非敏感文件范围。executor 在 syscall 前重新解析并核对已准入资源，路径、目标类型、Grant 或符号链接状态变化时 fail-closed。
- **Bash 边界**：Bash 默认要求批准；本地 Desktop 主 Agent 可显式签发当前会话、当前工作区的命令前缀授权，后续符合工具规则的简单命令可复用。硬拒绝优先于授权，复杂语法、排除参数及显式 `no_sandbox` 不复用；`full-access` 不扩大工作目录范围。前缀授权不是沙箱或只读保证，包含项目脚本；现有 macOS sandbox 尝试及降级行为不变。详见 [前缀授权方案](exec-plans/completed/20261011-approval-card-cursor-style/backend-bash-command-prefix-grant.md)。
- **读类工具边界**：v2 Tool Runtime 由 Host capability、Session permission mode 和 plugin manifest 共同约束读写范围；不得沿用 v1 的任意主 Agent 读边界。
-  - **当前取舍**：需要回读 Session artifact、诊断或工具输出时，通过显式 artifact / projection capability 授权，不把整个 `userData` 目录提升为默认 workspace。
-  - **v1 guard**：旧 scheduler 双校验属于历史实现，已随 v1 产品路径从 v2 删除。
  - **后续收口方向**（记入 `docs/exec-plans/tech-debt-tracker.md`）：补「敏感路径 blocklist + 按需读审核」，而不是恢复 workspace 硬限制。
- v2 Session 数据存储在统一的 `<dataRoot>/sessions-v2/<sessionId>/journal.jsonl`；macOS 默认 `<dataRoot>` 为 `~/Library/Application Support/ActSpace`，CLI 与 Electron 共用；旧 lowercase data root 和 `<dataRoot>/sessions/` 仅作为用户历史数据原位保留，v2 不混读或自动迁移。
- 本地更新源码目录路径存储在 `<userData>/local-update.json`，不存密钥；该路径可暴露用户本机目录结构，日志或截图外发前应按需脱敏。
- Agent 文件工具的工作区由 `ACTSPACE_WORKSPACE_ROOT` 或当前仓库根目录确定，不使用 `userData` 作为代码文件读取目录，避免把应用数据目录和用户工作区混淆。
- Bash 工具当前以当前进程的 `process.env` 启动子进程，因此命令执行不会把密钥提交到 Git，但允许被执行命令读取运行时环境变量。后续如要开放更高风险命令，应改为白名单环境变量或显式脱敏环境。
- Bash 大输出和工具 artifact 由 v2 Tool Runtime 按 Session-owned artifact policy 管理，不写进 workspace；具体落盘和回收边界以 `agent-plugin-runtime/agent-spec-tool-runtime-abi.md` 为准。
- `generate_image` 只允许 Host 注入的 Session artifact root，图片位于 `<userData>/sessions-v2/<sessionId>/artifacts/` 下的受管子树；远程 URL 必须先通过 HTTPS/公网地址检查并下载到本地，不能直接作为 renderer 成功产物。
- `inspect_image` 只允许读取 workspace 内普通文件、当前轮显式注册的图片附件，或当前 session `artifacts/` 子树；执行器对目标与允许根目录做 `realpath` 复验，拒绝符号链接逃逸、目录、设备、远程 URL 和未登记的工作区外路径。只接受文件签名匹配的 JPEG / PNG / WebP，单张上限 20 MiB。
- renderer 不允许通过生成图片绝对路径自行拼接 `file://`。右侧预览必须走 `session:read-artifact`，main 使用 realpath 校验目标仍位于当前 session `artifacts/` 子树，并按大小和文件魔数确认后才返回 data URL。
- Artifact 右键菜单里的打开、复制和 Finder 定位也是 main-owned 能力。Renderer 只能传递 `sessionId + artifactPath` 或 `workspaceRoot + relativePath`，main 必须重新校验 realpath 仍位于对应 session artifacts / workspace 边界内，不得直接对 renderer 传入的任意绝对路径调用 `shell.openPath` 或 `showItemInFolder`。
- Sidebar 的 `Open in IDE` 同样是 main-owned Workspace 能力。Renderer 只传稳定 `workspaceId`，main 从 `<userData>/workspaces.json` 重新解析路径，并确认条目未隐藏、目标存在且是目录后，才能启动 Cursor；不接受 renderer 指定的任意绝对路径。
- **工作区访问入口**：renderer 传来的 `workspaceRoot` 一律经 `main/workspace-access.ts` 解析，不再直接 `resolve`。
  - 右侧文件树的 list / read / stat、Git context、Skills 列表、工作区文件右键菜单走 `resolveWorkspaceAccess`：请求路径 realpath 后必须**等于** registry 中某个条目或某个已存在本地会话 `workspaceRoot`（含 worktree）的 realpath，子目录也不行；否则抛 `workspace_not_registered`。后续操作都基于返回的 realpath root。
  - `createSession` 只接受 registry 中的 root；`createWorkspaceFolder` 的父目录必须是用户最近一次在系统对话框中选中的目录（建成功后作废），或者通过上面的校验。
  - root 内的路径用 `path.relative` 判断包含（合法文件名 `..foo` 不算越界），再对目标或其最近的已存在祖先做 realpath，确认仍在 root 内；指向 root 外的 symlink 返回 `escapes_root`，也不会泄露外部路径是否存在。
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
- 子进程环境变量白名单。设置服务会把搜索服务 Key 等写进 `process.env`（`applyToEnv`），bash 工具、`rg`、git / gh、ssh、Browser Bridge、更新脚本等子进程都继承完整环境；只有终端 pty 经 `sanitizeEnvironment` 去掉了密钥类变量。清单见 `docs/exec-plans/tech-debt-tracker.md`。
- Browser Bridge「从源码目录安装」：`installBrowserBridgeFromRepo` 接受 renderer 传来的 `repoRoot`，只校验扩展 manifest 后就在该目录运行构建脚本。应改为由 main 弹系统对话框选目录，renderer 不再传路径。
- 主文档 CSP。2026-10-06 实测（Electron 39）：严格策略（`script-src 'self'; style-src 'self'`）下应用启动正常，但 HTML 预览的 srcdoc iframe 会继承父文档策略、自身 meta 无法放宽，内联脚本、样式和桥脚本全部失效；mermaid SVG 内的 `<style>` 也会被拦。先把 HTML 预览改成不继承主文档策略的加载方式（例如自定义协议），并给 mermaid 样式找到 nonce / hash 或隔离方案，再由 main 用 `session.webRequest.onHeadersReceived` 注入 CSP（实测对 file:// 生效，与 meta 等效）。
- 读类工具放开 workspace 边界后的「敏感路径 blocklist + 按需读审核」（见 `docs/exec-plans/tech-debt-tracker.md`）。

## 独立 Agent Host（P4 实施中）

- 远端 Provider 凭据和模型路由属于 Host，Desktop 只能选择发布的模型。远端任务的工具与文件访问发生于 Host；本机路径不得作为附件引用传给服务器。
- 默认回环监听，公网绑定必须配置 TLS；Desktop 校验证书，SSH 严格校验已登记指纹。配对码一次使用且十分钟失效，设备令牌由 Main safeStorage 加密保存，Host 仅保存 hash。设备撤销关闭连接，不取消已接纳任务。
- 每个 RPC、订阅发送、结果页和下载块都重新检查设备有效性。Origin 精确允许列表是浏览器入口约束，不能代替设备认证。协议版本和稳定 Host 身份在发送恢复令牌前核验。
- 数据归属使用 `{hostId, sessionId}`；远端数据不进入本机终端、Git Review 或本机路径操作。结果访问验证会话所有权，工作区结果先做普通文件与 realpath 边界检查，再保存不可变快照。下载使用用户显式位置且不自动覆盖。
- 上传偏移和完成 hash 落盘后才确认；任务引用前持久 pin，清理不删除已接纳任务的材料。待确认提交保留同一 submissionId，断线不是任务失败或取消的证据。
- 大响应使用连接内有界分页，不能无限累积慢客户端队列。管理命令仅通过受保护的本地 dataRoot 管理目录，未暴露网络管理权限。
- 远端会话历史缓存、待确认正文和附件路径会保留在本机应用数据中，以支持离线查看和查证；它们不是设备密钥。移除连接不等于删除 Host 上的会话或撤销服务器设备授权；撤销使用服务器管理命令。

### 浏览器客户端（apps/web）

- 配对得到的设备 token 存在该浏览器 `localStorage`（键 `actspace.web.hosts`），不加密；防护依赖同源隔离、CSP 与不渲染不可信 HTML（Markdown 不启用原始 HTML，链接只允许 https/http/mailto）。丢失设备时在服务器执行 `host revoke`；页面收到 4003 或 `REVOKED` 后清除本地 token 并回到连接页。
- Host 静态托管（`webRoot`）对每个请求 `realpath` 后校验仍在 `webRoot` 内，拒绝目录穿越和指向外部的符号链接；只允许 GET/HEAD。响应带 `Content-Security-Policy`（`default-src 'self'`，`connect-src` 只额外列出页面自身主机的 ws/wss，`frame-ancestors 'none'`）、`nosniff` 与 `Referrer-Policy: no-referrer`。
- WebSocket 的 Origin：`allowedOrigins` 只接受精确的 https origin；回环 http 来源（`http://127.0.0.1|localhost|[::1]:*`）仅在 Host 未启用 TLS（即只能回环监听）时放行，用于本机开发和同源预览。手机经 `tailscale serve` 访问时必须把 `ts.net` 地址写进 `allowedOrigins`。
- Service Worker 只缓存导航页面与 `/assets/*`，从不缓存或拦截 `/rpc`。

操作说明与当前验收边界见 [Agent Host](design-docs/agent-plugin-runtime/agent-host-guide.md) 和 [P4 计划](exec-plans/completed/20261003-agent-harness-host-refactor/phase-4.md)。
