## [2026-11-14 16:10] | Task: 全仓库按 Biome 配置格式化，格式检查进 CI，加 .git-blame-ignore-revs

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.2`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> （代码库审查后的讨论）……L1 到 L6 都可以修……都可以按照你的建议去做吧。……没有完成的话继续

这是审查修复批次的第 8 个 PR，条目是 L1。计划见 `docs/exec-plans/active/20261110-codebase-review-fixes.md`。

### 🛠 Changes Overview

**Scope:** `apps/`、`packages/`、`scripts/`、`browser-bridge/` 下的 JS、TS 源码（1,953 个文件）；`biome.jsonc`、`package.json`、`.github/workflows/`、`.git-blame-ignore-revs`、`docs/coding-standards`

**Key Actions:**

`biome.jsonc` 里一直配着格式化（双引号、分号、2 空格缩进、行宽 120），但不强制：`pnpm format` 只处理相对 `main` 改过的文件，CI 不查。动手之前，范围内的 2,305 个文件里有 1,953 个不符合。

| 提交 | 做了什么 |
| --- | --- |
| `4e97e323`、`987d6634`、`fe3762c7` | 三个读源码的检查脚本（IPC 契约、高频路径读写、路径包含）改成按记号或整份源码匹配，不再假设一条语句写在一行里 |
| `7f1d145f`、`8b8d495f` | 一个读源码文本的测试（`markdown-editor-shell`）同样处理 |
| `71be90f0` | 划定范围：两个由脚本生成、检查时逐字节比较的文件不格式化，Markdown 不格式化 |
| `1d68d3e8` | 三处 `@ts-expect-error` 挪到出错的那一行上面 |
| `d26331ad` | 格式化。完全是工具的输出，没有手改：1,953 个文件，+142,815 / −39,439 行 |
| `b53e09e7` | 重新生成按源码字节记摘要的两个文件：契约矩阵、Browser Bridge 定位运行时 |
| `94ba5c4b` | `pnpm format` 改成全库写两遍再检查一遍；新增 `pnpm format:check`，接进 CI 的 `lint-typecheck`；规范文档重写「格式化」一节 |
| `b1ae1d27` | `.git-blame-ignore-revs` 记下格式化和 PR 7 的改名两个提交；新增检查这个文件的脚本，接进仓库基础检查 |

- **怎么复现格式化提交**：检出它的上一个提交 `1d68d3e8`，连跑两遍 `pnpm exec biome format --write .`（Biome 2.6.6）。在临时克隆里做过，得到的目录树和提交里的完全相同。
- **要跑两遍**：第一遍改 1,953 个文件，第二遍还会再改其中 10 个，第三遍起不再变化。这 10 个文件是两类写法：返回类型是多行对象类型的函数签名，和以多行参数结尾的成员调用链。
- **范围**：和 lint 相同的四个目录下的 JS、TS（含 JSX）和 YAML。CSS、JSON、Markdown 不格式化。
- **前七个提交都排在格式化之前**，各自在没格式化的代码上通过。格式化之后要手工处理的只有重新生成那两个文件。
- **没有发布记录**：没有用户能感知的变化。

### 🧠 Design Intent (Why)

**格式化单独一个提交，里面没有手改的行。** 1,953 个文件没法逐行评审。能评审的是配置、复现的命令和「代码含义不变」的证据。所以格式化需要的手工改动都放在它前面，每个都小到能读完；格式化提交本身可以用一条命令重新生成，分支过期时重做一遍比解冲突便宜。

**先改读源码的检查和测试，再格式化。** 格式化不改代码的含义，风险在那些认「行」和「字节」的东西上：按行读源码的检查脚本和测试、只管下一行的注释指令、按源码字节记摘要的生成文件。前三个提交改的三个检查脚本原来都是一行一行地认。在格式化后的代码上，结果会变的只有 IPC 契约检查：9 个折成三行的成员被它跳过，契约从 149 个成员读成 140 个，检查失败，报的是 9 处「常量不在契约里」，不是「有 9 行没读懂」。另外两个（高频路径读写、路径包含）在现在的代码上结果不变，改它们是因为折行的调用它们认不出来，而且认不出来时不报错：高频路径检查数到的调用变少，只给一句「可以收紧基线」；路径包含检查对不在清单里的文件直接漏掉。格式变成强制之后，这不是一次性的问题：以后任何一次普通的修改把一条语句推过 120 个字符，它就会被折行。

**Markdown 不格式化。** 四个目录下有 110 个 Markdown，其中有随包发给模型的技能说明和测试用的样本。Biome 会把表格按列宽补空格对齐，还会在 frontmatter 第一行后面插空行。Markdown 已经由 markdownlint 管。

**两个生成的文件排除。** `packages/browser/tool-browser/src/generated-actions.ts` 和 `packages/core/runtime/cordis.yml` 由脚本生成，检查时和重新生成的结果逐字节比较，格式化之后检查就失败。

**`pnpm format` 改成全库、写两遍再检查。** 原来的 `biome format --write --changed` 靠本地的 `main` 分支算改动范围，克隆里没有本地 `main` 时它不处理任何文件并以 1 退出。全库一遍约 0.6 秒，没有必要只跑改动的部分。写两遍是因为上面说的那两类写法；写完再检查一遍，是为了以后出现三遍才稳定的写法时命令会失败，而不是留下 CI 才报的文件。

**格式检查放在 `lint-typecheck`，不放在仓库基础检查。** 它要装好依赖才能跑，和 lint 用同一个工具；纯文档的 PR 不跑它。

**`.git-blame-ignore-revs` 配一个机械检查。** 这个文件有两种坏法都没有提示（git 2.43 上试过）：写了缩写的哈希，配置过它的克隆里 `git blame` 直接报错；写了历史里没有的完整哈希，git 不报错，只是不再跳过那个提交。后一种在带这类提交的 PR 被 squash 或 rebase 合并时就会出现。检查要看完整的提交历史，所以仓库基础检查的检出从浅克隆改成「全部提交，树和文件只取检出要用的」。代价是多取 858 个提交对象、约 0.6 MB，取和检出一共约 3.1 秒对 2.4 秒（对着 GitHub 各测了一次）。

**这个检查会让一种合并方式变红，这是有意的。** 带这两个提交的 PR 如果被 squash 或 rebase 合并，`main` 和之后每个 PR 的「仓库基础检查」都会失败，直到把那一行改成新哈希或者删掉。不检查的话，这种失效不会有任何人发现。

**PR 7 的改名提交也记进去。** `e2c9f059` 同样完全是工具的输出（292 个文件）。记之前在临时克隆里从它的上一个提交重新生成过，目录树相同。

**Host 契约摘要和默认 Harness 的哈希会变，不为了保持它们不变而特殊处理。** 7 个 Host 模块的入口文件里只有 `@actspace/session-journal` 的那个被格式化改到（转出列表折行后多了一个尾逗号）。效果和以往任何一次改动 Host 模块入口相同，这条分支栈前面的 PR 已经让摘要变过。默认 Harness 的打包文件不压缩，保留一部分源码排版，所以 13 个 chunk 的内容和按内容取的文件名跟着变。

**「单个文件超过 500 行就要拆」的阈值不动，这个 PR 也不拆文件。** 行宽 120 把长行折开之后，renderer 的 782 个源文件从 96,791 行变成 125,576 行（多 30%），超过 500 行的从 13 个（非测试 7 个）变成 30 个（非测试 20 个）。代码没有变多。阈值要不要按新的排版重新定，还是把新超标的文件排进拆分，是仓库所有者的决定；新超标的 13 个非测试文件记在 `docs/exec-plans/tech-debt-tracker.md`。`App.tsx` 从 1,670 行变成 2,358 行，拆分计划里的「目标 300 行以内」是按格式化前的排版定的，在那份计划的状态里加了一句说明，没有改目标。

**两份带行号引用的文档不改。** `docs/exec-plans/active/20261007-desktop-settings-write-consistency.md` 标着「2026-10-07 核实」，`docs/design-docs/agent-plugin-runtime/agent-spec-surface-derived.md` 里的行号在格式化之前就已经对不上。两份都是按当时的代码写的，改成现在的行号反而和它们的日期对不上。

**别的分支怎么对齐。** 格式化提交之前拉出去的分支直接合并 `main`，自己改过又被重排的地方会冲突。对齐步骤写在 `docs/coding-standards/lint-conventions.md`：先合并格式化前的最后一个提交，把自己这边也格式化，再用 `-s ours` 合并格式化提交，最后合并其余的。

### ✅ Verification

格式化提交说的是「代码含义不变」。这一节写这句话是怎么核对的。

**语法树对照。** 另写一个脚本，用 TypeScript 的解析器，不依赖 Biome：1,953 个文件逐个比较格式化前后的语法树、记号序列和注释，共 1,698,827 个记号、7,462 条注释，不等价的文件 0 个。空白以外的改动都属于下面几类，每一类逐处计数：

| 类别 | 数量 |
| --- | --- |
| 括号 | 加 1,597 处、去 118 处，都不改变结合方式；另有 2 处 `??` 的链从 `a ?? (b ?? c)` 变成 `(a ?? b) ?? c`，结果相同 |
| 对象属性名去掉不必要的引号 | 162 处 |
| 联合、交叉类型开头的 `\|` 或 `&` | 133 → 199 个 |
| 写法变了、值相同的字面量 | 字符串 4,450 个（引号和转义）、属性名 202 个、数字 2 个、正则 2 个 |
| 逗号、分号 | 逗号 148,784 → 163,747（尾逗号），分号 125,215 → 125,907 |
| JSX 里的空格 | 19 处，见下一条 |
| 注释 | 7,462 条一条没少，每条注释后面跟的记号都没变 |

**JSX 的 19 处。** 分布在 16 个文件，都是固定的标签、提示和说明文字，显示的文字逐字相同。11 处是把紧挨着表达式或标签的空格从一段文字的头尾拆出来写成 `{" "}`，共 14 个位置；React 在这些位置生成两个相邻的文本节点，原来是一个。另外 8 处文本节点的个数不变。构建出来的打包文件里看得到其中 12 个位置（桌面端 11 个，Web 1 个），另外 2 个在只在开发模式加载的演示面板里。

**只管下一行的注释指令。** 53 条（`@ts-expect-error` 37、`biome-ignore` 10、`perf-allow` 4、`v8 ignore` 2）。49 条管住的那一行上的记号一个没少。另外 4 条有记号折到了后面的行：2 条 `@ts-expect-error` 的报错位置仍在第一行，由 `hook-dispatch.spec.ts` 逐条核对；1 条 `biome-ignore`，lint 结果不变；1 条 `v8 ignore`，仓库没有装覆盖率工具，没有实测。

**lint。** 格式化前后 error 都是 0，warning 都是 70；info 162 → 160，少的两条是 `useTemplate`：两处字符串拼接折行后这条规则不再提示。

**构建产物对照。** 格式化前后各从零构建一次（依赖包、CLI、完整的应用构建、官网、CLI 托管包），两边各 21,813 个文件。

| 文件 | 对照结果 |
| --- | --- |
| `.js` | 5,839 个逐字节相同；973 个去掉空白后逐字节相同（`tsc` 的输出保留源码排版）；另外 39 个是默认 Harness 的 19 个入口文件（两份）和带构建时间的 `sw.js` |
| `.d.ts` | 6,156 个逐字节相同；8 个记号和注释相同；26 个语法树等价（尾逗号、括号、引号） |
| source map | 5,385 个相同，1,057 个只有行列位置不同 |
| 文件名带内容哈希的 | 108 个换了名字。把哈希和文件之间的引用对齐、去掉空白之后：桌面端渲染进程 265 个里 262 个相同，3 个只差上面说的 11 个位置；Web 13 个里 11 个相同，1 个差那 1 个位置，1 个是 `sw.js`；默认 Harness 50 个里 49 个相同，1 个是文件清单，条目相同、顺序随文件名变 |

**读源码的检查脚本。** 19 个检查和统计脚本在格式化前后两棵树上各跑一遍，给正则匹配挂一个计数的探针，比较退出码、输出和每条正则的命中次数。退出码全部相同。输出只有两处不同，都在预期里：契约矩阵的那一行摘要，`pnpm repo:stats` 数的源码行数（183,851 → 244,821）。命中次数 14 个脚本完全相同（其中 1 个不用正则），另外 5 个逐个看过：

- `check:core-events`、`check:path-containment`、`check:service-access` 共用一条「整行是注释就跳过」的正则，命中分别多 72、73、360 次。在 lint 范围内的 2,305 个 JS、TS 文件上数，被它认作注释的行多了 98 行（11,334 → 11,432），全部来自只装着一条注释的代码块：`catch { /* … */ }` 73 处，循环体和箭头函数体 25 处，格式化把注释挪到了单独一行。用 TypeScript 的扫描器核对，被这条正则当成注释、行上其实有代码的，格式化前后是同样的 4 行，没有新增。
- `check:service-access` 认全大写字符串常量的正则要求语句以分号结尾。两个图标文件里 6 个原来没写分号的常量被补上分号后认了出来（771 → 777 项）。它们是 SVG 路径和变换字符串，不是服务 id，检查结果不变。
- `check:ipc-channels` 多读到 95 个空白字符，认出来的契约成员两边都是 149 个。
- `pnpm repo:stats` 数行的正则，就是上面的行数。

这是在前三个提交之后比的。改之前的三个脚本在格式化后的代码上各是什么结果，写在那三个提交的说明里。

有两个检查在临时克隆里跑不起来，没有这样比：插件目录检查和插件加载清单的 `--check`，它们要先构建。这两个读的是构建出来的模块、`package.json` 和 YAML，不读 JS、TS 的源码文本；两者都在 `pnpm check:packages` 里，格式化前后的全量验证都通过。

**读源码的测试。** 找法是三种：测试里读文件的调用带源码扩展名的、用 `?raw` 引入源码的、遍历目录的，逐个看过。全部测试在格式化后的代码上通过，所以肯定的断言没有问题；要看的是否定的断言（「源码里没有某种写法」），它们在认不出来的时候同样通过。

- `markdown-editor-shell.test.tsx`：按行找 import、用单行的正则找懒加载入口。改掉了（`7f1d145f`、`8b8d495f`）。
- 另外两个直接读源码的测试，一个是肯定的断言，一个否定的断言找的是字符串字面量里的一段，折行拆不开。
- `default-harness.test.ts` 里有一条读的是打包出来的插件文件，用正则确认里面没有服务的实现类。打包器自己排版，类的头部总在一行上：在格式化后构建出来的产物里，这条正则在内核的 4 个文件里各命中 1 处，插件文件里 0 处，整个目录没有折行的写法。
- `scripts/test-browser-extension-contract.mjs` 在扩展源码里找片段。否定的断言有两条，找的是一个标识符和一个 `名字(`，同样拆不开；两棵树上输出相同。

**剩下的长行。** 这 1,953 个文件里超过 120 个字符的行，格式化之前是 17,788 行（超过 200 的 3,484 行，超过 300 的 909 行），之后是 1,376 行（326 行、127 行）。剩下的 1,376 行用 TypeScript 的解析器逐行归类：每一行去掉行上那一个拆不开的单元之后都不超过 120 个字符。字符串 753 行、模板字符串 409 行、注释 192 行、正则 22 行。最长的一行是一个 SVG 字符串，4,550 个字符。计划里写的「最长一行 1,129 个字符」是审查时的估计。

**格式检查拦不拦得住。** 把一个文件换回格式化之前的内容：`pnpm format:check` 以 1 退出并打印差异；只写一遍之后 `biome format` 仍然失败；`pnpm format` 两遍各改 1 个文件，最后的检查通过，文件和提交里的内容逐字节相同。

**`git blame`。** 配置 `blame.ignoreRevsFile` 之后，指向这两个提交的行数：

| 文件 | 格式化提交 | 改名提交 |
| --- | --- | --- |
| `apps/desktop/src/renderer/App.tsx`（2,358 行） | 1,479 → 57 | 0 → 0 |
| `packages/core/agent-service/src/application.ts`（886 行） | 489 → 8 | 26 → 0 |
| `packages/util/shared/src/runtime-v2/projection.ts`（472 行） | 58 → 0 | 102 → 0 |

剩下的是 git 对不回上一个提交的行。

**`.git-blame-ignore-revs` 的检查。** 18 个用例，祖先检查用临时仓库覆盖普通历史、merge commit 带进来的提交、squash 合并之后、仓库里没有的哈希、不是提交的哈希、浅克隆、`tree:0` 的部分克隆。变异检查先跑对照（不改，18 个全过），再逐个改坏脚本的 16 处，每一处都至少有 1 个用例失败。另外按 CI 的方式从 GitHub 取一份（全部提交加 `tree:0`）并检出这个分支：带 `--require-history` 通过，检查前后对象数不变，也就是没有再去远端取。同一个提交的浅克隆里，默认通过并说明没有核对历史，带 `--require-history` 失败。

**别的分支对齐。** 对齐步骤在当时开着的 5 个别人的 PR 分支上各试了一遍（临时克隆，不推送）：

| 分支 | 直接合并栈顶的冲突文件 | 其中内容冲突 | 合并格式化提交这一步 | 最后合并其余提交 |
| --- | --- | --- | --- | --- |
| [#92](https://github.com/WakeUp-Jin/actspace-agent/pull/92) | 5 | 3 | 0 | 0 |
| [#93](https://github.com/WakeUp-Jin/actspace-agent/pull/93) | 1 | 0 | 0 | 0 |
| [#96](https://github.com/WakeUp-Jin/actspace-agent/pull/96) | 1 | 0 | 0 | 0 |
| [#97](https://github.com/WakeUp-Jin/actspace-agent/pull/97) | 2 | 1 | 0 | 0 |
| [#98](https://github.com/WakeUp-Jin/actspace-agent/pull/98) | 11 | 4 | 0 | 1 |

「内容冲突」是合并格式化前那个提交时出现的，不格式化也会有。合并格式化提交这一步用 `-X ours` 和 `-s ours` 各试过，结果都和「自己格式化之后」的目录树完全相同。最后一步剩的那 1 个是生成出来的契约矩阵，重新生成即可。

**发布打包。** `scripts/release-package.sh` 在格式化后的代码上跑了一遍（Linux），通过。发布工作流在改到打包脚本的 PR 上会在四个平台各打一次包；格式化改到了它盯着的 6 个脚本，所以这个 PR 的 CI 会跑这一项。

**全量验证。** 在 `b1ae1d27` 上 18 步全部通过：PR 7 用的 14 步，加 `pnpm format:check`、带 `--require-history` 的 `.git-blame-ignore-revs` 检查、`pnpm check:browser`、CLI 托管包的打包和冒烟。73 个包和应用的测试都通过，其中用 vitest 的 70 个合计 5,407 个用例通过、28 个跳过，和 PR 7 相同。Browser Bridge 的 Go 测试、Windows 和 macOS 的交叉编译在 `b53e09e7` 上跑过，通过。

**没有验证的。**

- GitHub 的 blame 页面会不会读 `.git-blame-ignore-revs`。这是 GitHub 文档里写的行为，合并之前没有办法验证。
- 没有在真实的桌面窗口里看过 JSX 那 12 个位置。依据是打包文件对照和渲染进程的测试。
- CI 里新加的两步（`lint-typecheck` 的格式检查、仓库基础检查里带 `--require-history` 的那一步）和新的检出方式，写这份记录时还没有在 GitHub 上跑过，只在本地按同样的方式模拟过。
- macOS 和 Windows 上的发布打包。本地只跑了 Linux，其余等这个 PR 的 CI。
- `v8 ignore` 那一条指令折行之后还管不管得到，没有覆盖率工具可以测。
- 定制过的 Harness 在摘要变化之后被拒绝并提示重新准备，这条路径没有实际走一遍，依据是读 `harness-control` 的代码。

### 过程里出的问题

**试格式化之后的全量验证拦下两处。** 划定范围之后先在工作区里试格式化一遍（不提交）、跑全量验证。测试失败一处：懒加载入口的那条正则要求 `lazy(() => import(...))` 写在一行上（`8b8d495f`）。类型检查失败 6 条：三处 `@ts-expect-error` 写在一整条语句上面，折行之后出错的字段落到后面的行上，指令管不到了（`1d68d3e8`）。两处都改成排在格式化之前的提交。

**自己写的注释指令核对，第一版查得不够。** 语法树对照脚本的第一版只确认每条注释后面跟的还是同一个记号、中间隔的行数没变，报的是「没有变化」。上面那 6 条类型错误说明这不够：指令后面的记号没动，出错的记号却折到了后面的行。之后改成逐条指令比较它管住的那一行上有哪些记号，查出 7 处：3 处就是上面改掉的，另外 4 处写在 Verification 里。

**第一遍格式化之后 `biome format` 仍然报 10 个文件。** 在临时目录里试格式化、写完再检查一遍时发现的。之后复现的命令、`pnpm format` 和对齐步骤都写成两遍。

**持久 shell 里 `export` 的环境变量带进了提交。** 给 `.git-blame-ignore-revs` 的检查试临时仓库时，在会话的 shell 里 `export` 了隔离 git 配置和提交身份的几个变量，之后的提交带着测试用的作者信息，推送被拒绝才发现。那个提交没有推送过：清掉变量，重新提交一次（`b1ae1d27`），检查在干净的环境里重跑。之后这类变量只写在单条命令前面，不 `export`。

**前三个提交改掉的问题怎么找到的**，补进了 `docs/learnings/2026-07/testing-assertion-poisoned-by-command-echo.md` 第 4 节。

### 对提交说明的更正

仓库约定不改写已有提交，更正写在这里。

- `8b8d495f` 写入口那一句「有 121 个字符」。实际是 124 个。结论不变：超过行宽 120，会被折成三行。
- `8b8d495f` 把 `7f1d145f` 叫作「上一个提交」。两者之间还隔着 `71be90f0`。

### 📁 Files Modified

- 格式化提交的 1,953 个文件：`.ts` 1,397、`.tsx` 442、`.mjs` 101、`.js` 7、`.cjs` 4、`.mts` 2
- `scripts/check-ipc-channels.mjs`、`scripts/check-hot-path-reads.mjs`、`scripts/check-path-containment.mjs` 和它们的用例
- `apps/desktop/src/renderer/test/markdown-editor-shell.test.tsx`、`apps/desktop/src/renderer/test/core-event-types.test.ts`、`apps/desktop/src/renderer/test/ui-button.test.tsx`
- `biome.jsonc`、`package.json`、`.github/workflows/ci.yml`、`.github/workflows/base-checks.yml`
- `.git-blame-ignore-revs`（新增）、`scripts/check-blame-ignore-revs.mjs`（新增）、`scripts/test/blame-ignore-revs-check.test.mjs`（新增）、`scripts/check-repo-hygiene.sh`
- `docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`、`browser-bridge/apps/cli/internal/locator/generated/runtime.js`（重新生成）
- `docs/coding-standards/lint-conventions.md`、`docs/coding-standards/README.md`、`docs/CICD.md`、`CONTRIBUTING.md`、`docs/REPO_COLLAB_GUIDE.md`
- `docs/learnings/2026-07/testing-assertion-poisoned-by-command-echo.md`、`docs/learnings/README.md`
- `docs/exec-plans/tech-debt-tracker.md`、`docs/exec-plans/active/20261110-app-assembly-split.md`、`docs/exec-plans/README.md`
- `docs/exec-plans/active/20261110-codebase-review-fixes.md`、`docs/exec-runs/20261110-codebase-review-fixes/`
