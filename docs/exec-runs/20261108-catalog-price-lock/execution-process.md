# 模型目录价格锁定与删除运行时刷新 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261108-catalog-price-lock.md`
- **执行模式**：交互
- **开始时间**：2026-11-08 10:30
- **结束时间**：2026-11-08 11:10

## 执行时间线

### 步骤 1：设计文档

- **操作**：删掉「本地更新与性能」一节和数据流图里的后台 worker 分支，新增「目录生成规则（2026-11-08）」。
- **影响文件**：`docs/design-docs/model-context/agent-model-catalog-and-usage-cost.md`

### 步骤 2：合并规则与改价清单（T1、T2）

- **操作**：新增纯函数 `mergeModelCatalog` 和空的改价清单 `MODEL_CATALOG_PRICE_OVERRIDES`；类型 `ModelCatalogPriceOverride` 放在 `model-catalog.ts`。两个新文件只用 type import，生成脚本单独转译加载，不从 shared 根入口导出（运行时用不到）。
- **决定**：已有条目整条锁定，不只锁价格，符合“已存在就不改”。上游重复 key 只取第一条。
- **验证**：`model-catalog-merge.test.ts` 6 个用例通过。

### 步骤 3：生成脚本（T3）

- **操作**：脚本读旧目录 → 拉取 → 合并 → 打印报告；内容不变时不写文件、`generatedAt` 不变；`--offline` 只应用改价清单；输出一行一个模型。
- **验证**：`--offline` 连跑两次，第一次只改格式，第二次“无变化，未写入”；格式改写前后解析出的 JSON 完全一致。格式改写单独提交（b458bf1c）。

### 步骤 4：删除运行时刷新（T4）

- **操作**：删除 `model-catalog-service.ts`、`model-catalog-worker.ts` 及其测试，tsconfig worker 入口；`index.ts` 不再创建服务，`ModelStoreService` / `ModelRuntimeService` 使用默认的 `BUILTIN_MODEL_CATALOG`；删除两个 IPC channel、contract、handler、mock 和 `ModelCatalogStatus`；`verify-usage-runtime.mjs` 去掉刷新压测段落。
- **验证**：shared / desktop typecheck 通过；`pnpm check:ipc-channels`（142 个 channel）与 `test:ipc-channels` 通过；shared 224 个测试、desktop main 616 个测试通过；`pnpm check:docs`、`check:hot-path-reads` 通过。

### 步骤 5：按新规则联网生成一次（T5）

- **操作**：`pnpm models:generate`（走本地代理）。
- **结果**：共 677 条；新增 123，保留 554，上游改价但已锁定 113，上游已下架但保留 80，改价清单覆盖 0。diff 只有 123 行新增和头部的 `generatedAt` / `contentHash`，没有删除或改价。
- **验证**：shared 测试再跑一遍通过。提交 f4bfc1fd。

## 本次生成报告（官方服务商部分）

OpenRouter 部分（新增 103、锁定 85、下架 69）较长，不逐条列出，重新运行 `pnpm models:generate` 可以看到完整报告。

### 新增（models.dev，20 条）

```text
  models.dev/anthropic/claude-haiku-5-5
  models.dev/anthropic/claude-opus-5-5
  models.dev/anthropic/claude-sonnet-5-5
  models.dev/deepseek/deepseek-flash
  models.dev/minimax-cn/MiniMax-M3.1-Flash
  models.dev/minimax/MiniMax-M3.1-Flash
  models.dev/moonshotai-cn/kimi-k3.1-pro
  models.dev/moonshotai-cn/kimi-k3.1-pro-highspeed
  models.dev/moonshotai/kimi-k3.1-pro
  models.dev/moonshotai/kimi-k3.1-pro-highspeed
  models.dev/openai/gpt-6-luna
  models.dev/openai/gpt-6-sol
  models.dev/openai/gpt-6.1-sol
  models.dev/openai/gpt-6.1-terra
  models.dev/openai/gpt-daybreak-blue-latest
  models.dev/openai/gpt-daybreak-red-latest
  models.dev/xai/grok-4.7
  models.dev/xai/grok-imagine-video-1.5-lite
  models.dev/zhipuai/glm-4.6v-flash
  models.dev/zhipuai/glm-5.3-flashx
```

### 上游价格变了，已锁定（models.dev，28 条）

格式：旧价（仍在使用）→ 上游新价。单价为 USD / 百万 token，依次为输入 / 输出 / 缓存读 / 缓存写。要采用新价，写进 `model-catalog-overrides.ts` 并附来源链接。DeepSeek 官方端点按 `deepseek-model-facts.ts` 固定高峰价计费，不受这里影响。

