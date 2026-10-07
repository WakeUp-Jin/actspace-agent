# Desktop settings 写入一致性修复

## 目标

修掉 Desktop 前端重构 17 的特征测试记下的三处 settings 写入问题，让「内存、settings.json / secrets.json、process.env」在成功和失败两种情况下都保持一致：

1. 旧接口 `update` / `updateV2` 改 agent 字段时，改动要写进 v4 文件，不能只留在内存和 env 里。
2. 写失败回滚时，settings.json 和 secrets.json 各自恢复，一个恢复失败不影响另一个。
3. v4 namespace 写入在文件已经落盘后才失败时，文件也要恢复，不能只恢复内存。

这三处都是 17 之前就有的行为（17 是纯搬迁，只照录不修），见 `docs/exec-plans/tech-debt-tracker.md`「Desktop settings 遗留」。

## 范围

- 包含：
  - `apps/desktop/src/main/settings/` 下的 `facades/general.ts`、`store.ts`、`migrations.ts`（`toSettingsV4`），以及各 facade 里调用 `restoreFilesBestEffort` 的地方。
  - `apps/desktop/src/main/test/settings-characterization.test.ts`：把照录现状的断言改成修复后的预期，并补用例。
  - 决策 D1 选 B 或 A+B 时：`apps/desktop/src/renderer/components/settings/useToolToggle.ts`、`sections/ToolsSection.tsx` 的旧接口回退。
- 不包含：
  - settings.json / secrets.json 的文件格式和版本号。
  - 删除旧接口 `update` / `updateV2` 本身：`SkillsSection`、`MediaDefaultsSection` 和 `models.updateTaskModels` 还在用。
  - 17 的模块划分。
  - 技术债里 C1（`applyToEnv` 把 key 写进 `process.env` 并被子进程继承）。

## 背景

- 相关文档：
  - `docs/exec-plans/tech-debt-tracker.md`「Desktop settings 遗留」三行。
  - `docs/design-docs/core-storage-and-observability.md`「设置与凭据」：模块划分和回滚、串行的职责。
  - 17 的执行记录：`docs/exec-runs/20261005-desktop-fe-17-settings-split/execution-process.md`（T1、T6、T7 的特征测试和变异检查）。
- 相关代码路径（2026-10-07 核实，`M/` = `apps/desktop/src/main/`）：
  - **问题 1**
    - `M/settings/facades/general.ts` 的 `update`（:187）、`updateV2`（:221）只改 `store.settings.agent`（v3 结构）。
    - `M/settings/migrations.ts` 的 `toSettingsV4`（:87）以 `v4Metadata` 为准，只有 v4 字段为空时才用 v3 的值：
      - `taskDefaults.temperature` / `maxOutputTokens` 为 null；
      - `tools.disabledTools` 为空；
      - `tools.bash.alwaysAsk` 为 false（所以 `bashAlwaysAsk` 只能打开、关不掉）。
    - 同一函数里 `agentInstructions.systemPromptPath`、explore 子 Agent 路由也是「为空才补」，要在 T0 一并核实。
    - `applyToEnv` 读的是 v3 结构，所以 env 是新值、文件是旧值，重启或下一次 v4 写入后回到旧值。
    - renderer 只在 v4 快照还没加载（`use-settings.ts` 初始为 null）或加载失败时才走旧接口：`useToolToggle.ts:5` 的 `settingsV4Writable` 和 `ToolsSection.tsx:94`。
  - **问题 2**
    - `M/settings/store.ts` 的 `restoreFilesBestEffort`（:287）：先恢复 settings.json，再恢复 secrets.json，两步在同一个 try 里。
    - `writeSecretsFile`（:280）：`writeJsonAtomic` 里 rename 之后还有 chmod（`atomic-io.ts:22`），外面又 chmod 一次。rename 成功、chmod 失败时文件已经是新内容，但调用方的 `secretsWritten` 还是 false，不会回滚。
    - 调用方：`facades/media.ts:25`、`facades/providers.ts:40 / 100 / 200 / 279`。
  - **问题 3**
    - `M/settings/facades/general.ts` 的 `applyNamespaceV4`（:46）：catch 里只恢复 `store.settings` / `store.v4Metadata`，不恢复文件。
    - 经它落盘的还有 custom connection 增改删和连接检测结果（`facades/custom-connections.ts`）。
    - 实际触发点：`writeSettingsFile` 之后的 `store.applyToEnv()`（会调 `reloadEnv`）或 `store.getV4()` 抛错；特征测试用注入的 writer 模拟「写完才报错」。
    - 同一类问题也存在于 `update`、`updateV2`、`updateQuickOpenShortcut`、`updateModelStorage`（只回滚内存）。是否一起修见 D3。
- 已知约束：
  - 所有写操作都在 `store.enqueueMutation` 串行队列里，修复不能打破串行，也不能在队列外写文件。
  - v4 变更通知（`writeSettingsFile` 里发出）只在写成功时发；回滚时要不要发通知见 D4。
  - 不读写真实用户数据；Electron 检查用临时 `ACTSPACE_DATA_DIR`。

## 待确认的决策（执行前逐项拍板）

### D1：问题 1 怎么修

