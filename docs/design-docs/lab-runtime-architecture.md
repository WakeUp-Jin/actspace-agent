# Lab 运行架构

本文档描述 Lab 与 actspace 现有 Agent Runtime、Kairos、工具系统和能力产物的关系。

## 总体关系

```txt
Main Agent
  -> 发现能力缺口
  -> 创建 / 更新 Lab 实验
  -> 使用已晋升能力

Kairos
  -> 后台观察重复失败和机会
  -> 建议创建 Lab 实验
  -> 推进低风险资料整理

Lab Runtime
  -> 管理实验生命周期
  -> 持久化阶段、证据、产物和评审
  -> 编排受控验证和锻造流程

ToolManager
  -> 提供 read / grep / glob / bash / edit / write 等执行能力
  -> 执行权限和输出裁剪

Capability Registries
  -> skills
  -> CLI tools
  -> internal tools
  -> docs / learnings / datasets
```

## 分层职责

| 层 | 职责 |
|---|---|
| Renderer | 实验矩阵、详情面板、人工审批、产物预览 |
| Main Process | IPC、workspace 路径、Lab 本地目录初始化、权限桥接 |
| agent-core Lab Runtime | 实验状态机、阶段记录、证据索引、晋升规则 |
| ToolManager | 受控工具执行、权限审核、输出裁剪 |
| Persistence | 本地实验数据、产物和评审记录 |

## 与 Main Agent 的关系

Main Agent 可以：

- 根据用户要求创建实验。
- 在任务失败后建议创建实验。
- 把当前会话中的方法总结为实验记录。
- 使用已晋升的 skill、CLI 或工具。

Main Agent 不应该：

- 绕过 Lab 评审直接启用候选能力。
- 把没有证据的聊天结论当作已验证能力。
- 自动执行高风险锻造或晋升动作。

## 与 Kairos 的关系

Kairos 更适合做观察者和提醒者：

- 发现重复失败。
- 发现反复出现的用户需求。
- 发现某类任务经常需要同样手动步骤。
- 生成实验候选。

Kairos 可以在低风险范围内推进：

- 整理资料。
- 汇总历史记录。
- 草拟假说。
- 提醒用户有候选实验等待处理。

Kairos 不应自动：

- 晋升能力。
- 修改主 Agent 默认工具集。
- 写入高风险可执行产物。

### 与 Kairos 的 V0 通信

Lab Runtime 与 Kairos 的 V0 通信只走 Kairos 文件收件箱，不引入消息总线或跨 Agent 实时对话。Lab 需要 Kairos 后台继续观察实验、等待更多证据、提醒用户决策或记录 blocked 原因时，通过 `packages/agent-core/src/kairos/inbox.ts` 的 `appendKairosInboxMessage({ source: "lab-agent", ... })` 追加到 `<userData>/kairos/inbox/lab-agent.md`。

Kairos 每次 tick 主动读取该文件，并把它当作观察信号和 Lab 候选线索；它不能因为 inbox 内容自动晋升能力、修改默认工具集或执行高风险锻造动作。Lab Runtime 尚未落地前，`lab-agent.md` 只是预留入口和手动占位文件。

## 与 ToolManager 的关系

Lab 不重新实现工具执行。它通过现有 ToolManager 和 Agent Loop 获得执行能力。

区别在于：

- Lab 记录每次实验执行的证据。
- Lab 对实验执行增加更强的可追溯性。
- Lab 在候选能力晋升前增加评审门槛。

未来可能需要给 ToolScheduler 增加 `callerAgent: "lab"`，从而和 `main` / `kairos` 区分权限策略。

## 与能力产物的关系

Lab 产物需要进入不同 registry：

```txt
skill -> skills directory / skill registry
cli -> scripts or managed binary directory
tool -> agent-core tool registry candidate
doc -> docs/
learning -> docs/learnings/
dataset -> test fixtures or eval datasets
prompt -> prompt templates
```

每种产物的晋升方式不同。Lab 的职责是保存来源、证据和评审决策，而不是把所有产物强行纳入同一种格式。

## 持久化方向

Lab 数据应优先本地落盘，符合 actspace 当前本地优先策略。

建议长期结构：

```txt
<userData or workspace lab root>/
  lab/
    experiments/
    artifacts/
    index.json
    settings.json
```

是否落在 Electron `userData` 还是 workspace 内，需要在实现计划中根据可迁移性和项目归属再定。
