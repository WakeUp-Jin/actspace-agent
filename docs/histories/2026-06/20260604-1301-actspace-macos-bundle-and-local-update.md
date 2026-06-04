## [2026-06-04 13:01] | Task: Actspace macOS bundle and local update

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户确认产品名使用 `Actspace`，并希望修复 DMG 安装版仍被本地更新识别为开发态的问题，让源码本地构建后可一键更新已安装 app。

### Changes Overview

**Scope:** desktop packaging, local updater, settings diagnostics, docs

**Key Actions:**

- **[macOS bundle identity]**: 将桌面产品名改为 `Actspace`，release 脚本生成 `Actspace.app`，并把主可执行文件与 `CFBundleExecutable` 从默认 `Electron` 改为 `Actspace`。
- **[Local updater detection]**: 本地更新不再把 `app.isPackaged` 作为唯一门槛，而是从当前进程路径解析真实 `.app`，允许 `Actspace.app` / `actspace.app`，同时拒绝 `node_modules` 下的 Electron 开发 runtime。
- **[Compatibility]**: helper 优先使用新产物 `dist/desktop/Actspace.app`，并兼容旧的 `dist/desktop/actspace.app`，方便旧安装版完成第一轮本地更新。
- **[Diagnostics]**: 设置页本地更新区域显示安装目标、当前进程路径和 Electron packaged 标志，便于排查安装版/开发态误判。
- **[Docs and tests]**: 补充 LocalUpdateService 单测，更新 CI/CD、安全和 Electron 打包学习文档。

### Design Intent (Why)

当前手写 macOS 打包是复制 Electron runtime 再注入 app 资源。这个方向适合源码本地构建，但必须把 bundle 和主可执行文件改成产品身份；否则系统和 Electron 仍会看到默认 `Electron` runtime，导致 `app.isPackaged=false`、钥匙串提示和本地更新判定混乱。本地 updater 的安全边界应基于可验证的源码目录和 `.app` 安装目标，而不是单一 runtime 标志。

### Files Modified

- `scripts/release-package.sh`
- `packages/desktop/package.json`
- `packages/desktop/src/main/local-update-service.ts`
- `packages/desktop/src/main/test/local-update-service.test.ts`
- `packages/desktop/src/renderer/components/settings/SettingsPrimitives.tsx`
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/shared/src/ipc.ts`
- `docs/CICD.md`
- `docs/SECURITY.md`
- `docs/exec-plans/completed/20260531-local-desktop-updater.md`
- `docs/learnings/2026-05/pnpm-workspace-electron-portable-release.md`
- `docs/learnings/2026-06/electron-ad-hoc-codesign-without-deep.md`
