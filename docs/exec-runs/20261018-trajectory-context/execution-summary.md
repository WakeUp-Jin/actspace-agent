# 轨迹上下文分类与子工具接线

2026-10-18；在当前分支实施，未提交。保留同分支已有存储、上下文面板等改动。

## 实现

- TRJ-01：user/context 概述显示开始时间，可切换本地时间/Unix。
- TRJ-02：父轨迹关联直接子会话的真实工具记录，提供子请求 Schema、子会话身份和父工具链接；历史/实时数据复用 Session store，加载失败和更早历史可见。
- 请求记录保留上下文来源。轨迹将固定系统提示词、规则、技能目录、已加载技能、运行信息和动态补充分开展示，按首次/更新/移除去重，提供原文、来源与差异。
- 模型角色保持原样；不依赖 XML 解析。系统详情可展开实际发送的完整 system 消息。旧记录或不可对应来源的记录回退全文。

## 自动化验证

| 范围 | 结果 |
| --- | --- |
| Context Engine | 25 项通过 |
| Runtime 历史投影 | 17 项通过 |
| Prompt | 10 项通过 |
| Desktop 全量 | 1960 项通过，7 项跳过 |
| 最后展示调整后定向复测 | 22 项通过 |
| 类型检查、依赖与 Electron/renderer 构建 | 通过 |
| frontend tokens/theme/renderer bridge | 通过 |
| 本轮文档定向检查 | 通过 |
| 全库文档检查 | 被既有归档 demo 断链阻挡 |

开始时间测试在修复前已实际失败，修复后通过。测试日志留在本地忽略的 `tmp/codex-acceptance/20261018-trajectory-context/checks/`。

## 真实界面验证

由 gpt-6.1-sol 在隔离数据目录、生产 renderer 的真实 Electron 中执行；旧会话为副本，新请求使用隔离工作区，包含真实 Provider 请求。逐点结果见[验收报告](acceptance-20261018.md)。R1/R3/R5 和 R6 的实测范围通过；R2/R4 部分通过：未主动加载技能正文，完整 system 折叠未展开；子工具展示通过但父委派失败。未将未覆盖项算作通过。

隔离应用已退出，临时数据及凭据已清理；两份原始会话日志哈希保持不变。

## 边界

父委派再次出现此前 OBS-01 的 DURABILITY_BLOCKED，子 read_file 已完成且可展示，不能据此宣布委派全链路通过。缺失元数据的旧日志不补造来源；只加载直接子 Session，不递归扫描所有后代。未覆盖场景和后续定位建议见[边界与问题](known-limits.md)。

设计契约已更新到[运行时投影规范](../../design-docs/agent-plugin-runtime/agent-spec-runtime-projection.md)。

## 后续闭环：OBS-01 已修复

上述失败是当时验收结果。后续已定位为任务查询重复打开 Ledger，误恢复运行中的子任务；现已修复所有权登记。Explore/Agent 真实调用与重载复验通过，详见[子委派修复记录](../20261018-subagent-durability/execution-summary.md)。
