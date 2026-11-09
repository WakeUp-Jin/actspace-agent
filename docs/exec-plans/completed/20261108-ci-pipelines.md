# CI 重新上线与桌面发布流水线

## 目标

把被手动停用的 GitHub Actions 流水线重新开起来，并让仓库具备一个标准桌面开源项目该有的交付链路：PR 上几分钟内拿到类型检查、测试、构建的结果；`main` 上每次合并都验证打包脚本没坏；打 `v*` tag 就产出三平台安装包并创建草稿 Release；依赖和静态安全分析由 Dependabot、CodeQL 自动跑。

## 状态

已完成。P1–P3 随第一个 PR（#48）合入；P4（release matrix）随 #57 合入，四平台 dry-run 已绿；P5（Electron 39 → 45）随 #58 合入。签名、notarization、远程自动更新按「不包含」留待单独立项。

## 范围

**包含：**

- P1 修掉让 CI 必红的既有问题（managed CLI 打包重试、环境耦合测试、`check-package-cutover` 误报）。
- P2 拆 `ci.yml`，加 `docs.yml`，所有 PR 工作流加 `concurrency` 与 pnpm 缓存，`supply-chain-security.yml` 只在依赖变更时跑。
- P3 运行时依赖安全升级（`dompurify`、`undici`），加 `dependabot.yml` 与 `codeql.yml`。
- P4 `release.yml` 改成 tag 触发的 macOS（arm64 / x64）、Linux、Windows 矩阵，汇总后创建草稿 Release；`release-package.sh` 补 Windows 分支。
- P5 Electron 39 → 当前稳定大版本。

**不包含：**

- Developer ID 签名、notarization、Windows 代码签名（需要付费证书或 SignPath 申请，流水线保留现有 opt-in 环境变量接口）。
- 远程自动更新。
- `apps/site` 的部署方式（继续走 Netlify）。
- 把 Go 加进 CodeQL（browser-bridge 两个 module，先观察 JS/TS 分析的耗时再决定）。

## 背景

- 相关文档：`docs/CICD.md`（费用前提、工作流表、重新启用步骤）、`docs/SECURITY.md`。
- 相关代码路径：`.github/workflows/*.yml`、`.github/dependabot.yml`、`.github/codeql/codeql-config.yml`、`scripts/release-package.sh`、`scripts/package-browser-components.mjs`、`scripts/package-agent-cli.mjs`、`scripts/check-package-cutover.mjs`。
- 已知约束：
  - 仓库是 public，标准 GitHub 托管 runner 不计费；只有 larger runner 和 artifact 存储要留意。
  - 所有 action 必须 pin 到 commit SHA（`scripts/check-action-pinning.sh`）。
  - `release-package.sh` 会 `go build` 浏览器桥 CLI，所以打包 job 必须装 Go；`go.mod` 要求 1.26，runner 预装的 Go 版本不够时靠 `actions/setup-go` 的 `go-version-file`。
  - `release-package.sh` 目前只有 darwin / linux 两个分支，Windows 直接 `exit 1`。

## 风险

- 风险：`paths-ignore` 让纯文档 PR 不产生 `typecheck-test` 等检查，若分支保护把它们设成必需会卡死。缓解：`docs/CICD.md` 写明只把 `repository-checks` / `docs-checks` 设为必需。
- 风险：CodeQL 耗时。实测 PR 上 JS/TS 分析 1 分 41 秒、Actions 50 秒，可以保留 `pull_request` 触发；若后续单次超过 20 分钟，把 `pull_request` 触发去掉只留 `main` 与定时。
- 风险：Windows 打包路径没人实机跑过。缓解：`release.yml` 对改到打包脚本的 PR 在四个 runner 上做 dry-run（只传 manifest），P4 的 PR 本身就会把 Windows 跑一遍；Windows 产物先按 portable zip 发。
- 风险：Electron 大版本升级带来 Node / Chromium 行为变化。缓解：P5 单独 PR，跑完整 desktop 测试与 Electron 实机走查。

## 里程碑

1. P1–P3（本 PR）：CI 能绿、工作流分层、安全自动化就位。
2. P4：tag 触发的三平台 release 与草稿 Release。
3. P5：Electron 升级。

## 验证方式

- 命令：`./scripts/ci.sh`、`pnpm test:package-cutover`、`actionlint .github/workflows/*.yml`、`pnpm audit --prod`、在 `apps/desktop` 下 `TZ=UTC npx vitest run`。
- 手工检查：合并后在 GitHub Actions 页启用 `CI`、`供应链安全`、`发布`；看一次 `main` push 五个 job 全绿、`build` job 的打包冒烟通过；Security › Code scanning 出现 CodeQL 结果；下周一 Dependabot 开出分组 PR。
- P4 验收：P4 的 PR 上 `发布` 工作流四个平台 dry-run 全绿；合并后推一个 `v*` tag，四个平台产物都挂到草稿 Release，合成的 `release-manifest.json` 与 provenance 覆盖每个产物。

## 进度记录

