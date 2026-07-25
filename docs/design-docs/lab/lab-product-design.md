# Lab 产品模型

> 长期设计事实来源。本文档定义 Lab 的产品定位、实验生命周期、核心数据对象、晋升评审和安全边界。

## 一句话定义

Lab 是 actspace 中用于让 Agent 以实验方式增长长期能力的工作台。每一轮实验都从想法或能力缺口出发，经过假说、实证、锻造和晋升，最终产出 skill、CLI、内部工具、文档、测试集，或一份可复用的失败经验。

## 设计动机

当前 Agent 很多能力仍依赖开发者提前整理：

- 人类为它梳理现实世界规则。
- 人类为它准备数据、工具、权限和运行环境。
- 人类为它总结方法，再写成 prompt、skill 或代码。

这会形成两个限制：

- Agent 的能力增长受限于人类是否已经知道该帮它搭什么桥。
- 人类也不一定知道哪些桥最有价值，很多能力缺口只有 Agent 在实践中反复碰壁后才会暴露。

Lab 想解决的是：让 Agent 拥有类似现实研发的实验能力。它可以发现缺口、提出假说、实践验证、沉淀经验，并把可验证的方法锻造成长期能力。

## North Star

理想状态下，Lab 是一个 Agent 能力研发系统：

```txt
发现能力缺口
-> 形成理论和假说
-> 设计实验
-> 在受控环境实践验证
-> 总结证据和经验
-> 锻造成长期能力候选
-> 通过评审后进入能力池
```

Lab 不是普通任务看板，也不是工具商店。它的核心价值是保留能力增长的因果链：

```txt
为什么需要这个能力
为什么认为这个方案可行
怎么验证它可行或不可行
产物是什么
风险和适用边界是什么
凭什么允许它进入长期能力池
```

## 核心概念

### 实验矩阵

Lab 的主界面是一张实验矩阵：

```txt
一行 = 一轮实验
一列 = 一个生命周期阶段
一个单元格 = 该实验在该阶段的记录、证据、产物或决策
```

阶段固定为：

```txt
假说构建 -> 实证验证 -> 能力锻造 -> 晋升评审
```

UI 短标签可以使用：

```txt
假说 -> 实证 -> 锻造 -> 晋升
```

### 一轮实验

一轮实验不是一个任务，而是一条能力从不确定到可复用的研发记录。

实验可以来自：

- 用户手动创建的想法。
- Main Agent 在任务中发现的能力缺口。
- Kairos 后台发现的重复失败、重复劳动或低效流程。
- 既有实验的后续分支。

### 长期能力

Lab 可以产出多种形态：

- `learning`：学习文档或经验总结。
- `skill`：可被 Agent 触发的 `SKILL.md`。
- `cli`：Rust CLI 或其他命令行工具。
- `tool`：`agent-core` 内部工具候选。
- `script`：仓库脚本或一次性验证脚本。
- `dataset`：测试样例、评估集或 fixtures。
- `prompt`：可版本化 prompt 模板。
- `doc`：架构、规则或流程文档。

不同产物有不同晋升门槛。文档和 learning 可以低风险沉淀；CLI、tool、自动化执行能力必须经过更严格的测试和审批。

## 角色关系

### 人类

- 定义方向和价值判断。
- 批准高风险实验。
- 审查长期能力是否可以启用。
- 纠正 Agent 对现实约束、风险和优先级的误判。

### Main Agent

- 在交互任务中发现能力缺口。
- 创建或更新实验。
- 使用已经晋升的能力。
- 在用户确认后把一次聊天中的经验迁移到 Lab。

### Kairos

- 后台观察重复失败、重复需求、低效流程和可自动化机会。
- 建议创建实验。
- 可以推进低风险资料整理和候选假说。
- 不自动晋升能力。

### Lab Runtime

- 管理实验生命周期。
- 持久化阶段记录、证据、产物和评审决策。
- 编排受控实验执行。
- 把候选能力送入 Promotion Gate。

## 非目标

Lab 不应在早期承担这些职责：

- 不做无审批的自我改造系统。
- 不允许一次实验直接修改主 Agent 默认能力池。
- 不把所有临时想法都永久沉淀为 skill 或工具。
- 不替代 `docs/exec-plans/`，复杂实现仍要单独写 execution plan。
- 不替代 Kairos。Kairos 是后台主动 Agent，Lab 是能力研发与晋升系统。
- 不替代 ToolManager。ToolManager 执行工具，Lab 管理实验和能力产物生命周期。

## 最终形态

成熟的 Lab 应该让用户看到一个活的能力研发系统：

- 哪些能力缺口正在被研究。
- 哪些假说已经有证据。
- 哪些原型可以复现。
- 哪些 skill / CLI / tool 候选正在等待评审。
- 哪些能力已经毕业进入主 Agent 或 Kairos 可用能力池。
- 哪些失败实验被保留下来，避免未来重复踩坑。

用户不需要替 Agent 手工搭建每座桥，但仍保留方向、授权和最终评审权。

## 生命周期总览

