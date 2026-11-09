# Context 面板 · Bash 命令统计

> 归档：现行规则已并入 [Context 面板规范](../../../../design-docs/frontend/front-Context面板规范.md)；本文保留当时的决策表、存储设计与交接记录。

更新：2026-11-04。状态：已实现（浏览器 mock 已验，Electron 真实会话待验）。执行计划见 [20261102-context-bash-stats](../../20261102-context-bash-stats.md)；视觉以 `context-bash-demo.html`（已删除，结论见现行上下文面板规范） 为准。

## 1. 为什么做

上下文面板能看出模型上下文里有什么，但看不出 Agent 用 Bash 干了什么：`cat` 跑了几次、`git status` 跑了几次、哪些命令老是失败。这些是判断要不要调整提示词或工具的依据。

参考了 DSH 插件 dsh-context 的「命令执行」面板（`src/client/components/commandPanel.tsx`、`src/shared/commands.ts`），只取其中的统计部分。

## 2. 已确认的决策

| # | 决策 | 来源 |
|---|---|---|
| D1 | 放在右侧「上下文」面板最底下，单独一张卡片「Bash 命令」，只统计当前会话 | 用户 2026-11-02 |
| D2 | 卡片顶部三个数：调用次数、失败次数、合计耗时。失败只写次数，不写占比 | 用户 2026-11-02 |
| D3 | 下面是程序分布：程序名、条形、×N、占比、失败次数；`git` `pnpm` `npm` `yarn` `cargo` `go` `gh` `docker` 可展开看子命令 | 用户 2026-11-02 |
| D4 | 程序在命令里出现一次就记 1 次：`cat a && cat b` 记 `cat` ×2 | 用户 2026-11-02 |
| D5 | 一次调用失败时，里面出现过的每个程序各记 1 次失败（同一程序出现多次也只记 1 次） | 用户 2026-11-02 |
| D6 | 不做：逐条命令列表、展开看输出、筛选与搜索、失败占比、按程序拆耗时。看具体某条命令去轨迹。**「最慢 / 重复命令」提示、后台次数已做**：2026-11-04 用户改为要做「值得注意」区块，见 §5.1 | 用户 2026-11-02；2026-11-04 改 |
| D7 | 被拒绝（`status: "denied"`，策略拒绝或用户拒绝）的调用不计：命令根本没跑 | 本文 |
| D8 | 只有 `tool/result` 到了才计入；还在跑的调用不计，结束后自动计入 | 本文，与 DSH 一致 |
| D9 | 程序统计只存程序名和子命令名。为「值得注意」（§5.1）另存命令原文，每条最多 1000 个字符，仅用于最慢 / 重复命令两行 | 本文；2026-11-04 补 |
| D10 | 数据走现有的上下文历史投影（打开面板时按需增量汇总），不升级使用统计库的 Schema 版本 | 本文，见 §4 |
| D11 | 表格里程序名与表头「程序」左对齐，不缩进；可展开程序的箭头放在程序名之后，不占名字前的位置 | 用户 2026-11-04 |

## 3. 计数口径

### 3.1 哪些调用算

数据来自会话日志，不新增日志事件：

| 指标 | 来源 |
|---|---|
| 命令原文（只用来解析，不保存） | `tool/call`，`name === "bash"`，`args.command` |
| 开始执行时间 | `tool-workflow/run-start`（审批之后、执行之前写入）；没有时用 `tool/call` 的时间 |
| 结果 | `tool/result` 的 `status` |

- **调用**：`tool/result.status` 不是 `denied` 的 Bash 调用数。`completed`、`failed`、`aborted`、`cancelled` 及其他状态都算。
- **失败**：`status === "failed"`。包括非零退出码（`BASH_EXIT_NONZERO`）、超时、被沙箱拦下。用户中途停止（`aborted` / `cancelled`）不算失败。
- **合计耗时**：每次调用从开始执行到 `tool/result` 的时间差之和。不含等待审批的时间。转到后台运行的命令只算到转入后台为止。
- 同一个 `callId` 只计一次：重放同一批日志不会重复计数。

