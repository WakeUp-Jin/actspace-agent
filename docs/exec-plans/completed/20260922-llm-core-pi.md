# LLM Core Pi 执行计划

状态：M0–M4 实施与自动化验证已完成；旧 Engine 公开层已清理，真实 Provider、packaged Electron 和既有全仓门禁保留为后续人工/基线边界。

结果：完成全仓 typecheck、构建、CLI process/package smoke、受影响 package 回归、docs/secrets/current-docs/v2 legacy 检查，并记录既有失败与外部验收边界。

## 目标

收敛为 AgentLoop → LlmService → PreparedLlmCall → PiAiAdapter → pi-ai public Provider/Model/stream。ActSpace 保留 Message、Stream、Usage、Failure、Credential、Retry、Session snapshot 和资源生命周期。缩短调用链必须同时修复模型事实与实际发送不一致，不能只移动 engine 代码。

正式设计：[LLM Core Pi](../../design-docs/agent-plugin-runtime/agent-llm-core-pi.md)。设计中的 §12–15 是 Host、retry、backend 和 replay 的本次目标契约。本计划替代外部评审材料的实施入口；不在仓库根目录另建 llm-update-pi 副本。

## 必读与依赖

- 根 AGENTS.md、[协作约定](../../REPO_COLLAB_GUIDE.md)、[架构](../../ARCHITECTURE.md)、[核心理念](../../design-docs/core-beliefs.md)。
- [编码行为](../../CODING_BEHAVIOR.md)、[历史规范](../../HISTORY_GUIDE.md)、[质量记录](../../QUALITY_SCORE.md)。
- [现有 Adapter 边界](../../design-docs/agent-plugin-runtime/agent-target-llm-adapter.md)、[多供应商设计](../../design-docs/model-context/agent-multi-provider-llm.md)。
- [Agent 测试](../../design-docs/agent-plugin-runtime/agent-testing.md)、[执行记录](../../exec-runs/README.md)、[Frontend 验证](../../FRONTEND_VERIFICATION.md)。
- [Session 持久化](../../design-docs/agent-plugin-runtime/agent-session-event-persistence-refactor.md)：保留既有事件和 checkpoint 语义；仅添加 replay 所需可选字段。
- [自定义模型推理计划](../active/20260912-custom-model-reasoning.md)：共享 capability/defaults 语义，开始前核对实际源码，避免覆盖同期改动。

顺序依赖为 M0 → M1 → M2 → M3 → M4。DSH 仅作参考，不是 workspace 或执行环境前置依赖。

## 范围与代码入口

