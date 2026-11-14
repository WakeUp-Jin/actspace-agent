## [2026-11-14 13:00] | Task: 标识符去掉 RuntimeV2 后缀，加一个检查防止旧名字回来

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.2`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> （代码库审查后的讨论）……L1 到 L6 都可以修……都可以按照你的建议去做吧。……没有完成的话继续

这是审查修复批次的第 7 个 PR，条目是 L6。计划见 `docs/exec-plans/active/20261110-codebase-review-fixes.md`。

### 🛠 Changes Overview

**Scope:** `apps/desktop`、`apps/cli`、`apps/web`、`packages/` 下 16 个能力目录、`browser-bridge/test-fixtures`、`scripts`、`docs/design-docs`

**Key Actions:**

v1 Runtime 已经退役，仓库里只有一套 Runtime，标识符却还叫 `RuntimeV2JsonValue`、`bootDesktopRuntimeV2`、`RUNTIME_V2_FIXED_RENDERER_CHANNELS`，读的人会以为还有另一套。

| 提交 | 做了什么 |
| --- | --- |
| `55cb267b`、`49ed2be7` | 新增 `scripts/check-transitional-names.mjs`：不带参数是检查，带 `--write` 是改名工具，两者用同一张表。这时还没有接进 `pnpm test:scripts` |
| `e2c9f059` | 改名。完全是 `--write` 的输出，没有手改：292 个文件，113 个名字，2,144 处标识符，另有 3 处注释和 1 处字符串 |
| `c96123a3` | 检查接进 `pnpm test:scripts`；8 份设计文档里的 18 处旧名字同步改掉；`pnpm check:docs` 加一条规则，设计文档里再出现旧名字会报 |
| `cbe36132` | `DesktopLegacyLlmAdapter` 改名为 `DesktopLlmAdapter`，文件 `legacy-llm-adapter.ts` 改名为 `llm-adapter.ts` |
| `54f9e6df` | 删掉没有人读的 `ResolvedRuntimeModel.llmConfig` 和它的类型 `LegacyLlmConfig`，共 11 行 |
| `4a8824f2`、`f5bec47e` | 全量验证拦下的两处：契约矩阵重新生成；改名工具的路径判断改对 |

- **改名规则**：名字里的 `RuntimeV2`、`runtimeV2`、`RUNTIME_V2` 去掉 `V2`，107 个名字、2,104 处是这样改的。另外 6 个名字、40 处按表改整名：
  - `RuntimeV2RuntimeState` → `RuntimeStateView`：只去 `V2` 会变成 `RuntimeRuntimeState`。
  - `loadRuntimeV2` → `loadRuntimeModule`：只去 `V2` 会和 `@actspace/runtime/loader` 导出的 `loadRuntime` 重名。
  - CLI 里 `V2` 不挨着 `Runtime` 的四个：`runV2Command` → `runCommand`、`RunV2Io` → `RunIo`、`bootCliV2` → `bootCli`、`CliV2ApprovalBroker` → `CliApprovalBroker`。
- **没有改的字符串**：`runtime-v2` 目录名、文件名和引入路径（`@actspace/shared/runtime-v2`）、IPC channel（`runtime-v2:*`）、契约 id（`actspace.runtime.v2`）、落盘目录 `sessions-v2`、测试文件名。浏览器验收脚本里填进输入框再读回来的文本 `APPROVED_BY_RUNTIME_V2` 记在检查的清单里。
- **没有改的两类名字**，见下面「设计意图」：设置的格式版本（`SettingsV4` 这一类，31 个名字、391 处）；`LegacyProxyWireEngine`。
- **历史文档不动**：`docs/histories/`、已完成的计划和执行记录里的旧名字保持原样，检查不查它们。

### 🧠 Design Intent (Why)

**改名用工具做，工具就是检查脚本。** 292 个文件的改动没法逐行评审，能评审的是那张表和工具本身。检查和改名共用一张表还有一个用处：这次改名之后，别的分支合并进来时带着的旧名字会被检查报出来，在那个分支上跑一遍 `node scripts/check-transitional-names.mjs --write` 就对齐了，不用手工解冲突。

**只改标识符，不改路径和对外可见的字符串。** channel 名、契约 id、落盘目录是和已有数据、已安装的旧版本之间的约定，计划里已经写明不改。`runtime-v2` 目录和引入路径是另一件事：要动 `exports`、构建图检查和几百处 import，每个在飞的分支都会冲突。审查条目说的是标识符。

**`SettingsV4` 这一类不改。** 审查时把它和 `RuntimeV2` 归成一类，做的时候核对：设置的落盘格式从 `AppSettingsV1`、`AppSettingsV2`、`PersistedSettingsV3` 一路迁到 `SettingsV4`，迁移代码还在；bridge 上 `get`/`update` 和 `getV4`/`updateV4` 两套 API 并存，另一份进行中的计划（`20261007-desktop-settings-write-consistency.md`）把删掉旧接口列在范围之外，因为还有三处在用。这里的 V4 是格式版本号，不是「第二套实现」的后缀。Session 事件的 `SessionEventEnvelopeV1` 这一类同理。

**`LegacyProxyWireEngine` 不改。** 审查条目把它和 `DesktopLegacyLlmAdapter` 一起列为「名字带 Legacy、其实是生产路径」。后一个是对的。前一个是看错了：`docs/design-docs/agent-plugin-runtime/agent-llm-core-pi.md` 第 7 节「Legacy transport 边界」和第 14 节「Backend 采用矩阵」把这条路径定义为 legacy transport，指的是采用 pi-ai 之前的那条 wire，只在列明的路线上保留（官方 OpenRouter 要读原始的账单金额，DeepSeek 带图片时要走文件上传），每条路线都写着迁到 pi-ai 需要什么证据。名字里的 legacy 说的是 wire 的新旧，和设计文档的术语一致。只改类名会让代码和设计文档对不上，要改就得连术语一起改，这不是机械改名，由仓库所有者决定。理由写进了检查脚本开头，并有一条用例保证它不会被当成旧名字。

**`DesktopLegacyLlmAdapter` 改名。** `apps/desktop` 下实现 `LlmAdapter` 的类只有它一个。类上的注释原来写的是「文件名等 P15 删掉 v1 源码之后再改」，P15 已经完成。新文件名和 `agent-host` 里 `NodeLlmAdapter` 所在的 `node-ports/llm-adapter.ts` 对应。`adapterVersion`（`actspace.desktop-pi-ai.v3`）没有变。

**其余带 `Legacy` 的名字不改。** 改完之后还有 48 个名字、327 处。5 个名字、45 处属于上面说的 legacy wire。剩下 43 个名字、282 处说的是旧数据、旧格式和迁移：迁移函数、旧设置字段的类型、把旧的 props 形状接到新组件上的测试辅助函数、局部变量。名字和它们做的事一致。

**检查按文本匹配整个标识符，不区分代码、注释和字符串。** 原因和 PR 5、PR 6 的几个检查相同：旧名字改掉之后仍然是合法的标识符，照旧代码再写一处或者合并一个落后的分支，编译器不会报。确实要保留的按「文件、名字、处数」记清单并写理由，处数多了少了都失败；现在只有一条。检查脚本、它的用例和文档检查的用例要把旧名字写出来，这三个文件不扫。

**文档只查讲现状的。** `pnpm check:docs` 对当前事实文档和 `docs/design-docs` 下的文档报旧名字，带「旧」「历史」等字样的那一行除外。

**检查脚本里的路径判断留一份本地副本。** `--write` 后面跟路径时要判断路径在不在仓库里。脚本不引用工作区的包（没构建也要能跑），所以判断写在脚本里，三个条件和 `packages/util/shared/src/path-containment.ts` 相同，并记进 `pnpm check:path-containment` 的清单，和 `cordis-adapter` 那一份同理。

**Host 契约摘要会变，但不是这个 PR 新带来的。** 定制过的 Harness 能不能继续用，Host 靠一份摘要判断，摘要里和内容有关的是 7 个 Host 模块各自入口文件的哈希。`@actspace/shared/runtime-v2` 的入口文件按名字转出三个函数，名字改了，入口文件的内容跟着变。效果和以往任何一次改动 Host 模块入口相同：没有改过的内置选择启动时自动换到新版本；定制过的 Harness 会被拒绝，提示重新准备。这条分支栈在这次改名之前（PR 5、PR 6）已经改过 7 个入口文件里的 5 个，所以合并前面的 PR 时摘要就已经变了。摘要只算入口文件这一点记在 `docs/exec-plans/tech-debt-tracker.md`。

### ✅ Verification

改名提交说的是「行为不变」。这一节写这句话是怎么核对的。

**改名前后逐 token 对照。** 另写一个脚本，用 TypeScript 的解析器，不依赖改名工具：292 个文件改名前后 token 的数量和种类逐个相同，不同的只有 2,144 处标识符、1 处字符串和 3 处注释。每个旧名字只对应一个新名字。有两个旧名字并到了同一个新名字：`loadRuntimeV2`（CLI 里一个，浏览器验收脚本里另有一个自己定义的同名函数）和 `loadRuntimeV2Module`（桌面端）都成了 `loadRuntimeModule`，没有文件同时出现两个旧名字。新名字在改名之前都没有被占用，只有 `runCommand` 例外：桌面端主进程有两个文件各自有一个不导出的同名函数，和 CLI 的这个函数不在同一个应用里。

**旧名字出现的语法位置。** 生产代码里没有一处是对象字面量的键、简写属性或属性访问（这样的名字会跟着对象被序列化，改名就改了数据）。属性名位置的 21 处都在测试、夹具和 mock 里，是模块导出名的对应写法，一起改掉了。

**构建产物对照。** 改名前后各从零构建一次（依赖包、CLI、完整的应用构建），2,727 个产物文件的名字完全相同：

| 数量 | 对照结果 |
| --- | --- |
| 2,400 | 逐字节相同，渲染进程和 Web 的打包产物都在内 |
| 150 | 124 个 `.d.ts`、26 个 `.js`：把改名前的产物按同一张表改名后，逐字节相同 |
| 119 | source map，只有行列位置不同 |
| 57 | 增量构建缓存，去掉文件哈希后相同 |
| 1 | Web 的 `sw.js`，缓存名带构建时间，每次构建都不同 |

改名后的产物里没有旧名字。运行时能看到的差别只有那 26 个 `.js` 里的函数名、类名、常量名和模块导出名。

**检查脚本数得对不对。** 在改名之前的代码上，检查报 2,148 处、292 个文件、113 个名字，和上面用解析器另外数的一致（2,144 + 3 + 1）。现在通过，扫了 2,313 个文件：四个根目录下受版本管理的源码文件是 2,316 个，减去不扫的那 3 个。被跳过的目录（依赖、构建产物、名字以点开头的目录）里没有受版本管理的源码，扫到的文件里也没有不受版本管理的。

**检查拦不拦得住。** 把一份设计文档换回改名前的内容，`pnpm check:docs` 在那一行失败。把检查脚本逐处改坏再跑用例：36 处，每一处都有用例失败；文档检查新加的那条规则另做 7 处，同样每一处都有用例失败。做法在这个 PR 里改过一次，见下面「过程里出的两个问题」。

**`DesktopLlmAdapter` 和删掉的字段。** 全仓库搜 `llmConfig`、`LegacyLlmConfig`、`toLegacyLlmConfig`，除历史文档外只有被删的 4 处；读模型解析结果的三处走的是 `DesktopRuntimeModelPort`，那个类型里本来就没有这个字段。桌面端相关的 5 个测试文件 30 条通过。

**全量验证。** 用步骤 4 的同一个脚本，这次多跑一步 `pnpm test:agent-cli:process`（它不在那 13 步里，也不在 `pnpm test:scripts` 里，但它的夹具被改名改到了）。在 `f5bec47e` 上 14 步全部通过；73 个包和应用的测试都通过，其中用 vitest 的 70 个合计 5,407 个用例通过、28 个跳过，和 PR 6 最后一次的数字相同（这个 PR 没有增减包里的用例）。CLI 进程级测试 19 条通过。

**没有验证的。**

- `browser-bridge` 的 7 个验收脚本（`.cjs`）被改名改到了。它们要连真实的浏览器，没有运行；做了语法检查，确认客户端模块能加载、导出的两个名字和 6 个引用方一致。
- 没有在真实的桌面窗口里跑过。
- 定制过的 Harness 在摘要变化之后被拒绝并提示重新准备，这条路径没有实际走一遍，依据是读 `harness-control` 的代码。

### 过程里出的两个问题

**改坏的工具改掉了系统临时目录里的文件。** 写完检查脚本后做变异测试，其中一处是把「路径不在仓库里就拒绝」那一行删掉。当时的用例为了验证拒绝，把 `..` 和临时目录的上一级直接传给 `--write`。拦截被删掉之后，改名顺着这个路径走遍了整个系统临时目录，改了 2,143 个文件，然后用例才失败。被改的都是这轮任务自己留下的临时副本和脚本；仓库没有被动到，用作对照的构建产物快照也没有（核对过修改时间和内容）。`49ed2be7` 把用例改成：「仓库」建在临时目录的子目录里，越界的路径都落在这个临时目录里面，最后确认那几个文件一个字都没变。变异时另把 `TMPDIR` 指到专用目录。

**变异测试没有先跑对照。** 变异是在一份只有脚本和用例的副本上做的。`c96123a3` 加了一条「仓库里没有旧名字」的用例，它在这种副本里本来就失败（副本里没有仓库），于是从那以后每一处变异都「有用例失败」，不管别的用例拦没拦住。发现的经过：修路径判断时加了一处在 Linux 上等价的变异（去掉绝对路径的判断），它也被报成「有用例失败」，失败的正是那一条。之后改了做法：副本是整棵受版本管理的源码树；先跑对照，副本不改时全部用例必须通过，否则不往下做；每处变异跑完核对副本里别的文件有没有被动。按新做法，那处等价的变异确实没有用例失败，所以把判断抽成能传入路径规则的函数，在 Linux 上把 `path.win32` 的规则也跑一遍，现在它有用例守着。之前几次提交里的数字也按新做法重跑了，见下面的更正。

这两条补进了 `docs/learnings/2026-07/testing-assertion-poisoned-by-command-echo.md` 第 3 节。

### 对提交说明的更正

仓库约定不改写已有提交，更正写在这里。

- `c96123a3`、`cbe36132` 写「检查脚本的 27 / 29 处变异每一处都有用例失败」。这两次没有对照，原因见上一节，当时的结果不能当证据。在这两个提交的代码上按新做法重跑：27 处、29 处每一处都有用例失败。`55cb267b`、`49ed2be7` 说的 26 处是在加那条用例之前做的，副本里的对照是通过的；同样重跑过，结果相同。
- `55cb267b` 写「扫描到的文件是 2,314 个，和 git 里这四个目录下受版本管理的源码文件数量相同」。受版本管理的是 2,316 个，扫描的 2,314 个是减去检查脚本和它的用例之后的数。
- `55cb267b` 新加的检查脚本里，「路径在不在仓库里」用的是 `startsWith("..")`，正是 PR 5 清掉的那种宽松写法：名字以两个点开头的路径会被当成仓库外而拒绝，只会多拒绝，不会放过越界的路径。`pnpm check:path-containment` 能报出来，但那次提交之后只单独跑了这个脚本自己的用例，没有跑整条 `pnpm test:scripts`，到建 PR 之前的全量验证才发现（`f5bec47e` 修）。
- `cbe36132` 写「`desktop-host-adapter.ts`（1 处引入、3 处构造）和 3 个测试文件（共 15 处类名、4 处引入路径）」。括号里的两个数是五个文件的合计，不是三个测试文件的：类名 15 处是 1 处声明、`desktop-host-adapter.ts` 4 处、测试 10 处；引入路径 4 处是 `desktop-host-adapter.ts` 1 处、测试 3 处。
- `e2c9f059` 写两个并到同一个新名字的旧名字「一个在 CLI，一个在桌面端」。`loadRuntimeV2` 除了 CLI 的 3 个文件，浏览器验收脚本的 2 个文件里还有一个自己定义的同名函数。「没有文件同时出现两者」这个结论不变。

### 📁 Files Modified

- `scripts/check-transitional-names.mjs`（新增）、`scripts/test/transitional-names-check.test.mjs`（新增）
- `scripts/check-current-docs.mjs`、`scripts/test/current-docs.test.mjs`、`scripts/check-path-containment.mjs`、`package.json`
- 改名提交的 292 个文件：`apps/desktop` 97 个、`apps/cli` 14 个、`apps/web` 5 个、`packages/` 167 个（`core` 47、`util` 21、`context` 21、`client` 18、`session` 15，其余 11 个目录 45 个）、`browser-bridge/test-fixtures` 7 个、`scripts` 2 个（`check-ipc-channels.mjs`、`test/fixtures/cli-with-retry.mjs`）
- `apps/desktop/src/main/runtime-v2/llm-adapter.ts`（由 `legacy-llm-adapter.ts` 改名）、`apps/desktop/src/main/runtime-v2/desktop-host-adapter.ts`、`apps/desktop/src/main/model-runtime-service.ts` 和 3 个测试文件
- `docs/design-docs/` 下 8 份设计文档、`docs/design-docs/agent-plugin-runtime/README.md`、生成的契约矩阵
- `docs/learnings/2026-07/testing-assertion-poisoned-by-command-echo.md`、`docs/exec-plans/tech-debt-tracker.md`
- `docs/exec-plans/active/20261110-codebase-review-fixes.md`、`docs/exec-runs/20261110-codebase-review-fixes/`
