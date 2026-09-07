# Agent 分析观测功能退役记录

> 状态：2026-09-06 已退役，不再作为当前产品实现规范。

设置中的“分析观测”、会话索引、独立详情工作区及专用 Analysis / Trace IPC、DTO、投影与前端原型已删除。旧设计可通过 Git 历史追溯。

聊天、Trajectory、Context 和 Usage 继续消费 Session Journal；本次退役不删除用户 Journal、Artifact 或会话数据，也不改变 Runtime 的事件记录与安全边界。

当前入口：

- [设置页规范](front-设置页规范.md)
- [存储与可观测性](../core-storage-and-observability.md)
- [Agent Run 与 Turn 分层](../agent-runtime/agent-turn-layers.md)
