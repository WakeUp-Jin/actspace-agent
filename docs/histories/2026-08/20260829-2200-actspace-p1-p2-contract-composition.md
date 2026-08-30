## [2026-08-29 22:00] | Task: 实施 P1/P2 核心契约与组合层

### 🤖 Execution Context

- **Agent ID**: `root`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 在已批准的重构计划上继续执行：完成 Session Core/Persistence 分离、Service Definition/Provider/Consumer、Profile/Bundle/Patch 分层和契约矩阵自动生成；CLI run 优先，工具具体执行逻辑保持稳定。

### 🛠 Changes Overview

**Scope:** Session、Cordis adapter、Composition、Runtime Boot、契约生成器、CI 与执行文档。

**Key Actions:**

- **Session seam**：用 backend-neutral `SessionPersistenceDriver` 和 binding 隔离 Session Core 与 JSONL writer/lease/recovery Provider。
- **Service roles**：为 14 个核心服务补齐 Definition 元数据、ProviderHandle、Consumer identity 和 graph/manifest 校验。
- **Composition facts**：让 Profile/Bundle/Patch 的 resolved result 携带 service/codec admission、loader transport、startup requirements 与 digest 输入。
- **Contract matrix**：增加显式 allowlist 的 JSON/Markdown generator、稳定 digest、负向校验和 CI `--check`。
- **Gate correction**：让 legacy-removal checker 只在 trusted composition metadata 的精确路径允许当前合法 `session.jsonl` Provider，并保留 package-cutover 作为结构门禁。

### 🧠 Design Intent (Why)

把“会话状态如何保存”“服务如何被提供和消费”“插件如何被组合”“契约如何被审计”拆成可验证的边界。这样 CLI headless run 可以先复用稳定的 Core/Provider seam，而不需要改写工具的具体执行实现；后续替换持久化后端或增加外部插件时，也能通过 composition digest、loader parity 和 contract matrix 提前发现漂移。

### 📁 Files Modified

- `packages/session/persistence/src/session-driver.ts`
- `packages/session/persistence/src/session.ts`
- `packages/session/persistence/src/session-persistence.ts`
- `packages/session/persistence/src/session-store.ts`
- `packages/cordis-adapter/src/service-contract.ts`
- `packages/composition/src/types.ts`
- `packages/composition/src/compose.ts`
- `packages/runtime/src/profiles/composition.ts`
- `packages/boot/src/dsh-boot.ts`
- `scripts/contract-matrix/source-registry.mjs`
- `scripts/contract-matrix/generate.mjs`
- `scripts/check-v2-legacy-removal.mjs`
- `artifacts/agent-contract-matrix.json`
- `docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`
- `docs/exec-plans/active/20260829-actspace-p1-p2-contract-and-composition/`
- `docs/exec-runs/20260829-actspace-p1-session-core-persistence/`
