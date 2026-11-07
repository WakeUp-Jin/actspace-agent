# Context 面板 · Bash 命令统计

## 目标

右侧「上下文」面板最底下新增「Bash 命令」卡片，按会话统计 Bash 调用次数、失败次数、合计耗时和每个程序（含子命令）的使用次数与失败次数。数据从会话日志增量汇总，历史会话第一次打开面板时自动补齐。

设计规范：[front-Context面板Bash命令统计](design-archive/frontend/front-Context面板Bash命令统计.md)（下称“规范”）。视觉：[context-bash-demo.html](../../design-docs/frontend/context-bash-demo.html)。

## 范围

- 包含：命令解析器、上下文历史投影新增三张表与投影版本升级、读取契约 `ContextPanelView.bash`、`ContextBash` 卡片、mock 数据、文档同步。
- 不包含：规范 §6 列出的全部内容（逐条命令、失败占比、后台、按程序耗时、替代提示、Harness 统计页、PowerShell、改 Bash 工具、新日志事件）。

## 背景

- 必读：`AGENTS.md`、规范全文、`docs/design-docs/frontend/front-新功能开发清单.md`、`docs/design-docs/frontend/front-Context面板后端数据需求.md`、`docs/design-docs/frontend/front-右侧面板与文件渲染规范.md`「Context 面板」。
- 相关代码：
  - 投影：`apps/desktop/src/main/runtime-v2/context-history-projection.ts`（`contextTables`、`createContextHistorySchema`、`commitContextBatch`、`projectContextEvents`）。
  - 查询：`apps/desktop/src/main/runtime-v2/context-history-query.ts`（`queryContextHistory`、`ContextHistoryResult`）。
  - 同步：`apps/desktop/src/main/runtime-v2/usage-read-model.ts`（`contextHistory`，`projector_version !== 1` 的重建判断）。
  - Worker：`apps/desktop/src/main/runtime-v2/usage-read-model-worker.ts`（`open()`、`addSideChatColumn` 的补列先例）。
  - 组装：`apps/desktop/src/main/runtime-v2/context-panel-service.ts`（`stats` 的出现条件）。
  - 契约：`packages/util/shared/src/context-panel.ts`。
  - 前端：`apps/desktop/src/renderer/components/right-panel/context/ContextPanel.tsx`、`ContextPanelParts.tsx`、`ContextStats.tsx`。
  - Mock：`apps/desktop/src/renderer/mock/context-panel-fixture.ts`。
- 已知约束：
  - 不升级 `usage-read-model-schema.ts` 的 `user_version`（15），新表在 Worker 打开时补建。
  - 主 checkout 上另一分支 `codex/verfiy_two_1` 把 `user_version` 升到 16，本计划不碰它，避免冲突。
  - 会话日志里 Bash 的 `tool/call.args.command` 是原文（已在本机日志确认）；结果状态实际出现过 `completed`、`failed`、`denied`。

## 风险

- 解析器拆错：只影响统计；T2 用表驱动单测覆盖规范 §3.2 的全部例子和边界。
- 投影版本升级让老会话第一次打开面板时整会话重建：走现有分批重建，T3 测试覆盖“老版本状态 → 重建 → 有 Bash 数据”。
- 补建表遗漏 `building_*`：T3 测试从“缺新表的老库”打开并跑一次整会话重建。

## 任务

### T1 契约

- `packages/util/shared/src/context-panel.ts`：新增 `ContextPanelBashCount`、`ContextPanelBashProgram`、`ContextPanelBashStats`，`ContextPanelView` 新增 `bash?: ContextPanelBashStats | null`，字段注释按规范 §4.3。
- 验证：`pnpm --filter @actspace/shared typecheck`（或仓库现有的 shared 类型检查命令）通过。

### T2 命令解析器

- 新文件 `apps/desktop/src/main/runtime-v2/bash-programs.ts`，导出：
  - `parseBashPrograms(command: string): BashProgramOccurrence[]`，`BashProgramOccurrence = { program: string; subcommand: string }`，`""` 表示「其他」/ 无子命令；按出现顺序返回，重复出现重复返回。
  - `BASH_SUBCOMMAND_PROGRAMS`（8 个程序的集合）。
