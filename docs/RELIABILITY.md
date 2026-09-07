# 稳定性与可运维性

> 状态：当前 v2 运行质量基线。历史 v1 Session、Trace sidecar、Kairos 和旧 Agent Core 的可靠性约定不适用于本页。

## 启动与数据目录

Desktop 启动必须初始化：

- Desktop 与 CLI 默认共享平台目录 `<dataRoot>`（macOS 为 `~/Library/Application Support/ActSpace`）；`--data-dir` / `ACTSPACE_DATA_DIR` 可显式覆盖；
- `<dataRoot>/sessions-v2/`：持久 Session 目录；
- `<dataRoot>/tmp/`：可再生的临时文件与工具输出；
- 开发态仓库 `logs/` 或安装态 `<dataRoot>/logs/`：本地排障日志。

应用数据目录和用户 workspace 必须分离。文件工具默认操作显式 workspace；Session、凭据、运行时诊断和临时产物不得隐式成为 workspace 内容。

## Session Journal

- 每个持久 Session 的唯一恢复事实源是 `sessions-v2/<sessionId>/journal.jsonl`。
- Journal 第一条记录是 Header，后续记录是 append-only Event Envelope。当前 schema、codec、repair、fork 和 compaction 语义以 [`agent-spec-session-format-v1.md`](design-docs/agent-plugin-runtime/agent-spec-session-format-v1.md) 为准。
- Desktop 和 CLI persistent mode 必须通过各自 Profile Bundle 使用同一 Session service；CLI `run` 默认 ephemeral，只有 `--persist` 或 `--resume` 才写 Journal。
- 同一 Session 同时只能有一个 writer lease。发现陈旧 lease、尾部撕裂或非法事件时必须进入明确的 repair / forensic 路径，不能静默覆盖原 Journal。
- 用户输入、Assistant 消息、工具调用、审批结果、request snapshot、LLM usage、重试、Todo、Inbox、Subagent lineage 和 Compaction 都通过 Journal 事件表达；不得再建立可变 conversation 文件作为第二事实源。
- 写操作返回前只保证对应 API 契约声明的 durability checkpoint。退出流程必须先停止接收新工作，再等待 active turn、Journal flush、artifact finalizer 和 Cordis effect dispose。

## Runtime 与 Host

- 一个 Host 进程只允许存在一个 ready Profile root。
- Desktop 与 CLI 共享 `bootRuntime()`、Profile / Bundle / Patch、领域插件和 shutdown 语义，不实现第二套 Agent engine。
- Cordis 管理插件 Service / Effect 生命周期；Host 管理 credentials、filesystem、shell、browser 和 UI ports。
- 配置或插件集合变化采用 restart-only。运行中的实例不热替换 Plugin Entry；diagnostics 必须能报告 `restartRequired`。
- Boot 中途失败时必须按逆序释放已经激活的资源。`dispose()` 应可重复等待同一个关闭结果，不能重复执行 finalizer。

## Provider 与工具

- Desktop 真实会话使用设置页保存的 provider credential；CLI 使用显式进程环境变量。mock 只允许测试、fixture 或用户显式传入 `--mock`，不得静默代替真实请求。
- LLM request、retry、usage 与错误必须落到稳定 Journal event；原始 Authorization、Cookie、provider header 和未经脱敏的错误正文不得进入 Journal、Projection 或日志。
- 工具执行必须经过 definition validation、policy、approval、prepared execution、checkpoint 和 ordered commit。副作用是否发生不确定时，必须返回 outcome-unknown，而不是猜测成功或自动重试。
- 工具大输出和二进制内容进入 Session-owned artifact；Journal 和 renderer 只持久化结构化摘要与 artifact reference。
- Browser Bridge 是独立 Host capability。静态构建通过不代表真实 Chrome 可用；扩展、Native Messaging、socket 和只读操作必须作为单独的实机门禁。

## Projection 与可观测性

- Durable Session、live progress 和 diagnostics 是三条不同投影：durable 数据可由 Journal 重建，live progress 允许进程结束后消失，diagnostics 不进入模型上下文。
- Context 面板、Usage、Analysis 和 Trace 视图当前都从 `request/snapshot`、`llm/usage`、Turn、Tool 与 Compaction Journal event 派生，不读取独立 `context-state` 或 Trace sidecar。
- `agentRunId -> turnId -> stepId -> requestId` 是运行层级。UI 可以使用 `llmCallId` 作为 request ID 的展示名称，但不得把一次 Agent Run、一次 Turn 和一次 provider request 合并成同一身份。
- Runtime Projection 必须执行字段白名单、字符串上限、artifact 归一化与 secret redaction；renderer 不直接读取 Session 文件。

## 本地排障入口

- `pnpm dev:log`：启动 Desktop，并把监督器、构建、Electron main 和 renderer 日志写入 `logs/dev-*.log`，同时更新 `logs/latest-dev.log`。
- 安装态主进程日志：`<userData>/logs/main-startup.log`。
- 本地更新 helper：`<userData>/tmp/local-update/status.json` 与 `update.log`。
- `pnpm check:packages`：校验 workspace package、manifest、behavior、codec 和 lifecycle 边界。
- `pnpm check:v2-legacy-removal -- --strict`：确认当前生产入口没有回连 v1 engine、旧 Session 或已退役能力。
- `pnpm typecheck`、`pnpm test`、`pnpm build`：类型、行为与制品构建基线。

## 发布门禁

自动化通过不能替代以下外部验收：

- 真实 DeepSeek、Kimi 或 OpenRouter request / resume；
- 真实 Electron reload、quit、flush 和 isolated `userData`；
- Chrome Extension、Native Messaging 与 Browser Bridge；
- macOS DMG、签名、公证和安装后启动；
- 用户对固定 renderer 关键页面的人工验收。

任一门禁未完成时，文档必须写“自动化通过、外部门禁待验收”，不能写“发布完成”。

## 当前主要缺口

- `packages/runtime` 的直接 lifecycle / shutdown 测试仍需补强；当前主要由 CLI 和 Host integration 间接覆盖。
- 真实 Provider、Browser、DMG、签名与公证受当前网络或宿主能力限制，仍未形成最终发布证据。
- Renderer 主 bundle 及部分大型组件需要后续性能和可维护性拆分，但不属于本轮文档真相修复。

CI/CD 与制品规则见 [`CICD.md`](CICD.md)；供应链边界见 [`SUPPLY_CHAIN_SECURITY.md`](SUPPLY_CHAIN_SECURITY.md)。
