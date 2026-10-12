# 17 settings-service 拆分 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261005-desktop-frontend-refactor/17-settings-service拆分执行计划.md`
- **执行模式**：交互，连续执行（00 §3）
- **分支**：`refactor/desktop-fe-17`，从 `refactor/desktop-frontend@cd325f96`（09 的 squash）拉出
- **开始时间**：2026-10-07 08:40
- **结束时间**：2026-10-07 09:46

路径缩写：`M/` = `apps/desktop/src/main/`。

## 执行时间线

### T0：重新定位与基线

**补登 09**：09 的 squash `cd325f96` 填进 09 的交接和 00 §11；子分支范围 `7f320f46`..`f809a103`（41 个提交）。用户对 09 交接 P4 的两项判断已拍板（2026-10-07）：第 1 项（新建 Chat 会话的运行目标行）选 A，第 2 项（非 Git 仓库时的「新建工作树」）选 A，都维持现状、不改代码。已写进 09 的交接、摘要、history 和计划的决策记录；两份规范本来就和现状一致，没有改。

**基线**：desktop 测试文件 191 / 0 / 1，用例 1509 / 0 / 2。`M/settings-service.ts` 2637 行，顶层 `export` 13 个。

**行号重新定位**：计划里的行号（2026-10-05）全部仍然准确，10–16、09 都没有动这个文件。抽查：

| 计划中的位置 | 现在 |
| --- | --- |
| 类型和常量 :74-276，文件名常量 :114-122，`SEARCH_PROVIDER_ENV_KEYS` :270 | 一致 |
| `class SettingsService` :277；`mutationTail` :288、:1501 | 一致 |
| system prompt :1142 / :1150，搜索用量 :1211 | 一致 |
| `applyToEnv` 约 :1307，`restoreFilesBestEffort` :1453 | :1307 / :1453 |
| secrets 解析 :1507，默认值 :1574，`parseSettingsV4` :1804，`migrateV1Settings` :2014 | 一致 |
| sanitize :2076，custom connection :2286-2453，IO :2535，通用工具 :2598 | 一致 |

**调用方**（import 路径都是 `./settings-service` 或 `../settings-service`，T7 后 barrel 保持不变）：

- 只用类型：`speech-playback.ts`、`model-store-service.ts`、`model-runtime-service.ts`（另用 `ProviderRuntimeError`）、`runtime-v2/{english-learning-ipc,custom-connection-probe,fixed-renderer-ipc}.ts`；
- 构造实例：`index.ts`（`SettingsService`、`SecretCrypto`）；
- 测试：`custom-connection-protocol.test.ts`（16 条）、`runtime-v2-settings-migration.test.ts`（9 条）、`english-learning-settings.test.ts`（1 条）。`runtime-v2-provider-network-service.test.ts`（9 条）不直接 import。

**`applyToEnv` 调用点**（10 处，和计划一致）：

| 行 | 所在方法 |
| --- | --- |
| :352 | `load` |
| :387 | `applyNamespaceV4`（私有） |
| :539 | `update` |
| :597 | `updateV2` |
| :673 | `updateProviderConnection` |
| :702 | `removeProvider` |
| :944 | `updateImageGeneration` |
| :1200 | `clearProviderKey` |
| :1274 | `setSearchProviderKey`（私有） |
| :1293 | `clearSearchProviderKey`（私有） |

**`applyToEnv` 写入的 env 键**（:1307-1317，按执行顺序）：

1. 删除 `DEEPSEEK_API_KEY`、`KIMI_API_KEY`（LLM 凭据只留在 main，不进 env）；
2. 搜索 key：`ZHIPU_API_KEY`、`TAVILY_API_KEY`、`TINYFISH_API_KEY`、`EXA_API_KEY`，有值就写，没有就删（`applyProviderKey` → `setOrDeleteEnv`）；
3. 总是写：`IMAGE_GENERATION_BASE_URL`、`IMAGE_GENERATION_MODEL`、`ACTSPACE_DISABLED_TOOLS`（逗号连接）、`ACTSPACE_BASH_ALWAYS_ASK`（`"1"` / `"0"`）；
4. 有值就写、`null` 就删：`LLM_TEMPERATURE`、`LLM_MAX_TOKENS`；
5. 最后调用注入的 `reloadEnv()`。

另外，`defaultSettingsFromEnv`（:1594-1599）在没有 settings 文件时**读**这些 env 作为默认值。T1 的 env 用例要把这些键在测试前后快照并恢复。

**`restoreFilesBestEffort` 调用点**（5 处调用 + :1453 定义 = 计划写的「6 处」，不算差异）：

