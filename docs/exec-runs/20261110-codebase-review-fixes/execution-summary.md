# 代码库审查修复 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261110-codebase-review-fixes.md`
- **执行过程**：`docs/exec-runs/20261110-codebase-review-fixes/execution-process.md`
- **执行模式**：夜间
- **执行结果**：进行中。这份摘要随每个 PR 更新，只写到当前 PR 为止的内容。

## 怎么合并

8 个 PR 是一条线性栈，按编号从小到大合并，合并方式选 **Create a merge commit**（不要用 squash 或 rebase，否则后面的 PR 会和已合入的内容冲突）。每合一个，它的分支被自动删除，下一个 PR 的 base 随之自动改成 `main`；合并按钮提示分支落后时点一次 **Update branch**，等检查跑完再合。

想一次合完：把编号最大的那个 PR 的 base 改成 `main` 再合并，它包含前面全部提交。其余 PR 的提交这时已经都在 `main` 里，GitHub 没有自动标成已合并的手动关闭即可。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| `main` 的 markdownlint 红灯 | `docs/design-docs/site-v6/README.md` | 6 张图补 alt。不修的话这批 PR 的必需检查全是红的。 |
| `ci.yml` 改成 job 级路径判断加汇总 job | `.github/workflows/ci.yml` | 每个 PR 都会报告 `CI 汇总`，可以设为合并必需检查；纯文档 PR 仍然跳过全部工程 job。 |
| 文档同步 | `.github/workflows/base-checks.yml`、`docs/CICD.md` | 说明哪些 check 可以设为必需、新增 job 时要改哪三处。 |
| 三种让「包测试」随机变红的失败（PR 1，2026-11-13 加） | `packages/background-tasks/background-tasks/src/registry.ts`、`packages/shell/tool-shell/src/test/node-ports.test.ts`、`packages/subagent/subagent/src/test/{external,manager}.test.ts` | #90 带进 `main` 的。两处只改用例；后台任务登记表关闭时改成等刚结束的任务把通知和收尾记录写完。不属于审查条目，放在 PR 1 是因为 `CI 汇总` 设成必需之后它们会卡住无关的 PR。 |
| 文件工具的输出上限（PR 2） | `packages/fs/tool-fs-read`、`packages/fs/tool-fs-write` | `read_file` 流式读取，输出 64,000 字符、单行 2,000 字符，拒绝二进制；`list_directory`、`write_file`、`edit_file` 的输出同样限制在 64,000 字符。 |
| tool-runtime 兜底（PR 2） | `packages/core/tool-runtime/src/output-limits.ts`、`prepared-execution.ts` | 任何工具的一条结果提交前按字节数检查，超出的截短，完整输出存成文件。 |
| 按窗口的批次额度（PR 2） | `packages/core/agent-loop/src/tool-output-budget.ts`、`loop.ts`、`tool-runtime` 的 `ToolOutputBudget` | 一批工具结果合计不超过上下文窗口放得下的量。 |
| 回合收尾（PR 2） | `packages/session/session-persistence/src/recovery.ts`、`packages/core/agent-loop/src/loop.ts` | 一条记录写入失败后回合照常闭合，会话可以继续用。 |
| 目录卡片读真实条目数（PR 2） | `packages/client/client/src/sessions/tool-card.ts` | 条目数读结果的 `detail`，不受输出截短影响。 |
| 测试不依赖机器环境（PR 3，M6） | `packages/core/tool-runtime/src/test/runtime.test.ts`、`packages/session/session-persistence-jsonl/src/jsonl-reader.ts` | 测试工作区改用临时目录；JSONL 增量读不再漏掉同一时钟刻度内的等长改写。 |
| 打开中的会话的读路径（PR 3，M9） | `packages/session/session-projection-cache/src/history-index.ts`、`packages/core/runtime/src/session/session-controller.ts`、`packages/subagent/subagent/src/manager.ts` | 读一屏、翻页、展开工具详情从归档读的事件数不随会话长度增长。 |
| Agent Host 的错误、下载与上传（PR 3，M7） | `packages/host/agent-host/src/{server,rpc,artifacts,uploads,verified-content}.ts`、`node-ports/artifact-store.ts`、`packages/util/shared/src/host-protocol/index.ts` | Host 内部错误不再把原始信息发给设备；分块下载只读请求的那一块；新建上传不再读全部状态文件；上传目录里有 `.DS_Store` 之类的条目时清理不再报错。 |
| `web_fetch` 只连检查过的地址（PR 3，M3） | `packages/web/tool-web/src/public-request.ts`、`node-ports.ts` | 域名只解析一次；IPv6 字面量地址能正确判断。 |
| hooks 规则（PR 3，L2） | `biome.jsonc`、`packages/util/shared/src/desktop-bridge/contract.ts`、`apps/desktop/src/main/browser-bridge-service.ts` 等 | 打开 `useHookAtTopLevel`；两个以 `use` 开头的普通方法改名。 |
| 子进程环境、ripgrep 解码、输出订阅（PR 3，L9） | `packages/util/shared/src/child-process-env.ts`、`packages/fs/tool-fs-search/src/node-ports.ts`、`packages/shell/tool-shell/src/node-ports.ts`、`packages/background-tasks/background-tasks/src/registry.ts` | 多剥几类凭据；多字节字符不再被切成乱码；订阅的正则在单独的线程里匹配，匹配不完就停掉订阅并通知模型。 |
| 测试夹具走生产的上下文路径（PR 4，L5） | `packages/core/agent-loop/src/loop.ts`、`testing.ts` | `AgentLoop` 的 `contextSources` 改成必填，删掉只有测试在走的另一套请求拼装。 |
| 首次请求和重试共用一段代码（PR 4，M2） | `packages/core/agent-loop/src/loop.ts`、`packages/llm/llm-service/src/service.ts` | 准备好但没派发的调用，在任何一步失败时都归还它占着的路由；重试也经过 `agent/request` 钩子，消息和工具按钩子的返回值来，路由和模型沿用首次请求。 |
| abort 监听器用完就摘（PR 4，M1） | `packages/llm/llm-service/src/prepared-call.ts`、`packages/core/tool-runtime/src/prepared-execution.ts` | 每次请求、每次工具调用结束后，不再在回合共用的 signal 上留一个监听器；监听器原先会把那次请求的快照和那次调用的结果留到回合结束。 |
| 路径包含判断只有一份实现（PR 5，M5） | `packages/util/shared/src/path-containment.ts`，以及 15 个包和应用里原来各写各的地方 | 「一个路径在不在某个目录里面」，用新加的检查数，原来有 22 个文件 28 处手写判断：18 处会把根目录下名字以两个点开头的文件当成越界，2 处在 Windows 上拦不住 `..\`。现在调同一份带测试的实现；三处另有处理（`cordis-adapter` 引用不了共享包，留一份写法相同的本地副本；`plugin-manager` 改成更严的判断；`skill` 删掉一条永远不成立的判断）。每一处改完之后行为变没变，见 `docs/histories/2026-11/20261113-1545-path-containment.md` 的表。 |
| 防止再手写的检查（PR 5） | `scripts/check-path-containment.mjs`、`package.json` | `pnpm check:path-containment`，随 `pnpm test:scripts` 在 CI 里跑。可以保留的文件按「文件加处数」记在脚本里。 |

## 人工验证指引

### 必须验证

1. **把 `CI 汇总` 设为必需检查**
   - 验证方式：这批 PR 合完后，打开 GitHub 仓库的 **Settings › Rules › Rulesets › main › Require status checks to pass**，点 **Add checks**，搜索并添加 `CI 汇总`，保存。
   - 预期结果：之后新开的 PR 上 `CI 汇总` 标着 Required；lint、类型检查、测试或构建任何一个失败，合并按钮不可用。
   - 注意：一定在工作流合入 `main` 之后再设。否则没有包含这次改动的旧 PR 上不会出现这个 check，会一直停在 Expected。旧 PR 点一次 **Update branch** 即可。

2. **大文件不再卡住会话（PR 2）**
   - 验证方式：在桌面端开一个新会话，让模型读一个很大的单行文件（例如几 MB 的 `*.min.js` 或一个大 JSON），再让它读一个二进制文件（例如一个 `.zip`），然后继续发一条普通消息。
   - 预期结果：第一次读取只返回开头，工具卡片正常显示，结果末尾有 `line truncated` 的说明；二进制文件返回「looks like a binary file」的失败；之后的消息照常得到回复，不出现 `Cannot start Turn … while … is open`，也不出现 `Context exceeds model capacity`。
   - 这一项云端验证不了的部分：真实模型看到截短说明后会不会按提示用 `offset` 或 `grep` 继续读。单测只验证了说明的内容和数字。

3. **命令里用到的数据库地址等环境变量（PR 3）**
   - 验证方式：如果你平时让模型跑的命令依赖 shell 里已有的 `DATABASE_URL`、以 `_PWD` 或 `_DSN` 结尾的变量，或者值里带 `://用户名:密码@` 的变量（例如带密码的 Redis 地址），在桌面端让模型跑一次这样的命令。
   - 预期结果：命令读不到这些变量。这是有意的：它们和 API Key 一样不再交给工具子进程。需要的话让命令自己从 `.env` 之类的文件读。`HTTP_PROXY`、`HTTPS_PROXY`、`ALL_PROXY` 不受影响。
   - 为什么列在这里：这是这批里唯一一处会让原本能跑的命令跑不了的改动。

