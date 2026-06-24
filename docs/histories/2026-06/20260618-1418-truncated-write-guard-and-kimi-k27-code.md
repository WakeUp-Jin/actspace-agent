## [2026-06-18 14:18] | Task: write_file 截断安全阀 + Kimi K2.7 Code 模型配置

### 用户诉求

讨论 `write_file` 在模型输出上限触顶时可能收到不完整工具参数的问题。希望先做安全止血：如果 provider 原始 stop reason 是 `length` 且本轮包含 tool call，不执行写入类工具，并返回明确错误。同时给 `write_file` 加短提示，鼓励长文档先写骨架再用 `edit_file` 分段补齐；另新增 Kimi 官方发布的 `kimi-k2.7-code` 模型配置。

### 主要改动

- `packages/agent-core/src/llm/convert.ts`
  - 在流式 accumulator 中保留 provider 原始 `finish_reason`。
  - `buildAssistantMessage` 在 `diagnostics` 中记录 `rawStopReason`，避免 tool call 把最终 `stopReason` 改成 `toolUse` 后丢失 `length` 信号。
- `packages/agent-core/src/engine/loop.ts`
  - 当 assistant 诊断包含 `rawStopReason: "length"` 时，阻断 `write_file` / `edit_file` / `delete_file`，返回：
    - `工具参数可能因模型输出长度限制被截断，已取消写入。请缩小内容，或先写骨架后用 edit_file 分段补齐。`
  - 读类和搜索类工具不受影响。
- `packages/agent-core/src/tools/tools/write-file/definition.ts`、`packages/agent-core/src/prompt/main-agent.ts`
  - 加短提示：`write_file` 只用于小型完整文件；长内容先写骨架/首段，再用 `read_file + edit_file` 分段补齐；追加时读尾部并替换唯一尾部锚点或末段。
- `packages/shared/src/model-config.ts`
  - 新增公共模型 `kimi-k2.7-code`：
    - context window: `1_000_000`
    - max tokens: `262_144`
    - CNY / 1M tokens: cache hit `1.30`、cache miss `6.50`、output `27.00`
- Kairos 相关设置链路同步允许 `kimi-k2.7-code`：
  - `packages/shared/src/settings.ts`
  - `packages/agent-core/src/kairos/env.ts`
  - `packages/desktop/src/main/settings-service.ts`
  - `packages/desktop/src/renderer/components/settings/KairosSettings.tsx`

### 测试与验证

- `pnpm --filter @actspace/shared build`
- `pnpm --filter @actspace/shared test -- src/test/model-config.test.ts`
- `pnpm --filter @actspace/agent-core test -- src/llm/test/convert.test.ts src/engine/test/loop.test.ts src/kairos/test/env.test.ts`
  - 该命令按当前 vitest 配置实际跑完整个 `agent-core` 测试包：88 files / 633 tests 全部通过。
- `pnpm --filter @actspace/shared typecheck`
- `pnpm --filter @actspace/agent-core typecheck`
- `pnpm --filter @actspace/desktop typecheck`

### 设计备注

- 提示词用于降低模型一次性塞入超长 `write_file.content` 的概率。
- `rawStopReason=length` 安全阀用于防止截断场景真实落盘，是本轮的硬兜底。
- 本轮没有新增 `append_file` / chunk 写入协议，保持工具边界小而清晰。
