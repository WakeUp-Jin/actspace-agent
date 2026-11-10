# 代码库审查修复 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261110-codebase-review-fixes.md`
- **执行模式**：夜间（Cursor Cloud Agent，云端 Linux VM，用户离线）
- **开始时间**：2026-11-10 15:36（UTC，下同）
- **结束时间**：进行中，见最后一个步骤

## 执行时间线

### 步骤 0：准备

- **操作**：读 `docs/REPO_COLLAB_GUIDE.md`、`docs/PLANS_GUIDE.md`、`docs/HISTORY_GUIDE.md`、`CONTRIBUTING.md`、`docs/ARCHITECTURE.md`、`packages/README.md`、`docs/coding-standards/perf-memory-conventions.md`、`docs/CICD.md`；`git pull --ff-only origin main` 到 `2738ecd0`；`pnpm install --frozen-lockfile` 与 `pnpm build:deps` 通过（Node 22.23.4，pnpm 10.33.0）。
- **决定**：8 个 PR 排成一条线性栈，每个 PR 的 base 是上一个 PR 的分支，合并方式用 merge commit。理由写在计划的「决策记录」。
- **验证**：只读查询确认 `main` ruleset：1 个 approve、strict、必需检查只有 `仓库基础检查`；合并后自动删分支。

### 步骤 1：PR 1，CI 门禁（H2）

- **操作**：
  1. `main` 的 `仓库基础检查` 从 #78 起是红的（markdownlint MD045，6 张图没有 alt）。先补 alt，否则这批 PR 每一个都带着这个失败。
  2. `ci.yml` 去掉工作流级 `paths-ignore`，新增 `changes` 与 `ci-gate` 两个 job，八个工程 job 加 `needs` 与 job 级 `if`。
  3. 同步 `base-checks.yml` 的头注释与 `docs/CICD.md`。
  4. 写本计划、登记到 `docs/exec-plans/README.md`、建执行记录。
- **影响文件**：`docs/design-docs/site-v6/README.md`、`.github/workflows/ci.yml`、`.github/workflows/base-checks.yml`、`docs/CICD.md`、`docs/exec-plans/active/20261110-codebase-review-fixes.md`、`docs/exec-plans/README.md`、`docs/exec-runs/20261110-codebase-review-fixes/*`、`docs/histories/2026-11/20261110-1550-ci-gate-required-check.md`。
- **决定**：
  - `changes` 用 `git diff --name-only --no-renames -z HEAD^1 HEAD`。`-z` 是因为默认输出会给中文路径加引号和转义，`docs/*` 这类模式匹配不上；`--no-renames` 是因为开着改名检测时「代码文件改名成文档」只列出新路径，会被判成纯文档。
  - `ci-gate` 用 `if: always()` 而不是 `!cancelled()`：运行被取消时汇总 job 也要跑并失败，否则它的结果是 skipped，ruleset 会当成通过。
  - 纯文档的判定范围和原 `paths-ignore` 一字不差，不借机调整。
