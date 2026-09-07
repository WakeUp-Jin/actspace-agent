# P13：Desktop Host Adapter 与固定 Renderer 接入

> 2026-09-06 范围更新：分析观测功能与专用 Analysis / Trace 接口已退役。下文保留该页面或验收其入口的原计划条目已失效；Journal、聊天、Trajectory、Context 与 Usage 仍保留。

状态：执行中（v2-only Host、固定 renderer 与本地自动化已完成；packaged Electron 和真实环境人工验收未完成）

父计划：[ActSpace v2 插件化 Agent Runtime 完整交付计划](./README.md)

依赖：P07、P12

消费方：P15

Exec-run slug：`actspace-v2-plan-13-desktop-host-and-fixed-renderer`

## 1. 目标

让 Electron main 通过 CJS loader boot 一个 v2 `RuntimeHandle`，并把 workspace、credential、approval、Browser、artifact、settings 和 lifecycle 适配成 Host ports。Preload / IPC / renderer 全部消费 P07 namespaced projection；前端保持固定，不执行插件携带的前端代码，并为所有 tool 提供 generic fallback。

P13 的源码入口固定使用 v2 Runtime；P15 只负责发布前的制品和人工验收门禁。

## 2. 必读与基线

- `docs/FRONTEND.md`
- `docs/FRONTEND_VERIFICATION.md`
- `docs/design-docs/frontend/front-主题与配色规范.md`
- [Runtime Projection](../../../design-docs/agent-plugin-runtime/agent-spec-runtime-projection.md)
- [Runtime 与 Composition 目标设计](../../../design-docs/agent-plugin-runtime/agent-target-runtime-architecture.md)
- `apps/desktop/src/main/runtime-v2/`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/preload/`
- `apps/desktop/src/renderer/`

## 3. Host ports 与路径

新增或重写在 `apps/desktop/src/main/runtime-v2/`：

- `runtime-loader.ts`：只调用 `@actspace/agent-runtime/loader`；
- `desktop-host-adapter.ts`：组合各 ports；
- `credential-resolver.ts`：从 SettingsService 逐请求解析 `credentialRef`；
- `approval-broker.ts`：映射现有 ApprovalRegistry；
- `workspace-port.ts`：workspace/worktree facts 和 instructions；
- `browser-capability.ts`：包装现有 BrowserBridgeService；
- `artifact-store.ts`：保存/读取版本化 artifact reference；
- `runtime-registry.ts`：每进程唯一 handle、restart 与 shutdown；
- `projection-ipc.ts`：snapshot/cursor、diagnostics 和 Session commands。

Shared IPC 只增加 `runtime-v2:*` namespaced channel，施工期不改写 v1 channel。Renderer state 新增 `runtimeV2` slice，从 v2 snapshot hydration，不混合 v1/v2 events。

## 4. 必须迁移的 Desktop 消费方

- session create/list/read/fork/pin/title/archive 与 Conversation；
- `runtime-v2/projection-ipc.ts` 与 Runtime v2 的 Session projection；
- `agent-trace-service.ts`、Analysis / Usage 投影与 retention；
- `context-compact.ts`、`context-describe-service.ts`；
- `session-artifact-service.ts`、image attachment / generated artifact；
- model/settings/provider connection/balance 与 credential refs；
- approval flow、abort、running feedback、Inbox steering/follow-up；
- Todo、Agent/Explore child transcript、Skills 与 Compaction；
- Browser Bridge readiness / shutdown；
- Conversation、Analysis、Usage、Session hover preview 和全部 Tool blocks。

Trace/Analysis 若保留额外诊断 sidecar，只能是可删除 observability cache；消息、Turn、Tool、request 和恢复必须从 Journal projection 重建。

## 5. 任务

### 13.1 Main boot 与 lifecycle

- 在 app ready 后 workspace/settings 基础服务就绪，再 boot 一个 handle；Boot 失败显示稳定错误页并提供 config dump / diagnostics，不进入半激活工作台。
- packaged 生产入口直接使用 v2；未通过发布门禁时只允许作为未发布工作树验证，不回退到 v1。
- app quit 总是 await `stopAcceptingWork -> dispose`；没有 Kairos 的分支也不能跳过 Runtime dispose。

### 13.2 IPC 与无丢失 stream

- renderer 启动/reload 先请求 snapshot，再从 cursor 订阅；gap / runtimeInstanceId 变化触发全量 resync。
- 所有 command 携带 sessionId / agentRunId；main 校验 sender、workspace 和 active handle。
- preload 只暴露 typed command/subscription，不暴露 filesystem、Cordis Context 或 credential。

### 13.3 固定 renderer

- 建立 generic Tool block，完整支持 running/completed/failed/denied/aborted、args summary、model output、detail、artifact 和 failure。
- 现有专用 tool renderer 进入构建时 allowlist；invalid hint / props / component error 回退 generic。
- 不渲染插件 HTML/JS/CSS，不下载前端 bundle；optional frontend declaration 记 warning，required entry 已在 Boot 阻止。
- v2 下 Conversation、Inbox、Todo、child Agent、Usage、Analysis、Compaction 与 Session browse-only 状态均来自新 DTO。

### 13.4 Host capability 与 secret

- Host ceiling 明确 Desktop 可提供的 browser、workspace read/write、network、approval、artifact 和 renderer keys。
- credential resolver 的 key 不进入 IPC、Journal、trace、renderer error 或 log；用 canary secret 扫描。
- Browser capability shutdown 等待 Go/socket client；缺 Chrome/Extension 的错误进入 diagnostics。

### 13.5 Desktop 测试与制品包装

- main unit tests 使用 fake RuntimeHandle；Runtime integration tests 使用真实 v2 package export。
- renderer tests 覆盖 snapshot hydration、cursor gap、generic fallback、tool states、browse-only、Inbox 和 child transcript。
- 建立 packaged build，只用于 P15 发布前人工验收，不在门禁通过前发布给用户。

## 6. 允许修改

- `apps/desktop/src/main/runtime-v2/**`
- 对应 `apps/desktop/src/main/index.ts`、服务与 tests 的 v2-only 入口
- `apps/desktop/src/preload/**`
- `apps/desktop/src/renderer/**`
- `packages/shared/src/runtime-v2/**` 和 namespaced IPC export
- Desktop build/package scripts、tests、docs/history/exec-run

P13 不加载插件前端代码；旧 v1 main/renderer、Kairos、fs-watch 和 SEA 已由 P15 清理。

## 7. 失败与回滚

- Boot / renderer 失败时显示结构化诊断并退出当前 Runtime，不自动 fallback 到旧 Agent engine。
- UI 特化失败只回退 generic renderer，不修改 Journal。
- 回滚恢复上一个可发布制品；源码不保留第二套 Agent engine 或候选 wiring。

## 8. 验证

```bash
pnpm --filter @actspace/shared build
pnpm --filter @actspace/agent-runtime build
pnpm --filter @actspace/desktop test
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop build
pnpm check:frontend-theme
pnpm check:docs
pnpm check:secrets
git diff --check
```

人工验收使用隔离 `userData` 和 packaged build，覆盖浅/深主题、创建/resume、写工具审批、Browser、Inbox、Todo、Agent/Explore、Compaction、renderer reload、active approval/tool 时退出和重启 repair。

## 9. 完成标准

- v2 renderer 不读取 v1 Session 或 live state 作为恢复真相。
- Desktop 只通过 RuntimeHandle 和 Host ports 驱动 Agent。
- packaged build 必须完成全范围人工验收；当前源码入口已 v2-only，门禁通过前不宣告可发布。

## 10. 当前进度

- [x] v2-only 入口、每进程 Runtime registry 与 awaited shutdown。
- [x] namespaced typed preload / IPC、bounded live-event replay 与 snapshot/cursor 初始握手。
- [x] 固定 Runtime v2 workbench、generic Tool block、allowlisted image renderer 与 runtime diagnostics 投影。
- [x] provider/settings、approval、attachment/artifact、Inbox、Todo、child Agent、Compaction、Usage/Analysis 与 Session metadata 固定投影。
- [x] LLM/search/image credential 的 Main-only 写入/清除、额外 credential、价格倍率、模型元数据/credential 绑定、连接/余额/用量、system prompt 与 Renderer secret redaction；非法 secret provider 在 IPC 边界拒绝。
- [x] OpenRouter 远端模型目录通过 Main scoped proxy 请求、运行时 schema 校验、原子 last-good 缓存、固定 Renderer 搜索/刷新/添加；坏缓存隔离且网络失败不清空可用目录。
- [x] 三态主题/字体偏好和 Quick Open 真实全局快捷键生命周期；快捷键抢占失败不覆盖旧注册与持久化设置。
- [x] Session-owned attachment / artifact / `inspect_image` 授权链；Host executor/LLM/Browser ports 只消费 `@actspace/agent-runtime` 公共接口。
- [x] Desktop 10 个测试文件、32 个测试、typecheck、production renderer/electron build、root build 与 frontend theme 静态门禁。
- [ ] 完成 packaged Electron、真实 Provider、Browser Bridge、浅深主题和退出恢复人工验收。
