# 执行摘要

> 计划：`20260830-actspace-profile-first-runtime-simplification`
> 状态：实现与自动化验收完成；真实宿主门禁待外部环境

## 当前状态

设计规范和执行计划已按以下决定收口：

- 只保留 `actspace.headless` 与 `actspace.desktop`。
- Headless 使用 `@actspace/headless/plugin`。
- 新建 `@actspace/desktop-app` Runtime Bundle，Electron Host 仍在 `apps/desktop`。
- `bootProfileRuntime()` 是 Host 使用的入口，返回当前进程内 `BootedRuntimeProfile`（Context/root/manifest/diagnostics/shutdown），不再发布 RuntimeHandle。
- CLI chat 从当前生产表面删除。
- Desktop Registry 拆为 DesktopAppService、ProjectionBridge 和 Host ports。

实现与自动化验收已完成。Runtime、CLI、Desktop App、Desktop Host、包边界、契约矩阵和当前文档检查均通过；根级 `pnpm test` 退出码为 0，workspace `pnpm run typecheck` 退出码为 0，生产源码扫描未发现 `RuntimeHandle`、`RuntimeFacade`、`@actspace/host` 或 `cli-chat` 残留。真实 Provider、Chrome、Electron packaged build、签名/公证和人工 quit/reload 仍是外部门禁。
