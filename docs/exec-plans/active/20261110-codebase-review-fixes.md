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
- **2026-11-13 追加**：#90 带进 `main` 的三种让「包测试」随机变红的失败也修在这个 PR。两种只改用例，一种改后台任务登记表的 `dispose()`。放在这里的原因见「决策记录」，细节见 `docs/histories/2026-11/20261113-1311-flaky-package-tests-and-registry-dispose.md`。上面「顺带」那一条的 alt，`main` 后来自己补了，同步时取 `main` 的。

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
- **2026-11-13 追加**：推送后 CI 报了两处，都修在这个 PR。PR 2 和这个 PR 各加了一条 2026-11-10 的发布记录，官网构建失败，合成一条；L9 环境变量值的检查用的粘性正则被 CodeQL 报成多项式复杂度，换成逐字符扫描，行为不变。

### PR 4：Agent Loop 请求路径

- **M2**：`packages/core/agent-loop/src/loop.ts` 的 `runTurn` 里「准备请求、写记录、派发」写了两遍。首次请求外面包着 `catch { prepared.release(); throw }`，重试那一份没有；重试的消息从 `converted.input.messages` 重建，不再经过 `agent/request` 钩子。先做不改行为的重构，抽出首次和重试共用的函数；再分提交补上重试路径的释放，并让重试也经过同一个钩子。
- **L5**：`loop.ts` 里「没有 `contextSources`」的分支在生产走不到（两个生产构造点都传了），只有 `packages/core/agent-loop/src/testing.ts` 的夹具默认不传。夹具改成默认传，再删掉这些分支。
- **M1**：`packages/llm/llm-service/src/prepared-call.ts` 每次 LLM 调用往这一轮共用的 `AbortSignal` 上挂一个 abort 监听器，流结束后不摘除，闭包持有那次调用的流和请求快照；`packages/core/tool-runtime/src/prepared-execution.ts` 是同样的写法。合成场景下 200 步累积 55.8 MB，到这一轮结束才释放。流结束时摘除监听器，并加一个断言监听器数量不随步数增长的测试。
- **2026-11-13 补充**：上一条的 55.8 MB 是审查时另一个合成场景的数字，探针没有留下来，这次没有复现。修之前重新量（每步一条 2 KB 的工具结果，最后一次请求派发前强制 GC，和修之后相减）：200 步、请求带 1 个工具定义时，监听器多留住约 7 MB；400 步约 26 MB；200 步、30 个工具定义约 10.5 MB。留住的量随步数和工具定义的数量变，两组数字不能直接比。监听器数随步数线性增长这一点成立。数字和量法见「决策记录」与 `docs/histories/2026-11/20261113-1430-agent-loop-request-path.md`。

### PR 5：路径安全模块（M5）

