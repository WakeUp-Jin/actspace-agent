## [2026-11-08 14:10] | Task: 修复新 CI 流水线在 main 基线上的三处失败

### 🤖 Execution Context

- **Agent ID**: `Cursor Cloud Agent`
- **Base Model**: `claude-fable-5.1`
- **Runtime**: `Cursor Cloud Agent (Linux)`

### 📥 User Query

> 这个 52 分支有点问题，不能合并呀

### 🛠 Changes Overview

**Scope:** `package.json`、`scripts/check-browser-command-registry.mjs`、`docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`

**Key Actions:**

- #48 拆出的「类型检查与测试」「构建」「Browser Bridge」三个 job 在第一个代码 PR（#52 和 dependabot）上同时失败；在 `origin/main` 上本地复现，三处都是基线问题，与 PR 内容无关：
  - 「类型检查与测试」第一步 `gen:contract-matrix --check` 报 stale：`agent-contract-matrix.generated.md` 的 source digest 落后于源码（#51 等改动没有重新生成）。重新生成，只有 digest 一行变化。
  - 「构建」`pnpm build` 里 `pnpm --filter @actspace/agent-cli build` 不带依赖闭包，runner 上没有任何 `dist/`，`tsc` 报 47 个 `Cannot find module '@actspace/…'`。改为 `@actspace/agent-cli...`，按拓扑顺序先构建 workspace 依赖；本地清空全部 `dist/` 后复现旧命令失败、新命令通过。
  - 「Browser Bridge」`check:browser` 把 `GOCACHE` 默认写死成 macOS 路径 `/private/tmp/abb-go-cache`，ubuntu runner 上 `mkdir /private` 没权限。改为 `path.join(os.tmpdir(), "abb-go-cache")`，显式设置的 `GOCACHE` 仍优先。

- 第二轮（随 #52 提交）：#55 合并后「类型检查与测试」和「Browser Bridge」仍红，又是两处基线问题：
  - `pnpm test` 里的 `test:agent-host:process` 以子进程启动 `apps/cli/dist/cli.js`，runner 上没有产物，8 个用例全部 `Cannot find module`。在 `ci.yml` 的 Typecheck 之后加一步 `pnpm --filter '@actspace/agent-cli...' build`。
  - `browser-bridge/apps/cli/main.go` 的 `ensureDevHostWrapper` 也把 `GOCACHE` 默认写死成 `/private/tmp/abb-go-cache`，`go test` 里 `TestEnsureDevHostWrapperUsesBuiltBinary` 在 ubuntu 上 `mkdir /private` 失败。改为 `filepath.Join(os.TempDir(), "abb-go-cache")`。
  - 「供应链安全」的 `osv-scan` 报 29 个依赖共 107 个已知漏洞，是依赖升级任务，不在本轮范围。

### 🧠 Design Intent (Why)

- 之前 CI 被手动停用、`typecheck:contracts` 和开发机残留的 `dist/` 掩盖了这些问题；流水线恢复后第一批 PR 才暴露出来。单独起 PR 修基线，让 #52 / #53 这类功能 PR 不混入 CI 修复。
- `agent-contract-matrix.generated.md` 的 digest 覆盖了一批源码路径，之后凡是改到这些文件的 PR 都要跑一次 `pnpm run gen:contract-matrix` 并提交结果，否则「类型检查与测试」第一步就会挂。

### 📁 Files Modified

- `package.json`
- `scripts/check-browser-command-registry.mjs`
- `docs/design-docs/agent-plugin-runtime/agent-contract-matrix.generated.md`
- `.github/workflows/ci.yml`
- `browser-bridge/apps/cli/main.go`
- `docs/CICD.md`
