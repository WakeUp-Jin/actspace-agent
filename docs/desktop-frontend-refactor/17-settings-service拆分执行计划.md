# 17 settings-service 拆分执行计划

> 状态：**待批准**。本文只是计划，代码未改动。
> 总计划：[00 总执行计划](00-总执行计划.md)。执行顺序第 9 位，也是最后一位，排在 09 之后（C2 已拍板）。
> 设计来源：[01 安全与 IPC 收口](01-安全与IPC收口.md) 的 P1-4 和 S8。
> 执行记录：`docs/exec-runs/20261005-desktop-fe-17-settings-split/`。
> 路径缩写：`M` = `apps/desktop/src/main`。行号基于 2026-10-05；11、13 会改到 IPC 注册，但不会动 settings-service 本体，行号预计基本不变。动手前仍要重新定位。

## 目标

把 2637 行的 `M/settings-service.ts` 按职责拆到 `M/settings/` 下，`SettingsService` 只保留门面。

**本计划是纯搬迁**：
- 读写的文件格式、迁移结果、回滚语义、写 env 的时机全部不变；
- 对外 API（类名、方法签名、导出的类型和错误类）不变。

## 范围

### 包含

- 拆分模块。
- 拆分前补上缺失的特征测试：v1 迁移、legacy 解密、回滚、写入串行。

### 不包含

| 项 | 原因 |
| --- | --- |
| `applyToEnv` 退役（01 S7 / C1） | 已拍板：以后单独设计。本计划原样搬迁，调用点和次数都不变 |
| 把 `validateCustomConnection`、`resolveAuthScheme` 等移进 `@actspace/shared`（01 P1-4 的建议） | 目前 renderer 和 CLI 都不使用；移进 shared 会改变包边界，等真正有复用需求时再做 |
| 删除 v1 / v2 迁移代码 | 01 已建议：保留迁移代码，但冻结 |
| 改 settings 的 IPC 接口 | 13 已经把它纳入契约，本计划不改 |

## 背景（2026-10-05 核实）

### 文件结构（`M/settings-service.ts`，2637 行）

| 区域 | 行号 | 内容 |
| --- | --- | --- |
| 类型和常量 | :74-276 | `ProviderRuntimeConfig`、`SettingsServiceOptions`、`SecretCrypto`、错误类 `ProviderSettingsError` / `SettingsRevisionConflictError`、`PersistedSettingsV3`、`PersistedSecrets*`、文件名常量（:114-122）、`SEARCH_PROVIDER_ENV_KEYS`（:270） |
| `class SettingsService` 的公开方法 | :277-1252 | 包括 load、get、update、`updateProviderConnection` / `removeProvider`、custom connection 的 CRUD（:793-913）、图片生成、OpenRouter、system prompt（:1142 / :1150）、provider key、搜索用量（:1211） |
| `class SettingsService` 的私有方法 | :1254-1505 | `applyToEnv`（约 :1307）、`readSettingsFile` / `readSecretsFile` / `writeSettingsFile` / `writeSecretsFile`、`restoreFilesBestEffort`（:1453）、`decryptLegacySecrets`、`ensureAgentSystemPromptFile`、`mutationTail` 串行队列（:288、:1501-1502） |
| secrets 解析 | :1507-1573 | `parseSecretsV1/V2`、`parseSecretFields` |
| 默认值、v3/v4 转换 | :1574-1803 | `defaultSettingsFromEnv`、`metadataFromSettingsV3/V4`、`toSettingsV4`、`legacySettingsFromV4` |
| 解析和迁移 | :1804-2075 | `parseSettingsV4`、`applySettingsV4NamespacePatch`、`computeSettingsRevision`、`migrateV1Settings`（:2014）、`mergePersistedSettingsV3`、`hasRemovedDuckCodingSettings` |
| sanitize 和 normalize | :2076-2534 | 约 50 个纯函数；其中 custom connection 相关的在 :2286-2453 |
| IO | :2535-2597 | `setOrDeleteEnv`、`writeJsonAtomic`、`writeTextAtomic`、`writeBackupOnce`、`writeSettingsV2/V3Backup`、`writeVerifiedBackup` |
| 通用工具 | :2598-2637 | `cloneJson`、`isRecord`、`isNotFoundError`、`sanitizeSpeechSettings` 等 |

### 调用方

- **只用类型的**：`speech-playback.ts`、`model-store-service.ts`、`model-runtime-service.ts`、`runtime-v2/{english-learning-ipc,custom-connection-probe,fixed-renderer-ipc}.ts`。
- **构造实例的**：`M/index.ts`。
- `projection-ipc.ts` 在 10 中删除。

