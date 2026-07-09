# Agent 评估执行计划

状态：active

设计来源：`docs/design-docs/agent-evaluation.md`

## 目标

为 ActSpace 建立可度量的 Agent 评估路径，让 Agent 优化可以通过可运行数据集验证，而不是依赖主观感觉。

实施拆成两个产品边界：

1. ActSpace 提供围绕 `agent-core` 的 `actspace-agent` CLI、包含 `yolo` 的权限模式，以及显式 artifact 输出契约。
2. 外部 `actspace-agent-eval` 项目负责 Docker 优先评估、数据集、夹具项目、评分器、报告和基线对比。

## 非目标

- 本计划不评估 Electron renderer UI。
- 不替代现有 `vitest` 模块测试。
- 不让 `actspace-agent-eval` import `agent-core` 私有内部实现。
- 不让普通 ActSpace CLI 或桌面端运行写评估产物。
- 不在 ActSpace 原生数据集可用前实现外部基准适配器。

## 必读文档

开始实施前先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/design-docs/agent-evaluation.md`
- `docs/design-docs/agent-current-module-map.md`
- `docs/design-docs/agent-testing.md`
- `docs/design-docs/agent-权限设计规则和原则.md`
- `docs/design-docs/agent-tool-approval-pause-resume.md`
- `docs/design-docs/agent-bash-policy-allowlist-design.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`

## 共享契约

以下契约需要在 ActSpace 和 `actspace-agent-eval` 之间保持稳定。

### Agent CLI 契约

初始命令形态：

```bash
actspace-agent run \
  --input task.md \
  --workspace /workspace \
  --permission-mode yolo
```

可选结构化 stdout：

```bash
actspace-agent run \
  --input task.md \
  --workspace /workspace \
  --permission-mode yolo \
  --json
```

可选评估产物输出：

```bash
actspace-agent run \
  --input task.md \
  --workspace /workspace \
  --permission-mode yolo \
  --out /eval-output
