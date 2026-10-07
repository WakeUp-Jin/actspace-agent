## 2026-10-07 08:40 | Task: Desktop 前端重构 17：settings-service 拆分

### 执行上下文

- Agent：Claude Code 主智能体；只读复核子智能体用 Sonnet 5.5。
- Base Model：Claude Opus 5.5。
- Runtime：Claude Code CLI，本机仓库；分支 `refactor/desktop-fe-17`。
- 状态：完成（2026-10-07），待验收。子分支 `refactor/desktop-fe-17`（`ec7dca02`..`6f869aa6`，15 个提交），squash 到 `refactor/desktop-frontend` 为 `fcdc0de5`。

### 用户诉求

> 按 00 总执行计划连续执行 Desktop 前端重构；最后一份是 17：把 2637 行的 `apps/desktop/src/main/settings-service.ts` 按职责拆到 `settings/` 下，`SettingsService` 只留门面。纯搬迁，文件格式、迁移、回滚、写 env 的时机和对外 API 都不变；动手前先补特征测试。

### 主要改动

- **特征测试先行**：搬迁前写了 38 条（T1 28 条，T6、T7 变异检查后各补 6、4 条），覆盖迁移和备份、v4 读写、secrets 加密与 0600、回滚、串行与 revision 冲突、custom connection、写 env、v4 变更通知、system prompt 文件。黄金结果提交成 JSON。
- **纯函数模块**：types、constants、utils、atomic-io、secrets-file、sanitize、custom-connection、defaults、migrations，声明逐字搬走。
- **store**：内存状态、读写文件、回滚、串行队列、v4 变更通知集中在 `settings/store.ts`；`applyToEnv` 原样搬到 `settings/env.ts`；system prompt 文件读写搬到 `settings/system-prompt-file.ts`。
- **facades 与门面**：原类的方法改成第一个参数是 store 的函数，按领域分成 media、search、general、providers、custom-connections；`SettingsService`（`settings/service.ts`）只做转发，37 个公开方法签名不变。
- **入口**：`settings-service.ts` 2637 行 → 21 行 barrel，13 个导出不变，调用方不用改。
- **没有改**：文件格式、迁移、回滚、写 env 的时机、对外 API。特征测试发现的 3 处现有问题记进技术债「Desktop settings 遗留」，17 不修。
- **验证**：typecheck、build、四项脚本检查通过；desktop 用例 1547 通过（基线 1509 + 38）；Sonnet 只读复核没有发现行为变化；Electron 临时数据目录下检查了 v3 迁移、写入和重启后保留。

### 学习沉淀

主要结论（搬迁前后用变异检查看测试守住了什么）已经写在 09 的 [搬家式重构：先用变异测试看看测试到底守住了什么](../../learnings/2026-10/20261007-mutation-check-for-moves.md)，17 的 T6、T7 又各印证一次，不新写。vitest 快照因 realpath 不一致失效的问题记在执行过程「遇到的问题」；原因没有完全查实，不单独成文。

### 设计动机

`settings-service.ts` 把类型、迁移、sanitize、原子写、回滚、串行队列和写 env 都放在一个 2637 行的文件里。改其中一块时很难确认没有碰到回滚和串行。拆分后，回滚和串行只在 `settings/store.ts` 一处，其余是按领域划分的纯函数和 facade。

### 文件

- `apps/desktop/src/main/settings-service.ts`（改为 barrel）
- `apps/desktop/src/main/settings/`：`service.ts`、`store.ts`、`env.ts`、`system-prompt-file.ts`、`types.ts`、`constants.ts`、`utils.ts`、`atomic-io.ts`、`secrets-file.ts`、`sanitize.ts`、`custom-connection.ts`、`defaults.ts`、`migrations.ts`
- `apps/desktop/src/main/settings/facades/`：`media.ts`、`search.ts`、`general.ts`、`providers.ts`、`custom-connections.ts`
- `apps/desktop/src/main/test/settings-characterization.test.ts`、`apps/desktop/src/main/test/fixtures/settings/`
- `docs/design-docs/core-storage-and-observability.md`、`docs/ARCHITECTURE.md`、`docs/desktop-frontend-refactor/01-安全与IPC收口.md`、`docs/exec-plans/tech-debt-tracker.md`
- `docs/exec-plans/active/20261005-desktop-frontend-refactor/17-settings-service拆分执行计划.md`、`00-总执行计划.md`
- `docs/exec-runs/20261005-desktop-fe-17-settings-split/`
