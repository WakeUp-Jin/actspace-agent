# Profile-first Runtime：Headless 与 Desktop 目标架构

> 文档等级：decision-record。Profile-first 方向已实施；下文保留当时迁移步骤与取舍。实际基础 `BootedProfile` 和生产 `BootedRuntimeProfile` 的字段、调用链与剩余门禁见 [Runtime 与 Composition](agent-target-runtime-architecture.md)，不按旧字段示意重新设计 API。


> 状态：已确认，执行中。本文是当前阶段 Headless/Desktop Profile-first 迁移的设计真源。
> 日期：2026-08-30

## 1. 决策摘要

当前阶段只保留两个产品运行面：`headless` 和 `desktop`。每个运行面对应一个 Profile、一个 Cordis root Context 和一个主要 Host 进程。

```text
headless = dsh-base + dsh-headless
desktop  = dsh-base + dsh-desktop-app
```

主启动路径采用 DSH 风格：

```text
Launcher
  -> runProfile(profile, patches)
  -> BootManifest
  -> Cordis Context + Loader
  -> App Bundle
  -> Agent / Session / AgentLoop
```

`RuntimeHandle` 不再作为 ActSpace 的公共或核心运行时层，最终删除其实现、导出和调用点。固定 Bootstrap 只返回当前进程内部的 `BootedProfile`（`context`、`root`、`manifest`、`shutdown`）；不新增同型的 `ProfileHandle`、`AppRuntime` 或 Universal Runtime Facade。

## 2. 范围

### 包含

- `dsh-base`：Session、Journal、LLM、Tools、Prompt、Agent Registry、AgentLoop、Compaction、Subagent、Credentials seam。
- `dsh-headless`：CLI argv、一次性 Agent run、flush、输出和退出码。
- `dsh-desktop-app`：对应 ActSpace 包 `@actspace/desktop-app`，提供 Desktop Session/Agent 应用 Service、IPC-facing application API、Projection 订阅和 Desktop 生命周期 seam；Electron 窗口和 preload 仍由 `apps/desktop` Host 拥有。
- DSH-native `Profile -> Bundle -> Patch -> BootManifest -> Cordis Loader` 启动链。
- Cordis 事件、Journal 持久事实和 Projection/Transport 通知的分层。
- 删除 `RuntimeHandle`、`RuntimeFacade` 及只为它服务的通用 Runtime 编排代码。

### 不包含

- `dsh-web-app` 的实现、迁移或验收；Web 代码可以暂时保留，但不属于当前默认 Profile 和交付门禁。
- Web、Desktop、CLI 跨进程共享同一个 live Agent。
- daemon/agent-host、远程 Agent ownership、跨进程消息路由或跨进程锁的新产品形态。
- 在线 HMR、在线 Profile reconcile、不可信插件沙箱、插件市场和自动更新。
- Agent、Session、LLM、Tool 的领域语义重写。

## 3. 核心边界

### 3.1 Launcher / Host

Launcher 负责 argv、stdin/stdout/stderr、signal、cwd/dataRoot、credential resolver、approval、artifact sink、Electron IPC 和 `appExit` 等宿主事实或能力。

Host 不负责插件列表、AgentLoop、Session writer、Tool Runtime、LLM Service 或 Agent 创建。

### 3.2 Bootstrap

Bootstrap 是固定的启动内核，不是业务 Bundle。它负责：

1. 解析 Profile、Bundle、Patch，生成唯一 `BootManifest`；
2. 创建 Cordis root Context；
3. 安装 Loader、Include、Group、Timer；
4. 注入 Host capability；
5. 加载 `cordis.yml` 并等待 settlement；
6. 验证 required Service 和 Fiber 状态；
7. 返回当前进程内部使用的 `BootedProfile`：`{ context, root, manifest, shutdown }`。

Bootstrap 不得手工 `new` Session、AgentLoop、ToolRuntime、LLM 或 Headless Runner。

### 3.3 Runtime Bundle

业务能力由 Cordis Behavior/Service 创建并由 Context 拥有生命周期。Bundle 负责应用面启动，不只是声明插件列表：

```text
dsh-headless
  -> 读取 task
  -> ctx.agents.create/resume
  -> agent.followup
  -> 等待 idle 与 flush
  -> 输出并 appExit

dsh-desktop-app
  -> 提供 DesktopAppService
  -> 映射 session/create、prompt、abort、resume
  -> 订阅领域 Projection
  -> 提供 desktop shutdown seam

apps/desktop Host
  -> 注册 Electron IPC
  -> 维护 live event buffer / replay cursor
  -> 推送 renderer DTO
  -> 处理 BrowserWindow / Electron quit
```

## 4. 启动与数据流

### 4.1 Headless

```text
dsh --profile headless "run tests"
  -> 解析 profile/bundle/patch
  -> Cordis Loader 激活 dsh-base + dsh-headless
  -> headless runner 创建或恢复 Session
  -> ctx.agents.attach/create
  -> agent.followup(UserMessage)
  -> durable Inbox
  -> AgentLoop turn
  -> Journal append / flush
  -> stdout/stderr
  -> appExit(code)
  -> dispose root
```

### 4.2 Desktop

```text
Electron main
  -> 选择 desktop Profile
  -> Cordis Loader 激活 dsh-base + @actspace/desktop-app
  -> IPC ready
  -> renderer 请求 session.create/resume
  -> ctx.agents.create/resume
  -> renderer 提交 prompt
  -> agent.followup
  -> AgentLoop / Journal
  -> Projection
  -> IPC 推送 renderer
  -> app quit 时 stop accepting / abort-drain / flush / quiesce / dispose
```