### 3.2 从命令里拆出程序

解析器只看命令文本的前 16,000 个字符。规则大体照搬 DSH，另外加了子命令：

1. **拆段**：在引号外按 `&&`、`||`、`;`、`|`、`&`、换行和 `(` `)` `{` `}` 拆开。`$(...)` 和反引号里的内容不拆、也不计。heredoc（`<<EOF` 到 `EOF`）的正文跳过。`#` 开头的注释跳过。
2. **每段找程序**，依次去掉：
   - 开头的 `!`；
   - shell 关键字 `if` `then` `else` `elif` `do` `while` `until`；
   - 环境变量赋值 `FOO=1`；
   - 重定向 `2>&1`、`>/dev/null`、`> file`；
   - 包装命令 `sudo` `doas` `env` `command` `exec` `time` `nohup` `nice` `stdbuf` `timeout` `caffeinate` `noglob` `nocorrect`，连同它们自己的选项（`sudo -u x`、`timeout 30`、`nice -n 10`、`env A=1`）。`command -v` / `command -V` 只是查找，整段不计。
3. **不算程序的段**：`cd` `pushd` `popd`（导航）；`export` `local` `declare` `readonly` `typeset`（声明）；`for` `case` `select` `function` `coproc` `done` `fi` `esac` `[` `[[` 这类语法；`(( ))` 算术；以 `$` 开头的变量命令（包括 `$(which node) --version`）。
4. **程序名**：取路径的最后一段（`/usr/bin/git` → `git`，`./scripts/run.sh` → `run.sh`）。名字必须匹配 `^[A-Za-z0-9._@+-]{1,64}$`，不匹配的归入「其他」。
5. **子命令**：只对 `git` `pnpm` `npm` `yarn` `cargo` `go` `gh` `docker` 取一层。取法是跳过选项后的第一个参数；会带值的全局选项连值一起跳过（`git -C dir`、`git -c k=v`、`pnpm --filter x`、`pnpm -F x`、`pnpm -C dir`、`pnpm --dir dir`、`npm --prefix x`、`npm -w x`、`npm --workspace x`、`yarn --cwd x`、`docker --context x`、`docker -H x`、`gh -R x`、`gh --repo x`）。没有子命令或名字不合法的，记在「其他」下。

例子：

| 命令 | 记为 |
|---|---|
| `cd src && pnpm test \| tail -20` | `pnpm test` ×1、`tail` ×1 |
| `cat a && cat b` | `cat` ×2 |
| `FOO=1 timeout 30 node build.js > out.log 2>&1` | `node` ×1 |
| `if [ -f x ]; then cat x; fi` | `cat` ×1 |
| `git -C pkg status && git diff` | `git status` ×1、`git diff` ×1 |
| `echo "$(date)"` | `echo` ×1（`date` 在 `$(...)` 里，不计） |
| `python3 - <<'EOF'`（正文多行） | `python3` ×1 |

## 4. 数据与存储

### 4.1 位置

上下文面板的会话统计（轮次、步数、压缩等）已经由 `apps/desktop/src/main/runtime-v2/context-history-projection.ts` 在打开面板时从会话日志增量汇总进 SQLite（`usage-read-model.sqlite`，Worker 里执行）。Bash 统计放进同一个投影，跟着同一批日志一起算。

新增五张表（前三张是初版，后两张 2026-11-04 为「值得注意」补充），都以 `session_id` 开头，加入 `contextTables`，所以会话清理、整会话重建（`building_*` 暂存再发布）自动覆盖：