| 方案 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| A | `update` / `updateV2` 收到 `agent.temperature` / `maxTokens` / `disabledTools` / `bashAlwaysAsk` 时，同时写 `v4Metadata` 的对应字段 | 从源头修，任何调用方都对；renderer 不用改 | 旧接口和 v4 接口各写一份映射，以后加字段要两边同步 |
| B | renderer 去掉旧接口回退：v4 快照没加载好之前，工具开关和 Bash 审查开关先禁用 | 写入路径只剩 v4 一条，代码更少 | main 侧旧接口改 agent 字段仍然不进文件，只是没人调用；快照加载失败时这几个开关不能用 |
| A+B（建议） | 两个都做 | 根上修好，同时去掉 renderer 的双写路径 | 改动最多（仍然很小） |

### D2：问题 2 怎么修

| 方案 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| A（建议） | `restoreFilesBestEffort` 改成两个独立的 try；`writeSecretsFile` 一开始写就把 `secretsWritten` 置为 true（「可能已落盘」） | 改动小，语义清楚：每个文件尽力各自恢复 | 两个文件都恢复失败时仍然不一致（只能记日志，不能保证） |
| B | 在 A 的基础上，恢复失败时把 `credentialStorageIssue` 置为不可写，暂停后续凭据修改，直到重启 | 不会在不一致的状态上继续写 | 用户会看到凭据暂停修改的提示，需要重启；改动面更大 |

### D3：问题 3 修到哪

| 方案 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| A | 只修 `applyNamespaceV4`：失败且已开始写文件时，按回滚后的内存重写一次 settings.json | 和技术债条目一一对应，范围最小 | `update` / `updateV2` 等旧路径还是同样的问题 |
| B（建议） | 抽一个 store 方法（例如 `commitSettings(write, rollback)`），所有只写 settings.json 的路径都走它：写前记快照，失败时恢复内存，已开始写就重写文件 | 一处修好，所有路径行为一致，和 secrets 路径的 `restoreFilesBestEffort` 对称 | 要动 5 个函数，测试也要多补 |

### D4：回滚后要不要发 v4 变更通知

| 方案 | 做法 | 优点 | 缺点 |
| --- | --- | --- | --- |
| A（建议） | 文件已经写过（写成功时已经发过一次通知）再回滚的，回滚后补发一次通知，内容是恢复后的 revision | renderer 收到的最后一个快照和最终的文件、内存一致 | 多一次通知，renderer 会刷新两次 |
| B | 回滚时不发通知 | 最简单 | 写成功、后面的步骤失败时，renderer 已经收到新快照，文件和内存却回到了旧值，界面显示错的值，直到下次刷新 |

## 风险

- 风险：回滚时重写文件本身也可能失败，导致又一层不一致。
  - 缓解：重写失败只记日志，原错误照常抛出；D2 选 B 时再暂停凭据修改。
- 风险：D1 A 让旧接口改写 v4 字段，可能覆盖用户刚在 v4 页面设的值。
  - 缓解：两条路径都在同一个串行队列里，后到的写入覆盖先到的，和现在 v4 页面之间的行为一致；补一条「v4 写入后再走旧接口」的用例。
- 风险：改了特征测试的断言，可能把别的行为也一起改掉。
  - 缓解：只改技术债三行对应的断言，每改一条在执行记录里写明原断言和新断言；其余 34 条不动。

## 里程碑

1. **T0**：按当前代码复核三个问题和行号；核实 `systemPromptPath`、explore 路由是否也受问题 1 影响；跑基线。
2. **T1**：先改测试（红）：把三处照录现状的断言改成修复后的预期，补「写完才失败」「恢复 settings 失败」「v4 写入后走旧接口」等用例。
3. **T2**：修问题 2（`store.ts`、各 facade 的 `secretsWritten`）。
4. **T3**：修问题 3（按 D3）。
5. **T4**：修问题 1（按 D1），含 renderer 改动（如果选 B）。
6. **T5**：变异检查、Electron 检查、文档（存储文档「设置与凭据」、技术债三行改为已解决）、history。

## 验证方式

- 命令（在 `apps/desktop` 下）：
  - `pnpm -s typecheck`
  - `NO_COLOR=1 npx vitest run src/main/test/settings-characterization.test.ts`，以及 desktop 全量 vitest
  - 仓库根：`pnpm test`、`pnpm --filter @actspace/desktop build`、`pnpm -s check:current-docs`
- 变异检查：分别去掉三处修复的关键语句，确认新用例会失败。
- Electron（临时 `ACTSPACE_DATA_DIR`）：
  - 在 v4 快照加载前后各切一次工具开关和 Bash 审查开关，重启后值保留；
  - 用不可写的 settings.json（`chmod 444`）触发写失败，确认界面报错、重启后设置是写入前的值、secrets.json 没被改。
- 手工检查：设置页通用、工具、搜索、模型各改一项，重启后保留。

## 进度记录

- [ ] D1–D4 拍板
- [ ] T0–T5

## 决策记录

- 2026-10-07：立项。来源是 17 的特征测试；用户要求整理成计划放进 active，下次再修。

## 执行模式

交互模式。D1–D4 拍板之前不动代码。

## 执行文档

执行开始时，在 `docs/exec-runs/20261007-desktop-settings-write-consistency/` 创建 `execution-process.md`、`execution-summary.md`（从 `docs/exec-runs/templates/` 复制）。