- 规则严格按规范 §3.2：16,000 字符上限；引号、反斜杠转义、`$(...)` 与反引号不拆不计；heredoc 正文跳过；注释跳过；关键字、赋值、重定向、包装命令及其选项剥离；`cd`、声明、语法段和 `$` 开头的命令不计；程序名取最后一段并校验；子命令跳过带值全局选项。
- 新测试 `apps/desktop/src/main/test/bash-programs.test.ts`：规范 §3.2 表格 7 个例子逐条断言；另加：单双引号内的 `&&` / `|` 不拆；`a\ b` 转义；`sudo -u x env A=1 nohup python3 x.py &`；`nice -n 10 make`；`time pnpm build`；`( cd x && make )`；`for f in *.ts; do wc -l "$f"; done` → `wc`；`pnpm --filter @actspace/desktop test`→`pnpm test`；`npm -w a run build`→`npm run`；`gh pr create`→`gh pr`；`git`（无子命令）→`git` + `""`；非法名（`$(which node)`、`'a b'`）；空串与纯注释返回空；超长输入只解析前 16,000 字符。
- 验证：`pnpm --filter @actspace/desktop exec vitest run src/main/test/bash-programs.test.ts` 全部通过。

### T3 投影与查询

- `context-history-projection.ts`：
  - 导出常量 `CONTEXT_PROJECTOR_VERSION = 2`，替换 `sameTarget`、`INSERT ... context_state` 里的字面量 1。
  - `createContextHistorySchema` 新增 `context_bash_stats(session_id PRIMARY KEY, calls, failed, duration_ms)`、`context_bash_program(session_id, program, subcommand, count, failed, PRIMARY KEY(session_id, program, subcommand))`、`context_bash_call(session_id, call_id, occurrences_json, started_at, PRIMARY KEY(session_id, call_id))`，并加入 `contextTables`。
  - 导出 `ensureContextBashTables(db)`：对三张表及其 `building_*` 表用 `CREATE TABLE IF NOT EXISTS`（SQL 与 `createContextHistorySchema` 共用同一份字符串）。
  - `commitContextBatch` 里 `INSERT OR IGNORE INTO context_bash_stats(session_id)`。
  - `projectContextEvents` 处理：`tool/call`（`name === "bash"` 且 `args.command` 是字符串）→ 解析并写 `context_bash_call`（`INSERT OR IGNORE`，`started_at` = 事件时间）；`tool-workflow/run-start`（`name === "bash"`）→ 更新 `started_at`；`tool/result`（`name === "bash"`）→ 找到 `context_bash_call` 行才计入：`status !== "denied"` 时 `calls+1`、`duration_ms += max(0, 结果时间 − started_at)`、`failed+1`（`status === "failed"`）；每个出现 `count+1`；`failed` 时每个不同的（程序, 子命令）`failed+1`、每个不同的程序 `program_failed+1`；然后把该行 `occurrences_json` 置 NULL（保留行去重）。组合数已达 500 时新组合写成 `("", "")`。
- `usage-read-model.ts`：重建判断改用 `CONTEXT_PROJECTOR_VERSION`。
- `usage-read-model-worker.ts`：`open()` 在 `addSideChatColumn(db)` 旁调用 `ensureContextBashTables(db)`。
- `context-history-query.ts`：`ContextHistoryResult` 新增 `bash: ContextPanelBashStats`，按规范 §4.3 排序（`""` 排最后），子命令只挂在 8 个程序下。
- 新测试 `apps/desktop/src/main/test/context-bash-projection.test.ts`（`vi.mock` `runtime-loader` 提供 `readPersistedContextManifest`；内存库 `createReadModelSchema`）：
  1. 一批里 completed / failed / denied 各一次 → `calls=2, failed=1`，denied 的程序不出现。
  2. `tool/call` 与 `tool/result` 分两批提交 → 正确配对；耗时取 `run-start` 到结果。
  3. 失败的 `cat a && cat b` → `cat` `count=2, failed=1`。
  4. 同一批事件以 `reset` 重放 → 数字不翻倍。
  5. 结果还没到 → 不计入。
  6. 老库：删掉三张新表后调用 `ensureContextBashTables` → 整会话重建可用；`context_state.projector_version=1` 时 `usage-read-model` 判定需要重建（断言常量与判断一致）。
  7. 排序与「其他」：非法程序名归 `""` 且排最后。
- 验证：`pnpm --filter @actspace/desktop exec vitest run src/main/test/context-bash-projection.test.ts src/main/test/context-paths.test.ts` 通过。

### T4 组装

- `context-panel-service.ts`：`view.bash` 与 `stats` 同一出现条件（`ready` 或 `fallback` 且 `result.revision >= targetThroughSeq`），否则 `null`；200 KB 裁剪逻辑不动 `bash`。
- 测试：在 `context-bash-projection.test.ts` 加一例，用假的 `UsageReadModelService.contextHistory` 返回带 `bash` 的结果，断言 `ready` 时有值、`syncing` 时为 `null`。

### T5 前端

