# Context 面板 · Bash 命令统计 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261102-context-bash-stats.md`
- **执行模式**：交互
- **开始时间**：2026-11-02 20:40
- **结束时间**：2026-11-02 21:30

## 执行时间线

### 步骤 1：T1 契约

- **操作**：`ContextPanelView` 新增可选 `bash`，新增 `ContextPanelBashCount`、`ContextPanelBashProgram`、`ContextPanelBashStats`。
- **影响文件**：`packages/util/shared/src/context-panel.ts`。
- **验证**：desktop typecheck 通过。

### 步骤 2：T2 命令解析器

- **操作**：新写一个小的分词器（没有照搬 DSH 的实现，规则对齐规范 §3.2）：引号、转义、`$(...)`、反引号、进程替换、`${...}` 整体当作词的一部分；heredoc 正文、注释跳过；`arr=(...)` 不拆、`(( ))` 不计。段首依次剥 `!` / 关键字、赋值、包装命令及其带值选项；`command -v` 整段不计。
- **影响文件**：`apps/desktop/src/main/runtime-v2/bash-programs.ts`、`apps/desktop/src/main/test/bash-programs.test.ts`。
- **决定**：包装命令比规范初稿多了 `doas` `noglob` `nocorrect`，导航多了 `pushd` `popd`，已同步回规范。
- **验证**：42 个用例通过。另用本机 177 条真实 Bash 命令跑了一遍：ls 54、grep 48、head 31、find 27、git log 15…，归入「其他」的 5 次都是确实不合法的写法（未加引号的正则、带空格的应用路径）。

### 步骤 3：T3 投影与查询

- **操作**：三张表加入 `contextTables`；`ensureContextBashTables` 在 Worker 打开库时补建（含 `building_*`）；`CONTEXT_PROJECTOR_VERSION = 2` 放进单独的 `context-history-version.ts`，投影、`sameTarget`、`usage-read-model.ts` 的重建判断都用它；`queryContextHistory` 返回 `bash`。
- **影响文件**：`context-history-projection.ts`、`context-history-query.ts`、`context-history-version.ts`、`usage-read-model.ts`、`usage-read-model-worker.ts`、`apps/desktop/src/main/test/context-bash-projection.test.ts`。
- **决定**：
  - `context_bash_call` 计入后不删行，只把 `occurrences_json` 置 NULL，同一批日志被重复投递时不会重复计数（与 `context_identity` 的去重方式一致）。规范原写“收到结果后删除”，已改。
  - 新增 `program_failed` 列：一次失败调用对每个程序只记一次失败（D5），子命令行仍各记一次。不加这列的话，`git status && git diff` 失败会让 `git` 记 2 次失败。
  - 版本常量单独成文件：`usage-read-model.ts` 只做 type import，不应为一个常量把投影代码拉进主进程。
- **验证**：9 个用例通过（含重放不翻倍、跨批配对、老库补表后整会话重建、500 组合上限）。

### 步骤 4：T4 组装

- **操作**：`ContextPanelService` 把 `stats` 的出现条件提成 `caughtUp`，`bash` 共用。
- **影响文件**：`context-panel-service.ts`。
- **验证**：服务测试：`ready` 时有值，`syncing` 时 `bash`、`stats` 都为 null。

### 步骤 5：T5 前端

- **操作**：`context-bash-model.ts`（耗时格式、占比、条形比例、程序数）、`ContextBash.tsx`、`ContextPanel.tsx` 接入、mock 数据（与 demo 同一组数字）。过渡视图底部说明改为「趋势、事件、路径和 Bash 命令需要后端数据，暂未提供」。
- **影响文件**：`components/right-panel/context/` 下三个文件、`mock/context-panel-fixture.ts`、`renderer/test/context-bash.test.tsx`、`renderer/test/context-panel.test.tsx`、`scripts/native-button-baseline.json`。
- **决定**：可展开的程序行用原生 `<button type="button">`：整行含条形和三列数字，`ui/Button` 的内边距与布局不适合，与 `ContextEntryList` 的展开行同理；基线 +1。
- **验证**：17 个用例通过；浏览器 mock 截图（浅色、深色、展开 git、480px 窄窗）与 demo 一致。截图时发现展开行的标题行没有底色（`bg-transparent` 覆盖），已修。

### 步骤 6：T6 文档

- **影响文件**：规范（状态、补充规则、表结构）、`front-右侧面板与文件渲染规范.md`（第 7 块、过渡视图说明、mock 说明）、`front-Context面板后端数据需求.md`（契约与数据来源）、计划、本目录、历史记录、`docs/exec-plans/README.md`。

## 遇到的问题

- **问题**：新 worktree 里 desktop typecheck 报找不到 `@actspace/shared`。
  - **原因**：共享包还没构建。
  - **应对**：跑 `build:deps:dev`。其中 `tsc -b` 报 `agent-service` 自己测试文件的类型错误，是 main 上已有的 tsconfig 引用缺口，与本改动无关；共享包产物已生成，typecheck 随后通过。

## 跳过或推迟的事项

- Electron 真实 Host 老会话对照：本次没有启动 Electron，留给人工验证（见执行摘要）。
