# Session 三类读模型统一

日期：2026-09-22

## 用户诉求

结合 DSH 的 Session Event Journal、Host Projection Registry、Projection Cache 和 Client target projection 思路，统一 ActSpace 当前 Session 读取边界，保留 Global、Session、Window 三种数据模式，并清理未使用的兼容读取路径。

## 主要变更

- 为 Todo Journal 增量写入建立 shared canonical reducer，修复 Host 与 TodoService 对部分更新和遗漏条目的语义分叉。
- 在 shared/runtime-v2 定义 Global summary、Session observation、Window support/deferred detail 和 accepted/durable/projection/window/index 水位。
- Runtime/Host 提供一次性 observation；Desktop IPC、preload 和 renderer bridge 复用同一读取切面。
- 新增可删除的 Global Session Index 与 Global Usage Index；索引只在 durable flush 后发布，删除或损坏后从 Journal 重建。
- Window 增加事件数和 JSON 字节上限，大型工具正文改为 deferred detail；Client store 增加 equal-seq 幂等和 conflict resync 语义。
- 增加 P0 parity、Global Index、observation、Window cap、Usage cache、client revision tests，并同步设计规范与执行记录。

## 设计动机

Journal 保持唯一事实源；Registry 只维护完整 Session 派生事实；Global Index 只保存跨 Session 查询需要的摘要和 Usage rows；Window 只负责有限历史展示。这样历史分页不会覆盖 title/todo/usage，Chat、Trajectory 和 Tool Card 可以分别解释同一 raw window。

## 验证与边界

### 后续 Usage 冗余清理

- 经用户确认，删除 `chat.ts` 中旧 `projectUsageStatistics`、`projectUsageActivity`、专用 rows/distribution helper、旧固定汇率转换和失去引用的 imports。
- 保留索引重建实际使用的 `projectSessionUsageActivities`；测试通过 activity rows 输入直接调用 `projectIndexedUsageActivity`，不保留旧 API wrapper。
- 在 Session 三类读模型规范中增加当前模块 Mermaid 流程图，标明 Global、Session、Window、可删除缓存、IPC 和 Client 展示路径；Goal 尚无 producer，Tool Card 当前由 Chat 组装调用。
- 验证：client build/typecheck、Desktop 双 tsconfig typecheck 通过；client 7 个测试、Desktop projection/Usage cache 定向 20 个测试通过。此清理未重新执行 Desktop 全量测试或 Electron 人工验收。
- 本次为已记录的读模型迁移收尾，不新增独立学习文档。

相关 package typecheck 和测试通过，Desktop typecheck 通过，Desktop 其余 104 个测试文件通过。`app-streaming-user-message.test.tsx` 仍有 31 个既有 UI fixture 失败，Electron packaged、真实 Provider、长 Journal 性能和手工 UI 验收保留给外部门禁。
