# 代码库审查修复：工具结果体积上限、CI 门禁与中低优先级修复

## 目标

2026-11-10 对 `main@589abf25` 做了一次全仓质量审查，共 24 条发现。和用户逐条讨论后，确定要修的是 1 条高优先级（H4）、1 条工程门禁（H2）、8 条中优先级和 5 条低优先级。这个计划把它们拆成 8 个按顺序合并的 PR，一次做完，让用户第二天按编号合并即可。

做完之后：

1. 任何一次工具调用都不会再让会话卡住：四个文件工具有自己的体积上限，tool-runtime 对所有工具兜底，回合中途写会话记录失败时会把回合收尾。
2. `ci.yml` 有一个每个 PR 都报告的汇总检查，可以设为合并必需。
3. 其余条目按下面「条目明细」逐项落地，每项有对应的测试或检查。

## 状态

2026-11-10 立项并开始执行，夜间模式。进度见「进度记录」。

## 范围

**包含（按 PR 顺序）：**

| PR | 分支 | 条目 | 内容 |
|---|---|---|---|
| 1 | `cursor/review-01-ci-gate-e412` | H2 | `ci.yml` 改成 job 级路径判断加汇总 job；顺带修 `main` 上已经红了的 markdownlint；本计划与执行记录 |
| 2 | `cursor/review-02-tool-result-limits-e412` | H4 | 文件工具体积上限、tool-runtime 兜底、回合收尾、按窗口的批次预算、客户端卡片读 `detail` |
| 3 | `cursor/review-03-fixes-e412` | M6、M9、M7、M3、L2、L9 | 测试稳定性、会话读路径、Agent Host 读产物与上传、`web_fetch` DNS 钉扎、Hooks 规则、三处零散修复 |
| 4 | `cursor/review-04-agent-loop-request-e412` | M2、L5、M1 | Loop 请求路径去重、测试夹具对齐生产、abort 监听器释放 |
| 5 | `cursor/review-05-path-containment-e412` | M5 | 路径包含判断收敛为一个带测试的共享实现 |
| 6 | `cursor/review-06-typed-contracts-e412` | M10 | 事件构造、服务取用、钩子 payload 的类型 |
| 7 | `cursor/review-07-naming-e412` | L6 | 去掉过渡期的版本后缀命名 |
| 8 | `cursor/review-08-format-e412` | L1 | 全量格式化、CI 检查、`.git-blame-ignore-revs` |

**不包含：**

- H1（沙箱内可读明文密钥并联网）、H5（`edit_file` 不能纯删除）、M8（三类凭据三种存法）、L7（沙箱只在 macOS 完整可用）：用户决定不修。
- H3（Bash 硬拒绝规则）：已随 #72 合入。
- L3（`App.tsx` 拆分）：按已有的 [App 装配层拆分](20261110-app-assembly-split.md) 做，不在这里。
- L4（包粒度）、L8（文档量）：复核后撤回。L4 与「一个插件一个包」的规则和 [`@actspace/shared` 契约分层](20261109-shared-contract-split.md) 冲突，L8 只是观察。
- M4（每条命令起一个登录 shell）：改的是每条命令的运行环境，要在 macOS 上实机验证，云端只有 Linux；用户也还没给出本机的耗时对比。本批不做。
- M7 里的设备令牌过期与轮换：属于凭据话题，随 M8 搁置。
- H4 相关但不在这次做的：改 token 估算器（面板、自动压缩、容量检查共用一套）；发请求时修剪已经存进会话的旧结果；把超大的助手消息或工具调用参数存到会话记录之外。

## 背景

