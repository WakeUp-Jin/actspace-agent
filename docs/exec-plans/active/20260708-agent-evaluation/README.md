# Agent 评估执行计划

状态：首个完整里程碑已完成

设计来源：`docs/design-docs/evaluation/agent-evaluation.md`

## 目标

为 ActSpace 建立可度量的 Agent 评估路径，让 Agent 优化可以通过可运行数据集验证，而不是依赖主观感觉。

实施拆成两个产品边界：

1. ActSpace 提供围绕 `agent-core` 的 `actspace-agent` 命令行入口、包含 `yolo` 的权限模式，以及显式评估产物输出契约。
2. 外部 `actspace-agent-eval` 项目负责 Docker 优先评估、数据集、夹具项目、评分器、报告和基线对比。

## 非目标

- 本计划不评估 Electron 渲染进程 UI。
- 不替代现有 `vitest` 模块测试。
- 不让 `actspace-agent-eval` 导入 `agent-core` 私有内部实现。
- 不让普通 ActSpace 命令行入口或桌面端运行写评估产物。
- 不在 ActSpace 原生数据集可用前实现外部基准适配器。
- 不把 pass@k、pass^k 和外部基准适配器纳入首个完整里程碑；它们属于后续数据集规模化之后的报告增强。

## 必读文档

开始实施前先读：

- `AGENTS.md`
- `docs/REPO_COLLAB_GUIDE.md`
- `docs/ARCHITECTURE.md`
- `docs/design-docs/core-beliefs.md`
- `docs/design-docs/evaluation/agent-evaluation.md`
- `docs/design-docs/agent-runtime/agent-current-module-map.md`
- `docs/design-docs/agent-runtime/agent-testing.md`
- `docs/design-docs/execution-safety/agent-权限设计规则和原则.md`
- `docs/design-docs/execution-safety/agent-tool-approval-pause-resume.md`
- `docs/design-docs/execution-safety/agent-bash-policy-allowlist-design.md`
- `docs/HISTORY_GUIDE.md`
- `docs/QUALITY_SCORE.md`

## 共享契约

以下契约需要在 ActSpace 和 `actspace-agent-eval` 之间保持稳定。

### Agent 命令行入口契约

初始命令形态：

```bash
actspace-agent run \
  --input task.md \
  --workspace /workspace \
  --permission-mode yolo
```

可选结构化标准输出：

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
- 命令行入口默认无状态执行，不能悄悄使用桌面端会话存储。
- 默认模式下命令行入口将 Agent 最终回复输出到标准输出。

### 权限模式契约

```ts
type PermissionMode = "default" | "trusted" | "yolo";
```

契约规则：

- `default` 保持高风险操作的交互式审批行为。
- `trusted` 允许普通工作区写入，但仍保护高风险动作。
- `yolo` 自动批准工作区内的评估操作。
- `yolo` 不能绕过工作区、密钥路径或网络硬边界。

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

第一版 ActSpace 实现可以只输出首个外部运行器需要的子集，但如果文件名变更，必须同步更新 `docs/design-docs/evaluation/agent-evaluation.md`。

## 阶段 1：ActSpace Agent 命令行入口基础

### 任务 1.1：确定命令行入口包位置

状态：已完成

需要检查的文件：

- `package.json`
- `pnpm-workspace.yaml`（如果存在）
- `packages/agent-core/package.json`
- `packages/agent-core/src/index.ts`
- `packages/agent-core/src/engine/create-agent-deps.ts`
- `packages/agent-core/src/engine/agent.ts`

实施决策：

- 如果能保持运行依赖清晰，优先新增 `packages/agent-cli`。
- 如果新增 package 过重，才考虑在 `packages/agent-core` 下增加命令行入口，并记录原因。

验证方式：

- package 能按仓库现有 TypeScript 约定构建。
- 命令行入口只导入 `@actspace/agent-core` 公开导出，或导入明确记录过的内部启动辅助函数。

