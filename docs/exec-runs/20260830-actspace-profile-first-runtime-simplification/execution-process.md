# 执行过程

> 计划：`20260830-actspace-profile-first-runtime-simplification`
> 状态：实现与自动化验收完成；真实宿主门禁待执行

## 2026-08-30

- 用户确认采用 Profile-first 方向：当前只保留 Headless 与 Desktop，删除 RuntimeHandle，不处理 Web。
- 执行前复核发现原计划缺少 `@actspace/desktop-app` 的真实包身份、Headless Loader entry、Profile API、CLI chat 去留和 Desktop Registry 拆分；这些选择已在设计文档和计划中收口。
- 本轮首先更新设计规范、execution plan 导航和本执行记录；代码迁移从 Profile/Boot 收敛阶段开始。

- 恢复执行前复核确认：Profile/Boot 与 Headless 包只有部分骨架；生产 CLI/Desktop 仍依赖 `RuntimeHandle`，`@actspace/desktop-app` 尚不存在，`cli-chat` 仍在生产相关代码中。
- 只读验证结果：五个目标包 typecheck 通过；Headless 2/2、Runtime 4/4、Host 1/1 测试通过；CLI 12/13，失败原因为 workspace 中缺少 `@actspace/headless` symlink；Desktop 测试尚未执行。
- 当前工作树保留大量既有 dirty changes；本次恢复不执行 reset、clean、stash、commit 或 push。用户已批准按“依赖链接 -> Profile/Boot -> Headless/CLI -> Desktop Bundle -> RuntimeHandle 删除 -> 全量收口”顺序继续。
- `pnpm install --offline --frozen-lockfile` 成功，补齐了 Runtime 依赖闭包；随后 CLI 全量测试恢复为 13/13 通过。该步骤完成，进入 Profile/Boot 契约收尾。
- 新增 `@actspace/desktop-app` 独立 package，提供真实 `manifest`、`apply` Behavior、`DesktopAppService` 和 `DESKTOP_APP_BUNDLE`；根 workspace 显式依赖用于让 Cordis Loader 在隔离 node_modules 中解析该入口。
- Desktop Host 已改为显式选择 `RUNTIME_PROFILE_IDS.desktop` 并传入 Desktop Bundle；Desktop Registry 改为从 `BootedRuntimeProfile.context` 读取 `desktop.app`，Projection/event buffer 与 artifact store 仍留在 Host。
- 当前验证：Desktop App typecheck/build 与 lifecycle test 通过；Runtime typecheck/test 通过（4/4）；CLI typecheck/test 通过（13/13）；Desktop typecheck/test 通过（78 files / 522 tests）。
- 已完成：`RuntimeHandle`/`RuntimeFacade` 文件、公共导出、旧通用编排实现和生产引用删除；`@actspace/host` 旧包及 provenance 字符串收缩；CLI chat 当前生产入口清理；全仓库文档、contract matrix、history 与 learning 收口。
- 自动化验收：根级 `pnpm test` 退出码 0；Runtime/CLI/Desktop App/Desktop 包级 typecheck 与测试、workspace typecheck、package boundaries、contract matrix、current docs、v2 legacy removal 均通过。
- 制品收口：清理并重建 `packages/runtime/dist`、`apps/cli/dist` 和 `apps/desktop/dist*`；对生成制品扫描未发现 `RuntimeHandle`、`RuntimeFacade`、`cli-chat` 或 `@actspace/host` 残留。
- 清理 `packages/host` 仅剩的旧 `dist`/workspace 链接生成残留；源码、package manifest、lockfile 与 workspace package boundary 均不再包含该包。
- 仍待外部环境：真实 Provider 请求、Chrome/Browser Bridge、Electron 启动与 packaged build、签名/公证、人工 quit/reload 和最终 pending writer/Fiber 检查。未将这些门禁写成已通过。
