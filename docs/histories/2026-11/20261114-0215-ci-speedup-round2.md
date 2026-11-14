## [2026-11-14 02:15] | Task: CI 提速第二轮——去掉重复工作、测试再分片、路径过滤与缓存收敛，测试和检查一条不删

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.2`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> 在不删减任何必要测试或检查的前提下，尽可能加快这个仓库的 GitHub Actions：先拉最近 50 次运行，把每个 job 拆成排队、环境准备、实际测试三段找规律；PR 连续推送只跑最新一次，`main` 上不取消；只改文档的提交不触发 CI，同时规划好必需检查；优先用 setup 类 action 的内置缓存，10 GB 的缓存配额里不放用不到的东西；本地连续构建两次，第二次应几乎不耗时；下载预构建工具而不是现场编译；互不依赖的任务并行，去掉不传数据的 `needs`，最长的测试套件拆到多台机器；不关心操作系统的任务放 Ubuntu；不重复做同样的工作。完成后推送并观察实际表现，再做一轮查漏，最后给出前后对比。
>
> 继续执行，如果没有完成的话。

### 🛠 Changes Overview

**Scope:** `.github/workflows/`（`ci.yml`、`agent-cli-binaries.yml`、`codeql.yml`、`release.yml`）、根 `package.json`、`scripts/run-script-tests.mjs`（新）、`scripts/test-browser-locator-runtime.mjs`、`apps/desktop`（vitest 配置、两个 setup 文件、三个 renderer 测试文件）、`docs/CICD.md`、`docs/exec-plans/`、`docs/exec-runs/`、`docs/learnings/`

**Key Actions:**

- 基线：最近 50 次运行的 174 个 job 里，排队中位 2 s，环境准备占 31%、实际工作占 68%；浪费不在环境准备上，在重复构建、串行的脚本测试和最长的两组测试上。
- `pnpm build` 不再把同一批包构建两遍：先构建 desktop，再用新增的 `build:cli-web` 只补它没覆盖的包。干净检出 85 s → 55 s，2600 个产物文件除每次都变的 `apps/web/dist/sw.js` 外哈希相同。`main` 上的 `构建` 换成打包冒烟加 `build:cli-web`，desktop 只编一遍。
- `test:scripts` 的 19 条串行 `test:*` 换成 `scripts/run-script-tests.mjs`，一次 `node --test` 并行跑同样的 28 个文件：82 s → 42 s，用例还是 131 个。
- 包测试按目录分两片（22 + 50 = 72 个包，`--no-sort`，第 2 片同时只跑 2 个包）；桌面端测试从两片加到三片，合计仍是 309 个文件、2978 个用例。
- desktop 的 `main`、`renderer` 两个 vitest project 各用各的 setup 文件，main 的 98 个测试文件不再每个加载一遍 renderer 的 setup，单跑 main 20.0 s → 12.2 s。
- 三片分法让三条用例成了各自分片里第一个加载 `React.lazy` 页面的，那几次 `findBy*` 的等待上限从默认的 1 s 放宽到 10 s，断言不变。
- `ci.yml` 的路径过滤从 `paths-ignore` 改成有序 `paths`，PR 和 `main` 共用一份：只改文档的提交都不触发；原来被 `**/*.md` 一并忽略的 51 个被 CI 读取的 Markdown 改了会触发。必需检查仍然只有不带路径过滤的 `仓库基础检查`。
- `官网` 去掉和 `pnpm typecheck`、包测试重复的两步。
- Browser Bridge：Go 缓存换成自己的 key，`GOCACHE` 导出到整个 job；恢复之后刷新缓存条目的修改时间，因为 go 会删掉 5 天没用过的条目，而恢复出来的文件带着保存那天的时间；locator fixture 的一条断言补上 `timeoutMs`，少等 10 s。这个 job 基线 69 s，缓存命中的五轮是 38–47 s。其中一半不是这次换来的：基线那五天它用的缓存是残缺的，缓存完整时改动前的排法是 40–58 s。
- Agent CLI 工作流拆成打包和进程级测试两个并行 job，163 s → 90–130 s。CodeQL 在 `main` 上按提交分组，连续推送时不再顶掉排队中的那次。
- 发布工作流：macOS / Windows 上不再存 pnpm store（每份近 200 MB，同机对照里恢复它不比现下载快），Go 编译缓存只在 PR 上开；Intel 的 macOS job 开头关掉 Spotlight 索引。
- 实测八轮推送：PR 上 `ci.yml` 整次运行 185 s → 107–142 s（142 s 那一轮和另一条 PR 抢并发名额，最后一个 job 先排了 46 s 的队）；十个 job 的时长加起来 700–927 s，和原来八个 job 的约 860 s 相当，省的是等待时间，不是 runner 用量。
- 账户同时只能跑 20 个 job。一次全部触发从 18 个 job 变成 21 个，会有一个 job 多等十几秒；一般的代码 PR 是 13–15 个，碰不到。上限和各工作流的 job 数写进了 `docs/CICD.md`。
- 八轮里有四轮 `包测试 (2/2)` 是红的，都是改动前就有的失败，由 #83 修，本次没有改这些用例。其中 `tool-shell` 一条 400 ms 时限的用例和 runner 镜像有关：`ubuntu-26.04` 的镜像 11-13 起在换版本，旧镜像上 15 次都通过，新镜像上 10 次失败 6 次。
- 上一轮计划 `20261109-ci-speedup` 一并收尾：补记各 job 时长，移到 `completed/`。

### 🧠 Design Intent (Why)

- 必需检查不动：工作流级的 `paths` 让纯文档 PR 根本不产生 `ci.yml` 的 check，也就没有会卡在 pending 的必需检查；唯一的必需检查 `仓库基础检查` 不带路径过滤。
- 桌面端测试停在三片：最慢的一片、`构建` 和 CodeQL 的 JS 分析已经在同一水平（约 100–145 s），再加一片多占一台 runner，PR 的全部检查跑完的时间也只能降到 CodeQL 的时长。
- 缓存只开读得到、读了也省时间的：一次运行只读得到本分支和 `main` 存的缓存，发布工作流在 macOS / Windows 上存的那 4.4 GB 发版时读不到；pnpm store 恢复出来并不比现下载快，Go 编译缓存小而省时间。
- 不改包测试的排法和用例去追绿：按 runner 镜像版本分组后，失败和怎么分片、怎么排无关；用例的修法 #83 已经有了，在这里再改一遍只会和它冲突。
- 每个结论都拿 CI 上的步骤时间核对过。本地 4 核机器测不出并发调整在 CI 上的代价，也测不出缓存在 CI 环境变量下有没有接上，两处都是推送之后才看出来并改掉的。
- 前后对比除了和基线比，还和同期没带改动的运行比。只和基线比，会把 Browser Bridge 的缓存后来碰巧存全的那一截也算成这次的效果。
- Browser Bridge 恢复缓存之后刷新条目的时间，而不是去改 go 记录上次清理时间的文件：前者只依赖「go 按修改时间清理」这一条。`构建` 和发布工作流每个 job 只跑一条 go 命令，命中发生在清理之前，不加这一步。

### 📚 学习沉淀

- 新建 `docs/learnings/2026-11/actions-cache-who-saves-who-reads.md`：缓存开着、日志里写着命中，都不说明它有用；要核对谁存、谁读、干活的进程读不读、恢复它省不省时间、放了几天之后还在不在。
- 新建 `docs/learnings/2026-11/vitest-shard-count-moves-lazy-cold-load.md`：改片数会换掉每一片里替懒加载页面付冷转译的那条用例；上一轮拆两片时踩过一次，这次是第二次。
- 新建 `docs/learnings/2026-11/runner-image-rollout-mixes-old-and-new.md`：runner 镜像换版的几天里新旧并存，CI 的红绿或耗时变了，先按镜像版本分组再归因。

### 📁 Files Modified

- `.github/workflows/ci.yml`
- `.github/workflows/agent-cli-binaries.yml`
- `.github/workflows/codeql.yml`
- `.github/workflows/release.yml`
- `package.json`
- `scripts/run-script-tests.mjs`
- `scripts/test-browser-locator-runtime.mjs`
- `apps/desktop/vitest.config.ts`
- `apps/desktop/src/main/test/setup.ts`
- `apps/desktop/src/renderer/test/setup.ts`
- `apps/desktop/src/renderer/test/host-feedback.test.tsx`
- `apps/desktop/src/renderer/test/workbench-responsive.test.tsx`
- `apps/desktop/src/renderer/test/conversation-view-tooltip.test.tsx`
- `docs/CICD.md`
- `docs/exec-plans/README.md`
- `docs/exec-plans/completed/README.md`
- `docs/exec-plans/completed/20261113-ci-speedup-round2.md`
- `docs/exec-plans/completed/20261109-ci-speedup.md`
- `docs/exec-plans/tech-debt-tracker.md`
- `docs/exec-runs/20261113-ci-speedup-round2/execution-process.md`
- `docs/exec-runs/20261113-ci-speedup-round2/execution-summary.md`
- `docs/exec-runs/20261109-ci-speedup/execution-process.md`
- `docs/exec-runs/20261109-ci-speedup/execution-summary.md`
- `docs/learnings/README.md`
- `docs/learnings/2026-11/actions-cache-who-saves-who-reads.md`
- `docs/learnings/2026-11/vitest-shard-count-moves-lazy-cold-load.md`
- `docs/learnings/2026-11/runner-image-rollout-mixes-old-and-new.md`