| 行 | 所在方法 |
| --- | --- |
| :678 | `updateProviderConnection` |
| :707 | `removeProvider` |
| :949 | `updateImageGeneration` |
| :989 | `addProviderCredential` |
| :1054 | `removeProviderCredential` |

五处都是 `if (secretsWritten) await this.restoreFilesBestEffort(previousSettings, previousSecrets);`：只有 secrets 已经写成功、后面的 settings 写失败时才回滚两个文件。

- **影响文件**：本文件；`docs/histories/2026-10/20261007-0840-desktop-fe-17-settings-split.md`（新增）；09 的交接、摘要、history、计划决策记录；00 §11。
- **验证**：只记录，没有代码改动。

### T1：特征测试

- **新增**：
  - `M/test/settings-characterization.test.ts`（28 条）；
  - 样本 `M/test/fixtures/settings/{v1,v2,v3,v4}.json`、`secrets-v1-legacy.json`；
  - 快照 `M/test/fixtures/settings/expected/*.json`（6 份）。
- **样本**：v1–v3 手写，每份都带非默认值（v1 的旧模型 id、小数 maxTokens、重复的 skill；v2 的旧 DeepSeek Anthropic 地址、代理、额外 key；v3 的 customLabel 带空格）。v4 由 v3 样本经现有代码 load 生成，再改了十来个字段，`systemPromptPath` 改成相对路径。legacy secrets 用测试里的假加密（`enc:` 前缀再 base64）。key 都是假的。
- **覆盖**：
  - **load 快照**：v1–v4 和「没有 settings.json」各一份，记 `get()`、`getV4()`、`getLastLoadError()`、凭据存储状态和数据目录下的全部文件。v1 另外断言备份逐字节等于原文件；v4 断言 load 不重写 settings.json。`revision` 是整份 v4 的哈希，含临时目录的绝对路径，不进快照，只断言是 64 位十六进制。
  - **legacy secrets**：经注入的 `SecretCrypto` 解密 3 条，secrets.json 改写成明文 v2、权限 600；crypto 不可用、解密抛错、解密出空串三种情况下文件不动，凭据状态是 `migration_failed`，之后改 key 被拒。v1 settings 和 legacy secrets 一起时，utility 模型按解密出的 DeepSeek key 决定。
  - **回滚**：5 个调用点各两条。注入的 writer 让第 2 次写（settings.json）在字节落盘后报错，断言两份文件、`get()`、`getV4()` 都回到写入前，写入顺序是「secrets → settings（失败）→ 恢复 settings → 恢复 secrets」。另一条是 secrets 自己写失败时不触发恢复。还有两条：恢复本身失败时停在第一处；恢复按内存重新序列化，不按原来的字节。
  - **串行**：第一个 update 卡在写文件时，第二个不开始；失败的 mutation 不阻塞后面的；settings 和 secrets 的 mutation 共用一个队列，按调用顺序写。
  - **env**：load 后 12 个键的取值（DeepSeek / Kimi 键被删）；`reloadEnv` 在所有键写完之后调用；23 个公开操作各自让 `reloadEnv` 调用几次。测试前后快照并恢复这 12 个键。
- **测试揭示的现有行为**（照录，不修；前两条已记技术债「Desktop settings 遗留」）：
  1. 旧接口 `update` / `updateV2` 改 agent 字段，v4 里已有值时只改内存和 env，不写进文件；重启或下一次 `updateNamespaceV4` 后回到文件里的值。
  2. 恢复在第一处失败就停：恢复 settings 失败时 secrets 不恢复。
  3. 恢复按内存重新序列化：原来没有 secrets.json 时会多出一份空的；样本里的相对 `systemPromptPath` 变成绝对路径。
  4. custom connection 的增、改、删都经 `applyNamespaceV4` 落盘，也会写 env。所以 10 个调用点实际覆盖 13 类操作。`updateQuickOpenShortcut`、`updateModelStorage`（不带 connections）、额外 key 的增改删、语音 key、system prompt 不写 env。
- **变异检查**：对 `settings-service.ts` 做了 19 个变异（`/tmp/fe17/mut-t1.py`），跑全部 settings 测试（4 个文件，61 条）。18 个被新测试抓到（只跑特征测试也都失败）：
  - 两处恢复各删一半；
  - 去掉串行；
  - 队列的 tail 改成会 reject；
  - env 不删 Kimi 键、不写搜索 key、不写 temperature、不调 `reloadEnv`；
  - load 不写 env；
  - legacy 解密不检查 crypto 是否可用；
  - legacy secrets 不改写；
  - v1 迁移不看 DeepSeek key；
  - v1 不写备份；
  - v4 被重写；
  - secrets 不设 600；
  - custom connection 不写 env；
  - 添加额外 key 失败时不恢复；
  - maxTokens 不取整。

  剩下 1 个（`then(operation, operation)` 改成 `then(operation)`）是等价变异：tail 本身用 `run.then(() => undefined, () => undefined)` 构造，永远不会 reject。跑完后源文件和备份逐字节一致。
