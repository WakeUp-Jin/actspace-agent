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
  - PR 上的实际运行结果：[#84](https://github.com/WakeUp-Jin/actspace-agent/pull/84) 的 15 项检查全部通过，包括步骤 1 列出的那些和 CodeQL；本地失败的 3 个 `tool-runtime` 用例在 CI 上通过。

### 步骤 3：PR 3，修复合集（M6、M9、M7、M3、L2、L9）

- **操作**：六个条目各自一个或几个提交，顺序是 M6、M9、M7、M3、L2、L9。
  1. **M6**：`tool-runtime` 的 runtime 测试改用真实临时目录当工作区；JSONL 增量读在文件大小和时间戳都没变时再比对末尾 4 KiB。
  2. **M9**：位置索引抽成 `session-projection-cache/src/history-index.ts`；`session-controller.ts` 的读路径改成就地维护索引、只读窗口内的事件；`subagent/src/manager.ts` 去掉两处整份遍历；规模测试与登记。
  3. **M7**：线上错误分三类（`HostRequestError`）；分块下载只读请求的范围，完整性校验按文件版本记住（`verified-content.ts`）；上传暂存配额从内存里算。整理没做的事项时核对代码，发现上传目录里有名字不是上传 id 的条目（如 `.DS_Store`）时清理会抛错，Host 启动不了或运行中转成不接收新任务；这是原有问题，补了一个提交（`70f6fa3d`）让扫描跳过这类条目。
  4. **M3**：`tool-web/src/public-request.ts`，域名只解析一次、连接只连检查过的地址，地址分类改用 `net.BlockList`。
  5. **L2**：`biome.jsonc` 打开 `useHookAtTopLevel`，两个方法改名。
  6. **L9**：子进程环境多剥几类凭据；ripgrep 输出改由流自己解码；输出订阅的正则放到 worker 线程。
- **影响文件**：见 `docs/histories/2026-11/20261110-1950-review-fixes-session-host-web-shell.md`。
- **决定**：都写在计划的「决策记录」。和计划不一致的地方：
  - M9 里审查点名的 `jsonl-reader.ts` 数组复制量过之后不改；「每次读重建整份快照」和「第一次读回放读模型」没有动，数字和线索写进 `docs/exec-plans/perf-backlog.md`。
  - L2 打开规则后报了 4 处、两个方法名，计划写的是 1 处。
  - L9 的环境变量检查第一版是一条带协议前缀的正则，提交前量出它是平方耗时（50 KB 的值 2.2 秒，200 KB 约 35 秒），换成先找 `://` 再用粘性正则匹配。
- **验证**：
  - **M6**：3 个用例在 `/workspace` 是符号链接的这台 VM 上通过。增量读新增一个确定性用例：用测试钩子固定 `stat` 的结果，模拟同一个时钟刻度内的等长改写。
  - **M9 规模测试**：`session-read-projection.scale.test.ts` 比较 1k 与 10k 事件的会话，读一屏、翻页、展开工具详情从归档读的事件数相同。把读路径换回旧实现，它失败：第一次读把归档过两遍（比重复读多 1,888 / 19,888 条，应为 944 / 9,944），展开工具详情读 944 / 9,944 条而不是 2 条。
  - **M9 等价性**：用 4 种会话形态、7,806 组读取参数把新旧实现的返回内容逐字节对拍，全部一致。对拍脚本没有入库。
  - **M9 变异检查**：在新的读路径上选 13 个点各改错一处（偏移加一、比较符号、少读一条、不维护索引等），看入库的测试能不能发现。写这份记录时重跑：10 个被发现；`requestOffset` 多算一条和工具详情延后阈值的 `>` 写成 `>=` 两处发现不了，于是补了两条边界用例（`fbc8b2cf`），现在 12 个被发现。剩下 1 个（去掉对齐前的 `nextStart < until` 判断）不改变结果，那个判断只是省掉一次扫描。
  - **M9 非正式基准**（单机、合成会话、归档在内存里、不含文件解析；只看量级，不是测试）：
    - 打开后第一次读：10k 事件 / 1,668 次工具调用约 0.41 秒；20k / 3,334 次约 1.26 秒；20k / 8,850 次约 7.6 秒；40k / 17,670 次约 35 秒。时间花在回放读模型上：`applyTool` 约 36–39%，投影注册表的 `immutableState` 约 26–36%，排序的比较函数约 12–14%。按工具调用次数是平方增长。这部分这批没有改。
    - 之后每次读：10k 约 12.8 毫秒；20k 约 24.7 毫秒（工具密集时约 59 毫秒）；40k 约 125 毫秒。约 90% 是 `assertJson`。这部分这批也没有改。
    - 这批改掉的部分，10k 事件的会话：第一次读从归档读的事件数 20,064 → 10,120；每页序列化 320 次 / 141 KB → 240 次 / 102 KB；展开工具详情从归档读 9,944 → 2 条。
  - **M7**：`artifact-download-io.test.ts` 给 `node:fs/promises` 包一层计数。2 MiB 快照按 64 KiB 分块下完，读取量在 2 到 2.1 倍文件大小之间，旧实现 71,317,788 字节（约 34 倍）；600 KiB 附件按 16 KiB 分块，旧实现 47,320,219 字节（约 77 倍）；20 次新建上传 `readdir` 0 次、读 0 字节，旧实现 20 次、149,860 字节。下载途中文件被改，快照和附件都拒绝；旧实现的附件读取不校验，会把改过的内容发出去。上传目录里放一个 `.DS_Store` 和一个无关目录的用例，修之前在清理那一步失败（`HostError: Upload not found`），修之后通过，两个条目原样留着。
  - **M3**：32 个应拒绝的字面量（含十进制和十六进制写法的 IPv4、IPv4 映射的 IPv6、NAT64、6to4）、9 个应放行的。旧代码上确认过 `isIP("[::1]")` 是 0，带方括号的主机名会被当成域名解析并失败，所以 IPv6 字面量地址的网址原先全部读不了。
  - **L2**：`pnpm lint` 通过。临时加了一个在 `if` 里调 `useState` 的组件，规则报错；确认后删除。
  - **L9**：环境变量 56 个用例。ripgrep 用例用一个假的 `rg`，把「中」字的三个字节拆成两次写出，旧代码输出替换字符。输出订阅的慢正则用例：`(a+)+$` 对 30 个 `a` 加 `!`，旧代码主线程卡住 11.6 秒后失败；新代码连跑 5 次通过，主线程最长停顿小于 1 秒。另外单独确认过结束 worker 线程能打断正在回溯的正则（2.4 毫秒内退出）。
  - `pnpm check:hot-path-reads`、`pnpm check:scale-tests` 通过。基线里 `session-controller.ts` 的整份读 4 → 3，`subagent/src/manager.ts` 的整份遍历 2 → 0。规模测试登记 8 条，待补 7 条。
- **对提交说明的更正**：这个 PR 有四个提交的说明各有一处不准，仓库约定不改写已有提交，更正写在 history 的「对提交说明的四处更正」一节：`06ffe517` 的「每条事件复制一次数组」、`bd95b85e` 的「30 个」、`dac05f59` 的「不到 1 毫秒」、`fbc8b2cf` 的「两处都靠对拍脚本发现」。

### 步骤 4：同步 `main`，修推送后才发现的 CI 失败（2026-11-13）

- **背景**：PR 3 在 11-10 推送后，没有等 CI 跑完就开始做 PR 4。11-13 接着做时的情况：
  - `main` 从 `2738ecd0` 走到 `bf566305`，合了 #82、#86–#90。其中 #90（子智能体并入后台任务）和 PR 3 改了同一批文件；#83 对 `main` 有冲突。
  - #85 有两项检查是红的：「官网」和 CodeQL。两处都是 PR 3 自己的问题。
  - 云端 VM 重建过，PR 4 分支上没有推送的三个提交和没有提交的改动丢了，见下面「遇到的问题」。
- **操作**：
  1. 从栈底往上逐层同步，全部用合并提交，不改写已经推送的提交。`main` → PR 1（`833decba`）：冲突只有 `docs/design-docs/site-v6/README.md`，`main` 自己也补了那 6 张图的 alt，取 `main` 的。PR 1 → PR 2（`dc6b6b36`）：冲突只有发布记录，按日期倒序排。PR 2 → PR 3（`4812ee6e`）：冲突四处，都在后台任务登记表、它的测试、它的设计文档和发布记录上，解决方式写在 PR 3 的 history 的「2026-11-13 补充」一节。
  2. PR 3 上修「官网」：同一天的两条发布记录合成一条（`127e853f`）。
  3. PR 3 上修 CodeQL：环境变量值的检查从粘性正则换成逐字符扫描（`59a80620`）。
  4. 同步之后「包测试」在 #83、#85 和 `main` 上各红了一次，三次是三种不同的失败，都来自 #90 新加的用例，和这一批的改动无关。三种都先在本地复现，再修在 PR 1 上（`16086f8a` 改两类用例，`7dc064e5` 改后台任务登记表的 `dispose()`），然后逐层合上来：PR 1 → PR 2（`ae3b7a88`）、PR 2 → PR 3（`743c2026`），都没有冲突。
- **影响文件**：见 `docs/histories/2026-11/20261113-1311-flaky-package-tests-and-registry-dispose.md`，以及 `docs/histories/2026-11/20261110-1950-review-fixes-session-host-web-shell.md` 的「2026-11-13 补充」一节。
- **决定**：写在计划的「决策记录」（2026-11-13 的四条）。
- **验证**：
  - 每次合并之后比较这个 PR 相对它的 base 的改动量，确认合并没有带进或丢掉这个 PR 自己的内容。PR 2 三次都是 36 个文件、+1642 / −61。PR 3 同步前后都是 73 个文件、+1775 / −288，加上两处 CI 修复之后是 +1790 / −289，第二次同步后不变。PR 1 原来是 9 个文件，同步后少了 `site-v6/README.md`（`main` 已经改了）是 8 个，加上随机失败的修复之后是 15 个文件、+542 / −28。
  - 三种随机失败的复现办法：本地平时跑不出来，在 4 核的机器上开 8 个空转进程把 CPU 占满之后能稳定复现，报错和 CI 上一致。改前改后各跑了多少次、失败多少次，见上面第一份 history 的 Verification。
  - 本地验证脚本对着 CI 的 job 补齐了原来没有的步骤：桌面端构建图检查、契约矩阵检查、`pnpm check:docs`、`pnpm check:packages`、官网的三条命令、`pnpm build`。没有覆盖的只剩「Browser Bridge」这个 job（Go 测试和交叉编译）和「构建」里的打包冒烟，这两项看 CI。三个分支同步后各跑一遍。PR 1、PR 2 上只有两类已知失败：`tool-runtime` 的 3 个用例（见「遇到的问题」第 2 条），以及 JSONL 的「same-size rewrite falls back to a full read」偶尔失败一次（同一个时钟刻度内的等长改写）；两类都是 M6，在 PR 3 修掉。
  - CI：[#83](https://github.com/WakeUp-Jin/actspace-agent/pull/83) 在 `b0675455` 上 15 项检查全部通过；[#85](https://github.com/WakeUp-Jin/actspace-agent/pull/85) 在 `59a80620` 上「官网」和 CodeQL 已经通过，「包测试」红在登记表 `dispose()` 那一种随机失败上，这次同步带上了它的修复。
  - 带上修复之后（写步骤 5 时补记）：[#84](https://github.com/WakeUp-Jin/actspace-agent/pull/84) 在 `ae3b7a88` 上、#85 在 `74b8795d` 上，各 15 项检查全部通过。

### 步骤 5：PR 4，Agent Loop 请求路径（L5、M2、M1）

- **背景**：这个 PR 做了两遍。11-10 做完的 L5 和 M2 的前两个提交，连同 M2 第三部分没提交的改动，随 VM 重建丢了（见「遇到的问题」）；11-13 重做，从这一步起每个提交做完就推送。
- **操作**：五个提交，每个单独通过测试、lint 和类型检查。
  1. **L5**（`f40c200f`）：`AgentLoop` 的 `contextSources` 改成必填，删掉没传时走的另一套拼装；测试夹具默认带对话和工具两个透传来源，id、owner、顺序和生产一致。
  2. **M2，抽函数**（`1836fc9c`）：首次请求和重试共用 `AgentLoop.openRequest(step, attempt, previous?)`，`runTurn` 的循环只负责派发。两份代码原有的差异原样留在 `previous` 的分支里，这一步不改行为。
  3. **M2，释放**（`05cc6f8d`）：`openRequest` 里从准备成功到返回之间的步骤放进同一个 `try`，不再区分首次和重试；`runTurn` 派发时的 `catch` 里也释放一次。
  4. **M2，重试过钩子**（`87b0234f`）：每次尝试都调用 `agent/request`，payload 多一个 `attempt`；消息和工具按钩子的返回值来，路由和模型沿用首次请求。`llm-service` 的 `prepareCaptured`、`prepareCapturedAsync` 先把消息和工具复制并冻结一份。
  5. **M1**（`b9dec7a8`）：LLM 请求在流结束时、工具调用在释放时，摘掉挂在调用方 signal 上的 abort 监听器。
  6. 文档：事件 ABI 规范的 `agent/request` 一行、LLM Core 设计 §13（重试过钩子的约定，以及一段实现现状）、请求记录规范和模式文档里提到旧拼装路径的两处、技术债两条、history。
- **影响文件**：见 `docs/histories/2026-11/20261113-1430-agent-loop-request-path.md`。
- **决定**：写在计划的「决策记录」（2026-11-13 关于 PR 4 的六条）。和计划不一致的地方：
  - 顺序。计划写的是 M2、L5、M1，实际先做 L5：夹具先和生产一致，M2 的对拍才算数。
  - M2 第三步。计划只写「让重试也经过同一个钩子」。11-10 第一遍做的是「重试时钩子返回的路由和模型也生效，重新取路由」，没有提交。重做时对照 `agent-llm-core-pi.md` §13：重试要继承同一个模型和连接，而那种做法在同名路由被顶替之后会让重试换到新连接上。所以改成钩子在重试时返回的路由和模型不采纳。
  - M1 的数字。计划引用审查报告的「200 步累积 55.8 MB」，那是审查时另一个合成场景的数字，探针没有留下来，这次没有复现。修之前和修之后重新量了四种回合，监听器多留住的从约 7 MB 到约 26 MB 不等，随步数和工具定义的数量变，见下面「验证」。
  - 核对 §13 时发现它描述的 `LlmRetryScope` 没有实现。这个 PR 不实现，在 §13 写明现状并记技术债。
  - 整理记录时又看到一种没处理的情况：`llm/stream` 钩子在派发之后抛错时，已经派发的流没有人中止。目前没有生产插件注册这个钩子，记技术债。
- **验证**：
  - **M2 抽函数**：写了一个临时用例做对拍。场景是一步里失败两次再成功，分带和不带 `agent/request` 钩子（改写模型、追加一条消息）两种；把会话日志、实时事件和适配器每次收到的消息、工具、选项导出来，ID 和时间归一。重构前后两份导出逐字节相同。对拍用例没有入库。
  - **M2 释放**：`request-release.test.ts` 四个用例（第 1 次、第 2 次请求写记录失败；`recordPrepared` 失败；`llm/stream` 钩子在派发前抛错）。回到上一个提交的 `loop.ts`，后三个失败，报 `did not drain`；第一个原来就通过。
  - **M2 重试过钩子**：`request-hook-retry.test.ts` 三个用例。回到上一个提交的 `loop.ts`，前两个失败，第三个通过（它钉的是原有行为）。在新代码上各改错一处：去掉「只有首次请求采纳路由和模型」的判断，第二个失败；重试改成重新取路由，第三个失败。`llm-service` 新增的两个用例在去掉 `service.ts` 的改动后都失败。和重构前对拍：不带钩子时导出逐字节相同；带钩子时会话日志和实时事件相同，差别只有钩子被调用三次、三次请求都带钩子追加的消息。
  - **M1 监听器数量**：`turn-signal-listeners.test.ts` 让一个回合跑四步，在每次请求派发前数回合 signal 上的 abort 监听器。修之前 `[0, 2, 4, 6]`，只修 `llm-service` 是 `[0, 1, 2, 3]`，都修了是 `[0, 0, 0, 0]`。`llm-service`、`tool-runtime` 各两个用例：连续三次调用之后监听器数是 0；正在进行的流和工具体在 signal 触发时仍然被中止。把 `addEventListener` 那一行去掉，后一类用例失败（流的那条报路由没有排空，工具的那条超时）。
  - **M1 内存**（单机、合成回合；只看量级，不是测试）：每步调一次工具，在请求派发前强制 GC 后读 `heapUsed`，修之前和修之后各跑一遍，最后一步两者之差就是监听器多留住的。
    - 200 步、请求带 1 个工具定义、结果 2 KB：修之前 43.7 → 46.2 → 48.4 → 51.3 → 54.8 MB（第 1、51、101、151、200 步），signal 上的监听器 0 → 100 → 200 → 300 → 398 个；修之后 43.7 → 45.6 → 46.3 → 47.0 → 47.7 MB，监听器一直是 0。相差约 7 MB。
    - 400 步、1 个工具定义、结果 2 KB：修之前到 76.7 MB（798 个监听器），修之后 50.5 MB。相差约 26 MB。
    - 200 步、30 个工具定义、结果 2 KB：修之前 58.2 MB，修之后 47.7 MB。相差约 10.5 MB。
    - 200 步、30 个工具定义、结果 20 KB：修之前 65.0 MB，修之后 54.5 MB。相差还是约 10.5 MB。
    - 这几组数字对得上代码：每个被留住的请求快照带着当时整份消息列表和全部工具定义的副本（`llm-service` 的 `cloneMessages`、`cloneTools`），副本是新建的对象，字符串共用。所以步数翻倍，留住的量是原来的 3.7 倍左右；工具定义多了也变大；工具结果多大没有影响。
    - 审查报告的 55.8 MB 是审查时另一个合成场景的数字，探针没有留下来，这次没有复现，两组数字不能直接比。
  - **§13 的现状**：用一个临时用例确认。首次尝试期间开始注销路由，退避 20 毫秒后重试：重试时 registration 的状态是 `disposed`，适配器只被调用了一次，这一步以 `LLM registration … is disposed.` 失败。
  - `pnpm check:hot-path-reads`、`pnpm check:scale-tests` 通过。基线和登记没有变化。
  - 全量验证用步骤 4 的同一个脚本，在五个代码提交之后的分支上跑：桌面端构建图检查、依赖构建、契约矩阵检查、全部包和桌面端的测试、脚本测试、`scripts/ci.sh`、lint、类型检查、markdownlint、`pnpm check:docs`、`pnpm check:packages`、官网三条命令、`pnpm build`，13 步全部通过。文档写完之后，只和文档有关的四步（`scripts/ci.sh`、markdownlint、`pnpm check:docs`、官网）又跑了一遍，通过。
  - CI（写步骤 6 时补记）：[#94](https://github.com/WakeUp-Jin/actspace-agent/pull/94) 在 `4e408433` 上，15 项检查全部通过。

### 步骤 6：PR 5，路径安全模块（M5）

- **操作**：
  1. **共享实现**（`418fb342`）：`packages/util/shared/src/path-containment.ts` 的 `relativePathInside`、`isLexicallyInside`，和它的测试。
  2. **逐处替换**，14 个提交（`949fdd65` 到 `a2b6b1f5`），一个包或一组相近的文件一个提交：`tool-runtime`、三个文件工具、`tool-shell`、两个沙箱包、`agent-host`、`agent-service`、`skill`、`plugin-manager`、`cordis-adapter`、桌面端三个（Review、Skill、其余四处）、`apps/cli`、`client`。每一处先读原来的实现和调用方，确认两件事：原来的写法对不对；路径就是根目录本身时原来算不算在里面。原来错的，加一条在改之前的代码上失败的用例；原来对的，补用例把现在的行为固定下来。
  3. **检查脚本**（`1bdcb686`）：`pnpm check:path-containment` 和它的 7 个用例，接进 `pnpm test:scripts`。写这份记录时重新核对用例，补了六种没覆盖到的文件类型（`e4a3f7b5`）。
  4. 全量验证报出来的两处（见「遇到的问题」最后两条）：契约矩阵重新生成（`38b12d57`）；两处说明文字换写法（`59c2cb9b`）。
  5. 文档：`docs/SECURITY.md`「文件系统访问控制」加一条规则、`packages/util/README.md`、发布记录（并进 2026-11-10 那一条）、history、计划和这两份执行文档。
- **影响文件**：见 `docs/histories/2026-11/20261113-1545-path-containment.md`，里面有一张表，逐处写了原来是哪种写法、改完之后行为变没变。
- **决定**：写在计划的「决策记录」（2026-11-13 关于 M5 和 PR 5 的八条）。和计划不一致的地方写在计划 PR 5 一节的「2026-11-13 补充」：数量和位置比计划写的多；函数名写明的约定是「只比较字面」而不是「输入必须已规范化」；三处没有换成共享函数；多做了一个检查；两个构建脚本没有改。
- **验证**：
  - **共享实现**：两个平台各一张用例表。另有一个对照：在小字母表上穷举根和候选路径（posix 22,800 组，win32 66,822 组），和一个不经过 `relative`、逐段比较的实现比，结果一致。把实现改错再跑测试，一共 12 种改法（`startsWith("..")`、只认 `../`、不查绝对路径这三种原来的错法和它们的组合，少认一个条件，`includeRoot` 当成固定值或取反，`relative` 的两个参数写反），每一种都有用例失败。
  - **有行为变化的地方**：三个文件工具、Bash 的 cwd、`sandbox` 的重叠检查、`sandbox-nono` 的读授权拆分、`cordis-adapter` 的 `./..codec.mjs`、Review 面板、Skill 的安装 / 标记 / 卸载、「在外部应用中打开」，各自新增的用例都回到改之前的代码上确认过失败。
  - **行为不变的地方**：`tool-runtime` 的 `isPathWithin`、`tool-shell` 的 `command-rules.ts`、`agent-service` 的权限降级、`client` 的工具卡片，补的用例在改之前同样通过。
  - **和 Windows 有关的三处**（`agent-host` 的 `files.reference`、Skill 卸载、`cordis-adapter` 的跨盘符链接）没有在真实 Windows 上跑，云端只有 Linux。依据是共享实现用 `path.win32` 的规则跑的用例表，以及旧写法在这套规则下的结果：`path.win32.relative("C:\\work", "C:\\secret.txt")` 的结果是 `..\secret.txt`，旧的 `startsWith("../")` 认不出来。
  - **检查脚本**：在动手之前的代码上跑，报出 22 个文件 28 处（另有一条「清单里的共享实现文件还不存在」）；现在通过，扫了 1,506 个文件。往一个不在清单里的文件和一个在清单里的文件各加一处手写判断，检查失败，指出文件和行号。把脚本改错再跑用例，一共 54 种单点改动（每个跳过的目录、每个扫描的根目录、隐藏目录的跳过、注释行的处理、正则的每个分支、清单的多和少、每种扩展名、`.d.ts` 和每种测试文件命名的排除），每一种都有用例失败。其中 6 种一开始没有用例失败：`.js`、`.jsx`、`.mts`、`.cts` 四种扩展名和 `.bench.`、`.perf.` 两种命名，样例目录里没有这几种文件。仓库里在扫描范围内的 `.js` 有 14 个、`.mts` 有 3 个，所以补上了（`e4a3f7b5`）。两处改错的验证都在仓库外的副本上做，没有动工作区。
  - **没有改的两个构建脚本**：`package-browser-components.mjs` 那一处是宽松写法加绝对路径检查，按定义只会比正确的写法拒绝得更多。`package-agent-cli.mjs` 那一处写法不一样，用一个临时脚本和共享实现比：固定种子，posix、win32 各 40 万组随机路径，没有一组是它放行而共享实现拒绝的；它多拒绝的 115,740 组（posix）和 99,941 组（win32）全部落在三类里：包目录就是盘符根、Windows 上大小写不同、名字以两个点开头。临时脚本没有入库。
  - `pnpm check:hot-path-reads`、`pnpm check:scale-tests` 通过。基线和登记没有变化。
  - 全量验证用步骤 4 的同一个脚本（13 步），跑了两次。第一次在检查脚本提交之后（`1bdcb686`），失败两步：契约矩阵检查和 `scripts/ci.sh`，就是「遇到的问题」最后两条。修完之后在 `59c2cb9b` 上重跑，13 步全部通过；73 个包和应用的测试都通过，其中用 vitest 的 70 个合计 5,370 个用例通过、28 个跳过。之后只有一个测试文件的改动（`e4a3f7b5`）和文档，又跑了脚本测试、lint、契约矩阵检查、`pnpm check:packages`，以及只和文档有关的四步（`scripts/ci.sh`、markdownlint、`pnpm check:docs`、官网），通过。

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
- **问题**：#85 推送后有两项检查是红的，三天后接着做时才发现。
  - **原因**：一是本地验证没有跑官网的检查，「同一天有两条发布记录」这个错只有官网的构建会报；二是推送之后没有等 CI 跑完就开始做下一个 PR。
  - **应对**：两处在步骤 4 修掉。本地验证脚本对着 CI 的 job 补齐；之后上一个 PR 的 CI 跑完并且通过，才给下一个分支建 PR。
- **问题**：云端 VM 重建，PR 4 分支上没有推送的工作丢了：三个提交（L5、M2 的前两部分）和 M2 第三部分没提交的改动。
  - **原因**：原来的做法是一个 PR 的提交都做完、验证过再一起推送，而 VM 的本地磁盘不跨重建保留。
  - **应对**：PR 4 重做。之后还没建 PR 的分支每个提交都推送：这个仓库的工作流只在 PR 和 `main` 的推送上触发，没有 PR 的分支推送不会多跑 CI。已经有 PR 的分支上还没推送的提交，另存一份到不随 VM 重建丢失的地方。
- **问题**：同步 `main` 之后「包测试」随机失败，红的地方和这一批的改动无关。
  - **原因**：#90 带进来三处依赖时间的地方：一条用例用一个 400 ms 的上限同时验证「跑得完」和「会超时」；两条用例等到通知进了收件箱就断言会话已被唤醒，而唤醒在那之后还隔着一次写盘；后台任务登记表关闭时不等刚结束的任务把收尾记录写完。
  - **应对**：修在 PR 1（步骤 4 第 4 条）。前两处只改用例，第三处改登记表。写这份记录时 `main` 最近一次 CI（#91 合入后）也红在第一种失败上，PR 1 合入后才会消失。
- **问题**：PR 5 建 PR 之前的全量验证里，契约矩阵检查失败。
  - **原因**：生成文档里记着一份固定文件清单的摘要。`2ec09b88` 改的 `packages/core/agent-service/src/application.ts` 在清单里，那个提交之后没有重新生成。
  - **应对**：重新生成（`38b12d57`），只有摘要那一行变了。那个提交的说明把原因写宽了（列了五个包），实际只有这一个文件，更正写在 history 里。
- **问题**：同一次全量验证里，`scripts/ci.sh` 的包切换检查报了两处深层引用，两处都只是说明文字。
  - **原因**：那条检查用一条正则在整个文件里找「`@actspace/<包名>` 后面跟着 `/src/`」，中间只要没有引号就算，不分代码、注释和提示文字。`cordis-adapter` 里一段注释、检查脚本开头的说明和失败提示，都是先写包名、后写实现文件的路径。
  - **应对**：把路径挪到包名前面（`59c2cb9b`），没有改那条检查。这两个问题都是全量验证在建 PR 之前拦下的，没有上到 CI。

## 跳过或推迟的事项

- M4（每条命令起一个登录 shell）：需要 macOS 实机验证，云端只有 Linux；用户也还没有给出本机的耗时对比。不做。
- L3（`App.tsx` 拆分）：按已有计划 `20261110-app-assembly-split.md`，不在这批。

## 夜间模式补充记录

夜间模式没有人工审批环节，以下操作在交互模式下通常需要人工确认，在此记录：

- 推送分支并创建 PR：每个 PR 一个 `cursor/review-0N-*-e412` 分支。没有合并任何 PR，没有强制推送，没有改 GitHub 设置（Agent 的 GitHub 权限是只读加「创建 / 更新 PR」）。
- 修改 CI 工作流（`.github/workflows/ci.yml`）：改动只影响触发条件和新增两个不执行仓库代码的 job，没有改 permissions、没有新增 action、没有引入 secret。