- **现象**：「路径是否在某个目录内」有 13 个具名实现（`within`、`contains`、`isPathWithin`、`isWithin`、`isInside`），另有约 30 处内联判断，语义已经不一致：有的用 `startsWith("..")`，把 `..foo` 这种合法名字误判为越界；有的缺 `isAbsolute` 检查；有的只匹配 `"../"`；有一份把「等于根目录本身」判为不在目录内。
- **位置**：`packages/core/tool-runtime/src/permission/file-resource.ts`、`packages/fs/tool-fs-{read,write,search}/src/node-ports.ts`、`packages/shell/tool-shell/src/{node-ports,command-rules}.ts`、`packages/sandbox/sandbox/src/policy.ts`、`packages/host/agent-host`、`packages/core/agent-service`、`apps/desktop/src/main`。
- **修法**：在 `@actspace/shared` 放一个带测试的实现（不新增包），函数名写明「输入必须是已规范化的绝对路径」这条约定，「是否包含根目录本身」做成显式参数；逐处替换。每替换一处先确认原实现的语义，语义有意不同的保留差异并写明原因。
- **2026-11-13 补充**：做完之后和上面三条对一下。
  - **数量**：用新加的检查在动手之前的代码上数，手写判断是 22 个文件 28 处，18 处是 `startsWith("..")` 的宽松写法，2 处只认 `../`，8 处是对的；另有两处检查数不到（`cordis-adapter` 一处在清单里，`agent-host` 的 `static.ts` 用的是根目录做字符串前缀）。上面写的「13 个具名实现、约 30 处内联」是审查时的估计。
  - **位置**：上面没列到的还有 `packages/sandbox/sandbox-nono`、`packages/skill/skill`、`packages/harness-evolution/plugin-manager`、`packages/composition/cordis-adapter`、`packages/client/client`、`apps/cli`。
  - **约定**：函数名写明的是「只比较字面」（`isLexicallyInside`），不是「输入必须已规范化」。没折叠的 `..` 和多余的分隔符由 `relative` 自己折叠，输入不用先规范化；函数不做的是解析符号链接，要防这个得先 realpath。
  - **三处没有换成共享函数**：`cordis-adapter` 引用不了 `shared`，在原地改对，留一份本地副本；`plugin-manager` 改成更严的「真实路径等于自身」；`skill` 的那条判断永远不成立，删掉。
  - **多做了一个检查**：`pnpm check:path-containment`，接进 `pnpm test:scripts`。没有它，下一个人照旧写法再写一份的时候没有东西拦。
  - **两个构建脚本里的宽松写法没有改**，原因见决策记录。
  - 每一处改完之后行为变没变，见 `docs/histories/2026-11/20261113-1545-path-containment.md` 的表。

### PR 6：类型安全（M10）

- **现象**：事件构造函数 `core(type: string, data, extra)` 返回 `as never`，同一个函数有 5 份拷贝，`session.append(core(...))` 有 46 个调用点；服务按字符串 id 取出后强转，约 107 处、68 个不同的 id；waterfall 钩子的 payload 是 `Record<string, unknown>`。事件名或字段写错，编译器不会报。
- **修法**：按事件类型做 typed event builder，5 份拷贝收敛为一份；服务取用接到已有的 `ServiceDefinition` 上；钩子 payload 按事件名映射类型。按事件、服务、钩子分成三组提交，每组独立通过类型检查和测试。
- **2026-11-14 补充**：做完之后和上面两条对一下。
  - **事件**：`core()` 这个构造函数有 7 份拷贝（6 份返回 `as never`），另有 9 处直接手写事件对象，合计 13 个文件 16 处；上面写的「5 份拷贝、46 个调用点」是审查时的估计。现在 `@actspace/core` 名下 42 种事件的 `data` 记在 `CoreEventDataMap` 一张表里，只从 `coreEvent(type, data)` 写：63 个调用点分布在 13 个文件，其中恢复流程的那一个包在 `recoveryEvent` 里，被调用 7 次。别的插件写自己名下的事件不在这一条的范围里。
  - **服务**：按 id 取出后断言类型的有 52 个文件 132 处，另有 7 处直接调 `.getService()`、38 处按字符串 id 注册；上面写的「约 107 处、68 个不同的 id」是估计。现在 57 个 id 有 77 个定义，取用和注册都经过定义，新写法 167 处。剩下 9 个文件 11 处记在检查的清单里，每处写明理由。
  - **钩子**：八个干预点（7 个 waterfall、1 个 serial）的 payload 和结果按名字定类型，契约由分发它的包声明，监听器用 `onHook` 注册。目前没有生产插件注册任何一个干预点，改的是给插件作者的写法，运行时行为不变。
  - **多做了三个检查**，都接进 `pnpm test:scripts`：`pnpm check:core-events`（不许绕过 `coreEvent` 手写 core 的事件）、`pnpm check:service-access`（不许按 id 取出后断言类型，有定义的服务不许按字符串注册）、`pnpm check:harness-events` 新增的一条规则（干预点的监听器不许直接用 `ctx.on()` 注册）。原因和 PR 5 一样：旧写法仍然能编译，没有检查就拦不住下一处。
  - **顺带修了两个原有问题**，都是给接口写类型时发现的，不在审查的 24 项里：`session.storage` 的包装服务漏转发三个方法，真实运行环境里「编辑提问再发送」总是失败（`d3716f26`）；`llm/stream` 的监听器直接给出流时，路由的 lease 不归还（`5cb8589f`）。
  - **第 2 组有三处不是照原样替换**，做完之后逐个文件对照改动前后才看出来，那次提交的说明没有列：五个插件多了 12 处「服务不在就报错」的判断；`plugin-manager` 读 Host 端口的时机从每次执行工具改成了挂载时，已经改回去（`5881f29c`）；压缩插件不再自己拆 `llm.service` 的包装。服务都在的时候这三处的结果和原来相同。更正写在 history 的「对提交说明的更正」。
  - **规范和代码对不上的两处**（`agent/pre-step`、`agent/turn-stopping`）按代码改了规范，没有补能力，见决策记录。
  - **一个新发现没有在这个 PR 里修**：`tsconfig.base.json` 的 `baseUrl` 让声明文件带出以仓库根目录为起点的路径。放到栈顶单独一个 PR（PR 9），见决策记录。
  - 每一组改了什么、怎么验证的，见 `docs/histories/2026-11/20261114-1045-typed-contracts.md`。

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
- 风险：PR 3 把后台命令输出订阅的正则匹配移出主线程，匹配从同步变成异步，通知的先后顺序可能变。缓解：匹配规则不变，行按输出顺序一批一批送去匹配，上一批有了答复才送下一批；测试覆盖「转后台之前就匹配到」和「匹配超时」两种情况。命令结束时还没匹配完的行不再匹配，这一点写在决策记录里。
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
9. PR 9（2026-11-14 新增，可以不合）：去掉 `tsconfig.base.json` 的 `baseUrl`。
10. 收尾：执行摘要、计划移到 `completed/`。