### 任务 1.2：实现最小 `run` 命令

状态：已完成

预期行为：

- 接收 `--input`。如果内联文本和文件路径语义容易混淆，就拆成 `--input` 与 `--input-file`。
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
- 根目录 `package.json` 脚本（如果需要）

验证命令：

```bash
pnpm --filter @actspace/agent-cli build
pnpm --filter @actspace/agent-cli run -- --help
```

首个冒烟测试使用模拟或测试模式模型接线，不要求真实 provider。

### 任务 1.3：增加显式评估产物写入器

状态：已完成

预期行为：

- 没有 `--out`：不创建评估产物目录。
- 有 `--out`：只写入请求的输出目录。
- 起步输出 `result.json`、`trace.jsonl` 和 `final-response.md`。
- `context-snapshots/`、`git-diff.patch`、`command-results.json` 等文件等对应运行时钩子存在后再补。

可能改动的文件：

- `packages/agent-cli/src/artifacts.ts`
- `packages/agent-cli/src/run.ts`
- `packages/agent-cli/src/test/` 下测试文件

验证命令：

```bash
pnpm --filter @actspace/agent-cli test
```

必测用例：

- 不传 `--out` 时不写评估文件。
- 传 `--out` 时写预期文件。
- `--out` 不能通过路径穿越写到意外路径。

### 任务 1.4：接入 `AgentEventSink` 采集

状态：已完成

预期行为：

- 命令行入口通过现有 `AgentEventSink` 捕获 Agent 事件。
- 有 `--out` 时，将工具调用、工具结果、轮次边界、审批事件、压缩事件和 LLM 重试事件序列化到 `trace.jsonl`。

可能改动的文件：

- `packages/agent-cli/src/event-collector.ts`
- `packages/agent-cli/src/artifacts.ts`
- `packages/agent-core/src/engine/types.ts`（只有需要非破坏式扩展事件类型时才动）

验证方式：

- 使用 `MockLLMService` 和模拟工具做单元测试。
- 断言 `trace.jsonl` 包含 `tool_start` 和 `tool_end`。

### 任务 1.5：接入权限模式

状态：已完成

当前已完成：

- 命令行入口支持 `--permission-mode default|trusted|yolo`。
- `agent-core` 已新增共享 `PermissionMode` 类型。
- `agent-core` 已新增 `createApprovalGateForPermissionMode` 共享策略。
- 命令行入口已改为复用 `agent-core` 的权限模式策略，不再维护私有审批逻辑。
- `yolo` 会自动批准工作区内的审批请求。
- `yolo` 对请求中显式出现的工作区外路径返回拒绝。

仍待后续产品切片完成：

- 为桌面端设置页和主 Agent 运行时统一接入 `default/trusted/yolo`。
- 将密钥路径和网络策略形成比当前路径启发式更完整的硬边界。

预期行为：

- `--permission-mode` 映射到运行时审批行为。
- `yolo` 自动批准工作区内操作。
- `yolo` 仍然拒绝工作区逃逸、密钥路径访问和策略不允许的网络动作。

需要检查的文件：

- `packages/agent-core/src/tools/scheduler.ts`
- `packages/agent-core/src/tools/workspace-guard.ts`
- `packages/agent-core/src/tools/test/scheduler-approval.test.ts`
- `packages/agent-core/src/tools/test/write-boundary-approval.test.ts`
- `packages/agent-core/src/tools/test/bash-sandbox.test.ts`

可能改动的文件：

- 共享权限模式类型，优先放在 `packages/agent-core/src/tools/` 相关位置。
- 工具调度器策略接线。
- 命令行入口运行配置。

验证命令：

```bash
./node_modules/.bin/vitest run src/tools/test/permission-mode.test.ts src/tools/test/scheduler-approval.test.ts src/tools/test/write-boundary-approval.test.ts
./node_modules/.bin/vitest run src/test/permission.test.ts src/test/args.test.ts src/test/run.test.ts
./node_modules/.bin/tsc --noEmit -p tsconfig.json
```