4. **手机或网页端下载文件、上传附件（PR 3）**
   - 验证方式：用 Web 端连上桌面端的 Host，下载一个十几 MB 的文件（单个文件上限是 20 MiB），再上传一个附件发给模型。
   - 预期结果：都成功，内容正确。下载大文件时 Host 的读盘量明显变小（原来每取 256 KiB 就把整个文件读一遍、算一遍摘要）。
   - 这一项云端验证不了的部分：真实设备、真实网络下的端到端传输。单测用本地文件和计数的文件系统验证了读取量和完整性校验。

5. **中途停止仍然立刻生效（PR 4）**
   - 验证方式：在桌面端让模型做一件要好几步的事（例如读几个文件再总结），等它跑过两三步之后，分别在「模型正在输出」和「一条较慢的命令正在运行」（例如 `sleep 30`）时点停止。
   - 预期结果：输出或命令立刻停下，输入框恢复可用，再发一条消息能正常得到回复。
   - 为什么列在这里：PR 4 改了「回合被中止」传给每次请求、每次工具调用的那一小段。单测覆盖了进行中的请求和工具体收到中止，云端没有真实的 Provider 连接和窗口。

### 建议验证

1. **纯文档 PR 仍然很快**
   - 验证方式：开一个只改 `docs/` 下某个 Markdown 文件的 PR，看 Checks 页。
   - 预期结果：`变更范围` 与 `CI 汇总` 各十几秒通过；`Lint 与类型检查`、`测试`、`构建` 等显示 Skipped。