- **验证**：
  - 在临时仓库里造 merge commit 模拟五种改动，`changes` 的判断脚本输出：纯文档（含中文文件名、`docs/` 下的 JSON、issue 模板）`code=false`；代码、代码改名成文档、工作流文件、中文路径的代码文件都是 `code=true`。
  - YAML 解析后 9 个 job 的 `needs` / `if` 符合预期；`./scripts/check-action-pinning.sh` 通过。
  - `./scripts/ci.sh` 通过；`npx -y markdownlint-cli2@0.24.0 "**/*.md"` 0 条。
  - PR 上的实际运行结果：[#83](https://github.com/WakeUp-Jin/actspace-agent/pull/83) 的 `仓库基础检查`、`变更范围`、`Lint 与类型检查`、`包测试`、`桌面端测试 (1/2)`、`桌面端测试 (2/2)`、`仓库脚本与进程级测试`、`构建`、`官网`、`Browser Bridge`、`CI 汇总` 和 CodeQL 全部通过。

### 步骤 2：PR 2，工具结果体积上限（H4）

- **操作**：按计划的四层依次做，每层一个或两个提交。
  1. 工具自己设限：`read_file` 改成按需流式读取并限制输出，`list_directory` 限制输出；`write_file`、`edit_file` 限制 diff；目录卡片的条目数改读 `detail`。
  2. tool-runtime 兜底：`boundToolResult` 在 `finalize()` 里按序列化后的字节数检查结果的各部分。
  3. 回合收尾：恢复计划支持只了结请求和工具调用、不关回合；Agent Loop 的失败处理调用 `settleOpenTurnWork`。
  4. 按窗口的批次额度：Agent Loop 算这一批的合计额度，tool-runtime 的 `ToolOutputBudget` 在一批内部分配。
  5. 文档：`agent-tool-output-references.md` 新增「工具结果的体积上限」一节，同步 Session 格式规范、Tool Runtime ABI、渐进式披露文档、`packages/core/README.md`、`packages/fs/README.md`、更新日志。
- **影响文件**：见 `docs/histories/2026-11/20261110-1710-tool-result-size-limits.md`。
- **决定**：
  - 第 3 层做的过程中发现两个原计划没写到的情况。一是请求只写了 `request/start`、`request/context` 这条写不进去（它本身可能超过 1 MiB）：恢复计划原先假设每个打开的请求都有 context 记录，这时直接报错。改成事务里先补一条只带标识的 `request/context`。二是失败处理原先只在没有打开的请求和工具调用时才写 `step/end` 和 `turn/end`，所以回合一直开着；这正是会话卡死的直接原因。
  - 第 4 层的额度算法、一批内部怎么分、不为中文修正估算，三条写在计划的「决策记录」。
  - 现有用例「压缩失败后不发送已知超限的请求」原先靠一条 30,000 字符的工具结果撑爆 5,000 token 的窗口。有了额度之后这条结果会被截短，用例不再报错。保留用例的意图，把超限的来源换成截不掉的内容（19,000 字符的用户消息）。
- **验证**：
  - 改到的包各自的测试：`tool-fs-read` 20 个、`tool-fs-write` 11 个、`agent-loop` 87 个、`session-persistence` 55 个、`client` 94 个全部通过；`tool-runtime` 83 个里 80 个通过，3 个在云端 VM 上失败，原因见下面「遇到的问题」，与这次改动无关，在 GitHub 的 CI 上通过。
  - 额度的集成用例做了反向验证：把 Agent Loop 传额度的那一行临时改成不传，3 个用例失败，其中「小窗口下一批并行读取」报 `Context exceeds model capacity (30197 estimated input tokens … / 20000)`；改回后通过。
  - `pnpm check:hot-path-reads`、`pnpm check:scale-tests` 通过。`settleOpenTurnWork` 只读当前回合 `turn/start` 之后的记录；额度每个有工具调用的 Step 算一次，只估算系统提示词、工具定义和当前助手消息。

## 遇到的问题

- **问题**：`main` 的必需检查是红的。
  - **原因**：#78 新增的 `docs/design-docs/site-v6/README.md` 有 6 张图没有 alt，markdownlint MD045。
  - **应对**：作为 PR 1 的第一个提交修掉。
- **问题**：`tool-runtime` 的 `runtime.test.ts` 有 3 个用例在云端 VM 上失败（「allows read-only capability use…」和两个 Session Grant 用例）。
  - **原因**：用例把 `/workspace` 当成真实目录，这台 VM 上它是符号链接，规范化之后路径对不上。这就是审查条目 M6，`main` 上同样失败，GitHub 的 CI 机器上没有这个目录所以通过。
  - **应对**：PR 2 不动它，PR 3 改用临时目录。PR 2 本地验证时这 3 个按已知失败处理。
- **问题**：工具调用的参数对象或工具返回的 json 块里有名为 `authorization`、`apikey`、`api_key`、`secret`、`password`、`cookie` 的字段时，会话记录拒绝写入，这一轮失败。
  - **原因**：`session-journal` 对每条记录的字段名做扫描（不看字符串内容），命中就拒绝。这是有意的安全规则，不是这次引入的；但它意味着一个工具返回带 `password` 字段的结构化结果，或模型调用工具时参数里嵌着 `headers.authorization` 这样的对象时，这一轮会失败。
  - **应对**：不改这条规则。PR 2 的回合收尾让这种失败之后会话可以继续用（原先会卡死）。是否把「拒绝」改成「脱敏后写入」留给用户决定，写进执行摘要。

## 跳过或推迟的事项

- M4（每条命令起一个登录 shell）：需要 macOS 实机验证，云端只有 Linux；用户也还没有给出本机的耗时对比。不做。
- L3（`App.tsx` 拆分）：按已有计划 `20261110-app-assembly-split.md`，不在这批。

## 夜间模式补充记录

夜间模式没有人工审批环节，以下操作在交互模式下通常需要人工确认，在此记录：

- 推送分支并创建 PR：每个 PR 一个 `cursor/review-0N-*-e412` 分支。没有合并任何 PR，没有强制推送，没有改 GitHub 设置（Agent 的 GitHub 权限是只读加「创建 / 更新 PR」）。
- 修改 CI 工作流（`.github/workflows/ci.yml`）：改动只影响触发条件和新增两个不执行仓库代码的 job，没有改 permissions、没有新增 action、没有引入 secret。
