# 上下文管理引擎 V2：测试与验收计划

关联计划：[主执行计划](README.md)。

状态：2026-10-11，验收完成。后端自动化轨道通过 Context/Loop/Runtime 定向检查；真实 Electron Computer Use 已由 `gpt-6.1-sol` 子智能体执行。两条轨道互相独立，任何一条通过都不能代替另一条。

## 验收原则

- 后端测试证明契约、状态机、持久化顺序、恢复和跨包生命周期；不能证明真实 Electron 交互或真实 Provider 体验。
- Computer Use 证明真实桌面窗口中的布局、状态、交互、IPC 结果和前端反馈；不能证明所有 Session/Codec 边界。
- 每项结果标记为“通过 / 失败 / 未覆盖”，写明证据路径和验证类型：真实 UI、Journal/运行时、自动化、源码推断。
- 发现 Bug 后由主执行者定位和修复，验收代理不在验收过程中改业务代码；修复后只复验受影响验收点及其回归范围。
- 测试数据使用隔离临时目录和测试 Session；凭据从既有配置解析，不把密钥写入文档、fixture、命令行或截图。

## A. 后端自动化测试轨道

### A1. 契约与类型测试

目标：证明 Context、ContextProjection 和 LlmInput 的边界已经从类型和运行时行为上分开。

需要覆盖：

1. Context identity 由 `sessionId + logicalAgentScopeId` 决定，requestId/turnId/stepId 不改变逻辑实例身份。
2. 同一 Run 的多个 Step 获取同一 Context 实例或同一逻辑 revision；不同 Session、主/子 Agent、fork 互相隔离。
3. `capture` 固定 Context revision、模块 revision、Journal watermark、Surface generation 和配置代际；异步转换期间的新事件不污染已生成的 LlmInput。
4. `LlmInput` 深冻结；对 messages/tools/options 的后续修改失败或不影响已发送输入；传输重试复用同一输入。
5. ContextProjection 只读、带 basis/requestId/revision/watermark；不暴露函数、凭据、Session writer、工具句柄或可写 Context 引用。
6. Context estimate 从实际请求模型能力读取；缺失容量保持未知；Provider usage 不覆盖 Context estimate。

建议文件：`packages/context/engine/src/test/engine.test.ts`、`lifecycle.test.ts`、`projection.test.ts`，以及 `packages/shared/src/test/context-projection.test.ts`。

### A2. 模块状态与事件 reducer 测试

目标：证明模块只更新自己的切片，事件处理可增量、可恢复、可去重。

覆盖矩阵：

| 场景 | 预期 |
| --- | --- |
| 新 user/assistant/tool 事实 | Conversation 更新，其他无关模块 revision 不变 |
| 成功 read_file 命名事实 | Conversation 保留结果，Disclosure 更新路径计数 |
| model/config 变化 | System/Runtime/Tools 按依赖刷新，已冻结 LlmInput 不变 |
| required 模块失败 | 当前 Context revision 不发布，下一请求被阻断 |
| optional 模块失败 | 保留明确 skipped provenance，不伪装新值 |
| duplicate event / callId / seq | 不重复计数、不重复注入、不重复推进 watermark |
| stale async result | 身份或 binding generation 不匹配时丢弃 |
| plugin unload | 撤销新贡献和订阅，历史事件仍可解码 |

建议文件：`packages/context/engine/src/test/state-recovery.test.ts`、`packages/context/disclosure/src/test/disclosure.test.ts`、模块插件 lifecycle 测试，工具结果回归放在现有 `packages/core/agent-loop/src/test/` 与 `packages/tools/*/src/test/`。

### A3. Session durable checkpoint 与恢复测试

目标：证明“Session 先持久化，Context 再发布可用状态”的顺序和故障恢复。

必须覆盖：

1. append 接纳但 flush 失败：Context 不发布新可继续请求的 revision，后续副作用被阻断。
2. acceptedSeq 小于 durableSeq 的各种边界；临时 Session 的 durableSeq 为 null，不能伪称磁盘事实。
3. assistant/tool result 已 durable、Context reducer 中断：重启从 Journal 重放缺失后缀，不重新执行模型或工具。
4. 多个工具结果按 callId/Session 顺序归并；下一次 LLM 调用不插入 tool-call 与 tool-result 中间。
5. compaction core 已提交、disclosure applied 缺失：恢复只补派生状态，不重新生成摘要、不重复推进 cycle。
6. fork 只复制允许继承的状态和 artifact，父子 Context 后续 revision 独立。

建议文件：`packages/session/persistence/src/test/`、`packages/session/journal/src/test/`、`packages/context/compaction/src/test/`、`packages/runtime/src/test/`。

### A4. 插件包、manifest、Codec 与 Harness 测试

目标：证明拆包后真实插件生命周期和历史可读性。

覆盖：

