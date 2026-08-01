# Agent Runtime、Desktop Adapter 与双模式 CLI 执行计划

状态：代码、文档与本机验证已完成；真实 provider 验收仍由用户执行

2026-08-01 回归修复：

- 修复 Workbench 切入 Settings 时因提前返回跳过后续 Hooks 导致的空白页，并增加进出 Settings 的回归测试。
- Composer 在没有可用 provider model 时显示“未连接模型”，发送按钮通过 tooltip 和无障碍名称解释阻塞原因；未连接时仍禁止错误发起 Turn。
- `run` / `chat` 省略 `--workspace` 时使用启动进程的当前目录，显式无效路径继续返回 `INVALID_WORKSPACE`；函数、真实子进程和单文件二进制三层均有覆盖。
- `chat` 将连续 thinking delta 聚合为一个语义块，在工具、正式回复或 Turn 终态边界刷新；`run --jsonl` 保持原始逐事件机器协议。
- Desktop 的 `This Mac` 允许尚无首次提交的 Git repository 原位运行，并保留 symbolic branch 名称；`New Worktree` 继续要求有效 `HEAD`，且不会自动创建提交。
- Renderer 不再以 `turn_started` 推断用户输入已经持久化；Turn 抛错后读取 Session 真实事件，未落盘时恢复输入和错误，已落盘时恢复 Session。

设计来源：`docs/design-docs/agent-runtime/agent-host-neutral-runtime-and-cli.md`

## 1. 目标

把当前由 Desktop Main 承担的生产级 Turn 编排提取为 `agent-core` 内的宿主无关 Agent Runtime，在不改变 Desktop 用户行为的前提下，让 `actspace-agent run` 和 `actspace-agent chat` 复用同一套 Session、Context、Tools、Approval、Abort、Event 和 Persistence 语义。

最终交付顺序：

```text
Runtime 契约与 characterization
  -> Runtime 提取
  -> Desktop Adapter 迁移
  -> CLI run 无头模式
  -> CLI chat 交互模式
  -> 单文件二进制分发
  -> 跨宿主回归与文档收尾
```

## 2. 范围

### 2.1 包含

- 在 `packages/agent-core/src/runtime/` 建立一等 Runtime 层。
- 下沉宿主无关的 Runtime Context 装配逻辑。
- 将活动 Turn、Abort、结果提交、终态事件和清理职责从 Desktop Main 迁入 Runtime。
- 保留 Desktop IPC 和 Renderer 行为，通过薄 Adapter 调用 Runtime。
- 重构现有 `actspace-agent run`，使其使用统一 Runtime。
- 为 `run` 增加 stdin、JSONL、稳定退出码、SIGINT 和 headless 审批语义。
- 新增行式 `actspace-agent chat`、终端审批和持久会话恢复。
- 为目标平台构建无需预装 Node.js / pnpm 的单文件 CLI 制品。
- 建立 Desktop / CLI 跨宿主契约测试。
- 同步过期的架构、测试、评估 CLI 示例、history 和学习文档。

### 2.2 不包含

- 任何外部评估框架的 Adapter。
- Web、HTTP、WebSocket、远程 Runner、Voice 或多用户会话。
- Desktop Renderer 视觉重设计。
- 全屏 TUI、鼠标交互或终端布局框架。
- Agent Loop、ToolScheduler、LLM provider 或 Context Compression 的重写。
- 新建 `runtime` package。
- 发布 npm 包、创建 Git tag、提交、推送或 PR。

## 3. 必读文档

每个实施会话开始前先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/design-docs/agent-runtime/agent-host-neutral-runtime-and-cli.md`
- `docs/design-docs/agent-runtime/agent-backend-design.md`
- `docs/design-docs/agent-runtime/agent-turn-layers.md`
- `docs/design-docs/agent-runtime/agent-current-module-map.md`
- `docs/design-docs/agent-runtime/agent-testing.md`
- `docs/design-docs/core-storage-and-observability.md`
- `docs/design-docs/execution-safety/agent-权限设计规则和原则.md`
- `docs/design-docs/execution-safety/agent-tool-approval-pause-resume.md`
- `docs/design-docs/evaluation/agent-evaluation.md`
- `docs/CODING_BEHAVIOR.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`

## 4. 当前事实基线

- `packages/agent-core` 不导入 Electron，Harness 可以复用。
- `packages/desktop/src/main/agent-turn.ts` 是当前生产 Runtime 原型。
- `packages/desktop/src/main/agent-runtime-context.ts` 组装主 prompt、AGENTS.md、Skills、模式和 Browser Bridge。
- `packages/desktop/src/main/approval-registry.ts` 实现可交互的 `ApprovalGate` 和 pending 生命周期。
- `packages/agent-core/src/engine/bridge.ts#runTurnWithAgent()` 执行 Harness、转换事件并过早发出 Turn 终态。
- `packages/agent-core/src/persistence/session-store.ts#writeSessionResult()` 返回 `WriteResult`。
- `packages/desktop/src/main/agent-turn.ts` 当前未检查 `writeSessionResult()` 返回的 `ok`。
- `packages/agent-cli/src/run.ts` 当前直接构造 `Agent`，不复用 Desktop 的生产 Runtime。
- CLI 当前只有 `run/help`，支持 `--input`、`--input-file`、`--workspace`、`--permission-mode`、`--json`、`--out`、`--mock` 和 `--model`。
- 当前 `default` / `trusted` 不创建审批 Gate；`yolo` 对 workspace-local 请求自动 `approve_once`。
- 当前 Linux Bash 路径可能执行在真实环境，不能宣称为 sandbox。
- `packages/agent-cli` 和 `packages/agent-core` 当前均为 CommonJS；CLI 仍依赖 workspace package，不是 standalone bundle。
- `packages/agent-core/src/tools/subprocess/ripgrep-path.ts` 通过动态 `require("@vscode/ripgrep")` 查找目标平台原生 `rg`，SEA 制品必须显式处理该资产。
- `packages/agent-core/src/env.ts` 当前会用 `__dirname` 向上探测仓库 `.env`；单文件制品中不能把 executable 位置当作仓库或配置根。
- Bash、Git 和 macOS `/usr/bin/sandbox-exec` 等能力来自宿主系统，单文件 CLI 不能承诺零系统依赖。

