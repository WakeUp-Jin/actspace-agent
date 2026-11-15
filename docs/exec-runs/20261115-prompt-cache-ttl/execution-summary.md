# Anthropic 提示缓存时长按连接设置 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261115-prompt-cache-ttl.md`
- **执行过程**：`docs/exec-runs/20261115-prompt-cache-ttl/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（Electron 与真实中转请求未验）

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 缓存模式加 `long` | `packages/util/shared/src/settings.ts`、`model-connections.ts`、`apps/desktop/src/main/settings/{custom-connection,migrations}.ts`、`ipc/guards.ts` | 连接可存 5 分钟 / 1 小时 / 关闭 |
| 连接服务与视图 | `apps/desktop/src/main/model-connections-service.ts` | 只有 Anthropic 协议的连接出 `promptCacheMode`；改协议时回到默认值 |
| 连接详情下拉 | `apps/desktop/src/renderer/components/settings/models/ConnectionDetailPage.tsx` | 「提示缓存」行 + 旁注 |
| 连接设置覆盖模式策略 | `apps/desktop/src/main/runtime-v2/legacy-llm-adapter.ts` | 主会话、子 Agent、压缩、自动审批都用连接的时长 |
| 1 小时写入用量与计价 | `packages/llm/llm-service/src/{usage,usage-cost}.ts`、`packages/llm/llm-pi-ai/src/{pi-ai-stream,legacy-proxy-wire-engine}.ts`、`packages/util/shared/src/model-pricing.ts`、`packages/session/session-journal/src/auxiliary-codec.ts` | 1 小时部分按输入价 × 2 |
| 统计页费用明细 | `packages/client/client/src/sessions/chat.ts`、`packages/util/shared/src/ipc/usage.ts`、`apps/desktop/src/renderer/components/usage/usage-stats-model.ts` | 「缓存写入（5 分钟）/（1 小时）」分两行 |

## 已完成的验证

- 单测与类型检查见计划进度记录。
- 浏览器 renderer（`?mock=long-session`）由 Sonnet 子智能体验收：1200 浅色 / 560 浅色 / 1200 深色下「提示缓存」行与其他行对齐，下拉 120px，旁注与「已保存」不重叠，无横向溢出，选项在视口内；DeepSeek 官方连接没有这一行。

## 人工验证指引

### 必须验证

1. **设置页**
   - 验证方式：Electron 打开 设置 › 模型 › Anthropic 中转连接。
   - 预期结果：「连接」分组最后一行「提示缓存」，默认 5 分钟；改成 1 小时后显示「已保存」；OpenAI 协议连接没有这一行。
2. **请求真的带 1 小时**
   - 验证方式：中转连接选 1 小时，Agent 模式发两条消息；在轨迹里看请求体，或看中转面板。
   - 预期结果：`cache_control` 带 `"ttl":"1h"`；中转面板显示 1h 缓存创建（中转若丢掉 `ttl` 字段则仍是 5m，需要找中转确认）。
3. **计价**
   - 验证方式：同一请求在统计页悬停费用。
   - 预期结果：有 1 小时写入时出现「缓存写入（1 小时）」一行，金额 = token × 输入价 × 2 / 100 万。

### 建议验证

- 选「关闭」后请求体不再有 `cache_control`。