- contracts 不反向依赖 engine 或具体模块。
- 每个插件 manifest 的 behavior/codec/contribution 与 owner 一致。
- 同一个插件重复注册失败；dispose 后不再注入；重载不重复贡献。
- 关闭行为插件后仍能发现和解码 required/历史 Codec。
- 旧 `plugin/actspace.context/...` Journal 在新包布局下可读取；未知 required 事件按现有规则 browse-only。
- 默认 Harness ESM 闭包能发现所有启用包，未启用包不被隐式加载。
- package exports、contract matrix、strict cutover 与 legacy removal 检查反映真实迁移状态。

建议命令：`pnpm --filter @actspace/context-engine... test`、`pnpm --filter @actspace/context-disclosure... test`、`pnpm --filter @actspace/context-compaction... test`、`pnpm --filter @actspace/runtime... test`、`pnpm check:package-cutover -- --strict`、`pnpm check:v2-legacy-removal -- --strict`。

### A5. Loop、Compaction、Disclosure 与 Projection 集成测试

目标：证明现有行为继续成立，同时覆盖 V2 新生命周期。

必须覆盖：

1. 一个 Run 内至少两个 Step：Step 1 产生工具结果，Step 2 的 Context 看到已 durable 结果；Context logical identity 保持。
2. 第二个 Step 只更新 Conversation/Disclosure 时，system/rules/skills/tools revision 保持或按依赖缓存。
3. 下一次模型切换重新生成受影响 system/runtime 内容；第一请求的 LlmInput 与快照不变。
4. 动态补充仍使用 `surface: null`、安全 anchor、完整 tool batch 和正确生命周期；重试不重复消费。
5. 压缩失败/取消/过期候选不覆盖有效 Surface；成功后披露周期只推进一次。
6. 当前 Context Projection 与最近实际 request projection basis 不混淆；旧 Session 仍能展示历史 snapshot。

建议命令：

```sh
pnpm --filter @actspace/context-engine test
pnpm --filter @actspace/prompt test
pnpm --filter @actspace/context-compaction test
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/client test
```

### A6. 后端回归与最终检查

实现阶段逐阶段运行定向测试；P5 执行一次完整检查：

```sh
pnpm check:docs
pnpm check:repo
pnpm check:packages
pnpm check:package-cutover -- --strict
pnpm check:v2-legacy-removal -- --strict
pnpm typecheck
pnpm test
pnpm build
```

额外记录 `pnpm test:agent-cli:process`、Session/Host 临时目录集成、Desktop renderer/main 定向测试。基线失败要单独记录，不通过跳过测试或改无关断言来“修绿”。

## B. Computer Use 前端交互验收

执行模型：默认由 `gpt-6.1-sol` 执行；主执行者提供入口、测试数据和检查依据。若模型不可用，记录阻塞，不静默换模型。

验收只在实现和自动化检查完成后进行，使用隔离 userData、测试 Session 和当前 `docs/FRONTEND_VERIFICATION.md` 指定的 appName/appId。验收代理不修改业务代码、不提交、不推送。

### B1. 验收点清单

1. **首次会话与当前 Context**：新建 Session，发送第一条用户消息；Context 面板能显示当前 Context、来源模块、状态/估算，并能区分尚未发送与已发送请求。
2. **多 Step 工具链**：触发工具调用和结果返回；下一次模型调用前 UI 显示工具结果已进入会话上下文，工具调用/结果顺序完整，没有伪造 user 气泡。
3. **模块局部变化**：重复发送消息，观察 Conversation 变化而 system/rules/skills/tools 的稳定内容不无故重复或闪烁；Context revision/状态刷新可观察或可由 Journal 证据核对。
4. **模型切换**：在允许的安全点切换模型，下一次请求的系统提示词、容量和 Context estimate 与新模型一致，旧请求快照不被改写。
5. **Context Popup / 右侧详情 / Composer**：当前 Context 与 request Context 的 basis、容量、bucket、Provider usage 视觉语义一致；浅色/深色主题、窄窗口和长内容布局正常。
6. **压缩与渐进式披露**：长会话触发手动或自动压缩，看到进行中、完成/失败反馈；摘要、活跃路径、睡眠索引与后续请求一致，压缩中停止/发送状态符合既有交互。
7. **关闭与重开**：关闭会话或应用后重新打开，Context 状态从 Journal 恢复；历史请求 projection 与当前 Context projection 不混淆。
8. **Fork 与隔离**：从会话 fork 子会话，父子各自发送消息或读取文件；Context 内容、路径热度、状态更新不互相污染。
9. **错误与边界**：工具失败、权限拒绝、压缩失败或来源不可用时，UI 显示明确状态；不把失败写成成功 Context，不阻塞无关 Session。
10. **无活跃 Run 的读取**：Session 空闲时打开 Context 面板，能读取持久投影；UI 查询不启动新 Run、不执行工具、不改变 Journal。

