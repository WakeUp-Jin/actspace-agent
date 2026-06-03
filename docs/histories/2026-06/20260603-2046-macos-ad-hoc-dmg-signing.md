## [2026-06-03 20:46] | Task: Fix macOS ad-hoc DMG signing

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户希望源码本地自构建 macOS DMG，不购买 Developer ID 证书；运行 `ACTSPACE_MAC_ADHOC_SIGN=true pnpm package:desktop:dmg` 时，`codesign --deep` 在 `Electron Framework.framework` 上报 `bundle format is ambiguous`。

### Changes Overview

**Scope:** release packaging docs and script

**Key Actions:**

- **[Ad-hoc signing]**: 将 macOS ad-hoc 分支从 `codesign --deep --sign - <app>` 改为只对主 Electron 可执行文件和外层 `.app` 做本地临时签名，避免递归重签 Electron 内置 framework。
- **[Verification]**: ad-hoc 分支改用 `codesign --verify --no-strict` 验证，匹配当前 Electron framework 的非传统目录结构。
- **[Docs]**: 更新 `docs/CICD.md`，明确 `ACTSPACE_MAC_ADHOC_SIGN=true` 只服务源码本地自构建，不等同 Developer ID 签名或 notarization。

### Design Intent (Why)

Electron runtime 内置的 macOS framework 结构会让 `codesign --deep` 在递归签名时误判 bundle 类型，导致本地临时签名失败。当前目标不是正式分发签名，而是让源码自构建用户能生成本地可用 DMG，因此保留 Developer ID 分支不变，只把 ad-hoc 分支收敛为浅层临时签名，并用 manifest 的 `signature: "ad-hoc"` 标明产物性质。

### Verification

- `ACTSPACE_MAC_ADHOC_SIGN=true pnpm package:desktop:dmg`
- `codesign --verify --no-strict --verbose=2 dist/desktop/actspace.app`
- `dist/release-manifest.json` shows `"signature": "ad-hoc"`, `"signed": false`, `"notarized": false`

### Files Modified

- `scripts/release-package.sh`
- `docs/CICD.md`
- `docs/learnings/2026-06/electron-ad-hoc-codesign-without-deep.md`