- **验证**：typecheck 通过；desktop 全量：文件 192 / 0 / 1，用例 1537 / 0 / 2（基线 191 / 1509，+1 个文件、+28 条）；build 通过。特征测试连跑 3 次结果相同。

### T2：types、constants、utils

- **做法**：搬迁用脚本，不手抄（`/tmp/fe17/mover.py`）。脚本按顶层声明（连同前面的注释）切块，整块搬到新文件，没有 `export` 的补上 `export`，函数体不动。新文件和 `settings-service.ts` 的 import 按实际用到的标识符重建：标识符用仓库里的 TypeScript 解析器取（`/tmp/fe17/idents.cjs`），能正确跳过字符串、模板字符串、注释和正则。搬走的代码如果还引用留在 `settings-service.ts` 里的声明，脚本直接中止，避免反向 import。
- **核对**：`/tmp/fe17/verify.py` 拿 T1 之前的原文件（2637 行，132 个顶层声明）逐个比对：每个声明都只出现在一个文件里，除了补的 `export`，逐行一致。
- **新增**：
  - `M/settings/types.ts`（182 行）：23 个类型和两个错误类。
  - `M/settings/constants.ts`（44 行）：17 个常量（文件名、默认值、namespace 列表、secret id 列表、`SEARCH_PROVIDER_ENV_KEYS`）。
  - `M/settings/utils.ts`（21 行）：`cloneJson`、`isRecord`、`isDefined`、`isNotFoundError`、`isAlreadyExistsError`。
- `settings-service.ts`：2637 → 2480 行。原来导出的 12 个类型和错误类改为从 `./settings/types` 再导出，调用方的 import 不变。
- `normalizeProxyUrl` 原来夹在常量中间，留在原处，T4 随 sanitize 一起搬。
- **验证**：
  - 核对脚本：132 个声明，缺 0、重复 0、改动 0。
  - typecheck 通过；`tsc -p tsconfig.electron.json --noUnusedLocals` 在 settings 相关文件上没有报错（先种了一个没用的 import，确认这个检查会报）。
  - settings 相关测试 5 个文件 79 条通过；desktop 全量 192 / 1537；build 通过。

### T3：atomic-io、secrets-file

- **新增**：
  - `M/settings/atomic-io.ts`（69 行）：`writeJsonAtomic`、`writeTextAtomic`、`writeBackupOnce`、`writeSettingsV2Backup`、`writeSettingsV3Backup`、`writeVerifiedBackup`。
  - `M/settings/secrets-file.ts`（89 行）：`emptySecrets`、`unavailableSecrets`、`parseSecretsV1`、`parseSecretsV2`、`ParsedSecretFields`、`parseSecretFields`、`secretEntries`。
- **和计划的差异**（不影响结构）：
  - `parseSecretFields` 用到 `isValidCredentialId` 和 `isProviderCredentialSecretId`。计划没有指定这两个放哪里，它们和 `providerCredentialSecretId` 一起定义 secrets.json 里凭据键的格式（`provider:credentialId`、`connection:…`），所以三个一起放进 `secrets-file.ts`。之后 sanitize 和 store 从这里 import。
  - 计划写 secrets-file 含「legacy 解密（纯函数部分）」。实际的 legacy 解密全在类的方法里，要调注入的 `SecretCrypto`，没有能单独搬的顶层纯函数，T6 随 store 一起搬。
  - `setOrDeleteEnv` 按计划留到 T6 进 `env.ts`。
- `settings-service.ts`：2480 → 2349 行。
- **验证**：
  - 核对脚本：132 个声明，缺 0、重复 0、改动 0。
  - typecheck 通过；unused 检查在 settings 相关文件上没有报错。
  - settings 相关测试 79 条通过；desktop 全量 192 / 1537；build 通过。

### T4：sanitize、custom-connection

- 先用脚本把剩下的顶层函数之间的调用关系列出来（`/tmp/fe17/deps.py`），再分组。目标是依赖只朝一个方向：custom-connection → sanitize → secrets-file / constants / types / utils，后面的 migrations、defaults 再依赖 sanitize。
- **新增**：
  - `M/settings/sanitize.ts`（399 行）：38 个 sanitize / normalize 函数，包括 T2 留下的 `normalizeProxyUrl`。
  - `M/settings/custom-connection.ts`（136 行）：12 个声明：`CUSTOM_CONNECTION_ADDRESS_ERRORS`、`normalizeCustomConnectionBaseUrl`、`resolvePromptCacheMode`、`validateCustomConnection`、`customConnectionDefaultModel`、`isCustomConnectionAuthMode`、`isResolvedAuth`、`connectionAuthFields`、`withoutConnectionAuth`、`resolveAuthScheme`、`uniqueConnectionName`、`connectionModelPatch`。
