# P5 执行摘要

状态：**P5 计划范围已完成并签收，2026-10-04。** 开发与自动化验证通过，U1–U9 由前两轮覆盖；B1/B2 修复经 gpt-6.1-sol 真实 Electron 定向复验通过，B3 误报已撤回并以不同配置实机校准。见 [第三轮报告](execution-summary.md)。整计划已归档至 completed；未 commit/push。

## 核心结果

- checkpoint 改为必需的 `session.checkpoint.flush()`，await 和失败传播保持；组合服务声明、Profile/cordis.yml 同步。
- Cordis native emit 为唯一通知分发，注册处隔离 throw/rejection；Run 不再为通知观察者持租约，观察者插件自己管理异步资源。
- 删除工具第二套 middleware，扩展统一走 Cordis hooks；权限、审批、checkpoint、结果事实、finalizer 与 lease 保持领域所有权。
- 独立 Host 装配/生命周期进入 `agent-host`；CLI 通过窄端口注入 Runtime，不增加循环依赖。正常/强停与启动失败清理有测试，上传维护停止后等待当前任务。
- 删除三个 CLI 空转发和 tools/runtime/contributions，产物测试迁至 agent-host。保留有独立职责的应用、调度、Run、Desktop 标题、Headless 退出和现有加载器。
- 文档以 Host 稳定基底、Harness 独立组合、Run 固定租约收敛。Patch 只生成完整新定义并独立装配；不接入共享实例实验，不实现自进化功能。

## 验证

- 整仓 typecheck/build 通过。
- 14 包/应用测试：324 通过、1 个条件用例跳过；Desktop：初始 1000 通过、2 跳过，B1/B2 修复后 1008 通过、2 跳过。
- 真实 Host 进程 7/7、CLI 进程 2/2、Harness SIGKILL 恢复 1/1 通过。
- 事件、包边界、退役路径、文档和契约矩阵门禁通过；修复基线中 2 项过时通知数量断言失败。
- 所有进程/Provider 均为本机夹具；自动化结果不包含真实外部 Provider 或云端部署。真实 Electron Computer Use 已覆盖 U1–U9，B1/B2 修复后定向复验通过，证据与自动化分开记录。

逐项证据见 [执行过程](phase-5-process.md)、[测试接替表](phase-5-test-map.md)和[事件/资源清单](phase-5-event-inventory.md)。

## 精简与统计

[before/after 报告](../20261004-agent-harness-p5/refactor-stats-after.md)使用独立统计槽：生产源文件减少 2 个，源代码净增 143 行，测试净增 322 行（已计入 B1/B2 修复及新增回归）。CLI 源码减少 99 行，工具减少 31 行；Host 的生命周期、在途维护与失败回收拆分增加 268 行。没有为减行数把不同职责合回去。

总体架构、Cordis ABI、Loop surface 三份正式文档净减 269 行；新增过程、测试映射和交接等证据使 docs 总量上升，不把整体统计宣称为文档总量减少。统计包含当时工作树；无关前端文件未在本轮改变，docs 中 HTML 源码统计变化为 0。

## 数据与交接

用户设置、凭据、prompts、远端连接和真实运行历史未清理；没有修改设置格式。前端 space 设计及 myplan.md 等无关改动保持。

旧 P4 固定 Harness 的 Host 服务指纹与新版本可能不同；沿用旧 dataRoot 时应按现有 blocked/授权恢复机制处理，不能静默载入旧不兼容实例。本轮没有替用户重置数据，也未实机验证升级路径。CU 主路径使用新的隔离环境，重启时复用该环境验证设置保留。

本轮 `gpt-6.1-sol` 已完成 B1/B2 定向复验与 B3 校准，没有新 Bug。远端文件夹具与本机共用工作区，不能仅凭 UI 路径宣称完全排除串读；该限制保留在第二轮报告。

## 最终收尾

P1–P5 整计划已迁入 [completed](../../exec-plans/completed/20261003-agent-harness-host-refactor/README.md)，同步计划索引和引用；删除清单及旧产物缺失再次核对。验收使用本机 Provider/Host，真实云部署、手机 Web、自进化具体工作流不在本次交付内。设置与用户数据未清理，未提交。