由于当前仓库根目录 pnpm 依赖状态检查会尝试清理 `node_modules` 且需要 TTY，本切片使用 package-local `vitest` 和 `tsc` 验证。

必测用例：

- `default` 在原本需要审批的位置仍然审批。
- `yolo` 自动批准允许的工作区内动作。
- `yolo` 拒绝工作区逃逸。

## 阶段 2：外部评估仓库初始化

仓库路径：

```text
/Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent-eval
```

### 任务 2.1：保持脚手架初始化干净

状态：已完成

当前状态：

- 仓库已用 `code-harness-init` 初始化。
- 设计文档副本已放在 `docs/design-docs/actspace-agent-evaluation.md`。
- `README.md` 已改为 `actspace-agent-eval` 项目说明。
- `docs/ARCHITECTURE.md` 已改为评估仓库真实架构总览。
- `AGENTS.md` 已改为评估仓库路由和工作规则。

实施内容：

- 更新 `README.md`，把通用模板说明改成 `actspace-agent-eval` 说明。
- 更新 `docs/ARCHITECTURE.md`，写入评估运行器架构。
- 如果模板默认 `AGENTS.md` 太泛，补评估专用路由。

验证命令：

```bash
npm run ci
```

如果持续集成因模板占位内容失败，只修复仓库卫生所需的占位字段。

### 任务 2.2：定义外部数据结构

状态：已完成

当前已完成：

- 外部仓库已新增 `src/schemas/case.ts`、`src/schemas/dataset.ts`、`src/schemas/artifacts.ts`、`src/schemas/report.ts`。
- 已新增 `src/datasets/load.ts`，可以读取数据集清单、定位用例文件并校验用例结构。
- 持续集成已覆盖 TypeScript 类型检查和 Vitest 单元测试。

在 `actspace-agent-eval` 中新增：

- `src/schemas/case.ts`
- `src/schemas/dataset.ts`
- `src/schemas/artifacts.ts`
- `src/schemas/report.ts`

契约必须和 `docs/design-docs/evaluation/agent-evaluation.md` 保持一致。

验证方式：

- 一个有效用例和一个无效用例的 schema 单元测试。
- 静态类型检查。

### 任务 2.3：增加最小数据集和夹具布局

状态：已完成

当前已完成：

- 已新增 `datasets/coding-basic/manifest.json`。
- 已新增 `datasets/coding-basic/cases/auth.empty-password.json`。
- 已新增 `fixtures/projects/auth-app/`，其中包含一个可由 `npm test` 验证的小型认证逻辑夹具。
- 已新增 `src/fixtures/workspace.ts`，可以把夹具复制成一次性可写工作区。
- `eval-runs/` 已配置为本地运行输出目录，除 `README.md` 外忽略具体运行产物。

新增目录：

```text
datasets/coding-basic/
fixtures/projects/auth-app/
eval-runs/.gitkeep 或 README.md
```

第一个夹具要小而确定，测试执行阶段不能依赖网络安装。

验证方式：

- 脚本能定位数据集中的所有用例。
- 夹具复制能生成干净可写工作区。

## 阶段 3：Docker 运行器骨架

### 任务 3.1：构建 Docker 命令运行器

状态：已完成

当前已完成：

- 外部仓库已新增 `src/docker/build-command.ts`，负责生成 Docker 命令和挂载参数。
- 外部仓库已新增 `src/runner/run-case.ts`，负责准备运行目录、复制工作区、写入用例输入、创建 eval-output，并生成 Docker 试运行命令。
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
- 命令行入口试运行能生成包含 `/actspace` 只读挂载、`/workspace` 可写挂载、`/eval/input.md` 只读挂载、`/eval-output` 可写挂载和 `--out /eval-output` 的 Docker 命令。

预期行为：

