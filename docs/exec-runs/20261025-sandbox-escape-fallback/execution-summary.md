# 工具沙箱的出沙箱与回退 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261025-sandbox-escape-fallback.md`
- **执行过程**：`docs/exec-runs/20261025-sandbox-escape-fallback/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成（分支 `feat/sandbox-refactor`，提 PR 合入 main）；Codex 验收后修复一处过时文案；Desktop 审批卡的理由行与深色主题未经实机完整复验

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 提取资源带权限模式 | `packages/tools/runtime/src/{permission/types.ts,prepared-execution.ts}` | shell-tools 要按 `full-access` 决定 `noSandbox`；首次提取与执行前复查都传入模式 |
| 继承模式优先标 `inherited` | `packages/sandbox/manager/src/execution.ts` | 评估沙箱里的候选以 `full-access` 运行，bash 不再自己进沙箱，但外层沙箱还在 |
| 出沙箱参数 | `packages/tools/shell-tools/src/plugin.ts` | `sandbox_permissions: "require_escalated"` 加 `justification`，删除 `requiredPermissions`；不成对 `BASH_ESCALATION_INVALID`；审批原因是理由；`full-access` 不进沙箱 |
| 被拦提示 | `packages/tools/shell-tools/src/node-ports.ts` | 沙箱内失败、退出码不是 2/126/127、输出末尾 8KB 含 `operation not permitted` / `eperm` 时，前台模型文字与后台结束通知末尾加一行提示 |
| 审批卡显示理由 | `packages/shared`、`packages/client`、`apps/desktop/.../BashRunBlock.tsx` | 待审批时命令下方显示一行理由 |
| 文档 | 执行安全入口、`docs/SECURITY.md`、shell-tools README、沙箱设计 | 改为当前行为；设计第 8 节补拦截特征实测 |

## 人工验证指引

### 必须验证

1. **Desktop 审批卡显示理由**
   - 验证方式：Electron 里用 `default` 模式让模型执行一条写 `~` 的命令（如 `touch ~/actspace-probe.txt`），等它被拦后带参数重试。
   - 预期结果：第一次失败；第二次弹审批卡，命令下方一行理由，底部“真实环境”，没有“本会话允许”；批准后成功。删除探测文件。
2. **`full-access` 不进沙箱**
   - 验证方式：切到 `full-access`，执行同一条命令。
   - 预期结果：不弹审批，直接成功，卡片标“真实环境”。

### 建议验证

1. **模型会不会一上来就申请出沙箱**
   - 验证方式：用真实模型跑几次普通任务（构建、测试、git status），看申请频率。
   - 预期结果：普通命令不带 `sandbox_permissions`；只有被拦或 `git push` / `gh` 时才申请。频率偏高就收紧参数描述。

## Agent 已完成的验证

- 包测试：tools-runtime 48、sandbox 30、shell-tools 113（含真实 nono、Seatbelt 写工作区外带提示）、client 49、shared 179、agent-cli 16、harness-evaluation 15（含真实 nono + CLI 候选 5 个，候选 bash 为 `sandbox=inherited`）、renderer 审批卡 25。
- 全仓：`pnpm check:packages`、`pnpm test:contract-matrix`、`pnpm test:current-docs`、`pnpm typecheck`、`pnpm test` 通过；`pnpm test:agent-host:process` 7 通过。
- Host 端到端（`tmp/sandbox-escape-spike/host-e2e.mjs`，真实 CLI Host + 假模型，nono）：
  - `default`：沙箱内写 `~` 失败（`exit 1, sandboxed=true, sandbox=nono`），紧接着的模型请求里带提示；带参数重试，审批的进程资源 `noSandbox: true`、原因就是理由、没有授权建议，批准后成功（`sandbox=none`），文件存在；
  - 只给 `sandbox_permissions`：`denied`、`BASH_ESCALATION_INVALID`，没有弹审批，文件不存在；
  - 切到 `full-access`：不弹审批，成功（`sandbox=none`）。

## Codex 验收与后续修复（2026-10-25）

Codex 用 Computer Use 加两个 Host 端到端脚本（`tmp/sandbox-escape-spike/host-e2e.mjs`、`tmp/sandbox-v1-e2e/host-e2e.mjs`）验收第一期与本计划，只排查、不修复：

| 验收点 | 结果 |
|---|---|
| 默认模式沙盒审批与会话授权、工作区写入与 `git status` / `pnpm`、工作区外写入与凭据读取被拦、`full-access` 直接执行、后台任务停止后无残留 | 通过 |
| 申请出沙箱 | 运行时通过（`noSandbox: true`、原因为理由、不成对被拒、批准后成功）；审批卡界面未完整复验 |
| Seatbelt 回退 / 无沙箱 | 未覆盖 |
| 主题与诊断 | 浅色可读、实际后端为 nono；深色未复验 |

两条记录的结论：

- **完全权限提示过时（真 bug，已修复 `a8cf4408`）**：权限按钮的悬停提示仍写“沙箱和禁止规则仍生效”，是 T2 改行为时漏改的文案。改为“完全权限扩大文件范围；Bash 不进沙箱，通过禁止规则后直接运行；文件删除及敏感文件仍按策略审批”，测试加断言防止再写回“沙箱仍生效”；`agent-tool-permission-model.md`、`agent-subprocess-runner-guidelines.md` 的同类说法一并更正。
- **Computer Use 在审批附近约 30 秒超时（判断为验收通道问题）**：截图中审批卡正常显示，应用 CPU 0.7%，journal 记录授权与执行都成功；出现在本轮未改动的普通沙盒审批卡上。没有改代码，可以手动点一次审批确认响应。

## 已知风险和遗留事项

- 识别是猜测：命令自己报 `EPERM` 也会带提示；提示里写明“不该需要这些权限就换做法”，出沙箱每次都要批准。
- 钥匙串没有稳定特征，`git push`（HTTPS）、`gh` 被拦时不会提示，只靠工具与参数描述。
- Linux 工具沙箱可用时，要补 Landlock 的 EACCES 特征。
- Web 客户端审批卡不显示理由（本来也不显示执行环境），不在本轮范围。
- `pnpm test:agent-cli:process` 的两条后台任务恢复测试在 HEAD 上就失败，与本计划无关，未处理。

## 后续建议

- 用一段时间后看实际申请频率，再决定要不要做会话内记住或前缀规则（S4 暂不做）。