一个进程只创建一个 root Context。不同 Profile 进程共享代码、Bundle、Session 格式和协议，但不共享同一个进程内 `ctx.agents`。

## 5. 事件与通知边界

```text
agent.followup
  -> durable inbox/spliced
  -> inbox/inserted
  -> inbox/claimed
  -> AgentLoop turn/step/LLM/tool events
  -> Journal append
  -> session/event
  -> Projection
  -> Desktop IPC 或 Headless output
```

三类事件的职责不同：

| 层 | 作用 | 是否是恢复真相 |
|---|---|---:|
| Cordis Event | 插件内生命周期、扩展点和控制通知 | 否 |
| Journal Event | Session 可恢复、可审计的持久事实 | 是 |
| Projection/Transport | 前端实时观察和输出 | 否 |

`session/event` 只在 Journal append 成功后发送。通知失败不能回滚已提交事实；Projection 也不能取代 Journal。

## 6. 删除与保留

### 删除

- `packages/runtime/src/runtime/runtime-handle.ts`
- `packages/runtime/src/runtime/runtime-facade.ts`
- Runtime 对外的 `RuntimeHandle` export 和仅为 Handle 服务的 DTO/类型；仍被 Desktop IPC/renderer 使用的稳定 DTO 保留。
- `runHeadless()`、通用 `runTurn()` 等仅为 Handle 服务的应用编排。
- Desktop `runtime-registry` 中对 Handle 的状态持有和通用 Runtime 编排；保留并迁移其中的 Desktop application/projection/artifact 行为。
- CLI `host-adapter` 中的 Runtime 组装和 Handle 调用；保留最小 Host capability 注入。
- CLI chat 当前生产命令、`cli-chat` Profile/Host kind 和仅服务它的测试。

### 保留

- 固定 Boot、Cordis root、Loader、Include、BootManifest、required-service validation。
- 最小 Host services/capability seam。
- `packages/headless` 领域包及其测试；将其从 Runtime 手工 runner 接入改成 Profile Bundle 接入。
- `packages/desktop-app`（新增）及其生命周期、Service 和 IPC-facing contract tests。
- Desktop 既有 renderer、Projection DTO、IPC 契约和 Electron 生命周期。
- 历史文档和已完成 execution plan；它们不作为当前实现入口，但保留迁移证据。

## 7. 关键取舍

1. **删除通用句柄，而不是换一个名字继续保留。** 当前只有两个运行面，直接使用 Context Service 和 App Bundle 更清晰。
2. **保留固定 Bootstrap。** DSH 并不是没有宿主边界；进程退出、凭据、文件系统和 IPC 仍然需要由 Host 注入。
3. **Headless 先迁移，Desktop 后迁移。** Headless 是一次性流程，最容易验证完整的启动、Inbox、Journal、输出和退出链。
4. **Web 暂不处理。** 不为了未来 Web 兼容性继续维护一个所有前端共享的 RuntimeHandle 抽象。
5. **未来共享 live Agent 使用独立 daemon Profile。** 不污染当前两个 Profile 的单进程模型。

## 8. 精确选择

1. `@actspace/desktop-app` 是独立 Runtime Bundle package，`apps/desktop` 只是 Electron Host。
2. Headless Loader 直接使用 `@actspace/headless/plugin`，删除 `@actspace/runtime/headless` 转发入口。
3. `runProfile()` 是 Launcher 顶层入口；`bootProfile()` 是内部 Boot helper，返回 `BootedProfile`，不返回 Runtime facade。
4. 生产只保留 `actspace.headless` 和 `actspace.desktop` 两个 Profile；`createDefaultComposition()` 不再是生产启动入口。
5. 当前 CLI 只保留 `run`/headless；CLI chat 从生产代码和默认验收面删除。
6. Desktop 行为拆为 `DesktopAppService`、`DesktopProjectionBridge` 和 Host artifact/capability ports。

## 9. 成功标准

- 默认生产路径只加载 `actspace.headless` 或 `actspace.desktop` Profile。
- CLI 和 Desktop 均不导入 `RuntimeHandle`。
- CLI 不再暴露 `chat` 命令或 `cli-chat` Host kind。
- `@actspace/desktop-app` 提供真实 Manifest、Behavior 和 Service Entry。
- Agent、Session、AgentLoop 由 Cordis Plugin Tree 提供。
- 一次进程只创建一个 Cordis root；一次消息不重建 Runtime。
- Headless 和 Desktop 的事件都经过 Inbox、AgentLoop、Journal、Projection 分层。
- `rg "RuntimeHandle|runtime-handle|runtime-facade" apps packages` 不再命中生产代码；历史文档中的命中必须明确标注为历史或迁移记录。
- `dsh-web-app` 不在本轮验收范围内。

## 10. 前提与失败处理

本文假设不同前端暂时不需要操作同一个 live Agent。如果该前提失效，应新增独立 `agent-host` Profile，而不是恢复 RuntimeHandle 或把跨进程 ownership 塞回两个现有 Profile。

迁移期间按阶段保留旧入口，直到对应 Profile 的新入口通过包级和宿主级验收；Headless 和 Desktop 均切换并通过验收后，才删除 RuntimeHandle 文件、导出和旧调用链。`@actspace/host` 只在确认无生产引用后删除，不为其保留新的通用 Runtime boundary。