## 5. 共享契约与实现约束

### 5.1 单一 Runtime

不得为 CLI 复制一份 Session Runtime。Desktop、CLI `run` 和 CLI `chat` 必须调用同一个 `AgentRuntime.runTurn()`。

### 5.2 类型复用

- 继续复用 `RunTurnInput`、`RuntimeStreamEvent`、`SessionEvent` 和 `AgentTurnResult`。
- 只有确实跨 package 使用的字段才进入 `packages/shared`。
- Runtime 私有装配类型留在 `packages/agent-core/src/runtime/types.ts`。
- 不定义第二套 CLI Message、Tool Event 或 Session Event。

### 5.3 终态所有权

- Harness 可以产生 delta、tool、retry、approval 等运行中事件。
- Runtime 独占 `turn_finished`、`turn_aborted` 和持久化失败对应的 `turn_failed`。
- persistent 模式必须提交成功后才能发成功终态。
- ephemeral 模式不写产品 session，但仍返回完整 `AgentTurnResult`。

### 5.4 兼容入口

迁移期间保留 `runAndPersistTurn()` 的签名，内部转调新 Runtime。Renderer、preload 和 IPC channel 第一阶段不改。

### 5.5 审批语义

- Desktop：继续由 `PendingApprovalRegistry` 等待 IPC 决策。
- CLI Interactive：TTY Broker 等待用户决策。
- CLI Headless `yolo`：复用现有 workspace-local 自动审批。
- CLI Headless `default` / `trusted`：遇到 `ask` 时 fail fast 为 `APPROVAL_REQUIRED`，不得等待 stdin 中不存在的审批协议。

### 5.6 结构化输出

stdout 是 CLI 的公共数据通道，日志和警告必须进入 stderr。`--json` 和 `--jsonl` 模式下 stdout 不能混入 banner、ANSI、进度文本或 console debug。

### 5.7 二进制分发边界

- Node SEA 只负责封装 Node.js Runtime 和已 bundle 的 JavaScript 入口，不改变 Agent Runtime API。
- `agent-core` 不得导入 `node:sea`；SEA 检测、资产释放和 executable 元数据只属于 `agent-cli` 发布层。
- `ACTSPACE_RG_PATH` 继续是 core 的显式覆盖入口。CLI 二进制在创建 Runtime 前释放内嵌 `rg`，并通过该环境变量注入，不让 core 反向依赖 CLI。
- session、配置、日志和 `--out` 产物继续使用外部数据目录；不得写入 executable 所在目录或修改 executable。
- 每个 `platform-arch` 独立构建、签名和测试，不能把本机通过等同于全矩阵通过。

## 6. 里程碑 0：锁定当前行为

目标：在移动职责前，用 characterization tests 记录 Desktop Runtime 和 CLI 当前可见行为。

### 任务 0.1：Desktop Turn characterization

新增：

- `packages/desktop/src/main/test/agent-turn.test.ts`

覆盖：

- 先追加 user event，再运行 Harness。
- workspace preparation 失败会回滚 meta 和临时 worktree。
- Abort 会同时取消 Agent 和 pending approval。
- ToolManager 在 completed、failed、aborted、throw 四条路径均 dispose。
- persistent 写入失败不能被当作成功。
- 同一个 session 同时只有一个活动 Turn。

这一步允许先通过依赖注入或最小 internal helper 暴露测试边界，但不移动生产逻辑。

验证：

```bash
pnpm --filter @actspace/desktop exec vitest run src/main/test/agent-turn.test.ts
```

### 任务 0.2：Harness 终态 characterization

修改：

- `packages/agent-core/src/engine/test/bridge.test.ts`

记录 `runTurnWithAgent()` 当前的运行中事件、terminal event、failed result 和 aborted result。测试名必须明确哪些断言是迁移前基线，避免后续把旧行为误当长期契约。

验证：

