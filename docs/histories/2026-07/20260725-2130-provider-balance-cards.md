## [2026-07-25 21:30] | Task: 将供应商余额收口到服务商卡片

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 每个已连接供应商卡片直接显示账户余额，Usage 页不再承担余额展示；OpenRouter 允许单独配置 Management Key。

### 🛠 Changes Overview

**Scope:** `packages/shared` + `packages/desktop` + frontend/model-context docs

**Key Actions:**

- **通用余额契约**: 新增 `getProviderBalance({ provider })` preload / IPC 通道，main 进程按 provider 分发 DeepSeek、Kimi 和 OpenRouter 余额适配器。
- **OpenRouter 双密钥**: 模型调用 Key 与 Management Key 分开经 `safeStorage` 加密保存；`/credits` 只使用 Management Key，断开时两者一并删除。
- **余额归属服务商**: 每张已连接卡片内显示紧凑余额条、手动刷新、进页刷新和 5 分钟定时刷新；刷新失败保留上次成功值。
- **Usage 收口**: 删除 Usage 页与 `WorkbenchLayout` 中 DeepSeek/Kimi 余额 props、状态和定时器；无统计数据时使用全宽空态。
- **回归保护**: 补充 provider balance service、双密钥存储、服务商卡片和 Usage 空态测试。

### 🧠 Design Intent (Why)

余额是供应商账户状态，不是 token usage 账本的一部分。将其收口到供应商卡片后，新增供应商只需扩展 provider 适配器，不再扩展 Usage 页的独立卡片、props 和刷新状态。OpenRouter 的账户 credits 又要求 Management Key，因此必须按凭据用途分离，避免用高权限密钥执行普通模型请求。

### 📁 Files Modified

- `packages/shared/src/ipc.ts`
- `packages/shared/src/settings.ts`
- `packages/desktop/src/main/provider-balance-service.ts`
- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- `packages/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `packages/desktop/src/renderer/components/WorkbenchLayout.tsx`
- `packages/desktop/src/main/test/provider-balance-service.test.ts`
- `packages/desktop/src/main/test/settings-service.test.ts`
- `packages/desktop/src/renderer/test/settings-page.test.tsx`
- `packages/desktop/src/renderer/test/usage-statistics-page.test.tsx`
- `docs/design-docs/frontend/front-设置页规范.md`
- `docs/design-docs/frontend/front-usage-statistics.md`
- `docs/design-docs/model-context/agent-multi-provider-llm.md`
