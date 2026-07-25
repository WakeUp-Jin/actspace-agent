# Plan 2：Settings v2、供应商持久化与连接测试

状态：已完成（2026-07-25）

依赖：Plan 0、Plan 1

产物消费方：Plan 3-6

## 目标

把 Electron main 的 settings 持久化升级到 v2，安全保存 OpenRouter Key 和三家 LLM provider 的 Base URL、启用状态、代理配置与连接状态；建立显式 `ProviderRuntimeConfig` 读取入口和统一连接测试，不把敏感配置暴露给 renderer。

## 附加必读

- `docs/SECURITY.md`
- `docs/RELIABILITY.md`
- `docs/design-docs/frontend/front-设置页规范.md`
- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/main/test/settings-service.test.ts`
- `packages/desktop/src/main/index.ts` 中 settings IPC 与 `testProviderConnection`
- `packages/desktop/src/preload/index.ts`

## 允许修改的文件

- `packages/desktop/src/main/settings-service.ts`
- `packages/desktop/src/main/provider-connection-service.ts`（新增）
- `packages/desktop/src/main/test/settings-service.test.ts`
- `packages/desktop/src/main/test/provider-connection-service.test.ts`（新增）
- `packages/desktop/src/main/index.ts`（只接内部 service 生命周期，正式 IPC 留给 Plan 5）
- `packages/shared/src/settings.ts`、`ipc.ts`（只修正 Plan 0 契约遗漏，不改变已锁字段）
- 对应设计文档和 history

不得实现模型目录 UI、Composer 或任务模型运行时。

## settings v2 落盘结构

非敏感 `settings.json`：

```ts
interface PersistedSettingsV2 {
  version: 2;
  providers: Record<ProviderId, ProviderConnectionSettings>;
  installedModels: Record<ModelKey, InstalledModelSettings>;
  customModels: Record<ModelKey, ModelDefinition>;
  taskModels: TaskModelSettings;
  agent: ExistingAgentSettingsWithoutExploreModel;
  kairos: ExistingKairosSettingsWithModelKey;
  plugins: PluginsSettings;
  skills: SkillsSettings;
}
```

`searchProviders` 的 key 继续只落 `secrets.json`，其非敏感配置保持当前结构；不得把搜索 provider 混进 LLM `providers`。

敏感 `secrets.json`：

- 继续保存 base64 密文，不改变 `SecretCrypto` 注入方式。
- `SecretProviderId` 增加 `openrouter`。
- secrets 文件不需要为新增 key 强制升级版本；如果升级，读取必须兼容 version 1。

## 任务清单

### 2.1 幂等 v1 → v2 迁移

- 把 Plan 0 提供的生产 `AppSettings` alias 和 settings IPC result 切换到 v2，并在同一提交中更新 main 读写，避免 shared/desktop 中间态破坏 typecheck。
- 读取 version 1 后构造完整 v2 内存对象。
- 原 `defaultModelId` 映射到 `taskModels.defaultChatModel`。
- 原 `agent.exploreModelId` 映射到 `taskModels.exploreModel`，并从 agent 持久化结构移除。
- 已配置 DeepSeek UI key 时，`taskModels.utilityModel` 映射 DeepSeek Flash；没有则为 null。
- Kairos 现有 modelId 映射为 ModelKey，仍留在 Kairos 设置分区。
- 当前公开 DeepSeek/Kimi 模型写入 installedModels 并 enabled。
- provider 默认 base URL 和 proxy disabled 写入 providers。
- 第一次成功迁移前原子写一次 `<dataRoot>/settings.v1.backup.json`；已有备份不覆盖。
- 解析或写入失败时不覆盖原 settings 文件，返回脱敏错误并继续用安全默认内存配置。

迁移必须重复加载结果一致，不能每次追加模型或刷新 `addedAt`。

### 2.2 Provider 配置读写

`SettingsService` 增加 main-only 方法：

```ts
getProviderRuntimeConfig(providerId): ProviderRuntimeConfig | ProviderRuntimeError
updateProviderConnection(input): Promise<AppSettings>
markProviderConnectionResult(providerId, result): Promise<void>
```

- runtime config 解密 key，合并 Provider Registry 默认值与用户覆盖。
- renderer view 只返回 `hasApiKey` 和非敏感设置。
- Base URL / proxy URL 在 main 解析、规范化并校验 scheme。
- 代理 URL 含凭据时拒绝保存。
- 断开 provider 删除对应 key，把连接状态改为 untested/unavailable，保留 installed/custom models。

### 2.3 连接测试 service

从 `main/index.ts` 抽离现有 `testProviderConnection` 到独立 service，输入 `ProviderRuntimeConfig`，复用 Plan 1 的 provider fetch：

- DeepSeek：现有轻量余额/健康端点。
- Kimi：`/models`。
- OpenRouter：`/models`，不发送 prompt。
- 超时固定 10 秒，可通过测试注入缩短。
- 401/403 → auth；429 → rate_limit；代理连接问题 → proxy；其他网络问题 → network；5xx → server。
- 返回值只包含用户文案、errorKind、status code 和 checkedAt，不包含响应正文、header 或完整代理 URL。
- 测试完成后持久化 lastConnection；修改 key/base URL/proxy 后自动重置为 untested。

### 2.4 env 兼容过渡

- Plan 2 期间保留 DeepSeek/Kimi key 的现有 `applyToEnv()`，防止 Plan 4 前 desktop turn 中断。
- OpenRouter 不新增 env 回写依赖。
- 增加注释和测试，明确 desktop 在 Plan 4 完成后切换显式 runtime；CLI/CI env 入口不受影响。

### 2.5 原子写与并发

- settings 和 secrets 继续 temp file + rename。
- provider 更新、key 更新、connection result 写入必须串行化，避免快速点击导致后写覆盖先写。
- 写失败时内存状态回滚到写前快照，不向 renderer 返回成功假象。

## 测试要求

- 干净安装生成合法 v2。
- v1 迁移保留 default/Explore/Kairos/plugins/skills/agent 设置。
- v1 重复加载不重复写 backup、不改变 addedAt。
- 坏 JSON、未知 version、部分字段缺失均安全回落且不覆盖原文件。
- OpenRouter key 加密落盘，`get()`/JSON/错误结果不含明文。
- provider disconnect 不删除模型定义或历史配置。
- 修改 proxy/base URL 后 connection 状态重置。
- 三家连接测试的 success/auth/rate_limit/proxy/timeout/server 分支由 fake fetch 覆盖。
- 并发更新最终状态确定，写失败回滚。

## 验证命令

```bash
pnpm --filter @actspace/desktop test -- src/main/test/settings-service.test.ts src/main/test/provider-connection-service.test.ts
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/shared test
pnpm --filter @actspace/agent-core test
pnpm check:secrets
```

## 完成标准

- settings v2 可以稳定表达三家 provider、installed/custom models 和 task models。
- 旧用户配置可无损、幂等迁移，并存在一次性 v1 backup。
- main 可以获取显式 ProviderRuntimeConfig，renderer 永远拿不到 key。
- 连接测试使用各自 provider 的代理配置并保存脱敏状态。
- 现有 desktop turn 在 Plan 4 前仍可运行。

## 决策记录

- 2026-07-24：连接状态持久化 checkedAt/errorKind，修改连接参数后重置。
- 2026-07-24：settings v1 首次迁移生成一次备份；不备份解密后的 secrets。
- 2026-07-24：Plan 2 保留 DeepSeek/Kimi env 回写作为短期兼容，Plan 4 完成后删除 desktop 依赖。