```txt
创建实验
-> 假说构建
-> 实证验证
-> 能力锻造
-> 晋升评审
-> 毕业 / 驳回 / 废弃 / 继续实验
```

主界面上，每一行是一轮实验，每一列是一个阶段。

```txt
实验 A | 假说卡 | 验证记录 | Rust CLI 原型 | 待人工批准
实验 B | 假说卡 | 失败证据 | 空           | 空
实验 C | 假说卡 | 验证记录 | Skill 草稿    | 已晋升
```

### 阶段 1：假说构建

目标：把模糊想法变成可验证问题。

输入可能是：

- 用户想法。
- Agent 任务失败。
- Kairos 发现的重复模式。
- 已有实验的后续问题。

必须产出：

- `question`：要解决的问题。
- `capabilityGap`：当前缺失的能力。
- `hypothesis`：为什么某种方案可能有效。
- `successCriteria`：怎样算验证成功。
- `initialRisk`：初步风险和权限需求。

常见操作：

- 搜索资料。
- 读取项目文档。
- 分析历史失败记录。
- 生成多个候选假说并收敛为主假说。

进入下一阶段的条件：

- 有明确假说。
- 有可执行的验证方案。
- 成功标准不是纯主观描述。

### 阶段 2：实证验证

目标：用可复现证据验证假说。

必须产出：

- `experimentPlan`：实验步骤。
- `environment`：实验位置、沙箱、依赖和权限边界。
- `commands`：关键命令或工具调用。
- `observations`：观察到的结果。
- `result`：通过、失败、部分通过或需要继续实验。

证据可以包括：

- 命令输出。
- 日志片段。
- 测试结果。
- 输入输出样例。
- 截图或渲染结果。
- 外部资料引用。

进入下一阶段的条件：

- 有足够证据支持一个可复用方案。
- 失败原因被记录清楚，且不是偶然误跑。
- 实验可以被人或 Agent 复现。

### 阶段 3：能力锻造

目标：把验证过的方法包装成长期能力候选。

可能产物：

- skill 草稿。
- Rust CLI 原型。
- 内部工具候选设计。
- 仓库脚本。
- 学习文档。
- 评估样例。
- prompt 模板。

必须产出：

- `artifactType`：产物类型。
- `artifactPath` 或 `artifactRef`：产物位置。
- `usageContract`：如何使用。
- `knownLimits`：适用范围和限制。
- `verification`：产物级验证方式。

进入下一阶段的条件：

- 产物不是只存在聊天记录里。
- 有基本使用说明。
- 有最小验证方式。
- 风险和适用边界被写明。

### 阶段 4：晋升评审

目标：决定候选能力是否可以进入长期能力池。

评审项：

- 是否解决原始能力缺口。
- 是否有足够证据。
- 是否有测试或可复现验证。
- 是否引入安全、隐私、供应链或权限风险。
- 是否需要人工审批。
- 是否应该只作为文档沉淀，而不是启用能力。

可能决策：

- `promoted`：晋升为长期能力。
- `candidate`：保留候选，等待更多验证。
- `rejected`：不晋升，但保留记录。
- `abandoned`：废弃实验。
- `continue`：回到前一阶段继续实验。

## 实验状态

实验整体状态建议：

| 状态 | 含义 |
|---|---|
| `draft` | 刚创建，问题还未收敛 |
| `active` | 正在推进 |
| `blocked` | 等待用户、权限、依赖或外部条件 |
| `candidate` | 有产物，等待评审 |
| `promoted` | 已晋升 |
| `rejected` | 评审不通过 |
| `abandoned` | 主动废弃 |
| `archived` | 历史保留，不再展示在默认矩阵 |

## 阶段回退

Lab 必须允许回退。

常见回退：

- 实证失败 -> 回到假说构建。
- 锻造发现产物不可维护 -> 回到实证验证。
- 晋升评审发现风险过高 -> 回到能力锻造或废弃。

回退时不能覆盖旧记录，应追加新的阶段记录。失败记录本身是 Lab 的重要产物。

## 数据模型

字段命名用于表达设计意图，不代表最终 TypeScript 契约已经确定。

### Experiment

一轮实验的主对象。

```ts
type LabExperiment = {
  id: string;
  title: string;
  status: LabExperimentStatus;
  origin: LabExperimentOrigin;
  createdAt: string;
  updatedAt: string;
  ownerAgent?: "main" | "kairos" | "user";
  question: string;
  capabilityGap: string;
  hypothesis?: string;
  successCriteria?: string[];
  stages: LabStageRecord[];
  artifacts: LabArtifact[];
  evidence: LabEvidence[];
  review?: LabReview;
  tags?: string[];
};
```

### Origin

实验来源。

| 来源 | 含义 |
|---|---|
| `manual` | 用户手动创建 |
| `main-agent` | 主 Agent 在交互任务中提出 |
| `kairos` | Kairos 后台观察后提出 |
| `failed-task` | 某次任务失败触发 |
| `follow-up` | 从另一轮实验派生 |
| `imported` | 从外部记录导入 |

### Stage Record

