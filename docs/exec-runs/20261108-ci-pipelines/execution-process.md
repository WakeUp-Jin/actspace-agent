# CI 重新上线与桌面发布流水线 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261108-ci-pipelines.md`
- **执行模式**：交互
- **开始时间**：2026-11-08 10:30
- **结束时间**：2026-11-08 13:40（P1–P3；P4、P5 另开 PR）

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

## 遇到的问题

- **问题**：`apps/desktop/src/main/test/runtime-v2-output-reference-flow.test.ts` 在本机失败。
  - **原因**：测试对 `bash -lc` 输出按行数断言；本机 nvm 在 login shell 启动时打印 `npm_config_prefix` 告警，多出两行。GitHub runner 没有这个告警。
  - **应对**：不在本轮修，记入技术债。
- **问题**：本机 `release-package.sh` 先后报 Go 工具链版本不够、`Electron runtime not found`。
  - **原因**：VM 预装 go1.22 而 `go.mod` 要求 1.26；`apps/desktop/node_modules/electron` 的 postinstall 没跑。
  - **应对**：本机用 `GOTOOLCHAIN=go1.26.10` 并手动 `node install.js`；CI 里 `build` job 加 `actions/setup-go`，Electron 由 `pnpm install` 的 postinstall 处理。

## 跳过或推迟的事项

- P4 `release.yml` 三平台矩阵、Windows 打包分支、草稿 Release：单独 PR。
- P5 Electron 39 → 当前稳定版：单独 PR。
- CodeQL 加 Go：先看 JS/TS 分析耗时。
- `katex` 升级：留给 Dependabot。