2. **大改动的文件修改卡片（PR 2）**
   - 验证方式：让模型用 `write_file` 写一个几万行的文件。
   - 预期结果：文件完整写入；卡片上的增删行数是真实的总数，diff 只显示开头的一部分。
3. **小窗口模型下的一批读取（PR 2）**
   - 验证方式：选一个上下文窗口较小的模型（例如 32K），让它在一步里并行读四五个各有几百行以上的文件。
   - 预期结果：部分结果末尾出现 `[Output truncated: … the context window has room for about …]`，并附一个「Full tool output」文件引用；这一轮正常继续。
4. **读取 IPv6 地址的网页（PR 3）**
   - 验证方式：在有 IPv6 网络的机器上让模型用 `web_fetch` 读 `http://[2606:4700:4700::1111]/`；再让它读 `http://[::1]/`。
   - 预期结果：前一个不再报「地址不允许」，能连上时返回页面内容（原来所有 IPv6 字面量地址都读不了）；后一个被拒绝。
5. **连接浏览器扩展（PR 3）**
   - 验证方式：在 扩展 › 插件 里开启「操控浏览器」后，在浏览器连接面板里先「选择源码扩展」，再点出现的「切回随包扩展」。
   - 预期结果：和原来一样能切回。这里只是把方法名从 `useBundledExtension` 改成了 `switchToBundledExtension`，IPC channel 没变；云端没有真实的 Electron 窗口，只跑了单测。
6. **后台命令的输出订阅（PR 3）**
   - 验证方式：让模型在后台起一个开发服务器，并要求它在输出里出现某一行（例如 `ready`）时通知。
   - 预期结果：和原来一样收到「输出匹配」通知。只有模型写出一个匹配极慢的正则时才会看到「输出订阅已停止」，这时命令本身不受影响。
7. **请求失败后的自动重试（PR 4）**
   - 验证方式：断开网络，发一条消息，两三秒后恢复网络。
   - 预期结果：和原来一样，界面出现「网关异常，正在重试」的提示。默认一共试 3 次，中间等 1 秒和 2 秒：网络在这之前恢复，这一轮继续并得到回复；没赶上，这一轮以网络错误结束，再发一条消息能正常得到回复。