- **和计划的差异**（不影响结构）：
  - 计划写 custom-connection 是「:2286-2453」。这一段里还夹着通用的 `normalizeBaseUrl`、`sanitizeConnectionState`、`modelKeyMigrationPriority`、`sanitizeInstalledModels` / `sanitizeInstalledModel`，它们被普通 provider 和 v3 / v4 解析使用，放进了 sanitize。custom-connection 只放计划说明里的「校验、认证推导、模型补丁」。
  - `migrateLegacyProviderBaseUrl` 和 `modelKeyMigrationPriority` 名字带 migration，但被 `sanitizeProviderSettings`、`sanitizeInstalledModels`、`sanitizeCustomModels` 调用，放进 migrations 会形成 sanitize ↔ migrations 循环依赖，所以放在 sanitize。
  - `sanitizeSystemPromptPath` 被 `sanitizeAgentV2` 调用，是路径的 sanitize，放 sanitize。`system-prompt-file.ts` 按计划只放 system prompt 的读写和 ensure（T6）。`redactProxyUrl` 也放 sanitize。
- `settings-service.ts`：2349 → 1887 行。
- **验证**：
  - 核对脚本：132 个声明，缺 0、重复 0、改动 0。
  - typecheck 通过；unused 检查在 settings 相关文件上没有报错。
  - desktop 全量 192 / 1537，含 `custom-connection-protocol.test.ts`；build 通过。

### T5：defaults、migrations

- **新增**：
  - `M/settings/defaults.ts`（151 行）：`defaultProviderSettings`、`defaultInstalledModels`、`defaultSettingsFromEnv`、`defaultSettingsV4Metadata`、`safeImageGenerationDefaults`、`blockingSettings`、`defaultSystemPromptPath`。
  - `M/settings/migrations.ts`（351 行）：计划列的 7 个函数，加上 `hasRemovedDuckCodingSettings`、`hasRequiredSettingsSections`。文件头写明「冻结，最早支持 v1」。
- **归属说明**：
  - `blockingSettings` 是文件不能用时返回的默认值结果，放 defaults。
  - `hasRequiredSettingsSections` 是 v2 / v3 迁移前的完整性检查，放 migrations。
  - `defaultSystemPromptPath` 被 `defaultSettingsFromEnv` 使用，放 defaults。
  - 留给 T6：`applySettingsV4NamespacePatch`、`applyRecordPatch`、`computeSettingsRevision` 只被类的写入路径使用，随 store 搬；`setOrDeleteEnv` 进 env。
- 依赖：migrations → defaults / custom-connection / sanitize；defaults → sanitize。没有反向依赖。
- `settings-service.ts`：1887 → 1437 行，顶层只剩类和上面 4 个函数。
- **验证**：
  - 核对脚本：132 个声明，缺 0、重复 0、改动 0。
  - typecheck 通过；unused 检查在 settings 相关文件上没有报错。
  - desktop 全量 192 / 1537，含 v1–v4 的 load 快照和 `runtime-v2-settings-migration.test.ts`；build 通过。

### T6：store、env、system-prompt-file

- **新增**：
  - `M/settings/store.ts`（329 行）：`class SettingsStore` 和 `computeSettingsRevision`。
    - **状态**：原来类上的全部字段。`mutationTail` 仍是私有，其余改为公开，T7 的 facade 要读写。
    - **方法**：`load`、`subscribeV4Changes`、`getV4`、`getStoredKey`、`getStoredProviderCredential`、`applyToEnv`、读写 settings / secrets 文件、`restoreFilesBestEffort`、legacy 解密、`assertCredentialStorageWritable`、`ensureAgentSystemPromptFile`、`enqueueMutation`。
    - 回滚、串行队列和变更通知现在只在这一个文件里。
  - `M/settings/env.ts`（27 行）：`setOrDeleteEnv`、`applyProviderKey`、`applyToEnv`。函数体原样，只把 `this.settings` / `this.getStoredKey(p)` / `this.reloadEnv()` 改成参数 `settings` / `secrets[p]` / `reloadEnv()`。`getStoredKey` 本来就是 `return this.secrets[provider]`，两者等价。
  - `M/settings/system-prompt-file.ts`（30 行）：`ensureSystemPromptFile(filePath, legacy?)`、`readSystemPromptFile(filePath)`、`writeSystemPromptFile(filePath, content)`。
