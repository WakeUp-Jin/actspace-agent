# Plan 3：OpenRouter 模型目录、精选模型与 installed model 管理

状态：已完成（2026-07-25）

依赖：Plan 0-2

产物消费方：Plan 4-6

## 目标

建立 main 进程拥有的模型管理服务：为三家 provider 管理 builtin/curated/用户添加模型，为 OpenRouter 拉取并缓存远端目录，支持搜索、添加、启用、停用和删除，同时产出 resolver 可直接消费的统一 model snapshot。

## 附加必读

- `docs/design-docs/model-context/agent-token-usage-and-context-state.md`
- `docs/design-docs/frontend/front-设置页规范.md`
- `packages/shared/src/model-config.ts`
- `packages/desktop/src/main/settings-service.ts`
- `packages/agent-core/src/usage/cost.ts`
- `packages/agent-core/src/persistence/usage-statistics.ts`

## 允许修改的文件

- `packages/shared/src/model-config.ts`
- `packages/shared/src/openrouter-catalog.ts`（新增，仅放远端响应归一后的共享 view 类型）
- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/model-store-service.ts`（新增）
- `packages/desktop/src/main/openrouter-catalog-service.ts`（新增）
- `packages/desktop/src/main/test/model-store-service.test.ts`（新增）
- `packages/desktop/src/main/test/openrouter-catalog-service.test.ts`（新增）
- `packages/desktop/src/main/settings-service.ts`（只调用已定义的 installed/custom 更新 API）
- 对应设计文档和 history

不得修改 renderer、Composer 或 Agent turn。

## 模型来源规则

| Source | 创建方式 | 可删除 | 可停用 |
| --- | --- | --- | --- |
| builtin | 版本控制的 DeepSeek/Kimi 定义 | 否 | 是 |
| curated | 版本控制的 OpenRouter 精选定义 | 否 | 是 |
| provider-catalog | 用户从 OpenRouter 目录添加 | 是 | 是 |
| custom | 首版只为迁移/内部保留，不开放任意表单入口 | 是 | 是 |

## 任务清单

### 3.1 OpenRouter 精选模型

实现开始时用真实 OpenRouter 目录和固定无隐私探针选择少量模型，覆盖：

- 一个低成本 utility 候选。
- 一个经验证的主 Agent 工具调用候选。
- 一个经验证的 image-capable 候选。

每个精选模型必须：

- 写入 provider-qualified key、apiModel、contextWindow、maxTokens、input 和 pricing。
- 通过 actspace tool call smoke 后才标 `toolUse: verified`。
- 记录目录校验日期和来源，不把易变价格写进注释散文。
- OpenRouter 首次成功连接时安装但不覆盖用户已有 enabled 状态。

若当时目录中没有通过工具 smoke 的候选，只发布 utility/vision 精选，不把未验证模型伪装成 chat 可用。

### 3.2 Catalog fetch 与 cache

`OpenRouterCatalogService`：

- 从 runtime base URL 解析 `/models`。
- 使用 OpenRouter key 和 provider-scoped fetch。
- 超时 15 秒；不自动无限重试。
- 把远端响应归一成 `CatalogModelView`，跳过无 id 的坏条目。
- 缓存到 `<userData>/providers/openrouter/models-cache.json`。
- cache schema 包含 version、fetchedAt、sourceUrl、models、skippedCount。
- 24 小时后标 stale；stale cache 仍可浏览。
- reload 失败保留旧 cache；没有 cache 时返回明确空状态。
- 坏 JSON 移到同目录 `.corrupt-<timestamp>` 后返回空 cache，不删除 installed models。

### 3.3 远端字段归一

目录项至少归一：

- `id`、`name`。
- context length。
- prompt/completion pricing；缺失保持 unknown，不写 0。
- text/image 输入能力。
- tools/reasoning provider 声明。
- free 标识。

远端 tools 声明只能转换为 `toolUse: declared`；未知或缺失为 unknown。

所有远端字符串限制长度、移除控制字符，并始终作为文本渲染。

### 3.4 ModelStoreService

提供 main-only 操作：

```ts
getModelSnapshot(): ModelSnapshot
listInstalledModels(): InstalledModelView[]
addCatalogModel(provider, apiModel): Result
setModelEnabled(modelKey, enabled): Result
removeModel(modelKey): Result
```

- snapshot 合并 builtin、curated、custom definition 与 installed state。
- 用户点击添加后默认 enabled。
- builtin/curated remove 返回不可删除错误。
- 删除被 default/utility/Explore/Kairos 引用的模型时返回 `model_in_use` 和引用列表，不直接删除。
- provider disconnect 不删除 installed state。
- 添加相同 ModelKey 幂等，不重复 addedAt。

### 3.5 Pricing 与 usage 边界

- catalog pricing 进入 ModelDefinition，并记录 catalogUpdatedAt。
- 每次 LLM usage 仍写当次 pricing/cost 快照；目录刷新不得重算历史成本。
- 定义缺失 pricing 时 UI 显示未知，usage cost 不应伪装成免费；成本字段保留 unavailable/unknown 语义。

## 测试要求

- 200、401、429、timeout、proxy error、坏 JSON、空 models、部分坏条目。
- fresh/stale/offline cache 行为和 cache 原子写。
- 远端价格缺失不变成 0；free 标识按 provider 数据明确解析。
- declared/unknown tools 映射正确。
- add 幂等、enable/disable、内置删除拒绝、引用删除拒绝。
- provider disconnect 后 snapshot 仍保留模型，但 resolver 返回 unavailable。
- catalog label/id 中 HTML、控制字符和超长文本被安全裁剪。

## 验证命令

```bash
pnpm --filter @actspace/desktop test -- src/main/test/model-store-service.test.ts src/main/test/openrouter-catalog-service.test.ts
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/shared test
pnpm --filter @actspace/shared typecheck
pnpm check:secrets
```

## 完成标准

- OpenRouter 连接后有少量经过验证的精选模型。
- 用户可以从远端目录添加其他模型，目录失败不破坏本地模型。
- ModelStoreService 产出稳定、可解释的 snapshot。
- enabled/installed/provider/capability 四层状态没有混成单一布尔值。
- 价格与能力来源可追溯，未知值不会被伪造。

## 决策记录

- 2026-07-24：精选模型数量以覆盖角色为准，不追求多；工具能力必须 smoke 后才能 verified。
- 2026-07-24：OpenRouter cache 坏文件移走保留证据，不静默覆盖为新空文件。
- 2026-07-24：删除在用模型由 service 拒绝并返回引用，不让 renderer 自行判断。
