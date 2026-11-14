# 代码库审查修复 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261110-codebase-review-fixes.md`
- **执行过程**：`docs/exec-runs/20261110-codebase-review-fixes/execution-process.md`
- **执行模式**：夜间
- **执行结果**：进行中。这份摘要随每个 PR 更新，只写到当前 PR 为止的内容。

## 怎么合并

这一批的 PR 是一条线性栈（计划 8 个；另有一个可以不合的 PR 9，放在栈顶），按编号从小到大合并，合并方式选 **Create a merge commit**（不要用 squash 或 rebase，否则后面的 PR 会和已合入的内容冲突）。每合一个，它的分支被自动删除，下一个 PR 的 base 随之自动改成 `main`；合并按钮提示分支落后时点一次 **Update branch**，等检查跑完再合。

想一次合完：把编号最大的那个 PR 的 base 改成 `main` 再合并，它包含前面全部提交。其余 PR 的提交这时已经都在 `main` 里，GitHub 没有自动标成已合并的手动关闭即可。

PR 8 用 **Create a merge commit** 还有一个原因：`.git-blame-ignore-revs` 里记着格式化提交和 PR 7 的改名提交的哈希。用 squash 或 rebase 合并 PR 8，这两个哈希就不在 `main` 的历史里，`main` 和之后每个 PR 的「仓库基础检查」会失败，直到把那两行删掉（rebase 合并的话改成新的哈希）。

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
| `@actspace/core` 名下的事件只从一个入口写（PR 6，M10） | `packages/util/shared/src/runtime-v2/core-events.ts`，以及 9 个包里写这些事件的 13 个文件 | 42 种事件各自的 `data` 记在一张表里，写的时候事件名或字段写错编译不过。原来是 7 份各写各的构造函数加 9 处手写对象，类型全靠断言。写出去的事件没有变。 |
| 服务按定义取用和注册（PR 6，M10） | `packages/composition/cordis-adapter/src/service-access.ts`、各包导出的定义、`packages/core/runtime/src/startup/{service-views,profile-services}.ts` | 原来 52 个文件 132 处按字符串 id 取出服务后自己断言类型。现在 id 和类型绑在一个定义上（57 个 id），取了不存在的成员、注册的值形状不对，编译不过。 |
| 干预点按名字定类型（PR 6，M10） | `packages/core/agent-loop/src/hooks.ts`、`packages/core/tool-runtime/src/hooks.ts`、`packages/composition/cordis-adapter/src/{event-contract,dispatch}.ts` | 八个干预点（`agent/request`、`tools/pre-execute` 这些）的 payload 和结果有了类型，监听器用 `onHook` 注册。目前没有生产插件注册干预点，改的是给插件作者的写法。规范里 `agent/pre-step`、`agent/turn-stopping` 两行按代码的实际行为改了。 |
| 防止再写回去的三个检查（PR 6） | `scripts/check-core-event-writes.mjs`、`scripts/check-service-access.mjs`、`scripts/check-harness-event-contracts.mjs`、`package.json` | `pnpm check:core-events`、`pnpm check:service-access`，以及 `pnpm check:harness-events` 新增的一条规则，随 `pnpm test:scripts` 在 CI 里跑。 |
| 「编辑提问再发送」不可用（PR 6，新发现） | `packages/session/session-persistence-jsonl/src/plugin.ts` | 存储的包装服务漏转发三个方法。编辑之前的提问再发送，每次都提示「这条提问不能再编辑。」，还会把这个会话正在运行的子智能体和后台任务停掉；查看已经释放的空闲会话，每次都把整份记录重读一遍。不在审查的 24 项里。 |
| `llm/stream` 的监听器不派发时归还路由（PR 6，新发现） | `packages/core/agent-loop/src/loop.ts` | 监听器直接给出流、不调 `next()` 时，准备好的那次调用占着的路由原来不归还，这条路由之后注销会等到超时。目前没有生产插件注册这个干预点。 |
| 标识符去掉 `RuntimeV2`（PR 7，L6） | 292 个文件：`apps/desktop` 97 个、`apps/cli` 14 个、`apps/web` 5 个、`packages/` 167 个、`browser-bridge/test-fixtures` 7 个、`scripts` 2 个 | 113 个名字、2,144 处，例如 `RuntimeV2SessionSnapshot` 改成 `RuntimeSessionSnapshot`。改名由 `node scripts/check-transitional-names.mjs --write` 完成，没有手改。只改代码里的标识符：目录名、文件名和引入路径里的 `runtime-v2`，IPC channel、设置键、落盘内容、界面文字都没有动。`SettingsV4` 这一类和 `LegacyProxyWireEngine` 核对之后没有改，原因见「已知风险和遗留事项」。 |
| 防止旧名字回来的检查（PR 7） | `scripts/check-transitional-names.mjs`、`scripts/check-current-docs.mjs`、`package.json` | `pnpm check:transitional-names` 随 `pnpm test:scripts` 在 CI 里跑；`pnpm check:docs` 多一条规则，设计文档和当前事实文档里出现旧名字会报。别的分支带进旧名字时，同一个脚本加 `--write` 就改掉。 |
| `DesktopLlmAdapter`（PR 7，L6） | `apps/desktop/src/main/runtime-v2/llm-adapter.ts`（原来叫 `legacy-llm-adapter.ts`）、`desktop-host-adapter.ts` | 桌面端现在唯一的 LLM 适配器，类名和文件名里的 `Legacy` 去掉。 |
| 删掉没有人读的字段（PR 7） | `apps/desktop/src/main/model-runtime-service.ts` | `ResolvedRuntimeModel.llmConfig` 和它的类型，11 行。 |
| 读源码的检查和测试不再依赖排版（PR 8） | `scripts/check-ipc-channels.mjs`、`scripts/check-hot-path-reads.mjs`、`scripts/check-path-containment.mjs`、`apps/desktop/src/renderer/test/markdown-editor-shell.test.tsx` | 这四处原来一行一行地认，一条语句折成几行就认不出来。改成按记号或对整份源码匹配；IPC 契约里读不懂的写法从跳过改成报错。对现在的代码，检查结果不变。排在格式化之前，各自单独一个提交。 |
| 全仓库按 Biome 配置格式化（PR 8，L1） | 1,953 个文件：`apps/desktop` 871 个、`packages/` 842 个、`apps/web` 104 个、`scripts` 86 个、`apps/cli` 21 个、`apps/site` 18 个、`browser-bridge` 6 个、`apps/promo-video` 5 个 | 双引号、分号、2 空格缩进、行宽 120。配置一直在 `biome.jsonc` 里，原来不强制。一个提交（`d26331ad`），完全是工具的输出，+142,815 / −39,439 行，代码含义不变。Markdown、CSS、JSON 和两个由脚本生成的文件不格式化。 |
| 格式检查进 CI（PR 8） | `package.json`、`.github/workflows/ci.yml`、`biome.jsonc`、`docs/coding-standards/lint-conventions.md` | `pnpm format:check` 在 `Lint 与类型检查` 里跑，有文件不符合配置 CI 就失败。提交前跑 `pnpm format`：全库写两遍再检查一遍，本机约 2 秒。 |
| `.git-blame-ignore-revs`（PR 8） | `.git-blame-ignore-revs`、`scripts/check-blame-ignore-revs.mjs`、`.github/workflows/base-checks.yml`、`scripts/check-repo-hygiene.sh` | 记下格式化和 PR 7 的改名两个提交，`git blame` 跳过它们。配一个检查：里面的哈希必须是完整的，并且在当前分支的历史里。 |

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

