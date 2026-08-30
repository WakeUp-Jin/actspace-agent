# ActSpace Profile-first Runtime 精简与 RuntimeHandle 删除

> 状态：实现与自动化验收完成；真实宿主门禁待执行。
> 设计依据：[`agent-decision-profile-first-headless-desktop.md`](../../../design-docs/agent-plugin-runtime/agent-decision-profile-first-headless-desktop.md)
> 计划 slug：`20260830-actspace-profile-first-runtime-simplification`

## 目标

将 ActSpace 当前 Runtime 收敛为两个独立运行面：`headless` 和 `desktop`。Profile 通过 Bundle/Patch 生成 Cordis Plugin Tree，固定 Bootstrap 只创建 Context 和宿主能力，应用启动和 Agent 编排由 `@actspace/headless` / `@actspace/desktop-app` 负责；迁移完成后删除 `RuntimeHandle`、`RuntimeFacade` 和通用 Host Adapter 编排层。

## 范围

### 包含

- Headless Profile：`dsh-base + dsh-headless`。
- Desktop Profile：`dsh-base + @actspace/desktop-app`。
- Profile/Bundle/Patch 到 BootManifest 的唯一启动链。
- Headless Agent 创建、followup、Inbox、Journal、flush、输出和退出。
- Desktop Session/Agent/Projection/IPC 和 shutdown。
- 删除 RuntimeHandle 生产代码、公共导出、直接调用点和仅相关测试。
- 删除当前 CLI chat 生产命令和 `cli-chat` Profile/Host kind。
- 同步当前架构文档、执行计划入口和完成后的 history。

### 不包含

- `dsh-web-app` 迁移或实现；只从当前 Profile 和验收范围排除。
- CLI chat 的兼容迁移；当前生产 CLI 只保留 headless `run` 入口。
- Agent、Session、LLM、Tool executor 的行为重写。
- 跨进程共享 Agent、daemon、在线 HMR、在线 reconcile 或不可信插件隔离。
- 删除 `v1-legacy/` 或历史 execution plan。

## 背景与执行前现状

以下描述记录本计划启动时的旧边界；当前实现状态见“进度记录”和 execution summary。

当前生产代码仍通过 `RuntimeHandle` 连接 Host 与 Runtime，关键路径包括：

- [`packages/runtime/src/runtime/boot.ts`](../../../../packages/runtime/src/runtime/boot.ts)
- [`packages/runtime/src/runtime/runtime-handle.ts`](../../../../packages/runtime/src/runtime/runtime-handle.ts)
- [`packages/runtime/src/runtime/runtime-facade.ts`](../../../../packages/runtime/src/runtime/runtime-facade.ts)
- [`apps/cli/src/runtime-v2/host-adapter.ts`](../../../../apps/cli/src/runtime-v2/host-adapter.ts)
- [`apps/cli/src/runtime-v2/run.ts`](../../../../apps/cli/src/runtime-v2/run.ts)
- [`apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts`](../../../../apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts)
- [`apps/desktop/src/main/runtime-v2/runtime-registry.ts`](../../../../apps/desktop/src/main/runtime-v2/runtime-registry.ts)
- [`packages/headless/src/plugin.ts`](../../../../packages/headless/src/plugin.ts)
- [`packages/headless/src/runner.ts`](../../../../packages/headless/src/runner.ts)

本计划新增的 Desktop Runtime Bundle：

- `packages/desktop-app/package.json`
- `packages/desktop-app/src/manifest.ts`
- `packages/desktop-app/src/plugin.ts`
- `packages/desktop-app/src/service.ts`

相关目标边界：

- [`agent-spec-dsh-runtime-as-plugin-composition.md`](../../../design-docs/agent-plugin-runtime/agent-spec-dsh-runtime-as-plugin-composition.md)
- [`agent-spec-dsh-plugin-assembly-and-agent-startup.md`](../../../design-docs/agent-plugin-runtime/agent-spec-dsh-plugin-assembly-and-agent-startup.md)
- [`agent-spec-profile-bundle-patch-layering.md`](../../../design-docs/agent-plugin-runtime/agent-spec-profile-bundle-patch-layering.md)