- 审查与讨论发生在对话里，仓库内没有那份报告。本计划的「条目明细」把每条的现象、位置和修法写全，执行时不依赖对话记录。
- 必读文档：`docs/REPO_COLLAB_GUIDE.md`、`docs/coding-standards/perf-memory-conventions.md`（PR 2、3、4 改到高频路径）、`docs/design-docs/agent-plugin-runtime/agent-testing.md`、`docs/CICD.md`、`packages/README.md`。
- 已知约束：
  - `main` 的 ruleset 要求分支与 `main` 同步（strict）、1 个 approve，必需检查目前只有 `仓库基础检查`。
  - 8 个 PR 是一条线性栈：每个 PR 的 base 是上一个 PR 的分支。合并方式要选 **Create a merge commit**；squash 或 rebase 会改写提交，后面的 PR 会和已合入的内容冲突。仓库开了合并后自动删分支，下一个 PR 会自动改为指向 `main`。
  - Agent 对 GitHub 只有只读权限加「创建 / 更新 PR」，不能改 ruleset、不能合并。
  - 一个插件一个包、领域包只经 `cordis-adapter` 接触 Cordis、能力之间只依赖接口包，这些由 `pnpm check:packages` 把关，本计划不新增包。

## 条目明细

### PR 1：CI 门禁（H2）

- **现象**：`main` ruleset 的必需检查只有 `仓库基础检查`（文档结构、仓库卫生、Actions 版本固定、shell 语法），不跑代码。lint、类型检查、测试、构建在 `ci.yml`，它带工作流级 `paths-ignore`，纯文档 PR 不触发；GitHub 对「没触发的必需检查」一直显示 Expected 并卡住合并，所以这些 job 不能设为必需，CI 红着也能合并。
- **位置**：`.github/workflows/ci.yml`、`.github/workflows/base-checks.yml`（注释）、`docs/CICD.md`。
- **修法**：`ci.yml` 去掉工作流级 `paths-ignore`；新增 `changes` job，用 merge commit 的两个父提交比较改动文件，忽略路径与原 `paths-ignore` 相同；八个工程 job 加 `needs: changes` 与 `if: needs.changes.outputs.code == 'true'`；新增 `ci-gate`（「CI 汇总」），`needs` 全部 job、`if: always()`，任一 failure 或 cancelled 即失败。不引入第三方 action。
- **需要用户做的**：这批 PR 合完之后，在 **Settings › Rules › Rulesets › main** 把 `CI 汇总` 加进 required status checks。先合工作流、确认这个 check 在 PR 上出现过，再设必需。
- **顺带**：#78 合入后 `docs/design-docs/site-v6/README.md` 有 6 张图没有 alt，`main` 的 `仓库基础检查` 是红的，之后每个 PR 都会带着这个失败。第一个提交补上 alt。
- **验证**：本地模拟四类改动（纯文档含中文文件名、代码、代码改名成文档、工作流文件）时 `changes` 的输出正确；PR 上 `变更范围` 与 `CI 汇总` 两个 check 出现并通过；`./scripts/check-action-pinning.sh`、`./scripts/ci.sh`、markdownlint 通过。

### PR 2：工具结果体积上限（H4）

- **现象**：`read_file` 把文件整个读进内存再按行切片，没有字节上限、没有单行长度上限、`limit` 没有最大值，二进制文件也按文本解码；`edit_file`、`write_file` 把完整 diff 原样返回；`list_directory` 不限条目数。实测单次返回最大 11.34 MB。grep、glob、`web_fetch`、Bash 都有上限。
- **两种失败方式**：
  - (a) 单条结果序列化后超过 1 MiB（`session-journal/src/event-envelope.ts` 的 `MAX_JSON_BYTES`）：写会话记录时抛错，这一轮失败，而且回合没有闭合，同一个会话之后每条消息都报 `Cannot start Turn … while … is open`，直到会话从磁盘重新打开。`edit_file` 触发时文件已经改了，模型看不到结果。助手消息或工具调用参数超过 1 MiB 也走到同一个死局。
  - (b) 没到 1 MiB，但超过上下文窗口的剩余空间：结果已经写入，自动压缩不压末尾这批工具结果，之后每条消息都在发请求前失败。