8. **Review 面板、Skill 和外部应用打开（PR 5）**
   - 验证方式：在一个 Git 工作区的根目录下新建 `..notes.md`，写两行，不要 `git add`，打开 Review 面板看未提交的改动。然后照平时的用法各做一次：在 Review 面板里点开一个普通的改动文件；在右侧面板的文件视图里用「在外部应用中打开」打开一个文件（只有 macOS 上能用）；在 扩展 › Skills 里用「安装 Skill」从本机目录装一个 Skill，再把它卸载。
   - 预期结果：`..notes.md` 的新增行数是 2，点开能看到这两行。原来它被当成二进制文件，行数是 0，点开读不出内容。其余几样和原来一样。
   - 为什么列在这里：这几处判断「路径有没有跑到目录外面」的代码都换成了同一份实现。云端没有真实的 Electron 窗口，只跑了主进程的单测；「在外部应用中打开」在 Linux 上直接返回不支持，打开这一步云端跑不到。

## Agent 已完成的验证

- `changes` 的判断脚本：在临时仓库里造 merge commit 模拟纯文档（含中文文件名）、代码、代码改名成文档、工作流文件、中文路径代码文件五种改动，输出符合预期。
- `./scripts/check-action-pinning.sh`、`./scripts/ci.sh`、`npx -y markdownlint-cli2@0.24.0 "**/*.md"` 通过。
- PR 1 上 `仓库基础检查`、`变更范围`、八个工程 job、`CI 汇总` 全部通过。
- PR 2：四层各自的单测与集成用例（清单见 `docs/histories/2026-11/20261110-1710-tool-result-size-limits.md` 的 Verification）。额度的集成用例做了反向验证：去掉额度后同一个用例报 `Context exceeds model capacity`。`pnpm check:hot-path-reads`、`pnpm check:scale-tests` 通过。PR 2 上 15 项检查全部通过。
- PR 3：M9 的规模测试、M7 的读取量测试、L9 的 ripgrep 解码用例和慢正则用例都在旧代码上确认过会失败；M3 的旧行为（IPv6 字面量地址全部读不了）单独确认过。数字见执行过程步骤 3。M9 的新旧读路径用 7,806 组读取参数对拍，返回内容逐字节一致。全量包测试、桌面端测试、仓库脚本与进程级测试在本地通过。
- 2026-11-13 同步 `main` 之后：三个分支各跑了一遍全量验证（范围见执行过程步骤 4）；每次合并前后比较了各 PR 相对它的 base 的改动量，没有变化。三种随机失败都先在本地复现（把 CPU 占满之后报错和 CI 上一致），改完同样条件下反复跑，不再失败；次数见 `docs/histories/2026-11/20261113-1311-flaky-package-tests-and-registry-dispose.md`。环境变量值的检查换写法之后，新旧两种写法在 200 万个随机串上结果一致。
- PR 4：M2 不改行为的那一步，重构前后把同一个场景的会话日志、实时事件、适配器收到的内容导出来逐字节对拍，一致。后两步和 M1 新增的用例都回到改之前的代码上确认过会失败（哪几条失败、报什么，见执行过程步骤 5），原有行为由「不带钩子时对拍仍然一致」守着。M1 另外量过内存，数字和量法见执行过程步骤 5。
- PR 5：共享实现在 POSIX 和 Windows 两套路径规则下各有一张用例表，并和一个写法独立的逐段比较实现穷举对照（posix 22,800 组、win32 66,822 组），结果一致；把实现改成原来那三种错的写法，测试都失败。有行为变化的每一处新增的用例，都回到改之前的代码上确认过失败；行为不变的几处补了用例，改之前同样通过。新加的检查在改之前的代码上报出 22 个文件 28 处，现在通过。清单见执行过程步骤 6。

## 已知风险和遗留事项

