# 模型目录价格锁定与删除运行时刷新

## 目标

`pnpm models:generate` 改成合并模式：已有模型整条锁定、上游新模型只新增、下架模型不删除，改价只能经过改价清单；生成时打印报告。同时删掉 Desktop 运行时的目录后台刷新，让随包目录成为唯一价格来源。外部贡献者新增服务商时，只需把服务商 id 加进过滤表再运行生成，diff 里不会出现无关的价格改动或删除。

设计见 [本地模型目录与使用费用设计 › 目录生成规则](../../design-docs/model-context/agent-model-catalog-and-usage-cost.md#目录生成规则2026-11-08)。

## 范围

- 包含：
  - 合并纯函数 `mergeModelCatalog`。
  - 改价清单文件。
  - 生成脚本改写：报告、`--offline` 模式、一行一个模型。
  - 删除运行时刷新：服务、worker、IPC、类型、mock、验证脚本片段。
  - 按新规则跑一次生成（只新增）。
  - 测试、设计文档、history。
- 不包含：
  - pi-ai 升级与改用内置服务商（另一个 PR）。
  - OpenCode Go 服务商本身（由 PR #34 的贡献者在新基础上重做）。
  - 新增 `CATALOG_PROVIDERS` 成员。
  - 改动价格匹配与四层有效值规则。

## 背景

- PR #34 加 OpenCode Go 时重跑了生成脚本，脚本整份重写目录，diff 里混进了 107 处无关改价和 83 处删除。问题出在我们的生成规则，不在贡献者。
- `ModelCatalogService` 自 2026-10-21（00d6b763）起没有界面调用方，但仍在启动时读取本地缓存；缓存比随包目录新时会优先使用缓存，绕过仓库里定下的价格。
- 相关代码：
  - `scripts/generate-model-catalog.mjs`
  - `packages/util/shared/src/model-catalog*.ts`
  - `packages/util/shared/src/generated/model-catalog.generated.ts`
  - `apps/desktop/src/main/{index.ts,model-catalog-service.ts,model-catalog-worker.ts}`
  - `apps/desktop/src/main/runtime-v2/fixed-renderer-ipc.ts`
  - `apps/desktop/tsconfig.electron.json`
  - `apps/desktop/scripts/verify-usage-runtime.mjs`
  - `apps/desktop/src/renderer/mock/handlers.ts`
  - `packages/util/shared/src/{desktop-bridge/contract.ts,runtime-v2/fixed-renderer.ts}`

## 步骤

| # | 内容 | 验证 |
|---|---|---|
| T1 | `model-catalog-merge.ts`：`mergeModelCatalog(previous, fetched, overrides)` 返回 `{ entries, report }`；key 为 `source/sourceProviderId/apiModel`；按 key 排序；清单指向不存在的条目时抛错 | 单测：锁定、新增、保留下架、清单覆盖、清单失配报错、锁定价格变化列入报告 |
| T2 | `model-catalog-overrides.ts`：`MODEL_CATALOG_PRICE_OVERRIDES`（provider、model、rates、sourceUrl、checkedAt），首版为空数组 | 单测：生成文件中每条清单条目价格与清单一致 |
| T3 | 生成脚本：读旧目录 → 拉取 → 合并 → 打印报告 → 内容不变不写；`--offline` 跳过拉取；输出一行一个模型 | 本地 `--offline` 运行后文件内容不变；格式改写后 `tsc` 通过 |
| T4 | 删除运行时刷新：`model-catalog-service.ts`、`model-catalog-worker.ts`、其测试、tsconfig worker 入口、`index.ts` 接线改用 `BUILTIN_MODEL_CATALOG`、IPC handler/channel/contract、`ModelCatalogStatus`、mock、`verify-usage-runtime.mjs` 中的刷新段落 | `pnpm check:ipc-channels`、desktop typecheck 与测试 |
| T5 | 先只改格式提交一次（内容不变），再联网跑一次生成，只新增 | 第二次 diff 只有新增行；报告里新增数与 diff 一致 |
| T6 | history、执行文档、计划状态 | `pnpm check:docs` |

## 风险

- 格式改写和新增模型混在一个 diff 里，难以审阅：T3 和 T5 分两次提交，第一次只改格式。
- 锁定会让上游真实降价进不来：报告逐条列出被锁定的价格变化，维护者决定要不要写进改价清单。
- 删除 IPC 可能被别处引用：已全仓搜索，只有 handler、contract、channel 和 mock 四处。

## 验证方式

- 命令：
  - `pnpm --filter @actspace/shared test`
  - `pnpm --filter @actspace/shared typecheck`（或仓库对应命令）
  - desktop main 的 typecheck 与测试
  - `pnpm check:ipc-channels`
  - `pnpm check:docs`
  - `node scripts/generate-model-catalog.mjs --offline`
- 手工检查：Electron 启动后，设置 › 模型的价格显示与统计页的费用正常（随下次 Electron 验收一起做）。

## 进度记录

- [x] 设计文档更新（2026-11-08）
- [x] T1–T6（2026-11-08）：shared 224 / desktop main 616 测试通过；联网生成新增 123、锁定改价 113、保留下架 80，diff 只有新增。
- [ ] Electron 实机检查：设置 › 模型价格与回复花费正常（未做）。

## 决策记录

- 2026-11-08：用户确认价格按服务商分开保留，已有价格锁定，不删除模型，加改价清单，生成时打印报告。
- 2026-11-08：用户确认在这个 PR 里删除运行时刷新，生成文件改成一行一个模型，并按新规则跑一次生成（只新增）。
- 2026-11-08：已有条目整条锁定（不只锁价格），符合“已存在就不改”；能力字段要更新也走改价清单之外的人工修改，暂不提供入口。

## 执行模式

交互模式。

## 执行文档

`docs/exec-runs/20261108-catalog-price-lock/`。
