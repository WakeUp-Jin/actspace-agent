# P5：职责、Cordis、测试与文档收敛

状态：已完成，2026-10-04。开发与自动化验证通过，U1–U9 验收路线已覆盖，B1/B2 修复经 Sol 定向复验通过；B3 误报已撤回且不同配置实机校准通过。见 [第三轮报告](../../../exec-runs/20261003-agent-harness-host-refactor/execution-summary.md)。保留无关工作区改动，未提交。

## 1. 目标与边界

模块化优先，在职责清晰的前提下精简。Host 是稳定承载基底，Harness 是可演进插件组合，Run 是使用固定组合的一次执行实例。Host/Harness 都围绕 Cordis 插件化，不强求一个概念一个包，也不合并有真实差异的领域职责。

Patch 只表达组合差异，生成完整新定义后独立装配。新 Run 使用最新成功启用的组合，旧 Run 保留旧组合至结束。Host/Profile 不随切换重建。**不实施跨组合实例共享、插件级引用计数、自动影响范围计算或性能复用框架。** 固定产物复用与运行实例复用分开。

保持 P1–P4 当前产品行为：任务接纳与去重、内容队列、模式边界、模型配置读取时机、取消、审批、压缩、子 Run、新旧组合、远端连接、附件与结果访问。自进化工具、手机 Web 前端、远端终端/Git、部署和 UI 重设计不在范围内。

无外部旧 API 兼容承诺；仓库消费者与测试一并迁移后删除旧入口。保留设置配置，旧运行历史不要求兼容，但本计划不主动改变持久格式，也没有必须清理用户历史的步骤。

## 2. 必读与基线

- 仓库 `AGENTS.md`、`docs/REPO_COLLAB_GUIDE.md`、`docs/ARCHITECTURE.md`、`docs/design-docs/core-beliefs.md`。
- `docs/CODING_BEHAVIOR.md`、`docs/HISTORY_GUIDE.md`、`docs/QUALITY_SCORE.md`、`docs/PLANS_GUIDE.md`。
- [设计决策](../../../design-docs/agent-plugin-runtime/agent-harness-host-refactor-decisions.md)第 40–42 节、[机制验证](../../../exec-runs/20261003-agent-harness-host-refactor/phase-5-cordis-feasibility.md)、[P4 最终复验](../../../exec-runs/20261003-agent-harness-host-refactor/phase-4-cu-round10.md)。
- `docs/design-docs/agent-plugin-runtime/agent-testing.md`、`docs/FRONTEND_VERIFICATION.md`。

基线 HEAD 为 `a4f9c6e`；实施前重新确认。当前包含本任务前序机制验证及文档改动，不能覆盖；前端 space 设计文件、对应历史记录与 `myplan.md` 属于无关工作，保持原样。

已核实的代码事实：

| 位置 | 当前问题/保留理由 |
| --- | --- |
| `packages/cordis-adapter/src/dispatch.ts` | `emitContained` 手动取得 callbacks 并等待全部结束，和纯 emit 通知目标不同；`requiredDispatch` 也依赖手工分发 |
| `packages/core/agent/src/dispatch.ts` | emit/required 以 Promise 持有 scope；调整通知不能误把真正必需的工作提前释放 |
| `packages/session/checkpoint-policy/src/plugin.ts`、`packages/core/agent-loop/src/loop.ts` | checkpoint 通过 required 事件等待 flush；它是执行屏障，不是通知 |
| `packages/tools/runtime/src/prepared-execution.ts` | Cordis 插入点与 registration.middleware before/after 并存；当前 middleware 实参只在 runtime 测试中出现 |
| `apps/cli/src/runtime-v2/{artifact-store,llm-adapter,tool-host-services}.ts` | 三个文件仅转发 `@actspace/agent-host/node-ports` |
| `apps/cli/src/runtime-v2/host.ts` | 同时承担 Runtime 装配、gateway、订阅、维护计时器、drain 与管理命令分派 |
| `packages/desktop-app/src/service.ts`、`packages/headless/src/runner.ts` | 分别有标题策略和单次执行/退出职责，应保留，不因共享应用契约而合并 |
| `packages/boot/src/harness-generations.ts`、`harness-mount.ts` | 已具备整组合隔离和 Run 租约；保留，不接入共享实例实验 |

