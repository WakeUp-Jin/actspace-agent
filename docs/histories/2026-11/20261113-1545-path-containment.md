## [2026-11-13 15:45] | Task: 路径包含判断收成一份带测试的实现，逐处替换，加一个检查防止再各写各的

### 🤖 Execution Context

- **Agent ID**: `cursor-cloud-agent`
- **Base Model**: `Claude Fable 5.2`
- **Runtime**: `Cursor Cloud Agent`

### 📥 User Query

> （代码库审查后的讨论）M5 可以。……架构上和实现上的改进方式：1. 路径带测试模块取代 12 份实现。……都可以按照你的建议去做吧。……继续执行

这是审查修复批次的第 5 个 PR，只有 M5 一个条目。计划见 `docs/exec-plans/active/20261110-codebase-review-fixes.md`。

### 🛠 Changes Overview

**Scope:** `packages/util/shared`、`packages/core/{tool-runtime,agent-service}`、`packages/fs/tool-fs-{read,write,search}`、`packages/shell/tool-shell`、`packages/sandbox/{sandbox,sandbox-nono}`、`packages/host/agent-host`、`packages/skill/skill`、`packages/harness-evolution/plugin-manager`、`packages/composition/cordis-adapter`、`packages/client/client`、`apps/desktop`、`apps/cli`、`scripts`

**Key Actions:**

- **一份实现**：`packages/util/shared/src/path-containment.ts`。`relativePathInside(rules, root, candidate)` 在里面时返回相对路径，就是根目录本身时返回空字符串，不在里面返回 `null`；`isLexicallyInside(rules, root, candidate, { includeRoot })` 回答是或否，路径就是根目录本身时算不算，调用方必须写明。
- **逐处替换**：仓库里手写的判断全部处理掉，见下表。
- **一个检查**：`pnpm check:path-containment` 找手写的「..」前缀判断，接进 `pnpm test:scripts`，CI 每次都跑。

替换前的写法有三种问题，下表「原来」一列用这三个词：

