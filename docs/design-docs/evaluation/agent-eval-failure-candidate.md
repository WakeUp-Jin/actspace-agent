# 失败回归 Candidate 生成设计

## 目标

当用户认为当前会话里最近一次 Agent 执行失败或效果很差时，可以输入 `/eval`，让一个独立 Agent 把这次失败整理成可交给 `actspace-agent-eval` 导入的回归 Candidate。

首版只保证一条最小闭环：

```text
/eval [失败说明]
  -> 读取最近一次普通 Turn 的会话记录与当前工作区
  -> 生成 <userData>/eval-candidates/<candidateId>/
  -> actspace-agent-eval ingest-candidate 导入内部 regression 数据集
```

## 核心边界

- `/eval` 是系统命令，不写成普通 `user_message`，也不进入主 Agent conversation。
- Candidate 生成使用独立 Agent、独立 ContextManager 和独立系统提示词。
- 不新增文件工具。继续复用 `read_file`、`list_directory`、`grep`、`glob`、`write_file`、`edit_file`。
- 生成 Agent 的 `workspaceRoot` 设为 Candidate 目录，因此相对写入天然落在 Candidate 内；原工作区和 `session.jsonl` 通过绝对路径只读。
- 首版禁用 Bash、删除、网络、浏览器和子 Agent 工具。
- Actspace 不直接写 Eval 仓库，也不修改正式 Dataset manifest。
- Eval 仓库只读取 Candidate 文件，不依赖桌面端会话存储或 `agent-core` 私有实现。

## Candidate 目录

```text
<userData>/eval-candidates/<candidateId>/
  candidate.json
  case.json
  fixture/
```

`candidate.json` 由 Actspace 写入，记录 Candidate 状态、来源 Session/Turn、用户失败说明、原始用户输入和生成模型。

`case.json` 与 `fixture/` 由生成 Agent 写入。`case.json` 使用 Eval Case V2 结构，`source.kind` 固定为 `regression-derived`，`workspace.fixture` 在 Candidate 中固定写成 `fixture`。

## 生成 Agent 输入

Main Process 向生成 Agent 提供：

- Candidate 根目录绝对路径。
- 原工作区绝对路径。
- 当前 Session 的 `session.jsonl` 绝对路径。
- 最近一个普通用户 Turn 的 `turnId` 和用户输入。
- `/eval` 后的可选失败说明。

生成 Agent自行按需读取会话和工作区，创建最小复现 fixture；不要求复制或精确还原整个原项目。无法确定正确成功标准时，应在最终回复中说明，不得编造。

## 桌面端反馈

Renderer 在命令执行期间显示一条临时 status：`Generating eval candidate...`。

生成完成后 Main Process 追加 `eval_candidate` SessionEvent；恢复会话时显示：

- 成功：`Eval candidate generated · <candidatePath>`
- 失败：`Eval candidate generation failed · <reason>`

SessionEvent 只记录 Candidate 相对目录，不把 Candidate 内容回灌主 Agent conversation。

## Eval 导入契约

Eval 仓库提供：

```bash
uv run actspace-agent-eval ingest-candidate \
  --candidate /absolute/path/to/<candidateId> \
  --dataset-path /absolute/path/to/failure-regression/manifest.json
```

导入器执行：

1. 读取并校验 `case.json`。
2. 确认 `source.kind=regression-derived`、`workspace.fixture=fixture`。
3. 将 fixture 复制到目标 Dataset 的 `fixtures/<caseId>/`。
4. 将 Case 复制到 `cases/<caseId>.json`，并改写 fixture 相对路径。
5. 把 Case 加入 manifest `cases` 和 `splits.regression`。
6. 重新加载整个 Dataset，确保 Case、split 和 required dimensions 仍然有效。

首版不做自动去重、自动提交、复杂 Candidate 状态机、工作区快照或多 Agent 审查。
