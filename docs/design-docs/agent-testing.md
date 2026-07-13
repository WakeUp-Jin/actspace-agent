# 后端 Agent 测试设计

## 当前状态

agent-core 后端模块化架构（llm/tools/context/engine/persistence）已就位，本文档定义其测试策略和目录约定。

## 测试策略

三层分级：

| 层级 | 目标 | 运行频率 |
| --- | --- | --- |
| 端到端 smoke | 用 mock LLM 跑通 Agent.run 全链路，确认各模块串联正确 | 每次代码变更 |
| 模块集成 | 验证 engine 执行循环、ContextManager 编排等模块级行为 | 每次代码变更 |
| 单元测试 | 验证消息工具函数、注册表、适配器转换、JSONL 读写等 | 每次代码变更 |

测试框架：vitest

## 目录约定

```
packages/agent-core/
  src/
    llm/test/             # LLM 服务层测试
    tools/test/           # 工具系统测试
    context/test/         # 上下文管道测试
    engine/test/          # 执行引擎测试
    members/test/         # 持久 Member、配置版本与 Activity 投影测试
    room/test/            # Agent Room 调度、Draft、预算和恢复协议测试
    persistence/test/     # 持久化层测试
    test/                 # 跨模块类型测试 + 端到端 smoke
```

规则：
- 每个模块目录内创建 `test/` 子目录，源码与测试分离
- 顶层 `src/test/` 放跨模块的公共类型测试和端到端 smoke
- 每个 `test/` 目录内文件控制在 1-3 个
- 测试文件以 `.test.ts` 结尾
- tsconfig 的 `exclude` 排除 `src/**/test`，确保不编译进 dist

## 覆盖范围

### 端到端 smoke

- `src/test/smoke.test.ts`：MockLLMService + ToolManager + ContextManager + Agent → 完整 turn → 事件序列 + 最终回复 + usage
- `packages/agent-cli/src/test/run.test.ts`：无 `--out` 时 artifact-free；显式 `--out` 时写 result/trace/final response，以及 pre-LLM/final context snapshots。
- `packages/agent-cli/src/test/artifacts.test.ts`：context snapshot 文件名、字段和输出目录逃逸保护。

### 执行引擎

- `engine/test/loop.test.ts`：双层循环、abort 中止、shouldStopAfterTurn
- `engine/test/agent.test.ts`：Agent.run / Agent.runAndGetText

### LLM 服务

- `llm/test/mock-service.test.ts`：流式事件产出、stream→result 聚合
- `llm/test/base-convert.test.ts`：convertMessages 转换
- `llm/test/kimi-service.test.ts`：Kimi OpenAI-compatible 流式调用、auth 错误分类、thinking 参数策略，以及不再声明 provider-native `$web_search` 的回归。

### 工具系统

- `tools/test/manager.test.ts`：注册/查询/执行/裁剪/未知工具错误
- `tools/test/exposure.test.ts`：`exposeOnlyTo` / `requiresKey` 工具暴露规则；搜索 key 门控 `web_search`
- `tools/test/web-search-executor.test.ts` / `web-search-providers.test.ts` / `web-fetch-executor.test.ts`：web 工具双通道编排、provider 适配与本地抓取（见 `agent-web-tools.md`）

### 上下文管道

- `context/test/manager.test.ts`：编排、appendMessage、压缩判定、usageSnapshot
- `context/test/system-prompt.test.ts`：segment 注册/移除/优先级/core 保护

### 持久化

- `persistence/test/jsonl.test.ts`：appendEvent + parseJsonl 往返、坏行容错
- `persistence/test/meta.test.ts`：createMeta/readMeta/updateMeta/incrementTurnCount
- `persistence/test/recovery.test.ts`：recoverSession 多维恢复

### Agent Room

- `room/test/coordinator.test.ts`：用户广播/@定向、Agent @接力、cycle 替换、讨论上限、调用预算、失败隔离与级联 abort。
- `room/test/draft-manager.test.ts`：并发 Draft 原子提交、Held 新鲜度检查、revise/send/silence/force-send 和迟到 Draft 拒绝。
- `room/test/room-runtime.test.ts`：Room Input、结构化终止工具、只读工具权限、`read_room_log` 快照边界、三类事件出口与配置/私有历史恢复。

Room 自动化测试使用脚本化 Mock 控制完成顺序与结构化决策，不访问真实 provider。完整场景、UI 验收和真实模型体验指标以 `agent-form-room.md` 的“测试与验收策略”为准。

### Agent Members

- `members/test/registry.test.ts`：稳定 Member ID、Profile 原子写入、`configVersion` 递增和列表恢复。
- `members/test/activity.test.ts`：跨 Room Activity 关联、事件摘要裁剪、秘密脱敏和追加写恢复。
- `room/test/room-runtime.test.ts` 追加：Room 只保存 `memberId`，AgentRun 捕获 `memberConfigVersion`，不同 Room 的 Member 私有历史相互隔离。

Members 页面、四个详情 Tab 和 Workspace/Reminders 占位验收以 `agent-members.md` 为准。

### 类型与适配器

- `src/test/messages.test.ts`：getTextContent/getToolCalls/hasToolCalls/accumulateUsage
- `src/test/internal-tools.test.ts`：InternalToolRegistry/toToolDefinition
- `src/test/adapters.test.ts`：Message↔SessionEvent 双向转换一致性

## 运行命令

```bash
# 运行 agent-core 全部测试
pnpm --filter @actspace/agent-core test

# 监听模式
pnpm --filter @actspace/agent-core test:watch

# 全仓库测试
pnpm test
```