### B2. 操作分组

分组按页面和可复用状态组织，不替代上面的验收点覆盖范围。

#### 组 1：首次会话、Context 面板和正常请求

- 进入隔离测试 Session。
- 发送普通消息，观察 Composer、ContextPopup、右侧 Context 面板。
- 打开/关闭面板，切换浅色/深色主题，缩放到窄窗口。
- 覆盖 B1-1、B1-5、B1-10。
- 证据：首次输入前后截图、面板截图、request/context snapshot 与 projection 关联 ID。

#### 组 2：多 Step 工具结果和局部状态变化

- 在同一 Session 请求一次需要工具的任务，等待 tool-call、tool-result 和下一次模型回复。
- 检查会话消息顺序、Context 内容、工具状态和当前请求预览。
- 再发送一条普通消息，观察只变化的模块和 UI 更新。
- 覆盖 B1-2、B1-3、B1-5。
- 证据：关键中间状态截图、Journal 事件 seq/callId、最终 request snapshot；不能只保留终点截图。

#### 组 3：模型切换与请求快照边界

- 在 Session 空闲安全点切换模型。
- 发送下一条消息，检查模型名、contextWindow、system 内容和 estimate。
- 回看上一条请求，确认其模型和输入没有被后续切换改写。
- 覆盖 B1-4、B1-5。
- 证据：切换前后两份 request/header 与 request/context snapshot、UI 截图。

#### 组 4：压缩、活跃/睡眠路径和错误反馈

- 使用隔离工作区制造足够长的工具/文件读取会话。
- 触发手动 `/compact`，再用低阈值或真实长会话覆盖自动压缩。
- 观察 running、completed/failed、摘要展开、活跃路径、睡眠索引和后续 Context。
- 读取睡眠路径，确认一次读取不立即唤醒；下一次成功压缩后按规则恢复或保持睡眠。
- 触发工具失败、权限拒绝或压缩失败路线；继续观察无关消息是否可用。
- 覆盖 B1-6、B1-9。
- 证据：running/finished/failed 中间截图、压缩事件和路径状态 JSON、后续 request snapshot；不能凭终点截图推断周期算法通过。

#### 组 5：关闭、恢复、Fork 与隔离

- 关闭当前 Session 或退出并重启开发应用。
- 重新打开原 Session，检查状态、历史 Context 和最近请求。
- Fork 子 Session，在父子 Session 分别产生消息和文件读取。
- 覆盖 B1-7、B1-8、B1-10。
- 证据：重启前后截图、父子 Session ID/Journal 水位/路径状态、恢复后的 Context projection。

### B3. Computer Use 报告格式

验收报告按 B1-1 至 B1-10 逐项记录：

```text
验收点：B1-2 多 Step 工具链
结果：通过 / 失败 / 未覆盖
真实 UI 操作：……
运行时或 Journal 证据：……
截图/日志：……
复现步骤（失败时）：……
期望与实际（失败时）：……
关联 requestId / turnId / stepId / callId：……
```

报告必须区分：

- Computer Use 直接看到的 UI 和交互结果；
- 源码、自动化或 Journal 支持的事实；
- 尚未真实验证的推断。

发现 Bug 时交回主执行者修复；修复后只重新运行受影响操作组，并记录回归证据。真实 Provider 未配置、Electron 启动失败、权限阻断或模型不可用都要标为未覆盖/阻塞并写明原因。

## C. 验收完成门槛

进入交付收尾前必须满足：

- A1–A5 的新增测试和受影响回归通过；A6 全仓命令结果已记录。
- B1 每项均有通过、失败或未覆盖结论，没有用代表性截图替代未执行路线。
- Computer Use 使用 `gpt-6.1-sol`，报告附关键中间状态证据。
- 失败项有复现步骤、关联 Journal/request 标识和修复/复验状态。
- 未覆盖的真实 Provider、Electron、签名或制品门禁仍保留在 execution-summary，不写成全部通过。
- `docs/exec-runs/20261011-context-management-engine-v2/execution-process.md` 与 `execution-summary.md` 已同步实际命令、证据、问题和限制。

## D. 最终 Computer Use 记录

最终验收由 `gpt-6.1-sol` 子智能体在真实 Electron 窗口完成。B1-5（Context Popup、右侧详情、Composer）通过；B1-10（无活跃 Run 的持久 Context 读取）有限通过。B1-1、B1-2、B1-3、B1-4、B1-6、B1-7、B1-8、B1-9 未覆盖/阻塞：当前开发窗口打开的旧 Session 为 browse-only，点击“新建会话”和 `⌘N` 都没有进入可写 Session，日志同时出现 `SESSION_BROWSE_ONLY`；因此无法安全触发真实模型、工具、压缩、Fork 或错误路径。该结果是实际 UI 阻塞，不把源码或自动化结果写成 UI 通过。
