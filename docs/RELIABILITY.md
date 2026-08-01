# 稳定性与可运维性

这里用来定义 `actspace` 当前的运行质量底线。

## 当前最小可靠性约定

- 应用启动时必须能初始化本地数据目录：
  - `sessions/`
  - `logs/`
  - `tmp/`
- renderer 不能直接访问文件系统；所有文件与 session 读写都必须走 preload + IPC。
- 应用启动后必须至少能完成两条路径之一：
  - 恢复本地已有会话
  - 在没有旧会话时，跑起一次默认 Agent Run
- `workspaces.json` 等会在启动期执行 reconciliation 的本地 registry，完整读改写流程必须串行化；原子替换使用唯一临时文件，禁止多个并发请求共享固定 `.tmp` 路径。
- 普通桌面会话通过统一可用模型解析器选择 DeepSeek、Kimi 或已添加的 OpenRouter 模型；连接测试为可选诊断，已保存 Key 且未明确测试失败的 provider 可直接使用。mock 只用于测试、浏览器 fixture 或显式 demo，不允许静默替代 Electron 真实 Agent Run：
  - 启动应用
  - 请求 bootstrap state
  - 读取 session list
  - 执行或恢复一次 Agent Run
  - 渲染消息流
  - 本地落盘
- 每次真实 Agent Run 的 `session.jsonl` 必须能恢复用户输入、中间执行和最终回复，至少包含 `user_message`、每次模型调用对应的 `llm_usage` 和轻量 `context_snapshot`。SessionEvent V2 必须携带 `agentRunId`，内部 Turn 与真实 provider 请求分别用 `turnId`、`llmCallId` 归属。
- 每个会话可以维护独立的 `context-state.json`，用于恢复当前 Context 面板展示；该文件是可覆盖视图，不替代 `session.jsonl` 的事实日志。
- 本机二进制插件升级必须先在唯一临时路径完成探测，再通过原子 `rename` 替换正式路径；禁止原地覆盖可能正在运行的 Native Messaging host。Chrome unpacked extension 必须用 manifest 公开 key 固定 ID，并通过测试校验 Native Host allowlist 默认值与该 ID 一致。插件健康检查必须 single-flight，renderer 只能在上一轮完成后安排下一轮，失败状态需要退避，避免超时探测演变为进程风暴。

## 当前本地排障入口

- `pnpm dev`：本地开发启动桌面端。
- `pnpm dev:log`：本地开发启动桌面端，并把终端 stdout/stderr 同步写入根目录 `logs/dev-*.log`，同时更新 `logs/latest-dev.log` 供 Agent 排障读取。
- 文件工具默认使用 workspace root，而不是 Electron `userData`。如需指定工作区，设置 `ACTSPACE_WORKSPACE_ROOT`。
- `web_search` 需要任一搜索 provider key（`ZHIPU_API_KEY` / `TAVILY_API_KEY` / `TINYFISH_API_KEY` / `EXA_API_KEY`）；`web_fetch` 无 key 要求。未配置搜索 key 时 `web_search` 不会注册，避免运行中暴露一个必然失败的能力；executor 内另有缺 key 兜底错误作防御（见 `agent-web-tools.md`）。
- 多模态输入由模型注册表的 `input` 能力决定。当前模型不支持 `image` 时，图片附件不会被隐式分析，Agent 只看到附件元信息和 runtime model 能力提示。
- 如需长期禁用某些工具，可设置 `ACTSPACE_DISABLED_TOOLS=read_file,bash`；工具会在注册阶段直接跳过，不会暴露给模型，也不会出现在运行时工具列表里。
- `pnpm typecheck`：检查跨包类型契约。
- `pnpm build`：检查当前桌面端和共享包是否可构建。
- `pnpm package:desktop`：本地生成当前平台的 desktop archive，便于开源用户从源码自行打包。
- 安装版 Electron main 进程启动日志位于 `<userData>/logs/main-startup.log`，macOS 默认是 `~/Library/Application Support/actspace/logs/main-startup.log`。排查“Dock 有图标但窗口没出来 / renderer 白屏 / packaged renderer 加载失败”时，优先读取这个文件；每次启动还会生成一份 `main-startup-<timestamp>.log` 归档。
- 设置页「更新 → 本地更新」：已安装 macOS app 可从已选择的本机源码目录重新打包并替换当前 `.app`。构建阶段当前应用保持打开，页面弹窗显示阶段进度；helper 默认以 `ACTSPACE_MAC_ADHOC_SIGN=true` 生成本地临时签名包，并在退出当前 app 前验证新 `.app` 的 `Info.plist`、主可执行文件和 code signature。验证通过后 helper 报告准备替换，应用才退出、替换并重启；如果复制或打开新 app 失败，helper 会尝试恢复旧版本。更新 helper 日志位于 Electron `userData/tmp/local-update/update.log`，阶段状态位于同目录 `status.json`；如果构建或替换失败，优先看这两个文件。
- `pnpm run ci`：运行仓库级基础门禁。