- **`SettingsService`**：只持有一个 `private readonly store`。
  - `load`、`subscribeV4Changes`、`getV4`、`getStoredKey` 直接转调 store。
  - 其余方法里的 `this.<store 成员>` 机械替换成 `this.store.<store 成员>`。
  - `applyToEnv` 的 10 个调用点位置不变，现在都是 `this.store.applyToEnv()`，store 再转到 `env.ts`。
- **和计划的差异**：
  - 计划说「类的私有状态和私有方法搬进 SettingsStore」，这里只搬了基础设施类的私有方法。下面这些属于业务逻辑，留在类里，T7 随各自的 facade 搬，不放进 store：
    - `applyNamespaceV4`；
    - 三个 custom connection 的 `*Queued`；
    - `setSpeechKey`；
    - `setSearchProviderKey` / `clearSearchProviderKey`；
    - `getImageGenerationSettingsView`。

    这样 store 的职责和计划目标结构里写的一致：内存状态、读写文件、mutationTail、restoreFilesBestEffort、变更通知。
  - `applySettingsV4NamespacePatch` / `applyRecordPatch` 也留到 T7，随 general facade 搬。
- **两处需要说明的等价性**：
  - `reloadEnv`：原来是 `this.reloadEnv()`（this 是 service），现在在 `env.ts` 里以普通函数调用。`index.ts` 不传 `reloadEnv`，用的是默认箭头函数；测试传的是 `vi.fn` 或箭头函数。都不依赖 this。
  - system prompt：路径的求值时机和原来一致。`readAgentSystemPrompt` / `writeAgentSystemPrompt` 都在 ensure 之后取路径；write 返回的 `path` 仍在写完之后重新读一次。
- **核对**：
  - 顶层声明核对：132 个，缺 0、重复 0、改动 0（`SettingsService` 预期改动）。
  - 成员核对（`/tmp/fe17/verify-members.py`，去掉 `private ` 和 `this.store.` 前缀后逐行比对）：原类 70 个成员，65 个逐行一致，在 store 或 service 里。其余 5 个是上面说明的改写：`applyToEnv`、`ensureAgentSystemPromptFile`、`readAgentSystemPrompt`、`writeAgentSystemPrompt`、`applyProviderKey`（移到 `env.ts`）。
- **变异检查**（`/tmp/fe17/mut-t6.py`，18 个，改的是新位置）：
  - **第一轮** 12 个被抓到：store 不转调 env、env 不写搜索 key / 不调 reloadEnv / 不写 temperature、applyProviderKey 恒删、restore 漏写任一文件、队列不串行、load 末尾不写 env、图片生成不回滚、namespace 更新不写 env、ensure 不用 legacy prompt。
  - **没抓到的 6 个**是 T1 没覆盖的行为，不是 T6 改出来的：变更通知、secrets 的兜底 `chmod`、写 prompt 截断、ensure 不覆盖已有文件、读 prompt 前先 ensure、写 prompt 的返回值。
  - **补测**：特征测试增加 6 条（变更通知 2 条、secrets 权限 1 条、system prompt 3 条）和快照 `expected/v4-notifications.json`。
    - 做法是先把 `settings-service.ts` 恢复到 T5、拿走三个新文件，对 T6 之前的代码生成快照并跑通（34 / 34）；再放回 T6 的文件跑，也是 34 / 34。放回后逐字节比对过。
  - **第二轮**：补测之后 18 个全部被抓到。
- **补测揭示的现有行为**（照录）：`setProviderKey("tavily")` 等搜索 key 不发 v4 变更通知；语音 key 发 `["media"]`；custom connection 只发 `["models"]`；整份写入的操作发全部 7 个 namespace。
- **工具修正**：`mover.py` 重建 import 时，把 `export type { … } from` 再导出里的名字也算成「用到」，留下了一个没用的 `SecretCrypto` import。`--noUnusedLocals` 抓到了，已改成忽略再导出语句。T2–T5 的 unused 检查都是干净的，没有受影响。
- `settings-service.ts`：1437 → 1102 行。
- **验证**：
  - typecheck 通过；unused 检查在 settings 相关文件上没有报错。
  - desktop 全量：文件 192 / 0 / 1，用例 1543 / 0 / 2（+6）。
  - build 通过。

### T7：facades 和 service（5 个提交）

**做法**（`/tmp/fe17/t7.py`，每组一次）：
- **facade 函数**：类方法改成 `facades/<组>.ts` 里的函数，第一个参数是 `store: SettingsStore`，其余参数、返回类型、`async` 不变。函数体只做三种机械替换：
  - 缩进少两格；
  - `this.store.` → `store.`；
  - `this.m(…)` → 同组的写成 `m(store, …)`，已搬走的写成 `组.m(store, …)`（namespace import）。还没搬的方法被调用时脚本中止，所以按依赖顺序搬：media → search → general → providers → custom-connections。