- 新文件 `apps/desktop/src/renderer/components/right-panel/context/context-bash-model.ts`：`formatBashDuration(ms)`（`106ms` / `4.2s` / `1m52s` / `1h05m`）、`bashProgramRows(stats)`（算占比与条形宽度，`""` 显示为「其他」）。
- 新文件 `ContextBash.tsx`：按规范 §5 渲染；外观复用 `CARD_CLASS`、`CARD_HEAD_CLASS`、`CARD_TITLE_CLASS`、`CARD_META_CLASS`、`HelpHint`、`TRACK_CLASS`、`ShowMoreButton`（首屏 8 个，之后每次 20 个）；展开行用原生 `<button type="button">` + `ROW_FOCUS_CLASS` + `aria-expanded`；颜色只用主题 token。
- `ContextPanel.tsx`：在 `ContextEvents` 之后、`limits` 提示之前渲染 `{view.bash ? <ContextBash stats={view.bash} /> : null}`（仅 backend 分支）；更新顶部注释的区块数。
- `context-panel-fixture.ts`：mock 视图加 `bash`（与 demo 同一组数字）。
- 新测试 `apps/desktop/src/renderer/test/context-bash.test.tsx`：三格数字与失败色；程序行顺序、占比、失败文案；`git` 展开出子命令且 `aria-expanded` 切换；超过 8 个时「再显示」；`calls=0` 空状态；`bash` 为 `null` 时卡片不渲染（经 `ContextPanel`）。`context-bash-model` 的纯函数单测放同一文件或 `context-bash-model.test.ts`。
- 验证：`pnpm --filter @actspace/desktop exec vitest run src/renderer/test/context-bash.test.tsx src/renderer/test/context-panel.test.tsx` 通过。

### T6 文档

- `front-Context面板后端数据需求.md` §2 契约补 `bash` 字段并链接规范。
- `front-右侧面板与文件渲染规范.md`「Context 面板」：「六个区块」改为七个，加「Bash 命令」一节摘要并链接规范；入口说明里的区块列表同步。
- 规范状态行改为“已实现”。
- `docs/exec-plans/README.md` 当前进行中加本计划；完成后移入 `completed/` 并更新。
- `docs/histories/2026-11/20261102-HHmm-context-bash-stats.md`。
- `docs/exec-runs/20261102-context-bash-stats/` 的过程与摘要。

### T7 验证

- `pnpm --filter @actspace/desktop typecheck`
- `pnpm --filter @actspace/desktop test`
- `pnpm check:frontend-tokens`、`pnpm check:frontend-theme`、`pnpm check:renderer-bridge`、`pnpm check:current-docs`、`pnpm check:docs`
- 浏览器 mock：默认场景打开右侧「上下文」，截图浅色、深色、480px 窄窗，展开 `git`。
- Electron 真实 Host：打开一个用过 Bash 的老会话，确认第一次打开会补齐，数字与日志一致（用脚本统计该会话日志对照）。做不了时在执行摘要里写明未验证。

## 验证方式

见 T7。通过标准：上述命令全部成功；截图与 demo 一致；老会话对照数字一致。

## 回退

单分支、单 PR。回退即 revert PR；`projector_version` 回到 1 会让已升到 2 的会话再重建一次，无数据损失（统计库可重建）。新表留在老库里不影响旧代码。

## 进度记录

- [x] T1 契约
- [x] T2 解析器（42 个用例；本机 177 条真实命令抽查）
- [x] T3 投影与查询（9 个用例）
- [x] T4 组装
- [x] T5 前端（17 个用例；浏览器 mock 浅色 / 深色 / 展开 / 480px 截图）
- [x] T6 文档
- [x] T7 验证：typecheck、desktop 全量测试、前端三项检查通过；`check:docs` 只剩 main 上已有的 363 条 exec-runs 链接失败。Electron 真实 Host 老会话对照未做，见[执行摘要](../../exec-runs/20261102-context-bash-stats/execution-summary.md)。

## 决策记录

- 2026-11-02：用户确认 D1–D6（位置、三个数、程序分布与子命令、出现即计、失败按程序去重、砍掉的内容）。
- 2026-11-02：D7–D10 由本计划决定：被拒绝的调用不计；结果到了才计；只存名字；走上下文历史投影、补建表、投影版本 1→2，不升使用统计库 Schema。
- 2026-11-02（实现中）：`context_bash_call` 计入后保留行去重，不删除；`context_bash_program` 加 `program_failed`，保证一次失败调用对每个程序只记一次；版本常量放 `context-history-version.ts`，主进程不加载投影代码；`ContextBash` 的展开行用原生按钮，`native-button-baseline.json` +1。

## 执行模式

交互模式。分支 `feat/bash-command-stats`，worktree `../actspace-agent-bash-stats`；完成后提 PR 到 `main`。

## 执行文档

`docs/exec-runs/20261102-context-bash-stats/execution-process.md`、`execution-summary.md`。