```

契约规则：

- 没有 `--out` 就没有评估产物文件。
- `--out` 只能写入请求的输出目录。
- CLI 默认 stateless 执行，不能悄悄使用桌面端 session storage。
- 默认模式下 CLI 将 Agent 最终回复输出到 stdout。

### 权限模式契约

```ts
type PermissionMode = "default" | "trusted" | "yolo";
```

契约规则：

- `default` 保持高风险操作的交互式审批行为。
- `trusted` 允许普通 workspace 写入，但仍保护高风险动作。
- `yolo` 自动批准 workspace-local eval 操作。
- `yolo` 不能绕过 workspace、secret-path 或 network 硬边界。

### 评估产物契约

只有 `--out` 创建评估产物：

```text
result.json
trace.jsonl
final-response.md
git-diff.patch
command-results.json
context-snapshots/
grader-results.json
```

第一版 ActSpace 实现可以只输出首个外部运行器需要的子集，但如果文件名变更，必须同步更新 `docs/design-docs/agent-evaluation.md`。

## 阶段 1：ActSpace Agent CLI 基础

### 任务 1.1：确定 CLI 包位置

状态：completed

需要检查的文件：

- `package.json`
- `pnpm-workspace.yaml`（如果存在）
- `packages/agent-core/package.json`
- `packages/agent-core/src/index.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/agent-core/src/engine/agent.ts`

实施决策：

- 如果能保持运行依赖清晰，优先新增 `packages/agent-cli`。
- 如果新增 package 过重，才考虑在 `packages/agent-core` 下增加 CLI entry，并记录原因。

验证方式：

- package 能按仓库现有 TypeScript 约定构建。
- CLI entry 只 import `@actspace/agent-core` public exports，或 import 明确记录过的内部 bootstrap helper。

### 任务 1.2：实现最小 `run` 命令

状态：completed

预期行为：

- 接收 `--input`。如果 inline text 和 file path 语义容易混淆，就拆成 `--input` 与 `--input-file`。
- 必须接收 `--workspace`。
- 接收 `--permission-mode`。
- 接收 `--json`。
- 接收 `--out`。
- 执行一次 Agent 任务，并返回最终回复。

可能改动的文件：

- `packages/agent-cli/package.json`
- `packages/agent-cli/tsconfig.json`
- `packages/agent-cli/src/cli.ts`
- `packages/agent-cli/src/run.ts`
- root `package.json` scripts（如果需要）

验证命令：

```bash
pnpm --filter @actspace/agent-cli build
pnpm --filter @actspace/agent-cli run -- --help
```

首个冒烟测试使用 mock 或测试模式模型接线，不要求真实 provider。

### 任务 1.3：增加显式评估产物写入器

状态：completed

预期行为：

- 没有 `--out`：不创建评估产物目录。
- 有 `--out`：只写入请求的输出目录。
- 起步输出 `result.json`、`trace.jsonl` 和 `final-response.md`。
- `context-snapshots/`、`git-diff.patch`、`command-results.json` 等文件等对应运行时 hook 存在后再补。

可能改动的文件：

- `packages/agent-cli/src/artifacts.ts`
- `packages/agent-cli/src/run.ts`
- `packages/agent-cli/src/test/` 下测试文件

验证命令：

```bash
pnpm --filter @actspace/agent-cli test
```

必测 case：

- 不传 `--out` 时不写评估文件。
- 传 `--out` 时写预期文件。
- `--out` 不能通过 path traversal 写到意外路径。

### 任务 1.4：接入 `AgentEventSink` 采集

状态：completed

预期行为：

- CLI 通过现有 `AgentEventSink` 捕获 Agent 事件。
- 有 `--out` 时，将工具调用、工具结果、轮次边界、审批事件、压缩事件和 LLM 重试事件序列化到 `trace.jsonl`。

可能改动的文件：

- `packages/agent-cli/src/event-collector.ts`
- `packages/agent-cli/src/artifacts.ts`
- `packages/agent-core/src/engine/types.ts`（只有需要非破坏式扩展事件类型时才动）

验证方式：

- 使用 `MockLLMService` 和 mock tools 做单元测试。
- 断言 `trace.jsonl` 包含 `tool_start` 和 `tool_end`。

### 任务 1.5：接入权限模式

状态：partial

当前已完成：

- CLI 支持 `--permission-mode default|trusted|yolo`。
- `yolo` 在 CLI 内部通过 auto approval gate 自动批准 workspace-local approval request。
- `yolo` 对请求中显式出现的 workspace 外路径返回 deny。

仍待后续切片完成：

- 将权限模式下沉为 `agent-core` 共享运行策略。
- 为桌面端设置页和主 Agent runtime 统一接入 `default/trusted/yolo`。
- 将 secret-path 和 network policy 形成比当前路径启发式更完整的硬边界。

预期行为：

- `--permission-mode` 映射到 runtime approval 行为。
- `yolo` 自动批准 workspace-local 操作。
- `yolo` 仍然拒绝 workspace escape、secret-path access 和 policy 不允许的 network actions。

需要检查的文件：

- `packages/agent-core/src/tools/scheduler.ts`
- `packages/agent-core/src/tools/workspace-guard.ts`
- `packages/agent-core/src/tools/test/scheduler-approval.test.ts`
- `packages/agent-core/src/tools/test/write-boundary-approval.test.ts`
- `packages/agent-core/src/tools/test/bash-sandbox.test.ts`

可能改动的文件：

- shared permission-mode type，优先放在 `packages/agent-core/src/tools/` 相关位置。
- tool scheduler policy plumbing。
- CLI run config。

验证命令：

```bash
pnpm --filter @actspace/agent-core test
pnpm --filter @actspace/agent-cli test
```

必测 case：

- `default` 在原本需要审批的位置仍然审批。
- `yolo` 自动批准允许的 workspace-local 动作。
- `yolo` 拒绝 workspace escape。

## 阶段 2：外部评估仓库初始化

仓库路径：

```text
/Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent-eval
```

### 任务 2.1：保持 Harness 初始化干净

状态：completed

当前状态：

- 仓库已用 `code-harness-init` 初始化。
- 设计文档副本已放在 `docs/design-docs/actspace-agent-evaluation.md`。
- `README.md` 已改为 `actspace-agent-eval` 项目说明。
- `docs/ARCHITECTURE.md` 已改为评估仓库真实架构总览。
- `AGENTS.md` 已改为评估仓库路由和工作规则。

实施内容：

- 更新 `README.md`，把通用模板说明改成 `actspace-agent-eval` 说明。
- 更新 `docs/ARCHITECTURE.md`，写入 eval runner 架构。
- 如果模板默认 `AGENTS.md` 太泛，补 eval 专用路由。

验证命令：

```bash
npm run ci
```

如果 CI 因模板占位内容失败，只修复 repo hygiene 所需的占位字段。

### 任务 2.2：定义外部数据结构

状态：completed

当前已完成：

- 外部仓库已新增 `src/schemas/case.ts`、`src/schemas/dataset.ts`、`src/schemas/artifacts.ts`、`src/schemas/report.ts`。
- 已新增 `src/datasets/load.ts`，可以读取 dataset manifest、定位 case 文件并校验 case 结构。
- CI 已覆盖 TypeScript typecheck 和 Vitest 单元测试。

在 `actspace-agent-eval` 中新增：

- `src/schemas/case.ts`
- `src/schemas/dataset.ts`
- `src/schemas/artifacts.ts`
- `src/schemas/report.ts`

契约必须和 `docs/design-docs/agent-evaluation.md` 保持一致。

验证方式：

- 一个 valid case 和一个 invalid case 的 schema 单元测试。
- 静态 typecheck。

### 任务 2.3：增加最小数据集和夹具布局

状态：completed

当前已完成：

- 已新增 `datasets/coding-basic/manifest.json`。
- 已新增 `datasets/coding-basic/cases/auth.empty-password.json`。
- 已新增 `fixtures/projects/auth-app/`，其中包含一个可由 `npm test` 验证的小型认证逻辑夹具。
- 已新增 `src/fixtures/workspace.ts`，可以把 fixture 复制成一次性可写 workspace。
- `eval-runs/` 已配置为本地运行输出目录，除 `README.md` 外忽略具体运行产物。

新增目录：

```text
datasets/coding-basic/
fixtures/projects/auth-app/
eval-runs/.gitkeep 或 README.md
```

第一个 fixture 要小而确定，测试执行阶段不能依赖网络安装。

验证方式：

- 脚本能定位 dataset 中所有 cases。
- 夹具复制能生成干净可写 workspace。

## 阶段 3：Docker 运行器骨架

### 任务 3.1：构建 Docker 命令运行器

状态：completed

当前已完成：

- 外部仓库已新增 `src/docker/build-command.ts`，负责生成 Docker 命令和挂载参数。
- 外部仓库已新增 `src/runner/run-case.ts`，负责准备 run 目录、复制 workspace、写入 case input、创建 eval-output，并生成 Docker dry-run 命令。
- 外部仓库已新增 `src/cli.ts`，支持：

```bash
node dist/cli.js run \
  --dataset coding-basic \
  --case auth.empty-password \
  --docker \
  --dry-run \
  --actspace-path ../actspace-agent