计划涉及超过 8 个文件，分三批验证，每批可以独立保持应用可用。架构依赖保持：

```text
Desktop / CLI → 应用操作 → 任务管理 → 固定 Harness → Loop / 工具
CLI Host 启动 → Runtime 装配
             → agent-host 生命周期与传输（通过显式端口接入 Runtime）
Runtime → Cordis 插件装配、领域服务
```

不得新增 `agent-host → runtime` 静态依赖，Runtime 已依赖 agent-host。不要靠动态 import 隐藏这个循环。

## 3. 实施记录与测试基线

在现有 exec-runs 目录创建 `phase-5-process.md`、`phase-5-summary.md`，摘要先标“执行中”，并维护 `phase-5-test-map.md`：旧测试、保护的行为、新归属、保留/迁移/删除、命令与结果。

开始产品改动前运行本计划第 8 节涉及的包测试、工程门禁和进程测试，记录既有失败、环境限制及命令退出码。已有失败不能归为本次回归；也不能因基线失败就允许新增失败。每批改动仅重跑受影响范围，全部收尾时做总回归。

记录 `git status --short`。使用独立统计槽，不覆盖原 P1 before：

```sh
pnpm refactor:stats before --plan 20261004-agent-harness-p5
```

该脚本分别统计生产源码行、测试行和文档字符。before/after 都包含当时工作树内容；另记录本任务路径差异，避免把其他前端改动计为本次精简成果。统计只提供证据，不设强制减行目标。

## 4. 第一批：事件与资源生命周期

### T1 必需 checkpoint 改为明确服务调用

修改：

- `packages/session/checkpoint-policy/src/{plugin,manifest,index}.ts`：由该插件提供 `session.checkpoint` 服务，`flush({ sessionId, throughSeq, reason }): Promise<void>`；沿用会话查找与 flush 校验，失败向调用者传播。保留插件包，不引入第二套持久化。
- `packages/core/agent-loop/src/loop.ts`：生产有 Context 时显式获取必需 checkpoint 服务并等待；服务缺失直接失败。保留无 Context 单元执行已有的 session.flush 路径。所有 before-llm、before-tool、before-next-step、after-turn-settled 屏障保留。
- `packages/core/agent/src/dispatch.ts`、`packages/cordis-adapter/src/{dispatch,event-contract}.ts`：删除 required 分发和 checkpoint 通知声明，迁移全部调用方后删除导出。
- `packages/runtime/src/runtime/{default-harness,agent-runtime-plugin}.ts`：checkpoint 从 event requirement 改成 shared service requirement；在 factory 所需注入与兼容声明中加入服务。
- `packages/runtime/src/profiles/composition.ts`、`packages/runtime/cordis.yml`：核对服务提供顺序/注入，使三个 Profile 都能装配。只改与新增服务契约相关的声明。

测试接替：checkpoint-policy lifecycle、core/agent dispatch、core/agent-loop tool-stream/steer、runtime default-harness。旧“required 事件有监听者”断言改为“checkpoint 服务存在且完成/失败”；保留缺失即失败、落盘完成前不执行工具、取消结算失败可见三个行为。

完成标准：checkpoint 不再伪装 emit；固定产物 manifest 与真实装配一致；候选缺少服务被拒绝。

### T2 纯通知使用 Cordis emit，错误在监听注册处隔离

修改：`packages/cordis-adapter/src/{dispatch,cordis-types,event-contract,index}.ts`、`packages/core/agent/src/dispatch.ts`、`packages/runtime/src/runtime/{session-plugin,agent-runtime-plugin}.ts`、`packages/headless/src/runner.ts` 及它们实际使用的通知监听注册点。

实现约束：

