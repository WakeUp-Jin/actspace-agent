# 仓库文档与 `packages` 清理

- **状态**：完成，未提交；本轮未修改 Desktop renderer 行为，因此不追加 Computer Use 验收。
- **范围**：归档已执行的 Desktop 前端重构计划，修正当前文档入口和状态，清理忽略的旧构建残留，收口 Cordis 测试夹具边界。
- **更新日志边界**：本轮是仓库内部维护，没有用户可直接感知的功能、体验改进或问题修复；按照发布记录规范不新增公开更新日志条目，改由本 History 和执行摘要保留完整记录。
- **文档**：新增清理计划、执行过程和执行摘要；修正 Mermaid 组件路径、自进化索引、Boot README、PB.3 待实施路径说明及 demo 状态；历史文档保留旧术语和证据。
- **包清理**：删除未跟踪的 `packages/tools/core-tools/` 与 `apps/desktop/packages/desktop/` 残留；将 Service fixture 放到 `packages/cordis-adapter/tests/fixtures/`，移除 `@actspace/test-support` 的反向依赖和深路径导入。
- **保留决策**：`@actspace/util`、Context `assembly.ts` 和 Prompt assembler 仍保留；对应 README 已记录当前证据、兼容边界和退役条件。
- **契约矩阵**：补登记 `harness-hmr`、`plugin-manager` 的 manifest 和 `official-skills`、`harness-hmr`、`plugin-manager` 的 package manifest，重新生成矩阵产物。
- **验证**：`check:docs`、`check:current-docs`、`check:packages`、`check:package-cutover`、`check:repo`、`check:v2-legacy-removal --strict`、`typecheck`、`build`、定向包测试、`test:contract-matrix`、`refactor:stats after` 与 `git diff --check` 均通过。构建仍报告既有 CSS `::highlight` 兼容性警告和 chunk 大小提示，本轮未扩大范围。