- **位置**：`packages/fs/tool-fs-read/src/node-ports.ts`、`packages/fs/tool-fs-write/src/node-ports.ts`、`packages/core/tool-runtime/src/prepared-execution.ts`（`finalize()`）、`packages/core/agent-loop/src/loop.ts`（`runTurn` 的失败收尾、工具批次）、`packages/session/session-persistence/src/recovery.ts`、`packages/client/client/src/sessions/tool-card.ts`。
- **修法，四层**：
  1. **工具自己设限。** `read_file`：输出字符预算 64,000；单行超过 2,000 字符时截断并标出原长度；按整行截断，尾注写明下一次的 `offset`；前 8 KB 含 NUL 字节的按二进制拒绝；按需读取而不是整个读进内存；图片分支加字节上限。`edit_file`、`write_file`：diff 超过预算时截断，增删行数照实给出。`list_directory`：限输出长度，尾注给出总数。界面上的目录条目数原先是从给模型的文本里数的，所以真实的条目数写进 `detail`，客户端优先读它；diff 卡片的增删行数本来就读 `detail`，只补测试。
  2. **tool-runtime 兜底。** `finalize()` 在结果提交前按会话记录同样的度量（序列化后的 UTF-8 字节数）检查，超过 256 KiB 就保留头部、把完整输出转存为产物文件、附一句说明。不改成功或失败的状态，因为副作用已经发生。
  3. **回合收尾。** 回合中途写会话记录失败、留下没闭合的请求或工具调用时，用 `session-persistence` 现成的恢复逻辑把它们标成终态，再关掉回合，会话可以继续用。
  4. **按窗口的批次预算。** loop 知道窗口大小和已用量，把「这一批工具结果合计还能用多少」经 `ToolPreparedEnvironment` 传给 tool-runtime，由第 2 层按这个额度截断。管失败方式 (b)。
- **验证**：每层有对应的单测；新增用例覆盖 3 MB 单行文件、`limit` 超大、二进制文件、超大 diff、5 万条目目录、超过 256 KiB 的插件工具输出、超过 1 MiB 的助手消息后会话仍可继续、小窗口下一批并行读取不再超窗。

### PR 3：修复合集

- **M6 测试依赖机器环境。**
  - `packages/core/tool-runtime/src/test/runtime.test.ts` 有 3 个用例假设 `/workspace` 是真实目录，在 `/workspace` 是符号链接的环境（云端 Agent、devcontainer）失败。改用 `mkdtemp` 加 `realpath` 建工作区。其余 41 个出现 `/workspace` 的测试文件只把它当假路径字符串，不动。
  - `packages/session/session-persistence-jsonl/src/test/refresh.test.ts` 连跑 5 次失败 3 次。根因在产品代码 `jsonl-reader.ts`：文件大小不变时只靠 stat 时间戳判断内容有没有变，时间戳粒度内的等长改写会被当成没变。大小相同时再比对内容。