```bash
pnpm --filter @actspace/agent-core exec vitest run src/engine/test/bridge.test.ts
```

### 任务 0.3：CLI 进程边界基线

修改：

- `packages/agent-cli/src/test/args.test.ts`
- `packages/agent-cli/src/test/run.test.ts`

覆盖现有 `--input` / `--input-file` 互斥、workspace 校验、默认 text 输出、`--json` 和无 `--out` 零产物规则。

完成条件：里程碑 0 的新增测试全部通过，且没有生产行为变化。

## 7. 里程碑 1：建立 Agent Runtime

目标：在 `agent-core` 内形成可实例化、可测试、无宿主依赖的 Turn Runtime。

### 任务 1.1：Runtime 类型和实例生命周期

新增：

- `packages/agent-core/src/runtime/types.ts`
- `packages/agent-core/src/runtime/agent-runtime.ts`
- `packages/agent-core/src/runtime/index.ts`
- `packages/agent-core/src/runtime/test/agent-runtime.test.ts`

修改：

- `packages/agent-core/src/index.ts`

实现：

- `createAgentRuntime(options)` 工厂。
- `runTurn()`、`abortTurn()`、`isSessionActive()`、`dispose()`。
- 实例级 active turn registry，不使用模块全局 Map。
- `persistent` / `ephemeral` 两种 persistence mode。
- `RuntimeEventSink`、`RuntimeContextProvider`、`RuntimeModelResolver`、`RuntimeApprovalBroker`、`WorkspaceExecutionProvider` Port。
- 每个 Turn 的 `try/finally` 清理栈，确保审批、工具、子进程和 registry 不泄漏。

测试必须覆盖：

- 同 session 并发拒绝，不同 session 可独立运行。
- 提前 abort、运行中 abort、审批等待时 abort。
- Runtime dispose 会中止全部活动 Turn 并等待清理。
- Event Sink throw 被记录但不会导致 Harness 重跑。

### 任务 1.2：下沉 Runtime Context loader

新增：

- `packages/agent-core/src/runtime/context-loader.ts`
- `packages/agent-core/src/runtime/test/context-loader.test.ts`

修改：

- `packages/desktop/src/main/agent-runtime-context.ts`
- `packages/desktop/src/main/test/agent-runtime-context.test.ts`

实施方式：

- 把 AGENTS.md、Skills、selected Skills、Agent / Chat / Plan mode segment 和 Browser Bridge segment 的纯装配迁入 core。
- Desktop 文件保留为 Host source provider，负责读取 data root、Settings 和 Browser Bridge 路径。
- 用同一 fixture 比较迁移前后 segment id、bucket、priority、顺序、tool profile 和 additional writable roots。

### 任务 1.3：把终态提交移到 Runtime

修改：

- `packages/agent-core/src/engine/bridge.ts`
- `packages/agent-core/src/engine/test/bridge.test.ts`
- `packages/agent-core/src/runtime/agent-runtime.ts`
- `packages/agent-core/src/runtime/test/agent-runtime.test.ts`

实施方式：

- `runTurnWithAgent()` 继续返回 `AgentTurnResult` 和运行中事件，但不再拥有最终提交成功语义。
- Runtime 在 persistent 模式检查 `appendEvents()` 和 `writeSessionResult()` 的每个 `WriteResult`。
- 持久化失败映射为 `PERSISTENCE_ERROR` 和 `turn_failed`。
- ephemeral 模式跳过 session/meta/context-state 写入，然后发出终态。
- 防止同一 Turn 重复发 `turn_failed` 或同时发 `turn_finished` 与 `turn_failed`。

### 任务 1.4：工作区准备和标题 Hook

修改：

- `packages/agent-core/src/runtime/types.ts`
- `packages/agent-core/src/runtime/agent-runtime.ts`
- `packages/desktop/src/main/agent-turn.ts`

实现：

- `WorkspaceExecutionProvider.prepare()` 返回 workspace、持久事实和 rollback 句柄。
- Runtime 在 user event 提交失败或 Harness 初始化失败时调用 rollback。
- 会话标题作为成功提交后的可选 `SessionTitleHook`，失败只记录，不反转已完成 Turn。
- CLI `run` 不启用标题；Desktop 保留当前首轮标题行为。

里程碑 1 验证：

```bash
pnpm --filter @actspace/shared build
pnpm --filter @actspace/agent-core typecheck
pnpm --filter @actspace/agent-core test
```

完成条件：Runtime 全部测试通过，`agent-core` 中不存在 Electron、TTY 或 CLI import。

## 8. 里程碑 2：迁移 Desktop Adapter

目标：Desktop 使用新 Runtime，Renderer 和 IPC 可见行为保持不变。

### 任务 2.1：创建 Desktop Runtime Adapter

新增：

- `packages/desktop/src/main/desktop-agent-runtime.ts`
- `packages/desktop/src/main/test/desktop-agent-runtime.test.ts`

修改：

- `packages/desktop/src/main/agent-turn.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/main/approval-registry.ts`

Adapter 负责：

