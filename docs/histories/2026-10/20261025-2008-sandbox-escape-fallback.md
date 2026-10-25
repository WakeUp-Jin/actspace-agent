## [2026-10-25 20:08] | Task: 工具沙箱的出沙箱与回退

### Execution Context

- Agent ID: `/root`
- Base Model: Claude Opus 5.5
- Runtime: Claude Code

### 用户诉求

调研 Codex、Cursor、DSH、OpenCode 的沙箱触发频率、出沙箱参数和回退方式后，按[计划](../../exec-plans/completed/20261025-sandbox-escape-fallback.md)对齐：`full-access` 下 bash 不进沙箱；其他模式下 Agent 用 `sandbox_permissions` 加 `justification` 申请出沙箱，每次批准；命令被沙箱拦了，结果里告诉 Agent 可以申请。

### 变更与动机

- **参数**：照 DSH、Codex 改为 `sandbox_permissions: "require_escalated"` 加必填 `justification`，删除 `requiredPermissions: ["no_sandbox"]`。理由写在审批卡上，让用户知道为什么要离开沙箱；只给一个直接拒绝，不弹审批。
- **`full-access` 不进沙箱**：这个模式本来就自动批准出沙箱，原来的保护只是“先失败一次”。提取资源因此需要知道权限模式，tools-runtime 的上下文加了 `mode`。
- **继承模式标记**：评估沙箱里的候选以 `full-access` 运行，bash 不再自己进沙箱，管理器在继承模式下优先报 `inherited`，结果仍说明外层沙箱在。
- **被拦提示**：先实测 nono、Seatbelt 的拦截输出（T0）。沙箱拦截写入报 `Operation not permitted`，命令自己的权限错误是 `Permission denied`，所以只匹配前者和 `EPERM`；退出码只排除 2、126、127。npm 的 `EPERM` 在前面、结尾是误导性的建议，所以看输出末尾 8KB。钥匙串没有稳定特征，只在描述里点名。
- **不做**：出沙箱的批准不记住、不自动弹“沙箱外重跑”、系统写入组不动。

### 验证与边界

- 包测试、全仓 `typecheck` 与 `test` 通过；真实 Host 端到端覆盖被拦提示、带理由的出沙箱审批、参数不成对被拒、`full-access` 直接执行；harness-evaluation 集成测试复跑，候选仍为 `inherited`。详见[执行摘要](../../exec-runs/20261025-sandbox-escape-fallback/execution-summary.md)。
- 未做：Desktop 审批卡的实机外观、Web 审批卡显示理由、Linux 拦截特征。
- Codex 验收（Computer Use + Host 端到端）：运行时各项通过；发现权限按钮悬停提示仍写“完全权限下沙箱仍生效”，已修复并同步两份权限文档；审批附近的 Computer Use 超时判断为验收通道问题。
