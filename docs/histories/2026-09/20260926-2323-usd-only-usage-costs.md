## [2026-09-26 23:23] | Task: 统一使用统计费用为 USD

### 🤖 Execution Context

- **Agent ID**: `/root`
- **Base Model**: `GPT-6`
- **Runtime**: `Codex Desktop`

### 📥 User Query

> 使用统计费用统一按美元计算；外部接口返回 CNY 时转换为 USD；旧的混合币种统计记录直接清理。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/client`、`apps/desktop`、使用统计设计文档

**Key Actions:**

- **USD 费用契约**：统计摘要、请求行、内置 Kimi 价目和自定义模型保存结果统一使用 USD。
- **边界转换**：外部 CNY 价格和请求费用按 `7.2 CNY = 1 USD` 转换；缺省币种按 USD 处理。
- **历史清理**：首次升级创建一次性清空标记，清空旧使用统计索引，不迁移或重算旧记录。
- **界面与测试**：移除 CNY 选择和混合金额展示，更新投影、目录、缓存和 renderer 测试。

### 🧠 Design Intent (Why)

费用的存储、聚合和展示必须使用同一个内部单位，避免摘要与请求明细出现不同货币。外部协议仍可保留 CNY 输入兼容，但必须在进入运行时模型定义或使用统计投影时完成转换；旧索引直接清理，避免把历史口径混入新的 USD 统计。

### 📁 Files Modified

- `packages/shared/src/ipc.ts`
- `packages/shared/src/model-config.ts`
- `packages/shared/src/model-pricing.ts`
- `packages/shared/src/custom-model-input.ts`
- `packages/client/src/sessions/chat.ts`
- `packages/client/src/sessions/usage-aggregates.ts`
- `apps/desktop/src/main/runtime-v2/usage-source-cache.ts`
- `apps/desktop/src/main/runtime-v2/openrouter-catalog-service.ts`
- `apps/desktop/src/renderer/components/UsageStatisticsPage.tsx`
- `apps/desktop/src/renderer/components/settings/ModelPricingFields.tsx`
