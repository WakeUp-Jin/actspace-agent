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
| `ci.yml` | `pull_request`（忽略纯文档路径）、`push: main`、手动 | 五个并行 job：`repository-checks`（`scripts/ci.sh` + markdownlint）、`typecheck-test`（contract matrix、Biome lint、typecheck、`pnpm test`）、`build`（`pnpm build`；`main` 上额外跑一次 Linux `release-package.sh` 冒烟，不上传产物）、`site`（check / test / build）、`browser-bridge`（契约检查 + Go 测试）。 |
| `docs.yml` | `pull_request` 且只改 `docs/**`、`*.md` 等文档路径 | `scripts/ci.sh` + markdownlint，与 `ci.yml` 的 `paths-ignore` 互补。 |
| `agent-cli-binaries.yml` | `pull_request` 改到 CLI / packages / 打包脚本时、手动 | 在 CLI 支持的最低 Node 大版本上构建并校验 managed package，artifact 保留 3 天。 |
| `supply-chain-security.yml` | `pull_request` 改到依赖清单 / lockfile / patches 时、每周一定时、手动 | 依赖变更审查（仅 PR）、OSV 扫描。 |
| `codeql.yml` | `push: main`、`pull_request`（均忽略纯文档路径）、每周一定时、手动 | CodeQL `javascript-typescript` 与 `actions` 两种语言，`security-and-quality` 查询集；忽略测试、fixture、dist、生成文件（`.github/codeql/codeql-config.yml`）。不要在仓库设置里同时开启 CodeQL default setup。 |
| `release.yml` | 手动 | 打包 unsigned portable 桌面制品、生成 SBOM / provenance，并创建 GitHub Release。 |
| `site-pages.yml` | 手动 | GitHub Pages 备用部署，不随 `main` 自动发布。 |

`netlify.toml` 是官网默认部署配置；在 Netlify 连接 GitHub 后由 Netlify 构建并发布 `apps/site`，不走 Actions。

所有 PR 触发的工作流都带 `concurrency` 组并 `cancel-in-progress`，同一个 PR 连续推送只保留最后一次；`main` 上的 push 不取消。需要 pnpm 的 job 统一用 `pnpm/action-setup`（读根 `package.json` 的 `packageManager`）加 `actions/setup-node` 的 `cache: pnpm`，store 命中时 `pnpm install` 约 20 秒。

markdownlint 的规则在 `.markdownlint.json`，扫描范围在 `.markdownlint-cli2.jsonc`：第三方 skill 原文（`.agents/skills/**`）、已完成的 history 和测试 fixture 不扫；纯排版类规则（空行、列表周围空行、表格对齐、代码块语言等）关闭，只保留会影响渲染或链接正确性的规则（表格列数、标题层级、重复的兄弟标题、图片 alt、文件末尾换行等）。本地复现用 `npx -y markdownlint-cli2@0.20.0 "**/*.md"`。

分支保护如果要求「必须通过的检查」，不要把 `typecheck-test`、`build` 这类带路径过滤的 job 设为必需——纯文档 PR 不会产生这些检查，会被永远卡住；只把两边都会跑的 `repository-checks` / `docs-checks` 设为必需，或者使用 GitHub 的 merge queue。

### Dependabot

`.github/dependabot.yml` 每周一开一批更新 PR：npm 按「开发依赖的 minor/patch」「运行时依赖的 minor/patch」各合成一个 PR，运行时依赖的 major 单独开 PR 逐个评估，上限 5 个；GitHub Actions 与 Go module 各合成一个 PR。Dependabot 对 SHA pin 的 action 会同时更新 SHA 和版本注释，不会破坏 `check-action-pinning.sh`。两类依赖被排除在自动更新之外：由 `pnpm.overrides` 钉死的 `@deepseek-ai/cordis*`，以及带 `patches/` 补丁的 `@earendil-works/pi-ai`——它们的升级必须连 overrides 或补丁一起手动改。

### 在 GitHub 上重新启用

工作流在 GitHub 上被手动停用后，改文件不会自动恢复。合并本次改动后，到仓库的 **Actions** 页左侧找到 `CI`、`供应链安全`、`发布`，在各自页面点 **Enable workflow**；新文件 `docs.yml`、`codeql.yml` 和 `dependabot.yml` 合入即生效。CodeQL 的结果出现在 **Security › Code scanning**。

当前根命令还包括：