## 本地开发日志约定

- 根目录 `logs/` 只存本机运行日志，不提交到 Git。
- `pnpm dev:log` 会保留最近约 2 天的 `*.log`，并自动清理更旧文件。
- `pnpm dev` 与 `pnpm dev:log` 统一由 `scripts/desktop-dev.mjs` 管理开发进程。监督器为每个受管阶段创建独立进程组，收到 SIGINT / SIGTERM 时把信号转发给整个子进程树，4 秒后仍未退出才升级为 SIGKILL；受管根命令因端口冲突或构建错误自行退出时，也会再次收割残留进程组，避免 Vite、tsc、Electron、`wait-on` 或它们的后代成为孤儿进程。
- `pnpm dev:log` 不再使用 shell pipeline + `tee`；监督器直接复制子进程 stdout / stderr 到当前终端和 `logs/dev-*.log`，同时更新 `logs/latest-dev.log`。这样日志复制不会改变 Ctrl+C 的所有权和传播路径。
- Agent 排查启动、构建、Electron 或 provider 问题时，优先读取 `logs/latest-dev.log`。
- Agent 排查安装版启动问题时，优先读取 `~/Library/Application Support/actspace/logs/main-startup.log`。该日志由 main 进程直接写入，包含 app path 配置、数据目录初始化、窗口创建、renderer 加载成功/失败、renderer console、renderer 进程退出和 main 进程未捕获异常。
- 排查本地更新时，优先读取设置页显示的 `<userData>/tmp/local-update/status.json` 和 `update.log`；这些文件由外部 helper 写入，替换阶段可能发生在主 app 退出之后。
- 排查 Browser Bridge 编译安装失败时，先确认构建日志是否已经输出 `Built browser-bridge`，再区分临时二进制 `help` 探测失败、正式路径状态探测超时和 Chrome extension 未重载。若系统进程状态显示为不可中断等待，应先退出插件设置页和应用，停止继续轮询；代码侧不得通过提高 timeout 或重复重试掩盖问题。
- Agent Run 运行时会向终端即时输出关键链路日志，`pnpm dev:log` 会同步写入 `logs/latest-dev.log`：
  - `[agent-ipc]`：renderer 调用 main、main 推送 stream event、Agent Run 持久化等 IPC 边界。
  - `[agent-run]`：Agent loop 生命周期、流式 delta 计数、工具开始/结束、Agent Run 完成状态。
  - `[renderer-console]`：renderer console 输出转发，方便区分前端渲染错误和后端推送错误。
- 仓库根目录 `logs/agent-runs/` 会保存最近约 1 天的 Agent Run JSONL 排障文件，每次用户输入到 Agent 最终输出对应一个文件。文件包含完整用户输入、工具调用参数、工具结果、关键 AgentEvent、关键 RuntimeStreamEvent 和最终 AgentRunResult；日志按状态记录，不按流式 chunk 逐行记录：
  - 模型流式文本聚合为单条 `assistant_text` / `assistant_thinking` 事件，并保留 delta 数量与字符数。
  - 模型输出的完整工具调用指令记录为单条 `assistant_tool_call`，不记录 `tool_call_delta` 碎片。
  - 工具真实执行只记录 `tool_event` 的开始和完成。
  这些状态级记录便于区分：
  - Agent 运行错误：看 `agent_event` / `tool_event` / `run_failed`。
  - 后端是否推送给前端：看 `stream_event`。
  - 会话持久化是否完成：看 `main_event` 的 `persisting_agent_run_result` / `agent_run_result_persisted`。
