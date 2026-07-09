## [2026-07-09 16:30] | Task: Agent 评估裁判模型评分器基础

### User Request

- 继续完成 ActSpace Agent 评估计划。
- 为外部 `actspace-agent-eval` 评估仓库补上裁判模型评分器基础，但不要把真实模型调用放进默认 CI。

### Changes

- 在外部 `actspace-agent-eval` 仓库扩展 case grader 类型：
  - `judge-final-response`
  - `judge-context-quality`
- 新增 `JudgeClient` 接口和 `StaticJudgeClient`，用于后续接入真实 judge model adapter。
- 新增结构化 judge prompt 构造，分别覆盖最终回复评分和上下文质量评分。
- 将单 case report 构建器改为异步，支持确定性 graders 和 judge graders 混合运行。
- 未配置 judge client 时，judge grader 会生成结构化 failed grader result。
- 更新外部 `README.md` 和 `docs/ARCHITECTURE.md`，说明 judge grader 是可选接口，默认 CI 只跑 static judge。
- 更新 `docs/design-docs/agent-evaluation.md` 和执行计划，记录当前实现边界和剩余真实模型工作。

### Verification

- 外部 `actspace-agent-eval`：
  - `npm run typecheck` 通过。
  - `npm test` 通过，12 个测试文件、24 条测试。
  - `npm run build` 通过。

### Notes

- 本轮没有接入真实 judge model，也没有让 CI 调用外部模型服务。
- 真实 Agent 模式仍需要后续补齐 verification command、git diff 和 context snapshots 的采集。