- 原生 `ctx.emit(carrier, name, payload)` 是唯一通知分发方式；不遍历 `events.dispatch` 返回的 callbacks，不保存第二份监听集合，不引入事件类或新总线。
- 在通知订阅处使用小型监听包装函数：同步 throw 和异步 rejection 分别捕获，记录现有 Cordis logger/诊断；注册和注销仍由 ctx.on/once 及所属 Fiber 负责。包装只处理通知，不能吞 waterfall/serial/必需服务错误。
- `emit` 不等待观察者。删除仅为等待通知而存在的 await 和 scope acquire；调用方仅等待业务必需操作。
- 异步观察者由所属插件管理在途工作与退出。已有任务跟踪可复用；通知包装不提供通用后台调度器。关闭时先停止接纳、取消或等待自己的工作，再完成资源释放。
- 保留现有 carrier/Context.filter，禁止因改用 emit 失去 Session/Run 隔离。WSS、IPC、durable Journal 和投影订阅端口不机械改为插件事件总线。
- 不把 `session/event` 每次内存接纳都改为 fsync；保持现有接纳/持久化队列/显式 checkpoint 语义。通知与磁盘已 flush 的事实分别描述。

消费者迁移覆盖：runtime session/agent 插件、Headless、English-learning、Host tasks 订阅，以及源码检索出的相同事件所有监听点。计划实施中生成事件清单：事件名、mode、发布者、订阅者、失败策略、资源所有者，不增加运行时注册表。

测试：同步监听抛错后兄弟监听仍收到；异步拒绝有诊断且无 unhandled rejection；挂起观察者不阻塞通知发布/任务结算；卸载后不再收通知；异步工作清理可等待；不同组合/Run 不串事件。将 `english-learning`、Runtime English-learning 中“await emit 后立刻断言完成”改为等待业务完成信号，不能用任意 sleep。

更新 `scripts/check-harness-event-contracts.mjs`、`scripts/test/harness-event-contracts.test.mjs`，移除 required→emit 特例，检查新的直接调用与通知包装；保留 mode 不匹配的负向 fixture。

### T3 删除第二套工具中间件并保持工具安全边界

修改 `packages/tools/runtime/src/{prepared-execution,registry,executor,index}.ts`；删除 `contributions.ts` 的排序函数及文件（当前只被旧 middleware 链使用）。

将 `packages/tools/runtime/src/test/runtime.test.ts` 的 middleware fixture 改为真实 Cordis 的 `tools/pre-execute`、`tools/execute`、`tools/post-execute` 监听；保留 before/body/after 顺序和失败语义测试。删除 `ToolMiddleware`、`ToolMiddlewareContext`、registration.middleware 和无消费者导出，不留旧参数兼容转换。

权限、参数校验、资源边界、审批、lease、结果持久化由工具服务负责；事件不能绕开最终检查，post-execute 不能重写执行事实。验证干预后参数仍经过检查、拒绝时工具 body 不执行、插件移除后不再干预、工具执行/取消后释放 lease。

### T4 生命周期回归与试验定位

保留 `packages/boot/tests/{harness-mount,harness-generations}.spec.ts`、`packages/harness-control/src/test/activation.test.ts` 的新旧组合/失败候选/最后释放断言。保留 `packages/core/scope/src/{scope,disposer}.ts` 的领域职责，不以“都归 Cordis”为由删除 Run 持有语义。

`packages/cordis-adapter/tests/incremental-harness-probe.spec.ts` 作为机制试验保留，顶部和验证文档注明不属于生产共享实例功能。若迁移通知导致其路径变化，只调整依赖与断言表达，不要求产品实现其共享原型。

本批通过后，整组合装配、任务行为保持可用，再进入下一批。

## 5. 第二批：模块与调用路径

### T5 删除 CLI 的三份转发入口

迁移 `apps/cli/src/runtime-v2/{host-adapter,host}.ts` 直接消费 `@actspace/agent-host/node-ports` 的 `NodeArtifactStore`、`NodeLlmAdapter`、`NodePiAiProvider`、`createNodeToolHostServices`。

将 `apps/cli/src/test/runtime-v2-artifact-store.test.ts` 的存储行为测试移至 `packages/agent-host/src/test/node-artifact-store.test.ts`，改用领域名称；CLI 在既有 runtime-v2/host-parity 测试保留接入覆盖。然后删除 `apps/cli/src/runtime-v2/{artifact-store,llm-adapter,tool-host-services}.ts`，不留 alias 文件。

验证 ESM/CJS 双入口：agent-host/node-ports 已有 require export，不能为删除转发而破坏 CLI 打包或 managed loader。

