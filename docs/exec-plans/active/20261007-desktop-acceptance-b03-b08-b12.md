# Desktop 验收问题 B03 / B08 / B12 修复

## 目标与授权

2026-10-07 用户批准修复 Review 自动更新、搜索凭据断开生效、新建工作树首发三项。此前统一验收保持历史记录；本计划是明确授权的修复阶段。工作基线 main d7eb0431，保留已有验收文档与截图，不提交或推送。

## 范围与实施顺序

1. **B03**：`main/runtime-v2/desktop-shell-ipc.ts` 接入工作区/Git 元数据监听，复用 `ReviewCoordinator.scheduleInvalidation` 的合并通知；补真实文件变更→IPC通知→新快照以及释放监听的回归。
2. **B08**：`main/runtime-v2/tool-host-services.ts` 的搜索端口在调用时读取最新搜索凭据，保留 web_fetch 缓存/释放语义；同一端口连接、断开、换Key的测试验证实际请求目的地和鉴权，不依赖展示文案。
3. **B12**：renderer `session-gateway.ts` / `App.tsx` 将运行位置和起点分支传入建会话契约；main 复用 `workspace-git-context-service.ts` 的创建与回滚能力，绑定真实目录并持久化工作树信息。失败保留草稿，禁止静默退回原目录。补契约guard、真实Git与首次提交回归。

每项先运行失败用例验证症状，再实施最小修复。新增生命周期代码需要验证退出释放及异步中断；不扩展到快捷键B13、其他候选或远端工作树。

## 风险与处理

- 文件监听自身或Git锁文件可能产生循环通知：过滤元数据噪声，合并事件，验证读取不会反复触发通知，dispose关闭全部句柄。
- 搜索凭据只在main/Host读取，测试使用合成Key和受控fetch，真实复验后恢复原配置。
- 工作树创建失败/会话创建失败要释放本次新建资源；不删除用户已有工作树，不改原仓库分支。
- 真实应用启动需main/preload新构建，使用同工作区 `pnpm dev:log`，复验后恢复临时设置并保持应用可用。

## 验证

- 定向vitest覆盖main Review、搜索端口、session gateway/IPC、实际Git工作树创建与恢复。
- Desktop typecheck、build:deps:dev、build:electron、build:renderer；shared契约构建及IPC/renderer边界检查。
- Desktop测试及文档检查；发现已有无关失败独立记录，不改无关代码。
- gpt-6.1-sol在真实Electron复验三条路线：打开Review后外部改fixture；同会话断开搜索provider后再搜索；选择工作树首发后检查UI与实际cwd/工作树元数据。只用真实桌面，不用浏览器验收替代。

## 进度

- [x] 用户批准方案，读取当前实现与协作规范。
- [x] B03失败复现、修复与回归。
- [x] B08失败复现、修复与回归。
- [x] B12失败复现、修复与回归。
- [ ] 工程验证、真实桌面定向复验、记录恢复。
- [ ] 更新验收记录、history、执行摘要并移入completed。

## 执行文档

- [执行过程](../../exec-runs/20261007-desktop-acceptance-b03-b08-b12/execution-process.md)
- [执行摘要](../../exec-runs/20261007-desktop-acceptance-b03-b08-b12/execution-summary.md)

执行模式：交互模式；本范围及跨层修改已获用户批准，按计划连续实施。
