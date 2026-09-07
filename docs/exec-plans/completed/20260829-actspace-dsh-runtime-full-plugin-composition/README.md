# ActSpace DSH 风格 Runtime 全量插件组装计划

状态：已归档；Phase 1–6 自动化实施完成，真实 Desktop/Electron/Chrome 宿主人工验收仍待执行。

本计划执行 [DSH 风格 Runtime 插件组装规范](../../../design-docs/agent-plugin-runtime/agent-spec-dsh-runtime-as-plugin-composition.md)。目标是把当前“Host/Runtime 手工创建领域实例，再由 Cordis 局部接管”的桥接态，迁移为“`cordis.yml`/Bundle/Patch 声明完整 Runtime，Cordis Loader 通过 `apply(ctx, config)` 创建和回收领域服务”。

本计划消费既有 Session 事件、Agent Loop 插入面和 Tool Runtime 外壳的结果，但不修改既有 `20260829-actspace-dsh-core-rebuild` 计划中的 P00/P04 文件或状态。Session 13 种事件、9 个 AgentLoop 插入点和 5 个通知是本计划的输入契约，不在本计划中重新定义。

## 1. 目标

完成后，ActSpace 的三个 Host 共享同一套 DSH-style Boot ABI：

```text
Host capability + configPath
    → 固定 Bootstrap 创建 Cordis root
    → Include cordis.yml / Bundle patch
    → Loader settlement
    → Session / LLM / Tools / Prompt / Agent / Loop / Headless plugins
    → RuntimeHandle facade
```

CLI run 的默认链路为：

```text
boot
  → headless runner
  → agent.followup()
  → durable inbox
  → claim / turn / step
  → flush
  → session/end-seed
  → output
  → dispose
```

## 2. 范围

### 包含

- Host/Bootstrap/RuntimeHandle 的最终边界和 Context service contract；
- CLI 与 Desktop 的同一 Boot ABI；
- `cordis.yml`、Bundle/Patch 作为默认 Runtime 组合真源；
- Session、LLM、Prompt/Context、Tool Runtime、Core Tools、Browser Tools、Agent、AgentLoop、Compaction、Subagent 的 Behavior 实例拥有权迁移；
- DSH-style `headless-runner` 插件和 CLI run 的 Host thin adapter；
- `apply(ctx, config)`、inject、Context service、Effect disposer 和 Loader settlement 测试；
- `agent.followup()`、scoped event、`session/event` 和 shutdown 的集成验证；
- legacy activation/composition 路径的显式隔离和默认路径清理；
- 当前设计索引、execution plan、exec-run 和实现后的 history/learning 同步。

### 不包含

- 不修改旧 `20260829-actspace-dsh-core-rebuild` 计划中的 P00/P04；
- 不重新设计或迁移 Session JSONL、13 种核心事件、replay、repair、fork 或 compaction 数据格式；
- 不改变 9 个 AgentLoop 插入点、5 个主要通知和 `session/event` 的既有语义；
- 不重写 read/list/edit/write/bash/web/Browser executor 的具体实现和行为测试；
- 不交付 CLI chat 交互 UX，只让 chat 共享最终 Boot/Runtime facade；
- 不实现 Goal/Schedule producer；
- 不启用在线 HMR/config reconcile；
- 不做不可信插件签名、沙箱、市场、远程下载或跨进程执行；
- 不插件化固定 Desktop renderer；
- 不做 Electron/Chrome/DMG/签名/公证的独立发布门禁替代验证；
- 不迁移 v1 Session 数据。

## 3. 依赖、规则与必读材料

