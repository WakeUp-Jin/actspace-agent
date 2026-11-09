# CI 重新上线与桌面发布流水线 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261108-ci-pipelines.md`
- **执行模式**：交互
- **开始时间**：2026-11-08 10:30
- **结束时间**：P1–P3 2026-11-08 13:40（PR #48）；P4 2026-11-08 14:30（PR #57）；P5 2026-11-08 17:30（第三个 PR）

## 执行时间线

### 步骤 1：确认费用前提，决定不再「怕超额」

- **操作**：用 `gh repo view` 确认仓库是 public；查 GitHub Actions 计费规则。
- **决定**：public 仓库在标准 GitHub 托管 runner 上不计分钟数，只有 larger runner 和 artifact / Packages 存储（Free 500 MB）有配额。所以设计目标从「少跑」改成「快出结果、不浪费存储」：PR 并发取消、短 artifact 保留期、发布产物走 GitHub Release 而不是 artifact。
- **验证**：`docs/CICD.md` 新增「费用前提」一节。

### 步骤 2：修掉让 CI 必红的既有问题（P1）

- **操作**：在干净 `main` 上本地跑 `./scripts/ci.sh`、`pnpm test`、`pnpm run test:package-cutover`、`pnpm run package:agent-cli`，把失败项逐个归因。
- **影响文件**：
  - `scripts/package-agent-cli.mjs`：离线 deploy 失败后重试前 `rm -rf packageRoot`，否则 pnpm 报 `ERR_PNPM_DEPLOY_DIR_NOT_EMPTY`。
  - `apps/desktop/src/main/test/remote-host-registry.test.ts`：`safeStorage` mock 补 `getSelectedStorageBackend`。
  - `apps/desktop/src/main/test/surface-derived-equivalence.test.ts`：golden 是在 +08:00 生成的，测试里固定 `process.env.TZ = "Asia/Shanghai"`。
  - `apps/desktop/src/renderer/test/turn-tail.test.tsx`：docs 标签文案已改为「MD 文档」，更新断言。
  - `apps/desktop/src/renderer/test/setup.ts`：`GIT_CONFIG_GLOBAL=/dev/null`、`GIT_CONFIG_NOSYSTEM=1`，隔离开发机全局 git 配置。
  - `scripts/check-package-cutover.mjs`：`genericPlugins` 先剥掉相对导入再匹配；`retiredPaths` 跳过测试文件；`/eval` 只匹配路径形式。
- **决定**：git 测试超时的根因是开发机全局 `core.fsmonitor=true`，git 会为每个临时仓库拉起 fsmonitor 守护进程并继承 stdio 管道，`execFile` 要等它退出。修在测试 setup 而不是产品代码，产品侧风险记入技术债。
- **验证**：git 相关 25 个测试从超时变为约 2 秒通过；desktop 全量 2800 通过、1 个是开发机 nvm 告警导致的既有失败（见「遇到的问题」）；`check-package-cutover --strict` 0 findings。

### 步骤 3：拆分并加速工作流（P2）

- **操作**：
  - `ci.yml` 改成五个并行 job（`repository-checks`、`typecheck-test`、`build`、`site`、`browser-bridge`），PR 用 `paths-ignore` 跳过纯文档改动，`main` push 时 `build` 额外跑一次 Linux `release-package.sh` 冒烟（不传产物）。
  - 新增 `docs.yml`，`paths` 与 `ci.yml` 的 `paths-ignore` 互补。
  - 所有 PR 工作流加 `concurrency`，`cancel-in-progress` 只对 PR 生效。
  - pnpm 统一用 `pnpm/action-setup`（读 `packageManager`）+ `actions/setup-node` `cache: pnpm`。
  - `agent-cli-binaries.yml` 加缓存，artifact 保留期 3 天。
  - `supply-chain-security.yml` 只在依赖清单 / lockfile / patches / go.mod 变更时跑，加每周一定时。
  - `build` job 加 `actions/setup-go`（`go-version-file: browser-bridge/apps/cli/go.mod`），因为打包会 `go build` 浏览器桥 CLI。
- **影响文件**：`.github/workflows/ci.yml`、`docs.yml`（新）、`agent-cli-binaries.yml`、`supply-chain-security.yml`。
- **验证**：`actionlint` 全部通过；`scripts/check-action-pinning.sh` 通过；本机 `GOTOOLCHAIN=go1.26.10 ./scripts/release-package.sh` 生成 `dist/actspace-desktop-linux-x64.tar.gz`。

### 步骤 4：让 markdownlint 能绿

