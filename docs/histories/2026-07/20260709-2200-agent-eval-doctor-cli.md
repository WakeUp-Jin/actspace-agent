## [2026-07-09 22:00] | Task: Agent 评估 Doctor CLI

### User Request

- 继续完成 ActSpace Agent 评估执行计划。
- 推进真实 Docker/live Agent 路径前的环境可诊断能力，避免真实 eval 在半路失败后难以判断原因。

### Changes

- 外部 `actspace-agent-eval` 仓库：
  - 新增 `src/doctor/doctor.ts`。
  - 新增 `actspace-agent-eval doctor` 子命令。
  - doctor 检查项：
    - dataset manifest 是否能加载。
    - ActSpace CLI dist 文件是否存在。
    - Docker CLI 是否可执行。
    - Docker daemon 是否可连接。
  - 输出结构化 doctor report。
  - doctor 检查失败时 CLI 以非零退出码结束，但仍打印结构化结果。
- ActSpace 文档：
  - 更新 `docs/design-docs/evaluation/agent-evaluation.md`，将 doctor 作为真实 Docker/live Agent 前的环境预检。
  - 更新执行计划，记录当前本机 `doctor` 结果：dataset、ActSpace CLI dist、Docker CLI 通过，Docker daemon 未连接。
- 外部 eval 文档：
  - 更新 README 和架构文档，说明 doctor 命令和检查项。

### Verification

- 外部 `actspace-agent-eval`：
  - `npm run typecheck` 通过。
  - `npm test -- src/test/doctor.test.ts` 通过。
  - `npm run build` 通过。
  - 手动验证 `node dist/cli.js doctor --dataset coding-basic --actspace-path ...`：
    - dataset 通过。
    - ActSpace CLI dist 通过。
    - Docker CLI 通过。
    - Docker daemon 失败并给出 socket 连接错误。

### Notes

- doctor 只做环境预检，不替代真实 eval run。
- 当前真实 Docker 阻断点已明确是 Docker daemon 未启动。