- **类里的方法**：公开方法改成一行转调 `return 组.m(this.store, …)`，签名原样。原来是 `async` 的去掉 `async`，直接返回 facade 的 promise，不多一层 promise。私有方法直接删掉。留在类里的方法调用已搬走的方法时，直接调 facade。
- **核对**（`/tmp/fe17/verify-t7.py`，基准是 T6 提交里的类，45 个方法）：
  - **facade**：参数逐个和原方法一致，前面多一个 `store`；返回类型和 `async` 一致；函数体在去掉缩进、还原上面三种替换后逐行一致。
  - **类**：转调方法的签名和原方法相同；留在类里的方法还原后逐行一致。
  - 先人为改一处 facade、一处类方法，确认两处都能报出来。

#### T7a：facades/media

- `M/settings/facades/media.ts`：`getImageGenerationRuntimeConfig`、`updateImageGeneration`、`getImageGenerationSettingsView`、`getSpeechSettings`、`setSpeechKey`。后两个原来是私有方法，`getV2`、`setProviderKey`、`clearProviderKey` 改为直接调 `media.*`。
- **工具修正**：
  - 生成 import 时，同一个包的多条 import 合并成一条。
  - 留在类里、调用已搬走的私有方法的地方，改为调 facade；第一次跑漏了这一步，typecheck 之前就发现了，恢复后重跑。
- **验证**：
  - T7 核对 0 处不一致；顶层声明核对 132 个，缺 0、重复 0、改动 0。
  - typecheck 通过；unused 检查在 settings 相关文件上没有报错。
  - desktop 全量 192 / 1543；build 通过。

#### T7b：facades/search

- `M/settings/facades/search.ts`：`getSearchUsage`、`setSearchProviderKey`、`clearSearchProviderKey`。后两个原来是私有方法，`setProviderKey` / `clearProviderKey` 改为直接调 `search.*`。
- **验证**：
  - T7 核对 0 处不一致（已搬 8 个）；顶层声明核对 132 个，缺 0、重复 0、改动 0。
  - typecheck、unused 检查通过；desktop 全量 192 / 1543；build 通过。

#### T7c：facades/general

- `M/settings/facades/general.ts`（350 行）：13 个方法，加上顶层的 `applySettingsV4NamespacePatch`、`applyRecordPatch`（T6 留下的，原样搬入，不导出）。
  - 方法：`updateNamespaceV4`、`applyNamespaceV4`、`getLastLoadError`、`getCredentialStorageView`、`get`、`getV2`、`getModelStorageState`、`updateModelStorage`、`update`、`updateV2`、`updateQuickOpenShortcut`、`readAgentSystemPrompt`、`writeAgentSystemPrompt`。
  - `getV2` 经 `media.getImageGenerationSettingsView` 取图片生成视图，general 依赖 media，没有反向依赖。
- **工具修正**：`getV2` 里已经是 `media.…(this.store)` 的写法（T7a 改的）。脚本原来只认 `this.store.`，所以中止了，没有写文件；补上对单独 `this.store` 的替换。另外改为按生成后的代码判断要 import 哪些 facade，不靠调用替换时记录。重跑前把文件恢复到 T7b 的状态。
- **验证**：
  - T7 核对 0 处不一致（已搬 21 个）；顶层声明核对 132 个，缺 0、重复 0、改动 0。
  - typecheck、unused 检查通过；desktop 全量 192 / 1543；build 通过。

#### T7d：facades/providers

- `M/settings/facades/providers.ts`（407 行）：12 个方法。
  - 方法：`updateProviderConnection`、`removeProvider`、`getProviderRuntimeConfig`、`getProviderRuntimeConfigForCredential`、`addProviderCredential`、`updateProviderCredential`、`removeProviderCredential`、`markProviderCredentialConnectionResult`、`getOpenRouterManagementRuntimeConfig`、`markProviderConnectionResult`、`setProviderKey`、`clearProviderKey`。
  - 旧 key 弹窗用的 `setProviderKey` / `clearProviderKey` 按 provider 分发到 search、media 和本组，按计划「provider 连接、credential、key 的 CRUD」放这里。
  - 依赖 general（`get`）、media、search，这三个都不依赖 providers。
- **验证**：
  - T7 核对 0 处不一致（已搬 33 个）；顶层声明核对 132 个，缺 0、重复 0、改动 0。
  - typecheck、unused 检查通过；desktop 全量 192 / 1543；build 通过。