6. **编辑之前的提问再发送（PR 6）**
   - 验证方式：在桌面端的一个会话里发两三条消息，等回复结束。点前面某一条自己的提问（鼠标移上去提示「点击编辑并重新发送」），改几个字后发送。
   - 预期结果：这条提问和它之后的内容被替换，新的提问得到回复。原来每次都在输入框的提示行显示「这条提问不能再编辑。」，这个会话正在运行的子智能体和后台任务还会被停掉。
   - 这一项云端验证不了的部分：界面到 Runtime 之间的那一段。新增的用例按真实方式启动 Runtime，建会话、写三条消息、回退到第二条，确认记录只剩前面的部分；没有在真实的桌面窗口里点过。这个功能当时的执行记录（`docs/exec-runs/20261107-edit-resend-rewind/execution-process.md`）里就写着「Electron 实机待验收」。

7. **PR 8 合并之后，看一眼 `main` 的「仓库基础检查」（PR 8）**
   - 验证方式：PR 8 合并后，打开仓库的 Actions 页，看 `main` 上最新一次「仓库基础检查」。
   - 预期结果：通过。`Blame ignore revs` 那一步的输出是「2 个提交，都在当前分支的历史里」。
   - 失败时：说明合并方式不是 Create a merge commit。把 `.git-blame-ignore-revs` 里报出来的那几行哈希删掉（rebase 合并的话换成 `main` 上对应的新哈希）再提交，别的改动不受影响。在修好之前，每个 PR 的「仓库基础检查」都会是红的。

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
9. **日常用法走一遍（PR 6）**
   - 验证方式：启动桌面端，开一个新会话，让模型读一个文件、跑一条命令、再让它起一个子智能体做一件小事；等会话标题自动生成。扩展 › 插件 里开着「英语学习」或「操控浏览器」的话，各用一次。
   - 预期结果：和原来一样，启动和使用中都不出现 `… requires …` 这样的报错。
   - 为什么列在这里：PR 6 改了 122 个非测试文件里取用和注册服务的写法，其中五个插件（英语学习、会话标题、三个子智能体插件）在服务不在时从「之后用到时出错」改成「取用的地方直接报错」。逐个文件对过取用和注册的 id 前后一致，默认 Harness 的启动和各插件的用例都通过；云端没有真实的 Electron 窗口和真实的 Provider 连接。