## 验证方式

- 每个 PR 提交前在本地跑：`./scripts/ci.sh`、`npx -y markdownlint-cli2@0.24.0 "**/*.md"`、`pnpm lint`、`pnpm typecheck`、改到的包的 `pnpm --filter <包> test`、`pnpm check:hot-path-reads`、`pnpm check:scale-tests`、`pnpm check:packages`；改到契约矩阵覆盖的源码时 `pnpm run gen:contract-matrix`。
- 2026-11-13 起每个 PR 推送前还跑：`pnpm check:desktop-build-graph`、`pnpm run gen:contract-matrix --check`、`pnpm check:docs`、官网的 `pnpm check:site`、`pnpm test:site`、`pnpm build:site`，以及 `pnpm build`。原因见执行记录「遇到的问题」。
- 每个 PR 推送后看 GitHub 上的 `仓库基础检查` 与 `CI 汇总`，红了就在同一个分支上修。2026-11-13 起，上一个 PR 的 CI 跑完并且通过之后，才给下一个分支建 PR。
- 栈顶分支上跑一遍完整的 `pnpm -r --if-present --filter '!actspace' test` 与 `pnpm test:scripts`。
- 手工检查与未覆盖范围写在 `docs/exec-runs/20261110-codebase-review-fixes/execution-summary.md`。

## 进度记录

