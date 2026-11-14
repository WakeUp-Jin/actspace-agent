# CI 提速第二轮 — 执行摘要

## 执行状态警告

- ⚠️ PR #92 最后一次带工作流改动的推送（第六轮）上，`ci.yml` 是红的：`包测试 (2/2)` 失败在 `tool-shell` 一条 400 ms 时限的用例上。它不是本计划的改动引起的——`main` 最新提交自己的 CI 也红在同一条用例——但在 #83 合入之前，`main` 和所有 PR 的 `包测试` 会越来越常红。建议先合 #83。详见「已知风险和遗留事项」第一条。

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261113-ci-speedup-round2.md`
- **执行过程**：`docs/exec-runs/20261113-ci-speedup-round2/execution-process.md`
- **执行模式**：夜间
- **执行结果**：完成——改动在 PR #92 上，没有合并。PR 上的路径推送了六轮并逐轮核对；`main` 上的路径、手动触发和「只改文档不触发」在 PR 上跑不到，要合并后人工看一眼，见「人工验证指引」。

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| `pnpm build` 不再把同一批包构建两遍 | `package.json`（`build`、新增 `build:cli-web`）、`.github/workflows/ci.yml` 的 `build` | 原来先编 CLI 的依赖闭包，desktop 的 `build` 再 `clean` 重编一遍。改成先构建 desktop，再只补它没覆盖的包。`main` 上的 `构建` 换成打包冒烟加 `build:cli-web`，desktop 只编一遍。 |
| 根目录脚本测试并行 | `package.json`（`test:scripts`）、`scripts/run-script-tests.mjs`（新） | 19 条串行的 `test:*` 换成一次 `node --test`，跑的还是那 28 个文件和 5 条 `check:*`。 |
| 包测试分两片 | `.github/workflows/ci.yml` 的 `test-packages` | 按目录分，清单只列第 1 片、第 2 片取反；`--no-sort`；第 2 片同时只跑 2 个包。 |
| 桌面端测试从两片加到三片 | `.github/workflows/ci.yml` 的 `test-desktop`、`apps/desktop/src/renderer/test/` 下三个测试文件 | 三条用例成了各自分片里第一个加载懒加载页面的，等待上限从默认的 1 s 放宽到 10 s，断言不变。 |
| desktop 两个 vitest project 各用各的 setup | `apps/desktop/vitest.config.ts`、`apps/desktop/src/main/test/setup.ts`（新）、`apps/desktop/src/renderer/test/setup.ts` | main 进程的 98 个测试文件不再每个加载一遍 renderer 的 setup。 |
| 路径过滤改成有序 `paths` | `.github/workflows/ci.yml` | PR 和 `main` 共用一份规则，只改文档的提交都不触发；被 CI 读取的 51 个 Markdown 不再被忽略。 |
| `官网` 去掉重复的检查和测试 | `.github/workflows/ci.yml` 的 `site` | `astro check` 已在 `pnpm typecheck` 里，单元测试已在包测试里。 |
| Browser Bridge 的 Go 缓存接上 | `.github/workflows/ci.yml` 的 `browser-bridge` | 自己的缓存 key；`GOCACHE` 导出到整个 job，脚本和测试里自己起的 `go` 也用恢复的缓存。 |
| Agent CLI 工作流拆成两个并行 job | `.github/workflows/agent-cli-binaries.yml` | 进程级测试不读打出来的包，不用排在打包后面；触发路径补上它跑的测试文件。 |
| CodeQL 在 `main` 上按提交分组，issue 模板不触发 | `.github/workflows/codeql.yml` | 原来按分支分组，连续推送时排队中的那次会被顶掉。 |
| 发布工作流在 macOS / Windows 上不再存 pnpm store，Go 编译缓存只在 PR 上开 | `.github/workflows/release.yml` | 这三个平台的缓存发版时读不到；PR 上读得到，但 pnpm store 每份近 200 MB，恢复它不比现下载快，没命中时还要花 8–54 s 存。Go 缓存每份 14 MB，命中一次省 7–18 s，留在 PR 上。Linux 照旧。 |
| 发布工作流在 Intel 的 macOS job 开头关掉 Spotlight 索引 | `.github/workflows/release.yml` | 依赖刚装完时 Spotlight 在给新写的文件建索引，同机对照里紧接着的 desktop 构建因此慢 20–42 s。arm64 上测不出差别，不加。这一步允许失败、限时 1 分钟，不挡打包。 |
| 文档 | `docs/CICD.md`、`docs/exec-plans/`、`docs/learnings/2026-11/`（三篇新文章） | 工作流表、路径过滤、各 job 说明；上一轮计划收尾。 |

## 实测对比

PR 上各 job 的时长（秒，不含排队）。基线是改动前最近 50 次运行里 PR 上成功 job 的中位数和范围；后六列是 PR #92 的六轮推送，带 `*` 的是那一轮失败的 job。

| job | 基线 | 第一轮 | 第二轮 | 第三轮 | 第四轮 | 第五轮 | 第六轮 |
|---|---|---|---|---|---|---|---|
| Lint 与类型检查（没改） | 66（53–73） | 83 | 72 | 52 | 83 | 60 | 56 |
| 仓库脚本与进程级测试 | 117（109–129） | 82 | 77 | 80 | 90 | 72 | 69 |
| 包测试 | 144（126–190） | 98 / 74* | 110 / 76* | 78 / 87 | 107 / 98 | 88 / 87 | 104 / 94* |
| 桌面端测试 | 每片 138（108–180） | 126 / 82 / 113 | 116 / 128* / 102 | 85 / 115 / 112 | 119 / 129 / 87 | 97 / 116 / 78 | 94 / 133 / 92 |
| 构建 | 150（117–186） | 86 | 109 | 118 | 125 | 117 | 103 |
| Browser Bridge | 70（54–89） | 60 | 79 | 57 | 38 | 42 | 38 |
| 官网 | 38（32–48） | 34 | 36 | 58 | 51 | 27 | 31 |
| `ci.yml` 整次运行 | 185（160–193） | 129 | 131 | 120 | 131 | 130 | 136 |
| Agent CLI 整次运行 | 163 | 102 | 108 | 105 | 118 | 117 | 120 |
| CodeQL 整次运行（没改分析本身） | 130 | 141 | 123 | 124 | 146 | 127 | 130 |

读这张表要注意三点：

- 同一步骤在不同 runner 上能差 1.5–2 倍（基线里没改过的 Typecheck 是 25–53 s）。六轮的数字是范围，不是定值；`Lint 与类型检查`、`官网` 这类没怎么改的 job 忽高忽低就是这个原因。
- `ci.yml` 整次运行降了约三成，十个 job 的时长加起来却和原来八个差不多（基线约 860 s，六轮 838 / 905 / 842 / 927 / 784 / 814 s）：去掉重复工作省下的时间，大致等于多出来的三个分片各自的环境准备。换来的是等待时间，不是 runner 用量。
- PR 的全部检查什么时候跑完，由 CodeQL 的 JS 分析（121–144 s）和 `ci.yml` 最慢的 job（117–133 s）共同决定。

`main` 上的 `ci.yml` 改动前是 279 s（256–308 s），其中 `构建` 253–305 s。新路径只在本地跑过（打包冒烟 82 s 加 `build:cli-web` 6 s）；按基线里打包冒烟那一步在 CI 上的耗时（109–133 s）推算，`构建` 约 150–170 s，这是估算，没有实测。

发布工作流四个平台的 job 时长（秒）。它只在改到打包文件的 PR、`v*` tag 和手动触发时跑；本 PR 每次推送都会触发它。

| 平台 | 改动前 13 次：中位数（范围） | 六轮 |
|---|---|---|
| darwin-x64 | 475（371–785） | 695 / 790 / 536 / 642 / 651 / 443 |
| darwin-arm64 | 314（154–377） | 340 / 341 / 205 / 325 / 295 / 219 |
| windows-x64 | 261（198–300） | 205 / 226 / 310 / 275 / 291 / 268 |
| linux-x64 | 133（99–166） | 140 / 126 / 163 / 151 / 136 / 128 |

前四轮 macOS / Windows 不带任何缓存，第五轮起 PR 上带 Go 编译缓存，第六轮起 darwin-x64 先关 Spotlight。这张表说明不了这几处改动的效果：发布 job 的时长主要看分到哪台 runner，六轮的差别比任何一处改动都大。几处改动的依据是历史运行按缓存命中与否的分组和同一台 runner 上的对照实验，见执行过程步骤 13、15。

## 人工验证指引

### 必须验证

1. **合并后第一次 `main` 运行里的 `构建`**
   - 验证方式：Actions 页打开那次 `CI` 运行的 `构建` job。
   - 预期结果：`Build` 被跳过；`actions/setup-go`、`Package desktop (smoke)`、`Build CLI and Web` 三步都执行并通过。job 时长应明显短于改动前的 253–305 s。

2. **只改文档的 PR 不触发 `ci.yml`，也不卡合并**
   - 验证方式：开一个只改 `docs/` 下某个普通文档的 PR。
   - 预期结果：只有 `仓库基础检查` 运行，没有处于 pending / Expected 的检查，审批后可以合并。再改一下 `docs/roadmap.md`，`CI` 应该被触发（官网读它）。

3. **`main` 上只改文档的 push 不触发 `ci.yml`**
   - 验证方式：上面那个 PR 合并后看 Actions 页。
   - 预期结果：这个提交只有 `仓库基础检查` 的运行（CodeQL 原来就不被纯文档提交触发）。

### 建议验证

1. **Browser Bridge 的缓存在 `main` 上保存并被 PR 读到**
   - 验证方式：合并后第二次 `main` 运行、以及之后任意一个 PR 里，看 `Browser Bridge` job 三个步骤的耗时。
   - 预期结果：`Browser Bridge Go tests` 和 `Browser Bridge cross-compile` 各一两秒，`Browser Bridge contract checks` 约 15 s。runner 镜像升级 Go 补丁版本的那几天会有一两次回到三四十秒，属于正常。

2. **下一次发版**
   - 验证方式：打 `v*` tag 后看 `发布` 工作流四个平台。
   - 预期结果：Linux 命中 pnpm 和 Go 缓存；macOS / Windows 不恢复也不保存缓存；darwin-x64 的第一步 `关闭 Spotlight 索引` 输出三行 `Indexing disabled.`（这一步即使失败也不会让 job 失败，要点开看）；各平台时长在以前的范围内。

3. **缓存占用回落**
   - 验证方式：`gh api repos/WakeUp-Jin/actspace-agent/actions/cache/usage`，或 Actions › Caches 页。
   - 预期结果：现在是 10.5 GB，其中约 4.6 GB 是各个 PR 以前在 macOS / Windows 上存的 pnpm store 和 Go 缓存；它们 7 天没人读就会被清掉。之后这三个平台只有改到打包文件的 PR 会各存一份 14 MB 的 Go 缓存。

## Agent 已完成的验证

- 测试和检查一条没少：`test:scripts` 新旧都是 28 个测试文件加 5 条 `check:*`，131 个用例；包测试两片合起来是原来的 72 个包；桌面端三片合计 309 个文件、2978 个用例，和分片前一致；`官网` 去掉的两步分别对应 `pnpm typecheck` 和包测试里的同一条命令。
- `pnpm build` 新旧顺序在干净检出下各构建一次，2600 个产物文件除每次都会变的 `apps/web/dist/sw.js` 外哈希相同；`main` 路径本地按步骤跑通。
- 路径过滤：按 GitHub 的有序 `paths` 语义对全部 4851 个已跟踪文件求值，新规则忽略的 1888 个是旧规则 1939 个的子集，少掉的 51 个都是被 CI 读取的文件。
- 懒加载等待：删掉 vitest 结果缓存后逐条用例对比两片和三片，受影响的正好三条；限到 2 核和 1 核模拟慢 runner，放宽后都通过。放宽后 CI 上的四轮（第三到第六轮）里这三条用例最长 1471 ms，都通过。
- Browser Bridge：把 `ci.yml` 里这个 job 的步骤原样导出来在本地跑，缓存命中时 `apps/cli` 的测试 0.5 s、临时缓存目录不再出现；CI 上第四到第六轮实测 0.9–1.6 s，三步 13–15 / 1–2 / 1–2 s。
- 发布工作流：macOS / Windows 的 Go 缓存第五轮保存、第六轮三个平台都读到，浏览器桥 Go 组件从 22 / 9 / 18 s 降到 4 / 4 / 7 s；关 Spotlight 那一步第六轮在 darwin-x64 上约 1 s 完成。pnpm store 和 Spotlight 两处各在同一台 macOS runner 上做了交替对照（一条只带临时工作流的分支，做完已删）。
- PR 上第三到第五轮六个工作流全部通过。第一轮和第六轮各有一个 job 失败、第二轮两个，原因见「已知风险和遗留事项」第一条和执行过程步骤 8、16。
- `./scripts/ci.sh`、`pnpm lint`、`pnpm check:docs`、markdownlint、`actionlint`、`./scripts/check-action-pinning.sh` 通过。

## 已知风险和遗留事项

- **`包测试` 在 #83 合入前会随机变红，而且会越来越常见。** 六轮里第一、二、六轮的 `包测试 (2/2)` 是红的。三种失败都不是本计划引入的，#83 都在修，本计划没有改这些用例，避免和它冲突：
  - `packages/shell/tool-shell` 的 `node-ports.test.ts` 里一条 400 ms 时限的用例（第二、六轮）。它和 runner 镜像有关：`ubuntu-26.04` 的镜像 11-13 起在换版本，新旧同时在发。旧镜像上 15 次都通过；新镜像上 7 次失败 5 次，改动前的排法在新镜像上也是 4 次失败 3 次，包括 `main` 最新提交自己的运行。新镜像上起一条 bash 命令多 50–130 ms，时限没有余量。分片、排法、并发都不是原因，CI 这一侧没有可调的。
  - `packages/subagent` 的 `external.test.ts`（第一轮）和 `SessionHandle is closed` 的未处理错误：#90 合入后才出现的竞态，和镜像无关。第 2 片同时只跑 2 个包之后的五轮里它们没有再出现（同期默认并发的 8 次里出现 4 次；本地 22 轮对比是 5 次对 0 次），但五轮里有两轮在上面那条用例上提前停了，样本太小，不能当成已经消掉。
  - #90 合入后、没带 #83 修复的 `包测试`，`main` 和别的分支 7 次里红了 6 次。11-14 手头的 26 个 `ubuntu-26.04` job 里 22 个已经是新镜像。
- **再改桌面端测试的片数要重新找「第一个」。** 每一片里第一个打开懒加载页面的用例要替整棵模块树付冷转译，片数一改就换一条。办法见 `docs/learnings/2026-11/vitest-shard-count-moves-lazy-cold-load.md`。
- **与 #83 有文本冲突。** 冲突在 `ci.yml` 的 `on:` 块、job 的 `name:` 行和 `docs/CICD.md`。#83 先合的话：本 PR 的 `ci.yml` 去掉 `pull_request.paths`，把收窄后的规则搬进它的 `变更范围` job，`push.paths` 保留；本 PR 先合的话反过来由 #83 处理。两边都没有改 job id。
- **`main` 上只改文档的提交没有 `ci.yml` 的运行。** 要看它的代码是否通过，看它前面最近一个有运行的提交。一次改动超过 300 个文件、排在前面的又全是文档时工作流不会触发，要手动运行。
- **Browser Bridge 的缓存 key 带 Go 的补丁版本。** `go.mod` 只写到 `1.26`，runner 镜像滚动升级的几天里新旧两版并存，各要冷跑一次。把版本固定到补丁号可以避免，但之后要有人跟着升，没有做。
- **发布工作流的时长仍然主要看分到哪台 macOS runner。** 六轮里 darwin-x64 是 443–790 s，其中 desktop 构建 141–271 s，另有两轮各排了五分钟的队才拿到 runner。本计划对它的三处改动都小于这个波动：
  - pnpm store 不恢复没有代价：同机对照里「还原加安装」76 s，「现下载安装」79.5 s。
  - Go 缓存在 PR 上命中一次省 7–18 s（改动前 13 次运行按命中与否分组的中位数；第六轮三个平台实测省了 18 / 5 / 11 s）。发版的 tag 运行读不到它，Go 组件和以前一样从头编。
  - 关 Spotlight 在 Intel 上估计省几十秒，给不出更准的数。实验前定的标准是两个 job 都平均快 10% 以上，实际是 7% 和 17%，有一个没达到。第六轮 darwin-x64 是六轮里最快的一次，但没加这一步的 darwin-arm64 同一轮也快，只能算旁证。
- **Agent CLI 的进程级测试只在 PR 上跑。** 这个工作流原来就没有 `push: main` 触发，本计划没有改。
- **逐包构建还在。** `构建`、`pnpm package:agent-cli` 和发布的每个平台都要逐包 `clean` 加 `tsc`，CI 上 39–60 s。换成 `tsc -b` 要动发布链，登记在 `docs/exec-plans/tech-debt-tracker.md`。

## 后续建议

- 建议先合 #83，再合本 PR，本 PR 按上面的办法解冲突。#83 合入之前本 PR 的 `包测试 (2/2)` 仍可能是红的；红在哪条用例，可以对照「已知风险和遗留事项」第一条。
- runner 镜像换版的那几天，CI 的红绿或耗时变了先按镜像版本分组，见 `docs/learnings/2026-11/runner-image-rollout-mixes-old-and-new.md`。
- 想让 PR 的全部检查再快，下一个要动的是 CodeQL 的 JS 分析（提取 35 s、203 条查询 65 s），不改查询集没有可砍的；其次是桌面端测试加到四片（本地最长的一片只短 12%）。两者现在在同一水平，只动一个没有效果。
- `test:scripts` 以后新增的测试文件放进 `scripts/test/` 就会被跑到，不用再登记到 `package.json`。