### T6 Host 启动与生命周期拆分

新增 `packages/agent-host/src/{lifecycle,bootstrap}.ts`，从 `apps/cli/src/runtime-v2/host.ts` 迁出：

- lifecycle：ready/draining/blocked 状态、幂等 stop、正常等待、强制截止、管理 status/stop 的协调。
- bootstrap：auth/gateway/uploads/observations/订阅/维护 timer 的装配与有序释放，以及启动失败的清理。

CLI 保留配置/命令/退出码、managed Runtime 加载和 Profile/Host ports 组装，通过 `bootRuntime` 回调交给 Host 装配模块。回调返回 application、任务 drain/wait、后台资源查询、诊断、shutdown 和事件订阅所需的窄接口；类型在 agent-host 定义，不能反向 import runtime。forceExit 与日志输出也由 CLI 注入。

`packages/agent-host/src/index.ts` 导出启动能力；`apps/cli/src/runtime-v2/host-command.ts` 更新调用但保持命令参数/输出。不新增用户配置、daemon 服务或新协议。

资源所有权：bootstrap 拥有网关、订阅、timer 与 admin；Runtime profile 拥有其插件；每项资源创建成功后立即登记唯一清理入口。停止 timer 后等待正在运行的 upload cleanup，不能只 clearInterval 后留下在途任务。失败回收清理所有已建立资源并保留原错误和清理诊断。正常 drain 等任务、子 Run 和后台 shell；blocked 状态仍保留 status/stop。

新增 `packages/agent-host/src/test/{bootstrap,lifecycle-coordinator}.test.ts` 覆盖启动各阶段失败、重复 stop、正常等待、强停截止、upload maintenance 在途关闭；保留既有 manifest lifecycle 测试。执行全部真实 Host 进程测试，特别是 foreign writer-lock、blocked stop 和子 Run drain。

### T7 保留有职责的公共与客户端模块

`packages/agent-service/src/{application,service,run-manager,task-ledger}.ts` 保持应用操作/调度/执行/持久事实的职责划分；`packages/desktop-app/src/service.ts` 保留标题与 completeText；`packages/headless/src/runner.ts` 保留单次运行和信号。除 T1/T2 的接口迁移及确证死引用外，不另做继承体系改写或包拆并。

`activateBehavior`/`source-loader` 等旧准入路径当前仍有 boot 和测试消费者，不能当作三个 CLI 空转发一样直接删除。本计划不扩展为另一轮加载器重写；在文件清单标记保留及消费者。后续若发现必须迁移该路径才能完成本计划，应先提交具体影响，不静默扩大删除范围。

## 6. 第三批：文档、目录与测试收尾

### T8 文档唯一职责与精简

以现有文件收敛，不另写一套相同总论：

| 正式入口 | 维护内容 |
| --- | --- |
| `docs/ARCHITECTURE.md` | 顶层依赖和导航，纠正 P4 仍在实施的状态 |
| `agent-target-overall-architecture.md` | Host/Harness/Run 高层关系、当前路径；删除重复 API 细节，链接专题 |
| `agent-target-runtime-architecture.md` | 启动、Profile 和 Host-facing Runtime 契约；链接高层关系，不复制总图说明 |
| `agent-spec-profile-bundle-patch-layering.md` | 简单 Patch 与整组合装配，明确不共享实例 |
| `agent-spec-cordis-event-abi-and-eventhub-retirement.md` | Cordis 事件模式、通知错误隔离、资源归属；去除与实际不符的 checkpoint/flush 通知表述 |
| `agent-spec-agent-loop-cordis-surface.md` | Loop 插入点及 checkpoint 服务边界；共性 mode 说明链接事件 ABI |
| `agent-spec-tool-runtime-abi.md`、`agent-spec-tool-runtime-boundary.md` | 删除旧 middleware API，保留工具服务与可替换扩展的边界 |
| `agent-testing.md`、`agent-package-ledger.md` | 当前测试归属与模块职责，不保留旧路径作为使用入口 |
| `docs/agent-host/README.md` | 启动、维护和连接；更新源码位置，不改变使用方式 |