- **M9 会话读路径随会话长度增长。** `packages/core/runtime/src/session/session-controller.ts` 的 `readProjection` 对窗口内事件 `JSON.stringify` 两遍、对整份消息做 map 和 filter、`boundaries` 投影逐事件复制数组；`packages/session/session-persistence-jsonl/src/jsonl-reader.ts` 每次增量读取都 `[...resume.events, ...next]` 复制全部事件。先写规模测试（1k 与 10k 事件，读取与复制计数不随规模增长）确认它在旧代码上失败，再改实现，并登记到 `scripts/scale-test-coverage.json`。
- **M7 Agent Host 读产物与上传。** `packages/host/agent-host/src/artifacts.ts` 每取一个不超过 256 KB 的分片都把整个文件读进内存；`uploads.ts` 的 `resolve()` 整读一遍算 SHA-256，`readForSession` 再整读一遍，`uploads.begin` 每次 `readdir` 整个上传目录；`server.ts` 把 `TypeError` 当参数校验错误，内部抛出的 `TypeError` 消息会以 -32602 原样返回客户端。改成按偏移 `fd.read`、完整性校验结果按 inode / 大小 / mtime 缓存、参数错误换专用错误类型。
- **M3 `web_fetch` 的 SSRF 校验和连接各解析一次 DNS。** `packages/web/tool-web/src/node-ports.ts` 的 `assertPublicHostname` 解析一次、`fetch` 再解析一次，DNS rebinding 可以让两次结果不同；IPv6 字面量带方括号，`isIP` 判不出来。把校验过的地址钉到连接上，并先去方括号再判断。逐跳复验重定向、5 MB 响应上限、拒绝内嵌凭据保持不变。
- **L2 Hooks 规则。** `biome.jsonc` 的 `useHookAtTopLevel` 是 `off`；开启后全仓只有 1 处误报：`browserBridgeApi.useBundledExtension()` 是名字以 `use` 开头的普通方法。给它改名，规则开回 `error`。
- **L9 三处零散修复。**
  - `packages/util/shared/src/child-process-env.ts` 剥离「名字像凭据」的环境变量时漏了 `DATABASE_URL`、`*_DSN`、`*_PWD` 这几类，值里形如 `scheme://user:pass@host` 的也没有处理。
  - `packages/shell/tool-shell/src/node-ports.ts` 的后台命令输出订阅让模型给一个正则，每行输出同步匹配一次；7 个字符的 `(a+)+$` 对 28 个字符的输入要 2.9 秒，匹配期间整个进程不响应。把匹配移出主线程并加超时。
  - `packages/fs/tool-fs-search/src/node-ports.ts` 按块 `chunk.toString("utf8")` 解码 ripgrep 输出，多字节字符被切在两块之间时变成乱码。改用 `StringDecoder`。

### PR 4：Agent Loop 请求路径

- **M2**：`packages/core/agent-loop/src/loop.ts` 的 `runTurn` 里「准备请求、写记录、派发」写了两遍。首次请求外面包着 `catch { prepared.release(); throw }`，重试那一份没有；重试的消息从 `converted.input.messages` 重建，不再经过 `agent/request` 钩子。先做不改行为的重构，抽出首次和重试共用的函数；再分提交补上重试路径的释放，并让重试也经过同一个钩子。
- **L5**：`loop.ts` 里「没有 `contextSources`」的分支在生产走不到（两个生产构造点都传了），只有 `packages/core/agent-loop/src/testing.ts` 的夹具默认不传。夹具改成默认传，再删掉这些分支。
- **M1**：`packages/llm/llm-service/src/prepared-call.ts` 每次 LLM 调用往这一轮共用的 `AbortSignal` 上挂一个 abort 监听器，流结束后不摘除，闭包持有那次调用的流和请求快照；`packages/core/tool-runtime/src/prepared-execution.ts` 是同样的写法。合成场景下 200 步累积 55.8 MB，到这一轮结束才释放。流结束时摘除监听器，并加一个断言监听器数量不随步数增长的测试。

### PR 5：路径安全模块（M5）

- **现象**：「路径是否在某个目录内」有 13 个具名实现（`within`、`contains`、`isPathWithin`、`isWithin`、`isInside`），另有约 30 处内联判断，语义已经不一致：有的用 `startsWith("..")`，把 `..foo` 这种合法名字误判为越界；有的缺 `isAbsolute` 检查；有的只匹配 `"../"`；有一份把「等于根目录本身」判为不在目录内。
- **位置**：`packages/core/tool-runtime/src/permission/file-resource.ts`、`packages/fs/tool-fs-{read,write,search}/src/node-ports.ts`、`packages/shell/tool-shell/src/{node-ports,command-rules}.ts`、`packages/sandbox/sandbox/src/policy.ts`、`packages/host/agent-host`、`packages/core/agent-service`、`apps/desktop/src/main`。
- **修法**：在 `@actspace/shared` 放一个带测试的实现（不新增包），函数名写明「输入必须是已规范化的绝对路径」这条约定，「是否包含根目录本身」做成显式参数；逐处替换。每替换一处先确认原实现的语义，语义有意不同的保留差异并写明原因。

### PR 6：类型安全（M10）

