# Profile-first Runtime 精简收口

## 用户诉求

恢复并继续执行 `20260830-actspace-profile-first-runtime-simplification`，先确认中断时的执行状态，再完成已批准的 Headless/Desktop Profile 迁移。

## 主要变更

- 新增 `@actspace/desktop-app`，包含真实 Manifest、Cordis Behavior、`DesktopAppService` 和 `DESKTOP_APP_BUNDLE`。
- CLI 显式选择 Headless Profile；Desktop 显式选择 Desktop Profile 并从 settled Context 取得 `desktop.app`。
- Boot 返回当前进程内的 Profile Context/root/manifest/diagnostics/shutdown 边界；RuntimeHandle 与 RuntimeFacade 文件、公共导出和生产调用点移除。
- 删除无生产引用的通用 Host boundary 与 `cli-chat` Profile 文件。
- 更新 Profile composition、Cordis loader transport、契约矩阵、架构/可靠性文档和执行记录。

## 验证

- Runtime dependency closure build、Runtime typecheck 与 4 项测试通过。
- Desktop App typecheck/build 与 lifecycle test 通过。
- CLI typecheck 与 13 项测试通过。
- Desktop typecheck 与 78 个测试文件、522 项断言通过。
- package boundaries、contract matrix、current docs、package cutover、v2 legacy removal 通过。

## 未覆盖门禁

真实 Provider、Chrome/Browser Bridge、Electron packaged build、签名/公证和人工 quit/reload 仍需在具备宿主条件的环境中执行；本轮未将这些门禁写成已通过。