| 范围 | 允许的改动与目的 |
|---|---|
| packages/llm/service/src/adapter.ts、service.ts、prepared-call.ts | prepare contract、detached facts、配置物化、一次性 dispatch |
| packages/llm/service/src/activation-lease.ts、route-registry.ts、stream.ts | retry scope、异步 prepare lease、drain、cancel/return/settle |
| packages/llm/service/src/credential-port.ts、message.ts、legacy-transport-adapter.ts | 连接与秘密分离、版本化 replay envelope、legacy cancel/dispose |
| packages/llm/pi-ai/src/** | public API loader、Provider/model 构造、转换、明确 backend policy、parity |
| apps/desktop/src/main/runtime-v2/legacy-llm-adapter.ts、model-port.ts、credential-resolver.ts | purpose-aware 模型只解析一次，固定连接身份，dispatch 不再重读默认模型 |
| apps/cli/src/runtime-v2/llm-adapter.ts | 同一 prepare contract、固定 provider/连接和模型事实 |
| packages/runtime/src/index.ts | 更新公开 exports，移除 engine 消费前保留兼容导出 |
| packages/core/agent-loop/src/** | await prepare、retry scope 所有权、snapshot/finalize/checkpoint 和 hook 清理 |
| packages/shared/src/**、packages/session/**、packages/prompt/** | 仅为 prepared metadata 和 replay 可选字段所需的类型、codec、消息转换与相邻测试 |
| Desktop/CLI 相邻测试及 runtime 测试 | Host 模型切换、连接撤销、CLI 启动和生命周期回归 |
| 相关 package.json、pnpm-lock.yaml、构建与验收脚本 | 精确版本、public declarations、打包验证，不增加无关依赖 |
| 本设计、本计划、相关架构/设计索引、执行记录、history | 同步真实实施状态；按实际证据更新质量记录 |

不包含新的 Provider 配置页面、模型管理 UI、IPC 产品行为、真实 credential 文件修改、pi-ai 源码修改、私有 exports、monkey patch、全局 dispatcher。不得删除未通过 parity/真实验收的 legacy route。不得把 SDK 类型带入公共声明、Shared DTO 或 Session。

## 契约与已选策略

- prepare 为可等待的本地准备边界，不进行网络探测。capture 与 owner lease acquire 在第一次 await 前完成。
- Adapter prepare 输入包括 request identity、purpose 对应的模型选择、消息/工具、options、signal；同步或异步 prepare 都返回 detached LlmResolvedModelInfo、已物化 config 和绑定同一 generation 的一次性 stream entry。具体导出声明在 M0 编译验证后冻结，不能另造 SDK 类型的公共契约。
- PreparedCall 的 request facts、options、tools/schema 与消息采用 detached 数据，不能只浅冻结数组。dispatch 不接受任意替换后的 resolved config。
- 一个逻辑请求由 LlmRetryScope 保留 generation，覆盖 backoff；每次 attempt 单独准备、单独 requestId。draining 只允许已有 scope 派生 attempt，通用调用不能进入。
- prepare 固定 connectionId/config revision、protocol、endpoint、proxy policy、pricing；dispatch 只解析同一连接的秘密，允许 key 轮换，撤销即失败。
- SDK retries 为零；backend 在生成请求发出前选定，错误后不做隐藏的跨 backend 重发。
- replay 使用 schemaVersion/adapterFamily/providerId/protocol/modelId 的持久兼容身份，不使用运行期 generation ID。保存和恢复遵循设计 §15。
- 模型 catalog 是事实来源，不是请求白名单；未知 context window 保留 null。

## M0：基线、公开 API 与契约冻结

1. 记录 HEAD、dirty inventory 和相关现有测试；核对 Desktop/CLI、Runtime exports、image inspection/utility、Agent Loop prepareCaptured 的所有消费者。
2. 安装锁文件依赖，核验精确 pi-ai 0.82.1 的 package exports、Node engine 和协议 lazy factory。不得用手写 PiAiCoreModule 类型或 fake loader 代替真实公开边界证据。
3. 用真实 pi-ai public API 与本地 HTTP fixture 验证三个协议的最小 stream、SDK retry=0、HTTP status/Retry-After、abort、usage。记录 backend 采用矩阵的通过/失败结果；没有公开支持的能力保持 legacy。
4. 为 service 编译验证 prepare/scope/connection binding 声明，不改公共事件名称。列出 replay 可选字段在 Session codec、prompt conversion 和历史恢复中的具体落点。
5. 建立最小失败用例：模型准备后改默认模型、prepare await 期间 replacement、429 backoff replacement。记录旧实现失败原因。

完成标准：真实版本和 exports 有证据；契约可以在 service 单独编译且不泄漏 SDK 类型；采用矩阵明确每条路线的状态。失败时不推进默认 backend 切换。

## M1：Host prepare、配置冻结与 retry 生命周期

1. service 在 await 前 acquire；准备失败释放。对 messages、tools/schema、options 和 model facts 做 detached capture。
2. Desktop 将主模型、utility、image inspection 选择及 reasoning/model ID/pricing/default max tokens 收入 prepare；CLI 实现同一入口。移除 dispatch 重解析及跨连接 credential 覆盖。
3. 为 ConnectionBinding 与 Host resolver 分离配置和秘密；测试准备后编辑 endpoint/proxy/pricing、同连接换 key、删除连接和并发不同连接。
4. Agent Loop 使用 retry scope，覆盖首次 assembler.finalize、snapshot、checkpoint、dispatch hook 短路和全部 retry append/checkpoint 路径的 try/finally。
5. stream settle、abort、iterator.return 和未消费 stream 取消统一释放；shutdown 取消 I/O/backoff，30 秒 drain 超时不提前销毁资源。
6. 将原计划后置的 capability 校验前移：区分 reasoning 关闭/Auto/显式 effort；不支持的显式配置结构化失败；未指定 maxTokens 才应用默认值。snapshot 与发送使用同一物化结果。

完成标准：一次调用的 snapshot 与实际模型、配置、价格一致；旧 retry scope 使用旧 generation，新 scope 使用新 generation；所有结束路径恰好释放，无秘密持久化。

## M2：PiAiAdapter 直接实现与 replay

1. 将 PiAiWireEngine 的 Provider/model/stream 实现迁入 Adapter 私有模块。按 route/protocol lazy load，测试替身只注入 public module 边界；生产 Runtime/plugin 不再导出 PiAiWireEngine。
2. 使用公开 protocol factory 和可复用 catalog Provider；自定义 route 显式构造。复用 Provider 不捕获请求 key。
3. 保留按 call identity 组装交错工具参数；缺少终端事件产生 malformed-stream。保留 text、reasoning、工具、image/artifact 和错误语义。
4. 实施可选 replay envelope，更新 LLM/Session/prompt 转换；兼容旧无 envelope 记录，并保留普通文本与工具关系。
5. 更新 plugin factory、Host 构造点和 Runtime exports；生产调用不再必经旧 Engine，已通过 route parity 后删除公开间接层。

完成标准：三个协议的 public-boundary golden 通过；同模型重启恢复、跨 provider/model 剥离、未知 schema 和旧 signature-only 记录有回归；公共 .d.ts 不泄漏 SDK 类型。

## M3：Backend policy 与逐路线 parity

1. 将 proxy、OpenRouter 原始账单 cost、DeepSeek 文件上传等选择集中在明确 policy，按设计 §14 记录 backend 和原因。
2. legacy 实现同一 prepare/stream/cancel/dispose contract，写清 pool/uploader 资源所有权。
3. 相同 fixture 比较文本、工具 identity/arguments、stop reason、reasoning/replay、usage/cost provenance、Failure、abort。
4. direct/proxy 并发 canary 检查 key、endpoint 和 dispatcher 不串用。生成请求失败后 wire count 仍为一次；合法附件准备请求另计。
5. 只有对应 route 的公开 API、自动化、真实 Provider 和 packaged gate 都通过才移除该路兼容代码，否则保留并写明未通过项。

完成标准：Agent Loop 无 backend 分支；每条 backend 的触发条件可解释；OpenRouter provider-reported cost 不被估值覆盖，历史费用不随 catalog 变化。

## M4：全量验证、清理与交付

1. 运行下列自动化命令和 public declaration/secret/wire-count 专项检查，记录完整命令与结果。
2. 确认所有生产/测试/exports 消费者均迁移后删除无用旧 Engine 层；重建产物并扫描残留符号。
3. 分别记录真实 DeepSeek、Kimi、OpenRouter 与 packaged Electron/CLI gate。自动化通过不能代替这些结果。
4. 同步现有 Adapter、多供应商、Usage/Context 和存储文档；记录 history，按学习文档规则判断是否需要沉淀。仅有实施证据后才修改质量结论。
5. 实现完成后按 PLANS_GUIDE 移至 completed 并更新索引；外部未验收项保留在摘要，不写成已通过。

## 验证命令

首次从干净依赖开始：

```bash
pnpm install --frozen-lockfile
pnpm --filter @actspace/runtime... build
pnpm --filter @actspace/llm-service test
pnpm --filter @actspace/llm-service typecheck
pnpm --filter @actspace/llm-pi-ai test
pnpm --filter @actspace/llm-pi-ai typecheck
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/core-agent-loop typecheck
pnpm --filter @actspace/agent-cli test
pnpm --filter @actspace/desktop test
pnpm typecheck
pnpm test
pnpm check:packages
pnpm check:secrets
pnpm check:docs
pnpm test:agent-cli:process
pnpm test:agent-cli:package
git diff --check
```

M0–M3 每个阶段运行受影响 package 的 test/typecheck；M4 才做全量和制品验证。不把安装失败或无真实 provider 凭据视为通过。

专项矩阵：

| 测试 | 预期结果 |
|---|---|
| prepare await + replacement | 旧资源保持，新请求用新 generation |
| 429 + backoff + replacement | 旧 retry scope 可重试，最终只 dispose 一次 |
| finalize/append/checkpoint/hook failure | 首次与 retry attempt 都释放，无生成请求 |
| duplicate dispatch / config mutation | 第二次拒绝；外部修改不改变 captured request |
| key rotation / connection removal | 同连接换 key 可用；撤销不隐式 fallback |
| SDK 429/5xx / 部分 delta 后失败 | 每次 dispatch 一次生成，已有输出不隐藏重发 |
| no-consumer abort / iterator.return / shutdown | socket、stream、lease 完整结束，无串用 |
| replay restart / provider switch / unknown schema | 同身份可恢复，不兼容 opaque 被移除，文本工具保留 |
| billing / catalog refresh | raw cost 和 estimated 来源明确，历史价格不重算 |

真实验收覆盖 DeepSeek/Kimi/OpenRouter 直连、OpenRouter HTTP proxy、多轮工具、reasoning 开关/effort/signature、图片与文件上传、usage/cost 和 abort。401/402/403/429/5xx、Retry-After、context overflow、proxy disconnect 先由本地确定性 fixture 验证；真实测试无法稳定制造的状态明确记录未验证，不消耗真实额度强行触发限流。

packaged Electron 验证三个协议模块加载、stream、abort、reload/quit、drain 与资源回收。没有 UI 变更，仍需遵循 Frontend 验证中的真实 Electron 分层，不能用浏览器 mock 替代 Host 验收。

## 风险与回退

- prepare async/lease 回归：保留旧实现到 M1 fixture 全通过；不通过则停止切换，不靠继续重读当前设置绕过冻结。
- public API 缺少错误元数据、代理或可靠计费：保留相应 legacy route，不修改 pi-ai 或全局网络状态。
- replay schema 回归：保留可选字段兼容读取，不重写或删除已有 journal；停止新 replay 写入并回到兼容路径。
- packaged exports/Node 不兼容：保留该 route legacy，不把 Node 测试作为打包成功证据。
- secret 或资源泄漏：阻断后续切换和发布，修复后重跑相关 canary、生命周期与序列化测试。
- 不自动 commit、push 或更改用户真实模型配置；现有 dirty 工作必须保持。

## 进度记录

- [x] 2026-09-22：完成静态评审修订、设计与计划落库和索引登记。
- [x] 2026-09-22：M0 完成 pi-ai 0.82.1 public exports/Node 版本核验、依赖闭包和失败基线。
- [x] 2026-09-22：M1 完成 Host prepare、冻结配置、draining retry lease 和 request-bound adapter call。
- [x] 2026-09-22：M2 完成 PiAiDirectBackend、Host direct construction、replay envelope 和相关回归。
- [x] 2026-09-22：M3 完成 Adapter backend policy、legacy cancel/dispose seam、direct/legacy policy 与 replay parity fixture。
- [x] 2026-09-22：M4 完成旧 Engine 公开层清理、nested detached capture、async prepare/retry lease 回归、全仓 typecheck/build、CLI process/package smoke、文档/密钥/legacy 检查、执行记录和学习文档；既有 package-boundary/部分 Desktop renderer 失败与真实 Provider/packaged Electron 验收边界已记录。

## 决策记录

- 2026-09-22：按评审修订纳入 Desktop/CLI 和 Runtime exports，将配置物化提前至 M1。
- 2026-09-22：重试链持有旧 generation，新增 attempt 不重新选择模型；新逻辑请求使用新 generation。
- 2026-09-22：冻结连接配置，秘密逐 dispatch 解析；同连接可换 key，撤销即失败。
- 2026-09-22：显式保留 OpenRouter billing、proxy、DeepSeek 图片兼容路径；不允许发送后自动 backend fallback。
- 2026-09-22：replay 用持久身份和版本判断兼容，覆盖跨重启与旧记录。

## 执行模式与记录

交互模式，按仓库约定推进里程碑；M0–M4 已在当前授权范围内实施。外部附件的“已确认”文字不扩大文件范围，不自动 commit、push 或修改真实模型配置。

执行过程和摘要位于 [docs/exec-runs/llm-core-pi](../../exec-runs/llm-core-pi/)；未完成的真实 Provider、packaged Electron 和既有基线失败范围见执行摘要。
