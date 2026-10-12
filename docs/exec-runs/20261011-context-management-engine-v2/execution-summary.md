# 上下文管理引擎 V2 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261011-context-management-engine-v2/README.md`
- **执行过程**：`docs/exec-runs/20261011-context-management-engine-v2/execution-process.md`
- **执行模式**：交互
- **执行结果**：实现、自动化检查与最终 Computer Use 已完成；保留明确的 UI 阻塞项

## 核心变更清单

| 变更 | 影响文件 | 说明 |
|---|---|---|
| 长期 Context 生命周期与快照边界 | `packages/context/engine/src/instances.ts`, `types.ts`, `engine.ts` | 按 `Session + logicalAgentScopeId` 复用实例；每次模型调用继续生成冻结 `LlmInput`。 |
| 模块 reducer、持久水位与只读 Projection | `packages/context/engine/src/reducers.ts`, `projection.ts`, `request-snapshot.ts` | reducer 只能更新声明切片；`reconcile` 检查 durable watermark；Projection 不暴露运行句柄。 |
| 物理插件包与 Harness 映射 | `packages/context/*`, `packages/context/engine/src/modules.ts` | engine、各 Context 类型插件、disclosure、compaction 都是独立 workspace 包；Prompt 只保留 source-support。 |
| Host/IPC Projection | `packages/context/engine/src/plugin.ts`, `packages/agent-service/src/application.ts`, `apps/desktop/src/main/runtime-v2/` | engine 只读 Projection 经 Runtime/Host 查询，fixed renderer 转为既有 `ContextState`；无内存实例时回退 Journal。 |

## 人工验证指引

后端命令和 Computer Use 操作分组、证据及未覆盖边界按测试验收计划记录。此前 CU 是提前探索，最终验收必须在自动化检查结束后重新委派。

## Agent 已完成的验证

- `pnpm --filter @actspace/context-engine test`：9 个测试文件，19 tests 通过。
- `pnpm --filter @actspace/context-disclosure test`：2 个测试文件，21 tests 通过。
- `pnpm --filter @actspace/context-compaction test`：4 个测试文件，17 tests 通过。
- Context 子包 lifecycle/typecheck/build 与默认 Harness build：通过；`pnpm check:packages` 发现 56 个 workspace 包。
- `pnpm --filter @actspace/core-agent-loop test`：7 个测试文件，37 tests 通过。
- `pnpm --filter @actspace/core-agent-loop build`、`@actspace/agent-service build`、`@actspace/runtime build`：通过。
- `pnpm --filter @actspace/runtime test`：20 个测试文件，54 tests 通过；`@actspace/shared test`：21 个测试文件，164 tests 通过。
- `pnpm typecheck`：全仓库通过（含 apps/desktop、apps/cli、apps/site）。
- `pnpm check:package-cutover -- --strict`、`pnpm check:v2-legacy-removal -- --strict`、`pnpm check:packages`：通过。
- `pnpm test:contract-matrix`：4/4 通过；先重生成了物理拆包后的 contract matrix。
- `pnpm test:current-docs`：7/7 通过；`git diff --check`：通过。
- `pnpm test`：Context/Loop/Runtime 等主体测试通过；apps/desktop 有 7 个文件、8 个测试超时和 1 个未处理错误（现有前端工作区改动的基线问题），未修改无关测试。

## Computer Use 验收结果（GPT-6.1-sol）

最终验收已在后端自动化和物理拆包完成后重新委派给 `gpt-6.1-sol` 子智能体。真实 Electron 中 B1-5 通过，B1-10 有限通过；其余写入/模型切换/压缩/Fork/错误/重启路线因当前旧 Session 为 browse-only 而未覆盖。此前的 CU 只属于探索，未计入最终通过。

| 验收点 | 结果 | 证据与限制 |
|---|---|---|
| B1-1 首次会话与当前 Context | 未覆盖/阻塞 | 新建会话与 `⌘N` 均无状态变化，旧 Session 为 browse-only。 |
| B1-2 多 Step 工具链 | 未覆盖 | 无可写 Session/Provider，未触发工具链。 |
| B1-3 模块局部变化 | 未覆盖 | 无法重复发送并观察 revision。 |
| B1-4 模型切换 | 未覆盖 | 模型菜单无可见切换结果。 |
| B1-5 Popup/详情/Composer | 通过 | 真实 UI 显示分桶、容量、统计、工具明细和 Composer。 |
| B1-6 压缩与渐进披露 | 未覆盖 | 无长会话写入或压缩入口。 |
| B1-7 关闭重开恢复 | 未覆盖 | 未关闭当前开发窗口，避免破坏验收环境。 |
| B1-8 Fork 隔离 | 未覆盖 | 未发现可用 Fork 入口且无写入 Session。 |
| B1-9 工具/权限/错误 | 未覆盖 | 未触发真实错误或权限路线。 |
| B1-10 无活跃 Run 只读 Context | 有限通过 | 空闲旧 Session 可读；CU 未能证明 Journal 完全不变。 |

## 已知风险和遗留事项

- 最终 Computer Use 报告已回传；B1-1 至 B1-10 逐项结果已记录。未覆盖项是 browse-only Session 的真实阻塞，不是推断通过。

## 后续建议

- 计划已移入 `docs/exec-plans/completed/`；若要补齐写入型 UI 验收，应先提供可写隔离 Session/Provider，再对 B1-1、B1-2、B1-3、B1-4、B1-6、B1-7、B1-8、B1-9 定向复验。