- `pnpm dev`
- `pnpm build`
- `pnpm lint`
- `pnpm typecheck`
- `pnpm test`
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
- `.github/workflows/ci.yml` 中的工程 job（`typecheck-test`、`build`、`site`、`browser-bridge`）都从 `pnpm install --frozen-lockfile` 开始，然后各自执行：
  - `typecheck-test`：先 `apt-get install ripgrep`（`tool-fs-search` 的 grep/glob 测试以子进程调 `rg`，镜像不预装），然后 `pnpm run gen:contract-matrix --check`、`pnpm lint`、`pnpm typecheck`，再构建 `@actspace/agent-cli...`（`test:agent-host:process` 以子进程启动 `apps/cli/dist/cli.js`），最后 `pnpm test`。改到 `agent-contract-matrix.generated.md` 头部 digest 覆盖的源码路径（Runtime 事件、服务、plugin manifest、composition 等声明）时要先跑 `pnpm run gen:contract-matrix` 并提交结果，否则这一步会报 stale。`pnpm lint` 只在 error 级诊断上失败，规则与分层见 `docs/coding-standards/lint-conventions.md`。
  - `build`：`pnpm build`（`agent-cli...` 带依赖闭包，runner 上没有现成的 `dist/`，要先按拓扑顺序构建 workspace 依赖）；在 `main` 上再装 Go 并执行 `./scripts/release-package.sh` 作为打包冒烟，产物不上传。
  - `site`：`check:site`、`test:site` 和 `build:site`，并使用 Netlify 的 `/` base path 验证生产构建；CI 中的 `https://example.com` 仅用于构建检查，不是官网地址。
  - `browser-bridge`：`pnpm check:browser` 与 `go test`。
- `scripts/check-package-cutover.mjs --strict` 会忽略相对导入里的 `plugins/` 片段（如 desktop main 的 `../plugins/plugin-switches`），也不把测试文件里的退役名当作运行时可达边；它要抓的是对退役 workspace `plugins/` 目录和旧包名的真实引用。
- 浏览器客户端 `apps/web` 没有单独的 workflow：`pnpm typecheck`、`pnpm test`（`pnpm -r`）覆盖它的类型检查和 vitest，根 `pnpm build` 在 desktop 之后执行 `@actspace/web build`（依赖 desktop 构建先产出的 `@actspace/client` dist）。`pnpm check:frontend-tokens` 和 `pnpm check:frontend-theme` 同时检查 desktop 与 web 两套前端。web 产物 `apps/web/dist` 目前不打进任何发布包，由用户在 Host 配置的 `webRoot` 指向它。
- workspace 依赖当前允许 `electron` 和 `esbuild` 执行构建脚本；否则 Electron 开发启动无法正确安装运行时。
- 当前桌面端优先跟随较新的稳定 Electron 版本，以降低 macOS 26 这类新系统上的启动兼容风险。
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

1. 继续保留 `repository-checks` 与各工程 job 的分层，避免仓库卫生与工程构建互相遮蔽失败原因。
2. 新增 action 时必须继续 pin 到 commit SHA；`scripts/check-action-pinning.sh` 会拦截浮动 tag。
3. 多平台 release：把 `release.yml` 改成 tag 触发的 macOS / Linux / Windows runner matrix，汇总后创建草稿 Release，并让 provenance 覆盖每个平台产物。计划见 `docs/exec-plans/active/20261108-ci-pipelines.md`。
4. 如果后续接 installer、Developer ID 签名、notarization、远程自动更新，再在现有 release 流水线上扩展。

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

## 默认 release 产物

当前 release 流水线仍会产出：

- `release-manifest.json`
- `actspace-desktop-<platform>-<arch>.tar.gz`
- macOS: `actspace-desktop-darwin-<arch>.dmg`
- `sbom.spdx.json`
- 对 release artifact 生成的 GitHub artifact attestation

`release-manifest.json` 会标明产物平台、架构、archive / dmg 大小，以及 `signed`、`notarized`、`signature`。`signature: "ad-hoc"` 代表本地临时签名，不是 Developer ID 分发签名。当前交付链路产出真实桌面应用 archive 和 macOS 本地安装介质，但不是正式签名分发包。

## 可选 macOS 签名接口

release 脚本默认不要求证书；只有显式提供环境变量时才启用 Developer ID 签名或 notarization：

- `ACTSPACE_MAC_CODESIGN_IDENTITY`：Developer ID Application 证书名称。存在时脚本会执行 `codesign --options runtime --timestamp`。
- `ACTSPACE_MAC_NOTARIZE=true`：启用 notarization；需要同时提供 Developer ID 签名。
- `APPLE_ID`、`APPLE_APP_SPECIFIC_PASSWORD`、`APPLE_TEAM_ID`：notarytool 所需凭据。
- `ACTSPACE_MAC_ADHOC_SIGN=true`：显式启用 ad-hoc signing；脚本会对主 Electron 可执行文件和外层 `.app` 做本地临时签名，避免递归重签 Electron 内置 framework。这不是 Developer ID 分发签名，不提供开发者身份背书，也不等同于 notarization。
