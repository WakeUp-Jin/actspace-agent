## [2026-05-31 22:54] | Task: macOS dmg packaging

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户希望本地打包后的桌面端像正常 macOS 应用一样通过 `.dmg` 安装，并使用提供的图标；当前没有 Developer ID 签名预算，所以先做本地无签名安装体验，后续再考虑桌面端点击更新。

### Changes Overview

**Scope:** `packages/desktop`, release script, CI/CD docs

**Key Actions:**

- **[macOS app icon]**: 新增 `packages/desktop/resources/` 图标资源，把用户提供的 PNG 生成 `icon.png`、`actspace.iconset/` 和 `icon.icns`，供打包后的 `.app` 使用。
- **[dmg artifact]**: 扩展 `scripts/release-package.sh` 的 macOS 分支，在现有 portable `.tar.gz` 之外生成带 `actspace.app` 和 `Applications` 快捷入口的 `.dmg`。
- **[release metadata]**: `release-manifest.json` 新增 `dmg_artifact` 与 `dmg_artifact_size_bytes`，GitHub Release workflow 上传并 attestation `.dmg`。
- **[local deploy fallback]**: `pnpm deploy` 先尝试 `--offline`，如果本机 pnpm store 缺少 tarball，再清理 deploy 目录并退回普通 deploy，降低首次本地打包门槛。
- **[docs]**: 更新 `docs/CICD.md`，说明 `pnpm package:desktop:dmg`、本地拖拽安装方式，以及无签名 app 的 macOS 打开限制。

### Design Intent (Why)

先不引入 `electron-builder` / `electron-forge`，继续沿用当前轻量 release 链路：构建 app、组装 Electron runtime、再用 macOS 自带 `hdiutil` 从同一个 `.app` 生成 `.dmg`。这样能快速满足本地安装体验，同时不把签名、notarization、自动更新这些更重的分发能力一次性卷进来。

无签名 `.dmg` 可以本地使用，但不等于正式分发包；自动更新也不应该和 `.dmg` 混为一谈，后续本地更新按钮需要独立设计“退出当前 app -> 外部脚本替换 app -> 重启”的流程。

### Files Modified

- `.github/workflows/release.yml`
- `docs/CICD.md`
- `docs/learnings/2026-05/pnpm-workspace-electron-portable-release.md`
- `package.json`
- `packages/desktop/resources/icon.icns`
- `packages/desktop/resources/icon.png`
- `packages/desktop/resources/actspace.iconset/`
- `scripts/release-package.sh`
