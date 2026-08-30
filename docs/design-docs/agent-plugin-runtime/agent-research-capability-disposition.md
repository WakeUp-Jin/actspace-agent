# ActSpace v2 能力去留研究

> 状态：研究判断，已同步 2026-08-22 确认的去留方向。本文档回答“现有资产怎么处理”，不定义 v2 的最终 API、包结构或迁移步骤。
>
> 具体架构所有权以 [v2 已确认决策](./agent-decisions-v2-foundation.md) 为准。

## 判断口径

本文使用五种处置方式：

| 处置 | 含义 |
|---|---|
| Keep | 语义和实现边界都稳定，可以近似原样迁移 |
| Adapt | 保留核心实现或行为，但接入新的生命周期、契约和依赖接口 |
| Rewrite | 现有所有权或数据模型与插件化 Runtime 冲突，按新不变量重写 |
| Delete | v2 基础能力不再包含它，切流后删除旧实现 |
| Defer | 当前不进入基础运行时，等待通用能力和产品价值都得到验证 |

“保留具体工具实现”在本文中的准确含义是：保留已经验证的执行算法、外部协议、错误分类、安全检查和行为测试。旧 `ToolManager`、旧 `ToolResult`、`ToolUiPreview` 和 runtime bag 不属于这项承诺。

当前没有一个完整 Runtime 或工具模块符合 Keep。接近原样复用的资产主要是纯 helper、协议 parser 和 provider transport，它们仍需通过新契约接入。

## 总体矩阵

| 能力 | 处置 | 保留内容 | 替换内容 |
|---|---|---|---|
| 文件读取、搜索与目录工具 | Adapt | 分页、行号、缓存、ripgrep 解析、错误语义 | 注册、路径能力、结果 envelope |
| 文件编辑、写入与删除 | Adapt | 精确替换、diff、模式保留、原子写入测试 | approval、path policy、artifact 与结果契约 |
| Bash 与后台进程 | Adapt | 子进程、输出上限、后台 registry、sandbox profile | activation ownership、审批和输出 middleware |
| Browser 工具与 Browser Bridge | Adapt | Go bridge、socket 协议、命令实现、分页和脱敏 | 专用 ToolManager 装配、UI preview 责任 |
| Web 与图片工具 | Adapt | provider transport、HTTP / SSE、解析和错误分类 | secret、fetch、LLM、artifact 依赖注入 |
| Todo | Rewrite | 增删改业务语义和行为测试 | durable state 与 UI 投影 |
| Agent / Explore | Rewrite | prompt、结果摘要、角色行为测试 | 子 Agent 创建、Scope、Session、取消和持久化 |
| LLM providers | Rewrite + Adapt | pi-ai Provider wire/catalog、现有代理/错误/usage 产品语义 | 闭合 factory、旧 SDK wire 实现、可变 Context 输入、重试归属 |
| ContextManager | Rewrite | token 估算、缓存稳定排序、安全压缩切点 | 消息所有权、prompt / tool 装配、compaction 写回 |
| AgentRuntime 与 loop | Rewrite | 单 Session 单 active run、abort、Host Adapter 思路 | turn / step、工具提交顺序、生命周期和错误结束事实 |
| Session persistence | Rewrite | 有价值的用户字段和读取测试 | 事件模型、连续序号、checkpoint、恢复与 fork |
| Observability | Adapt | trace、脱敏、summary、cache audit 算法 | 独立事实副本和重复 run log |
| Skills | Adapt | 多根发现、优先级、shadow diagnostics、catalog | frontmatter parser、生命周期、信任和资源限制 |
| fs-watch | Delete | 仅保留历史文档中的实现经验 | Rust 二进制、service、IPC、设置、Skill 与产品入口 |
| Desktop / React | Adapt | 现有产品结构、交互和内置 renderer | Runtime IPC、开放结果降级协议 |
| CLI | Adapt | run / chat UX、TTY、退出码、SIGINT、session lock | Runtime adapter 与启动组合 |
| Kairos | Delete | 仅保留历史文档中的产品与工程经验 | core、shared、IPC、renderer、设置、Skills 和产品入口 |

## 具体工具资产

### 文件读取和检索

