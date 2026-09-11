## [2026-09-11 00:28] | Task: 接入 deepseek-flash 与模型目录刷新

### Execution Context

- Agent ID: Codex 主代理
- Base Model: GPT-6
- Runtime: Codex desktop

### User Query

> 添加 DeepSeek 新模型，修复设置页不能更新模型目录，接入图片理解并更新价格；直接去掉 V4 Pro，显示名使用 deepseek-flash；确认提交。

### Changes Overview

Scope: shared、llm-pi-ai、desktop。

- 新增官方模型事实，统一旧模型别名和默认模型，迁移旧配置且保留 Flash 优先级。
- DeepSeek 目录支持服务商隔离的请求、缓存、添加、刷新反馈，沿用 Main 持有密钥与代理的边界。
- 图片请求验证真实格式、角色、数量和体积；保留思考与工具历史，修正 DeepSeek max_tokens 序列化。
- 更新官方固定高峰美元价格并保留历史费用快照。
- 同步模型、价格和设置设计，归档计划，补充迁移/目录/UI/实际序列化回归。

### Design Intent

模型列表接口只给 ID，官方能力与价格需要独立事实来源；价格在请求时冻结，避免目录更新改写历史费用。本次命中可迁移与易踩坑的学习条件，附学习速记。

### Files Modified

- `packages/shared/src/deepseek-model-facts.ts`
- `packages/shared/src/model-config.ts`
- `packages/shared/src/model-pricing.ts`
- `apps/desktop/src/main/settings-service.ts`
- `apps/desktop/src/main/runtime-v2/openrouter-catalog-service.ts`
- `apps/desktop/src/renderer/components/settings/ProviderSettings.tsx`
- `packages/llm/pi-ai/src/deepseek-images.ts`

验证与人工边界见 `docs/exec-runs/20260910-deepseek-v41-flash/execution-summary.md`。本次提交仅含 DeepSeek 相关文件，排除并行品牌素材变更。
