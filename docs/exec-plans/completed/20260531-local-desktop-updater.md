# Local Desktop Updater

## Goal

在桌面端设置页提供“本地更新”能力：用户选择本机 actspace 源码目录后，可点击按钮让当前安装版应用从该源码重新打包、替换当前 `.app`，并重启应用。该能力服务本地自用，不依赖 Developer ID 签名、notarization 或远程 release server。

## Scope

- Shared IPC types: `packages/shared/src/ipc.ts`
- Main service and IPC: `packages/desktop/src/main/local-update-service.ts`, `packages/desktop/src/main/index.ts`
- Preload bridge and renderer types: `packages/desktop/src/preload/index.ts`, `packages/desktop/src/global.d.ts`
- Settings UI: `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- Tests: main service unit tests, settings renderer test
- Docs: `docs/CICD.md`, `docs/RELIABILITY.md`, `docs/SECURITY.md`, history, learning note if useful

## Constraints

- Renderer must not execute shell commands or write files directly.
- Main process must validate the selected source directory before allowing update:
  - `package.json` exists and has `name: "actspace"`.
  - root `package.json` contains `scripts.package:desktop:dmg`.
  - `scripts/release-package.sh` exists.
- First version does not request elevated install permissions. If the current app path is not writable, return a structured error before starting the update helper.
- The helper script is written under Electron `userData/tmp/`, runs outside the current process, waits for the current app to exit, replaces the app, then reopens it.
- Do not implement remote auto-update, Git pull, background polling, or version comparison in this task.

## Tasks

1. Add shared IPC contracts for local update state, select-source result, and start result.
2. Implement a pure-ish main service that:
   - stores source path in `<userData>/local-update.json`;
   - validates source repo shape;
   - checks current app path is a packaged `.app` on macOS;
   - checks parent install directory is writable;
   - writes a helper shell script that runs `pnpm package:desktop:dmg`, waits for current process exit, replaces app, and reopens app.
3. Register main IPC channels and expose them through preload.
4. Add a “本地更新” group to General settings with choose/update buttons and status feedback.
5. Add unit tests for validation and renderer tests for the settings entry.
6. Update docs and history.
7. Verify with `pnpm typecheck`, focused tests, and `pnpm build`. Real replacement is not executed during automated verification.

## Failure Handling

- Invalid source path: return `invalid_source`.
- Running in dev mode or not inside a `.app`: return `not_packaged`.
- Install parent not writable: return `not_writable`.
- Helper spawn failure: return `spawn_failed`.
- Build/replace failure happens inside helper and is logged to `<userData>/tmp/local-update/update.log`; the current app may have already exited, so this is documented as a local updater limitation.