### 现有测试

| 文件 | 用例数 | 覆盖 |
| --- | --- | --- |
| `test/runtime-v2-settings-migration.test.ts` | 9 | v2 / v3 → v4 的备份与发布、冲突备份、陈旧 revision、settings 文件损坏时阻止启动、模型别名迁移 |
| `test/custom-connection-protocol.test.ts` | 16 | custom connection |
| `test/english-learning-settings.test.ts` | 1 | |
| `test/runtime-v2-provider-network-service.test.ts` | | 间接覆盖 |

**没有覆盖的**：
- v1 → v4 迁移（`migrateV1Settings`）；
- legacy secrets 解密（`decryptLegacySecrets`、`parseSecretsV1`）；
- `restoreFilesBestEffort` 回滚（写 secrets 成功、写 settings 失败时恢复两者）；
- `mutationTail` 串行（并发 update 不交错）；
- `applyToEnv` 写入的 env 键。

## 决策记录

| 日期 | 决定 | 原因 |
| --- | --- | --- |
| 2026-10-05 | 先补特征测试（T1），再搬代码；测试只断言现有行为，即使现有行为看起来不合理也照录，并在执行记录中标注 | 纯搬迁的安全网 |
| 2026-10-05 | `M/settings-service.ts` 保留为 barrel：再导出 `SettingsService`、类型和错误类。调用方的 import 路径不改 | 7 个调用方，改 import 只是噪音 |
| 2026-10-05 | 类内状态（当前 settings、secrets、`mutationTail`、监听器）收进 `SettingsStore`（`M/settings/store.ts`），只有它负责「读文件、写文件、串行、回滚」；`SettingsService` 的各组方法拆成按领域划分的 facade 函数，接收 store 作为参数，再由类的方法转调 | 回滚和串行必须集中在一处；facade 拆分可以逐组进行、逐组验证 |
| 2026-10-05 | 模块目录用 `M/settings/`，文件按下表划分；01 P1-4 原表中的 `settings-store` 和 `secrets-store` 合并为 `store.ts` 加 `secrets-file.ts` | 两者共用同一套回滚逻辑，分开会在模块之间传递半写入状态 |

## 目标结构

```text
M/settings/
  types.ts               ← 持久化类型、错误类、SettingsServiceOptions、SecretCrypto（:74-276）
  constants.ts           ← 文件名、默认值常量、SEARCH_PROVIDER_ENV_KEYS
  utils.ts               ← cloneJson、isRecord、isNotFoundError、isAlreadyExistsError、isDefined
  atomic-io.ts           ← writeJsonAtomic、writeTextAtomic、writeBackupOnce、writeVerifiedBackup、writeSettingsV2/V3Backup
  secrets-file.ts        ← parseSecretsV1/V2、parseSecretFields、emptySecrets、unavailableSecrets、legacy 解密（纯函数部分）
  sanitize.ts            ← 通用 sanitize / normalize（不含 custom connection）
  custom-connection.ts   ← :2286-2453 的校验、认证推导、模型补丁
  migrations.ts          ← migrateV1Settings、mergePersistedSettingsV3、metadataFrom*、toSettingsV4、legacySettingsFromV4、parseSettingsV4、hasRemovedDuckCodingSettings（文件头写明「冻结，最早支持 v1」）
  defaults.ts            ← defaultSettingsFromEnv、defaultSettingsV4Metadata 等
  store.ts               ← SettingsStore：内存状态、读写文件、mutationTail、restoreFilesBestEffort、变更通知
  env.ts                 ← applyToEnv、applyProviderKey、setOrDeleteEnv（原样搬迁，以后退役）
  system-prompt-file.ts  ← system prompt 的读写和 ensure
  facades/
    providers.ts         ← provider 连接、credential、key 的 CRUD
    custom-connections.ts
    media.ts             ← 图片生成、语音
    search.ts            ← 搜索 key 和用量
    general.ts           ← update、updateQuickOpenShortcut、v4 namespace patch、模型存储
  service.ts             ← class SettingsService：构造 store，方法转调 facade
M/settings-service.ts    ← barrel
```

每个文件不超过 500 行。`migrations.ts` 和 `sanitize.ts` 如果超出，可以再按代际或领域拆一次。

## 实施步骤

每个 T 一个提交；**每一步之后**都跑「验证方式」中的全部命令。

