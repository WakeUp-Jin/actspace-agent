# CI/CD 说明

常驻 CI 分成仓库基础门禁和 workspace 工程门禁两层；release 流水线产出真实桌面应用 archive。

## 费用前提

仓库是 public。按 [GitHub Actions 计费规则](https://docs.github.com/en/billing/concepts/product-billing/github-actions)，public 仓库使用标准 GitHub 托管 runner（`ubuntu-*`、`windows-*`、`macos-*`）不计费、不占 Free 计划的包含额度，也没有分钟数上限；「每月 2000 分钟、macOS 按 10 倍计」只对 private 仓库生效。Dependabot 与 CodeQL 的运行同样免费。两个仍要留意的点：

- 不要使用 larger runner（如 `ubuntu-latest-4-cores`），public 仓库也收费。
- Actions artifact 存储（Free 计划 500 MB，与 Packages 共享）不随 public 豁免。工作流内部的 artifact 只保留几天；发布产物挂到 GitHub Release，Release assets 不计入 Actions 存储。

下面的触发条件、路径过滤和并发取消都不是为了省钱，而是为了缩短 PR 反馈时间、避免队列里堆积无意义的运行。

## 当前包含的内容

| 工作流 | 触发 | 内容 |
|---|---|---|
| `base-checks.yml` | `pull_request`（**不带路径过滤**）、`push: main`、手动 | `repository-checks`（`scripts/ci.sh` + markdownlint）。唯一每个 PR 都会产生的 check，也是唯一能安全设为 required status check 的 job。 |
| `ci.yml` | `pull_request`、`push: main`（两者都跳过只改文档的提交，见下文「路径过滤」）、手动 | 十个并行 job：`lint-typecheck`（build graph、contract matrix、Biome lint、`pnpm typecheck`）、`test-process`（根目录脚本测试 + 进程级测试）、`test-packages` ×2（desktop 以外全部包的测试，按目录分两片）、`test-desktop` ×3（desktop vitest 按 `--shard` 分三片）、`build`（PR 上 `pnpm build`；`main` 上换成 Linux `release-package.sh` 冒烟加 `pnpm build:cli-web`，不上传产物）、`site`（`pnpm build:site`）、`browser-bridge`（契约检查 + Go 测试 + Windows / macOS 交叉编译，保证发布矩阵能 `go build`）。 |
| `agent-cli-binaries.yml` | `pull_request` 改到 CLI / packages / 打包脚本或它跑的测试时、手动 | 在 CLI 支持的最低 Node 大版本上跑两个并行 job：`managed-esm`（构建并校验 managed package，artifact 保留 3 天）、`process-tests`（CLI 进程级测试，跑的是 workspace 里的 `apps/cli/dist/cli.js`，不读打出来的包）。 |
| `supply-chain-security.yml` | `pull_request` 改到依赖清单 / lockfile / patches 时（`docs/**` 下的原型 `package.json` 不算）、每周一定时、手动 | 依赖变更审查（仅 PR）、OSV 扫描。 |
| `codeql.yml` | `push: main`、`pull_request`（均忽略纯文档路径和 issue 模板）、每周一定时、手动 | CodeQL `javascript-typescript` 与 `actions` 两种语言，`security-and-quality` 查询集；忽略测试、fixture、dist、生成文件和 `scripts/acceptance/**`（`.github/codeql/codeql-config.yml`）。不要在仓库设置里同时开启 CodeQL default setup。本地复现：用 [CodeQL CLI](https://github.com/github/codeql-action/releases) `database create --language=javascript-typescript --codescanning-config=.github/codeql/codeql-config.yml` 建库后 `database analyze --format=sarif-latest`，结果与 GitHub 一致。 |
| `release.yml` | `push` 到 `v*` tag、手动、改到打包脚本的 `pull_request` | 四平台矩阵（macOS arm64 / x64、Linux x64、Windows x64）打包 portable 桌面制品并生成 provenance；tag 或填了 tag 的手动运行再汇总 SBOM 并创建**草稿** Release。PR 只跑打包做验证，不上传完整产物。详见下文「桌面发布」。 |
| `site-pages.yml` | 手动 | GitHub Pages 备用部署，不随 `main` 自动发布。 |

`netlify.toml` 是官网默认部署配置；在 Netlify 连接 GitHub 后由 Netlify 构建并发布 `apps/site`，不走 Actions。

所有 PR 触发的工作流都带 `concurrency` 组并 `cancel-in-progress`，同一个 PR 连续推送只保留最后一次；`main` 上的 push 不取消。`ci.yml`、`codeql.yml`、`base-checks.yml` 在 `main` 上按提交（`github.sha`）分组，不能按分支分组：同一组只允许一个在跑、一个排队，前一次没跑完又连推两次时，中间那次会在排队阶段被后一次顶掉，那个提交就没有完整的运行。需要 pnpm 的 job 统一用 `pnpm/action-setup`（读根 `package.json` 的 `packageManager`）加 `actions/setup-node` 的 `cache: pnpm`，store 命中时 `pnpm install` 约 20 秒；`release.yml` 的 macOS / Windows job 例外，见下文「桌面发布」。

GitHub 托管 runner 另有账户级的并发上限：Free 计划同时最多跑 20 个 job（其中 macOS 最多 5 个），仓库所有者名下的所有仓库、所有工作流共享，超出的 job 排队等前面的跑完（见 [Actions limits](https://docs.github.com/en/actions/reference/limits)）。一次 PR 推送产生的 job：`ci.yml` 10 个、CodeQL 2 个、`仓库基础检查` 1 个，共 13 个；改到 CLI / packages 时加 Agent CLI 的 2 个，改到依赖清单或 lockfile 时加供应链安全的 2 个，改到打包脚本时加发布的 4 个。全部触发是 21 个，比上限多 1 个：会有一个 job 等十几秒，等最短的那个跑完。两个 PR 在一两分钟内先后推送时，后一个要排队（实测 7 个 job 各等了 17–50 秒）。给工作流加 job、加分片之前先数一数。同时在跑的 job 满 20 个之后，排多久取决于各 job 的时长之和，不取决于 job 的个数：把一个 job 拆成几个，各自还要做一遍环境准备，时长之和不会降，多个 PR 同时推送时也就不会更快。

`ci.yml` 里需要 workspace 产物的四类 job（`lint-typecheck`、`test-process`、`test-packages` 两片、`test-desktop` 三片，共七个）共用 `.github/actions/setup-workspace`：装 pnpm / Node、`pnpm install`，再用 `actions/cache` 恢复 `packages/*/*/dist`（含 `tsc -b` 的 `.tsbuildinfo`；不能写 `packages/**/dist`，`**` 会跟进 `node_modules` 里的符号链接匹配上万个第三方 `dist`）。随后各 job 跑 `pnpm build:deps`——即 desktop 的 `build:deps:dev`：`tsc -b tsconfig.desktop-deps.json` 按项目引用图编全部 packages，再补 client / agent-host 的 esbuild 包、english-learning 的 prompts 和 runtime 的默认 harness。缓存 key 带 commit SHA、`restore-keys` 退到同一 lockfile 下最近一次的产物，所以 `tsc -b` 只重编源码变了的包（冷 10 s 级、热 1 s 级）；PR 分支能读到 `main` 和自己之前推送的缓存。手动 `workflow_dispatch` 不恢复缓存，用来强制全量构建。这些 job 互不 `needs`，总时长取最长的那个。

markdownlint 的规则在 `.markdownlint.json`，扫描范围在 `.markdownlint-cli2.jsonc`：第三方 skill 原文（`.agents/skills/**`）、已完成的 history 和测试 fixture 不扫；纯排版类规则（空行、列表周围空行、表格对齐、代码块语言等）关闭，只保留会影响渲染或链接正确性的规则（表格列数、标题层级、重复的兄弟标题、图片 alt、文件末尾换行等）。本地复现用 `npx -y markdownlint-cli2@0.20.0 "**/*.md"`。

`main` 的 ruleset 只把 `仓库基础检查`（`base-checks.yml` 的 `repository-checks`）设为 required status check，也只能选它：它不带路径过滤，每个 PR 都会报告。`ci.yml` 的全部 job、CodeQL、Agent CLI、供应链安全、发布这些带 `paths` / `paths-ignore` 的工作流不能设为必需——纯文档 PR 不触发它们，GitHub 会一直显示 Expected 并永远卡住合并。分片 job 的 check 名还带片号（`包测试 (1/2)`、`桌面端测试 (2/3)`），改片数就改了名字，同样不适合登记成必需检查。历史上 `repository-checks` 曾放在 `ci.yml`、并有一份路径互补的 `docs.yml`，两者都带路径过滤、任一设为必需都会卡死另一类 PR，所以拆成了独立的 `base-checks.yml`。

### 路径过滤

`ci.yml` 的 `pull_request` 和 `push: main` 共用一份 `paths`（YAML 锚点 `code-paths`），只改文档的 PR 和 `main` 上只改文档的 push 都不触发。规则按顺序求值、后面的覆盖前面的，分三段：

1. `'**'` 先全选。
2. 排除没有任何 job 会读的文档：`docs/**`、各目录的 `README.md`、仓库根的 `*.md`、`.agents/**/*.md`、`apps/site/*.md`、`browser-bridge/docs/**`、`browser-bridge/skill/SKILL.md`、issue 与 PR 模板。
3. 把 `docs/` 里被构建或检查读取的文件加回来：`docs/roadmap.md` 和 `docs/releases/feature-release-notes.md`（官网的开发计划页和更新日志页）、`docs/design-docs/browser/agent-browser-use-command-surface.md`（`pnpm check:browser`）、`docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`（`pnpm run gen:contract-matrix --check`）。

别处的 Markdown 不排除：官网内容（`apps/site/src/content/**`）、内置 skill、prompt 和测试夹具是构建和测试的输入，改了要跑 CI。维护时注意三点：

- 让某个 job 读 `docs/` 下的新文件时，要把它加到第 3 段，否则只改它的提交不会跑 CI。
- `main` 上只改文档的提交没有 `ci.yml` 的运行（`仓库基础检查` 照常跑）。要看这个提交的代码是否通过，看它前面最近一个有运行的提交：两者之间只差文档。
- GitHub 只取 diff 的前 300 个文件做路径匹配。一次改动超过 300 个文件、排在前面的 300 个又全是被排除的文档时，工作流不会触发，要到 Actions 页手动运行 `CI`。

`pull_request` 的路径过滤看的是整个 PR 相对目标分支的 diff，不是最后一次推送：PR 里只要有一个提交改了代码，之后每次推送都会触发，哪怕那次只改文档。

### Dependabot

`.github/dependabot.yml` 每周一开一批更新 PR：npm 按「开发依赖的 minor/patch」「运行时依赖的 minor/patch」各合成一个 PR，运行时依赖的 major 单独开 PR 逐个评估，上限 5 个；GitHub Actions 与 Go module 各合成一个 PR。Dependabot 对 SHA pin 的 action 会同时更新 SHA 和版本注释，不会破坏 `check-action-pinning.sh`。三类依赖被排除在自动更新之外：由 `pnpm.overrides` 钉死的 `@deepseek-ai/cordis*` 和 `katex`（`rehype-katex` / `mermaid` 各自声明的范围由 overrides 统一到一个版本），以及带 `patches/` 补丁的 `@earendil-works/pi-ai`——它们的升级必须连 overrides 或补丁一起手动改。`typescript`、`vitest`、`vite`、`@types/node`、`@vitejs/plugin-react` 的版本只在 `pnpm-workspace.yaml` 的 `catalog:` 里，各包写 `catalog:`；升级这五个只改那一处再 `pnpm install`，`scripts/check-package-boundaries.mjs` 会拒绝在包里直接写版本号。

### 在 GitHub 上重新启用

工作流在 GitHub 上被手动停用后，改文件不会自动恢复。合并本次改动后，到仓库的 **Actions** 页左侧找到 `CI`、`供应链安全`、`发布`，在各自页面点 **Enable workflow**；新文件 `base-checks.yml`、`codeql.yml` 和 `dependabot.yml` 合入即生效。CodeQL 的结果出现在 **Security › Code scanning**。

当前根命令还包括：

- `pnpm dev`
- `pnpm build`（= desktop 构建 + `pnpm build:cli-web`）
- `pnpm build:cli-web`（CLI、Web 及其依赖里 desktop 构建没覆盖的包）
- `pnpm lint`
- `pnpm build:deps`
- `pnpm typecheck`
- `pnpm test`（= `pnpm test:scripts` + `pnpm -r --no-bail --if-present test`，由 `scripts/run-tests.mjs` 依次跑：前一段失败后一段照跑，一个包失败其余的包照跑，结尾列出失败的段和包，有失败就以 1 退出）
- `pnpm package:desktop`
- `pnpm dev:site`
- `pnpm dev:web`
- `pnpm build:web`
- `pnpm check:site`
- `pnpm test:site`
- `pnpm build:site`
- `pnpm run ci`
- `pnpm repo:stats`

## 本地 Pre-Push

运行 `pnpm hooks:install` 会把当前 clone 的 `core.hooksPath` 指向仓库内 `.githooks/`。之后每次从该 clone 执行 `git push` 时，`.githooks/pre-push` 会依次：

1. 运行密钥扫描。
2. 输出当前 Git 已跟踪文件的仓库统计。

仓库统计包含不含测试文件的源代码文件数与物理行数、`docs/**/*.md` 文件数与非空白 Unicode 字符数，以及常见 `test` / `spec` 命名的测试文件数。统计本身不设置阈值；数字变化不会阻止 push，只有扫描或统计脚本执行失败时才会中止。

## 当前现状说明

- `scripts/ci.sh` 当前只做仓库级基础检查：
  - docs 骨架、active/completed 生命周期与 current truth zone 校验；current truth zone 会拒绝已删除 v1 路径、已丢弃 active 入口和相对 Markdown 断链
  - repo hygiene
  - GitHub Actions pinning
  - shell 脚本语法检查
- `.github/workflows/base-checks.yml` 的 `repository-checks` 不需要 pnpm，只装 ripgrep 后跑 `scripts/ci.sh` 与 markdownlint。
- 需要 `rg` 的 job（`repository-checks`、`test-process`、`test-packages`、`test-desktop`）统一用仓库内 composite action `.github/actions/install-ripgrep`：从 ripgrep GitHub Release 下载固定版本的 Linux musl 静态包、校验 sha256 后装到 `/usr/local/bin`。不走 apt，因为 runner 上 `archive.ubuntu.com` 会偶发 DNS 解析失败；升级版本时同时改 action 里的 `RG_VERSION` 与 `RG_SHA256`。
- `.github/workflows/ci.yml` 中的工程 job 都从 `pnpm install --frozen-lockfile` 开始，然后各自执行：
  - `lint-typecheck`：`pnpm check:desktop-build-graph`（必须排在 `build:deps` 之前，因为后者会重新生成 `tsconfig.build.json`）、`pnpm run gen:contract-matrix --check`、`pnpm lint`、`pnpm typecheck`。改到 `agent-contract-matrix.generated.md` 头部 digest 覆盖的源码路径（Runtime 事件、服务、plugin manifest、composition 等声明）时要先跑 `pnpm run gen:contract-matrix` 并提交结果，否则这一步会报 stale。`pnpm typecheck` = `build:deps`（`tsc -b` 本身就是对全部 packages 的类型检查）+ 只对 apps 跑 `tsc --noEmit`（`packages/` 下每个包都在 `tsconfig.desktop-deps.json` 的引用图里；新增图外的包时要把它加进这条 filter）。`pnpm lint` 只在 error 级诊断上失败，规则与分层见 `docs/coding-standards/lint-conventions.md`。
  - `test-process`：装 ripgrep、`pnpm build:deps`、`pnpm --filter @actspace/agent-cli build`、`pnpm test:scripts`。`test:scripts` 先跑五条 `check:*`，再由 `scripts/run-script-tests.mjs` 用一次 `node --test` 并行跑 `scripts/test/*.test.mjs`（含直接 spawn `apps/cli/dist/cli.js` 的进程级测试）；新增的测试文件自动包含在内，不用登记到 `package.json`。`agent-cli-process` 和 `agent-cli-safety` 两个文件不在这里跑，由 `agent-cli-binaries.yml` 负责。各个 `test:*` 脚本仍可单独运行。
  - `test-packages`：两个分片，各自装 ripgrep（`tool-fs-search` 的测试调真实 `rg`）、`pnpm build:deps`，再跑 `pnpm -r --no-sort --if-present <filters> test`。第 1 片是 `packages/core/**`、`packages/context/**` 和 `apps/*`（不含 desktop），第 2 片是其余全部；两片的 `--filter` 由 `ci.yml` 里同一份目录清单生成，一正一反，所以新增的包目录不用登记，自动落在第 2 片。测试只读 `build:deps` 的产物，包之间没有先后依赖，`--no-sort` 让 pnpm 不必按依赖拓扑一批一批地等。第 2 片另外带 `--workspace-concurrency=2`，同时跑的包从 pnpm 默认的 4 个降到 2 个：这一片是四十多个小包，已知的时间敏感用例都在里面；每个包的 vitest 自己还要开最多 3 个 worker，4 个包一起跑时十几个进程抢 4 个核。降到 2 个之后各包的耗时减半，整片的时间基本不变：CI 上同样的 42 个包，默认并发 48 s 跑完，并发 2 的两轮是 42 s 和 52 s，差别在 runner 之间的波动以内（本地多 4 s）；整片跑完约 60 s。第 1 片不限：它的时间集中在 `apps/cli`、`apps/web`、`packages/core/runtime` 三个各要 20 s 上下的包上，只开 2 个时它们排成两条队，测试步骤从 50 s 涨到 74 s。这个差别在本地 4 核机器上测不出来（33 s 对 35 s），调并发要看 CI 上的步骤时间。只带排除式 `--filter` 时 pnpm 会把 workspace 根也选进来，根的 `test` 会递归回 `pnpm -r test`，所以要一并排除。
  - `test-desktop`：三个分片，`pnpm build:deps` 后 `vitest run --shard=N/3`，片数只由 `ci.yml` 的 matrix 决定。desktop 的 vitest 配置分成 `main`（node 环境）和 `renderer`（jsdom）两个 project，`vitest run src/main` 这类路径过滤照常可用。两个 project 各用各的 setup 文件：`src/main/test/setup.ts` 只隔离 git 配置，`src/renderer/test/setup.ts` 加载 jest-dom、React 和 mock bridge；`setupFiles` 不要提回配置的根上，否则 main 的 90 多个测试文件每个都会加载一遍 renderer 的 setup，比跑用例本身还慢。vitest 按文件路径的哈希分片，不看耗时，各片文件数相同但时长不等。改片数会换掉每一片里第一个打开设置页、轨迹视图这类 `React.lazy` 页面的用例：整棵懒加载树的冷转译只由这一片里第一个加载它的用例承担，而且落在它那一次 `findBy*` 等待里，默认的 1 s 在慢 runner 上不够。从两片加到三片时有三条用例因此变成「第一个」，它们的等待已放宽到 10 s（`workbench-responsive`、`host-feedback`、`conversation-view-tooltip` 三个测试文件）；再改片数前先按 `docs/learnings/2026-11/vitest-shard-count-moves-lazy-cold-load.md` 的办法找出新的「第一个」。
  - `build`：PR 上跑 `pnpm build`，验证 desktop、CLI、Web 都能从干净检出构建出来（runner 上没有现成的 `dist/`，要按拓扑顺序构建 workspace 依赖）。`main` 上和手动触发时换成三步：装 Go、`./scripts/release-package.sh` 打包冒烟（产物不上传）、`pnpm build:cli-web`。打包脚本的第一步就是 desktop 构建，这样构建的内容和 PR 上一样，desktop 不用构建两遍。
  - `site`：只跑 `build:site`，并使用 Netlify 的 `/` base path 验证生产构建；CI 中的 `https://example.com` 仅用于构建检查，不是官网地址。官网的 `astro check` 在 `lint-typecheck` 的 `pnpm typecheck` 里（`apps/site` 的 `typecheck` 和 `check` 是同一条命令），单元测试在 `test-packages` 第 1 片里，这里不重复。
  - `browser-bridge`：`pnpm check:browser`、`go test` 和 Windows / macOS 交叉编译。`setup-go` 的缓存 key 比 `build` 和 `release.yml` 多算一个 `browser-bridge/go.work`，让这个 job 有自己的 key：缓存只在第一次没命中时保存一次，共用 key 时谁先存谁占住。平时是这个 job 先存（它一分钟跑完，存下的是全的）；但换 key 之后第一次 `main` 运行里它要是失败了——失败的 job 不保存缓存——几分钟后跑完的 `build` 就把只有本机产物的那份存上去，之后这里的 `go test` 和交叉编译每次从头编，直到下次换 key，2026-11-08 到 11-13 就是这样。key 里还带 Go 的补丁版本：`go.mod` 只写到 `1.26`，`setup-go` 直接用 runner 镜像预装的那一版，镜像滚动更新的几天里新旧两版 runner 并存，两个 key 各要冷跑一次。`setup-go` 之后有一步把 `go env GOCACHE` 的结果写进 `GITHUB_ENV`，不要删：这个 job 里有两处自己起 `go` 的地方——`check-browser-command-registry.mjs` 的 `go run`，和 `apps/cli` 测试里 `ensureDevHostWrapper` 的 `go build`——环境里没有 `GOCACHE` 时它们都把编译产物放进同一个临时目录，绕开恢复的缓存把 CLI 从头再编一遍。只把其中一处指回缓存，从零编译会原样挪到另一处：缓存命中了，`apps/cli` 的测试却从 1 s 变成 7–12 s。再往后一步把缓存目录里所有条目的修改时间刷新成现在，也不要删：恢复出来的文件带着保存那天的修改时间，而 go 每次构建结束时会删掉 5 天没用过的缓存条目。缓存存下 5 天之后，job 里第一条 go 命令（registry 检查的 `go run`）一跑完，`go test` 和交叉编译要用的条目就被删掉，这两步又从头编（对照实验里多 13 s）。`build` 和 `release.yml` 每个 job 只跑一条 `go build`，命中发生在清理之前，不需要这一步。缓存命中时和 Go 有关的三步合计几秒到二十来秒：`go test` 和交叉编译各 1–5 s，其余是 registry 检查的 `go run`——job 里第一条 go 命令要付从磁盘读 Go 工具链的时间，快的 runner 上不到 1 s，慢的十来秒，缓存省不掉。没命中时本机和两个交叉编译目标各从头编一遍，多 20–35 s。
- `scripts/check-package-cutover.mjs --strict` 会忽略相对导入里的 `plugins/` 片段（如 desktop main 的 `../plugins/plugin-switches`），也不把测试文件里的退役名当作运行时可达边；它要抓的是对退役 workspace `plugins/` 目录和旧包名的真实引用。
- 浏览器客户端 `apps/web` 没有单独的 workflow：`pnpm typecheck`、`pnpm test`（`pnpm -r`）覆盖它的类型检查和 vitest，根 `pnpm build` 在 desktop 之后执行 `pnpm build:cli-web`，它只构建 CLI、Web 及其依赖里 desktop 构建没覆盖的包（用 `!@actspace/runtime...`、`!@actspace/client...` 减掉 desktop 已经构建过的两个依赖闭包），所以单独跑 `build:cli-web` 之前要先有 desktop 的构建产物；只想构建 Web 时用自带依赖的 `pnpm build:web`。`pnpm check:frontend-tokens` 和 `pnpm check:frontend-theme` 同时检查 desktop 与 web 两套前端。web 产物 `apps/web/dist` 目前不打进任何发布包，由用户在 Host 配置的 `webRoot` 指向它。
- workspace 依赖当前允许 `electron` 和 `esbuild` 执行构建脚本。Electron 42 起 npm 包不再在 postinstall 下载二进制，而是第一次 `require("electron")` / 跑 `electron` bin 时按需拉取（`pnpm --filter @actspace/desktop exec install-electron` 可手动触发）；开发启动脚本和 `release-package.sh` 都会自动走这条路，`pnpm install` 后看不到 `node_modules/electron/dist` 是正常的。
- 当前桌面端优先跟随较新的稳定 Electron 版本（现在是 45，Node 24 / Chromium 156），以降低 macOS 26 这类新系统上的启动兼容风险。Electron 44 起不再支持 macOS 12 和 Windows 32 位。
- `apps/desktop` 的开发启动依赖 `packages/util/shared`、领域 packages 和 `packages/core/runtime` 的可消费构建产物；如果包边界被改回源码直引，Electron 启动链会再次失稳。
- `scripts/release-package.sh` 会先构建 desktop workspace，再用当前平台的 Electron runtime 组装 portable desktop archive；默认不需要付费证书，也不会强制签名。

默认 CI 守住真实 TypeScript workspace 的基础健康；release 产出真实桌面应用 archive。macOS release 会额外产出本地安装用 `.dmg`，但当前 release 不强依赖 Developer ID 证书，仍不包含正式 notarization 或自动更新。

开源用户可以直接从源码本地打包：

```sh
pnpm install
pnpm package:desktop
# macOS 上也可以用这个更直观的别名；它和 package:desktop 走同一条 release 脚本。
pnpm package:desktop:dmg
```

该命令会在 `dist/` 生成当前平台的 desktop archive；macOS 上还会生成 `actspace-desktop-darwin-<arch>.dmg`。打开 `.dmg` 后把 `Actspace.app` 拖到 Applications 即可本地安装。macOS 上没有 Developer ID 证书时，脚本默认不签名，并会移除外层 app 继承自 Electron runtime 的旧签名，避免修改资源后留下失效签名。这适合源码本地构建和开发验证，不等于面向公众分发所需的 Developer ID 签名和 notarization；首次打开时系统可能提示无法验证开发者，需要右键打开或在系统设置里允许。源码本地自用时也可以运行 `ACTSPACE_MAC_ADHOC_SIGN=true pnpm package:desktop:dmg` 生成本地临时签名产物；该模式只用于降低自构建使用摩擦，仍不提供开发者身份背书。`pnpm deploy` 会先尝试 `--offline`，如果本机 pnpm store 缺少 tarball，再自动退回普通 deploy 以补齐缓存。

macOS 产物会把复制来的 Electron runtime 改成 Actspace 语义：外层 bundle 为 `Actspace.app`，主可执行文件为 `Contents/MacOS/Actspace`，`Info.plist` 的 `CFBundleExecutable` 也同步指向 `Actspace`。这让本地构建的应用更接近标准 macOS app，并减少 Electron 默认 runtime 名称带来的 `app.isPackaged`、钥匙串和系统识别混乱。

已安装的 macOS app 还提供设置页「更新 → 本地更新」入口，服务本地自用：用户选择本机 actspace 源码目录后，应用会从该目录运行 `pnpm package:desktop:dmg`，构建阶段保持当前 app 打开并显示阶段进度。本地 updater 构建默认启用 `ACTSPACE_MAC_ADHOC_SIGN=true`，但不会覆盖用户显式提供的 Developer ID 签名或 ad-hoc 配置；helper 会在退出当前 app 前验证新 `.app` 的 bundle 元数据、主可执行文件和 code signature。验证通过并写出 `ready_to_replace` 后，main 进程才退出当前 app，helper 随后替换 `.app` 并重新打开；如果复制或打开新 app 失败，helper 会尝试恢复旧版本。该能力不拉取远程代码、不做版本比对，也不等同于正式自动更新；它依赖本机源码目录、pnpm 环境和当前安装位置可写。updater 通过当前进程路径解析真实 `.app` 安装目标，并拒绝 `node_modules/electron/dist/Electron.app` 这类开发 runtime；不要只用 Electron 的 `app.isPackaged` 作为本地安装判定。

所有 GitHub Actions 仍然保持 pin 到 commit SHA。后续升级 action 时，也要继续保持这个约束。

## 官网部署

官网是 `apps/site` 下的 Astro 静态站点，默认通过 Netlify 的 Git 集成发布。根目录 `netlify.toml` 是部署配置入口，不需要新增 GitHub Actions 上传流程，也不需要配置 Netlify token 到 GitHub。

### 首次连接 Netlify

1. 先将部署配置提交并推送到 GitHub。
2. 在 Netlify 创建项目，导入此 GitHub 仓库，Production branch 选择 `main`。
3. Base directory 使用仓库根目录（配置中的 `.`）；Package directory 可填 `apps/site`。不要把 Base directory 改成 `apps/site`。
4. 确认读取根目录 `netlify.toml`：构建命令为 `SITE_URL="${SITE_URL:-$URL}" pnpm build:site`，发布目录为 `apps/site/dist`，Node 为 24。pnpm 版本从根 `package.json` 的 `packageManager` 读取。
5. 触发首次部署，按控制台提示发布站点，检查首页、博客、文档、更新页、开发计划页、图片和 404。

Netlify 从仓库根安装 pnpm workspace 依赖，构建时读取 `docs/releases/feature-release-notes.md` 与 `docs/roadmap.md`；最终仅发布 `apps/site/dist`，不发布整个仓库。当前纯静态站点无需 Netlify Adapter 或服务端函数。

图片优化由构建时 Sharp 完成，`apps/site` 显式依赖 Sharp；部署后直接提供静态 WebP，不依赖付费图片转换服务。`netlify.toml` 为 `/_astro/*` 内容哈希资源设置 `Cache-Control: public, max-age=31536000, immutable`，HTML 继续使用默认重新验证策略。修改图片内容或转换参数会产生新的资源 URL。Astro 本地 preview 不模拟 Netlify 响应头，上线后仍需验证缓存头。

`SITE_BASE=/` 由配置固定。`SITE_URL` 优先使用控制台显式配置的值，未配置时使用 Netlify 内置 `URL`（主站地址，不是单次预览地址），供 canonical、sitemap 和 robots 使用。配置文件本身不展开环境变量，回退在构建命令的 shell 中完成。

连接后，`main` 的相关源码变更会由 Netlify 自动构建发布。`ignore` 规则覆盖站点、两份构建时读取的文档、根依赖配置、patches 和 Netlify 配置；纯桌面端变更跳过官网构建。首次部署或无法比较历史时继续构建。控制台调整域名或环境变量后，应手动触发重新部署。GitHub CI 与 Netlify 部署独立运行；需要 CI 通过才合入主线时，应通过 GitHub 分支保护要求 PR 检查通过。

### 自定义域名

在 Netlify 的 Domain management 添加购买的域名，再按 Pending DNS verification 提示在域名 DNS 服务商（例如阿里云）配置解析，设置主域名并检查 HTTPS。无需添加 GitHub Pages 使用的 `public/CNAME` 文件。绑定后检查 Netlify 内置 `URL` 是否为正式主域名；也可以显式设置构建环境变量 `SITE_URL=https://<domain>`，随后重新部署。

本地模拟根路径构建（示例地址不是实际官网）：

```sh
SITE_URL=https://example.com SITE_BASE=/ pnpm build:site
```

真实 Netlify 安装、构建、上线和域名验证需要在连接仓库后完成，本地构建通过不代表线上发布已完成。

参考：[Netlify monorepo](https://docs.netlify.com/build/configure-builds/monorepos/)、[构建跳过规则](https://docs.netlify.com/build/configure-builds/ignore-builds/)、[外部 DNS](https://docs.netlify.com/manage/domains/configure-domains/configure-external-dns/)。

### GitHub Pages 备用部署

`site-pages.yml` 保留为手动备用入口，其发布地址仍为：

```text
https://wakeup-jin.github.io/actspace-agent/
```

Astro 官方 Action checkout 完整 monorepo，从仓库根目录安装 pnpm workspace 依赖，再运行 `pnpm build:site`，上传 `apps/site/dist`，只有 build job 成功后 deploy job 才会发布。

仓库维护者仍需在 GitHub 的 **Settings → Pages → Build and deployment → Source** 中选择 **GitHub Actions**。Workflow 不能代替这项仓库设置。

备用 Pages 构建环境为（也是 Astro 配置未显式传入环境变量时的本地默认值）：

```sh
SITE_URL=https://wakeup-jin.github.io SITE_BASE=/actspace-agent pnpm build:site
```

组件内部链接统一经过 base path helper，不需要逐页修改。站点发布与桌面 release 独立，官网部署失败不会创建或修改桌面 GitHub Release。

## 下一步推荐

1. 继续保留 `repository-checks`（`base-checks.yml`）与各工程 job（`ci.yml`）的分层，避免仓库卫生与工程构建互相遮蔽失败原因；`base-checks.yml` 不要加路径过滤，否则 required check 会失效。
2. 新增 action 时必须继续 pin 到 commit SHA；`scripts/check-action-pinning.sh` 会拦截浮动 tag。
3. 如果后续接 installer（dmg 之外的 pkg、Windows 安装器、Linux AppImage / deb）、Developer ID 签名、notarization、Windows Authenticode、远程自动更新，再在现有 release 流水线上扩展；Electron 大版本升级见 `docs/exec-plans/completed/20261108-ci-pipelines.md` P5。

## 供应链安全

默认控制项：

- `actions/dependency-review-action`：审查 PR 中的依赖变更。`.github/dependency-review-config.yml` 设置了 `warn-only: true`，高风险变更只告警、不阻断；要升级为硬门禁时先移除该配置。
- `google/osv-scanner-action`：在 PR、定时任务和手动触发时，对依赖声明和 lockfile 做已知漏洞扫描。
- `anchore/sbom-action`：为 release 产物生成 SPDX 格式 SBOM。
- `actions/attest-build-provenance`：为 release 产物生成签名 provenance。
- `github/codeql-action`：对 TypeScript / JavaScript 源码和 workflow 文件做静态安全分析，结果进 Security › Code scanning。
- Dependabot：每周分组开依赖更新 PR，见上文。
- `scripts/check-action-pinning.sh`：所有 GitHub Actions 必须固定到 commit SHA；出现浮动 tag 时 CI 直接失败。

限制和前提：

- Dependency Review 在 public repo 可直接使用；private repo 通常需要 GitHub Advanced Security。
- OSV 和 SBOM 依赖仓库里存在可识别的依赖清单或 lockfile。
- provenance 指向 `scripts/release-package.sh` 生成的真实 release artifact，但它不等于 Developer ID 代码签名或 notarization。默认无证书的 macOS 产物会移除外层 app 的旧签名，避免携带失效签名；ad-hoc signing 只是显式 opt-in 的本地临时签名，不提供开发者身份背书。
- OpenSSF Scorecard 默认不启用：等分支保护、release 历史和 SAST 姿态配置完成后再按需加回。
- 后续可把 attestation 校验下沉到部署平台或准入层。

## 桌面发布

### 怎么发一个版本

1. 改 `apps/desktop/package.json` 的 `version`，并在 `docs/releases/feature-release-notes.md` 写这次用户可见的变化。
2. 合并到 `main` 后打 tag 并推送：`git tag v0.1.1 && git push origin v0.1.1`。tag 必须等于 `v` + `package.json` 的版本，`release.yml` 第一步会校验，不一致直接失败。
3. 等 `发布` 工作流跑完（四个平台并行，约 10–15 分钟），到 **Releases** 页会多出一个草稿，自动生成的 release notes 列出合并的 PR；检查产物、改标题和说明，点 **Publish release**。草稿对外不可见，发之前随时可以删掉重来。

不想打 tag 只想看四个平台能不能打出来：Actions → `发布` → **Run workflow**，`tag` 留空。产物作为 Actions artifact 保留 3 天。填了 `tag` 就等同于 tag 推送（会在当前分支 HEAD 上建 tag）。

改到 `scripts/release-package.sh`、`scripts/package-browser-components.mjs` 等打包脚本的 PR 会自动在四个平台跑一遍打包；只上传每个平台的 manifest 做验证，不占 artifact 存储，也不创建 Release。

### 产物

每个 tag 的草稿 Release 挂着：

- `actspace-desktop-darwin-arm64.tar.gz` / `.dmg`、`actspace-desktop-darwin-x64.tar.gz` / `.dmg`：macOS，`.dmg` 里拖 `ActSpace.app` 到 Applications。
- `actspace-desktop-linux-x64.tar.gz`：解压后运行 `./actspace`。
- `actspace-desktop-windows-x64.zip`：解压后运行 `ActSpace.exe`。portable 布局，没有安装器、没有图标和 Authenticode 签名，首次运行 SmartScreen 会提示；Windows 上没有 nono 沙盒。`resources/app/node_modules` 用 pnpm 的 `node-linker=hoisted` 平铺（zip 装不下 pnpm 默认布局里的 junction，归档工具跟着 junction 走还会在循环依赖里无限递归），所以 zip 比 tar.gz 大一些。
- `release-manifest.json`：四个平台的 manifest 合成一份，每个平台标明 archive / dmg 大小、`signed`、`notarized`、`signature`、`packaging`。`signature: "ad-hoc"` 代表本地临时签名，不是 Developer ID 分发签名。
- `sbom.spdx.json`：源码树的 SPDX SBOM。
- 每个 archive / dmg / zip 还有一份 GitHub artifact attestation（build provenance），在 Release 页或 `gh attestation verify` 里看。

本地 `pnpm package:desktop` 产出当前平台的那一份，manifest 名为 `release-manifest-<platform>-<arch>.json`。当前交付链路产出真实桌面应用 archive 和 macOS 本地安装介质，但不是正式签名分发包。

### Runner

| 平台 | runner | 说明 |
|---|---|---|
| macOS arm64 | `macos-latest` | 当前 Apple Silicon 镜像 |
| macOS x64 | `macos-15-intel` | GitHub 为 public 仓库保留的免费 Intel 标准 runner；`macos-*-large` 是付费 larger runner，不要用 |
| Linux x64 | `ubuntu-latest` | |
| Windows x64 | `windows-latest` | 用 Git Bash 跑同一份 `release-package.sh` |

产物支持的最低系统随 Electron 走：Electron 45 要求 macOS 13+、Windows 10+（64 位）。

四个 job 都用 `actions/setup-go` 装 `go.mod` 要求的 Go 版本（打包要 `go build` 浏览器桥 CLI），用 `pnpm/action-setup` 装 pnpm。缓存只开读得到、读了也省时间的那部分。一次运行只读得到本分支和 `main` 存的缓存：

- Linux job：`setup-node` 的 pnpm store 和 `setup-go` 的编译缓存都开。这两份 `ci.yml` 在 `main` 上存过（key 相同），发版和 PR 上都直接命中。
- macOS / Windows job，tag 推送和手动触发：两样都不开。没有任何 job 在 `main` 上存这三个平台的缓存，发版时必然读不到，存下来也只落在别的运行读不到的 tag 作用域里，占仓库 10 GB 的缓存额度。
- macOS / Windows job，PR 上：只开 Go 编译缓存。同一个 PR 的后续推送读得到前一次推送存的；它每个平台 14 MB，命中后浏览器桥组件少编 7–18 秒。pnpm store 每个平台近 200 MB，恢复后再安装和直接下载安装用时相当，没命中的那次还要花 10–50 秒压缩上传，所以不开。

这几个数字来自改动前 13 次发布运行的逐步骤对比，和在同一台 macOS runner 上交替「恢复 store / 现下载」的对照，见 `docs/exec-runs/20261113-ci-speedup-round2/execution-process.md` 步骤 13、15。

darwin-x64 的 job 第一步是 `sudo mdutil -a -i off`，关掉 Spotlight 索引。macOS runner 上索引默认开着，`pnpm install` 往磁盘上写的几万个文件会被它跟着建索引；Intel runner 只有 4 个核，安装依赖期间 Spotlight 的进程平均占 0.7–1.1 个核，同机对照里紧接着的 desktop 构建因此慢 20–42 秒。arm64 runner 上测不出差别，所以只在 Intel 上关。这一步只是为了快，设成 `continue-on-error` 并限时 1 分钟：它失败或卡住时 job 照常打包、不会变红，要点开这一步的输出才看得出来。打包脚本用到的 `ditto`、`codesign`、`hdiutil`、`notarytool` 都不依赖 Spotlight。对照的做法和数字见同一份执行过程的步骤 15。

全仓库只有这里用 macOS runner（每次 2 个 job）；免费额度下同时最多 5 个 macOS job、所有工作流共享，其余 job 都在 Ubuntu 上，新增的 job 不关心操作系统时也放 Ubuntu。

## 可选 macOS 签名接口

release 脚本默认不要求证书；只有显式提供环境变量时才启用 Developer ID 签名或 notarization：

- `ACTSPACE_MAC_CODESIGN_IDENTITY`：Developer ID Application 证书名称。存在时脚本会执行 `codesign --options runtime --timestamp`。
- `ACTSPACE_MAC_NOTARIZE=true`：启用 notarization；需要同时提供 Developer ID 签名。
- `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`：notarytool 所需凭据。
- `ACTSPACE_MAC_ADHOC_SIGN=true`：显式启用 ad-hoc signing；脚本会对主 Electron 可执行文件和外层 `.app` 做本地临时签名，避免递归重签 Electron 内置 framework。这不是 Developer ID 分发签名，不提供开发者身份背书，也不等同于 notarization。