- 将 `AppDataRoots` 映射到 core Runtime roots。
- 使用 `ModelRuntimeService` 实现 `RuntimeModelResolver`。
- 使用 Desktop runtime context source 实现 `RuntimeContextProvider`。
- 包装 `PendingApprovalRegistry` 为 `RuntimeApprovalBroker`。
- 使用 `BrowserWindow.webContents.send("agent:stream", event)` 实现 Event Sink。
- 注入现有 worktree preparation 和 title hook。
- 在 Electron `before-quit` 中 dispose Runtime。

`agent-turn.ts` 保留兼容 wrapper，不能继续保存另一份 active turn Map。

### 任务 2.2：Desktop 回归

自动化验证：

```bash
pnpm --filter @actspace/shared build
pnpm --filter @actspace/agent-core build
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop test
```

手工 Electron 验收单独记录：

- 新建会话并完成普通 Turn。
- 流式文字、thinking、tool preview 正常。
- 写文件审批 allow / deny 正常。
- 运行中停止后 UI 和 session 可恢复。
- 首轮标题、session history、context popover 正常。
- 关闭应用时活动 Turn 被清理。

完成条件：自动化通过；手工 Electron 验收如未执行，必须明确标为待用户验收，不能用 typecheck 代替。

## 9. 里程碑 3：实现 CLI `run`

目标：把现有评估型入口升级为稳定、无头、可组合的 Runtime Host。

### 任务 3.1：参数和退出码契约

修改：

- `packages/agent-cli/src/args.ts`
- `packages/agent-cli/src/types.ts`
- `packages/agent-cli/src/cli.ts`
- `packages/agent-cli/src/test/args.test.ts`

实现：

- `--input` 与 `--input-file` 互斥；两者都缺失时才读取非 TTY stdin，显式输入不探测可能长期不关闭的空 pipe。
- `--data-dir` 成为 `run` / `chat` 公共 Host 选项；`run` 只允许把它用于版本化 runtime cache 和诊断日志，不创建 session。
- 增加 `--jsonl`，并与 `--json` 互斥。
- `--workspace` 省略时使用启动进程的当前目录，显式提供时仍严格校验，并统一解析为绝对路径；自动化与评估调用建议显式传入。
- 将 usage/config、Agent failed、Runtime infrastructure、approval required、SIGINT 映射到设计文档规定的退出码。
- usage error 不打印堆栈；Runtime error 通过 stderr 给出稳定 code 和可读 message。

### 任务 3.2：CLI Runtime Adapter

新增：

- `packages/agent-cli/src/runtime-adapter.ts`
- `packages/agent-cli/src/model-resolver.ts`
- `packages/agent-cli/src/context-provider.ts`
- `packages/agent-cli/src/headless-approval.ts`
- `packages/agent-cli/src/output.ts`
- `packages/agent-cli/src/signals.ts`

修改：

- `packages/agent-cli/src/run.ts`
- `packages/agent-cli/src/permission.ts`

实施方式：

- 删除 `run.ts` 中直接 `new Agent()` 的生产路径，改为 `AgentRuntime.runTurn()`。
- `--mock` 通过 `RuntimeModelResolver` 注入 Mock LLM，不绕开 Runtime。
- CLI Context Provider 使用 core loader，加载 workspace AGENTS.md、Skills 和模式规则。
- Headless Approval Broker 对 `yolo` 复用 core policy；对未解决 ask 返回 `APPROVAL_REQUIRED`。
- text / JSON / JSONL sink 严格分离 stdout 和 stderr。
- 第一次 SIGINT 调 `runtime.abortTurn()`；第二次 SIGINT 强退。
- Runtime 结束后 dispose，并回收本 Turn 后台任务。

### 任务 3.3：评估产物兼容

修改：

- `packages/agent-cli/src/artifacts.ts`
- `packages/agent-cli/src/context-snapshot-collector.ts`
- `packages/agent-cli/src/event-collector.ts`
- `packages/agent-cli/src/test/artifacts.test.ts`
- `packages/agent-cli/src/test/run.test.ts`

要求：

- 没有 `--out` 时保持零评估产物。
- `--out` 继续只写目标目录内的固定文件。
- `trace.jsonl` 明确记录 Runtime 与 Harness 事件来源，不丢 tool/approval/error。
- context snapshot collector 继续是 sidecar，不进入 LLM Context。
- 输出目录路径穿越测试继续通过。

### 任务 3.4：真实进程 smoke

新增：

- `packages/agent-cli/src/test/process-smoke.test.ts`

覆盖构建后的 `dist/cli.js`：

- stdin 输入得到 text 输出。
- `--json` stdout 可直接 `JSON.parse()`。
- `--jsonl` 每个非空行均可 `JSON.parse()`，最后是 `run_result`。
- stderr 日志不污染 stdout。
- SIGINT 返回 130，且没有遗留子进程。
- 无头审批返回 4，不悬挂。

里程碑 3 验证：

```bash
pnpm --filter @actspace/shared build
pnpm --filter @actspace/agent-core build
pnpm --filter @actspace/agent-cli typecheck
pnpm --filter @actspace/agent-cli test
pnpm --filter @actspace/agent-cli build
node packages/agent-cli/dist/cli.js run --input "reply with ok" --workspace . --mock --json
```