10. **改名之后启动一次，浏览器验收脚本跑一次（PR 7）**
    - 验证方式：启动桌面端，打开一个已有的会话，再开一个新会话发一条消息。平时用浏览器验收脚本的话，按 `browser-bridge/test-fixtures/acceptance/README.md` 连好扩展和 Native Host，跑一次 `node browser-bridge/test-fixtures/acceptance/smoke.cjs`。
    - 预期结果：和原来一样。
    - 为什么列在这里：改名改到 292 个文件。依据是改名前后的构建产物对照（除了 26 个 `.js` 里的函数名、类名、常量名和模块导出名跟着改了，其余运行时代码逐字节相同）和全量测试；云端没有真实的桌面窗口。`browser-bridge` 的 7 个验收脚本要连真实的浏览器，只做了语法检查，核对了导出的名字和引用方一致，没有运行。
11. **几处界面文字里的空格（PR 8）**
    - 验证方式：启动桌面端，打开一个已有对话的会话。看三处：点输入框下方状态行里的上下文用量，浮层里「已用量 / 上限 Token」那一行；右侧面板的「上下文」里展开任意一条，看「≈… tokens · 占本类 … · 占全部 …」那一行；扩展 › Skills 里每个 Skill 名字后面的标签（「用户 · …」「项目 · …」）。
    - 预期结果：和原来一样。斜杠和圆点两边各有一个空格，「占本类」「占全部」和后面的百分比之间有一个空格，没有多出来或者粘在一起。
    - 为什么列在这里：格式化前后的代码逐个文件对过语法树，页面内容上的差别只有 JSX 里的空格：一共 19 处，显示的文字逐字相同，其中 11 处把紧挨着表达式或标签的空格拆成了单独的一小段，页面上原来的一个文本节点变成相邻的两个。依据是打包文件的对照和渲染进程的测试；云端没有真实的桌面窗口。
12. **本地配置一次 `git blame`（PR 8）**
    - 验证方式：PR 8 合并后，在本机的克隆里运行 `git config blame.ignoreRevsFile .git-blame-ignore-revs`，然后 `git blame apps/desktop/src/renderer/App.tsx`；再在 GitHub 上打开同一个文件的 blame 页面。
    - 预期结果：绝大多数行记在格式化之前真正改动它的提交上，不是格式化的那个提交。本地量过：这个文件 2,358 行里，记在格式化提交上的从 1,479 行降到 57 行（剩下的是 git 对不回上一个提交的行）。GitHub 的 blame 页面按它的文档会自动读这个文件。
    - 这一项云端验证不了的部分：GitHub 的 blame 页面，Agent 打不开它来核对。
    - 注意：配置之后检出还没有这个文件的旧提交时，`git blame` 会报 `could not open object name list`，先运行 `git config --unset blame.ignoreRevsFile`。

## Agent 已完成的验证

