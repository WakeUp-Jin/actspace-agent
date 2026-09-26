## [2026-09-26 14:13] | Task: 重做自定义服务与官方 Anthropic 的连接流程

### 🤖 Execution Context

- **Agent ID**: `Claude Code`
- **Base Model**: `claude-opus-5-5`
- **Runtime**: `Claude Code CLI（macOS，交互模式）`

### 📥 User Query

> 按 `20260926-custom-connection-setup-redesign` 执行计划（demo 已确认）实现：合并成一条「自定义服务」入口、两步向导、官方 Anthropic 只填 Key、按官方价折算计费、地址自动规范化、Anthropic 支持 x-api-key / Bearer 自动识别、详情页逐项编辑、删除要确认。阶段 A 之后继续执行，全部完成后统一提交。

### 🛠 Changes Overview

**Scope:** `packages/shared`、`packages/llm/pi-ai`、`apps/desktop`（main / preload / renderer）、设计与计划文档

**Key Actions:**

- **契约**：
  - 连接新增 `authMode / resolvedAuth / billingMode`；
  - 新增草稿或已保存连接的探测 `CustomConnectionProbeInput/Result`；
  - 创建连接支持 `initialModels + defaultApiModel`；
  - 新增共享的地址规范化 `normalizeCustomConnectionAddress`；
  - 目录新增 `custom` 条目，三条旧协议入口加 `hidden`。
- **主进程**：
  - 探测接口（Anthropic `/v1/models` 翻页，OpenAI `/models`），在两套 IPC 上同步；
  - 连接测试支持认证回退；
  - 只有地址、Key、认证方式、代理变化才作废测试结果；
  - 旧数据缺省值等于升级前的行为。
- **运行时**：Bearer 只发 `Authorization`。pi-ai 直连和 legacy 代理两条线路都不再带 `x-api-key: placeholder`；Anthropic SDK 固定 `authToken: null`，防止读取 `ANTHROPIC_AUTH_TOKEN`。补声明 `@anthropic-ai/sdk` 依赖。
- **计费**：
  - `reference` 按协议对应厂商的目录价 × 倍率；
  - `token` 只统计 Token；
  - 手填单价在 `reference` 模式下不再被倍率误乘。
- **界面**：
  - 添加目录分组，底部是「没有找到？ · 自定义服务」；
  - 新增 `CustomConnectionWizard`、`AnthropicKeySetup`、`ConnectionModelPicker`、`CustomConnectionDetail`；
  - 模型列表改为「…」菜单加开关，模型编辑页改为能力摘要 / 价格摘要加开关；
  - `ConfirmDialog` 统一删除确认；
  - 自定义连接状态如实显示。
- **验证与文档**：
  - 浏览器 fixture 支持 `?scenario=ok|bearer|nolist|badkey&seed=1`，截了浅色和深色各 9 张；
  - 更新 Maka 设置规范和多服务商设计文档；
  - 新增学习文档，讲 Anthropic SDK 的认证头。

### 🧠 Design Intent (Why)

接入中转站原来要记住三条协议入口、地址规则（Anthropic 不能带 `/v1`）和四项单价，而且只支持 `x-api-key`。很多中转站要求 Bearer，用户只会看到 401。

现在的做法：
- 由测试结果决定能不能用、有哪些模型；
- 能力和价格从内置目录推出来，用户只需要选协议、贴地址、填 Key、勾模型。

旧连接的字段缺省值严格等于升级前的行为，所以升级不会改变已有连接的认证和计费。

### 📁 Files Modified

- `packages/shared/src/custom-connection-address.ts`、`settings.ts`、`model-pricing.ts`、`provider-config.ts`、`custom-model-input.ts`
- `apps/desktop/src/main/settings-service.ts`、`runtime-v2/provider-network-service.ts`、`runtime-v2/custom-connection-probe.ts`、`runtime-v2/credential-resolver.ts`、`runtime-v2/legacy-llm-adapter.ts`、`model-runtime-service.ts`
- `packages/llm/pi-ai/src/legacy-proxy-wire-engine.ts`
- `apps/desktop/src/renderer/components/settings/ProviderSettings.tsx`、`CustomConnectionWizard.tsx`、`AnthropicKeySetup.tsx`、`ConnectionModelPicker.tsx`、`CustomConnectionDetail.tsx`、`CustomConnectionModels.tsx`、`CustomModelForm.tsx`、`ModelPricingFields.tsx`、`ConfirmDialog.tsx`、`custom-connection-shared.tsx`
- `docs/design-docs/frontend/front-模型设置页面-Maka重做规范.md`、`docs/design-docs/model-context/agent-multi-provider-llm.md`