- **现象**：事件构造函数 `core(type: string, data, extra)` 返回 `as never`，同一个函数有 5 份拷贝，`session.append(core(...))` 有 46 个调用点；服务按字符串 id 取出后强转，约 107 处、68 个不同的 id；waterfall 钩子的 payload 是 `Record<string, unknown>`。事件名或字段写错，编译器不会报。
- **修法**：按事件类型做 typed event builder，5 份拷贝收敛为一份；服务取用接到已有的 `ServiceDefinition` 上；钩子 payload 按事件名映射类型。按事件、服务、钩子分成三组提交，每组独立通过类型检查和测试。

### PR 7：过渡期命名（L6）

- **现象**：`RuntimeV2` 出现 2,010 处（265 个文件），`Legacy` 483 处（94 个文件），`SettingsV4` 292 处。v1 已经退役，`LegacyProxyWireEngine`、`DesktopLegacyLlmAdapter` 其实是生产路径。
- **修法**：机械重命名去掉版本后缀；还在用的 `Legacy*` 按职责改名。磁盘格式、协议字段、IPC channel 名、设置键这些对外可见的字符串不改。

### PR 8：格式化（L1）

- **现象**：`biome format` 检查的文件里约 84% 不符合配置，最长一行 1,129 个字符。
- **修法**：全量格式化单独一个提交，登记到 `.git-blame-ignore-revs`；CI 里加格式检查。

## 风险

- 风险：线性栈里靠后的 PR 依赖靠前的，中间某个 PR 不合，后面的都要重新整理。缓解：按「先修复、后重构、最后机械改动」排序，越靠前越独立、价值越高；每个 PR 自己通过全部检查。
- 风险：合并时选了 squash 或 rebase，后面的 PR 冲突。缓解：每个 PR 描述第一行写明合并方式。
- 风险：PR 2 的截断改变了模型看到的工具输出，可能影响依赖完整输出的行为。缓解：阈值参照仓库已有的上限（grep / glob 64,000 字符、`web_fetch` 50,000），截断时尾注说明怎么取剩余部分；完整输出仍然转存为产物。
- 风险：PR 3 把后台命令输出订阅的正则匹配移出主线程，匹配从同步变成异步，通知的先后顺序可能变。缓解：匹配结果的语义不变，测试覆盖顺序与超时两种情况。
- 风险：PR 7、PR 8 改动面覆盖全仓，其它在飞的分支合并时要重新对齐。缓解：放在栈顶最后合；两者都能用命令重新生成，分支过期时重做一遍比手工解冲突便宜。
- 风险：云端只有 Linux，没有 macOS 的 Seatbelt / nono 和真实 Electron 窗口。缓解：涉及平台行为的条目（M4）不做；其余改动由单测和进程级测试覆盖，未覆盖的范围写进执行摘要的人工验证指引。

## 里程碑

1. PR 1：CI 门禁与本计划。
2. PR 2：H4 四层。
3. PR 3：修复合集。
4. PR 4：Agent Loop 请求路径。
5. PR 5：路径安全模块。
6. PR 6：类型安全。
7. PR 7：命名。
8. PR 8：格式化。
9. 收尾：执行摘要、计划移到 `completed/`。

## 验证方式

- 每个 PR 提交前在本地跑：`./scripts/ci.sh`、`npx -y markdownlint-cli2@0.24.0 "**/*.md"`、`pnpm lint`、`pnpm typecheck`、改到的包的 `pnpm --filter <包> test`、`pnpm check:hot-path-reads`、`pnpm check:scale-tests`、`pnpm check:packages`；改到契约矩阵覆盖的源码时 `pnpm run gen:contract-matrix`。
- 每个 PR 推送后看 GitHub 上的 `仓库基础检查` 与 `CI 汇总`，红了就在同一个分支上修。
- 栈顶分支上跑一遍完整的 `pnpm -r --if-present --filter '!actspace' test` 与 `pnpm test:scripts`。
- 手工检查与未覆盖范围写在 `docs/exec-runs/20261110-codebase-review-fixes/execution-summary.md`。

## 进度记录

