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
  - 在没有旧会话时，跑起一轮默认 turn
- `workspaces.json` 等会在启动期执行 reconciliation 的本地 registry，完整读改写流程必须串行化；原子替换使用唯一临时文件，禁止多个并发请求共享固定 `.tmp` 路径。
- 普通桌面会话通过统一可用模型解析器选择 DeepSeek、Kimi 或已添加的 OpenRouter 模型；连接测试为可选诊断，已保存 Key 且未明确测试失败的 provider 可直接使用。mock 只用于测试、浏览器 fixture 或显式 demo，不允许静默替代 Electron 真实 turn：
  - 启动应用
  - 请求 bootstrap state
  - 读取 session list
  - 执行或恢复一轮 turn
  - 渲染消息流
  - 本地落盘
- 每轮真实 turn 的 `session.jsonl` 必须能恢复用户输入、中间执行和最终回复，至少包含 `user_message`、每次模型回复对应的 `llm_usage` 和轻量 `context_snapshot`。
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
- 终端日志通过 `pnpm dev 2>&1 | tee -a <log-file>` 写入文件：`2>&1` 合并错误输出，`tee` 同时显示到终端和写入日志。
- Agent 排查启动、构建、Electron 或 provider 问题时，优先读取 `logs/latest-dev.log`。
- Agent 排查安装版启动问题时，优先读取 `~/Library/Application Support/actspace/logs/main-startup.log`。该日志由 main 进程直接写入，包含 app path 配置、数据目录初始化、窗口创建、renderer 加载成功/失败、renderer console、renderer 进程退出和 main 进程未捕获异常。
- 排查本地更新时，优先读取设置页显示的 `<userData>/tmp/local-update/status.json` 和 `update.log`；这些文件由外部 helper 写入，替换阶段可能发生在主 app 退出之后。
- 排查 Browser Bridge 编译安装失败时，先确认构建日志是否已经输出 `Built browser-bridge`，再区分临时二进制 `help` 探测失败、正式路径状态探测超时和 Chrome extension 未重载。若系统进程状态显示为不可中断等待，应先退出插件设置页和应用，停止继续轮询；代码侧不得通过提高 timeout 或重复重试掩盖问题。
- Agent turn 运行时会向终端即时输出关键链路日志，`pnpm dev:log` 会同步写入 `logs/latest-dev.log`：
  - `[agent-ipc]`：renderer 调用 main、main 推送 stream event、turn 持久化等 IPC 边界。
  - `[agent-run]`：Agent loop 生命周期、流式 delta 计数、工具开始/结束、turn 完成状态。
  - `[renderer-console]`：renderer console 输出转发，方便区分前端渲染错误和后端推送错误。
- 仓库根目录 `logs/agent-runs/` 会保存最近约 1 天的 Agent turn JSONL 排障文件，每次用户输入到 Agent 最终输出对应一个文件。文件包含完整用户输入、工具调用参数、工具结果、关键 AgentEvent、关键 RuntimeStreamEvent 和最终 AgentTurnResult；日志按状态记录，不按流式 chunk 逐行记录：
  - 模型流式文本聚合为单条 `assistant_text` / `assistant_thinking` 事件，并保留 delta 数量与字符数。
  - 模型输出的完整工具调用指令记录为单条 `assistant_tool_call`，不记录 `tool_call_delta` 碎片。
  - 工具真实执行只记录 `tool_event` 的开始和完成。
  这些状态级记录便于区分：
  - Agent 运行错误：看 `agent_event` / `tool_event` / `run_failed`。
  - 后端是否推送给前端：看 `stream_event`。
  - 会话持久化是否完成：看 `main_event` 的 `persisting_turn_result` / `turn_result_persisted`。
- run JSONL 文件只用于本地排障，可能包含敏感输入与工具输出；不要提交到 Git。仓库根目录 `logs/` 已在 `.gitignore` 中忽略。

## 当前主要可靠性缺口

- 还没有真正的结构化日志写入策略。
- 还没有 crash / provider error / write failure 的统一错误面板。
- 还没有自动化 smoke path 覆盖“启动 -> turn -> 恢复”。
- 当前 session 持久化格式和恢复链路仍需要持续收口，避免事件格式心智漂移。

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