- [x] P1 `scripts/package-agent-cli.mjs` 重试前清空 deploy 目录。
- [x] P1 desktop 测试与开发机解耦：`safeStorage.getSelectedStorageBackend` mock、转写 golden 固定 `TZ`、docs 标签文案、`GIT_CONFIG_GLOBAL` / `GIT_CONFIG_NOSYSTEM` 隔离。
- [x] P1 `check-package-cutover.mjs` 忽略相对导入与测试文件中的退役名。
- [x] P1 `agent-cli-safety.test.mjs` 跟上后台任务 S2 的重启语义：resume 先交付 `lost` 通知再跑新任务，两个 Run。
- [x] P2 `repository-checks` / `docs-checks` 安装 ripgrep（`check-secrets.sh` 依赖，runner 不预装）。
- [x] P2 `ci.yml` 五个并行 job、`docs.yml`、`concurrency`、pnpm 缓存、`main` 上打包冒烟；`agent-cli-binaries.yml` 加缓存并把 artifact 保留期缩到 3 天；`supply-chain-security.yml` 只在依赖变更时跑。
- [x] P2 markdownlint 收敛到能绿：`.markdownlint-cli2.jsonc` 排除第三方 skill、history、fixture；`.markdownlint.json` 关掉纯排版规则；修掉剩余 45 处真实问题（表格列数、标题层级、图片 alt、末尾换行等）。
- [x] P3 `dompurify` 3.4.17、`undici` 7.30.x；`.github/dependabot.yml`；`codeql.yml` + `codeql-config.yml`。
- [x] P4 `release.yml` 矩阵 + 草稿 Release；`release-package.sh` Windows 分支；`release.yml` 显式 `setup-go`。（第二个 PR；tag 实发由用户在合并后做）
- [x] P5 Electron 39 → 45.2.3（Node 24.22 / Chromium 156）：clipboard 迁移到 W3C 风格 API，`release-package.sh` 按需下载 runtime，renderer tsconfig lib 显式 ES2024。（第三个 PR；实机走查由用户做）

## 决策记录

- 2026-11-08（P5）：直接升到当前 stable 45，不在 40–44 停留。中间版本没有一个是 LTS，Electron 只维护最近三个大版本，逐级升不会减少要处理的 breaking change，只会多几轮测试。
- 2026-11-08（P5）：`safeStorage` 的同步方法（`isEncryptionAvailable` / `encryptString` / `decryptString`）在 45 只是弃用、46 才移除。`SecretCrypto` 接口是同步的，改异步要动 settings store、model-connections 等调用链，不塞进版本升级 PR；记入 tech debt，46 之前单独做。
- 2026-11-08（P5）：renderer tsconfig 把 `lib` 从 ES2022 改成 ES2024 而不是改掉代码里的 `findLastIndex` / `Object.groupBy`。这些 API Chromium 117 起就有，之前能过类型检查只是因为 Electron 39 安装器的间接依赖 `type-fest@0.13.1` 被 mermaid 的 d.ts 误引、顺带带入了 esnext lib；现在把真实依赖写明。

- 2026-11-08：用 `paths-ignore` / `paths` 互补的两份工作流（`ci.yml` / `docs.yml`）而不是在一个工作流里用第三方 paths-filter action 做 job 级过滤——GitHub 原生、不引入新依赖；代价是混合 PR 上 `scripts/ci.sh` 跑两次（约 1 分钟）。
- 2026-11-08：CodeQL 用仓库内 workflow（advanced setup）而不是 UI 的 default setup，为了把 `paths-ignore` 和查询集版本化在仓库里；两者不能同时开。
- 2026-11-08：git 相关测试的超时根因是开发机全局 `core.fsmonitor=true`——git 为每个临时仓库拉起 fsmonitor 守护进程并继承 stdio 管道，`execFile` 要等它退出才返回。修在测试 setup 里隔离全局配置，而不是改产品代码里的 `runGitCommand`；产品侧是否也要对用户仓库加 `-c core.fsmonitor=false` 记入技术债。
- 2026-11-08（P4）：`release.yml` 保留 `pull_request` 触发，但只在改到打包脚本时跑、只上传各平台 manifest——因为 `gh` 对 Agent 只读、不能手动 `workflow_dispatch`，要在 PR 内验证 Windows / Intel macOS 打包只能靠这个；完整产物只在 tag / 手动运行时经 artifact（保留 1 天）中转到 Release。
- 2026-11-08（P4）：Release 先建草稿，由人检查后发布；tag 必须等于 `v` + `apps/desktop/package.json` 版本，否则第一步就失败，避免 tag 和包内版本不一致。
- 2026-11-08（P4）：Windows 先发 portable zip（`ActSpace.exe` + `resources/app`），不做安装器、图标替换与 Authenticode；manifest 的路径键统一 POSIX 分隔符，让同一份 verifier 在 Windows 上也能读。
- 2026-11-08（P4）：macOS x64 用 `macos-15-intel`（public 仓库免费的 Intel 标准 runner），不用付费的 `macos-*-large`。
- 2026-11-08：`katex` 0.16 → 0.18 的 low 级告警不在本轮处理：它是精确钉死的版本，0.x 的 minor 可能有破坏性改动，留给 Dependabot 单独开 PR 评估。

## 执行模式

- **交互模式**：P4、P5 涉及发布与运行时大版本，需要用户在线确认。

## 执行文档

- `docs/exec-runs/20261108-ci-pipelines/execution-process.md`
- `docs/exec-runs/20261108-ci-pipelines/execution-summary.md`