以上 agent-* 文件位于 `docs/design-docs/agent-plugin-runtime/`。同步该目录 README、`docs/design-docs/index.md`、`docs/README.md` 的导航。`agent-spec-dsh-event-model.md` 的 Session 事实模型仍有独立价值，保留而不误合并成通知事件文档。

设计决策保留历史顺序，但顶部/最新节明确当前结论覆盖共享实例探索建议。前序 P1–P4 验收记录保留证据，不改写为本轮验收。生成文档只通过对应 generator 更新。

### T9 删除与目录卫生

本计划确定删除：三个 CLI 转发文件、tools/runtime/contributions.ts，以及 T1/T3 已迁完的函数/类型/字段。源文件迁移完成后检查 import、动态 import 字符串、package exports、manifest、cordis.yml、构建脚本和打包清单，不仅搜索静态 import。

不批准批量删除整个 packages、tmp、docs/history 或用户数据目录。残余空目录可清理；更多文件只有记录“原职责→新承担者→零消费者证据→替代测试”后才加入同批删除清单，不靠 legacy 名称判定。

旧 dist 产物不能冒充源码仍可用：仅清理受影响包自己生成的输出，再构建验证；不能运行整个仓库/用户目录的清空操作。`browser-bridge/` 保持 Host capability，不搬入通用插件树。

## 7. 设置与数据保护

保护设置服务维护的 `settings.json`、`secrets.json`、既有设置备份、自定义 prompts、`remote-hosts.json`、`remote-host-credentials.json`，以及用户显式指定的 Host 配置和凭据。通过 settings-service、remote-hosts/registry 与 credentials 的现有读写边界核对；不能以扩展名统一删除 JSON。

本次不移除设置迁移代码。允许放弃旧会话兼容，不等于设置也可重置。工作区源码、文件、生成产物、浏览器登录资料及系统 SSH 配置不属于会话历史。

测试和 CU 使用隔离数据目录与测试配置。若实施中确实需要重置真实历史，先在 process 写明精确路径白名单、影响、停机条件和配置备份/恢复验证；用户已授权必要历史清理，不需反复确认同一权限，但不允许越过设置/工作区保护边界。当前计划不执行这项操作。

## 8. 验证命令与通过标准

先构建依赖，再运行测试，避免 dist 与源码漂移。完整输出摘要记录在 phase-5-process，不把过往 P4 数量当本轮通过数量。

```sh
pnpm --filter @actspace/runtime... build
pnpm --filter @actspace/cordis-adapter --filter @actspace/core-agent --filter @actspace/core-agent-loop --filter @actspace/session-checkpoint-policy --filter @actspace/tools-runtime --filter @actspace/boot --filter @actspace/harness-control --filter @actspace/agent-service --filter @actspace/desktop-app --filter @actspace/headless --filter @actspace/english-learning --filter @actspace/agent-host --filter @actspace/runtime --filter @actspace/agent-cli test
pnpm check:harness-events
pnpm test:harness-events
pnpm test:harness-recovery
pnpm test:agent-host:process
pnpm test:agent-cli:process
pnpm typecheck
pnpm build
pnpm --filter @actspace/desktop test
pnpm check:packages
pnpm test:package-boundaries
pnpm check:package-cutover
pnpm check:v2-legacy-removal
pnpm check:docs
pnpm test:current-docs
pnpm gen:contract-matrix
pnpm test:contract-matrix
pnpm refactor:stats after --plan 20261004-agent-harness-p5
git diff --check
```

每个包 selector 必须命中，禁止把“没有匹配项目”当通过。负向夹具验证 mode 错误、服务缺失、权限拒绝、清理失败、锁冲突；用例断言行为，不固定新内部类名或调用次数来替代结果。

测试迁移规则：保留行为、移动入口；旧架构专属断言可删，但必须记录替代覆盖；重复领域测试移到职责包，客户端保留接入测试。测试失败分类为基线问题、架构断言失效、真实回归、环境限制，逐项处理，禁止删有效断言求绿。

## 9. Computer Use 验收点与分组

**当前执行约定：首次开发按要求在本节前暂停，之后用户已授权继续验收。U1–U9 路线已有两轮记录；后续 gpt-6.1-sol 已完成 B1/B2 定向复验及 B3 校准，计划范围签收。**