每个阶段可以有多条记录，避免覆盖历史。

```ts
type LabStageRecord = {
  id: string;
  experimentId: string;
  stage: "hypothesis" | "verification" | "forge" | "promotion";
  status: "empty" | "draft" | "running" | "done" | "blocked" | "failed";
  summary: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author: "user" | "main-agent" | "kairos" | "system";
  evidenceIds?: string[];
  artifactIds?: string[];
};
```

### Evidence

证据是实验能否晋升的基础。

```ts
type LabEvidence = {
  id: string;
  experimentId: string;
  kind:
    | "command-output"
    | "tool-result"
    | "test-result"
    | "log"
    | "screenshot"
    | "external-reference"
    | "code-diff"
    | "manual-note";
  summary: string;
  ref?: string;
  content?: string;
  createdAt: string;
};
```

设计约束：

- 大体积原始输出不应直接塞入主对象，可以用 `ref` 指向文件或 artifact。
- 证据需要能反查到阶段记录。
- 用于模型上下文的证据摘要要裁剪，避免上下文膨胀。

### Artifact

产物是实验锻造出的候选能力或知识沉淀。

```ts
type LabArtifact = {
  id: string;
  experimentId: string;
  type:
    | "learning"
    | "skill"
    | "cli"
    | "tool"
    | "script"
    | "dataset"
    | "prompt"
    | "doc";
  status: "draft" | "verified" | "candidate" | "promoted" | "rejected";
  title: string;
  path?: string;
  ref?: string;
  usageContract?: string;
  knownLimits?: string[];
  verification?: string[];
  createdAt: string;
  updatedAt: string;
};
```

### Review

晋升评审记录。

```ts
type LabReview = {
  id: string;
  experimentId: string;
  decision: "promoted" | "candidate" | "rejected" | "abandoned" | "continue";
  reviewer: "user" | "system" | "main-agent";
  summary: string;
  requiredChecks: LabReviewCheck[];
  riskLevel: "low" | "medium" | "high";
  approvedAt?: string;
  createdAt: string;
};
```

```ts
type LabReviewCheck = {
  id: string;
  label: string;
  status: "passed" | "failed" | "not-applicable" | "needs-human";
  evidenceIds?: string[];
  note?: string;
};
```

### 存储方向

长期倾向：

```txt
lab/
  experiments/
    <experiment-id>/
      experiment.json
      stages.jsonl
      evidence/
      artifacts/
      review.json
  index.json
```

V0 可以先不实现最终目录结构，但数据模型应保持同一方向：实验主对象轻量，阶段、证据、产物、评审可追加、可追溯。

## 晋升与安全原则

- 没有证据，不晋升。
- 没有边界，不默认启用。
- 可执行能力必须比纯文档有更高门槛。
- 高风险动作必须人工审批。
- 失败实验也要可追溯，避免未来重复尝试。

### 风险分层

| 风险 | 例子 | 默认策略 |
|---|---|---|
| 低 | learning、普通 docs、只读资料整理 | 可快速沉淀，仍需来源记录 |
| 中 | skill、prompt、dataset、脚本草稿 | 需要基本验证和人工确认 |
| 高 | CLI、内部工具、自动编辑文件、外部网络写入 | 需要沙箱验证、测试和明确审批 |
| 极高 | 凭据处理、网络发布、依赖安装、系统级操作 | 默认禁止，除非单独设计权限方案 |

### 晋升门槛

候选能力至少应具备：

- 原始问题和能力缺口。
- 假说和成功标准。
- 验证证据。
- 使用契约。
- 已知限制。
- 风险说明。
- 回滚或禁用方式。

CLI 和内部工具还需要：

- 可运行验证命令。
- 最小测试集。
- 输入输出边界。
- 错误输出规则。
- 权限需求说明。

### 人工审批

这些情况必须人工审批：

- 产物会进入主 Agent 默认能力池。
- 产物会被 Kairos 后台使用。
- 产物包含可执行代码。
- 产物需要新增依赖或下载外部制品。
- 产物会读写 workspace 以外路径。
- 产物会处理隐私、密钥或外部账号数据。

### 沙箱原则

Lab 的理想实验环境应满足：

- 与主 workspace 有明确边界。
- 所有命令、输入、输出可记录。
- 可以清理或归档。
- 可以限制网络、文件和环境变量访问。
- 可以复现实验。

V0 不要求完整沙箱，但文档和数据模型必须为未来沙箱预留字段。

### 产物启用策略

建议采用渐进启用：

```txt
draft -> verified -> candidate -> manually enabled -> default enabled
```

默认不允许：

- 实验完成后自动启用工具。
- Kairos 自动把候选能力加入自身工具集。
- 没有评审记录的 CLI 被主 Agent 当作长期工具调用。

### 失败处理

失败实验不能只删除。

至少记录：

- 失败原因。
- 失败发生在哪个阶段。
- 是否可重试。
- 未来重试需要满足什么条件。
- 是否有可迁移经验。

失败记录可以转成 learning，帮助后续 Agent 避免重复走弯路。
