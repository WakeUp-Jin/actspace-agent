# DSH-native Plugin Runtime 计划重定向

状态：已整合到新的核心重构计划，等待用户审核统一入口

本目录由前一轮 DSH-native Boot 草案留下。为避免 active 计划索引出现悬空入口，保留一个重定向文件；本目录不再拥有独立实现步骤。

新的唯一实施入口是 [ActSpace DSH Agent Loop / Session / Tool Shell 核心重构](../20260829-actspace-dsh-core-rebuild/README.md)，它继承本文档中 Cordis-native Boot、`cordis.yml`、AgentLoop Service 和 Host-neutral RuntimeHandle 的有效方向，并明确取代 Session 事件、Agent Loop 插入面、Tool shell 和 CLI run 的旧约束。

## 生命周期

- 原草案日期：2026-08-29。
- 整合原因：同一轮重构需要把 Boot/插件组装与 Session/Loop/Tool 核心放进一个有依赖关系的执行计划，避免两个 active 入口各自定义事件和启动顺序。
- 后续动作：用户批准核心重构计划后，所有实现和执行记录只写入 `20260829-actspace-dsh-core-rebuild`。
