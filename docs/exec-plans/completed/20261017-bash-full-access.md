# Bash 完全权限与审批恢复修复

## 目标与授权

2026-10-17 用户已批准修复范围，并要求先写计划再修改。完全权限下通过既有硬规则的 Bash 自动执行；等待审批期间切换模式会重新判断当前调用；自动模式保留既有审批与会话前缀授权。执行卡住独立采证，不把模型对仓库大小的推测当作根因。

## 依据与边界

必读：AGENTS.md、REPO_COLLAB_GUIDE、ARCHITECTURE、core-beliefs、CODING_BEHAVIOR、FRONTEND_VERIFICATION、前端新功能开发清单、HISTORY_GUIDE。

已确认：shell-tools/plugin.ts 的 evaluate 固定 ask；Tool Runtime 等待 broker Promise，随后拒绝权限模式变化；PermissionModeControl 的说明明确仅放宽文件范围。node-ports.ts 超过 blockMs 应转后台而非宣称失败。

本次修改超过 5 个源码文件，限于 Shell 权限、运行时审批恢复、Host 取消清理和权限说明及配套测试。保留现有命令硬拒绝、沙箱、cwd、文件敏感路径和 Host capability 规则；不承诺完全权限等于解除 OS 沙箱，不改变 CLI 显式权限覆盖，不新增设置或持久 schema。已有历史文档作为旧版本证据保留。

## 实施顺序（同一交付）

1. **权限矩阵**：修改 `packages/tools/shell-tools/src/plugin.ts`，硬拒绝优先，通过后 full-access allow/default ask。在 lifecycle 测试覆盖普通命令、no_sandbox、硬拒绝及自动模式授权建议。先运行新测试观察失败，再实现。
2. **审批恢复**：`packages/tools/runtime/src/prepared-execution.ts` 接收可选权限变化订阅；`packages/runtime/src/harness/agent-factory-plugin.ts` 用既有 Session projection 事件接线。移除 Desktop runtime-registry 切换前 expireAll 的旧路径；等待时撤销旧请求、记录关闭事实，重新提取资源并评估；通过新的政策后才执行。取消仅影响单个请求，Desktop `host-ports.ts`、`approval-broker.ts`、`approval-registry.ts` 补 request 级清理。保留硬拒绝、资源复查及最终执行前模式检查；取消/超时/拒绝不得被切换覆盖。订阅和计时器必须清理。
3. **执行基线**：真实子进程测量 printf、git status、git log；比较沙箱与非沙箱，验证超时转后台、bash_output、bash_kill、AbortSignal 和 dispose。仅修可复现的执行生命周期缺陷；原用户仓库无证据时明确未复现。新增测试放 `packages/tools/shell-tools/src/test/node-ports.test.ts`。
4. **产品说明**：更新 `apps/desktop/src/renderer/components/workbench/PermissionModeControl.tsx` 的权限说明及测试；同步当前权限/子进程设计文档。无需改样式。
5. **验收与收尾**：补充 `scripts/test/fixtures/agent-provider.mjs` 的无副作用 Bash 场景，复用既有隔离 Electron fixture。构建受影响依赖、运行定向测试和 Desktop 构建，维护执行记录/history，判断学习文档条件。未授权提交、推送、合并；完成后归档计划。

## 验证命令

- `pnpm --filter @actspace/runtime... build`
- `pnpm --filter @actspace/tools-shell-tools test`
- `pnpm --filter @actspace/tools-runtime test`
- `pnpm --filter @actspace/runtime test`（必要时先定向运行权限接线测试）
- `pnpm --filter @actspace/desktop exec vitest run src/main/test/runtime-v2-approval-broker.test.ts src/renderer/test/permission-mode-control.test.tsx`，追加本次 registry 回归。
- `pnpm --filter @actspace/desktop typecheck`、`pnpm --filter @actspace/desktop build`
- `pnpm check:docs`、`git diff --check`

无新 API key 需求。真实模型验收使用现有 Host 配置，缺少凭据时记录未覆盖；禁止打印凭据。使用当前工作树专属开发 runtime；必要时用独立数据目录避免干扰用户会话。

## Computer Use 验收点

- A1 自动模式普通 Bash 显示审批，允许后完成，拒绝后不执行。
- A2 完全权限连续两次普通 Bash 不出现审批并返回结果。
- A3 等待审批时切换完全权限，卡片消失、当前命令执行一次，后续命令自动执行。
- A4 切回自动后新的普通 Bash 恢复审批；切换会话不串权限。
- A5 硬拒绝命令仍不执行（以单测证明无副作用，UI 仅观察结果）。
- A6 长命令转后台可查看输出、终止；停止等待审批可解除等待，无残留卡片。
- A7 权限说明与行为一致，刷新后模式保持。

## 操作分组

- G1：一个测试会话依次自动审批允许/拒绝→等待中切完全权限→连续命令→切回自动，覆盖 A1–A4；保留审批前后和命令结果证据。
- G2：同一会话执行后台测试命令、读输出、终止，再停止待审批请求，覆盖 A6；保留中间状态和终态。
- G3：切换会话、刷新并检查权限说明，观察硬拒绝结果，覆盖 A4/A5/A7；保留模式与拒绝证据。

由 gpt-6.1-sol 子智能体执行真实 Electron Computer Use，逐点报告通过/失败/未覆盖。mock、源码、真实交互分别记录；模型不可用时报告限制，不换模型。

## 风险与回退

模式变更与用户拒绝/取消竞争：已返回的用户决策优先，重新评估不得产生重复执行；资源变化仍拒绝。订阅在所有路径释放，request 级取消不得关闭同 run 其他审批。测试覆盖模式切换、取消、过期、资源变化与多请求隔离。没有数据迁移，回退本次代码与说明即可；既有日志保持兼容。

## 进度

- [x] 范围批准、只读定位、计划自审。
- [x] 权限矩阵与审批恢复。
- [x] 执行基线与定向回归（原现场超时未复现）。
- [x] 构建与 Computer Use A1–A7 验收（UI 与 Journal 补证边界详见记录）。
- [x] 文档、history 和归档。

执行记录：[过程](../../exec-runs/20261017-bash-full-access/execution-process.md)、[摘要](../../exec-runs/20261017-bash-full-access/execution-summary.md)。
