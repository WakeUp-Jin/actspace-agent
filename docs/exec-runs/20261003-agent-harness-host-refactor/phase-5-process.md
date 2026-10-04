# P5 执行过程

## 状态与范围

2026-10-04，HEAD `a4f9c6e`。用户批准 P5 后实施；随后明确要求完成开发与自动化，在第 9 节 Computer Use 前暂停切换 gpt-6.1-sol。本轮没有启动 CU，也没有 commit/push。

无关前端 space 设计、对应 history、space-demo-v1.html、myplan.md 原样保留。用户设置、凭据、prompts、远端连接、真实 Session 与工作区产物未清理。自动化使用隔离临时目录。

## 基线

- 依赖闭包 build、整仓 typecheck/build 通过。
- 选定 14 包/应用测试通过；Desktop 1000 通过、2 跳过；Host 真实进程 7、CLI 真实进程 2 通过。
- 事件模式、Harness recovery、包边界/退役入口、文档门禁基线通过。
- `test:contract-matrix` 基线 2 项失败：generator 固定要求 6 notifications，声明实际为 7。本轮改成具体成员与 metadata 对照，并把 checkpoint 纳入 Service 目录。
- 基线曾把 typecheck 构建与 CLI 测试并发，构建清理 dist 时 CLI 报默认 Harness 文件缺失；构建完成后串行复跑 13/13 通过。后续构建与消费 dist 的测试分开，未计为产品 Bug。
- 独立 before 统计槽 `20261004-agent-harness-p5`，未覆盖前序 P1 数据。

## 第一批：事件与工具

checkpoint-policy 提供 session.checkpoint，Loop 等待其 flush；默认 Harness shared service/manifest、Runtime 注入及 cordis.yml 一起迁移。首次包验证发现 fixture 仍捕获旧事件、另一个 fixture 在 initialize 后才 provide，以及 composition transport 漏加注入；均已修复，Runtime/CLI 复跑通过。

emitNotification 只调用 native emit；containNotification 在注册处接住 throw/rejection。保留 carrier，移除通知 acquire/await；English-learning 的队列继续自己管理工作。Desktop tasks 使用已有日志入口隔离同步观察异常，Host tasks 在 bootstrap 包装；未创建事件总线。

工具 middleware 类型、registration 字段与排序文件删除。安全链用真实 Cordis hooks 验证；post hook 不得将失败变成功，也不能因抛错跳过 finalizer 和提交。保留 generation/Run scope、工具 lease；增量共享 probe 仅作实验。

## 第二批：Host 与客户端

新增 agent-host bootstrap/lifecycle，注入 HostRuntime 窄端口。CLI 保留 Runtime 加载、Profile、模型/工具端口与退出策略。agent-host 不 import Runtime；未用动态 import 绕开循环。

bootstrap 资源取得即登记唯一清理，失败逆序回收；维护 timer 停止后等待在途 pass。正常停止等待 Run、子 Run、后台 shell；force 可升级已有 drain，保留截止并幂等收尾。44 项 Host 包测试通过，含 14 项新增 lifecycle/bootstrap 与 2 项迁入产物测试。

三份 CLI reexport 源码删除；存储测试迁至 node-artifact-store。保留 AgentApplication、AgentService、ManagedRuns、Desktop 标题策略和 Headless 一次执行差异。

类型检查曾发现测试修改只读属性、Host live port 误用 renderer event union；改为 spy 与 Host 实际需要的 sessionId/kind 窄输入，完整 typecheck/build 复跑通过。

## 第三批：文档与产物

总体架构负责 Host/Harness/Run；Runtime 文档负责启动与三种 Profile；组合文档明确简单 Patch 和整树独立装配；Cordis ABI 与 Loop surface 去重，修正 session/event 接纳和 session/flush 通知。工具 ABI、Host 指南、测试策略和导航同步。

声明 `session.checkpoint` 的 service metadata，contract generator 加入 checkpoint manifest；生成目录不手改。事件检查同时识别可选链调用。

删除的生产路径：CLI artifact-store/llm-adapter/tool-host-services 三个空转发；tools/runtime/contributions.ts。代码搜索确认旧 API/旧转发零消费者。仅删除 tools/runtime 自己遗留的 contributions.js/.d.ts/.js.map 后重新构建，旧输出未再出现。CLI 构建为 bundle，未保留相应独立转发输出。不删除整个 tmp、包或用户数据目录。

保留 source-loader/activateBehavior 的实际 Boot/测试消费者，不扩大为另一轮准入层改写。browser-bridge 保持顶层能力。

## 自动化结果

日志临时位置 `/tmp/actspace-p5-validation/`；这里只记录命令、覆盖和结果，不保存敏感原始日志。

| 命令/范围 | 结果 |
| --- | --- |
| `pnpm --filter @actspace/runtime... build` | 通过 |
| `pnpm typecheck`、`pnpm build` | 最终均通过 |
| 14 个指定包/应用 test | 324 通过、1 条真实 Loader 条件用例跳过；分包见测试映射 |
| `pnpm --filter @actspace/desktop test` | 1000 通过、2 跳过 |
| `pnpm test:agent-host:process` | 7/7 通过，本机进程与 Provider fixture |
| `pnpm test:agent-cli:process` | 2/2 通过 |
| `pnpm test:harness-recovery` | SIGKILL 持久化边界恢复，1/1 通过 |
| `pnpm check:harness-events`、`pnpm test:harness-events` | 通过，含错误 mode/可选链负向 fixture |
| `pnpm check:packages`、`pnpm test:package-boundaries` | 通过 |
| `pnpm check:package-cutover`、`pnpm check:v2-legacy-removal` | 通过 |
| `pnpm gen:contract-matrix`、`pnpm test:contract-matrix` | 生成成功，2/2 通过；基线漂移已修复 |
| `pnpm check:docs`、`pnpm test:current-docs` | 通过，6/6；编写中事件清单尚未落盘时短暂断链，落盘后复跑通过 |
| `git diff --check` | 通过 |

最终补充 checkpoint 等待测试和 service metadata 后重跑其相关 6 包、整仓类型/构建与 generator 门禁；没有无依据重复跑无关 UI 测试。代码数量只作观测，不作为删测试/合并职责的目标。

## 后续验收与当前剩余项

首次开发在 CU 前暂停；后续用户授权继续，U1–U9 路线已由两轮 Computer Use 覆盖，见[第二轮报告](phase-5-cu-round2.md)。发现的 B1/B2 已修复并通过 Desktop 1008 项测试（2 跳过），B3 经配置核对撤回；见[修复记录](phase-5-feedback-fixes.md)。

2026-10-04 用户再次授权继续 P5，委派 gpt-6.1-sol 定向复验错误提示与恢复行为。当前剩余为修复后 CU、最终签收与计划归档；不把自动化结果冒充 CU 通过，不提前移动计划。

## 最终定向复验与归档

2026-10-04，gpt-6.1-sol 完成 [R1–R3](phase-5-cu-round3.md)，均通过，无新增产品 Bug。R1 fresh Peer 自然触发本机加密不可用；R2 自然强停状态通过，真实读取请求经故障代理断开后中文提示、重试及恢复通过；R3 不同 Host 配置实机校准通过。自动化与真实 CU 证据分列。

P5 开发和计划范围验收签收，整计划移入 completed，更新链接、索引和统计。保护既有无关改动，未 commit/push。前文暂停与剩余项是各次执行时点记录，本节为最终状态。