## 约束

- 一次进程只允许一个 Cordis root Context。
- 不在 Host 中手工创建 Session、AgentLoop、Tool Runtime 或 LLM Service。
- Agent 输入必须经过 durable Inbox；`session/event` 必须位于 Journal append 之后。
- 配置和插件变化采用 restart-only。
- 当前只验收 headless 和 desktop；Web 不得成为本计划的阻塞项。
- 保留无关 dirty worktree，不执行 destructive git 操作。
- 既有工作树包含大量与本计划无关的改动；只能修改本计划列出的文件和新增的 Desktop Bundle/执行记录。

## 实施阶段

### 阶段 1：锁定两个 Profile、CLI 表面和唯一 Boot 输入

修改范围：

- `packages/runtime/src/profiles/`
- `packages/runtime/cordis.yml`
- `apps/cli/cordis.yml`
- `packages/runtime/src/runtime/boot.ts`
- `apps/cli/src/args.ts`
- `apps/cli/src/cli.ts`
- `apps/cli/src/runtime-v2/chat.ts`
- `packages/shared/src/runtime-v2/host-dto.ts`
- `packages/runtime/src/profiles/cli-chat.bundle.ts`
- 相关 composition、manifest 和 profile tests。

动作：

1. 明确 `headless`、`desktop` 的 ordered Bundle 列表。
2. 将 Profile/Patch composer 产出的同一份 `BootManifest` 交给 Cordis Loader。
3. 删除默认路径中对 CLI chat、Web 或第二套插件列表的隐式依赖；CLI 生产入口只保留 headless run。
4. 新增 `bootRuntime()` / `bootProfileRuntime()` helper，返回 `{ context, root, manifest, shutdown }`；Host launcher 只负责选择 Profile 并等待对应 App Bundle。
5. 明确 `actspace.headless` 与 `actspace.desktop` 的 ordered Bundle 和 app entry。

验收：

- headless/desktop 两个 Profile 的 config dump、digest 和 Loader entries 一致。
- 缺少 required Service、Behavior apply 失败或 settlement 超时会释放 root。
- Profile 之间不会共享同一个 root 或 Agent Registry。
- `cli-chat` 不再出现在生产 Profile、Host kind 或默认测试路径。

### 阶段 2：将 Headless 迁移为应用 Bundle 入口

修改范围：

- `packages/headless/src/plugin.ts`
- `packages/headless/src/runner.ts`
- `packages/runtime/src/runtime/headless-plugin.ts`
- `apps/cli/src/runtime-v2/run.ts`
- `apps/cli/src/runtime-v2/host-adapter.ts`
- `apps/cli/src/test/runtime-v2*.test.ts`

动作：

1. 将 `runHeadless()` 的 Session/Agent/followup/flush/output 逻辑归入 `@actspace/headless`，Loader 直接使用 `@actspace/headless/plugin`。
2. CLI 只解析 invocation、选择 Profile、注入 Host services 并等待 Bundle 完成。
3. 确认 `agent.followup()` 经过 Inbox、AgentLoop 和 Journal。
4. 保留 SIGINT、退出码、`--persist`、`--resume`、`--jsonl` 的既有语义。

验收：

- headless mock run 成功、失败、abort 三条路径均能输出稳定退出码。
- Journal 在 run-end 和 shutdown 前完成 flush。
- `session/event` 只在 append 成功后出现。
- CLI 不再导入 RuntimeHandle。

### 阶段 3：建立 `@actspace/desktop-app` 并迁移 Desktop 入口

修改范围：

- `packages/desktop-app/package.json`
- `packages/desktop-app/src/manifest.ts`
- `packages/desktop-app/src/plugin.ts`
- `packages/desktop-app/src/service.ts`
- `apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts`
- `apps/desktop/src/main/runtime-v2/runtime-registry.ts`
- `apps/desktop/src/main/index.ts`
- `apps/desktop/src/main/runtime-v2/projection-ipc.ts`
- `apps/desktop/src/main/runtime-v2/desktop-shell-ipc.ts`
- 相关 Desktop runtime/projection/approval tests。

