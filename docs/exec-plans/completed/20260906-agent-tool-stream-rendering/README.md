# Agent 工具流式渲染修复计划

> 状态：已完成实现与自动化验证；2026-09-06。真实 Electron/Provider 仍待人工验收。
> 下一步：按执行摘要完成真实 Electron 和 DeepSeek 人工验收。

## 目标

在模型尚未最终回复时，工具已经以正确的 Read/Bash/Write 等组件展示参数与状态；单个工具结束立即更新，最终 Journal 重建不会突然改变工具类型、补出此前消失的工具或重复内容。

## 必读与范围

- 根目录 AGENTS.md、docs/REPO_COLLAB_GUIDE.md、docs/ARCHITECTURE.md、docs/design-docs/core-beliefs.md。
- [修复设计](../../../design-docs/frontend/front-agent-tool-stream-rendering.md)：事件所有权、类型、状态和预览契约，以这份提案为本计划实施依据。
- docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md、docs/design-docs/agent-plugin-runtime/agent-testing.md。
- docs/CODING_BEHAVIOR.md、docs/FRONTEND_VERIFICATION.md、docs/HISTORY_GUIDE.md、docs/QUALITY_SCORE.md。
- 若涉及颜色样式，先读 docs/design-docs/frontend/front-主题与配色规范.md；默认复用组件，不改变视觉设计。

包含 Core tool delta 分类、Tools 执行开始回调、Desktop 实时转换、实时/回放预览共用、前端终态合并、测试与文档同步。真实工具参数错误、权限拒绝和超时保持原有执行语义并正确显示。

不改 Provider、权限、数据目录或 Journal 格式版本；不新增服务、IPC channel、依赖库和设置开关；不恢复分析观测。没有数据迁移。已有大量未提交改动，必须以执行前工作区为基线，禁止用 HEAD 整文件回退或广泛暂存。

## 实施任务

以下任务顺序依赖，作为一个完整修复交付；T1/T2 等中间状态不单独发布。

### T1：固定失败基线

- 新增 `packages/core/agent-loop/src/test/tool-stream.test.ts`：使用真实 AgentLoop、临时 Session、可控 LLM stream 与无外部副作用的工具执行器，覆盖 text + 分片 tool args + done + 工具结果 + 下一步文本。
- 断言工具参数不出现在 assistant-delta；工具拥有独立身份；done-only 工具也产生预览事实；测试必须在未修复代码上失败。
- 新增 `apps/desktop/src/main/test/runtime-v2-tool-stream.test.ts`，让同一 fixture 经真实转换链路输出 fixed renderer DTO；不手工伪造 started/finished 作为唯一证据。
- 执行开始创建 `docs/exec-runs/20260906-agent-tool-stream-rendering/execution-process.md` 与 `execution-summary.md`，记录修改前基线、失败断言和命令输出摘要。

### T2：补齐 Core / Tools 事实

修改：

- `packages/core/agent-loop/src/loop.ts`：AgentLoopLiveEvent 联合类型、collectStream 分类、assistant/chunk 身份、runTools prepared/finished、真实 requestId 贯穿。
- `packages/tools/runtime/src/prepared-execution.ts`：ToolPreparedEnvironment 可选 onExecutionStarted；在 checkpoint 成功后、body 前调用；隔离观察者异常。
- `apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts`：复用公开 AgentLoopLiveEvent 类型，去除手写 kind 副本。
- `packages/runtime/src/runtime/boot.ts`、`packages/runtime/src/runtime/agent-host-port.ts`：核对现有类型转发；仅在签名确需同步时修改。

校验：T1 转绿；无工具可见性、参数校验、审批、checkpoint 或提交顺序变化。工具拒绝/校验失败没有 started，但有 finished；正常工具每次只有一个 started 和一个 finished。

### T3：统一 Desktop 预览和发送

新增：

