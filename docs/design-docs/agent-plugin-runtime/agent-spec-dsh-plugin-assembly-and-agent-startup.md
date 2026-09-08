# DSH 风格插件组装与 Agent 启动

> 状态：插件组装和 Agent followup 主链已实施，2026-09-08 按 Profile-first 源码校准。真实 Provider、Electron/Chrome 与发行制品验收继续由执行摘要记录。本文描述当前装配，不保留旧 Boot API 作为可调用示例。

## 1. 三个不同时间点

- **组合**：Profile/Bundle/Patch 生成不可变 Composition 和 Loader transport；尚未创建 live Agent。
- **启动**：Host 注入 ports，Cordis Include/Loader 调用 Behavior `apply(ctx, config)`，建立 Session、LLM、Tool、AgentLoop 与应用 Service。
- **任务**：应用 Service 创建或恢复 Session，AgentLoopService attach Agent，再通过 followup/Inbox 进入执行循环。

当前生产启动返回 `BootedRuntimeProfile`；基础 `BootedProfile` 与它的区别见 [Runtime 与 Composition](agent-target-runtime-architecture.md)。Host 通过本进程 Context 消费应用 Service，Context 不跨 IPC。

## 2. 配置、Manifest 与 Behavior

生产 Host 显式选择 `packages/runtime/cordis.yml`，并提供已解析的 Composition。它是受控文件 transport；id/name/inject 与组合事实的一致性由 Boot 校验，不另外维护可独立激活的业务树。

Static Manifest 描述 identity、codecs、behavior、provides/injects 和 capability。Runtime 在行为激活前发现 codec；Include/Loader 负责加载 Behavior，不能为了读取历史事件先启动旧行为。

Behavior 使用真实 Cordis Context，通过 inject 声明 Service 依赖，以 `apply(ctx, config)` 安装领域能力。module evaluation 不启动资源；listener、timer、进程和注册贡献由 Effect/Fiber 生命周期回收。固定 Bootstrap 不手工拼出另一套 Agent 内核。

源码入口：`packages/runtime/cordis.yml`、`packages/boot/src/dsh-boot.ts`、`packages/runtime/src/runtime/boot.ts`。

## 3. Service 图与 Agent 组装

| Service | 作用 |
|---|---|
| `session.runtime` | 创建/恢复 Session 并提供快照，连接 Journal 与持久化 Provider |
| `actspace.agent.factory` | 根据 Session、Scope、Prompt、LLM、Tools 组装主 Agent/子 Agent Loop |
| `agent.loop` | AgentLoopService；管理 attach、followup、driver、取消与回收 |
| `agent.runtime` | 连接 RunController、AgentLoopService 与一次性 Subagent |
| `headless.runner` | headless 应用入口，执行一次任务、等待 idle/flush 并返回结果 |
| `desktop.app` | Desktop 会话应用入口，连接会话、run、Inbox、设置相关调用 |

`AgentLoopService.attach(session)` 为 main Session 建立 `main:<sessionId>` 身份，复用已 attach 的 ManagedAgent。实例 Scope 与 subject 来自 factory；descriptor/preset identity 不代替 live Agent identity。具体 Scope 语义见 [Agent Scope](agent-spec-agent-scope-model.md)。

ManagedAgent 提供 followup、abort、waitForIdle 和 dispose。内部 assembly 持有 Session、Inbox、Loop 与 disposer，不将其作为 renderer DTO。

## 4. followup 与 Inbox

```mermaid
sequenceDiagram
  participant App as Headless / Desktop App
  participant Service as AgentLoopService
  participant Inbox
  participant Loop as AgentLoop
  participant Journal
  App->>Service: attach Session / followup
  Service->>Inbox: enqueue(content, target, messageId)
  Inbox->>Journal: append inbox fact
  Service->>Service: emit agent/inbox/inserted
  Service->>Inbox: claim matching message
  Service->>Loop: runTurn(claimed input)
  Loop->>Journal: request / assistant / tool facts
  Loop-->>App: RunTurnResult
```

followup 按 Agent 串行排队，默认 target 为 next-turn；enqueue 完成后才通知和 claim，不能直接从 Host 跳过 Inbox 调用生产 Loop。通知是提交后的观察信号，不是持久化事实来源。逻辑 append 与磁盘 flush/checkpoint 的区别由 Session persistence 契约负责，不能把每次通知都写成一次 fsync。

Desktop 的 `DesktopAppService.runTurn()` 通过 RunController 接入 AgentLoopService；pending 输入管理通过 main Agent Inbox 完成。CLI 的 HeadlessRunner attach ManagedAgent 后调用 `agent.followup()`。

## 5. 事件与生命周期

Session durable facts、Loop intervention 和 notification 分为三面。事件词汇以 [DSH 事件模型](agent-spec-dsh-event-model.md)为准，插入点与通知以 [Loop Cordis surface](agent-spec-agent-loop-cordis-surface.md)为准。

Waterfall 使用真实 Cordis `next()` continuation；serial bail 与 parallel/contained emit 不能互相替换。通知观察者的失败不能撤销已经提交的 Journal 事实，也不能成为恢复依据。Scope 与 subject 决定事件可见性，不以共享 descriptor id 串联不同 Agent。

## 6. CLI 与关闭

CLI 解析 `run` 参数、准备工作目录和 Host 能力，启动 headless Profile，从 Context 取得 runner。runner 创建 ephemeral/persistent Session 或 resume 指定 Session，attach Agent，执行 followup，等待 idle 和 flush，再形成业务结果。CLI 在 finally 中等待 Profile shutdown，负责 stdout/stderr、artifact 与退出码。

生产 Boot 要求显式 configPath 与 Composition；缺失或激活失败不能回退到另一套旧 activation 外壳。shutdown 停止接纳、取消/drain、flush 与资源回收的细节见 [Runtime 与 Composition](agent-target-runtime-architecture.md)。

## 7. 验证与剩余范围

应验证配置/Service 缺失、transport 不一致、apply 失败与清理，followup 的 enqueue/claim 顺序、Agent Scope 隔离、通知失败隔离、abort、LLM error、tool denial 和持久化 resume。

- 原任务与被后续组装承接的范围：[插件组装计划](../../exec-plans/completed/20260829-actspace-dsh-plugin-assembly-and-agent-startup/README.md)。
- 当前生命周期：[Profile-first 执行记录](../../exec-runs/20260830-actspace-profile-first-runtime-simplification/execution-summary.md)。
- 尚未闭环的确定性重试/错误 fixture：[最终验收计划](../../exec-plans/active/20260829-actspace-cordis-event-abi-final-acceptance/README.md)。
- 全域 Service/Composition 收口：[P1/P2](../../exec-plans/active/20260829-actspace-p1-p2-contract-and-composition/README.md)。

文档校准不会将上述未执行或阻塞门禁改为通过；历史设计取舍仍可查同目录的 decision 文档和 Git 历史。
