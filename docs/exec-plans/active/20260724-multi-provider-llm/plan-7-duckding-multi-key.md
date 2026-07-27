# Plan 7：DuckDing、供应商额外 Key 与模型级 Key 选择

状态：首版实现完成，待用户自有 DuckDing Key 与真实账单手动验收（2026-07-27）

依赖：Plan 0-5

设计规范：`docs/design-docs/model-context/agent-duckding-multi-key-model-catalog.md`

## 目标

接入 OpenAI-compatible 的 DuckDing provider，并在不迁移、不改变现有单 Key 使用方式的前提下，为供应商增加可选的额外 API Key。只有供应商存在额外 Key 时，模型添加与编辑界面才显示 Key 选择器；模型未绑定额外 Key 时继续使用供应商原来的默认 Key。

## 范围

- 包含：
  - `duckding` ProviderId、默认 Base URL `https://www.duckcoding.ai/v1` 与 OpenAI-compatible runtime。
  - 供应商下额外 Key 的添加、独立连接测试、重命名和删除。
  - 额外 Key 使用 Electron `safeStorage` 加密；renderer 只接收稳定 id、label 和连接状态。
  - `InstalledModelSettings.credentialId?: string`；缺省继续使用现有 provider 默认 Key。
  - DuckDing 手动添加模型；添加/编辑模型时只选择已经在供应商下添加的 Key，不允许输入 Key。
  - 公共模型元数据目录以 `models.dev/api.json` 为主源、OpenRouter 公共 `/models` 为补充，不依赖用户配置 OpenRouter。
  - 用户只输入模型名；命中公共目录时自动带入上下文、输出限制、图片、工具调用、推理和基础价格。
  - 默认 Key 与每把额外 Key 保存独立价格倍率，运行时费用为“模型基础价 × 当前 Key 倍率”。
  - 被模型引用的额外 Key 删除保护。
  - main runtime 按模型 binding 解析有效 Key，额外 Key 缺失时明确报错，不静默回退默认 Key。
  - IPC、preload、renderer、测试、设计文档和 history 同步。
- 不包含：
  - Key 轮询、随机路由、限流切换或失败自动 fallback。
  - DuckDing 远端模型目录同步、余额查询和 Management Key。
  - 把 OpenRouter/xAI 的价格声明成 DuckDing 官方价格；UI 必须标注为公共目录基础价与本地倍率估算。
  - 任意自定义供应商或把 Base URL / 代理拆成 Key 级配置。

## 兼容策略

- `secrets[provider]` 继续保存默认 Key，现有 DeepSeek、Kimi、OpenRouter 数据不迁移、不重加密。
- `secrets.providerCredentials["<provider>:<credentialId>"]` 只保存新增额外 Key 密文。
- `ProviderConnectionSettings.additionalCredentials` 只保存非敏感 id、label、倍率和连接状态。
- provider 默认 Key 的倍率缺省 `1`；额外 Key metadata 保存各自倍率，均不影响密钥加密边界。
- `InstalledModelSettings.credentialId` 缺省表示默认 Key；只有显式选择额外 Key 才写入。
- 单 Key provider 的现有 UI、runtime 和可用性判断保持原样。

## 实施步骤与验证

### 7.1 共享契约与 resolver

- 扩展 ProviderId、Provider Registry、settings、model snapshot 和 IPC。
- resolver 对默认 Key 继续使用 provider availability；绑定额外 Key 时增加 credential 可用性检查。
- 验证：shared model/config/settings/resolver 定向测试。

### 7.2 Settings 与加密密钥

- SettingsService 增加额外 Key CRUD、动态 secret 读写和按 credential 获取 runtime。
- 删除额外 Key 前扫描 installed model 引用；写失败回滚 settings/secrets。
- 验证：默认 Key 不迁移、额外 Key 不进 renderer/settings 明文、引用删除保护、坏 credential 明确失败。

### 7.3 模型与运行时