#### T7e：facades/custom-connections、service.ts、barrel

- `M/settings/facades/custom-connections.ts`（185 行）：8 个方法：`getCustomConnectionRuntimeConfig`、`create` / `remove` / `updateCustomConnection` 和各自的 `*Queued`、`markCustomConnectionResult`。落盘都经 `general.applyNamespaceV4`；运行时配置经 `providers.getProviderRuntimeConfigForCredential`。
- `M/settings/service.ts`（227 行）：`class SettingsService` 用顶层搬迁脚本整块搬入。只持有 `store`，37 个公开方法：
  - 33 个转调 facade；
  - 4 个直接转调 store：`load`、`subscribeV4Changes`、`getV4`、`getStoredKey`。
- `M/settings-service.ts`：barrel，21 行。保留原来的文件头说明，加一句「实现在 ./settings/ 下」，然后导出 `SettingsService`、两个错误类和 10 个类型，共 13 个，和拆分前一致。
- **对外 API 核对**（和拆分前 2637 行的原文件比）：
  - 公开方法 37 个，名字和签名（方法名到函数体之前的整段文本）全部一致；
  - barrel 导出 13 个，和原文件的 13 个一致。
  - 23 个转调方法去掉了 `async`，直接返回 facade 的 promise。签名文本不含 `async`，调用方看到的类型相同；原来方法体里同步抛出的错误本来也会变成 rejected promise，现在由 facade 的 `async` 函数负责，行为相同。
- **变异检查**（`/tmp/fe17/mut-t7.py`，10 个，改的是 facade 和 service）：
  - **第一轮** 7 个被抓到。
  - **没抓到的 3 个**是 T1 / T6 没覆盖的行为：v4 namespace 写入失败时的内存回滚、`updateNamespaceV4` 进串行队列、`service.update` 的返回值（改成转调 `updateV2` 也通过）。
  - **补测**：特征测试增加 `v4 namespace updates` 4 条。先恢复到 T6 提交的源码跑通（38 / 38），再放回 T7 的文件，逐字节核对后跑。
  - **第二轮**：10 个全部被抓到。
- **补测揭示的现有行为**（已记技术债「Desktop settings 遗留」第 3 行）：v4 namespace 写入在字节落盘后才失败时，只回滚内存、不恢复文件，磁盘上是新内容。
- **纯搬迁核对**：
  - **diff 规模**：`git diff --shortstat cd325f96` 只看 settings 相关文件，+3158 / −2632。多出来的约 500 行是新增的 import（18 个文件共 348 行）、每个文件的文件头（18 行）、`service.ts` 里的转调方法（187 行），以及 facade 函数多出的 `store` 参数行。
  - **函数体抽查**：facade 的 41 个函数直接和原文件比，`this.` 还原成 `store.`，facade 间调用还原成 `this.m(…)`。39 个逐行一致；另外 2 个（`readAgentSystemPrompt`、`writeAgentSystemPrompt`）是 T6 有意改写，T6 已说明并有用例覆盖。
  - 顶层声明在 T2–T5 已逐个核对（132 个，缺 0、重复 0、改动 0）。
- **文件大小**（全部 ≤ 500 行）：

  | 文件 | 行数 |
  | --- | --- |
  | `settings-service.ts`（barrel） | 21 |
  | `settings/utils.ts` | 21 |
  | `settings/env.ts` | 27 |
  | `settings/system-prompt-file.ts` | 30 |
  | `settings/constants.ts` | 44 |
  | `settings/facades/search.ts` | 67 |
  | `settings/atomic-io.ts` | 69 |
  | `settings/facades/media.ts` | 77 |
  | `settings/secrets-file.ts` | 89 |
  | `settings/custom-connection.ts` | 136 |
  | `settings/defaults.ts` | 151 |
  | `settings/types.ts` | 182 |
  | `settings/facades/custom-connections.ts` | 185 |
  | `settings/service.ts` | 227 |
  | `settings/store.ts` | 329 |
  | `settings/facades/general.ts` | 351 |
  | `settings/migrations.ts` | 351 |
  | `settings/sanitize.ts` | 399 |
  | `settings/facades/providers.ts` | 407 |

- **依赖方向**：
  - `service` → `facades/*` 和 `store`；
  - facade 之间：providers → general / media / search，custom-connections → general / providers，general → media；
  - `store` → env / system-prompt-file / migrations / defaults / secrets-file / atomic-io；
  - store 不 import 任何 facade，没有循环。
- **验证**：
  - typecheck 通过；unused 检查在 settings 相关文件上没有报错。
  - desktop 全量：文件 192 / 0 / 1，用例 1547 / 0 / 2（基线 1509：T1 +28、T6 +6、T7 +4）。
  - build 通过；`check:current-docs`、`check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge` 通过。