动作：

1. Desktop 启动时选择 `actspace.desktop` Profile，直接取得当前进程 Context 和 shutdown。
2. 新建 `DesktopAppService`，将 Session、Agent、abort、compact、flush 的调用改为 Context Service。
3. 将 live event buffer/replay cursor/renderer push 保留在 `DesktopProjectionBridge`（Host）中，不放回通用 Runtime。
4. Artifact import/read/export 保留为 Host artifact port，不归属 Agent Core。
5. 保持 renderer 只接收 Projection DTO，不暴露 Context、Fiber、writer 或 AgentLoop class。
6. Electron quit 按 stop accepting -> abort/drain -> flush -> quiesce -> dispose 顺序执行。

验收：

- Desktop main typecheck、IPC tests、Projection tests 通过。
- Session create/resume、followup、abort、quit flush 可重复验证。
- 同一 Desktop 进程没有第二个 Runtime root。
- `apps/desktop` 不再导入 `RuntimeHandle`。

### 阶段 4：删除 RuntimeHandle 与通用编排层

修改范围：

- 删除 `packages/runtime/src/runtime/runtime-handle.ts`。
- 删除 `packages/runtime/src/runtime/runtime-facade.ts`。
- 更新 `packages/runtime/src/runtime/index.ts`、`packages/runtime/src/index.ts` 及相关 exports。
- 删除或收缩仅为 RuntimeHandle 服务的 `runtime-registry`、run controller 和 Host Adapter orchestration。
- 删除仅验证 RuntimeHandle 的测试；保留等价的 Profile/Bundle/Boot/Agent 行为测试。
- 检查 `@actspace/host` 和 `createHostRuntimeBoundary()`；无生产引用时删除该包及测试。

动作：

1. 先执行全仓库引用扫描，确认只剩历史文档和本计划中的迁移记录。
2. 删除类型、实现、导出和生产调用点。
3. 将 shutdown、diagnostics、session 和 projection 的必要行为归属到 Bootstrap、App Bundle 或领域 Service。
4. 不新增 `ProfileHandle`、`AppRuntime`、`DesktopRuntimeHandle` 或第二个总入口。

验收：

- `rg -n "RuntimeHandle|runtime-handle|runtime-facade" apps packages` 无生产代码命中。
- Runtime、CLI、Desktop、Headless 包均可独立 typecheck/build。
- 不存在手工 `new AgentLoop()` 的默认生产启动路径。
- `@actspace/desktop-app` 和 `@actspace/headless` 都有真实 Manifest/Behavior lifecycle 测试。

### 阶段 5：文档、测试和交付收口

修改范围：

- 当前 v2 架构文档中仍把 RuntimeHandle 描述为必经层的段落。
- `docs/RELIABILITY.md`、`docs/design-docs/agent-runtime/agent-turn-layers.md`。
- `docs/design-docs/agent-plugin-runtime/agent-target-overall-architecture.md`、`agent-target-runtime-architecture.md`。
- `docs/exec-plans/active/` 中仍将 RuntimeHandle 标记为当前必经层的计划；不删除历史，改为 superseded/discarded 说明。
- 相关 active/completed execution plan 的状态和替代入口。
- `docs/histories/2026-08/` 新增本次完成记录。

动作：

1. 将本文设计文档标记为已确认，并把旧 RuntimeHandle 入口标记为 superseded。
2. 更新 `docs/design-docs/agent-plugin-runtime/README.md` 和 `docs/exec-plans/README.md` 导航。
3. 为 headless、desktop、事件通知和 shutdown 补齐当前入口说明。
4. 执行全量验证并记录人工门禁；未验证的真实 Provider、Electron packaged build 不得写成已通过。

## 验证命令

### 快速验证

```sh
pnpm --filter @actspace/headless typecheck
pnpm --filter @actspace/desktop-app typecheck
pnpm --filter @actspace/runtime typecheck
pnpm --filter @actspace/agent-cli typecheck
pnpm --filter @actspace/desktop typecheck
```

