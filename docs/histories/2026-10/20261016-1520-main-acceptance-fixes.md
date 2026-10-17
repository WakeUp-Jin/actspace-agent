# 统一验收 MN01–MN04 修复

用户确认修复统一验收发现的4个Bug；O01性能观察不在本轮范围，不提交代码。

- MN01：状态基础类移除文本颜色；正常、错误各选择一个语义颜色，避免错误红色被灰色覆盖。
- MN02：终止/失败保留已聚合非工具调用内容，以同messageId写入消息及surface；流抛异常保留局部聚合，停止后静默EOF也按aborted结算。未完成工具调用不执行。
- MN03：llm/retry结算失败请求耗时，清空起点排除等待时间；新请求清首token；sessionStats版本升3，旧缓存重放。3秒失败加4秒成功共7秒。
- MN04：搜索Esc/主动关闭回到触发器，空搜索失焦关闭不抢外部焦点。

已增加正式回归测试，并确认原实现失败、修复后通过。工程与界面结果见 `docs/exec-runs/20261016-main-acceptance-fixes/execution-summary.md`。原验收报告保留当时结果，不把历史失败改写为历史通过。

本轮命中可迁移、陷阱和模式，学习记录见 `docs/learnings/2026-10/20261016-stream-terminal-persistence.md`。