完成条件：`run` 可以作为普通子进程稳定调用；实现中没有任何外部评估框架分支。

## 10. 里程碑 4：实现 CLI `chat`

目标：在同一个 CLI package 中增加可靠的持久交互模式。

### 任务 4.1：Chat 命令和 Session Store

新增：

- `packages/agent-cli/src/chat.ts`
- `packages/agent-cli/src/chat-session.ts`
- `packages/agent-cli/src/test/chat-session.test.ts`

修改：

- `packages/agent-cli/src/args.ts`
- `packages/agent-cli/src/types.ts`
- `packages/agent-cli/src/cli.ts`

实现：

- `actspace-agent chat --workspace <path>`。
- `--data-dir` > `ACTSPACE_DATA_DIR` > `~/.actspace`，不读取 Electron `userData`。
- CLI session root 固定为 `<data-dir>/sessions/`。
- 命令名 `chat` 只表示终端交互；V1 默认仍运行 `agent` mode，不映射到无工具的 `ComposerMode = "chat"`。
- stdin/stdout 必须是 TTY；非 TTY 明确提示改用 `run`。
- `/new`、`/sessions`、`/resume <session-id>`、`/exit`。
- 恢复时使用 core JSONL session store，不创建 CLI 私有历史格式。
- session id 和 workspace root 继续做路径安全校验。
- `chat-session.ts` 使用 `open(..., "wx")` 原子创建 lock file，内容固定为 `{ sessionId, hostname, pid, createdAt }`；第二个进程恢复同一 session 时失败。
- stale lock 只在 lock 记录属于本机且 PID 已不存在时自动回收；无法证明 stale 时保持 fail closed。

### 任务 4.2：Terminal Renderer

新增：

- `packages/agent-cli/src/terminal-renderer.ts`
- `packages/agent-cli/src/test/terminal-renderer.test.ts`

实现：

- assistant text 流式输出。
- 连续 thinking delta 聚合为一个语义块，tool started/finished、retry 和 error 使用紧凑终端状态；聚合仅属于 TTY 呈现，不修改 Runtime Event 或 JSONL 协议。
- TTY 可使用颜色；`NO_COLOR`、非 TTY 和测试环境不输出 ANSI。
- 动态内容不能破坏输入行，Turn 完成后恢复干净 prompt。
- Renderer 只消费 `RuntimeStreamEvent`，不解析内部 `AgentEvent`。

### 任务 4.3：Terminal Approval Broker

新增：

- `packages/agent-cli/src/terminal-approval.ts`
- `packages/agent-cli/src/test/terminal-approval.test.ts`

实现：

- 显示 tool name、summary、reason、risk、command 和 execution environment。
- 支持 `approve_once`、`allow_similar`、`deny`。
- delete 等不允许 `allow_similar` 的工具不能呈现该选项。
- Ctrl-C 生成 abort 决策并取消 Turn。
- timeout、EOF 和 Runtime dispose 必须解决 pending Promise。

### 任务 4.4：交互生命周期

新增：

- `packages/agent-cli/src/test/chat.test.ts`

覆盖：

- 多轮消息复用同一 session。
- `/new` 不污染旧 session。
- `/resume` 恢复 Context，并保持 workspace 绑定。
- 两个进程不能同时持有同一 session lock，已退出本机 PID 的 stale lock 可恢复。
- Turn 运行时 Ctrl-C 只中止 Turn；空闲时 Ctrl-C / Ctrl-D 退出。
- 异常路径恢复 terminal 状态并 dispose Runtime。

里程碑 4 验证：

```bash
pnpm --filter @actspace/agent-cli test
pnpm --filter @actspace/agent-cli typecheck
pnpm --filter @actspace/agent-cli build
node packages/agent-cli/dist/cli.js chat --workspace . --mock
```

手工验收必须覆盖一次 allow、一次 deny、一次 Turn abort 和一次 session resume。

## 11. 里程碑 5：单文件二进制分发

目标：在 `run` 和 `chat` 已通过源码构建验证后，为每个目标平台生成一个无需预装 Node.js 或 pnpm 的 `actspace-agent` 可执行文件。该里程碑不能提前阻塞 Runtime、Desktop Adapter 或两种 CLI 模式的语义收敛。

### 任务 5.1：Standalone JavaScript bundle 与 SEA 入口

新增：

- `scripts/build-agent-cli-binary.mjs`
- `packages/agent-cli/src/test/binary-bundle.test.ts`

修改：

- `package.json`
- `packages/agent-cli/package.json`
- `pnpm-lock.yaml`

实施方式：