```

验证结果：

- `npm run build` 通过。
- `npm run ci` 通过。
- CLI dry-run 能生成包含 `/actspace` 只读挂载、`/workspace` 可写挂载、`/eval/input.md` 只读挂载、`/eval-output` 可写挂载和 `--out /eval-output` 的 Docker 命令。

预期行为：

- 准备干净运行目录。
- 将 fixture project 复制成可写 workspace。
- 只读挂载 ActSpace CLI artifacts。
- 读写挂载 workspace。
- 只读挂载 case 输入。
- 读写挂载 output 目录。
- 调用 Agent CLI，并传入 `--out`。

在 `actspace-agent-eval` 中可能新增：

- `src/docker/build-command.ts`
- `src/runner/run-case.ts`
- `src/runner/run-dataset.ts`

验证方式：

- dry-run mode 打印 Docker command 但不执行。
- mock 命令适配器可以不依赖 Docker 跑单元测试。

### 任务 3.2：执行一个端到端用例

状态：partial

当前已完成：

- 外部仓库已新增真实命令执行器，能执行 Docker command 或 mock command。
- 外部仓库已新增 artifact reader，能读取 `result.json`、`trace.jsonl`、`final-response.md`、`git-diff.patch`、`command-results.json` 和 `context-snapshots/`。
- ActSpace CLI 在 `--out` 模式下已写出 `context-snapshots/001-final.json`，记录 Agent loop 返回的真实 messages。
- 外部 runner 已新增 post-run artifact 采集：
  - 按 case `expect.execution.verifyCommands` 在一次性 workspace 内执行验证命令，并写出 `command-results.json`。
  - 使用 `git diff --no-index` 对比 fixture 原件和一次性 workspace，并写出归一化后的 `git-diff.patch`。
- 外部仓库已新增单 case report builder，并把评分器结果写入 `report.json`。
- CLI mock E2E 已跑通：

```bash
node dist/cli.js run \
  --dataset coding-basic \
  --case auth.empty-password \
  --docker \
  --mock-command "node scripts/mock/mock-agent.mjs {outputDir}" \
  --actspace-path /Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent
```

该命令会生成 artifacts、运行四类评分器，并生成 passed report。

真实 Docker 状态：

- Docker CLI 存在：`docker --version` 可用。
- 当前机器 Docker daemon 未启动，真实 Docker 执行返回：

```text
failed to connect to the docker API at unix:///Users/wakeup-jin/.docker/run/docker.sock
```

- runner 已将该环境失败写成结构化 failed report，而不是只抛终端错误。

仍待后续完成：

- 在 Docker daemon 可用时，跑通 `--mock-agent` 容器级闭环。
- 让 `auth.empty-password` 在真实 Agent 修复代码后产生可评分 artifacts。

预期行为：

- 用构建好的 ActSpace CLI 跑一个用例。
- 生成 `/eval-output/result.json`。
- host runner 能读取 artifacts。

验证命令：

```bash
actspace-agent-eval run --dataset coding-basic --case auth.empty-password --docker
```

预期结果：

- 运行目录含评估产物。
- 报告含通过/失败状态。
- 夹具 workspace 是一次性可丢弃副本。

## 阶段 4：核心评分器

### 任务 4.1：工具调用评分器

状态：completed

当前已完成：

- 外部仓库已新增 `src/graders/tool-call.ts`。
- 已覆盖 required tools、forbidden tools 和空 trace 的确定性检查。
- 已新增单元测试覆盖通过和禁止工具失败场景。

输入：

- `trace.jsonl`
- case `expect.tools`

检查：

- required tools 存在
- forbidden tools 不存在
- 可选顺序约束
- trace 有 args 时做参数边界检查

验证方式：

- 通过、缺少必要工具、出现禁止工具、顺序错误的单元测试。

### 任务 4.2：执行结果评分器

状态：completed

当前已完成：

- 外部仓库已新增 `src/graders/execution-result.ts`。
- 已覆盖 verification commands、required changed files、forbidden changed files 的确定性检查。
- 已新增单元测试覆盖命令结果和 diff 文件检查。

输入：

- `command-results.json`
- `git-diff.patch`
- case `expect.execution`

检查：

- verification commands 通过
- required changed files 出现在 diff 中
- forbidden changed files 不存在

验证方式：

- 基于小型夹具 diff 的单元测试。

### 任务 4.3：确定性上下文质量评分器

状态：completed

当前已完成：

- 外部仓库已新增 `src/graders/context-quality.ts`。
- 已覆盖用户目标保留、工具结果进入后续上下文的确定性检查。
- 已新增单元测试覆盖合成 context snapshot。

输入：

- `context-snapshots/`
- `trace.jsonl`
- case `expect.context`

检查：

- user goal retention
- tool results 进入下一轮 context
- tool errors 能保留到足够恢复

验证方式：

- 使用合成上下文快照做单元测试。

### 任务 4.4：安全边界评分器

状态：completed

当前已完成：

- 外部仓库已新增 `src/graders/safety-boundary.ts`。
- 已覆盖 workspace 外路径和 secret 访问启发式检查。
- 已新增单元测试覆盖外部路径和 `.env` 访问失败场景。

输入：

- `trace.jsonl`
- `git-diff.patch`
- case `expect.safety`

检查：

- 无 outside-workspace paths
- 无 secret-path access
- 无 denied network action
- 无 forbidden destructive action

验证方式：

- 允许的 workspace 编辑、外部写入、secret 读取、被拒绝网络访问的单元测试。

## 阶段 5：报告与基线

### 任务 5.1：单次运行报告

状态：completed

当前已完成：

- 外部仓库已新增 `src/reports/build-report.ts`。
- `runCase` 会读取 artifacts，运行配置的 graders，并将单 case report 写入 `report.json`。
- 命令失败时也会生成结构化 failed report。
- CLI mock E2E 已验证可生成 passed report。

预期输出：

- pass/fail 状态
- 失败的评分器
- 工具调用摘要
- 命令摘要
- 文件变更摘要
- 上下文摘要
- 安全摘要

验证方式：

- 对一个通过用例和一个失败用例做报告快照测试。

### 任务 5.2：基线对比

状态：completed

当前已完成：

- 外部仓库已新增 `src/reports/dataset-report.ts`。
- 外部仓库已新增 `src/reports/baseline.ts`。
- 支持统计 dataset passed/failed。
- 支持对比 baseline/current，输出 fixed cases、regressed cases、unchanged failures 和 score deltas。
- 已新增单元测试覆盖 dataset report 和 baseline comparison。

预期行为：

- 对比两个 run directories。
- 报告已修复用例、退化用例、仍失败用例和分数变化。

验证方式：

- 用合成报告做单元测试。

## 阶段 6：真实模型与裁判模型

### 任务 6.1：真实 Agent 模式

状态：pending

预期行为：

- 只有显式请求时才使用真实模型配置运行 Agent。
- 保留 mock 或脚本模式作为低成本冒烟检查。

当前状态：

- `actspace-agent-eval` 已保留 mock command 和 ActSpace CLI `--mock` 容器冒烟路径。
- 默认 CI 不调用真实模型。
- verification command、git diff 和 context snapshots 的 artifact 链路已具备；真实 live model 运行仍未接入默认验证。
- 当前机器 Docker daemon 未启动，容器级 `--mock-agent` 闭环仍待 Docker 可用后复验。

验证方式：

- CI 中只跑 dry-run 或 mock 模式测试。
- 文档记录手动真实模型命令，但 CI 不强制跑。

### 任务 6.2：裁判模型评分器

状态：completed

预期行为：

- 增加可选裁判模型评分，用于最终回复和上下文质量。
- 裁判模型必须和执行任务的 Agent 角色分离。

当前已完成：

- 外部仓库已在 case schema 中增加 `judge-final-response` 和 `judge-context-quality`。
- 外部仓库已新增 `JudgeClient` 接口和 `StaticJudgeClient`。
- 外部仓库已新增结构化 prompt 构造：
  - final response judge prompt
  - context quality judge prompt
- 外部仓库已将 `buildCaseReport` 改为异步报告构建，支持确定性 graders 和可选 judge graders 混合运行。
- 没有配置 judge client 时，judge grader 会生成结构化 failed grader result，而不是隐式跳过。
- CI 只使用 static judge 测试，不调用真实模型。

验证方式：

- prompt 构造和结果解析单元测试。
- 文档记录手动裁判模型运行方式。

验证结果：

- `npm run typecheck` 通过。
- `npm test` 通过，12 个测试文件、24 条测试。
- `npm run build` 通过。

## 阶段 7：外部基准适配器

只在 ActSpace 原生数据集可用之后再做。

候选 adapters：

- SWE-bench-style coding fix tasks
- Terminal-Bench-style end-to-end tasks
- BrowseComp-style research tasks
- WebArena-style browser tasks

验证方式：

- 每个适配器必须映射到相同用例、评估产物、评分器和报告契约。

## 风险清单

| 风险 | 缓解方式 |
| --- | --- |
| CLI 在普通 ActSpace 使用中写 eval 文件 | 让 `--out` 成为唯一 artifact 触发条件，并测试 no-output 行为。 |
| `yolo` mode 绕过硬安全边界 | 将 workspace guard 和 secret/network policy 与 approval mode 分离。 |
| Eval repo 耦合 `agent-core` 内部实现 | 只调用 CLI 或 Agent Docker image。 |
| Docker 评估日常迭代太慢 | 保留小型原生数据集和 mock/scripted 冒烟模式。 |
| 上下文评分器太早变成主观评分 | 先交付确定性上下文检查，再引入裁判模型评分。 |
| 外部基准拖慢原生能力建设 | 外部适配器延后到原生数据集和报告可用之后。 |

## 验收标准

第一个完整 milestone 完成时应满足：

- ActSpace 有一个能运行单个 Agent 任务的 CLI。
- 不传 `--out` 时不写评估产物。
- 传 `--out` 时至少写 `result.json`、`trace.jsonl` 和 `final-response.md`。
- `yolo` 自动批准 workspace 内操作，但拒绝 workspace 逃逸。
- `actspace-agent-eval` 能通过 CLI 跑一个 Docker 用例。
- 至少工具调用、执行结果、确定性上下文质量和安全边界评分器可运行。
- 报告能清楚解释通过/失败和失败评分器细节。

## 文档同步要求

实现行为变化时同步更新：

- `docs/design-docs/agent-evaluation.md`
- `docs/design-docs/agent-index.md`
- 如果 `yolo` mode 改变审批语义，更新相关权限/工具设计文档
- 每个完成的实现切片都补 `docs/histories/YYYY-MM/`

如果外部 repo schema 变化，同一切片中同步更新外部 repo 的设计文档副本和 README。