### 生产前验证

```sh
pnpm run typecheck
pnpm run test:contract-matrix
pnpm run test:package-boundaries
pnpm run check:current-docs
pnpm run check:v2-legacy-removal
pnpm --filter @actspace/agent-cli test
pnpm --filter @actspace/desktop test
pnpm --filter @actspace/headless test
pnpm --filter @actspace/desktop-app test
```

### 手工门禁

- 运行一次 headless mock task，检查最终输出、退出码、Journal 和 `session/event` 顺序。
- 发送 SIGINT，确认 Agent abort、Journal flush 和进程退出有界完成。
- 启动 Desktop，创建/恢复 Session，发送消息，检查 Projection 到 renderer 的完整链路。
- 退出 Desktop，确认没有 pending writer、active Agent 或未释放 Fiber/Effect。
- 明确记录真实 Provider、Chrome、Electron packaged/DMG 等未覆盖门禁。
- 明确记录 CLI chat 已删除，不再将其列为当前验收路径。

## 风险与回退

| 风险 | 缓解 | 回退 |
|---|---|---|
| RuntimeHandle 删除导致跨包调用遗漏 | 每个阶段结束都做全仓库引用扫描和包级 typecheck | 在阶段 2/3 保留未迁移 Profile 的显式旧入口，阶段 4 后才删除 |
| Headless 与 Desktop 各自重新实现 Agent 编排 | 强制所有输入走 `ctx.agents`、Inbox、AgentLoop Service | 回退到对应 App Bundle 的上一版本，不恢复通用 Handle 逻辑 |
| Desktop quit 丢失 Journal | 将 flush/quiesce/dispose 纳入 App Bundle shutdown 验收 | 保留旧 quit disposer 直到新路径通过人工门禁 |
| 文档仍把旧 RuntimeHandle 当当前真源 | 同步更新 current truth zone，并把旧计划标注为历史/替代 | 不删除历史文档，只修导航和状态 |
| 未来要求跨进程共享 Agent | 明确该需求超出本计划 | 新建独立 `agent-host` 设计，不回滚本次 Profile 边界 |
| `@actspace/desktop-app` 与 Electron Host 边界模糊 | Bundle 只依赖抽象 Host ports，禁止直接 import `electron` | 将 Electron-specific code 留在 `apps/desktop`，Bundle 只保留 Service/Behavior |

## 进度记录

- [x] 用户确认设计文档和删除边界。
- [x] 完成两个 Profile 和唯一 Boot 输入收敛。
- [x] 完成 Headless Bundle 迁移和 CLI 验收。
- [x] 完成 Desktop Bundle 迁移和 Electron main 代码迁移；真实 Electron packaged/quit 门禁待执行。
- [x] 删除 RuntimeHandle、RuntimeFacade、旧通用编排实现和生产引用。
- [x] 完成全量自动化测试、文档同步和 history；真实 Provider/Chrome/Electron 门禁待执行。

## 决策记录

- 2026-08-30：当前阶段只保留 `headless` 和 `desktop`，暂不处理 `dsh-web-app`。
- 2026-08-30：采用 Profile-first 单进程模型；共享 Package/Bundle/协议，不共享跨进程 live Agent。
- 2026-08-30：删除 RuntimeHandle 作为公共和核心运行时层；固定 Bootstrap 只返回进程内 `BootedProfile`（`context`、`root`、`manifest`、`shutdown`）。
- 2026-08-30：新增 `@actspace/desktop-app` 作为独立 Runtime Bundle；`apps/desktop` 保留 Electron Host 职责。
- 2026-08-30：删除当前 CLI chat 生产表面；CLI 只保留 headless run。

## 执行模式

采用交互模式。架构、启动边界和公共导出会变化；每个阶段完成后记录验证结果，并在跨 Host 边界或删除公共导出前进行人工确认。

## 执行文档

正式开始执行时，创建：

- `docs/exec-runs/20260830-actspace-profile-first-runtime-simplification/execution-process.md`
- `docs/exec-runs/20260830-actspace-profile-first-runtime-simplification/execution-summary.md`