`read_file`、`grep`、`glob` 和 `list_directory` 的核心价值位于 executor 和 helper，不在当前的集中注册入口。当前入口由 [`createToolManager()`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/tools/index.ts#L173) 手动枚举工具，再依据运行时配置决定暴露范围。

可迁移资产包括：

- 文本分页、稳定行号和大文件处理。
- `ripgrep` 输出解析和搜索结果裁剪。
- 对二进制、空文件、无匹配和进程失败的错误表达。
- 已有的 executor 单元测试。

需要重新决定的安全语义包括绝对路径读取。当前 [`read_file` executor](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/tools/tools/read-file/executor.ts#L26) 接受任意绝对路径，这不能在迁移时被默认为 v2 策略。

### 文件修改

[`edit_file` executor](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/tools/tools/edit-file-diff/executor.ts#L77) 中的精确匹配、diff 生成和写入结果有保留价值。approval 和 workspace policy 应由 Tool Runtime middleware 提供，executor 不应知道 Desktop approval UI。

原子写入 helper 也不能直接按名字判断。当前 [`write-atomic.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/tools/tools/shared/write-atomic.ts#L13) 在 rename 失败后退化为直接写目标文件。v2 需要先决定“尽量写入”还是“绝不半写”的契约，再选择实现。

### Bash

Bash 的 subprocess、输出落盘、后台进程和 sandbox 经验属于成熟资产。迁移时要把资源所有权交给插件 activation scope：插件卸载、Session 结束和 Host shutdown 都必须能等待或终止自己启动的进程，不能依赖 `ToolManager.dispose()` 的一次性清理。

### Browser

Browser Bridge 已经是独立 Go 进程和 socket 协议，适合作为内置 Host capability provider。浏览器命令、locator、分页和脱敏可以保留，工具定义通过插件注册。当前 [`createToolManager()`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/tools/index.ts#L224) 直接按 socket path 批量注册 browser definitions，这部分装配需要替换。

专用前端预览不再由工具实现负责。工具返回通用模型结果、detail 和 artifacts，固定前端只对内置 renderer 做增强。

### Web 与图片

Web Search、Web Fetch、图片生成和图片分析中的 provider transport、HTML 转换、图像编码和错误分类可以适配。当前 Web Search provider 会直接读取进程环境变量，[`providers.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/tools/tools/web-search/providers.ts#L276) 是需要改为依赖注入的代表位置。

### Todo

Todo 业务语义可以保留，但状态不能继续从 `ToolUiPreview` 或 transcript 展示数据恢复。v2 应把 Todo 变化写为经过 ActSpace EventCodecRegistry 注册和验证的 durable event，再由模型上下文和 UI 分别投影。

### Agent 与 Explore

这两个工具不能按普通 executor 搬迁。当前 [`agent/runner.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/tools/tools/agent/runner.ts#L85) 会直接创建旧 ContextManager、ToolManager、loop 和 SessionEvent。可以保留角色 prompt、输出摘要及行为测试，执行实现应重建在统一的 Agent、Scope、Session 和 Subagent seam 上。

## Runtime 与数据

### AgentRuntime 和 loop

当前 [`AgentRuntime.executeAgentRun()`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/runtime/agent-runtime.ts#L139) 同时处理 workspace、context、model、tool dependencies、持久化、trace、stream、title hook 和错误归一化。它保留“一 Session 只有一个 active run”和 Host Adapter 的方向，但不适合作为插件内核继续扩展。

现有运行链先写入 user events，再运行完整 harness，最后由 [`writeSessionResult()`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/persistence/session-store.ts#L260) 批量写入其余事件。这无法表达工具副作用前的 durability barrier，也不能可靠区分崩溃后“工具尚未开始”和“结果未知”。

v2 的事实模型需要重写，而不是给旧 SessionEvent 增加 plugin 字段。

### ContextManager

当前 [`ContextManager`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/context/manager.ts#L73) 同时持有可变 conversation、system prompt modules、tools、压缩状态和 token usage。loop 又直接向 conversation 追加消息，导致模型历史与持久化日志形成两个需要同步的真相来源。

值得保留的内容包括：

- prompt 分段和缓存稳定性经验。
- token usage bucket 与快照。
- 压缩安全切点、摘要和 tool pair 保护。
- 模型窗口估算与阈值触发经验。

新的 Context 组件应读取 Session surface 和 scoped contributors，生成一次不可变 prepared request。它不再拥有独立的可变 conversation。

### Session 和 observability

v2 需要新的有序 journal、surface projection、checkpoint 和冷恢复协议。已经确认不读取或迁移旧 v1 JSONL，也不让旧 `SessionEvent` union 成为 v2 内核类型。

Trace、脱敏、cache audit 和分析摘要仍有价值，但应成为 journal 的 projection。不能让 Session、run log 和 trace 各自保存一份含义相近却无法完全重建的数据。

## LLM、Skills 与外部进程

### LLM

v2 采用 pi-ai 作为 Provider wire/catalog engine，并通过 ActSpace 自有 LLM seam 隔离。当前 [`factory.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/llm/factory.ts#L25) 的闭合 switch 和三套 SDK wire 实现不作为目标边界；现有 per-provider proxy、结构化错误、usage/cost 和 credential 语义在 pi-ai 兼容门禁通过前继续作为迁移资产。

每次模型调用应接收已冻结的 prepared request，并绑定当次 Adapter registration、model defaults 和路由。下一次调用重新解析当前注册；重试策略由独立 middleware 或插件拥有，provider transport 不私自决定 Agent turn 是否重试。

### Skills

Skill 不是可执行后端插件。现有多根扫描、first-win 优先级、shadow diagnostics 和 catalog 注入可以保留。当前 [`registry.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/skills/registry.ts#L81) 负责发现和去重，而 [`frontmatter.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/skills/frontmatter.ts#L55) 使用手写冒号解析。

迁移时应补齐 YAML 解析、目录深度、文件大小、软链接和信任策略。Skill 对 system prompt 或 tool 的贡献也必须由 activation disposer 管理，不能永久写入全局 registry。

### fs-watch 与 Browser Bridge

当前仓库中的“插件”表示受 Desktop main 管理的独立二进制进程；v1 快照中的专用 shared contract 已随旧实现删除。它们不是 v2 通用插件 Runtime，当前公共语义以本目录的 Plugin Runtime ABI 为准。

v2 保留 Browser Bridge 的 Go 实现、Native Messaging、socket 协议和命令行为，通过新的 Host capability / tool plugin 接入。fs-watch 已确认删除：不迁移 Rust binary、文件/heartbeat 协议、Desktop service、IPC、设置页、Skill 或 Kairos 联动。若 Composition 配置需要监听，使用 Runtime 内部、生命周期归属明确的普通 watcher，不恢复 fs-watch 产品插件。

## 固定前端

当前 [`ToolUiPreview`](../../../packages/shared/src/session.ts#L508) 是闭合联合类型，[`isToolUiPreview()`](../../../packages/shared/src/session-selectors.ts#L36) 却只验证 `kind` 是字符串。未知插件 preview 因此可能通过 guard，但在闭合 switch 中没有可靠降级结果。

固定前端可以保留，但至少需要以下通用后端投影：

- plugin id、tool id、call id 和 schema version。
- running / completed / failed / denied / aborted 状态。
- duration、脱敏参数摘要、model output、summary、detail 和 artifacts。
- 可选 `rendererId + rendererSchemaVersion + props`。
- 未知 renderer 的 generic fallback 和结构化诊断。

renderer 只能来自 Desktop 构建时 allowlist。后端插件声明的前端代码不进入 renderer。插件若把前端能力标记为 required，是否拒绝 Host activation 由后续 ADR 决定。

## Kairos

Kairos 当前横跨 prompt、Context、ToolScheduler、SessionEvent、settings、Desktop IPC、Skills 页面和 renderer。它不是可以先移动目录、再称为插件的独立模块。

Kairos 已确认从 v2 中删除，不作为候选插件迁移。删除范围覆盖 Core、Shared schema、settings、Desktop main/preload/IPC、Renderer、Skills 联动和产品文档入口；已完成的历史记录继续作为证据保留。

## 已知迁移风险

- [`workspace-guard.ts`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/src/tools/workspace-guard.ts#L30) 使用 `resolve/relative` 判断路径，没有通过 `realpath` 证明可阻止 symlink escape，不能原样迁移其安全声明。
- 当前工具 registry 使用 `Map.set` 时可能静默覆盖同名项。插件 Runtime 必须按 provenance 报告冲突。
- `write-atomic` 的注释与 rename 失败后的 fallback 语义不完全一致。
- v1 Session 已确认不迁移；实施风险转为切流时精确确认可删除的数据目录，避免误删 workspace、credential、artifact 或其他用户数据。
- DSH 快照要求 Node `^22.19.0 || >=24.0.0`、pnpm 11.7 和 TypeScript 6.0；ActSpace 当前使用 pnpm 10.33，Agent Core 与 Desktop 使用 TypeScript 5.8。加上 DSH 的 patched Cordis，这些差异必须进入采用验证，不能只靠类型检查推断兼容（`tmp/deepseek-harness/package.json:3-10`、`tmp/deepseek-harness/package.json:178`；ActSpace [`package.json`](../../../package.json#L4)、[`agent-core/package.json`](https://github.com/WakeUp-Jin/actspace-agent/blob/v1-final/packages/agent-runtime/package.json#L36)）。
- DSH 使用 MIT，ActSpace 使用 Apache-2.0。两者并不直接阻止复用，但 vendor 或复制代码时要在 ADR 和发布检查中明确 attribution、notice 与更新责任（`tmp/deepseek-harness/package.json:4`；ActSpace [`package.json`](../../../package.json#L4)）。
- 固定前端能通用表达工具结果和状态，不等于能表达任意插件新增的完整产品页面。

## 本文不决定的内容

- v2 包目录和 npm package 数量。
- 插件 manifest、service、event 和 patch 的最终 schema。
- DSH Cordis 发布族的 fresh install 和 packaged Electron 验证结果；Agent Core 已确认不直接依赖 DSH 包。
- Session 物理 backend 和 Event Codec 最终 schema；v1 Session 已确认不迁移。
- 第三方插件签名、市场或自动更新。
- 动态执行模型生成的插件代码。

这些问题分别进入 ADR、目标规范和 execution plan，不能从本处置矩阵直接开始编码。