- `changes` 的判断脚本：在临时仓库里造 merge commit 模拟纯文档（含中文文件名）、代码、代码改名成文档、工作流文件、中文路径代码文件五种改动，输出符合预期。
- `./scripts/check-action-pinning.sh`、`./scripts/ci.sh`、`npx -y markdownlint-cli2@0.24.0 "**/*.md"` 通过。
- PR 1 上 `仓库基础检查`、`变更范围`、八个工程 job、`CI 汇总` 全部通过。
- PR 2：四层各自的单测与集成用例（清单见 `docs/histories/2026-11/20261110-1710-tool-result-size-limits.md` 的 Verification）。额度的集成用例做了反向验证：去掉额度后同一个用例报 `Context exceeds model capacity`。`pnpm check:hot-path-reads`、`pnpm check:scale-tests` 通过。PR 2 上 15 项检查全部通过。
- PR 3：M9 的规模测试、M7 的读取量测试、L9 的 ripgrep 解码用例和慢正则用例都在旧代码上确认过会失败；M3 的旧行为（IPv6 字面量地址全部读不了）单独确认过。数字见执行过程步骤 3。M9 的新旧读路径用 7,806 组读取参数对拍，返回内容逐字节一致。全量包测试、桌面端测试、仓库脚本与进程级测试在本地通过。
- 2026-11-13 同步 `main` 之后：三个分支各跑了一遍全量验证（范围见执行过程步骤 4）；每次合并前后比较了各 PR 相对它的 base 的改动量，没有变化。三种随机失败都先在本地复现（把 CPU 占满之后报错和 CI 上一致），改完同样条件下反复跑，不再失败；次数见 `docs/histories/2026-11/20261113-1311-flaky-package-tests-and-registry-dispose.md`。环境变量值的检查换写法之后，新旧两种写法在 200 万个随机串上结果一致。
- PR 4：M2 不改行为的那一步，重构前后把同一个场景的会话日志、实时事件、适配器收到的内容导出来逐字节对拍，一致。后两步和 M1 新增的用例都回到改之前的代码上确认过会失败（哪几条失败、报什么，见执行过程步骤 5），原有行为由「不带钩子时对拍仍然一致」守着。M1 另外量过内存，数字和量法见执行过程步骤 5。
- PR 5：共享实现在 POSIX 和 Windows 两套路径规则下各有一张用例表，并和一个写法独立的逐段比较实现穷举对照（posix 22,800 组、win32 66,822 组），结果一致；把实现改成原来那三种错的写法，测试都失败。有行为变化的每一处新增的用例，都回到改之前的代码上确认过失败；行为不变的几处补了用例，改之前同样通过。新加的检查在改之前的代码上报出 22 个文件 28 处，现在通过。清单见执行过程步骤 6。
- PR 6：三组改动都说「运行时行为不变」，各自核对过。事件：改动前后构造事件的地方用语法树逐处比较，71 处对 69 处，67 处逐字相同，其余两个文件逐处看过。服务：每个文件取用和注册的 id 前后比较，255 处、69 个文件全部一致；原来断言成「一定在」的 16 处逐处对过现在服务不在时的表现；非测试代码的改动整份读过。这一步找出三处那次提交的说明没有列的差别，一处改了回去，更正写在 history 里。干预点：9 处分发逐处对过。类型上，每组都有必须编译不过的反例（6、8、14 个）。三个检查里，前两个在改之前的代码上报出的就是这次改掉的那些，三个脚本都逐处改错再跑过用例（55、144、78 种改法，只有 1 种改了结果一样）。两处顺带的修复，新增的用例都回到改之前的代码上确认过失败。清单见执行过程步骤 7。
- PR 7：改名说的是「行为不变」，用三种办法核对。源码：另写一个脚本用 TypeScript 解析器逐 token 对照，292 个文件改名前后 token 的数量和种类相同，不同的只有 2,144 处标识符、1 处字符串和 3 处注释。位置：生产代码里的旧名字没有一处是对象的键或属性访问，也就是没有一个名字会跟着对象被序列化。产物：改名前后各从零构建一次，2,727 个产物文件名字相同，2,400 个逐字节相同，150 个把改名前的产物按同一张表改名后逐字节相同，其余 177 个是 source map、增量构建缓存和一个带构建时间的文件。新加的检查在改名之前的代码上报出 2,148 处，和解析器另外数的一致；脚本逐处改错再跑用例，36 处加文档规则的 7 处，每一处都有用例失败。全量验证 14 步通过，包测试的通过数和 PR 6 相同。清单见执行过程步骤 8。
- PR 8：格式化说的是「代码含义不变」，用四种办法核对。源码：另写一个脚本用 TypeScript 解析器，不依赖 Biome，1,953 个文件逐个比较格式化前后的语法树、记号和注释，不等价的文件 0 个；空白以外的改动（括号、引号、尾逗号、JSX 里的 19 处空格）逐类计数。注释指令：只管下一行的指令一共 53 条，逐条比较它管住的那一行。折行后管不到出错位置的 3 条 `@ts-expect-error` 在格式化之前挪了位置；挪完之后 49 条那一行上的记号一个没少，另外 4 条有记号折到后面的行，3 条核对过仍然管得到，1 条（`v8 ignore`）没有覆盖率工具可以测。产物：格式化前后各从零构建一次，两边各 21,813 个文件，逐类对照。差别是产物里保留下来的源码排版、JSX 的那几个位置，以及跟着内容变的文件名哈希和一个带构建时间的文件。读源码的检查和测试：19 个脚本在两棵树上各跑一遍，比较退出码、输出和每条正则的命中次数，不同的 5 个逐个看过；读源码文本的测试逐个看过否定的断言。格式化提交在临时克隆里按提交说明的命令重新生成过，目录树完全相同。格式检查试过拦得住；`.git-blame-ignore-revs` 的检查逐处改错再跑用例，16 处每一处都有用例失败。别的分支的对齐步骤在当时开着的另外 5 个 PR 上各试过一遍。全量验证 18 步通过，包测试的通过数和 PR 7 相同。清单见 `docs/histories/2026-11/20261114-1610-biome-format-all.md` 的 Verification。

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
- PR 6 之后，`agent/pre-step`、`agent/turn-stopping` 两个干预点的规范和类型契约都按代码现在的行为写：前一个的返回值只记进 `step/start` 的 `metadata`，跳不过也改不了这一步；后一个的返回值没有人读，这一轮照常结束。规范原来写的「跳过或改写一步」「决定继续还是停止」没有实现，这批没有补。要不要补需要你来定，记在 `docs/exec-plans/tech-debt-tracker.md`。
- PR 6 的三个检查都只按文本匹配，各自认不出的写法写在脚本开头。例如把取出来的服务先存进变量、隔一行再断言类型，把 core 的名字先存进别的常量再用，干预点的名字不是字面量，都认不出来，还要靠评审。
- PR 6 只管 `@actspace/core` 名下的事件。别的插件（context、task、todo 等）写自己名下的事件，`data` 的类型仍然靠断言，由各自的 codec 在运行时校验。
- PR 6 里五个插件（英语学习、会话标题、三个子智能体插件）多了 12 处「服务不在就报错」的判断，那次提交的说明没有列。这些插件的 `inject` 都列了这些服务，正常挂载时走不到；走到时报的是 `<取用方> requires <id>.`，原来是之后用到时的 TypeError。
- PR 6 让 CLI 的 Agent Host 在 Profile 里没有 `agent.runtime` 时启动就报 `Agent runtime unavailable`，原来是之后第一次用到时出错。正常安装里走不到；报错的这个分支没有用例，正常启动由进程级测试覆盖。
- `tsconfig.base.json` 的 `"baseUrl": "."` 让声明文件里出现以仓库根目录为起点的路径，两个 app 解析不到时那个类型会悄悄变成 `any`，类型检查不报错。强制重建后 634 个声明文件里有 4 处，都是原有的。PR 6 只绕开了自己碰到的那一处并加了编译期检查；根因计划放在栈顶单独一个 PR（PR 9），可以不合。
- PR 7 没有用户能感知的变化，所以没有写发布记录。运行时的差别只有调用栈里的函数名和类名。
- PR 7 只做了审查条目 L6 的一部分，另外两部分核对之后撤回，审查时看错了：
  - `SettingsV4`、`getV4`、`updateV4` 这一类里的 `V4` 是设置落盘格式的版本号，不是过渡期的后缀。旧格式的类型和迁移代码还在，新旧两套读写接口并存，去掉 `V4` 之后两套名字分不开。
  - `LegacyProxyWireEngine` 是 LLM 设计文档定义的 legacy transport，名字和设计一致。名字里的 `Proxy` 只对一半，设计文档也有两处没跟上，记在 `docs/exec-plans/tech-debt-tracker.md`；要不要连设计文档的用词一起按职责改名，需要你来定。
