# 内置 Harness 连续升级与验收修复

> 2026-10-18 状态校准：内置 Harness 连续升级已实现；旧 Vite 缺失样式阻塞是当时现场，当前基线可启动并完成真实调用。 下文保留原始实施决策与过程；最新分项证据见 [近期验收](../../exec-runs/20261018-recent-features-acceptance/acceptance.md)。
用户已确认修复方案，交互模式。范围：Q1 任务停队列；C1 验收文档与样例偏差。

## 根因与证据

原实例已有 bootstrap 与 trusted-builtin-upgrade 两条选择记录；当前 Host 指纹变化，恢复报 RESTART_REQUIRED。升级条件只允许单条 bootstrap，且 Runtime 排除含 plugin-manager 的内置版本。HMR 又丢失错误码，使调度器保持 pending/unpaused 并永久失败。复制选择记录至临时目录、运行真实 Control→HMR→RunManager 已复现；未修改用户原记录。

## 步骤与验证

- [x] 复现并先跑失败回归：连续升级失败、相同版本重复写修订、HMR 恢复阻塞码丢失。
- [x] 修复 Control 内置连续升级与版本相同比较；完整历史必须全部属于 Host 内置升级，排除用户选择/分支，损坏制品保持阻塞。
- [x] Runtime 接纳含 plugin-manager 的内置版本；HMR 返回 RECOVERY_BLOCKED，复用现有队列暂停/恢复机制。
- [x] 补三轮 mock（2/6/1 文件）并同步验证文档。
- [x] 包测试、依赖构建、类型检查。
- [ ] 文档守卫与最终差异检查。
- [ ] gpt-6.1-sol Computer Use：原实例恢复发送→完成、停止及真实 present；mock 第三轮单文件。

## 边界与回退

保留用户现有未提交修改和选择历史，不删数据、不改 Key、不提交。只升级完整可信内置历史；自定义或分支继续走显式授权。失败时保留证据与待处理任务。回退代码不回写旧选择记录，旧版本需按兼容性恢复流程处理。

## 记录

执行记录：../../exec-runs/20261014-harness-builtin-upgrade-fix/execution-process.md
验收摘要：../../exec-runs/20261014-harness-builtin-upgrade-fix/execution-summary.md

当前阻碍：其他未完成改动在 index.css 引用缺失的 trajectory.css，Vite 遮罩阻断界面复验。原用户选择历史已从 2 升级到 3，旧记录逐字保留；不能据此宣称真实发送和交付卡通过。
