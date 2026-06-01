## [2026-05-31 23:46] | Task: local desktop updater

### Execution Context

- **Agent ID**: `Codex`
- **Base Model**: `GPT-5`
- **Runtime**: `Codex desktop`

### User Query

> 用户希望桌面端可以在本地代码改到满意后，直接点击更新，自动重新打包并替换本机安装版应用；当前没有 Developer ID 签名预算，所以只做本地更新，不做远程自动更新。

### Changes Overview

**Scope:** desktop IPC, settings UI, release docs

**Key Actions:**

- **[Local update contract]**: 新增 `LocalUpdateState` / `LocalUpdateStartResult` 等 shared IPC 类型，约束 renderer 与 main 之间只传结构化状态。
- **[Main service]**: 新增 `LocalUpdateService`，保存本地源码目录、验证 actspace 仓库形态、检查当前 macOS `.app` 安装位置是否可写，并生成外部 helper 脚本。
- **[Safe helper flow]**: helper 运行 `pnpm package:desktop:dmg`，等待当前 app 退出，备份旧 app、复制新 app、失败时尝试恢复备份，再重新打开 app。
- **[Settings UI]**: 设置页通用分区新增「本地更新」组，可选择源码目录、查看日志路径、触发构建并更新；开发态或不可更新时显示原因并禁用按钮。
- **[Docs and tests]**: 更新 CI/CD、可靠性、安全和设置页规范；新增 main 服务单测与设置页测试。

### Design Intent (Why)

正式 `electron-updater` 需要远程发布源、签名/权限策略和版本通道设计；本阶段用户只需要“我本地源码已经改好，安装版 app 点一下更新”。因此第一版采用本地源码目录 + 外部 helper 的方式，把远程分发问题延后，同时避免 renderer 直接执行任意命令。

运行中的 `.app` 不能可靠覆盖自己，所以 main 只负责验证和启动 helper；真正替换发生在 app 退出之后。这样更新失败也能在 helper 日志中留下线索，且主进程不需要持有不必要的 shell 能力。

### Files Modified

- `docs/CICD.md`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`
- `docs/design-docs/front-设置页规范.md`
- `docs/exec-plans/completed/20260531-local-desktop-updater.md`
- `docs/learnings/2026-05/pnpm-workspace-electron-portable-release.md`
- `packages/desktop/src/main/local-update-service.ts`
- `packages/desktop/src/main/index.ts`
- `packages/desktop/src/preload/index.ts`
- `packages/desktop/src/global.d.ts`
- `packages/desktop/src/renderer/components/settings/SettingsPage.tsx`
- `packages/desktop/src/main/test/local-update-service.test.ts`
- `packages/desktop/src/renderer/test/settings-page.test.tsx`
- `packages/shared/src/ipc.ts`