- 使用 esbuild 把 `agent-cli`、`agent-core`、`shared` 和第三方 JavaScript 依赖 bundle 为一个 CommonJS entry；只把 Node built-ins 保持 external。
- 构建阶段扫描 bundle 的 unresolved import / dynamic require。除受显式资产流程管理的路径外，存在运行时 package 文件加载即失败。
- 使用 Node SEA 生成 executable。第一版构建脚本兼容仓库当前 Node 22 工具链：通过 `--experimental-sea-config` 生成 blob，再用 `postject` 注入目标 Node executable；当发布工具链迁到已验证的直接 `--build-sea` 版本时，外部制品契约保持不变。
- SEA build 使用普通 script entry，不启用 V8 snapshot 或 code cache，避免把构建机状态和架构固化进制品。
- 添加 `actspace-agent --version`，输出 CLI 版本、目标平台和构建标识；机器可读 stdout 不打印额外 banner。

验证：

```bash
pnpm --filter @actspace/agent-cli build
pnpm --filter @actspace/agent-cli test -- binary-bundle.test.ts
pnpm build:agent-cli:binary
```

### 任务 5.2：原生资产与可移植路径

新增：

- `packages/agent-cli/src/binary/runtime-assets.ts`
- `packages/agent-cli/src/binary/runtime-paths.ts`
- `packages/agent-cli/src/test/runtime-assets.test.ts`
- `packages/agent-cli/src/test/runtime-paths.test.ts`

修改：

- `packages/agent-cli/src/cli.ts`
- `packages/agent-core/src/env.ts`
- `packages/agent-core/src/test/env.test.ts`
- `packages/agent-core/src/tools/subprocess/ripgrep-path.ts`
- `packages/agent-core/src/tools/test/subprocess.test.ts`

实施方式：

- 构建脚本从目标 runner 的 `@vscode/ripgrep` 读取匹配平台的 `rg[.exe]`，以固定 asset key 和 SHA-256 写入 SEA 配置。
- 二进制启动时先解析 `--data-dir` / `ACTSPACE_DATA_DIR` / 默认数据根，再把 `rg` 原子释放到 `<data-dir>/runtime/<cli-version>/<platform>-<arch>/`。
- 首次释放使用同目录临时文件、哈希校验、可执行权限和原子 rename；并发进程可以复用同一正确结果，不能读到半文件。
- 用户显式提供 `ACTSPACE_RG_PATH` 时，CLI 不释放或覆盖它；路径无效直接报配置错误。否则 CLI 优先释放内嵌资产并把绝对路径注入 Runtime；释放失败时记录 stderr 诊断并让 core 尝试系统 `PATH`。开发安装中的 `@vscode/ripgrep` 只作为非 SEA 降级路径，SEA 专属逻辑不进入 core。
- 移除 core 用 `__dirname` 向仓库根探测 `.env` 的生产依赖。CLI V1 只读取允许名单内的进程环境变量，不自动扫描 executable 邻近目录；Desktop 如需 `.env`，继续通过 Host Adapter 传入明确路径。
- session、日志、配置和评估产物只能写外部数据目录或显式 `--out`，不能写 executable 邻近目录。

测试覆盖：

- 正常释放、已有正确缓存、损坏缓存重建，以及数据根无写权限时的系统 `rg` 降级或稳定 capability error。
- 两个进程并发首次释放不会产生半文件或错误哈希。
- macOS / Linux executable mode 与 Windows `.exe` 命名。
- 显式 `ACTSPACE_RG_PATH` 仍可覆盖内嵌资产。
- 把 executable 移到任意目录后，配置和 workspace 解析结果不变。

### 任务 5.3：目标矩阵、签名和 CI 制品

新增：

- `.github/workflows/agent-cli-binaries.yml`
- `scripts/agent-cli-binary-targets.json`

目标矩阵：

- macOS：`darwin-arm64`、`darwin-x64`
- Linux：`linux-x64`、`linux-arm64`
- Windows：`win32-x64.exe`

要求：

- 每个制品在匹配的原生 runner 上 bundle、注入对应 Node executable、嵌入对应 `rg` 并执行 smoke；不得在一个 runner 上伪造其他平台的成功。
- `scripts/agent-cli-binary-targets.json` 固定 Node SEA builder 版本、目标 triple、asset 名和 checksum 输入，升级必须经过全矩阵验证。
- macOS 测试制品先移除旧签名、完成 SEA 注入，再做 ad-hoc codesign。公开发布时改用仓库外 Developer ID secrets 并 notarize；当前计划只产出可审核 CI artifact，不发布 Release、不创建 tag。
- CI artifact 名包含 CLI version、OS 和 arch，并附 SHA-256；Windows 使用 `.exe`，其他平台统一为 `actspace-agent`。

### 任务 5.4：真实单文件 smoke

新增：

- `scripts/test-agent-cli-binary.mjs`
- `packages/agent-cli/src/test/binary-process-smoke.test.ts`

每个目标制品必须覆盖：

- `--version` 可执行且与 artifact 元数据一致。
- `run` 的 text、JSON 和 JSONL stdout 契约不变。
- `chat` 可在 PTY 中启动、完成一个 mock Turn 并正常退出。
- 在移除 Node.js 和 pnpm 的测试 `PATH` 后仍能完成 mock `run`。
- 临时 workspace 中的 Glob / Grep 调用真实内嵌 `rg` 成功。
- 两个进程共享空数据根并发首次启动，runtime asset 最终只有一个有效版本。
- binary 位于只读目录时仍可运行，所有可变数据进入 `--data-dir`。

