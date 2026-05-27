## [2026-05-28 01:23] | Task: Release desktop archive

### 🤖 Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### 📥 User Query

> 推进 CI/CD Phase 2：把 release 产物从仓库元数据包升级为真实桌面构建产物。

### 🛠 Changes Overview

**Scope:** release workflow, packaging script, workspace package metadata, CI/CD docs

**Key Actions:**

- **Desktop release artifact**: 将 `scripts/release-package.sh` 改为构建 desktop workspace，并用 Electron runtime 组装 unsigned portable archive。
- **Release workflow**: 让手动 release workflow 在 macOS runner 上安装依赖、打包桌面 archive、上传 SBOM/manifest，并对真实桌面产物生成 provenance。
- **Package metadata**: 为 workspace package 添加 `files` 白名单，避免 release deploy 携带源码和测试目录。
- **Docs sync**: 更新 CI/CD 和供应链文档，说明当前 release 已进入 unsigned portable desktop archive 阶段。
- **Command docs**: 将仓库级 CI 命令文档校正为 `pnpm run ci`，避免 pnpm 内置 `ci` 命令遮蔽同名 package script。
- **Open-source packaging**: 新增 `pnpm package:desktop` 作为源码本地打包入口，并预留可选 Developer ID 签名 / notarization 环境变量；默认无证书时移除 macOS 外层 app 的旧签名。

### 🧠 Design Intent (Why)

Phase 1 已经把 TypeScript workspace 的 typecheck/test/build 接入常驻 CI，下一步应让 release 产物代表真实应用，而不是继续发布 `repo-metadata.tgz`。当前阶段先选择 unsigned portable archive，避免过早引入代码签名、notarization、installer 和自动更新复杂度，同时保留 SBOM 与 provenance。

### 📁 Files Modified

- `.github/workflows/release.yml`
- `scripts/release-package.sh`
- `packages/desktop/package.json`
- `packages/agent-core/package.json`
- `packages/shared/package.json`
- `docs/CICD.md`
- `docs/SUPPLY_CHAIN_SECURITY.md`