- **操作**：`repository-checks` 的 markdownlint 步骤在历史运行里一直是红的。本地复现 `npx markdownlint-cli2 "**/*.md"`，先因为扫进嵌套 `node_modules` OOM，加 `.markdownlint-cli2.jsonc` 后拿到 4473 条错误，按规则和目录统计。
- **决定**：
  - 不扫第三方 skill 原文（`.agents/skills/**`）、已完成的 history、测试 fixture。
  - 关掉纯排版类规则（MD012 / MD022 / MD028 / MD029 / MD031 / MD032 / MD034 / MD036 / MD037 / MD038 / MD040 / MD050 / MD060），这些占 98% 且不影响渲染；MD024 改为只查兄弟标题。
  - 剩下 45 处真实问题手工修：表格里代码段内的 `|` 转义、第二个 H1 降级、H1 下直接 H3 的三个节升为 H2、同级重复标题改名、图片补 alt、标题去尾部冒号、行尾空格与文件末尾换行、`docs/SECURITY.md` 的畸形嵌套列表。
- **影响文件**：`.markdownlint.json`、`.markdownlint-cli2.jsonc`（新）、`docs/SECURITY.md`、4 篇 `apps/site` 博客、7 份 exec-plans / exec-runs / learnings / design-docs。
- **验证**：`markdownlint-cli2 "**/*.md"` 1106 文件 0 错误。

### 步骤 5：依赖安全与自动化（P3）

- **操作**：`dompurify` ^3.4.17、`undici` ^7.30.1（lockfile 解析到 7.30.2）；新增 `.github/dependabot.yml`（npm 两个分组 + Actions + Go module，排除 overrides 钉死的 `@deepseek-ai/cordis*` 与带补丁的 `@earendil-works/pi-ai`）；新增 `codeql.yml` + `.github/codeql/codeql-config.yml`（`javascript-typescript` 与 `actions`，`security-and-quality`，忽略测试 / fixture / dist / 生成文件）。
- **验证**：`pnpm audit --prod` 只剩 `katex` 一条 low（记入技术债）；`actionlint` 通过。

### 步骤 6：文档同步

- **操作**：`docs/CICD.md` 重写工作流表、费用前提、并发与缓存说明、分支保护提醒、markdownlint 范围、Dependabot、重新启用步骤；`docs/exec-plans/README.md` 加进行中条目；`tech-debt-tracker.md` 加「CI 与工程化遗留」；写本执行文档与 history。

### 步骤 7：PR 首次在 GitHub 上跑出的问题

- **操作**：推送后 PR 上没有任何 Actions 运行；查 `mergeable` 是 `CONFLICTING`——期间 `main` 合入了 Biome lint（改了 `ci.yml`、`docs/CICD.md`、`package.json`、lockfile）。GitHub 对无法生成 merge ref 的 PR 不触发 `pull_request` 工作流。rebase 到最新 `main`，把 `pnpm lint` 放进 `typecheck-test` job。
- **操作**：rebase 后 `文档` 工作流在 `scripts/ci.sh` 失败：`check-secrets.sh` 需要 `rg`，`ubuntu-latest` 不预装。`repository-checks` / `docs-checks` 加一步 `apt-get install ripgrep`。
- **操作**：`Agent CLI managed package` 过了打包（证明 P1 的 deploy 目录修复有效），但 `agent-cli-safety.test.mjs` 的两个 resume 用例失败：断言 resume 只发一次模型请求，而 2026-11-03 后台任务 S2 的设计是重开会话时把遗留任务补成 `lost` 并提醒模型，于是 resume 先跑一个交付 `lost` 通知的 Run，再跑新任务。在 `main` 上同样失败，只是之前被打包失败挡住。按设计更新断言（两次请求、三个 finish、`user/message` 仍是 2），本地连跑三次稳定。
- **影响文件**：`.github/workflows/ci.yml`、`docs.yml`、`scripts/test/agent-cli-safety.test.mjs`、`docs/CICD.md`。
- **验证**：`pnpm test:agent-cli:process` 19/19；`pnpm lint` 通过；CodeQL 在 PR 上 JS/TS 1 分 41 秒、Actions 50 秒。

### 步骤 8：桌面发布矩阵（P4，第二个 PR）