里程碑 5 验证：

```bash
pnpm build:agent-cli:binary
pnpm test:agent-cli:binary
```

完成条件：本机目标制品全部 smoke 通过；CI 矩阵逐项报告，不用一个平台的结果代替其他平台。公开发布签名如尚未配置，必须明确记为发布阻塞项，但不影响本地架构实现验收。

## 12. 里程碑 6：跨宿主收敛与文档

### 任务 6.1：跨宿主契约 fixture

新增：

- `packages/agent-core/src/runtime/test/fixtures.ts`
- `packages/agent-core/src/runtime/test/host-parity.test.ts`

通过确定性 Mock 比较 Desktop Profile、CLI Headless Profile 和 CLI Interactive Profile：

- 相同模式下 Context segment 和 tools 相同。
- profile 差异只来自显式 capability、persistence 和 approval 配置。
- completed、failed、aborted、approval required 的事件顺序稳定。
- ephemeral 与 persistent 的唯一差异是存储副作用和提交阶段。

### 任务 6.2：文档同步

按最终实现更新：

- `docs/ARCHITECTURE.md`
- `docs/design-docs/agent-index.md`
- `docs/design-docs/agent-runtime/agent-host-neutral-runtime-and-cli.md`
- `docs/design-docs/agent-runtime/agent-turn-layers.md`
- `docs/design-docs/agent-runtime/agent-current-module-map.md`
- `docs/design-docs/agent-runtime/agent-testing.md`
- `docs/design-docs/evaluation/agent-evaluation.md`
- `docs/exec-plans/active/20260708-agent-evaluation/README.md`
- CLI help 与仓库 README 中存在的调用示例。

必须修正旧文档把文件路径写成 `--input task.md` 的示例，文件输入统一使用 `--input-file task.md`。

### 任务 6.3：History 与学习文档

- 在 `docs/histories/2026-07/` 为同一任务维护一份 history，记录每个完成里程碑和最终验证边界。
- 本任务命中新概念、可迁移、有深度和有陷阱四项条件。实现完成后读取 `docs/learnings/WRITING_GUIDE.md`，新增一篇关于“Agent Harness、Application Runtime 与 Host Adapter 分层”的学习文档到 `docs/learnings/2026-07/`。
- 学习文档不得记录本机绝对路径、密钥、真实 prompt 或评估数据。

## 13. 最终验证矩阵

### 13.1 自动化

按依赖顺序执行：

```bash
pnpm --filter @actspace/shared build
pnpm --filter @actspace/shared test
pnpm --filter @actspace/agent-core build
pnpm --filter @actspace/agent-core test
pnpm --filter @actspace/agent-cli typecheck
pnpm --filter @actspace/agent-cli test
pnpm --filter @actspace/agent-cli build
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop test
pnpm check:docs
pnpm check:secrets
git diff --check
```

如果 `agent-core` 全量测试因受限环境 Unix socket `EPERM` 失败，必须：

1. 单独报告失败测试和错误文本。
2. 运行本计划对应的全部 focused tests。
3. 不把 sandbox 限制描述为功能回归，也不把 focused tests 描述为全量通过。

### 13.2 CLI 手工验收

```bash
node packages/agent-cli/dist/cli.js run --input "reply with ok" --workspace . --mock
node packages/agent-cli/dist/cli.js run --input "reply with ok" --workspace . --mock --json
node packages/agent-cli/dist/cli.js run --input "reply with ok" --workspace . --mock --jsonl
node packages/agent-cli/dist/cli.js chat --workspace . --mock
node packages/agent-cli/dist/cli.js run --input "use current directory" --mock --json
```

检查 stdout 可机器解析、stderr 独立、SIGINT、审批、session resume 和进程清理。

### 13.3 单文件二进制验收

在当前开发平台运行：

```bash
pnpm build:agent-cli:binary
pnpm test:agent-cli:binary
```

检查 executable 可从只读目录启动、无 Node.js / pnpm `PATH` 依赖、runtime asset 写入独立数据根、`run` 结构化输出不变，并人工进入一次 `chat`。其他平台结果以 CI matrix 为准，未运行的平台必须明确标记，不能推断为通过。

### 13.4 Desktop 手工验收

使用 `pnpm dev:log` 启动真实 Electron，并按里程碑 2 清单验收。日志检查 `logs/latest-dev.log` 和对应 Agent run JSONL。

## 14. 风险与回退

### 风险 1：Desktop 行为回退

缓解：先写 characterization tests；`runAndPersistTurn()` 保留兼容 wrapper；每个迁移切片都运行 Desktop focused tests。

回退：让 wrapper 暂时回到旧编排实现，新 Runtime 文件保留但不接生产路径；不得删除 session 数据或回滚用户工作区。

### 风险 2：终态事件改变 Renderer 状态机

缓解：保持事件类型不变，只调整 terminal event 的提交时机；增加 completed / failed / aborted 顺序测试。