### T8：文档

- **`docs/design-docs/core-storage-and-observability.md`**：「设置与凭据」一节补上 main 侧的模块划分和依赖方向（store 唯一负责回滚、串行和通知；facades 五组；纯函数模块；`env.ts`）。
- **`docs/ARCHITECTURE.md`**：只在阅读路线里给存储文档那一条补半句「也记录 Desktop main 侧 settings / secrets 的模块划分」。
  - 计划写的是「main 模块段」，但 ARCHITECTURE 没有这一段，维护规则写明「只做顶层导航，不继续堆实现清单」「存储边界优先维护在 core-storage-and-observability.md」。
  - 所以结构写进存储文档，ARCHITECTURE 只加导航（偏差，不影响结构）。
- **`docs/desktop-frontend-refactor/01-安全与IPC收口.md`**：P1-4 标注「已在 17 执行」，写明实际结构和原表的三处不同；下文原样保留。
- **`docs/exec-plans/tech-debt-tracker.md`**：C1 行的后续动作补上「`applyToEnv` 已集中到 `settings/env.ts`」。
- 三份设计文档（图片生成工具、上下文模型、英语学习）引用的是 `apps/desktop/src/main/settings-service.ts`。这个路径仍然是对外入口，不改。
- **验证**：`check:current-docs` 通过。

### 复核与 Electron 检查

- **只读复核**（Sonnet 子智能体，对照 `cd325f96` 读代码和 diff，没有跑测试）：没有发现行为变化。逐项确认：
  - 五个 facade 和 `store.ts` 相对原类体只有 `this.` → `store.`、方法调用改为函数调用这两类改写；`load`、读写文件、回滚、解密旧 secrets 原样。
  - 每个写操作里 `writeSecretsFile` / `writeSettingsFile` / `applyToEnv` / `restoreFilesBestEffort` 的 await 顺序不变；`enqueueMutation` 包裹全部保留；回滚用的旧状态拷贝方式（`cloneJson` 或展开）不变。
  - `service.ts` 里返回 Promise 的转发都指向 `async function`，同步抛错仍然变成 rejection；原来同步的方法仍是同步。
  - import 是有向无环图；barrel 的 13 个导出和原文件一致，调用方只从 `settings-service` 导入，没有人直接 import `settings/*`。
  - 唯一备注：`SettingsStore` 的字段改成了 public，但 `SettingsService` 把 store 设为 `private readonly`，对外的封装边界不变。不处理。
- **Electron 检查**（构建产物 `dist-electron`，临时数据目录 `/tmp/actspace-fe17-electron`，没有碰真实用户数据）：
  1. **迁移**：放入 `M/test/fixtures/settings/v3.json` 作为 `settings.json` 后启动。迁移成 v4（命名空间 activity / general / media / models / skills / subagents / tools）；`settings.v3.backup.json` 和 fixture 逐字节相同，`settings.v3.backup.sha256` 和它的 sha256 一致。
  2. **写入**：通过 bridge 新建自定义连接「FE17 Proxy」（openrouter，假 key，`proxy.example.invalid`），并设置 Tavily 假 key，两者都返回 ok。`secrets.json` 是 v2，权限 0600，含 `tavily` 和 `connection:fe17-proxy`。
  3. **重启后**：连接还在，`tavilyHasApiKey` 为 true，备份文件仍在。设置页「模型」能看到 FE17 Proxy；「搜索」页 Tavily 显示「已连接」，计数「1 / 4 已连接」。
  - 日志里只有 Chromium 的 disk cache 报错（`Shared Dictionary/cache` 建不了目录，临时目录下的常见现象），没有应用层错误。
  - 截图：`screenshots/electron-after-migration.png`、`screenshots/electron-models-after-restart.png`、`screenshots/electron-search-after-restart.png`。
  - 没有验证真实中转站连通、真实搜索调用和图片生成：需要真实 key，留给人工验收。

## 遇到的问题

- **问题**：vitest 的 `toMatchSnapshot` 报 「snapshot state … is not found」。
  - **原因**：本机 `apps/desktop/src/main` 的 realpath 是 `/Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent/apps/desktop/src/main`（同一个目录），vitest 记录的测试路径和 snapshot 客户端用的路径对不上。
  - **应对**：快照改成提交进仓库的 JSON 文件（`fixtures/settings/expected/`），用 `toEqual` 比较；`UPDATE_SETTINGS_GOLDEN=1` 时重新生成。这样也不依赖机器上的路径。

## 跳过或推迟的事项

- 用真实 key 验证中转站连通、联网搜索和图片生成：我只有假 key，留给验收（交接 A3、A4）。