- **宽松**：`relative(root, target).startsWith("..")`。根目录下第一层的名字以两个点开头时（`..notes.md`、Kubernetes 挂载卷里的 `..data`），它和它里面的所有东西都被当成往上走。下表说的「名字以两个点开头」都是指这种情况。
- **写死分隔符**：只认 `../`。Windows 上 `relative` 返回的是 `..\`，认不出来。
- **不查绝对路径**：Windows 上目标在另一个盘符时 `relative` 返回绝对路径，不以 `..` 开头，认不出来。

| 位置 | 原来 | 改完之后 |
| --- | --- | --- |
| `tool-fs-read`、`tool-fs-write`、`tool-fs-search` 的 `isWithin`、`displayPath` | 宽松 | 没有经过权限准入的调用读、写、搜 `..notes.md` 这类路径不再报 `Path escapes workspace boundary`；工具摘要里这类文件显示相对路径 |
| `tool-shell` 判断 Bash 的 cwd | 宽松 | 工作区里名字以两个点开头的目录可以当 cwd，不再报 `Bash cwd is outside the workspace.` |
| `sandbox` 的策略解析 | 宽松 | 可写目录里有一个禁止读取的 `..secrets` 时，现在查得出两者重叠并拒绝这份策略；原来放行 |
| `sandbox-nono` 的读授权拆分 | 宽松 | 被排除路径的父目录现在被认出是它的祖先，不再整个授予读权限；原来在 Linux 上被排除的路径实际可读 |
| `agent-host` 的 `HostArtifacts`（两处） | 写死分隔符 | Windows 上运行 Host 时，`files.reference` 的 `path` 不能再用 `..` 引用工作区外、同一盘符上的文件 |
| `cordis-adapter` 的 `resolveModule` | 宽松、不查绝对路径 | `./..codec.mjs` 这样的模块名可以用；Windows 上链接到另一个盘符的模块被拒绝 |
| `plugin-manager` 新建工作目录 | 宽松、不查绝对路径 | 改成「真实路径必须等于刚建的路径」，比「还在项目里」更严 |
| `skill` 的 `parseSkill` | 拿文件和它自己的父目录比，永远不成立 | 删掉这条判断 |
| 桌面端 `review-git-engine.ts` | 宽松 | Review 面板里 `..notes.md` 这类未跟踪文件有正常的行数和内容；原来被当成二进制文件列出来，行数记成 0，带一条 `ignored_path` 警告，读它的 diff 失败（`Untracked file is outside the workspace.`） |
| 桌面端 `fixed-renderer-skills.ts`（三处） | 宽松、不查绝对路径；「可卸载」标记用字符串前缀 | 目录名以两个点开头的 Skill 可以安装；Windows 上另一个盘符的路径不能经卸载接口删除；直接放在用户 Skill 目录根上的 `SKILL.md` 不再标成可卸载 |
| 桌面端 `workspace-open-service.ts` | 宽松 | 右侧面板「在外部应用中打开」（只有 macOS 上能用）名字以两个点开头的文件不再报 `escapes_root` |
| `tool-runtime` 的 `isPathWithin`、`tool-shell` 的 `command-rules.ts`（两处）、`agent-service` 的 `application.ts`、`agent-host` 的 `workspace-file-reference.ts`、桌面端 `workspace-access.ts`、`client` 的 `tool-card.ts`（两处） | 原来就是对的 | 行为不变 |
| `agent-host` 的 `node-ports/artifact-store.ts`、桌面端 `runtime-v2/artifact-store.ts`、`apps/cli` 的 `artifacts.ts` | 宽松 | 行为不变：输入里不会出现以两个点开头的名字（制品 id 是十六进制串；CLI 的文件名是代码里写死的） |
| `agent-host` 的 `static.ts` | 用根目录做字符串前缀 | 行为不变：两边都是 realpath 的结果 |
| 桌面端 `runtime-v2/workspace-port.ts` | 宽松 | 目前没有调用方，一并换掉，免得以后有人照着旧写法抄 |

沙箱那两处原来是放行而不是拒绝，但正常使用碰不到：要触发，禁止读取的路径或可写目录的路径里得有一段名字以两个点开头。内置的禁止读取路径（`.ssh`、`.aws`、钥匙串等）名字都不是这样，目前也没有调用方传自己的禁止读取路径，剩下的只有主目录或工作区本身起了这种名字的情况。

`sandbox`、`sandbox-nono` 两个包为此新增对 `@actspace/shared` 的依赖；`sandbox` 不再导出 `contains`（没有别的包在用）。

### 🧠 Design Intent (Why)

**为什么要收成一份。** 这个判断只有三行，但三个条件缺一个就错，而且错得不显眼：宽松写法在绝大多数路径上结果是对的，只在名字以两个点开头时出错。用新加的检查在动手之前的代码上数，是 22 个文件 28 处：18 处是宽松写法，2 处写死了分隔符，8 处是对的。另外 `cordis-adapter` 有一处宽松写法、`agent-host` 的 `static.ts` 有一处字符串前缀的写法，检查数不到（前者在清单里，后者不是 `startsWith("..")` 这种写法）。错的方向也不一致：文件工具、Bash、Review 面板是多拒绝，沙箱的两处和 `agent-host` 是多放行。

**路径规则由调用方传。** `shared` 同时跑在浏览器和 Node 里，不能引 `node:path`。所以函数的第一个参数是一组规则（`relative`、`isAbsolute`、`sep`）：Node 里把 `node:path` 整个传进去，界面里传 `pathe` 的两个函数加固定的 `/`。这样还有一个好处：测试在 Linux 上把 `path.posix` 和 `path.win32` 两套规则都跑到，Windows 的行为不用等到有 Windows 机器才知道。

**只比较字面，不解析符号链接。** 各处对符号链接的处理本来就不一样：有的两边都先 realpath，有的只 realpath 根目录，有的输入已经是真实路径。把 realpath 做进共享函数会改掉其中一些的行为。所以函数名里写明 `Lexically`，注释写明要防符号链接得先 realpath；`tool-runtime` 的 `isPathWithin` 保留自己「根目录存在时先换成真实路径」这一步，只把最后的比较换掉。

**`includeRoot` 必填。** 「路径就是根目录本身」算不算在里面，各处答案不同：工作区本身可以读、可以当 cwd；卸载 Skill、删除目标、重定向目标必须严格在里面，否则会删掉或覆盖整个目录。给一个默认值，就会有人不看就用。

**`cordis-adapter` 留一份本地副本。** 它和 `shared` 同在依赖的最底层，互不依赖，不能引用共享实现。在原地改成同样的三个条件，注释写明这是对照 `shared` 的副本。

**`plugin-manager` 不换成共享函数。** 那里上面两级目录已经逐级确认过「不是链接、真实路径等于自身」，新建的这一级照同样的规矩判断就够了，不需要另一种判断方式。

**检查只认 `startsWith` 的写法。** 这是原来 28 处全部用的写法，所以拦得住照旧写法抄的情况。用正则或 `slice` 比较的、用根目录做字符串前缀的都认不出来，脚本开头写明了这个限制。可以保留的文件按「文件加处数」记在脚本的清单里，处数对不上就失败，这样已经在清单里的文件也不能悄悄多写一处。

**没有动的。**

- `scripts/package-agent-cli.mjs`、`scripts/package-browser-components.mjs` 里各有一处宽松写法。构建脚本单独运行，不引用工作区的包，要改只能在原地再各写一份；而这两处只会多拒绝，不会放过真正越界的路径，改的收益很小。后一处是「宽松写法加绝对路径检查」，按定义只会比正确的写法拒绝得更多；这个文件还是「发布」工作流的路径过滤条件，PR 改到它会在四个平台上跑一遍打包。前一处的写法不一样（先切掉根目录的长度再比），用 80 万组随机路径和共享实现比过（posix、win32 各 40 万）：没有一组是它放行而共享实现拒绝的；它多拒绝的有三类，包目录就是盘符根、Windows 上大小写不同、名字以两个点开头。两处都记在检查的清单里，写明理由。
- 检查「一段相对路径里有没有 `..` 这一段」的写法（`segments.some((segment) => segment === "..")` 之类）。它们是在校验一个不可信的相对路径字符串，按整段比较，本来就准确，和「目标在不在目录里」是两件事。
- 界面里为了显示把工作区前缀裁掉的写法（`path.startsWith(`${root}/`)`）。它们不做放行或拒绝。

### ✅ Verification

- **共享实现**：两个平台各一张用例表（根本身、子路径、同前缀的兄弟目录、`..foo`、没折叠的 `..`、大小写、正反斜杠、跨盘符、UNC）。另有一个对照：在小字母表上穷举根和候选路径（posix 22,800 组，win32 66,822 组），结果要和一个不经过 `relative`、逐段比较的实现一致。把实现改错再跑测试，一共 12 种改法（上面三种错的写法和它们的组合、少认一个条件、`includeRoot` 当成固定值或取反、`relative` 的两个参数写反），每一种都有用例失败。
- **有行为变化的每一处**都加了用例，回到改之前的代码上确认过失败：三个文件工具、Bash 的 cwd、`sandbox` 的重叠检查、`sandbox-nono` 的读授权拆分、`cordis-adapter` 的 `./..codec.mjs`、Review 面板、Skill 的安装 / 标记 / 卸载、「在外部应用中打开」。
- **行为不变的几处**补了用例把现在的行为固定下来（`tool-runtime` 的 `isPathWithin` 对符号链接根目录的处理、`command-rules.ts` 的 `..cache` 这类名字、`agent-service` 降级时保留工作区内的授权、`client` 的工具卡片路径），这些用例在改之前同样通过。
- **没有在真实 Windows 上跑。** `agent-host`、`fixed-renderer-skills.ts`、`cordis-adapter` 三处和 Windows 有关的修复，靠的是共享实现的 win32 用例表；云端只有 Linux。
- **检查脚本**：7 个用例。在动手之前的代码上跑，报出 22 个文件 28 处；现在通过，扫了 1,506 个文件。往一个不在清单里的文件和一个在清单里的文件各加一处手写判断，检查失败并指出文件和行号。把脚本改错再跑用例，一共 54 种单点改动（每个跳过的目录、每个扫描的根目录、注释行的处理、正则的每个分支、清单的多和少、每种扩展名、每种测试文件命名的排除），每一种都有用例失败。其中 6 种一开始没有用例失败（`.js`、`.jsx`、`.mts`、`.cts` 四种扩展名，`.bench.`、`.perf.` 两种命名），样例目录里补了这几种文件（`e4a3f7b5`）。
- **全量验证**报出两处，都在建 PR 之前修掉：契约矩阵的摘要过期（`38b12d57`）；`scripts/ci.sh` 里的包切换检查把两处说明文字当成了深层引用（`59c2cb9b`）。后者值得记一句：那条检查不分代码和注释，`@actspace/<包名>` 后面隔着一段没有引号的文字出现 `/src/` 就算，写注释和提示文字时把文件路径放在包名前面。
- 全量验证的范围和结果见执行记录步骤 6。

### 对提交说明的更正

仓库约定不改写已有提交，更正写在这里：

- `85a4b440` 写的 `file.reference`，方法名是 `files.reference`。
- `1bdcb686` 写两个构建脚本「改它们会触发发版相关的工作流」。这只对 `package-browser-components.mjs` 成立；`package-agent-cli.mjs` 所在的工作流，这个 PR 改了 `packages/` 本来就会触发。
- `38b12d57` 写契约矩阵的摘要变化来自「agent-host、agent-service、skill、plugin-manager、cordis-adapter 等」的源码。矩阵的摘要只覆盖一份固定的文件清单，上一次重新生成（`dc817d63`）之后这个分支改到的只有 `packages/core/agent-service/src/application.ts` 一个。

### 📁 Files Modified

- `packages/util/shared/src/path-containment.ts`（新增）、`src/test/path-containment.test.ts`（新增）、`src/index.ts`
- `packages/core/tool-runtime/src/permission/file-resource.ts`、`src/test/permission.test.ts`
- `packages/fs/tool-fs-{read,write,search}/src/node-ports.ts` 与各自的测试
- `packages/shell/tool-shell/src/{node-ports,command-rules}.ts` 与对应测试
- `packages/sandbox/sandbox/src/{policy,index}.ts`、`packages/sandbox/sandbox-nono/src/cover.ts`，两个包的 `package.json`、`tsconfig.build.json` 与测试，`pnpm-lock.yaml`
- `packages/host/agent-host/src/{artifacts,static}.ts`、`src/node-ports/{artifact-store,workspace-file-reference}.ts` 与测试
- `packages/core/agent-service/src/application.ts` 与测试
- `packages/skill/skill/src/discovery.ts`
- `packages/harness-evolution/plugin-manager/src/service.ts` 与测试
- `packages/composition/cordis-adapter/src/source-loader.ts` 与测试
- `packages/client/client/src/sessions/tool-card.ts`（用例在 `apps/desktop/src/main/test/runtime-v2-tool-preview.test.ts`）
- `apps/desktop/src/main/{review-git-engine,workspace-open-service,workspace-access}.ts`、`src/main/runtime-v2/{fixed-renderer-skills,artifact-store,workspace-port}.ts` 与对应测试
- `apps/cli/src/artifacts.ts`
- `scripts/check-path-containment.mjs`（新增）、`scripts/test/path-containment-check.test.mjs`（新增）、`package.json`
- `packages/util/README.md`、`docs/SECURITY.md`、`docs/releases/feature-release-notes.md`、`docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`
- `docs/exec-plans/active/20261110-codebase-review-fixes.md`、`docs/exec-runs/20261110-codebase-review-fixes/`