| 表 | 粒度 | 列 |
|---|---|---|
| `context_bash_stats` | 每会话一行 | `calls`、`failed`、`duration_ms` |
| `context_bash_program` | 会话 × 程序 × 子命令 | `program`（`""` = 其他）、`subcommand`（`""` = 无 / 其他）、`count`、`failed`（这一组合的失败调用数）、`program_failed`（程序级失败：一次失败调用只记在该程序本次第一次出现的那一行） |
| `context_bash_call` | 每个 Bash 调用一行 | `call_id`、`occurrences_json`（解析结果与命令原文 `{ occurrences, command }`；计入后置为 NULL）、`started_at`；行保留用来去重 |
| `context_bash_command` | 会话 × 命令原文 | `command`（去首尾空白、最多 1000 字符）、`count`；每会话最多 500 条不同命令，超出的新命令不再参与重复统计 |
| `context_bash_notable` | 每会话一行 | `slowest_command`、`slowest_ms`（最慢的单条，同耗时保留先出现的）、`background_count` |

`context_bash_call` 用来跨批次配对 `tool/call` → `run-start` → `tool/result`，计入后保留行，同一批日志被重复投递也不会重复计数。`occurrences_json` 只存程序名和子命令名。程序行的失败数取 `SUM(program_failed)`，子命令行取 `failed`，所以 `git status && git diff` 失败时 `git` 记 1 次失败，`status`、`diff` 各记 1 次。

每个会话的程序与子命令组合最多 500 行；超出后新出现的组合归入「其他」。

### 4.2 老库与历史会话

- **不升级** `usage-read-model-schema.ts` 的 `user_version`（当前 15）。升级会让整个使用统计库重建，代价过大。Worker 打开库时用 `CREATE TABLE IF NOT EXISTS` 补建这些表和对应的 `building_*` 表，方式与现有的 `addSideChatColumn` 相同。
- 上下文投影版本 `projector_version` 从 1 升到 2（2026-11-04 为「值得注意」再升到 3），抽成常量 `CONTEXT_PROJECTOR_VERSION`（`context-history-version.ts`，主进程只引这个常量）。老会话第一次打开上下文面板时会因为版本不一致整会话重建一次，Bash 统计随之补齐。这条路径是现有的，与 `codec` 变化时的重建相同。

### 4.3 读取契约

`@actspace/shared` 的 `ContextPanelView` 新增可选字段：

```ts
export type ContextPanelBashCount = { name: string; count: number; failed: number };
export type ContextPanelBashProgram = ContextPanelBashCount & { subcommands: ContextPanelBashCount[] };
export type ContextPanelBashStats = {
  calls: number;
  failed: number;
  durationMs: number;
  /** 按 count 降序、同数按名字；name 为 "" 表示「其他」，固定排最后。 */
  programs: ContextPanelBashProgram[];
  /** 「值得注意」，没有数据时为 null / 0；缺省表示旧后端。 */
  slowest?: { command: string; durationMs: number } | null;
  mostFailedProgram?: { program: string; count: number } | null;
  mostRepeated?: { command: string; count: number } | null;
  backgroundCount?: number;
};
// ContextPanelView
bash?: ContextPanelBashStats | null;
```

- 与 `stats` 同一个出现条件：历史索引 `ready` 或 `fallback` 且已追上目标位置时给值，否则为 `null`。
- `subcommands` 只对第 3.2 节第 5 条那 8 个程序有内容，排序规则同上。
- `programs` 不截断（每会话最多 500 个组合，体积可控）；面板响应超过 200 KB 时现有的裁剪逻辑不动 `bash`。

## 5. 界面

视觉以 [context-bash-demo.html](../../../../design-docs/frontend/context-bash-demo.html) 为准，组件放在 `apps/desktop/src/renderer/components/right-panel/context/ContextBash.tsx`，外观复用 `ContextPanelParts` 的 `CARD_CLASS` 等常量。

