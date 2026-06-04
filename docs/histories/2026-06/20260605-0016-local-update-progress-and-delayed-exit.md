## [2026-06-05 00:16] | Task: Local update progress and delayed exit

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户反馈本地更新点击后应用很快退出且没有进度反馈；希望构建阶段有弹窗进度，并且只有真正替换应用时才退出。

### Changes Overview

**Scope:** desktop main/preload/renderer local updater, shared IPC contract, docs

**Key Actions:**

- **[Delayed quit]**: 本地更新不再在 `local-update:start` 成功后立刻退出；helper 写出 `ready_to_replace` / `waiting_for_exit` / `replacing` 后，main 才触发 app 退出。
- **[Progress state]**: 新增 `LocalUpdateProgress` IPC 契约和 `<userData>/tmp/local-update/status.json`，由 helper 写入 `starting/building/ready_to_replace/waiting_for_exit/replacing/succeeded/failed` 阶段。
- **[PATH fix]**: helper 启动后补 `/opt/homebrew/bin`、`/usr/local/bin` 等 macOS 常见路径，并通过 `command -v pnpm` 找到 pnpm，修复 GUI app 环境中 `pnpm: command not found`。
- **[Progress dialog]**: 设置页「更新」点击“构建并更新”后显示进度弹窗，构建阶段保持应用打开，失败时显示错误并允许关闭。
- **[Shutdown copy]**: 退出遮罩新增 `local_update` 原因，替换阶段显示“准备替换应用”文案，避免与 Kairos 安全关闭混淆。
- **[Preflight signing]**: 本地 updater helper 默认启用 `ACTSPACE_MAC_ADHOC_SIGN=true`，并在退出当前 app 前验证新 `.app` 的 `Info.plist`、主可执行文件和 code signature，避免未签名或结构异常的新包替换旧版。
- **[Rollback on launch failure]**: 替换后如果 `open "$TARGET_APP"` 失败，helper 会移除新包并把 `.previous-local-update` 旧版本恢复回安装位置，再写入失败状态。
- **[Docs and tests]**: 补充 main service、SettingsPage 和 ShutdownOverlay 回归测试；同步 SECURITY、RELIABILITY、CICD 和设置页规范。

### Design Intent (Why)

本地自替换 updater 必须分清“可在当前进程存活时完成的构建”和“必须关闭当前 `.app` 才能进行的替换”。构建阶段提前退出会让用户失去反馈，也会把 `pnpm` 环境问题伪装成“更新时闪退”。通过 helper 状态文件让 renderer 和 main 都读取同一事实源，既能显示进度，也能让 main 只在替换边界退出。

后续实测发现，只做到“两阶段退出”还不够：如果新 `.app` 是未签名包，替换可以成功，但 macOS 可能在 `open` 时拒绝启动，导致旧包停在 `.previous-local-update` 备份名下。helper 因此需要在退出旧 app 前做产物验证，并在替换后打开失败时自动回滚旧版本。

### Files Modified

- `packages/shared/src/ipc.ts`
- `packages/desktop/src/main/local-update-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/desktop/src/renderer/components/ShutdownOverlay.tsx`
- `packages/desktop/src/main/test/local-update-service.test.ts`
- `packages/desktop/src/renderer/test/settings-page.test.tsx`
- `packages/desktop/src/renderer/test/shutdown-overlay.test.tsx`
- `docs/SECURITY.md`
- `docs/RELIABILITY.md`
- `docs/CICD.md`
- `docs/design-docs/front-设置页规范.md`
