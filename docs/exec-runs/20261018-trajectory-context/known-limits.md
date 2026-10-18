# 验收边界与后续问题

## 父委派持久化失败（延续 OBS-01）

本次真实 Provider 验收再次出现两次 `TOOL_EXECUTION_FAILED / DURABILITY_BLOCKED / phase=body`。两个子会话各有一次 completed 的 read_file，父工具却失败。父轨迹能够正确关联并显示这些子工具及各自 Schema，因此“子工具缺失”修复与“委派整体成功”必须分开判断。

主机检查确认这不是“没有执行工具”的情况。TaskLedger 会将提交/投影/flush 阶段的失败统一包装为 DURABILITY_BLOCKED，现有持久化 failure 没有保留底层 cause，当前证据不足以认定具体根因。此问题此前已在[原验收问题 OBS-01](../20261018-trajectory-system-prompt/acceptance-issues-20261018.md)出现，本次没有修改存储模块来猜测修复。

本地脱敏结构证据：`tmp/codex-acceptance/20261018-trajectory-context/runtime-evidence.json`。后续应在 TaskLedger 失败点保留底层 cause 的脱敏诊断，用独立的委派持久化测试复现。

## 功能边界

- 直接子 Session 工具可加载；不递归扫描孙会话。
- 初始读取受现有窗口限制，更早子工具需显式加载。分页/失败按钮与真实故障注入的覆盖范围以验收表为准。
- 旧记录没有结构化来源时回退原系统全文，不尝试解析标签补造历史来源。
- 元数据预算不足或请求经适配器改写时回退全文。
- 全库文档检查仍被已完成的旧前端重构计划指向已不存在 demo 目录的链接阻挡；本轮文档定向检查通过。

## 后续闭环：OBS-01 已修复

上述失败是当时验收结果。后续已定位为任务查询重复打开 Ledger，误恢复运行中的子任务；现已修复所有权登记。Explore/Agent 真实调用与重载复验通过，详见[子委派修复记录](../20261018-subagent-durability/execution-summary.md)。