回退：恢复旧 Event Sink 适配，但保留持久化 `WriteResult` 检查，不能恢复“写失败仍显示完成”。

### 风险 3：CLI Context 与 Desktop 漂移

缓解：统一 core loader 和 host parity fixture；Host 差异进入 Profile。

回退：关闭 CLI 特定 capability，不允许复制 Context loader 到 CLI。

### 风险 4：交互审批导致 stdin 竞争

缓解：`run` 和 `chat` 分开；只有 `chat` 创建 TTY Broker，`run` 不从任务 stdin 中偷偷读取审批答案。

回退：保留 `run`，暂缓 `chat` 发布；不能把交互审批塞回无头协议。

### 风险 5：大范围同时迁移难以定位错误

缓解：严格按里程碑推进；每个里程碑完成验证和 history 记录后再进入下一个。

回退：以里程碑为单位恢复 Adapter 接线，不回退已经证明独立正确的 core tests。

### 风险 6：SEA 中动态加载或资源路径失效

缓解：先做 standalone bundle 检查，再从真实 executable 运行 text / JSON / JSONL、PTY 和 Tool smoke；禁止依赖 executable 邻近的 `node_modules`、仓库根或 `.env`。

回退：继续交付已验证的 `dist/cli.js` 入口并把二进制标记为未就绪；不能为了打包修改 Runtime 对外契约或复制 Agent 实现。

### 风险 7：目标平台原生资产或签名失败

缓解：在匹配 runner 上获取 `rg`、构建、签名和 smoke；制品按版本和 target 隔离并附 checksum。

回退：停止发布失败 target，只保留已验证平台的 CI artifact；缓存清理只作用于对应 `<cli-version>/<platform>-<arch>`，不得触碰 session 和配置。

## 15. 进度记录

- [x] 2026-07-31：完成现状审计和长期设计草稿。
- [x] 2026-07-31：完成本执行计划草稿。
- [x] 用户审核设计规范和执行计划。
- [x] 里程碑 0：锁定当前行为。
- [x] 里程碑 1：建立 Agent Runtime。
- [x] 里程碑 2：迁移 Desktop Adapter。
- [x] 里程碑 3：实现 CLI `run`。
- [x] 里程碑 4：实现 CLI `chat`。
- [x] 里程碑 5：单文件二进制分发。
- [x] 里程碑 6：跨宿主收敛、文档、history 与学习沉淀。

## 16. 决策记录

- 2026-07-31：保留现有 Agent Harness，只提取宿主无关 Runtime。原因是 `agent-core` 已无 Electron 依赖，重复实现引擎会造成行为漂移。
- 2026-07-31：第一版 Runtime 留在 `packages/agent-core/src/runtime/`。原因是边界尚未被 Desktop 与 CLI 双宿主验证，提前拆 package 会放大迁移面。
- 2026-07-31：CLI 分成 `run` 和 `chat` 两个命令，共用 Runtime。原因是机器协议与 TTY 交互的输入、审批和输出约束不同。
- 2026-07-31：先实现 `run`，再实现行式 `chat`，全屏 TUI 延后。原因是无头模式可以先验证 Runtime 边界，交互模式随后只增加 Terminal Adapter。
- 2026-07-31：单文件二进制放在 `run` / `chat` 语义稳定之后。原因是它是 CLI 发布层，不应反向塑造 Runtime，也不应阻塞双宿主解耦。
- 2026-07-31：第一版使用 standalone CommonJS bundle + Node SEA，并把目标平台 `ripgrep` 作为受校验资产释放到版本化数据目录。原因是这条路线最大限度保留现有 Node SDK 和子进程语义，同时解决原生资产不能直接被 JavaScript bundle 吸收的问题。
- 2026-07-31：本计划不包含外部评估 Adapter。原因是稳定的无头 CLI 是上游基础，外部框架应在其上通过薄适配层接入，不能反向塑造 Runtime。
- 2026-07-31：Web 暂缓。原因是本机遥控器与云端 Agent 产品的部署、安全、所有权和会话协议差异过大，需要产品形态明确后单独设计。
- 2026-07-31：`--input` / `--input-file` 存在时不探测或等待 stdin；只有两者都缺失时才读取非 TTY stdin。原因是自动化调用方可能保留未关闭的空 stdin pipe，等待 EOF 会让已有显式输入的无头调用永久挂起。

## 17. 审核通过条件

开始里程碑 0 前，用户需要明确确认：

1. 接受 `agent-core/src/runtime` 作为第一版位置。
2. 接受 Desktop 先迁移、CLI `run` 和 `chat` 后接入、最后再做单文件二进制的顺序。
3. 接受 `run` 为 ephemeral、`chat` 为 persistent 的默认会话策略。
4. 接受 V1 `chat` 采用行式交互而不是全屏 TUI。
5. 接受外部评估 Adapter、Web 和 Voice 不进入本轮。
6. 接受 Node SEA 作为第一版单文件分发基线，并接受每个平台独立制品、`ripgrep` 释放到版本化数据目录、系统 Shell / Git 等能力不随二进制内置。
