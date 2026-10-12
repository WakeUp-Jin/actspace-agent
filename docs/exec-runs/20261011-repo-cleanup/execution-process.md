# 仓库文档与 `packages` 清理 — 执行过程

## 基本信息

- **关联计划**：`docs/exec-plans/active/20261011-repo-cleanup.md`
- **执行模式**：交互
- **开始时间**：2026-10-11
- **结束时间**：2026-10-11（门禁结果见执行摘要）

## 执行时间线

### 步骤 1：固定扫描基线

- **操作**：运行审计信号、仓库统计和 `refactor:stats before`。
- **影响文件**：新增 `refactor-stats-before.md`。
- **决定**：将忽略构建残留单独归类，不把它们当作当前源码包。
- **验证**：审计扫描 3,811 个文件；`refactor:stats before --plan 20261011-repo-cleanup` 成功。

### 步骤 2：归档已执行计划并修复链接

- **操作**：将 Desktop 前端重构 00、09–17 移到 `docs/exec-plans/completed/20261005-desktop-frontend-refactor/`，更新执行导航、设计入口、执行记录和 history 中的路径。
- **决定**：保留计划正文、验收交接和历史证据，只改变生命周期位置和当前入口描述。
- **验证**：计划目录已完成迁移；文档门禁在最终批次运行。

### 步骤 3：同步当前文档状态

- **操作**：修正 Mermaid 组件建议、自进化索引、Boot README，并给草稿/demo 增加明确状态。
- **决定**：历史和设计证据不删除；当前索引只指向现行事实。
- **验证**：已更新 Mermaid、自进化、Boot、demo 状态和 PB.3 待实施标记；文档门禁在最终批次运行。

### 步骤 4：清理忽略残留与测试深路径

- **操作**：删除旧 `core-tools` 与 Desktop 嵌套依赖残留；将 Cordis Service fixture 内聚到 adapter 的测试目录，移除 `test-support/src` 深路径和不再需要的反向 workspace dependency。
- **决定**：不删除 `@actspace/util`、Context assembly 或 Prompt assembler；本轮在各自 README 中记录保留理由和退役条件。
- **验证**：定向测试、typecheck 和构建在最终批次运行。

## 最终门禁

- 文档、包边界、package cutover、仓库卫生和 v2 legacy strict 检查全部通过。
- `pnpm typecheck` 和 `pnpm build` 通过；Desktop renderer 构建保留既有 CSS `::highlight` 和 chunk 大小警告。
- `@actspace/test-support`、`@actspace/cordis-adapter`、`@actspace/context`、`@actspace/prompt` 定向测试通过；Cordis adapter 保留 1 个既有明确 skip。
- 契约矩阵在补登记 `harness-hmr`、`plugin-manager` manifest 和三个新增 workspace package 后重新生成，`test:contract-matrix` 全部通过。
- `refactor:stats after --plan 20261011-repo-cleanup` 和 `git diff --check` 通过。

## 遇到的问题

- 旧 `core-tools` 的历史引用大量存在于已完成计划和历史文档中。它们属于历史证据，不能全局删除；当前源码、manifest 和生产组合扫描以现行包为准。

## 跳过或推迟的事项

- `@actspace/util`：当前没有消费者，但仍保留在契约矩阵，需单独确认公开入口是否要退役。
- `packages/context/src/assembly.ts`、`packages/prompt/src/assembler.ts`：仍被测试或 fallback 使用，暂不删除。
- 大文件拆分：没有足够的领域边界证据，本轮不做结构性重构。
