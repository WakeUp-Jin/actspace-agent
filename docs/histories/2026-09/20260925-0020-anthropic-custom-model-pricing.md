# Anthropic 自定义连接、手动模型与价格

## 用户诉求

为自定义服务补齐 Claude Code 常见的 Anthropic Messages 格式，并重点处理 Prompt Cache；模型名称和价格改为手动添加，不做自动模型拉取和自动价格匹配，同时完善设置页交互。

## 本次改动

- Anthropic 自定义连接改用服务根地址语义，实际调用 `/v1/messages`，并增加协议感知的最小连接测试。
- 增加连接级短缓存/关闭策略，让 direct pi-ai 和 request-scoped proxy 保持一致。
- 增加连接内手动模型的添加、编辑、默认切换、停用和删除保护。
- 增加 USD/CNY 的标准输入、输出、缓存读取、缓存写入四类手动单价。
- 首个模型与后续模型共用主进程 builder 和校验；相同 API ID 在不同连接中保持隔离。
- 更新设置中心、模型目录、Usage、LLM Core Pi 设计文档和离线验收 fixture。

## 设计动机

中转站的模型命名、能力与价格经常是自定义的，自动猜测会把“可调用”误当成“能力与账单已知”。因此连接只负责协议、地址、密钥与缓存策略，模型和价格由用户按连接显式维护；运行时继续冻结请求级价格快照，历史费用不被后来编辑改写。

缓存策略必须在最终 wire 边界实施。直连与代理经过不同序列化路径，只在上层保存一个布尔值不足以保证实际 payload 一致，因此两条路径分别适配、共享同一策略语义并用 payload 测试锁定。

## 关键文件

- `packages/shared/src/custom-model-input.ts`
- `packages/shared/src/settings.ts`
- `packages/llm/pi-ai/src/anthropic-cache.ts`
- `packages/llm/pi-ai/src/pi-ai-stream.ts`
- `apps/desktop/src/main/settings-service.ts`
- `apps/desktop/src/main/model-store-service.ts`
- `apps/desktop/src/main/runtime-v2/provider-network-service.ts`
- `apps/desktop/src/renderer/components/settings/CustomModelForm.tsx`
- `apps/desktop/src/renderer/components/settings/CustomConnectionModels.tsx`
- `apps/desktop/src/renderer/components/settings/ModelPricingFields.tsx`

## 验证

- Shared、LLM Service、pi-ai 和 Desktop 聚焦测试通过。
- 全仓 typecheck、build、主题、文档和 diff 检查通过。
- 浏览器 fixture 的浅色、深色和 375px 表单布局通过。
- 完整测试仅剩一个与本改动无关、独跑通过的 Settings 测试隔离失败；真实 Electron 点击和真实中转站调用保留人工门禁。

## 学习沉淀

- `docs/learnings/2026-09/cache-policy-must-reach-the-final-wire.md`
