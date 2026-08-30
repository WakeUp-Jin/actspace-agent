# ActSpace v2 P00：契约地基与 ESM Runtime 隔离岛 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/active/20260822-actspace-v2-plugin-runtime/actspace-v2-p00-contracts-and-esm-island.md`
- **执行过程**：`docs/exec-runs/actspace-v2-p00-contracts-and-esm-island/execution-process.md`
- **执行模式**：交互
- **执行结果**：完成

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|------|----------|------|
| 新建 ESM Runtime island | `packages/agent-runtime/**` | 后续 v2 在 NodeNext strict 环境实现，不污染旧 CommonJS Agent Core |
| 新建 Host DTO 子路径 | `packages/shared/src/runtime-v2/**` | 为 Desktop、CLI run、CLI chat 提供独立且 JSON-safe 的 v2 契约 |
| 增加 shared export | `packages/shared/package.json` | 不改旧根入口与 `session-selectors` 语义 |
| 登记 workspace importer | `pnpm-lock.yaml` | 锁文件只增加新 package importer，无传递版本漂移 |

## 人工验证指引

### 必须验证

1. **恢复完整依赖树后重跑锁定工具链**
   - 验证方式：执行 P00 计划中的全部验证命令。
   - 预期结果：Vitest 3.2.4 下 6 个测试全部通过，TypeScript 与仓库静态检查退出码为 0。

### 建议验证

1. **检查 public export**
   - 验证方式：构建 shared 与 agent-runtime 后分别导入两个 package 子路径。
   - 预期结果：shared helper 可用，agent-runtime 根入口只有类型声明，不存在 `RuntimeHandle` 或 Cordis 运行时值。

## Agent 已完成的验证

- TypeScript 5.9.3：shared 与 agent-runtime 构建通过。
- DTO 单元测试：workspace Vitest 3.2.4，4/4 通过。
- package boundary 单元测试：workspace Vitest 3.2.4，2/2 通过。
- Node DTO smoke：JSON 往返、深冻结、非法 class instance 拒绝均通过。
- 隔离扫描：未发现 Cordis、pi-ai、旧 Session、Electron 或 Secret 依赖。
- 仓库检查：`check:docs`、`check:repo`、`check:secrets`、`git diff --check` 全部通过。

## 已知风险和遗留事项

- 根 workspace 依赖树因 registry/审批服务故障未完整恢复；P00 已在锁定的 Vitest 3.2.4 下重跑，fresh install 仍需外部门禁恢复。
- `capability ceiling` 只是同进程受信任插件的能力约束，不提供进程隔离或恶意代码防护。

## 后续建议

- P01 先完成 fresh install 与 Cordis 精确版本准入；P02 可在 P00 契约之上独立验证 pi-ai。
