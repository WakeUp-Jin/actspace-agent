# Permission Runtime 基础切换 — 执行摘要

## 执行状态

> 基础切换已完成。Desktop 文件 Session Grant 仍属于独立后续计划。

## 基本信息

- **关联计划**：`docs/exec-plans/completed/permission-runtime-foundation.md`
- **执行过程**：`docs/exec-runs/permission-runtime-foundation/execution-process.md`
- **执行模式**：交互模式
- **执行结果**：实现与自动化验收完成

## 核心变更清单

- 公共权限合同只保留 `default/full-access`；旧 `trusted/yolo`、旧 approval decision 和旧 permission codec 不再可达。
- Tool Runtime 统一结构化资源提取、全局边界、工具判断、一次审批、防重放与审批后复验。
- 文件工具覆盖 canonicalization、missing target、symlink、非普通文件、protected 与 once-only；Bash 和 delete 始终询问一次。
- Session Journal 与 Projection 持久化 mode 和完整 asked/decided 审计；CLI resume 遵循显式覆盖、否则恢复的规则。
- Desktop/CLI 都只支持 `once/deny`；Desktop 增加当前 Session 的 `default/full-access` 控件。
- 旧 Browser Session 审批缓存已删除；Session Grant 尚未实现。

## 人工验证指引

- 在真实 Electron 中分别检查浅色、深色和跟随系统主题下的 mode 控件、文件/Delete/Bash 审批卡片。
- 验证 Session reload 后 mode 恢复，运行中 mode 控件禁用，mode 降级后没有陈旧审批继续执行。
- 验证 default 下 workspace 外文件触发询问，full-access 下普通文件放行，但 Bash、delete 和敏感资源仍询问或拒绝。

## Agent 已完成的验证

- `pnpm typecheck`
- `@actspace/tools-runtime`：21 tests passed
- `@actspace/tools-core-tools`：18 tests passed
- `@actspace/session-journal`：10 tests passed
- `@actspace/session-projection`：9 tests passed
- `@actspace/client`：8 tests passed
- `@actspace/agent-cli`：13 tests passed
- `@actspace/desktop`：106 files / 752 tests passed
- `pnpm check:docs`
- `pnpm check:current-docs`
- `pnpm run gen:contract-matrix --check`
- 源码、`dist` 和 CLI help 旧符号扫描通过；`git diff --check` 通过。

## 已知风险和遗留事项

- 跨平台 sandbox、真实 Browser、DMG、签名和 notarization 不在本计划验收范围。
- 真实 Electron 主题矩阵和 mode/审批交互仍需人工验收；自动化通过不替代该门禁。
- 含旧 required 权限事件的历史 Session 不做迁移，旧语义不能恢复执行，只允许 browse-only。

## 后续建议

- 下一阶段按 `docs/exec-plans/active/session-scope-grants.md` 实施 Desktop 文件 exact/subtree Session Grant、恢复、查看与撤销。