- PR 7 只改标识符。`runtime-v2` 这个目录名、文件名和引入路径（`@actspace/shared/runtime-v2`，303 个文件 394 处）没有改：别的分支新写的 import 在改名之后会解析不到，也没有一条命令能对齐。要改的话单独一个 PR。
- PR 7 合并之后，从它之前的 `main` 拉出去的分支如果新写了旧名字，合并 `main` 之后类型检查和 `pnpm check:transitional-names` 会报。在那个分支上跑 `node scripts/check-transitional-names.mjs --write` 再跑 `pnpm typecheck` 就对齐了。2026-11-14 核对过当时开着的另外 5 个 PR，新增的行里都没有旧名字。
- `pnpm check:transitional-names` 只认含 `RuntimeV2` 的标识符和表里逐个列出的 7 个名字。新起一个别的带版本后缀的名字（例如 `FooV2`）不会报：设置和 Session 事件的格式版本也是这种写法，脚本区分不开，还要靠评审。文档那条规则只查设计文档和当前事实文档。
- PR 7 让 `@actspace/shared/runtime-v2` 入口文件的内容变了，Host 契约摘要跟着变。只用内置 Harness 的数据目录启动时自动换到新版本；有自定义 Harness 选择的数据目录，那个选择会被拒绝并要求重新准备。这不是 PR 7 才有的：PR 5、PR 6 已经改过 7 个入口文件里的 5 个。被拒绝的这条路径没有实际走一遍，依据是读 `harness-control` 的代码。摘要只看入口文件字节这一点记在 `docs/exec-plans/tech-debt-tracker.md`。
- PR 8 没有用户能感知的变化，所以没有写发布记录。
- PR 8 合并之后，从它之前的 `main` 拉出去的分支直接合并 `main` 会在自己改过、又被重排的地方冲突。对齐步骤写在 `docs/coding-standards/lint-conventions.md` 的「格式化提交之前拉出去的分支」，一共四步，格式化这一步不产生冲突。在当时开着的另外 5 个 PR 上各试过一遍（结果见 history 的表）；试的时候合并的是这条栈的栈顶，`main` 在那之后再有改动的话，最后一步可能有新的内容冲突。
- PR 8 之后格式是强制的：有文件不符合配置，CI 的 `Lint 与类型检查` 会红，提交前要跑 `pnpm format`。Biome 2.6.6 对两类写法要写两遍才稳定，`pnpm format` 已经是两遍。只写一遍的做法（直接调 `biome format --write`，或者编辑器保存时格式化一次）遇到那两类写法时，可能留下 CI 会报的文件；编辑器里的表现没有试过。
- 行宽 120 把长行折开之后，renderer 的源码从 96,791 行变成 125,576 行，代码没有变多。超过「单个文件 500 行就要拆」这条线的非测试文件从 7 个变成 20 个，`App.tsx` 从 1,670 行变成 2,358 行。阈值没有动，也没有拆文件；新超标的 13 个记在 `docs/exec-plans/tech-debt-tracker.md`。阈值按新排版重新定，还是把这 13 个排进拆分，需要你来定；`App.tsx` 拆分计划里的「300 行以内」同理。
- `.git-blame-ignore-revs` 的检查要看完整的提交历史，「仓库基础检查」的检出因此从浅克隆改成取全部提交（文件内容仍然只取检出要用的）。量过一次：多取 858 个提交对象、约 0.6 MB，约 3.1 秒对 2.4 秒；历史越长取得越多。不想付这个代价的话，去掉 `base-checks.yml` 里 `Blame ignore revs` 那一步和检出的两行配置：之后 CI 上这个检查只看文件的写法（完整的 40 位哈希、不重复、有注释），不再核对哈希在不在历史里。`.git-blame-ignore-revs` 本身不依赖这个检查。
- PR 8 改到了发布工作流盯着的 6 个打包脚本（只改排版），所以它的 CI 会在四个平台各打一次包，不发布。本地只跑了 Linux 的打包；macOS 和 Windows 要看这个 PR 的 CI，写这一条时还没有跑。
- PR 8 让 `@actspace/session-journal` 的入口文件多了一个尾逗号，Host 契约摘要跟着变，效果同上面 PR 7 的那一条。默认 Harness 的打包文件保留一部分源码排版，13 个 chunk 的内容和文件名跟着变。
- 三个检查脚本（`check:service-access`、`check:core-events`、`check:path-containment`）共用一条「整行是注释就跳过」的正则，它把以 `*` 开头的代码行也当成注释。现在全仓库有 4 行这样的代码，格式化前后是同样的 4 行，都不是这三个检查要找的写法。记在 `docs/exec-plans/tech-debt-tracker.md`。
- 格式化的范围是 JS、TS 和 YAML。CSS、JSON、Markdown 没有格式化，也不检查；Markdown 仍然由 markdownlint 管。
- PR 8 没有验证的：GitHub 的 blame 页面读不读 `.git-blame-ignore-revs`（GitHub 文档写的行为）；真实桌面窗口里 JSX 的那几个位置；`v8 ignore` 那一条指令折行之后还管不管得到（仓库没有装覆盖率工具）。

## 后续建议

- 进行中，执行结束时补全。