- `apps/desktop/src/main/runtime-v2/fixed-renderer-tool-preview.ts`：从历史投影提取公共 preview builder，加入非终态和有界 partial args 提取。
- `apps/desktop/src/main/runtime-v2/fixed-renderer-stream-adapter.ts`：内部缓存、50ms 参数合并、身份关联、prepared/started/progress/finished 转换和释放。
- `apps/desktop/src/main/test/runtime-v2-tool-preview.test.ts`：各现有 previewKind 实时/历史对照、partial JSON 和失败状态。

修改：

- `apps/desktop/src/main/runtime-v2/fixed-renderer-projection.ts`：使用公共 builder，修复本函数将 denied/aborted 压成成功或普通失败、running 使用终态默认文案的错误。
- `apps/desktop/src/main/runtime-v2/runtime-registry.ts`：拥有 adapter，增加内部 subscribeRendererStream；启动/关闭订阅成对，工具参数原文不进入通用 renderer live envelope。
- `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`：用专用内部订阅发布既有 agentStream；替换旧转换，避免文本/progress 双发。
- `packages/shared/src/session.ts`：tool_finished 增加可选标准终态字段以区分 completed/failed/denied/aborted，保留 isError 兼容；必要的参数生成取消收尾使用已有 run 终态事件，不新增第二结果通道。
- `apps/desktop/src/main/index.ts`：审批仍由既有回调生产；只在关联/排序验证证明必需时调整事件发布，不改变策略。

校验：短工具不调用 reportProgress 仍有条目和终态；多 call 交错参数正确归属；done-only 工具有初始预览；迟到 progress 不重新置 running；缓存超过 64 KiB 只截断展示不截断执行参数；终态 flush/cancel 后无残留 timer。

### T4：对齐 renderer 状态

修改：

- `apps/desktop/src/renderer/App.tsx`：tool_finished 也能 upsert；以 callId 保持工具位置；保存明确终态；审批/progress 不回退终态；沿用当前 getSession/finishCurrentVisibleTurn 的可见性保护。
- `apps/desktop/src/renderer/test/app-streaming-user-message.test.tsx`：使用 Main adapter 产出的事件 fixture 驱动 App，并保留原有组件级测试。
- `apps/desktop/src/main/test/runtime-v2-fixed-renderer-projection.test.ts`：同一工具结果实时 builder 与历史 projection 语义一致。

校验：单个工具结束立即停止 shimmer，不等待其他工具或最终模型回复；合法正文 JSON 不丢；多个 read/write/bash 按首次出现顺序保留；runAgent 结束重新 getSession 后无重复工具、无参数正文、无遗留 running。

### T5：工程、UI 与文档收口

- 同步 `docs/design-docs/tool-system/agent-tool-preview-design-guidelines.md`：用新 Main 模块替代旧 engine 文件路径，注明生命周期单一生产者、typed preview 与真实终态。
- 同步 `docs/design-docs/agent-runtime/agent-turn-layers.md` 的流式/Journal 分层说明，将修复设计状态改为已实施并记录实际验收边界。
- 更新执行过程、执行摘要和本任务 history；评估学习沉淀并按 docs/learnings/WRITING_GUIDE.md 处理。
- 实施完成后按 docs/PLANS_GUIDE.md 移动本计划到 completed，修复设计反向链接并更新计划索引；不能把未做的 Electron/Provider 验收写成通过。

## 回归矩阵

| 场景 | 必须观察的结果 |
| --- | --- |
| 普通 text/reasoning 与正文中的 JSON | 正文原样显示，思考仍走独立通道 |
| 分片参数、转义、Unicode、只在 done 返回 call | 有对应工具行，参数不进入正文 |
| 多工具交错、同名不同 callId | 参数不串流、顺序稳定、逐个结束 |
| Read/List 无 progress | running 与 completed 都可见 |
| Bash 审批允许/拒绝/超时 | 同一条卡片；允许后才执行，拒绝/超时最终原因准确 |
| 工具参数无效、文件不存在、越界 | 有失败条目，结果到达停止运行状态 |
| Write/Edit 参数与结果 | Write 保留有界代码预览，Edit 不伪造 diff；结束与历史展示一致 |
| 终态先到、重复事件、终态后 progress | upsert 一条工具，终态不会回退 |
| 中止、run 失败、会话切换 | 清理未执行预览；已完成结果仍在；不污染另一会话 |
| 正常结束与再次打开 Session | 工具数、种类、摘要、结果、正文一致 |
| 预览提取/订阅者抛错 | 不影响工具执行结果，不导致重复调用 |
| 当前 canonical 工具名与未知插件工具 | 内置工具映射到已有 previewKind；未知工具有明确 generic 状态 |