- 工程 job 现在要等 `changes` 跑完才开始，每次 CI 多十几秒。
- `CI 汇总` 设为必需之后，`ci.yml` 里新增 job 时要同时加 `needs: changes`、`if: needs.changes.outputs.code == 'true'`，并把它列进 `ci-gate` 的 `needs`；漏了第三步，那个 job 失败不会拦合并。`docs/CICD.md` 的「下一步推荐」第 1 条写了这一点。
- 没有做的条目和原因见计划的「范围 › 不包含」。
- 2026-11-13 写这一条时，`main` 自己最近一次 CI（#91 合入后）是红的，红在核心变更清单里「三种随机失败」的第一种上。PR 1 合入后消失；在那之前，别的 PR 的「包测试」也可能随机红一次，重跑一次通常就过。
- PR 2 的额度按 4 个字符 1 token 估算，对中文偏低。以中文为主的大输出（例如一次读几个很长的中文文档）仍可能比估算的多占窗口；Provider 报了用量时，已有内容的占用是准的，偏差只在新的这一批结果上。要根治得改共用的估算器，它同时影响上下文面板、自动压缩和容量检查，这批没有动。
- PR 2 之后，一条记录写不进会话时这一轮仍然会失败，只是会话不再卡死。其中一种情况值得单独决定：工具调用的参数对象或工具返回的 json 块里有名为 `authorization`、`apikey`、`api_key`、`secret`、`password`、`cookie` 的字段时，`session-journal` 会拒绝这条记录。这是原有的安全规则，这批没有改；要不要改成「把值脱敏后写入」而不是拒绝，需要你来定。
- PR 2 的额度在并行调用整体超额时，各调用被截到多长取决于谁先出结果，同样的请求两次运行截断位置可能不同。完整输出都存成了文件，模型可以再读。
- PR 3（M9）只解决了「从归档读多少事件」。长会话读起来仍然会随长度变慢的两处没有动：每次读都重建整份会话快照并校验一遍（10k 事件约 13 毫秒，40k 约 125 毫秒）；打开后第一次读要回放读模型，随工具调用次数按平方增长（合成会话里 3,334 次工具调用约 1.3 秒，17,670 次约 35 秒）。数字是单机合成会话上量的，只看量级。线索写在 `docs/exec-plans/perf-backlog.md` 的 P5、P6。
- PR 3（M7）没有做的：上传的定时清理每 60 秒仍然读一遍全部上传的状态文件；文件写完头 2 秒内下载，每个分块仍然把整个文件算一遍摘要；产物不存在、不属于这个会话这两种情况设备收到的仍然是笼统的「Host operation failed」；令牌过期与轮换不在这批范围。
- PR 3（M3）没有覆盖的：设置了 `NODE_USE_ENV_PROXY=1` 时 `web_fetch` 走代理，目标域名由代理解析，固定不了地址；图片生成工具下载图片时用的还是旧的地址检查（网址来自你配置的图片服务商的响应，不是模型给的），记在 `docs/exec-plans/tech-debt-tracker.md`。
- PR 3（L9）的取舍：代理变量即使带密码也照常交给命令，否则需要带账号代理的机器上命令连不了网，代价是命令能读到代理密码；输出订阅在命令结束时还没匹配完的行不再匹配，结束通知本身带着输出尾部。
- PR 4 没有用户能直接感知的变化，所以没有写发布记录。重试经过 `agent/request` 钩子改的是给插件的约定，目前没有生产插件注册这个钩子。
- PR 4 核对设计文档时发现的两处，都没有在这批改，记在 `docs/exec-plans/tech-debt-tracker.md`：
  - LLM Core 设计 §13 写的「一个逻辑请求的全部尝试和退避等待由一个 lease 罩着」（`LlmRetryScope`）没有实现。两次尝试之间没有 lease，这期间路由被完整注销的话重试会失败。生产里走不到，因为进行中的 Run 持有它那一代 Harness 的 lease，路由要等 Run 结束才注销。§13 末尾补了一段实现现状。
  - `llm/stream` 钩子在派发之后抛错时，已经发出去的那次请求没有人中止，要等回合被中止或 Provider 那边结束。目前没有生产插件注册这个钩子。
- PR 5 和 Windows 有关的三处修复没有在真实 Windows 上跑过，云端只有 Linux：Agent Host 引用工作区文件（`files.reference`）、卸载 Skill、插件模块链接到另一个盘符。依据是共享实现用 Windows 的路径规则跑的用例表。
- PR 5 修的沙箱两处漏判（可写目录和禁止读取路径的重叠检查、nono 的读授权拆分）正常使用碰不到：要触发，禁止读取的路径或可写目录的路径里得有一段名字以两个点开头。内置的禁止读取路径（`.ssh`、`.aws`、钥匙串等）名字都不是这样，目前也没有调用方传自己的禁止读取路径，剩下的只有主目录或工作区本身起了这种名字的情况。
- PR 5 的共享实现只比较路径的字面，不解析符号链接。以后新写的调用点如果路径可能经过符号链接，要先对两边做 realpath；这一点写在函数名（`isLexicallyInside`）、注释和 `docs/SECURITY.md` 里，没有机械检查。
- `pnpm check:path-containment` 只认 `startsWith("..")` 这一类写法。用正则、`slice` 或者拿根目录做字符串前缀来判断的认不出来，还要靠评审。
- 两个构建脚本（`scripts/package-agent-cli.mjs`、`scripts/package-browser-components.mjs`）里各有一处宽松写法没有改，记在检查的清单里。它们只会多拒绝，不会放过越界的路径。

## 后续建议

- 进行中，执行结束时补全。