- 准备干净运行目录。
- 将夹具项目复制成可写工作区。
- 只读挂载 ActSpace 命令行入口产物。
- 读写挂载工作区。
- 只读挂载用例输入。
- 读写挂载输出目录。
- 调用 Agent 命令行入口，并传入 `--out`。

在 `actspace-agent-eval` 中可能新增：

- `src/docker/build-command.ts`
- `src/runner/run-case.ts`
- `src/runner/run-dataset.ts`

验证方式：

- 试运行模式打印 Docker 命令但不执行。
- 模拟命令适配器可以不依赖 Docker 跑单元测试。

### 任务 3.2：执行一个端到端用例

状态：已完成

当前已完成：

- 外部仓库已新增真实命令执行器，能执行 Docker 命令或模拟命令。
- 外部仓库已新增 `doctor` 子命令，可在真实运行前检查数据集清单、ActSpace 命令行入口构建产物、Docker CLI 和 Docker 守护进程。
- 外部仓库已新增评估产物读取器，能读取 `result.json`、`trace.jsonl`、`final-response.md`、`git-diff.patch`、`command-results.json` 和 `context-snapshots/`。
- ActSpace 命令行入口在 `--out` 模式下已写出 `context-snapshots/001-final.json`，记录 Agent 执行循环返回的真实消息。
- 外部运行器已新增运行后产物采集：
  - 按用例 `expect.execution.verifyCommands` 在一次性工作区内执行验证命令，并写出 `command-results.json`。
  - 使用 `git diff --no-index` 对比夹具原件和一次性工作区，并写出归一化后的 `git-diff.patch`。
- 外部仓库已新增单用例报告构建器，并把评分器结果写入 `report.json`。
- 外部仓库已在试运行和报告中记录运行模式：
  - 脚本模拟模式（`mock-command`）
  - Docker 内置模拟 Agent 模式（`docker-mock-agent`）
  - Docker 真实 Agent 模式（`docker-live-agent`）
- `report.json` 会记录实际执行命令、Docker 命令和评估产物目录，方便复验真实模式失败。
- 命令行入口模拟端到端流程已跑通：

```bash
node dist/cli.js run \
  --dataset coding-basic \
  --case auth.empty-password \
  --docker \
  --mock-command "node scripts/mock/mock-agent.mjs {outputDir}" \
  --actspace-path /Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent
```

该命令会生成评估产物、运行四类评分器，并生成通过报告。

真实 Docker 状态：

- Docker CLI 存在：`docker --version` 可用。
- Docker 守护进程已启动后，`doctor` 已验证数据集、ActSpace 命令行入口构建产物、Docker CLI 和 Docker 守护进程均通过。
- 容器级 `--mock-agent` 已跑通：Docker 成功调用 ActSpace 命令行入口的模拟模式，写出评估产物并生成结构化报告。
- `coding-basic/auth.empty-password` 在 `--mock-agent` 下按预期评分失败，因为模拟 Agent 不执行工具调用或真实代码修改。
- `judge-basic/auth.response-context` 在 `--mock-agent + --judge-command` 下生成通过报告，证明 Docker 运行器、ActSpace 命令行入口、产物读取和评分器链路闭合。
- Docker 真实 Agent 模式（`docker-live-agent`）命令链路已可发起，失败时会生成结构化失败报告。
- 外部评估仓库已新增显式 `--env KEY` 透传，真实模型路径必须点名传入所需环境变量，不能默认暴露宿主 `.env`。

预期行为：

- 用构建好的 ActSpace 命令行入口跑一个用例。
- 生成 `/eval-output/result.json`。
- 宿主机运行器能读取评估产物。

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

状态：已完成

当前已完成：

- 外部仓库已新增 `src/graders/tool-call.ts`。
- 已覆盖必要工具、禁止工具和空轨迹的确定性检查。
- 已新增单元测试覆盖通过和禁止工具失败场景。

输入：