```text
  models.dev/deepseek/deepseek-v4-flash: in 0.14 / out 0.28 / cache r 0.0028 w - → in 0.15 / out 0.6 / cache r 0.003 w -
  models.dev/deepseek/deepseek-v4-flash-vision-exp: in 0.14 / out 0.28 / cache r 0.0028 w - → in 0.15 / out 0.6 / cache r 0.003 w -
  models.dev/deepseek/deepseek-v4-pro: in 0.435 / out 0.87 / cache r 0.003625 w - → in 0.66 / out 1.98 / cache r 0.022 w -
  models.dev/minimax-cn/MiniMax-M2: in 0.3 / out 1.2 / cache r - w - → in 0.3137 / out 1.2549 / cache r 0.0314 w 0.3922
  models.dev/minimax-cn/MiniMax-M2.1: in 0.3 / out 1.2 / cache r 0.03 w 0.375 → in 0.3137 / out 1.2549 / cache r 0.0314 w 0.3922
  models.dev/minimax-cn/MiniMax-M2.5: in 0.3 / out 1.2 / cache r 0.03 w 0.375 → in 0.3137 / out 1.2549 / cache r 0.0314 w 0.3922
  models.dev/minimax-cn/MiniMax-M2.5-highspeed: in 0.6 / out 2.4 / cache r 0.06 w 0.375 → in 0.6275 / out 2.5098 / cache r 0.0314 w 0.3922
  models.dev/minimax-cn/MiniMax-M2.7: in 0.3 / out 1.2 / cache r 0.06 w 0.375 → in 0.3137 / out 1.2549 / cache r 0.0627 w 0.3922
  models.dev/minimax-cn/MiniMax-M2.7-highspeed: in 0.6 / out 2.4 / cache r 0.06 w 0.375 → in 0.6275 / out 2.5098 / cache r 0.0627 w 0.3922
  models.dev/minimax-cn/MiniMax-M3: in 0.3 / out 1.2 / cache r 0.06 w - → in 0.3137 / out 1.2549 / cache r 0.0627 w -
  models.dev/minimax/MiniMax-M2.5-highspeed: in 0.6 / out 2.4 / cache r 0.06 w 0.375 → in 0.6 / out 2.4 / cache r 0.03 w 0.375
  models.dev/moonshotai-cn/kimi-k2.6: in 0.95 / out 4 / cache r 0.16 w - → in 0.9711 / out 4.0337 / cache r 0.1643 w -
  models.dev/moonshotai-cn/kimi-k2.7-code: in 0.95 / out 4 / cache r 0.19 w - → in 0.9711 / out 4.0337 / cache r 0.1942 w -
  models.dev/moonshotai-cn/kimi-k2.7-code-highspeed: in 1.9 / out 8 / cache r 0.38 w - → in 1.9421 / out 8.0673 / cache r 0.3884 w -
  models.dev/moonshotai-cn/kimi-k3: in 3 / out 15 / cache r 0.3 w - → in 2.9879 / out 14.9395 / cache r 0.2988 w 2.9879
  models.dev/moonshotai/kimi-k3: in 3 / out 15 / cache r 0.3 w - → in 3 / out 15 / cache r 0.3 w 3
  models.dev/zhipuai-coding-plan/glm-4.6v: in 0.3 / out 0.9 / cache r - w - → in 0 / out 0 / cache r 0 w 0
  models.dev/zhipuai/glm-4.5-air: in 0.2 / out 1.1 / cache r 0.03 w 0 → in 0.11952 / out 0.89637 / cache r 0.0239 w 0
  models.dev/zhipuai/glm-4.5v: in 0.6 / out 1.8 / cache r - w - → in 0.29879 / out 0.89637 / cache r 0.05976 w 0
  models.dev/zhipuai/glm-4.6v: in 0.3 / out 0.9 / cache r - w - → in 0.1494 / out 0.44819 / cache r 0.02988 w 0
  models.dev/zhipuai/glm-4.7: in 0.6 / out 2.2 / cache r 0.11 w 0 → in 0.44819 / out 2.09153 / cache r 0.08964 w 0
  models.dev/zhipuai/glm-4.7-flashx: in 0.07 / out 0.4 / cache r 0.01 w 0 → in 0.0747 / out 0.44819 / cache r 0.01494 w 0
  models.dev/zhipuai/glm-5: in 1 / out 3.2 / cache r 0.2 w 0 → in 0.59758 / out 2.68911 / cache r 0.1494 w 0
  models.dev/zhipuai/glm-5.1: in 1.4 / out 4.4 / cache r 0.26 w 0 → in 0.89637 / out 3.58548 / cache r 0.19421 w 0
  models.dev/zhipuai/glm-5.2: in 1.4 / out 4.4 / cache r 0.26 w 0 → in 1.19516 / out 4.18306 / cache r 0.29879 w 0
  models.dev/zhipuai/glm-5.3: in 1.4 / out 4.4 / cache r 0.26 w 0 → in 1.19516 / out 4.18306 / cache r 0.29879 w 0
  models.dev/zhipuai/glm-5.3-flash: in 0.075 / out 0.25 / cache r 0.015 w 0 → in 0.11952 / out 0.41831 / cache r 0.03436 w 0
  models.dev/zhipuai/glm-5v-turbo: in 5 / out 22 / cache r 1.2 w 0 → in 0.74698 / out 3.28669 / cache r 0.17927 w 0
```

### 上游已下架，保留（models.dev，11 条）

```text
  models.dev/openai/gpt-5.2-chat-latest
  models.dev/openai/gpt-5.3-chat-latest
  models.dev/openai/gpt-image-1
  models.dev/xai/grok-imagine-image-2.0
  models.dev/xai/grok-imagine-image-quality
  models.dev/zhipuai-coding-plan/glm-4.7
  models.dev/zhipuai-coding-plan/glm-5-turbo
  models.dev/zhipuai-coding-plan/glm-5.1
  models.dev/zhipuai-coding-plan/glm-5.2
  models.dev/zhipuai-coding-plan/glm-5.2-highspeed
  models.dev/zhipuai-coding-plan/glm-5v-turbo
```

## 遇到的问题

- 无。