- [x] 读协作文档、确认环境、定 PR 结构。
- [x] PR 1：CI 门禁。[#83](https://github.com/WakeUp-Jin/actspace-agent/pull/83)，全部检查通过。
- [x] PR 2：H4。四层都已落地，过程见执行记录步骤 2。
- [ ] PR 3：修复合集。
- [ ] PR 4：Agent Loop 请求路径。
- [ ] PR 5：路径安全模块。
- [ ] PR 6：类型安全。
- [ ] PR 7：命名。
- [ ] PR 8：格式化。
- [ ] 执行摘要，计划移到 `completed/`。

## 决策记录

- 2026-11-10：用线性栈而不是互相独立的 PR。原因：靠后的几组（Loop 请求路径、路径模块、类型、命名、格式化）和靠前的几组改同一批文件，独立分支合并时必然冲突；ruleset 的 strict 让每合一个 PR 其余的都要同步一次，栈和独立 PR 的合并成本相同，栈不会冲突。
- 2026-11-10：H4 和 M10 原先建议各拆成多个 PR，改为一个 PR 内分提交。原因：线性栈里拆细不增加「可以跳过某一个」的自由，只增加合并轮数。
- 2026-11-10：`changes` job 用 `git diff` 比较 merge commit 的两个父提交，不用第三方 paths-filter action，也不调 GitHub API。原因：不新增供应链依赖（与 2026-11-08 的决策一致），不受 PR 文件列表接口 3,000 个文件的上限影响。
- 2026-11-10：纯文档 PR 的判定范围和原 `paths-ignore` 保持一致，不借机扩大或缩小。
- 2026-11-10：M9 先做审查点名的两处（`session-controller.ts` 的读投影、`jsonl-reader.ts` 的增量读）和它们的规模测试。`scripts/scale-test-coverage.json` 的 9 个待补项在执行 PR 3 时逐个判断：属于高频路径的补规模测试；本来就要整份读的低频流程（恢复、修复）不硬写一个注定失败的规模测试，保持待补并在执行记录里写明。
- 2026-11-10：M5 的共享实现放进 `@actspace/shared`，不新增包。原因：它没有生命周期、不是插件；`shared` 已经是全部相关包的依赖。
- 2026-11-10：H4 第 4 层的额度取「现在还剩多少」和「压缩之后可用空间的一半」里小的那个，不是只看剩余空间。原因：自动压缩选区间时不会包含最后一条助手消息和它的工具结果，只看剩余空间的话，一批结果可以占满窗口，压缩后摘要和下一步没有地方放；只看压缩后的空间的话，压缩失败或选不出区间时下一次请求发不出去。
- 2026-11-10：一批内部的额度按出结果的先后分配，给每个还没出结果的调用留 8,000 字符，不按调用数平分。原因：一批里常见的是一两个大结果加几个小结果，平分会把大结果截短，而小结果用不完自己那份。代价是并行调用整体超额时，各调用被截到多长取决于谁先出结果。
- 2026-11-10：额度沿用上下文估算的 4 个字符 1 token，不为中文单独修正。原因：估算器由上下文面板、自动压缩和容量检查共用，「范围 › 不包含」已经写明这次不改它；只在这一处换算法会让额度和容量检查对同一段文字给出不同的数。已占用的部分在 Provider 报了用量时取报的值，偏差只落在这一批新结果上。限制写在 `agent-tool-output-references.md`。
- 2026-11-10：H4 第 3 层复用崩溃恢复的事务和记录类型，由 Agent Loop 在失败处理里调用，没有新增事件类型。原因：了结的内容（请求没有结果、工具调用结果未知）和崩溃后是同一件事，界面和恢复逻辑已经认识这些记录。

## 执行模式

- **夜间模式**（变体）：用户离线，Cursor Cloud Agent 在云端 VM 内自主执行，不经 nono。所有改动只通过 PR 进入 `main`，合并由用户决定。

## 执行文档

- `docs/exec-runs/20261110-codebase-review-fixes/execution-process.md`
- `docs/exec-runs/20261110-codebase-review-fixes/execution-summary.md`
