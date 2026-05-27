# Lab 数据模型

本文档定义 Lab 的核心数据对象。字段命名用于表达设计意图，不代表最终 TypeScript 契约已经确定。

## Experiment

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

## Origin

实验来源。

| 来源 | 含义 |
|---|---|
| `manual` | 用户手动创建 |
| `main-agent` | 主 Agent 在交互任务中提出 |
| `kairos` | Kairos 后台观察后提出 |
| `failed-task` | 某次任务失败触发 |
| `follow-up` | 从另一轮实验派生 |
| `imported` | 从外部记录导入 |

## Stage Record

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

## Evidence

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

## Artifact

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

## Review

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

## 存储方向

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

