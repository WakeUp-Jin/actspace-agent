# Tool 插件边界拆分与 Todo 领域迁移 — 执行过程

## 基本信息

- 关联计划：`docs/exec-plans/completed/20260928-tool-plugin-boundaries.md`
- 执行模式：交互
- 开始日期：2026-09-28
- 状态：实现完成，验证结果见执行摘要

## 执行时间线

### 2026-09-28：基线与协议

- 用户批准实施：七个能力插件、独立 Todo、不兼容旧 `todo/write`、Projection Contributor 和 restart-only；Plan 模式延期。
- 阅读仓库协作、架构、编码、history、质量与执行计划规则；工作树原有改动仅为本计划及索引。
- `pnpm install --offline --frozen-lockfile` 复用本地缓存。旧 required Todo 事件的正确诊断固定为 `UNKNOWN_REQUIRED_CODEC`。
- Tool Runtime 增加 `allowedToolNames` 调用时 scope gate；Session Projection 增加启动期 Contributor 注册与应用。

### 2026-09-28：Todo 领域迁移

- 新建 `@actspace/tools-todo-tools`，拥有 TodoService、工具、required Codec 和 `todos` projection。Core Journal 删除 `todo/write`；Core Agent 和 Runtime 删除内置 Todo 注册。
- 在生产 `SessionReadModel` 的 restore/replay 之前应用 Contributor；checkpoint 与删除缓存后的 Journal 重建得到一致 Todo。
- 持久旧事件 fixture 验证 browse-only、`UNKNOWN_REQUIRED_CODEC` 和拒绝 resume；未建立兼容或迁移路径。

### 2026-09-28：七个独立工具包与启动组合

- 按文件读、搜索、写、Shell、Web、图片生成、图片分析拆成七个 workspace 包，每包拥有 manifest、Behavior、Host port、定义、权限和 dispose。
- CLI 与 Desktop 改为专用 Host port。Profile/Bundle、`cordis.yml` 和锁文件按七包及 Todo 更新；`core-tools` 包与旧 Host port 退役。
- Boot 根据已启用 composition 加载 Codec，并将工具禁用 patch 传给 Include。真实 Cordis 启动测试验证禁用 Shell/Todo 时既无工具、无 Todo Codec，也未创建 Shell Host port；运行中变更只置 restartRequired。

### 2026-09-28：回归与文档

- 各包 lifecycle、参数、能力、scope、执行失败与真实 Host 行为回归；文件 audience 的旧 grant 不复用。
- 发现 `bash_output` 声明 read-only 却带 execute effect，Tool Runtime 会拒绝调用；将该 effect 改为 use，跨包测试通过。
- Shell 后台输出测试由固定 30ms 改为等待实际输出；Todo dispose 断言改为异步拒绝。
- 更新设计文档、当前导航、contract matrix、包图、history 和学习文档。

## 验证中的问题

- 新 workspace 包首次离线安装后，pnpm 的 hoist 链接仍留旧包；`pnpm install --offline --frozen-lockfile --force` 刷新后 CLI 真实进程 smoke 通过。
- 并行运行全仓 `build`、`typecheck`、`test` 时，构建清理共享 `dist`，引发 CLI 缺模块；后续串行运行。
- 全仓并行测试时 CLI mock 完整流程超过默认 5 秒；单独重跑 3.2 秒通过。该真实启动测试改为 15 秒超时。
- Desktop 默认高并发测试出现 14 项 5 秒超时；降低并发并提高单项超时后 836 个可收集测试通过，随即发现一个遗漏的旧 `core-tool-ports` 测试 import。改为新图片生成 Host port 后该测试单独通过。完整 Desktop 复跑结果为 834/837 通过、3 项既有 UI 长耗时测试超时；三个文件改用单 worker / 30 秒复核，27/27 通过；多 worker 情况仍会受机器负载影响。
- `pnpm check:docs` 被既有 `20260926-site-homepage-redesign.md` 的 active 顶部完成状态拦住；该计划仍有独立的 T10 待完成，本任务未改动它。

## 推迟事项

- Plan Profile / preset 的设计与 UI：按用户确认留给后续大设计。
- 真实 Provider、Chrome/Browser、Electron packaged、签名与公证：不在本轮自动化验收范围。