- 新增公共 `ModelMetadataCatalogService`，匿名读取 models.dev/OpenRouter，原子缓存并提供按 id/name/alias 搜索。
- ModelStoreService 支持 DuckDing 手动模型添加、目录元数据快照与 credential binding 更新。
- ModelRuntimeService 依据 `credentialId` 选择 runtime，并把对应倍率应用到本次 resolved definition 的价格快照；默认路径保持现有 provider runtime。
- `ModelPricing` 补缓存写入单价；Usage cost 使用真实 cache-write token 计算。
- 验证：默认 Key、额外 Key、缺失 Key、失效 Key、utility/Explore/Kairos 解析测试。

### 7.4 IPC 与设置页

- 服务商编辑弹窗中管理额外 Key；API Key 不回显。
- 模型页增加 DuckDing 手动添加入口；只有该 provider 存在额外 Key 时显示 Key 下拉。
- 已添加 DuckDing 模型允许修改绑定；单 Key provider 不显示选择器。
- 视觉延续当前紧凑设置页，使用现有主题语义 token，不新增全局 CSS。
- 验证：renderer 测试覆盖单 Key 隐藏、多 Key 显示、只能选择已有 Key、删除引用提示和焦点/键盘基本路径。

### 7.5 文档与收尾

- 更新多供应商设计、设置页规范、Security、当前模块图和 history。
- 若学习沉淀检查命中至少两项，新增 `docs/learnings/2026-07/` 文档。
- 验证：`pnpm check:docs`、`pnpm check:secrets`、主题防回流检查。

## 风险与缓解

| 风险 | 缓解方式 |
| --- | --- |
| 额外 Key 明文进入普通设置或 IPC | settings 只存 metadata；secret 嵌套映射仍走 safeStorage 密文；序列化测试扫描明文 |
| 删除 Key 后模型静默改走默认账户 | 删除前阻止并返回引用模型；runtime 遇到缺失 binding 明确不可用 |
| provider 级 lastConnection 错误阻塞有效额外 Key | 默认 Key 沿用 provider 状态；绑定额外 Key 的模型使用该 credential 独立状态 |
| ProviderId 扩展破坏余额 exhaustive switch | `BalanceProviderId` 继续只包含真实支持余额的 provider；DuckDing UI 不渲染余额条 |
| 公共目录与 DuckDing 实际限额/价格存在偏差 | 能力与基础价记录 metadata source；价格展示为估算，Key 倍率由用户维护，不宣称 DuckDing 官方价 |
| 同名模型在多个公共 provider 下出现 | 精确 id 优先；多个候选时让用户选择 metadata reference，不静默挑价格不同的条目 |

## 验证命令

```bash
pnpm --filter @actspace/shared test
pnpm --filter @actspace/shared typecheck
pnpm --filter @actspace/agent-core test
pnpm --filter @actspace/agent-core typecheck
pnpm --filter @actspace/desktop test
pnpm --filter @actspace/desktop typecheck
pnpm build
pnpm check:frontend-theme
pnpm check:docs
pnpm check:secrets
```

## 手工验收边界

- 自动化覆盖持久化、密钥选择、IPC 和 renderer 状态。
- Electron 真实链路需要使用用户自己的 DuckDing Key 完成最小连接测试与至少一次 `chat.completions`；本任务不写入或伪造真实 Key。
- 浅色、深色、跟随系统下检查额外 Key 列表、模型下拉、错误提示和焦点可见性。

## 进度记录

- [x] 方案确认：单 Key 零感知，多 Key 才显示模型 Key 选择器。
- [x] 正式设计规范与执行计划落盘。
- [x] shared/settings/runtime 实现。
- [x] renderer 实现。
- [x] 定向自动化测试与文档收尾。
- [x] Electron main、preload、renderer 启动链路验证；窗口点击因本机锁屏未执行。
- [ ] 用户自有 DuckDing Key 的真实连接、模型调用和账单倍率验收。

## 决策记录

- 2026-07-27：不把现有 provider Key 迁移成 credential profile；它继续作为默认 Key。
- 2026-07-27：额外 Key 只能在供应商页添加，模型页只允许选择。
- 2026-07-27：模型缺省 `credentialId` 动态继承默认 Key；额外 Key 被引用时禁止删除，不做静默 fallback。
- 2026-07-27：公共模型目录独立于 OpenRouter 连接，以 models.dev 为主、OpenRouter 公共目录为补充；DuckDing Key 保存倍率，Usage 使用基础价乘倍率后的快照。