- **操作**：`release.yml` 重写：`push` 到 `v*` tag、`workflow_dispatch`（可选 `tag`）、改到打包脚本的 `pull_request` 三种触发；`package` job 四平台矩阵（`macos-latest` arm64、`macos-15-intel` x64、`ubuntu-latest`、`windows-latest`，`shell: bash`），先校验 tag 等于 `v` + `apps/desktop/package.json` 版本，再 `setup-go`（`go-version-file`）+ pnpm 缓存 + `release-package.sh`，非 PR 时生成 attestation 并上传完整产物（tag 时保留 1 天），PR 只传 manifest；`release` job 下载全部、`anchore/sbom-action` 出 SBOM、`node -e` 把四份 manifest 合成 `release-manifest.json`，`softprops/action-gh-release` 建草稿。
- **操作**：`release-package.sh` 把 `uname -s` 的 `MINGW*/MSYS*/CYGWIN*` 映射为 `windows`；新增 `windows)` 分支（复制 Electron runtime、`electron.exe` → `ActSpace.exe`、应用放 `resources/app`）；Windows 产物用 `7z` 打 zip，没有 7z 时用 Windows 自带的 bsdtar（`tar.exe -a`）；manifest 改名 `release-manifest-<platform>-<arch>.json` 以便四个平台不互相覆盖。
- **操作**：`package-browser-components.mjs` 的「必须在 dist 下」检查改用 `path.relative`，manifest 文件键统一 `/` 分隔符，否则 Windows 上 `verify-browser-components.mjs` 要求的 `bin/abb` 键匹配不上。
- **影响文件**：`.github/workflows/release.yml`、`scripts/release-package.sh`、`scripts/package-browser-components.mjs`、`docs/CICD.md`、计划、技术债表。
- **验证**：`actionlint` 与 `check-action-pinning.sh` 通过；Linux 本机 `GOTOOLCHAIN=go1.26.10 ./scripts/release-package.sh` 生成 `actspace-desktop-linux-x64.tar.gz` 与 `release-manifest-linux-x64.json`；macOS / Windows 分支靠 PR 上的四平台 dry-run 验证。
- **操作**：PR 首轮 dry-run：darwin-arm64、linux-x64 通过；windows-x64 在 `go build` 浏览器桥 CLI 时失败——`instance_registry.go` 用 `syscall.Stat_t` 判断文件属主，Windows 没有这个类型。拆成 `instance_registry_unix.go` / `instance_registry_windows.go`（Windows 实现恒为 `false`，只保证能编译），并在 `ci.yml` 的 `browser-bridge` job 加 Windows / macOS 交叉编译步骤，让这类问题在 CI 快检里就暴露。
- **操作**：rebase 到合入 #54（Dependabot action 升级）/ #55（基线修复）后的 `main`，新 `release.yml` 套用升级后的 action 版本。`Browser Bridge` job 在 `main` 上仍因 `main.go` 的 dev host 构建默认 `GOCACHE=/private/tmp/abb-go-cache`（macOS 专属路径）失败，改为 `filepath.Join(os.TempDir(), "abb-go-cache")`，与 #55 对 `check-browser-command-registry.mjs` 的修法一致。
- **操作**：第三轮 dry-run：`darwin-x64` 在 `hdiutil create` 报 `Resource busy`（GitHub macOS runner 的已知偶发），脚本加最多 5 次重试；`windows-x64` 在「Browser components verified」之后静默 36 分钟没有产出 zip，被下一次推送取消——打包步骤最后一步是压缩，怀疑 `command -v 7z` 没命中、退到了 PowerShell `Compress-Archive`（20k 文件时慢到以小时计）。改成 7z / Windows bsdtar 两选一、都传原生 Windows 路径、不再静默输出；脚本各阶段打时间戳；`release.yml` 的 package job 加 45 分钟超时。
- **操作**：第四轮 dry-run 的阶段日志显示 `archive via 7z` 之后 21 分钟无输出。根因不是 7z 没找到，而是 pnpm deploy 目录里有 2249 个符号链接（Windows 上是 junction）：`node_modules/<pkg>` → `.pnpm/...`，7z 跟着 junction 走，在循环依赖里无限递归。Windows 的 deploy 改用 `--config.node-linker=hoisted`（本机 Linux 验证：只剩 `.bin` 链接，Windows 上它们是 `.cmd` 文件；`check-provider-proxy-package.mjs` 通过；391 MB / 35k 文件），并在 windows 分支加「发现链接就失败」的守卫。第五轮 dry-run 四平台全绿：Linux 1.5 分钟、Windows 4.5 分钟（zip 180 MB）、macOS arm64 6 分钟、macOS x64 8.5 分钟。
- **操作**：`main` 基线上 `类型检查与测试` 的 `Test` 步骤仍红：`test:agent-host:process` 等进程级测试 spawn `apps/cli/dist/cli.js`，runner 上没有 dist。`typecheck-test` job 在 `pnpm test` 前加 `pnpm --filter '@actspace/agent-cli...' build`。补上之后进程级测试全过，暴露出被挡在后面的下一个：`apps/web` 的 `output-download.test.ts` 第一个用例在 runner 上超 5s（本机 11 个用例共 0.85s；CI 上 29 个 vitest 文件并行、jsdom 环境冷启动），给该用例设 20s 超时。再下一个：`packages/fs/tool-fs-search` 的测试直接调 `rg`，`typecheck-test` job 没装 ripgrep，`grep` 全部返回 No matches。给该 job 也加 `apt-get install ripgrep`。