| # | 文件 | 改动 | 测试 / 验证 |
| --- | --- | --- | --- |
| T0 | 执行记录 | 重新定位上文的行号；列出所有 `applyToEnv` 调用点（目前 10 处）和它写入的 env 键；列出 `restoreFilesBestEffort` 的调用点（目前 6 处） | 只记录 |
| T1 | 新增 `M/test/settings-characterization.test.ts` 和 `M/test/fixtures/settings/{v1,v2,v3,v4}.json`、`secrets-v1-legacy.json` | 特征测试：v1、v2、v3、v4 样本经 load 后的 `get()` 和写回的文件快照；legacy secrets 经注入的 `SecretCrypto` 解密的结果；注入一个第二次调用就失败的 `AtomicJsonWriter`，断言 settings 和 secrets 都恢复到写入前的内容；两个并发 update 的结果顺序；load 后 `process.env` 中目标键的取值（测试前后快照，并恢复 env） | 新测试全部通过（针对的是现有代码） |
| T2 | 新增 `settings/{types,constants,utils}.ts` | 搬迁类型、常量和工具函数；原文件改为从这些模块 import；错误类经 barrel 再导出 | typecheck；全部 settings 测试 |
| T3 | 新增 `settings/atomic-io.ts`、`settings/secrets-file.ts` | 搬迁 IO 和 secrets 解析的纯函数 | 同上 |
| T4 | 新增 `settings/sanitize.ts`、`settings/custom-connection.ts` | 搬迁 sanitize 和 normalize 函数 | 同上，另加 `custom-connection-protocol.test.ts` |
| T5 | 新增 `settings/defaults.ts`、`settings/migrations.ts` | 搬迁默认值和迁移代码，文件头加冻结说明 | 同上，另加 T1 的 v1–v4 快照 |
| T6 | 新增 `settings/store.ts`、`settings/env.ts`、`settings/system-prompt-file.ts` | 类的私有状态和私有方法搬进 `SettingsStore`；`applyToEnv` 原样搬进 `env.ts`，调用时机不变；`SettingsService` 内部持有一个 store | 同上，另加 T1 的回滚、串行、env 用例 |
| T7 | 新增 `settings/facades/*.ts`、`settings/service.ts`；`M/settings-service.ts` 改为 barrel | 公开方法逐组搬迁（每组一个提交，共 5 个）；类的方法只做转调 | 每组之后跑全量 main 测试；完成后 `wc -l M/settings/**/*.ts`，每个文件不超过 500 行；`M/settings-service.ts` 不超过 30 行 |
| T8 | `docs/ARCHITECTURE.md`（main 模块段）、01、`docs/exec-plans/tech-debt-tracker.md` | 记录新结构；01 的 P1-4 标注「已在 17 执行」；技术债中 `applyToEnv` 条目补充「已集中到 `settings/env.ts`」 | `pnpm check:current-docs` |

## 验证方式

```bash
pnpm --filter @actspace/desktop typecheck
pnpm --filter @actspace/desktop test
pnpm --filter @actspace/desktop build
```

**纯搬迁核对**：T7 完成后，用 `git diff --stat` 对照，新增行数与删除行数大致相当。对每个新文件，抽查它的函数体与原位置逐字一致，结论写进执行记录。

### Electron 检查

方法见 00「能做的验收」。用一个临时的 `ACTSPACE_DATA_DIR` 启动：

1. 放入 v3 样本，启动后 `settings.json` 被迁移到 v4，备份文件存在；
2. 在设置页添加一个 custom connection，重启后仍然存在；
3. 设置一个搜索 key，重启后仍然存在。

## 风险

| 风险 | 缓解 |
| --- | --- |
| 回滚语义被破坏：只恢复了一个文件 | T1 的特征测试；回滚只存在于 `store.ts` 一处 |
| `mutationTail` 被拆开，出现并发写入交错 | 串行队列只在 store 中；T1 的并发用例 |
| `applyToEnv` 的调用时机改变，导致子进程拿到的 key 变了 | 原样搬迁；T1 的 env 快照用例 |
| 用户真实数据被损坏 | 所有测试和 Electron 检查都用临时数据目录；不读写 `~/Library/Application Support` |
| 循环依赖（facade 与 store 互相 import） | facade 只依赖 store 和纯函数模块，store 不 import facade；typecheck 和构建把关 |

**回滚**：T2–T7 每一步都可以单独 revert；T1 的测试保留。

## 进度记录

- [ ] T0–T8

## 执行模式

连续执行（见 00）。T1 的特征测试如果揭示了现有 bug，**不在本计划修**：记录到技术债，测试照录现有行为。

## 执行文档

`docs/exec-runs/20261005-desktop-fe-17-settings-split/`：`execution-process.md`、`execution-summary.md`、`acceptance-handoff.md`。

验收重点：
- 设置读写；
- 迁移和重启后数据不丢；
- custom connection；
- 搜索和图片生成 key 正常生效（这依赖 env）。