## 验证命令

从仓库根目录执行；先红后绿的同一回归必须保留输出证据，禁止靠回退整个脏工作区完成红绿测试。

```sh
pnpm --filter @actspace/runtime... build
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/tools-runtime test
pnpm --filter @actspace/shared test
pnpm --filter @actspace/desktop test
pnpm typecheck
pnpm build
pnpm check:docs
git diff --check
```

规划轮只运行文档检查；实施轮的具体通过命令与人工限制记录在执行摘要。

## UI 验收与外部依赖

1. 浏览器显式测试 fixture：每类工具在参数生成、执行、结果三个停顿点查看实际组件；浅/深主题均检查工具条目、审批和 Write 预览；mock 不证明真实 IPC。
2. `pnpm dev:log` 启动当前 checkout，按日志中的 appName/appId 观察真实 Electron；优先在临时 workspace 和隔离测试 Session 中运行受控 fixture，验证 preload/IPC 和 Main adapter。
3. 真实 DeepSeek V4 Flash：在用户授权的临时 workspace 执行 Read/List、安全 Bash、临时文件 Write/Edit；录下运行中和最终回复后的画面。测试失败/拒绝用隔离 fixture，不能通过放宽用户权限制造成功。
4. 如 Computer Use 再次无法识别开发应用，保留准确日志和人工步骤，交给用户检查；不把浏览器验证当作 Electron 通过。

自动测试使用本地假 Provider 和临时文件，无新增 API Key、账号、依赖库或联网要求。真实模型验收使用已有配置且会消耗额度；开始真实调用前应明确取得该次验证授权，不读取或复制凭据。签名、打包发布、提交、推送不在本计划范围。

## 风险与回滚

主要风险是生命周期跨层排序和重复发送；优先保证单一生产者、callId upsert、终态优先，测试覆盖回调抛错与乱序。Main adapter 是观察者，不反向控制 Agent Loop 或 ToolRuntime。

Core/Host/Renderer 必须一起构建部署。回滚本修复精确路径与补丁并重建依赖，不回滚其他未提交任务。没有持久化格式升级，不需要回写或删除用户 Journal；新记录里的独立工具 chunk 类型应可被旧兼容读取忽略，历史正文依旧读取 assistant/message。

## 执行模式与进度

交互模式。用户已批准实施，T1–T5 的代码与文档交付结束；人工验收边界见执行摘要。

- [x] 根因、实际 Journal 证据与受控复现已确认。
- [x] 修复设计、文件边界、事件所有权、验证与回滚计划已写明。
- [x] 用户批准实施。
- [x] T1 失败回归已运行。
- [x] T2–T4 同一个完整修复已实现。
- [x] T5 工程验证、UI 验收和文档交付已记录。

## 实施记录

- 附加必要适配：Tools scheduler 去除整批 body 等待后才提交的屏障；CLI Host 过滤内部工具事件；Shared selectors 和 ToolLogLine 表达真实失败状态。均不改变工具策略与 Journal 提交顺序。
- 实际开始事件在 executor 调用前发出；对于后发先完成的并行工具，依旧等待前序 Journal 提交，这是保留确定性历史顺序的边界。
- [执行摘要](../../../exec-runs/20260906-agent-tool-stream-rendering/execution-summary.md)；[执行过程](../../../exec-runs/20260906-agent-tool-stream-rendering/execution-process.md)。