## 遇到的问题

- **问题**：`apps/desktop/src/main/test/runtime-v2-output-reference-flow.test.ts` 在本机失败。
  - **原因**：测试对 `bash -lc` 输出按行数断言；本机 nvm 在 login shell 启动时打印 `npm_config_prefix` 告警，多出两行。GitHub runner 没有这个告警。
  - **应对**：不在本轮修，记入技术债。
- **问题**：本机 `release-package.sh` 先后报 Go 工具链版本不够、`Electron runtime not found`。
  - **原因**：VM 预装 go1.22 而 `go.mod` 要求 1.26；`apps/desktop/node_modules/electron` 的 postinstall 没跑。
  - **应对**：本机用 `GOTOOLCHAIN=go1.26.10` 并手动 `node install.js`；CI 里 `build` job 加 `actions/setup-go`，Electron 由 `pnpm install` 的 postinstall 处理。

### 步骤 9：P5 Electron 39 → 45

- **开始时间**：2026-11-08 16:40
- **目标**：`apps/desktop` 升到当前 stable Electron，desktop 全量测试与 Linux 打包通过。
- **操作**：`pnpm add -D electron@^45.2.3`（Node 24.22.2 / Chromium 156）；通读 Electron 40–45 的 `breaking-changes.md`，逐条对照仓库：
  - 42 起 npm 包不再 postinstall 下载二进制：`pnpm install` 后没有 `node_modules/electron/dist`。开发启动的 `run-electron-dev.mjs` 走 `require("electron")` 会自动下载；`release-package.sh` 直接 `cp` 这个目录，补一步 `node -e 'require("electron")'` 按需拉取。
  - 44 clipboard 重构成 W3C 风格：`writeImage` 没了，`artifact-context-menu-service.ts` 改成 `clipboard.write([new ClipboardItem({ "image/png": new Blob([image.toPNG()]) })])`；`writeText` 变 Promise，三处 click 都包进 `runMenuAction` 以免 unhandled rejection。两处测试 mock 同步改。
  - 45 沙箱 preload 去掉 `Buffer` / `setImmediate` / `require("events"|"url"|"timers")`：检查 `dist-electron/preload/index.bundle.js`，只 `require("electron")`，没有这些全局，不用改。
  - 45 弃用 `safeStorage` 同步方法：`SecretCrypto` 接口与 `HostCredentials` 都在用，46 才移除，记 tech debt。
  - 44 去掉 macOS 12 / Windows 32 位；43 对话框默认目录改 Downloads；44 renderer 不再有 `clipboard` 模块（renderer 没用过）。记进 `docs/CICD.md`。
- **问题**：升级后 renderer 类型检查报 `findLastIndex` / `Object.groupBy` 不存在。
  - **原因**：`tsc --explainFiles` 对比发现，es2023/2024 lib 之前是由 `type-fest@0.13.1` 的 `/// <reference lib="esnext"/>` 带进来的；这个包是 Electron 39 安装器 `@electron/get@2` → `global-agent` → `roarr` 的间接依赖，被 mermaid 的 d.ts（把 `type-fest` 放在 devDependencies 却在类型里 import）误引到。Electron 45 的 `@electron/get@5` 不再依赖它。
  - **应对**：`apps/desktop/tsconfig.json` 的 `lib` 从 ES2022 改为 ES2024，把真实依赖写明。
- **验证**：`pnpm --filter @actspace/desktop typecheck`、desktop 303 个测试文件全过（2897 个用例）、Linux `release-package.sh` 全程通过（先删 `node_modules/electron/dist`，确认按需下载那一步真的跑到）。解包产物在 `xvfb-run` 下带 `--remote-debugging-port` 启动，CDP 读到 `window.actspace` 桥和侧栏文案，主进程日志 `runtime v2 ready` 无错误。

## 跳过或推迟的事项

- `safeStorage` 同步方法改异步：Electron 45 只弃用、46 移除，`SecretCrypto` 调用链较长，单独做。
- CodeQL 加 Go：先看 JS/TS 分析耗时。
- `katex` 升级：留给 Dependabot。