开发和修复由主智能体承担；真实 Electron 交互委派 `gpt-6.1-sol` 子智能体。不可用则明确限制，不静默换 Astra。真实 Provider、云部署、手机 Web 不在本轮；本机可控 Provider fixture 不冒充真实服务。

先覆盖以下验收点：

- U1：设置、Provider/模型、偏好、远端连接在应用重启后保持；凭据不出现在截图或日志。
- U2：本地创建会话、普通发送、流式输出、标题和结果；无重复消息或无限运行。
- U3：同会话先 Plan 后 Agent；运行中模式限制保持；队列/补充输入和模型配置时机不变。
- U4：审批允许/拒绝、取消、取消后再次发送；终态与按钮状态一致。
- U5：压缩与子任务进度/结果可见；不因通知异步化丢失终态。
- U6：本地/远端混合会话列表、归属标签、断线禁用发送、重连状态和未确认提交去重。
- U7：远端上传附件、失败重试、结果访问；不误用本地路径。
- U8：退出 Desktop 后远端任务继续；重新打开恢复；双客户端已处理的审批不重复生效。
- U9：Host 正常维护等待任务和审批；强停/blocked 的状态反馈正确。锁归属和截止细节另外由真实进程测试验证。

操作分组：

| 路线 | 连续操作 | 覆盖与证据 |
| --- | --- | --- |
| 设置与本地任务 | 记录非敏感设置→发送→切模式→补充/队列→审批/取消→压缩/子任务→重启 | U1–U5；关键中间态和终态截图、对应任务标识 |
| 远端会话与文件 | 配对本机测试 Host→创建远端会话→附件→断开→恢复→查看结果 | U6–U7；断线按钮状态、重连结果与提交数量 |
| 生命周期与多端 | 远端运行中退出 Desktop→重开→第二客户端审批→维护/停止 | U8–U9；退出前后任务状态、审批刷新、维护状态 |

按验收点逐项通过/失败/未覆盖报告；组数不代表覆盖数。复用状态减少重复操作，必要的中间态当场取证。无样式改动不重复全主题视觉矩阵；如实施意外涉及样式，须增加对应浅深主题覆盖。发现 Bug 交主智能体修复，再由 Sol 定向复验。

## 10. 交付、回退与停止条件

- 每批可独立保持产品可用；任何删除先完成调用方和测试迁移。T1–T4、T5–T7、T8–T9 依次推进。
- 实施授权后无需再次确认普通文件调整；新增产品行为、超出设置保护范围、循环依赖或新增共享实例框架须停止该项并说明，不扩大执行。
- 无数据库迁移、外部发布、新服务端账号或付费 API 要求。依赖为仓库 pnpm/Node、现有 Cordis、Electron 和本机测试 Host；CU 使用现有工具。启动验收环境前检查可用性。
- 回退仅恢复本批自身代码/文档，不覆盖无关 dirty 文件；不通过回退代码撤销外部工具副作用。设置本轮不改格式，回退不依赖数据迁移。
- 完成 history，补充本轮有价值的学习记录；摘要列出改动、测试接替、真实 CU、限制、统计与所有保留项。没有自动 commit、push 或部署。
- 全阶段签收后移动整个执行计划目录到 completed 并修复索引/链接；任何未覆盖门禁明确标注，不提前宣称全部通过。

## 11. 执行勾选

- [x] 基线、统计与测试接替表
- [x] T1 checkpoint 服务
- [x] T2 Cordis 通知与观察者生命周期
- [x] T3 工具扩展统一
- [x] T4 隔离与释放回归
- [x] T5 CLI 转发退役
- [x] T6 Host 装配与生命周期
- [x] T7 客户端职责核对
- [x] T8 文档精简与同步
- [x] T9 删除、产物及自动化总回归
- [x] T9 Computer Use U1–U9 路线覆盖：见 [第二轮报告](../../../exec-runs/20261003-agent-harness-host-refactor/execution-summary.md)及其证据边界
- [x] B1/B2 修复后定向 CU 复验与最终签收；见 [修复记录](../../../exec-runs/20261003-agent-harness-host-refactor/phase-5-feedback-fixes.md)
- [x] 全阶段签收后归档计划、同步索引与链接