- run JSONL 文件只用于本地排障，可能包含敏感输入与工具输出；不要提交到 Git。仓库根目录 `logs/` 已在 `.gitignore` 中忽略。

## 分析观测 Trace 约定

- 每次 Agent Run 可在 `<userData>/sessions/<sessionId>/traces/<agentRunId>.jsonl` 追加一份长期分析 Trace，记录 Agent Run、内部 Turn、LLM request/response/retry 的层级和关联 ID。
- 每个 Run 同时维护 `<agentRunId>.summary.json` 原子 sidecar；分析索引只读取 sidecar 与 Session V2 用户输入，完整 JSONL 仅在选中 Run 时懒加载。
- Trace 与 `session.jsonl` 分工明确：Session 是恢复事实源，Trace 是可删除的分析证据；Trace 丢失不得影响会话恢复。
- Trace Writer 不接收 provider headers，并在写入前递归脱敏凭据字段、Authorization/Cookie、data URL、长 Base64、签名 URL 参数和不安全错误体。Trace 写入失败必须 fail-soft，不得中断 Agent Run。
- renderer 禁止直接读取 Trace 文件；只能通过 preload 的 `listAgentTraces/readAgentTrace` 调用 Main。Main 必须校验 ID、普通文件类型、符号链接和每条事件的 `sessionId/agentRunId` 一致性。
- 单 Run JSONL 上限 64 MiB，Reader 上限 100,000 事件；只忽略文件末尾唯一未完成行，中间坏行视为证据损坏。单个损坏 Run 必须 fail-soft 隔离，不能阻断同 Session 其他 Trace。
- 应用启动后异步执行 Trace retention：默认保留 30 天、全局最多 512 MiB，只删除最旧终态 Trace并保护 `recording` Run；产品内清理 Trace 不删除 `session.jsonl`。

## 当前主要可靠性缺口

- 结构化 Trace、summary 索引、生产分析页面、体积上限、保留与清理已经接入；仍需真实 Electron 长会话和 Retina 滚动验收。
- 分析页面已经能展示失败 Run 与脱敏错误块，但跨 provider 的原始 HTTP wire request/stream 仍未采集，当前请求 JSON/cURL 基于 provider-neutral snapshot。
- 还没有自动化 smoke path 覆盖“启动 -> turn -> 恢复”。
- Session V2 已直接统一 Agent Run、Turn 与 LLM Call 身份；后续新增消费方必须继续使用这三个不同层级，避免再次把产品标签当作数据身份。

## 上线前关键验收清单

- Grep/Glob 不依赖用户本机安装 ripgrep：
  - 在隔离 `PATH` 的环境中确认系统 `rg` 不可用，不要删除或卸载用户本机命令。
  - 不设置 `ACTSPACE_RG_PATH`。
  - 执行 Grep/Glob smoke，或直接验证 `resolveRipgrepCommand()`。
  - 预期使用 bundled `@vscode/ripgrep`，Grep/Glob 仍可返回结果。

## 后续建议维护的内容

随着真实 provider 和更多工具接入，这里建议继续补这些内容：

- 启动、健康检查和基本可用性要求。
- 日志、指标、链路的采集和访问约定。
- timeout、retry、backoff 的默认策略。LLM 可重试错误的自动重试已落地：默认最多 2 次重试、退避 1s → 3s，可通过 `AgentLoopConfig.llmRetry` 配置，详见 `docs/design-docs/agent-runtime/agent-backend-design.md` 的「LLM 错误分类与自动重试」。
- 本地和 CI 的关键路径验证方式。
- 常见故障、排查路径和恢复步骤。

CI/CD 流程结构和 release 自动化的默认方案，统一写在 `docs/CICD.md`。