- `trace.jsonl`
- 用例 `expect.tools`

检查：

- 必要工具存在
- 禁止工具不存在
- 可选顺序约束
- 轨迹中有参数时做参数边界检查

验证方式：

- 通过、缺少必要工具、出现禁止工具、顺序错误的单元测试。

### 任务 4.2：执行结果评分器

状态：已完成

当前已完成：

- 外部仓库已新增 `src/graders/execution-result.ts`。
- 已覆盖验证命令、必要变更文件、禁止变更文件的确定性检查。
- 已新增单元测试覆盖命令结果和差异补丁文件检查。

输入：

- `command-results.json`
- `git-diff.patch`
- 用例 `expect.execution`

检查：

- 验证命令通过
- 必要变更文件出现在差异补丁中
- 禁止变更文件不存在

验证方式：

- 基于小型夹具差异补丁的单元测试。

### 任务 4.3：确定性上下文质量评分器

状态：已完成

当前已完成：

- 外部仓库已新增 `src/graders/context-quality.ts`。
- 已覆盖用户目标保留、工具结果进入后续上下文的确定性检查。
- 已新增单元测试覆盖合成上下文快照。

输入：

- `context-snapshots/`
- `trace.jsonl`
- 用例 `expect.context`

检查：

- 用户目标保留
- 工具结果进入下一轮上下文
- 工具错误能保留到足够恢复

验证方式：

- 使用合成上下文快照做单元测试。

### 任务 4.4：安全边界评分器

状态：已完成

当前已完成：

- 外部仓库已新增 `src/graders/safety-boundary.ts`。
- 已覆盖工作区外路径和密钥访问启发式检查。
- 已新增单元测试覆盖外部路径和 `.env` 访问失败场景。

输入：

- `trace.jsonl`
- `git-diff.patch`
- 用例 `expect.safety`

检查：

- 无工作区外路径
- 无密钥路径访问
- 无被拒绝的网络动作
- 无禁止的破坏性动作

验证方式：

- 允许的工作区编辑、外部写入、密钥读取、被拒绝网络访问的单元测试。

## 阶段 5：报告与基线

### 任务 5.1：单次运行报告

状态：已完成

当前已完成：

- 外部仓库已新增 `src/reports/build-report.ts`。
- `runCase` 会读取评估产物，运行配置的评分器，并将单用例报告写入 `report.json`。
- 命令失败时也会生成结构化失败报告。
- 命令行入口模拟端到端流程已验证可生成通过报告。

预期输出：

- 通过/失败状态
- 失败的评分器
- 工具调用摘要
- 命令摘要
- 文件变更摘要
- 上下文摘要
- 安全摘要

验证方式：

- 对一个通过用例和一个失败用例做报告快照测试。

### 任务 5.2：基线对比

状态：已完成

当前已完成：

- 外部仓库已新增 `src/reports/dataset-report.ts`。
- 外部仓库已新增 `src/reports/baseline.ts`。
- 支持统计数据集通过/失败。
- 支持对比基线版本和当前版本，输出已修复用例、退化用例、仍失败用例和分数变化。
- 外部仓库已新增 `src/runner/run-dataset.ts`，可以按清单顺序运行整个数据集。
- 命令行入口未传 `--case` 或传 `--case all` 时，会运行整个数据集，并写出 `${datasetId}-dataset-report.json`。
- 命令行入口已新增 `compare` 子命令，可以读取基线版本和当前版本两个数据集报告，并写出对比报告。
- 已新增单元测试覆盖数据集报告和基线对比。
- 已新增数据集运行器端到端测试，覆盖数据集运行、运行后评估产物和数据集报告输出。
- 已新增对比报告文件读写测试，并手动验证 `node dist/cli.js compare --baseline ... --current ... --out ...`。

预期行为：

- 对比两个运行目录。
- 报告已修复用例、退化用例、仍失败用例和分数变化。

验证方式：

- 用合成报告做单元测试。

