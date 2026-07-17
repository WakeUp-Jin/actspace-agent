## [2026-07-17 22:57] | Task: 重写 Browser Locator Runtime

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 不直接复用 Codex 或 Playwright 运行时，在 Browser Bridge 内自研一套接近 Playwright Locator 的能力，包括 role、accessible name、label、placeholder、Frame、Shadow DOM、actionability、自动等待和重试；同时把 Agent 默认 maxTurns 提高到 200。

### 🛠 Changes Overview

**Scope:** `plugins/browser-bridge`、`packages/agent-core`、Browser Use 设计文档

**Key Actions:**

- **自研页面 Runtime**：新增 TypeScript 模块化源码，确定性构建为单 JavaScript 产物，再通过 Go `go:embed` 进入 Native Messaging host；产品运行时不依赖 Node、Playwright 或 Codex bundle。
- **结构化 Locator**：增加 `css / role / text / label / placeholder / test_id` target AST，保留旧 CSS selector 兼容入口；Go registry、router、Agent Core schema 和 preview 同步接入。
- **页面语义与 actionability**：实现 accessible name、隐式 role、显式/隐式 label、open Shadow DOM、strict match、稳定/可见/启用/可编辑/viewport/hit-test 检查及 deadline 自动等待。
- **Frame 与 OOPIF**：Go 逐层解析 frame element，以 `DOM.describeNode` 获得 frameId，在目标 Frame 创建 isolated world 并注入 Runtime；Extension 使用 flat CDP session 跟踪 OOPIF child session，动作坐标回算到顶层 viewport。
- **Agent Loop 上界**：默认 `maxTurns` 从 50 调整为 200，达到限制且仍有工具工作时返回明确 `exhausted / AGENT_MAX_TURNS` 失败终态。
- **验证与文档**：扩展 runtime fixture、Go/CDP 测试、Extension primitive contract、真实 Chrome acceptance fixture，并同步设计文档、execution plan 和学习文档。

### 🧠 Design Intent (Why)

将“页面 DOM/ARIA 语义”“Frame/execution-context 路由”“真实 CDP 输入”拆成三个边界：TypeScript Runtime 只处理当前页面 context 的 live DOM，Go 负责协议、等待和跨 Frame 编排，Extension 只承担 Chrome 权限原语。这样既能获得类似 Playwright Locator 的稳定性，又不把大型 Node runtime 或私有 Codex 实现复制进产品。

### 📁 Files Modified

- `plugins/browser-bridge/apps/cli/internal/locator/runtime-src/`
- `plugins/browser-bridge/apps/cli/internal/locator/generated/runtime.js`
- `plugins/browser-bridge/apps/cli/internal/locator/engine.go`
- `plugins/browser-bridge/apps/cli/internal/cdp/session.go`
- `plugins/browser-bridge/apps/cli/internal/commands/`
- `plugins/browser-bridge/apps/cli/command_router.go`
- `plugins/browser-bridge/apps/chrome-extension/src/background.js`
- `plugins/browser-bridge/packages/protocol/protocol.go`
- `packages/agent-core/src/tools/tools/browser/`
- `packages/agent-core/src/engine/loop.ts`
- `packages/agent-core/src/engine/bridge.ts`
- `plugins/browser-bridge/test-fixtures/acceptance/`
- `scripts/build-browser-locator-runtime.mjs`
- `docs/design-docs/agent-browser-use-*.md`

### ✅ Verification

- `pnpm check:browser`：通过，包括 Runtime TS 类型检查、生成产物漂移检查、jsdom fixture、registry parity、cursor 和 Extension primitive contract。
- `GOCACHE=/private/tmp/abb-go-cache go test ./...`：通过。
- `pnpm --filter @actspace/agent-core typecheck`：通过。
- `pnpm check:docs`：通过。
- `git diff --check`：通过。
- agent-core 全量测试（沙箱外）：810/811 通过；唯一失败为已有 `subprocess.test.ts` 超时子进程输出断言，与本次变更无关。
- 真实 Chrome smoke：当前 Chrome 仍连接 reload 前启动的旧 native-host 进程，旧 schema 在进入新 Runtime 前以“缺少 selector”拒绝结构化 target；待用户 reload unpacked extension 后重跑并关闭 active plan。
