# 17 settings-service 拆分 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261005-desktop-frontend-refactor/17-settings-service拆分执行计划.md`
- **执行过程**：`docs/exec-runs/20261005-desktop-fe-17-settings-split/execution-process.md`
- **现行文档**：`docs/design-docs/core-storage-and-observability.md`「设置与凭据」
- **执行模式**：交互，连续执行
- **执行结果**：完成。T0–T8 全部完成（T7 分 5 个提交），另有一个复核与 Electron 检查的提交。
  - 纯搬迁：`settings.json` / `secrets.json` 的格式、迁移、回滚、串行队列、写 env 的时机和对外 API 都不变。
  - 用户界面没有变化。
  - 没有需要你判断的事项，也没有暂停。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 特征测试（T1，T6 / T7 补） | `M/test/settings-characterization.test.ts`、`M/test/fixtures/settings/` | 搬迁前先把现有行为钉住：v1 / v2 / v3 迁移结果和备份、v4 读写、secrets 加密与 0600、回滚、串行与 revision 冲突、custom connection、写 env、v4 变更通知、system prompt 文件。共 38 条；黄金结果是提交进仓库的 JSON |
| 纯函数模块（T2–T5） | `M/settings/` 下 types、constants、utils、atomic-io、secrets-file、sanitize、custom-connection、defaults、migrations | 声明逐字搬走，只加 `export` 和 import；工具核对每个声明的正文和原文件一致 |
| store（T6） | `M/settings/store.ts`、`env.ts`、`system-prompt-file.ts` | 内存状态、读写文件、回滚、`mutationTail` 串行队列、v4 变更通知都在 store。`applyToEnv` 的语句和顺序原样搬到 `env.ts` |
| facades 与门面（T7a–e） | `M/settings/facades/` 下 media、search、general、providers、custom-connections；`M/settings/service.ts` | 原类的方法改成「第一个参数是 store」的函数；`SettingsService` 的 37 个公开方法签名和原来一致，只做转发 |
| 入口（T7e） | `M/settings-service.ts` | 2637 行 → 21 行 barrel，13 个导出和原来一致；调用方的 import 不变 |
| 文档（T8） | 存储文档「设置与凭据」、ARCHITECTURE 导航半句、`01-安全与IPC收口.md` P1-4、技术债 | 技术债新增 3 条「现有行为」（特征测试发现，17 不修） |

拆完后 `settings/` 下 19 个文件都不超过 500 行，最大的是 `facades/providers.ts`（407 行）。

## 偏差

- **ARCHITECTURE**：计划写「补 main 模块段」，但 ARCHITECTURE 只做顶层导航，没有这一段，所以结构写进了存储文档，ARCHITECTURE 只加半句导航。
- **测试的黄金结果**：计划写快照。本机 `apps/desktop/src/main` 的 realpath 和工作路径不同，vitest 快照对不上路径，所以改成提交进仓库的 JSON 文件加 `toEqual`。
- **补的用例**：T6、T7 做变异检查时发现原有用例拦不住几类改动（通知、secrets 权限、system prompt 文件、v4 namespace 回滚与串行），各补了用例（T6 +6，T7 +4）。新用例先在改动前的代码上跑通，确认照录的是原行为。
- **`01-安全与IPC收口.md` P1-4**：实际结构和原表有 3 处不同（多了 `env.ts`、`system-prompt-file.ts`；facade 按领域分 5 个，而不是按读写分）。已在 P1-4 标注。

## 人工验证指引

### 必须验证

1. **用你平时的数据目录启动，设置都还在**
   - 验证方式：构建后正常启动应用，打开设置的通用、模型、搜索、工具、子 Agent 几页。
   - 预期结果：所有设置和改动前一样；已连接的模型和搜索服务仍显示「已连接」。
2. **改设置后重启**
   - 验证方式：改一个通用设置（例如默认会话模型）和一个工具开关，退出应用再打开。
   - 预期结果：改动都保留。
3. **custom connection（中转站）**
   - 验证方式：在模型页新建或编辑一个自定义连接，填真实的 Base URL 和 Key，点检测；然后在会话里用它发一条消息。
   - 预期结果：检测结果正常显示；消息能正常回复；重启后连接还在。
4. **搜索和图片生成的 key 生效**（这一项依赖写 env）
   - 验证方式：搜索页确认至少一个服务已连接，在会话里让 Agent 联网搜索一次；如果配了图片生成，让 Agent 生成一张图。
   - 预期结果：搜索和图片生成都能调用成功，没有「未配置 key」之类的报错。

### 建议验证

1. **删 key 后立即失效**
   - 验证方式：在搜索页断开一个服务，再让 Agent 搜索。
   - 预期结果：不再走这个服务（按顺序换下一个，或者提示没有可用服务）。
2. **旧版本数据的迁移**
   - 验证方式：如果手上有更早版本的数据目录副本（v3 及以前），放进临时目录后用 `ACTSPACE_DATA_DIR` 启动。
   - 预期结果：设置迁移成功，目录里多出 `settings.v3.backup.json` 和 `.sha256`。

## Agent 已完成的验证

- typecheck：desktop 0 错误；settings 相关文件上开 `--noUnusedLocals` 也没有报错。
- 测试：desktop 文件 192 / 0 失败 / 1 跳过，用例 1547 / 0 失败 / 2 跳过。比 17 开始时（191 / 1509）多 1 个文件、38 个用例。
- 构建、`check:current-docs`、`check:frontend-tokens`、`check:frontend-theme`、`check:renderer-bridge` 通过；提交信息没有 U+FFFD。
- 搬迁核对：每批都用工具比对，搬走的声明正文和原文件一致；类方法规范化后（`this.` → `store.`、方法调用 → 函数调用）41 个里 39 个一致，另外 2 个是有意改写的 system prompt 读写。公开方法签名和导出逐个对比一致。
- 变异检查：T6、T7 各做一轮，先找到拦不住的改动，补用例后全部能拦住。
- Sonnet 只读复核：没有发现行为变化（await 顺序、串行包裹、回滚拷贝、同步 / 异步、import 有没有环、对外 API 都核对过）。
- Electron（构建产物，临时数据目录）：v3 迁移成 v4、备份逐字节一致；通过 bridge 写入的自定义连接和搜索 key 重启后保留，`secrets.json` 是 0600；设置页显示正常；没有应用层报错。截图在 `screenshots/`。

## 已知风险和遗留事项

- **没有用真实 key 验证**：中转站连通、真实搜索调用、图片生成，我都只能用假 key 走到写入和状态显示这一步。见「必须验证」3、4。
- **特征测试记下的现有问题**（17 不修，已记技术债「Desktop settings 遗留」）：
  - 旧接口 `update` / `updateV2` 改 agent 字段时，v4 里已有值就不会写进文件；
  - `restoreFilesBestEffort` 恢复 settings 失败时不再恢复 secrets；
  - v4 namespace 写入在字节落盘后才报错时，只恢复内存、不恢复文件。
- `SettingsStore` 的字段是 public。外面只能通过 `SettingsService` 用到它，`SettingsService` 把 store 设成 `private readonly`，所以对外边界和原来一样。

## 后续建议

- 这是 00 里的最后一份计划。全部验收通过后，按 00 §9 把 00、09–17 移到 `completed/`；`docs/desktop-frontend-refactor/` 的去留由你决定。
- 技术债里 settings 的三条可以作为一个单独的小计划修，现有特征测试改一下断言就能当回归测试。
