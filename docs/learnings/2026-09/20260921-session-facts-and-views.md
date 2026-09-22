# 共享事实，不必共享视图

一个 Agent 会话同时有聊天、执行轨迹和工具卡片。最容易产生的误解是：既然事实源只有一个，所有页面就必须使用同一个大 ViewModel。实际应共享的是事实和身份，而不是展示结构。

例如 `tool/result` 记录工具调用完成。聊天把它折叠成一行，轨迹按 seq 展示请求和结果，工具卡片显示文件 diff。三者可以分别转换同一事件；但 title、todo 和累计 usage 应由 Host 计算，因为它们需要跨分页、跨重连、跨客户端保持一致。

判断一个状态放在哪里，可以问：只拿当前窗口是否足够算对？如果加载较早消息会改变累计 usage，说明把全会话事实错误地放到了窗口投影中。如果切换 Chat/Trajectory 必须重新请求 title，说明领域状态被展示组件占有了。

checkpoint 也不是第二个事实源。它保存 reducer 内部状态和所消费的 Journal 水位：恢复后继续折叠尾部，结果应与完整 replay 相同。只保存展示 value 往往不够，例如 usage 去重还需要已计入的 requestId。definition 语义改变必须使旧 checkpoint 失效。

还有两个容易混淆的水位：全会话 facts 可能到 seq 900，而刚取到的历史页只覆盖 100–199。历史页可以补充事件窗口，却不能把最新 title、usage 或工具终态回退到旧值。accepted 与 durable 也要分开：事件已进入内存 Journal，不代表已经完成持久化 barrier。

自检：删除缓存是否仍能恢复同样 facts？翻历史页是否改变累计 token？切换视图是否丢失消息身份？如果答案分别不是“是、否、否”，就需要重新检查层次边界。

实践入口：[Session 投影切换执行摘要](../../exec-runs/20260921-session-projection-cutover/execution-summary.md)。
