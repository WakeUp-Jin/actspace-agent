## [2026-11-08 14:30] | Task: 桌面发布矩阵：v* tag 触发四平台打包 + 草稿 Release，release-package.sh 补 Windows

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux VM)`

### 📥 User Query

> 按计划 docs/exec-plans/active/20261108-ci-pipelines.md：P4 是 release.yml 改成 v* tag 触发的 macOS arm64 / x64、Linux、Windows 矩阵 + 草稿 Release，并给 release-package.sh 补 Windows 分支。那么我们继续接下来的任务吧。

### 🛠 Changes Overview

**Scope:** `.github/workflows/release.yml`、`scripts/release-package.sh`、`scripts/package-browser-components.mjs`、`docs/`

**Key Actions:**

- **`release.yml` 重写**：`push` 到 `v*` tag、`workflow_dispatch`（可选 `tag`）、改到打包脚本的 `pull_request` 三种触发。`package` job 四平台矩阵（`macos-latest` arm64、`macos-15-intel` x64、`ubuntu-latest` x64、`windows-latest` x64），统一 `shell: bash`；第一步校验 tag 等于 `v` + `apps/desktop/package.json` 版本；`actions/setup-go` 按 `go.mod` 装 Go；非 PR 时生成 artifact attestation 并上传完整产物（tag 时保留 1 天），PR 只上传各平台 manifest。`release` job 下载全部产物、`anchore/sbom-action` 出 SBOM、把四份 manifest 合成 `release-manifest.json`，`softprops/action-gh-release` 创建**草稿** Release。
- **`release-package.sh` Windows 分支**：`uname -s` 的 `MINGW*/MSYS*/CYGWIN*` 映射为 `windows`；复制 Electron runtime，`electron.exe` 改名 `ActSpace.exe`，应用放 `resources/app`；用 `7z` 打 zip，缺 7z 时用 Windows 自带 bsdtar（PowerShell `Compress-Archive` 对 2 万个文件慢到以小时计，不作为回退）；manifest 改名 `release-manifest-<platform>-<arch>.json`，四个平台不再互相覆盖。
- **`package-browser-components.mjs`**：输出目录「必须在 dist 下」的检查改用 `path.relative`（原先按 `/` 前缀匹配在 Windows 上必失败）；manifest 文件键统一 `/` 分隔符，让 `verify-browser-components.mjs` 要求的 `bin/abb` 在 Windows 上也能匹配。
- **浏览器桥 CLI 的 Windows 编译**：PR 首轮四平台 dry-run 里 Windows 在 `go build` 失败（`syscall.Stat_t` Unix-only）；`ownedByCurrentUser` 拆成 `_unix.go` / `_windows.go`，并在 `ci.yml` 的 `browser-bridge` job 加交叉编译步骤。
- **dry-run 暴露的 runner 问题**：macOS `hdiutil create` 偶发 `Resource busy`，加重试；Windows 压缩阶段静默卡 36 分钟——根因是 pnpm deploy 目录里 2249 个 junction，7z 跟着走在循环依赖里无限递归；Windows 改用 `node-linker=hoisted` 平铺 node_modules 并加「发现链接就失败」守卫，压缩改为显式 7z / bsdtar 并打印输出；脚本按阶段打时间戳，package job 加 45 分钟超时。
- **CI 基线**：`typecheck-test` 在 `pnpm test` 前先构建 `@actspace/agent-cli...`，进程级 host 测试需要 `apps/cli/dist/cli.js`；`apps/web` 的 `output-download.test.ts` 首个用例在并行 CI 上冷启动超 5s，单独设 20s 超时；`typecheck-test` 补装 ripgrep（`tool-fs-search` 测试调真实 `rg`）。
- **文档**：`docs/CICD.md` 新增「桌面发布」节（怎么发版本、产物清单、runner 选择），工作流表更新；exec plan P4 勾掉并补四条决策；tech-debt 表把「release.yml 没装 Go」标完成，新增 Windows 图标 / 签名、Windows 未实机运行、artifact 中转三条；exec-runs 过程与摘要补 P4 步骤和人工验证项。

### 🧠 Design Intent (Why)

Agent 这边 `gh` 只读、不能手动 `workflow_dispatch`，要在合并前验证 Windows 和 Intel macOS 打包，只能让 `release.yml` 对改到打包脚本的 PR 做四平台 dry-run；为了不占 artifact 存储，dry-run 只传 manifest。正式发布先建草稿由人检查再发布，tag 与包版本不一致时第一步就失败，避免发出版本号对不上的包。Windows 先发 portable zip，图标、版本资源和 Authenticode 另立项。macOS x64 用 `macos-15-intel`，它是 public 仓库免费的 Intel 标准 runner；`macos-*-large` 是付费 larger runner。

### 📁 Files Modified

- `.github/workflows/release.yml`
- `scripts/release-package.sh`、`scripts/package-browser-components.mjs`
- `docs/CICD.md`、`docs/exec-plans/active/20261108-ci-pipelines.md`、`docs/exec-plans/tech-debt-tracker.md`、`docs/exec-runs/20261108-ci-pipelines/execution-process.md`、`docs/exec-runs/20261108-ci-pipelines/execution-summary.md`
- `browser-bridge/apps/cli/instance_registry.go`、`instance_registry_unix.go`（新）、`instance_registry_windows.go`（新）：`ownedByCurrentUser` 按构建标签拆分，Windows 恒为 `false`，让 CLI 在 Windows 上可编译
- `.github/workflows/ci.yml`：`browser-bridge` job 加 Windows / macOS 交叉编译步骤
- `.github/workflows/ci.yml`（`typecheck-test` 构建 Agent CLI）、`apps/web/src/sessions/test/output-download.test.ts`
- `browser-bridge/apps/cli/main.go`：dev host 构建的默认 `GOCACHE` 由 `/private/tmp/abb-go-cache` 改为 `os.TempDir()` 下，Linux runner 与 Windows 都能写