## 阶段 6：真实模型与裁判模型

### 任务 6.1：真实 Agent 模式

状态：已完成，真实模型成功运行需要宿主机提供模型凭据

预期行为：

- 只有显式请求时才使用真实模型配置运行 Agent。
- 保留模拟或脚本模式作为低成本冒烟检查。

当前状态：

- `actspace-agent-eval` 已保留模拟命令和 ActSpace 命令行入口 `--mock` 容器冒烟路径。
- `actspace-agent-eval` 默认 Docker 运行模式已显式标记为 Docker 真实 Agent 模式（`docker-live-agent`），试运行可在不启动 Docker 的情况下打印真实 Agent 命令。
- 默认持续集成不调用真实模型。
- 验证命令、`git diff` 和上下文快照的评估产物链路已具备。
- `doctor` 当前验证结果：数据集、ActSpace 命令行入口构建产物、Docker CLI 和 Docker 守护进程均通过。
- Docker 真实 Agent 模式（`docker-live-agent`）已能实际启动 Docker 命令；当前 `judge-basic` 真实 Agent 运行在网络拒绝用例下会结构化失败，真实模型验收需要使用 `runtime.network: allow` 的用例并通过 `--env KEY` 显式传入模型环境变量。
- 外部仓库已新增 `live-smoke/final-response`，该用例设置 `runtime.network: allow`，专门用于手动验证真实模型 Docker 路径和显式环境变量透传。
- 当前宿主 shell 没有可用模型密钥时，不能证明真实模型成功完成；但真实模型运行入口、隔离策略、环境变量透传和结构化失败报告已经具备。

验证方式：

- 持续集成中只跑试运行或模拟模式测试。
- 文档记录手动真实模型命令，但持续集成不强制跑。
- 手动真实模型验收命令：

```bash
node dist/cli.js run \
  --dataset live-smoke \
  --case final-response \
  --docker \
  --env DEEPSEEK_API_KEY \
  --env DEEPSEEK_API_FORMAT \
  --judge-command "node scripts/judge/static-judge.mjs" \
  --actspace-path /Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent
```

最近验证结果：

- `node dist/cli.js doctor --dataset coding-basic --actspace-path /Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent` 通过。
- `node dist/cli.js doctor --dataset live-smoke --actspace-path /Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent` 通过。
- `node dist/cli.js run --dataset live-smoke --case final-response --docker --dry-run --actspace-path /Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent` 通过，生成的 Docker 命令使用 `--network bridge`。
- `node dist/cli.js run --dataset coding-basic --case auth.empty-password --docker --mock-agent --actspace-path /Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent` 通过执行并生成结构化报告。
- `node dist/cli.js run --dataset judge-basic --case auth.response-context --docker --mock-agent --judge-command "node scripts/judge/static-judge.mjs" --actspace-path /Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent` 通过并生成 passed 报告。
- `node dist/cli.js run --dataset judge-basic --case auth.response-context --docker --judge-command "node scripts/judge/static-judge.mjs" --actspace-path /Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent` 已验证真实 Agent 模式能发起 Docker 命令，并在模型环境不可用时生成结构化失败报告。
- `DEEPSEEK_API_FORMAT=anthropic node dist/cli.js run --dataset judge-basic --case auth.response-context --docker --dry-run --env DEEPSEEK_API_FORMAT --actspace-path /Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent` 已验证 `--env` 会显式进入 Docker 命令。

### 任务 6.2：裁判模型评分器

状态：已完成

预期行为：

- 增加可选裁判模型评分，用于最终回复和上下文质量。
- 裁判模型必须和执行任务的 Agent 角色分离。

当前已完成：