### 必读规则

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/PLANS_GUIDE.md`
- `docs/exec-runs/README.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`

### 目标规范

- `docs/design-docs/agent-plugin-runtime/agent-spec-dsh-runtime-as-plugin-composition.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-dsh-plugin-assembly-and-agent-startup.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-dsh-event-model.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-agent-loop-cordis-surface.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-tool-runtime-boundary.md`
- `docs/design-docs/agent-plugin-runtime/agent-spec-plugin-runtime-abi.md`
- `docs/design-docs/agent-plugin-runtime/agent-target-runtime-architecture.md`
- `docs/design-docs/agent-plugin-runtime/agent-testing.md`

### DSH 参考源码

- `tmp/deepseek-harness/packages/boot/app-boot/src/index.ts`
- `tmp/deepseek-harness/packages/boot/cmdline/src/index.ts`
- `tmp/deepseek-harness/apps/cli/src/profile-boot.ts`
- `tmp/deepseek-harness/apps/cli/src/bin.ts`
- `tmp/deepseek-harness/packages/bundle/base/cordis.patch.yml`
- `tmp/deepseek-harness/packages/bundle/headless/cordis.patch.yml`
- `tmp/deepseek-harness/packages/bundle/headless/src/index.ts`

### ActSpace 当前入口

- `packages/cordis-adapter/src/cordis-root.ts`
- `packages/cordis-adapter/src/behavior-loader.ts`
- `packages/cordis-adapter/src/events.ts`
- `packages/boot/src/dsh-boot.ts`
- `packages/runtime/src/runtime/boot.ts`
- `packages/runtime/src/runtime/run-controller.ts`
- `packages/runtime/src/runtime/runtime-handle.ts`
- `packages/runtime/src/profiles/composition.ts`
- `packages/core/agent/src/plugin.ts`
- `packages/core/agent-loop/src/plugin.ts`
- `packages/core/agent-loop/src/service.ts`
- `apps/cli/src/runtime-v2/host-adapter.ts`
- `apps/cli/src/runtime-v2/run.ts`
- `apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts`

## 4. 不变量

1. 插件是受信任同进程代码；不重新引入 Static Manifest 作为默认激活协议。
2. 默认 Boot 只加载显式选择的 `cordis.yml`/Bundle tree，不扫描目录，不读取 `runtime-v2/plugins.json`。
3. 默认 Behavior 只接受真实 Cordis Context 和配置，入口为 `apply(ctx, config)`。
4. Host 只提供 Host capability、credential、IO、signal 和 `appExit`；不创建领域 Runtime 实例。
5. Bootstrap 只创建 root、安装 Loader/Include、注入 Host、等待 settlement、验证和关闭。
6. RuntimeHandle 只代理 Context service，不拥有第二份 Session/Agent/Tool/LLM 状态。
7. `agent.followup()` 先 durable inbox append，再允许 claim/turn。
8. Session durable event、AgentLoop hook、通知和工具行为保持既有契约。
9. 每个 Host 进程只 boot 一个 root；同一 root 的 `dispose` 幂等且有界。
10. 新路径失败只能显式选择 legacy 诊断入口，不能自动双跑或静默 fallback。

## 5. 迁移后的目标入口

### 5.1 Host 入口

统一形成以下 Host-facing 形态，具体 TypeScript 名称可在 Phase 1 固定，但不能改变所有权：

```ts
bootActSpaceRuntime({
  host,
  configPath,
  invocation,
}) -> Promise<RuntimeHandle>
```

`host` 只携带 Host services 和 capability；`configPath` 是显式选择的 Cordis tree；`invocation` 携带 task、stdin、output、signal 和 `appExit`。

### 5.2 最终配置树

CLI run 的 tree 至少声明：

```text
runtime-host
session
session-persistence
session-projection
llm
llm-provider
tools-runtime
core-tools
prompt
context
agent
agent-loop
compaction
subagent
headless-startup
headless-runner
```

Desktop 使用同一组领域插件，通过不同 Host services 和 capability ceiling 选择 Browser/renderer 相关行；不再用另一套 Runtime 手工装配。

## 6. 阶段计划

每个阶段都保持旧入口可运行，阶段完成后可以单独合并和验证；只有最终切换阶段才改变默认生产路径。

### Phase 1：Bootstrap、Host service contract 和 facade

目标：把固定启动边界与领域 Runtime ownership 分离，建立可被真实 Loader 使用的 Host service contract。

允许修改的主要文件：

- `packages/boot/src/dsh-boot.ts`
- `packages/boot/src/types.ts`
- `packages/cordis-adapter/src/cordis-root.ts`
- `packages/cordis-adapter/src/cordis-types.ts`
- `packages/runtime/src/runtime/boot.ts`
- `packages/runtime/src/runtime/runtime-handle.ts`
- `packages/runtime/src/runtime/host-services.ts`（新增）
- `packages/runtime/src/runtime/runtime-facade.ts`（新增）
- `packages/boot/tests/`
- `packages/runtime/src/test/`

具体动作：

1. 固定 `bootActSpaceRuntime(host, configPath, invocation)` 的输入和失败语义。
2. 将 `appExit`、argv/stdin snapshot、workspace、credential、approval、browser 和 artifact capability 统一收口为 Host services。
3. 让 Bootstrap 创建 root、安装 Loader/Include/Group/Timer、注入 Host services、等待 settlement 并返回 facade。
4. 让 RuntimeHandle 从 settled Context 获取 service facade；本阶段不改变默认 CLI/desktop 入口。
5. 增加真实 `cordis.yml` fixture，验证 Host preparation 在 config tree mount 前可见。
6. 增加 settlement、apply error、missing service、partial dispose、double dispose 和 single-root 测试。

验收：

- fixture 由 Include/Loader 真实加载；
- Boot failure 不返回 RuntimeHandle，partial root 已释放；
- facade 不暴露 raw Context、Session writer 或 AgentLoop class；
- `pnpm --filter @actspace/boot test`、`pnpm --filter @actspace/runtime test` 和对应 typecheck 通过。

### Phase 2：Session、LLM、Prompt、Tool Runtime 的实例所有权迁移

目标：让基础领域插件在 `apply(ctx, config)` 中创建真实实例，移除 Host/Runtime 对这些实例的直接拥有。

允许修改的主要文件：

- `packages/session/journal/src/plugin.ts`
- `packages/session/persistence/src/plugin.ts`
- `packages/session/jsonl/src/plugin.ts`
- `packages/session/projection/src/plugin.ts`
- `packages/llm/service/src/plugin.ts`
- `packages/llm/pi-ai/src/plugin.ts`
- `packages/prompt/src/plugin.ts`
- `packages/context/src/plugin.ts`
- `packages/tools/runtime/src/plugin.ts`
- `packages/tools/core-tools/src/plugin.ts`
- `packages/tools/browser-tools/src/plugin.ts`
- `packages/runtime/src/runtime/boot.ts`
- `apps/cli/src/runtime-v2/host-adapter.ts`
- `apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts`
- 每个受影响 package 的 `manifest.ts`、`package.json` exports 和 lifecycle tests

具体动作：

1. 把 `LlmRouteRegistry`/`LlmService` 创建迁入 LLM Behavior；Host 只提供 credential resolver/Provider config。
2. 把 `ToolRuntime`/registry/scheduler 创建迁入 Tool Runtime Behavior；Core Tools/Browser Tools 通过 Context service 注册。
3. 把 Session Store/Projection/flush/recovery 的 Runtime service facade 迁入 Session Behavior；保留 codec 的独立 discovery 顺序。
4. 把 Prompt/Context assembly 迁入对应 Behavior，暴露 immutable request assembly service。
5. 为每个 Behavior 增加 `inject`、service declaration、Effect disposer 和 no-top-level-side-effect contract。
6. 保持现有 executor、Session event writer、approval broker 和 provider wire 行为不变。
7. 建立一个完整 base `cordis.yml` fixture，按 service dependency 真实 settlement。

验收：

- Host Adapter 不再 `new LlmService()`、`new ToolRuntime()` 或直接 `registerCoreTools()`；
- Runtime Boot 不再创建 Session/Prompt/Compaction 基础实例；
- package-level lifecycle/dispose、dependency order、missing Host capability 测试通过；
- `session/event` 仍只在 append 成功后广播；
- 受影响 package typecheck/test 通过。

### Phase 3：Agent Registry、AgentLoop 和 Subagent 完整由插件拥有

目标：让 AgentLoop Behavior 从 Context 获取全部依赖，负责 Agent 创建/恢复、scoped Context、driver 和 quiescent dispose。

允许修改的主要文件：

- `packages/core/agent/src/plugin.ts`
- `packages/core/agent/src/registry.ts`
- `packages/core/agent/src/inbox.ts`
- `packages/core/agent-loop/src/plugin.ts`
- `packages/core/agent-loop/src/service.ts`
- `packages/core/agent-loop/src/agent-driver.ts`
- `packages/core/agent-loop/src/loop.ts`
- `packages/subagent/src/plugin.ts`
- `packages/subagent/src/provider.ts`
- `packages/runtime/src/runtime/boot.ts`
- `packages/runtime/src/runtime/run-controller.ts`
- `packages/runtime/src/runtime/runtime-handle.ts`
- `packages/core/agent-loop/src/test/`
- `packages/core/agent/src/test/`

具体动作：

1. Agent Behavior 创建 Agent Registry，并声明 main Agent preset/descriptor 来源。
2. AgentLoop Behavior 从 Context 注入 Session、LLM、Tools、Prompt、Agent Registry、Compaction 和 Host policy。
3. AgentLoop Service 为每个 Session 创建或恢复 Agent scoped Context、durable inbox 和 driver。
4. 将主 Agent、Agent 和 Explore 的创建、abort、idle、dispose 和 lineage 统一由 Service facade 管理。
5. 将 Subagent provider/tool registration 迁入 Subagent Behavior，不让 Runtime Boot 直接 new provider。
6. RuntimeHandle 只通过已发布 Agent facade 查找和驱动 Agent。
7. 添加两个 Session 并行创建、通知 scope 隔离、restore、abort 和 dispose 测试。

验收：

- 默认 Runtime Boot 和 Host Adapter 中没有 `new AgentLoop()`；
- AgentLoop plugin 可以在真实 Loader tree 中创建/恢复 Agent；
- 两个 Agent 的 scoped event 不互相匹配；
- AgentLoop、Subagent 领域行为测试与既有 Session/Tool tests 通过。

### Phase 4：Headless runner 插件与 CLI run 切换

目标：把单次无头任务驱动迁入 Cordis plugin，CLI 只处理 launcher/Host IO。

允许修改的主要文件：

- `packages/headless/src/plugin.ts`（新增）
- `packages/headless/src/runner.ts`（新增）
- `packages/headless/src/manifest.ts`（新增）
- `apps/cli/cordis.yml`
- `apps/cli/src/args.ts`
- `apps/cli/src/cli.ts`
- `apps/cli/src/runtime-v2/host-adapter.ts`
- `apps/cli/src/runtime-v2/run.ts`
- `apps/cli/src/runtime-v2/chat.ts`
- `packages/runtime/src/runtime/runtime-handle.ts`
- `apps/cli/src/test/`
- `packages/headless/src/test/`

具体动作：

1. 新增 `headless-runner.apply(ctx, config)`，从 Context 获取 Agent Registry、Session、output sink 和 `appExit`。
2. runner 等待 Loader settlement，创建/恢复目标 Agent，调用 `agent.followup()`，等待 idle/quiescent，flush Session，收集最终结果并请求 `appExit`。
3. `--input`、`--input-file`、stdin、`--json`、`--jsonl`、`--out`、`--persist`、`--resume` 保持现有用户契约。
4. 将 live event sink、durable `session/event` 和 artifact export 通过 Host service/Context event sink 接入，不在 CLI 重建事件。
5. 处理 abort、LLM error、tool denial、approval required、empty input、missing config 和 runner failure。
6. 默认 CLI run 不再调用 `handle.runTurn()` 驱动任务。

验收：

- CLI mock run 走 `boot → runner → followup → inbox → turn → flush → output → dispose`；
- persistent Journal 含 inbox enqueue、核心 Session 事件和 `session/end-seed`；
- `--resume` 使用同一 Session ID 追加事实；
- text/JSON/JSONL/artifact output 和退出码保持稳定；
- CLI Host 不直接创建 Session/LLM/Tools/AgentLoop；
- CLI process smoke、runtime-v2 tests 和 headless fixture tests 通过。

### Phase 5：Desktop 使用同一套 Runtime plugin tree

目标：Desktop 只替换 Host services 和 capability ceiling，不再维护独立的 plugin/Runtime 手工组装路径。

允许修改的主要文件：

- `apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts`
- `apps/desktop/src/main/runtime-v2/runtime-registry.ts`
- `apps/desktop/src/main/runtime-v2/runtime-loader.ts`
- `apps/desktop/src/main/host-ports.ts`
- `apps/desktop/src/main/approval-broker.ts`
- Desktop runtime tests and fixtures
- Desktop-specific `cordis.yml`/patch config under `apps/desktop/`

具体动作：

1. Desktop Host 只创建 credential、approval、Browser Bridge、artifact、renderer allowlist 和 workspace services。
2. Desktop 通过统一 Bootstrap 选择 Desktop `cordis.yml`/patch，使用与 CLI 相同的领域 plugin tree。
3. Browser Bridge 作为 Host capability 提供给 Browser Tools plugin；不可用时 optional row 跳过并记录诊断。
4. 移除 Desktop 默认启动对 `runtime-v2/plugins.json` 的依赖；旧配置只能进入显式 legacy/diagnostic path。
5. 确认 Renderer 继续只接收稳定 Projection DTO，不执行插件前端代码。
6. 增加 Desktop boot、Browser optional capability、renderer allowlist、quit/flush 和 reload boundary 测试。

验收：

- CLI 与 Desktop 只在 Host capability 上不同；
- Desktop 不直接持有 raw Cordis Context、Session writer 或 AgentLoop class；
- Browser capability 缺失时可安全降级；
- Desktop runtime tests、typecheck 和固定 renderer contract tests 通过。

### Phase 6：默认路径收口与旧激活外壳隔离

目标：删除默认路径的旧激活职责，保留可审计的显式 legacy 入口，完成静态扫描和文档收尾。

允许修改的主要文件：

- `packages/runtime/src/runtime/boot.ts`
- `packages/runtime/src/profiles/composition.ts`
- `packages/cordis-adapter/src/behavior-loader.ts`
- `packages/cordis-adapter/src/source-loader.ts`
- `packages/cordis-adapter/src/manifest.ts`
- `apps/cli/src/runtime-v2/host-adapter.ts`
- `apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts`
- `scripts/check-v2-legacy-removal.mjs`
- `scripts/check-package-boundaries.mjs`
- 当前设计文档、history、learning 和 execution-run 文档

具体动作：

1. 从默认 boot path 移除 `activateLegacy()`、`activateBehavior()`、`emptyPluginSet()` 和 `plugins.json` 读取。
2. 将 Static Manifest/source loader 代码缩小为显式 legacy/diagnostic 或 codec discovery 所需的职责，并明确入口名称。
3. 将 `createDefaultComposition()` 限制为离线 config dump/provenance 或显式 legacy，不让它激活默认 Runtime。
4. 增加静态检查，禁止 Host/Runtime 默认路径创建领域实例、调用旧激活协议或绕过 Loader tree。
5. 统一更新 current design index、plan status、execution process/summary、history 和学习沉淀。
6. 只有自动验证和用户指定的宿主人工门禁都明确记录后，才将本计划从 `active/` 移入 `completed/`。

验收：

- 默认源码调用链没有 `plugins.json`、`activateBehavior()`、`new AgentLoop()` 或 Host-owned domain constructors；
- `check:docs`、`check:current-docs`、`check:packages`、`check:v2-legacy-removal`、`check:secrets` 和 `git diff --check` 通过；
- `pnpm -r typecheck`、`pnpm -r test` 和真实 CLI process smoke 通过；
- 旧入口仍需显式选择，且不会删除或迁移 Session 数据。

## 7. 测试矩阵

### 自动化测试

```bash
pnpm --filter @actspace/boot test
pnpm --filter @actspace/cordis-adapter test
pnpm --filter @actspace/runtime test
pnpm --filter @actspace/core-agent test
pnpm --filter @actspace/core-agent-loop test
pnpm --filter @actspace/session-journal test
pnpm --filter @actspace/session-persistence test
pnpm --filter @actspace/llm-service test
pnpm --filter @actspace/tools-runtime test
pnpm --filter @actspace/agent-cli test
```

### 全仓验证

```bash
pnpm -r typecheck
pnpm -r test
pnpm run check:docs
pnpm run check:current-docs
pnpm run check:packages
pnpm run check:v2-legacy-removal
pnpm run check:secrets
node scripts/check-package-cutover.mjs --strict
git diff --check
```

### 进程和人工验收

1. Mock CLI run：确认只创建一个 root，输出稳定 JSON，退出码为 0。
2. Persistent/resume：确认同一 Session ID 追加 Journal，inbox enqueue 先于 claim/turn，最后有 `session/end-seed`。
3. JSONL：确认 live event 与 `run_result` 分行输出，`session/event` 不由 CLI 重建。
4. Fixture plugin：在 `apply(ctx)` 中使用 `ctx.plugin()`、`ctx.on()`、`ctx.emit()` 和 `ctx.effect()`，确认 reverse dispose。
5. Scope：两个 Session 各自安装 observer，确认通知和插入点不会串线。
6. Failure：apply error、missing dependency、optional capability、observer throw、approval required、LLM error、abort 和 disposer failure 都输出结构化诊断。
7. Desktop：只验证 Host capability 替换、Browser optional skip、fixed renderer projection、quit/flush；真实 Electron/Chrome/签名门禁另行记录。

## 8. 风险与缓解

| 风险 | 影响 | 缓解 |
|---|---|---|
| 领域 package 之间存在循环依赖 | Loader 无法 settlement | 先用 Host service contract 打断构造环；每个 package 只从公开 service interface 注入 |
| RuntimeHandle 与 plugin service 双重持有状态 | 重复 Agent、重复写 Journal | facade 只保存 Context 引用和 service lookup，不保存第二份 registry/writer |
| Host capability 被误认为 Runtime service | 插件树无法在 CLI/Desktop 复用 | 将 credential、approval、browser、IO 定义为 Host-provided capability；将 Session/LLM/Tools 定义为 plugin-owned service |
| Agent 创建时 Loader 仍未 settlement | Agent 看到半组装的 Tool/LLM | AgentLoop plugin 在 ready effect 中等待 Loader settlement，并在 Boot publish 前完成 required service validation |
| followup 与 driver 并发 | inbox claim/turn 顺序不稳定 | 每个 Agent 使用串行 driver；先持久化 enqueue，再唤醒 driver |
| Session event observer 阻塞或抛错 | 用户体验变差或任务被错误阻断 | durable-first；observer 异步、可丢弃，失败进入 diagnostics |
| 旧路径被隐式 fallback | 两套 Runtime 同时运行 | Boot 失败只返回结构化错误；legacy 只能由 Host 显式选择 |
| Desktop/Chrome 人工门禁未通过 | 不能证明完整产品发布 | 将真实 Provider、Electron、Chrome、DMG、签名/公证列为独立验收，不把自动测试当替代 |

## 9. 回退策略

- Phase 1–3 只增加 Context contract、Behavior 和 fixture；旧 CLI/Desktop 路径保持可运行，阶段可以独立停止。
- Phase 4 CLI 切换前保留一个显式 legacy command/test fixture；失败时改变入口选择，不删除 Session 数据。
- Phase 5 Desktop 切换失败时恢复 Desktop 的显式 legacy adapter，不恢复默认隐式 `plugins.json` 读取。
- Phase 6 只删除默认路径的旧激活职责；legacy 代码若仍需保留，移动到清晰命名的诊断入口，不与新 tree 并行。
- 所有回退均不执行 Session 数据迁移、不修改工具 executor、不删除用户 workspace 文件。

## 10. 进度记录

- [x] 用户审核本设计规范和本执行计划。
- [x] Phase 1：Bootstrap、Host service contract 和 facade。
- [x] Phase 2：Session、LLM、Prompt、Tool Runtime 实例所有权迁移。
- [x] Phase 3：Agent Registry、AgentLoop 和 Subagent 插件拥有。
- [x] Phase 4：Headless runner plugin 与 CLI run 切换。
- [x] Phase 5：Desktop 使用同一套 Runtime plugin tree。
- [x] Phase 6：默认路径收口、legacy 隔离、文档和验证收尾。
- [x] 创建并持续更新 `docs/exec-runs/20260829-actspace-dsh-runtime-full-plugin-composition/`。
- [x] 完成 history/learning 判断并写入对应目录。

## 11. 决策记录

- 2026-08-29：采用 DSH 的三层边界。固定 Bootstrap/Host 不是业务 Runtime 插件，但 Session、LLM、Tools、Prompt、Agent、AgentLoop 和 Headless Run 必须由 Cordis plugin tree 创建。
- 2026-08-29：保留 ActSpace `RuntimeHandle` 作为 Host facade，但禁止它拥有领域实现或第二份运行状态。
- 2026-08-29：本计划不修改既有 P00/P04，只消费其 Session/事件/工具契约。
- 2026-08-29：默认组合真源迁移到 `cordis.yml`/Bundle/Patch；Static Manifest/`plugins.json` 只保留显式 legacy、诊断或纯 codec discovery 职责。

## 12. 执行模式

**交互模式**：本轮已收到用户对 Phase 3–6 的连续实施授权；各阶段按顺序执行并在本地自动化门禁通过后收口。真实 Electron/Chrome/签名等宿主门禁仍需单独人工验收。

## 13. 执行文档

执行开始时创建：

- `docs/exec-runs/20260829-actspace-dsh-runtime-full-plugin-composition/execution-process.md`
- `docs/exec-runs/20260829-actspace-dsh-runtime-full-plugin-composition/execution-summary.md`

执行摘要必须记录：已切换的 Host、实际加载的 Entry tree、Agent/inbox/Session Journal 证据、默认路径 legacy 扫描结果，以及尚未完成的真实 Provider、Electron、Chrome、DMG、签名/公证门禁。