- **位置**：`ContextPanel` 里「上下文事件」之后、底部注释之前。只在后端数据源（`data.source === "backend"`）且 `view.bash` 不为 `null` 时显示。
- **标题行**：「Bash 命令」，不带 `?`、不写口径说明（2026-11-04 起界面文案不解释口径，见[全局视觉语言规范](../../../../design-docs/frontend/front-文案与状态表达规范.md)「界面文案与说明文字」；口径以本文 §3 为准）。右侧写「N 个程序」（不含「其他」）。
- **三格**：调用 N 次、失败 N 次（大于 0 时数字用 `text-danger`）、合计耗时（不带 `?`）。耗时格式 `106ms` / `4.2s` / `1m52s` / `1h05m`。
- **值得注意**：放在三格与程序分布之间，见 §5.1。
- **程序分布**：
  - 表头「程序 … 次数」。
  - 每行：程序名（等宽字体，与表头「程序」左对齐；带子命令的程序在名字后面跟展开箭头）、条形（按最多的程序缩放，颜色用 `--act-context-tools`）、`×N`、占比（占所有程序出现次数的百分比，取整）、失败次数（大于 0 才显示「N 失败」，`text-danger`）。
  - 点开后在下方缩进列出子命令，列同上，不显示占比。
  - 默认显示前 8 个程序，其余用「再显示 N 项」展开。
- **空状态**：`calls === 0` 时只显示标题和「本会话还没有调用过 Bash。」。
- 浅色、深色主题都要验过；360px 宽的面板里程序名过长时截断并在 `title` 里给全名。

### 5.1 值得注意（2026-11-04）

用户参考竞品加的区块：标题「值得注意」加一条细分隔线，下面最多四行，每行是浅底色圆角条（行间小间距）：左侧彩色圆点、标签、中间命令 / 程序原文（等宽、单行截断、悬停 `title` 给全文）、右侧数值（`tabular-nums`，与圆点同色）。不加说明文字和 `?` 提示。

| 行 | 圆点 / 数值色 | 中间 | 数值 | 数据 |
|---|---|---|---|---|
| 最慢 | `warning` | 耗时最长的单条命令原文 | 耗时（同「合计耗时」的格式） | `slowest`，耗时口径与「合计耗时」同一个来源：不含等待审批，转后台的只算到转入后台为止 |
| 失败最多 | `danger`（与「失败 N 次」一致） | 失败调用次数最多的程序名 | `×N` | `mostFailedProgram`，口径同程序行的「N 失败」，不含「其他」 |
| 重复最多 | `chart-series-3`（与程序条形同为紫色） | 完全相同的命令原文中出现次数最多的一条 | `×N` | `mostRepeated`，最多只出现 1 次时不给 |
| 后台任务 | `success` | 空 | `×N` | `backgroundCount`：结果带 `background-task` 明细的 Bash 调用数（与轨迹里「后台」标记同一判据） |

- 没有数据的行不显示；四行都没有时整个区块不显示；`calls === 0` 时也不显示。
- 同数时：最慢保留先出现的；失败最多、重复最多按名字排序取前。
- 被拒绝的调用不参与任何一行（命令根本没跑）。
- 命令原文只存前 1000 个字符，重复判断按截断后的文本；这是 D9 的唯一例外，只用于这两行。

## 6. 不做什么

- 不做逐条命令列表、执行输出、退出码明细；命令原文只出现在「值得注意」的最慢 / 重复两行。
- 不做失败占比、按程序拆耗时、「可用专用工具替代」之类的提示。
- 不进「Harness 统计」页，不做跨会话汇总。
- 不解析 PowerShell。
- 不新增会话日志事件，不改 Bash 工具本身。

## 7. 风险

| 风险 | 缓解 |
|---|---|
| 解析器把复杂 shell 拆错 | 只做统计，不影响执行；单测覆盖 §3.2 全部例子和常见边界（引号、转义、heredoc、子 shell、包装命令）；拆不出程序的段直接跳过 |
| 老会话第一次打开时整会话重建变慢 | 走现有的分批、让出、进度显示逻辑；只在第一次打开时发生 |
| 与其他分支同时改 `contextTables` 或投影版本 | 新表用独立名字；投影版本改成常量，冲突时取较大值 |