- 外部仓库已在用例 schema 中增加 `judge-final-response` 和 `judge-context-quality`。
- 外部仓库已新增 `JudgeClient` 接口和 `StaticJudgeClient`。
- 外部仓库已新增 `CommandJudgeClient` 和 `--judge-command` CLI 参数，可通过 stdin/stdout 调用外部裁判命令。
- 外部仓库已新增 `scripts/judge/static-judge.mjs`，作为命令式裁判适配器的本地示例。
- 外部仓库已新增 `datasets/judge-basic/`，用于实际触发 `judge-final-response` 和 `judge-context-quality`。
- 外部仓库已新增结构化提示词构造：
  - 最终回复裁判提示词
  - 上下文质量裁判提示词
- 外部仓库已将 `buildCaseReport` 改为异步报告构建，支持确定性评分器和可选裁判评分器混合运行。
- 没有配置裁判客户端时，裁判评分器会生成结构化失败评分结果，而不是隐式跳过。
- 持续集成只使用静态裁判或命令式静态裁判测试，不调用真实模型。

验证方式：

- 提示词构造和结果解析单元测试。
- `CommandJudgeClient` stdin/stdout 单元测试。
- `runCase` + 命令式裁判端到端测试。
- 文档记录手动裁判模型运行方式。

验证结果：

- `npm test -- src/test/command-judge.test.ts src/test/run-case-judge-command.test.ts src/test/judge.test.ts` 通过，3 个测试文件、4 条测试。
- `npm test` 通过，18 个测试文件、33 条测试。
- `npm run build` 通过。
- `node dist/cli.js run --dataset judge-basic --case auth.response-context --docker --mock-command "node scripts/mock/mock-agent.mjs {outputDir}" --judge-command "node scripts/judge/static-judge.mjs" --actspace-path /Users/wakeup-jin/Desktop/code-project/side-project/actspace-agent` 通过，并生成包含 `judge-final-response` 与 `judge-context-quality` 的通过报告。

## 阶段 7：外部基准适配器

只在 ActSpace 原生数据集可用之后再做。

候选适配器：

- SWE-bench 风格编码修复任务
- Terminal-Bench 风格端到端任务
- BrowseComp 风格研究任务
- WebArena 风格浏览器任务

验证方式：

- 每个适配器必须映射到相同用例、评估产物、评分器和报告契约。

## 风险清单

| 风险 | 缓解方式 |
| --- | --- |
| 命令行入口在普通 ActSpace 使用中写评估文件 | 让 `--out` 成为唯一评估产物触发条件，并测试无输出行为。 |
| `yolo` 模式绕过硬安全边界 | 将工作区守卫、密钥/网络策略与审批模式分离。 |
| 评估仓库耦合 `agent-core` 内部实现 | 只调用命令行入口或 Agent Docker 镜像。 |
| Docker 评估日常迭代太慢 | 保留小型原生数据集和模拟/脚本冒烟模式。 |
| 上下文评分器太早变成主观评分 | 先交付确定性上下文检查，再引入裁判模型评分。 |
| 外部基准拖慢原生能力建设 | 外部适配器延后到原生数据集和报告可用之后。 |

## 验收标准

第一个完整里程碑完成时应满足：

- ActSpace 有一个能运行单个 Agent 任务的命令行入口。
- 不传 `--out` 时不写评估产物。
- 传 `--out` 时至少写 `result.json`、`trace.jsonl` 和 `final-response.md`。
- `yolo` 自动批准工作区内操作，但拒绝工作区逃逸。
- `actspace-agent-eval` 能通过命令行入口跑一个 Docker 用例。
- 至少工具调用、执行结果、确定性上下文质量和安全边界评分器可运行。
- 报告能清楚解释通过/失败和失败评分器细节。

## 文档同步要求

实现行为变化时同步更新：

- `docs/design-docs/evaluation/agent-evaluation.md`
- `docs/design-docs/agent-index.md`
- 如果 `yolo` 模式改变审批语义，更新相关权限/工具设计文档
- 每个完成的实现切片都补 `docs/histories/YYYY-MM/`

如果外部仓库 schema 变化，同一切片中同步更新外部仓库的设计文档副本和 README。