- [x] 读协作文档、确认环境、定 PR 结构。
- [x] PR 1：CI 门禁。[#83](https://github.com/WakeUp-Jin/actspace-agent/pull/83)，全部检查通过。
- [x] PR 2：H4。四层都已落地，过程见执行记录步骤 2。[#84](https://github.com/WakeUp-Jin/actspace-agent/pull/84)，全部检查通过。
- [x] PR 3：修复合集。M6、M9、M7、M3、L2、L9 都已落地，过程见执行记录步骤 3。[#85](https://github.com/WakeUp-Jin/actspace-agent/pull/85)。
- [x] 2026-11-13：三个 PR 同步 `main`（`bf566305`）；修 #85 推送后才发现的两处 CI 失败；修 `main` 上三种让「包测试」随机变红的失败（放在 PR 1）。过程见执行记录步骤 4。同步后 #83 全部检查通过。
- [x] PR 4：Agent Loop 请求路径。L5、M2（三个提交）、M1 都已落地，过程见执行记录步骤 5。[#94](https://github.com/WakeUp-Jin/actspace-agent/pull/94)，全部检查通过。
- [x] PR 5：路径安全模块。一份共享实现、逐处替换、一个防止再手写的检查，过程见执行记录步骤 6。[#95](https://github.com/WakeUp-Jin/actspace-agent/pull/95)，全部检查通过。
- [x] PR 6：类型安全。事件、服务、钩子三组，三个防止再写回去的检查，顺带修两个原有问题，过程见执行记录步骤 7。
- [ ] PR 7：命名。
- [ ] PR 8：格式化。
- [ ] PR 9（可以不合）：去掉 `tsconfig.base.json` 的 `baseUrl`。
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
- 2026-11-10：M9 里审查点名的 `jsonl-reader.ts` 每次追加 `[...resume.events, ...next]` 不改。原因：它复制的是指针；`session-projection-cache` 的 `incremental.test.ts` 断言「已经交出去的读取结果不会在持有者手里变化」，不可变快照是契约；同一条路径上真正的开销是投影状态的 JSON 往返，记在 perf-backlog P5。
- 2026-11-10：M9 不动「每次读重建整份会话快照并校验」和「打开后第一次读回放读模型」。原因：前者约 90% 的时间在 `assertJson`，后者在读模型自己的状态结构（每次工具调用对全部工具排序、每次新数组把全部子项走一遍），改它们要动投影状态的版本和检查点，是单独一项工作。量到的数字和可能的方向写进 perf-backlog 的 P5、P6。
- 2026-11-10：`scale-test-coverage.json` 的待补项逐个判断的结果：`session-controller.ts` 补了规模测试；`supplements.ts` 确认已有规模测试守着（把它改成每次从头折叠，`context-input.scale.test.ts` 失败），登记为已覆盖；`subagent/src/manager.ts` 修掉两处整份遍历，创建 fork 时找复制边界的整份读保持待补（复制本身就要读全部）；`task-ledger.ts`、`managed-runs.ts`、`repair.ts`、`recovery.ts` 是低频流程，`journal.ts` 是兼容入口，`runtime-registry.ts` 是历史产物查找与导出，都保持待补。
- 2026-11-10：M7 的完整性校验结果按文件版本记住，但文件 ctime 距现在不到 2 秒时不记。原因：文件系统的时间戳有粒度，同一格里的改写从时间戳上看不出来。代价是文件写完头 2 秒内每个分块仍然整算一遍（流式，内存恒定）。
- 2026-11-10：M7 没有做的部分：上传的定时清理每 60 秒仍然读一遍全部状态文件（后台任务，不在请求路径上）；产物存储抛的普通错误（产物不存在、不属于这个会话）仍然按 Host 故障回 -32603，现在会记日志；给模型看附件、导出这些本来就要整份内容的读法不变。令牌过期与轮换不在这批范围。
- 2026-11-10：整理上一条时核对代码，发现上传目录里有名字不是上传 id 的条目（如 `.DS_Store`）时清理会抛错：Host 启动不了，运行中则转成不接收新任务。这是原有问题，不在审查条目里；改动只有一行判断加一条用例，所以在这个 PR 里顺手修掉（`70f6fa3d`），没有留成技术债。
- 2026-11-10：M3 放行 `198.18.0.0/15`。原因：fake-IP 模式的代理把所有域名都解析到这个网段，拦掉它这些机器上 `web_fetch` 就完全不能用。设置了 `NODE_USE_ENV_PROXY=1` 时请求仍然走 `fetch`、不固定地址：这时连的是代理，目标域名由代理解析，固定不了。
- 2026-11-10：`tool-image-generation` 下载图片时有一份同样的旧地址检查，这批不改，记到技术债。原因：那个网址来自用户自己配置的图片服务商的响应，不是模型给的；改它要把 `tool-web` 的请求实现抽成两个包共用，超出这一条的范围。
- 2026-11-10：L2 打开规则后报了 4 处、来自两个方法名，不是计划写的 1 处。两个都改名，IPC channel 的字符串不变。
- 2026-11-10：L9 剥环境变量时不按值剥代理变量。原因：需要带账号的代理才能上网的机器上，剥掉它命令就连不了网。代价是命令能读到代理密码，写进了 `docs/SECURITY.md`。
- 2026-11-10：L9 输出订阅停掉时发单独的 `subscription_stopped` 通知，不复用「输出匹配」。原因：模型可能正等着匹配，要让它知道不会再有匹配上报；复用的话界面上会显示成一次匹配。匹配变成异步之后，命令结束时还没匹配完的行直接丢掉，结束通知本身带着输出尾部。
- 2026-11-10：和 L9 的 ripgrep 解码同样的写法（按块 `toString`）还有两处没改：桌面端 Browser Bridge 的编译日志、子 Agent 外部 CLI 的 stderr 尾部。原因：两处都只在失败时给出诊断信息（编译日志、外部 CLI 退出时的错误行），最坏结果是其中一个字符显示成乱码；记到技术债。
- 2026-11-13：同步 `main` 用合并提交，从栈底往上逐层合，不 rebase。原因：三个 PR 已经推送，rebase 之后要强制推送，已有的提交全部换掉，PR 上看过的内容和跑过的 CI 都对不上；合并提交只留下冲突处的解决结果，每个 PR 相对它的 base 的改动不变。代价是分支历史里多出几个合并提交。
- 2026-11-13：`main` 上随机失败的用例修在 PR 1，不放到别的 PR，也不单开一个。原因：PR 1 做的事是让 `CI 汇总` 能设成合并必需检查，设上之后随机失败的用例会把无关的 PR 卡住；放在栈底，上面每个 PR 的 CI 也不再受它影响。
- 2026-11-13：三种随机失败里，第三种改后台任务登记表的 `dispose()`，不改用例。原因：前两种只是用例的写法依赖时间。第三种在产品里也会发生：Host 关闭前一刻结束的任务，通知已经进了收件箱、收尾记录还没写完时会话被关掉，下次启动这个任务会被再标一次 `lost`，模型先收到「完成」又收到「丢失」。
- 2026-11-13：这一批里同一天的发布记录只写一条，后来的 PR 把内容并进已有的那一条。原因：`docs/releases/README.md` 规定每个日期只写一次发布，官网的解析器照这条规则报错；PR 2 和 PR 3 在同一天各加了一条，官网的构建因此失败过一次。
- 2026-11-13：PR 4 先做 L5，再做 M2。原因：测试夹具走的是生产不存在的拼装路径，M2 的「不改行为」要靠测试和对拍来确认，夹具先和生产一致，这个确认才算数。
- 2026-11-13：M2 重试经过 `agent/request` 时，消息和工具按钩子的返回值来，路由和模型不采纳、沿用首次请求。原因：`agent-llm-core-pi.md` §13 约定重试继承同一个模型和连接；否则一个钩子或一次设置变化就能让同一个逻辑请求中途换连接。做法是把这一步已经定下的路由和模型交给钩子，重试仍然从首次请求的 registration 派生。目前没有生产插件注册这个钩子，改的是给插件的约定。
- 2026-11-13：M1 的监听器在「流结束」和「工具调用释放」时摘。原因：这两个点之后已经没有东西需要被中止，而且就是归还 lease 的地方，不用另找时机；改动只有几行，正在进行的流和工具体收到中止的方式不变。
- 2026-11-13：M1 的内存数字以这次量的为准，审查报告的 55.8 MB 不再引用。量法：合成回合，每步一条 2 KB 工具结果，最后一次请求派发前强制 GC 后读 `heapUsed`，修之前减修之后。200 步、请求带 1 个工具定义约 7 MB（修之前 signal 上 398 个监听器，修之后 0 个）；400 步约 26 MB；200 步、30 个工具定义约 10.5 MB；工具结果换成 20 KB 不变。原因：55.8 MB 是审查时另一个合成场景的数字，探针没有留下来，这次没有复现；而且留住的量随步数和工具定义的数量变（每个被留住的请求快照带着整份消息列表和全部工具定义的副本），单给一个数字说明不了问题。探针不是测试，没有入库；入库的是「监听器数不随步数增长」的断言。
- 2026-11-13：核对 §13 时发现 `LlmRetryScope` 没有实现（两次尝试之间没有 lease，退避期间 registration 被完整注销的话重试报错）。这个 PR 不实现它，只在 §13 末尾写明实现现状，并记到技术债。原因：生产里路由随 Harness generation 注册和注销，进行中的 Run 持有 generation 的 lease，这种情况走不到；实现它要改 `llm-service` 的 lease 模型和 Agent Loop 的重试循环，超出 M2「去重」的范围。用一个临时用例确认过现象：首次尝试期间开始注销路由，重试时 registration 的状态是 `disposed`，这一步以 `LLM registration … is disposed.` 失败。
- 2026-11-13：PR 4 不写发布记录。原因：五个提交里没有用户能直接感知的变化；重试过钩子改的是给插件的约定，目前没有生产插件用到。
- 2026-11-13：M5 的共享实现不引 `node:path`，路径规则（`relative`、`isAbsolute`、`sep`）由调用方传。原因：`shared` 同时跑在浏览器和 Node 里；界面里的工具卡片也要用这份判断，传 `pathe` 就行。另一个好处是测试可以在 Linux 上把 `path.win32` 的规则跑一遍，云端没有 Windows。
- 2026-11-13：M5 的共享实现只比较字面，不解析符号链接。原因：各处对符号链接的处理本来就不一样（两边都 realpath、只 realpath 根目录、输入已经是真实路径），把 realpath 做进共享函数会改掉其中一些的行为；`tool-runtime` 的 `isPathWithin` 保留自己「根目录存在时先换成真实路径」这一步，只换最后的比较。
- 2026-11-13：`isLexicallyInside` 的 `includeRoot` 必填，没有默认值。原因：「路径就是根目录本身」算不算在里面，各处答案不同。工作区本身可以读、可以当 cwd；删除目标、重定向目标、卸载 Skill 必须严格在里面，否则会删掉或覆盖整个目录。
- 2026-11-13：`sandbox`、`sandbox-nono` 新增对 `@actspace/shared` 的依赖。原因：两个包各有一份写法相同、同样有错的 `contains`，再留一份本地副本没有理由；`shared` 在依赖的最底层，`pnpm check:packages` 通过。
- 2026-11-13：`cordis-adapter` 不引用共享实现，在原地改成同样的三个条件，留一份本地副本。原因：它和 `shared` 同在最底层，互不依赖。副本记在检查脚本的清单里，注释写明改动时对照 `shared` 的用例。
- 2026-11-13：`pnpm check:path-containment` 只认 `startsWith` 这一种写法，可以保留的文件按「文件加处数」记清单，处数多了少了都失败。原因：改之前的 28 处全是这种写法，拦得住照旧写法再抄一份；用正则、`slice` 或根目录字符串前缀比较的认不出来，这一点写在脚本开头，不假装全覆盖。记处数是为了已经在清单里的文件也不能悄悄多写一处。
- 2026-11-13：`scripts/package-agent-cli.mjs`、`scripts/package-browser-components.mjs` 里的两处宽松写法不改，记进检查的清单。原因：构建脚本单独运行，不引用工作区的包，要改只能在原地再各写一份；而这两处只会多拒绝，不会放过越界的路径（后一处按定义如此，前一处用 80 万组随机路径和共享实现比过，没有一组是它放行而共享实现拒绝的），改的收益很小。后一个文件还是「发布」工作流的路径过滤条件，PR 改到它会在四个平台上跑一遍打包。
- 2026-11-13：PR 5 的发布记录并进这一批已有的 2026-11-10 那一条，不新开 2026-11-13 的。原因：同一天有两条发布记录，官网构建会失败（PR 3 上出过一次，见执行记录步骤 4）；`main` 上几乎每天都有一条，新开一条当天的，合并时容易和 `main` 上同一天的那条撞上。这一批作为一个整体合并，记在同一条里也方便看。
- 2026-11-14：M10 第 1 组的事件表放在 `@actspace/shared`，不放在 `session-journal`。原因：写这些事件的包有 13 个文件分在 9 个包里，其中 `desktop-app` 这样的 Host 包只为了拼一条事件才依赖 `session-journal`；`shared` 在最底层，谁都能引。`session-journal` 的 codec 仍然负责运行时校验，并加一行编译期检查：表里有而 codec 没登记的事件名编译不过。
- 2026-11-14：`session.append` 的参数类型不收紧。原因：别的插件（context、task、todo 等）写自己名下的事件也走它，事件名和 `data` 由各自的 codec 管；收紧到 core 的表会把它们挡在外面。代价是手拼一个带 core 来源的对象仍然能编译，所以加 `pnpm check:core-events` 拦这种写法。
- 2026-11-14：M10 第 2 组的定义（KEY）由类型所属的包声明，不集中写进 `cordis-adapter` 的总表。原因：`cordis-adapter` 在依赖的最底层，引用不到各个包的类型。总表里已有的条目用 `bindServiceType` 补上类型，不在总表里的用 `serviceKey`。
- 2026-11-14：下层包取上层包注册的服务用视图（`serviceView`），不为了拿类型去反向依赖。原因：反向依赖会被 `pnpm check:packages` 的依赖环检查拒绝。视图只写取用方用到的成员，不能拿来注册；视图和真实服务对不对得上，由同时依赖两边的 `@actspace/runtime` 在 `service-views.ts` 里逐行核对，检查脚本确认每个视图都有对照行。
- 2026-11-14：会被工具插件引用的定义放在只引类型的模块 `service-keys.ts` 里，三个包标 `"sideEffects": false`。原因：Default Harness 把每个工具插件单独打包，定义和服务的实现类写在同一个模块时，实现类会被打进每个工具插件的产物。这样做之后内核大 4,104 字节，14 个工具插件合计小 10,965 字节。
- 2026-11-14：`session.storage` 包装服务漏转发的问题在 PR 6 里修，不留成技术债，也不挪到 PR 3。原因：它让「编辑提问再发送」在真实运行环境里总是失败，是用户能碰到的问题；改动是三个转发方法加一个 `implements` 约束。它是给 `session.storage` 写定义时发现的，放在发现它的 PR 里，栈里靠前的 PR 不用重跑。
- 2026-11-14：`llm/stream` 的监听器不派发时 lease 不归还的问题同样在 PR 6 里修。原因：改动只有四行，而且第 3 组正要把「监听器可以不调 `next()`」写进类型契约；契约写明可以这么做，照做却会让路由注销超时，两者不能同时成立。归还放在读完流之后，不放在钩子返回之后：监听器可以等流被读取时才调用 `next()`。
- 2026-11-14：`agent/pre-step`、`agent/turn-stopping` 两个干预点，规范写的能力（跳过或改写一步、决定继续还是停止）代码里没有实现。按代码改规范，不补能力。原因：补能力是新功能，要定「跳过一步之后这一轮怎么继续」「监听器要求继续时循环怎么走」，不是类型安全这一条的范围；类型契约照着没实现的能力写，会让插件作者以为返回值有用。要不要补由仓库所有者决定，记在 `docs/exec-plans/tech-debt-tracker.md`。
- 2026-11-14：分发函数（`waterfallDispatch`、`serialDispatch`）的结果类型是 `unknown`，不是契约里的结果类型。原因：监听器来自单独构建的插件，编译期的类型约束不到运行时拿到的值；分发方（Loop、Tool Runtime）本来就逐个字段检查，类型写成 `unknown` 让这些检查不能被省掉。
- 2026-11-14：三个检查都只按文本匹配，认不出哪些写法写在各自脚本的注释里。`check:core-events`、`check:service-access` 的例外按「文件加处数」记清单，处数多了少了都失败；`check:harness-events` 新增的那条没有例外。原因同 PR 5 的 `check:path-containment`。前两个在改之前的代码上跑过，报出的就是这次改掉的那些处；第三个在改之前的代码上报 0 处（产品代码里本来没有插件注册干预点的监听器），由用例往仓库的真实源码里放一处来确认会报。三个脚本都逐处改错再跑过用例，数字见执行记录步骤 7。
- 2026-11-14：第 2 组做完之后，把改动前后「服务不在时怎么办」逐处对了一遍，结果有两个决定。一是 `plugin-manager` 读 Host 端口的时机改回每次执行工具时读（`5881f29c`），并加一条用例。原因：那次提交说的是「只换写法」，读取时机不该跟着变；现在唯一的提供方给的是固定字段，产品里看不出差别；但以后这个端口如果在挂载之后才带上 `evolution`，挂载时读一次的写法会一直报不可用。二是五个插件新加的 12 处 `requireService` 留着，不改回断言。原因：它们只在服务不在时起作用，把之后某一步的 TypeError 换成取用处的一句 `<取用方> requires <id>.`；这五个插件的 `inject` 都列了这些服务，正常挂载时走不到。两处都没写进那次提交的说明，更正记在 history 里。
- 2026-11-14：`pnpm check:core-events` 只查 TypeScript。原因：这条规则守的是编译期的类型，`apps/desktop/scripts` 下 5 个纯 JS 的验证和基准脚本直接往存储里写合成事件，`coreEvent` 的类型检查对它们不起作用。
- 2026-11-14：新发现 N1（`tsconfig.base.json` 的 `"baseUrl": "."`）不在 PR 6 里改，放到栈顶单独一个 PR。现象：声明文件里出现 `import("packages/…/dist/x.js")` 这种以仓库根目录为起点的路径（634 个声明文件里 4 处），apps 解析不到，那个类型悄悄变成 `any`，`skipLibCheck` 下不报错。PR 6 里碰到的一处（`ProfileServices`）已经用逐行写明类型绕开，并加了编译期检查。原因：去掉 `baseUrl` 影响全部包的构建配置，要单独验证构建产物逐字节不变；它不在审查的 24 项里，合不合由用户决定，放在栈顶不合也不影响前面的 PR。
- 2026-11-14：PR 6 的发布记录只有 `session.storage` 那一处修复的两行（已并进 2026-11-10 那一条），其余不写。原因：三组类型改动、三个检查和 lease 的修复都没有用户能直接感知的变化；CLI Agent Host 在 Profile 缺 `agent.runtime` 时改成启动就报错，正常安装里走不到。
- 2026-11-14：`main` 在 PR 5 建好之后多了一个合并（[#91](https://github.com/WakeUp-Jin/actspace-agent/pull/91)，4 个文件，和这个栈没有重叠，试合没有冲突）。这次不为它单独同步，等栈顶的 PR 建完之后统一同步一次。原因：同步一次要从栈底往上逐层合，每个已有 PR 的 CI 都重跑一遍；合并时每个 PR 本来也要点一次「Update branch」。

## 执行模式

- **夜间模式**（变体）：用户离线，Cursor Cloud Agent 在云端 VM 内自主执行，不经 nono。所有改动只通过 PR 进入 `main`，合并由用户决定。

## 执行文档

- `docs/exec-runs/20261110-codebase-review-fixes/execution-process.md`
- `docs/exec-runs/20261110-codebase-review-fixes/execution-summary.md`
