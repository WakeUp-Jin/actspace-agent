# 仓库文档与 `packages` 清理

状态：实现与自动化验证完成，待用户审阅；兼容层和暂无消费者包按退役条件保留。

## 目标

清理已经退役的本地构建残留，校正文档入口和执行计划生命周期，收敛包测试引用，并为仍有兼容职责的代码留下可验证的退役条件。

## 范围

- 包含：`docs/` 当前入口和执行计划状态、`packages/` 可达性与导出边界、已确认的忽略残留、文档与执行记录同步。
- 不包含：删除历史记录、删除 Context/Prompt 兼容层、删除 `@actspace/util`、拆分大文件、修改 Desktop renderer 行为或 Runtime 协议。

## 背景

- 扫描基线：3,811 个文件；审计信号报告 605 个漂移标记。
- 已通过：`check:docs`、`check:current-docs`、`check:packages`、`check:package-cutover`、`check:repo`、`check:v2-legacy-removal --strict`。
- 旧 `core-tools` 聚合包已在工具插件拆分中退役；当前工作树仍有忽略的 `dist`、source map 和 `node_modules`。
- `@actspace/context`、`@actspace/prompt` 的兼容入口仍被测试或 Agent Loop fallback 使用，先保留。

## 变更任务

1. 将已执行完成的 Desktop 前端重构 00、09–17 从 `exec-plans/active/` 移入 `exec-plans/completed/`，同步入口、执行记录、历史和相对链接。
2. 修正 Mermaid 实现建议、自进化专题索引和 Boot README 的当前状态；给未作为当前契约的 demo/草稿补充状态说明。
3. 删除忽略的 `packages/tools/core-tools/{dist,node_modules}` 与 `apps/desktop/packages/desktop/node_modules` 本地残留。
4. 将 Cordis adapter 测试夹具内聚到 adapter 的测试目录，移除 `../../test-support/src` 深路径；保留 `@actspace/test-support` 的公共入口，避免为反向测试依赖制造包循环。
5. 对 `@actspace/util`、Context assembly、Prompt assembler 做源码、测试、动态 manifest 和契约矩阵复核；不满足零引用和兼容性决策条件时只记录，不删除。
6. 更新执行过程、执行摘要、history，并生成清理后的统计结果。

## 风险与回退

- 计划移动可能造成 Markdown 相对链接断裂；移动后立即运行 current-docs/link 检查，必要时只回退路径更新。
- 删除的目录全部被 Git 忽略且没有当前源码；若重新生成，说明仍有旧脚本或本地命令写入，需要追查来源而不是恢复目录。
- 测试支持入口改为包导出后，若 TypeScript 解析失败，优先修正 `exports`/devDependency，不回到深路径导入。
- 历史文档保留旧术语和旧路径作为证据；当前入口只引用现行 v2 路径。

## 验证方式

```text
pnpm run check:docs
pnpm run check:current-docs
pnpm run check:packages
pnpm run check:package-cutover
pnpm run check:repo
pnpm run check:v2-legacy-removal -- --strict
pnpm typecheck
pnpm build
pnpm run test:contract-matrix
pnpm refactor:stats after --plan 20261011-repo-cleanup
git diff --check
```

定向测试：`@actspace/test-support`、`@actspace/cordis-adapter`、`@actspace/context`、`@actspace/prompt` 和受影响的 Runtime 测试。

## 验收标准

- 当前文档入口不再出现自相矛盾的实施状态或已删除的当前源码路径。
- 已完成计划只出现在 `completed/`，历史记录链接仍可访问。
- 两组忽略残留目录不存在，且没有当前包、manifest 或构建脚本依赖它们。
- Cordis adapter 测试不再深路径导入 test-support。
- 兼容层和 `@actspace/util` 都有引用证据、保留理由和明确的后续退役条件。
- 包导出、契约矩阵、typecheck、build 和仓库门禁全部通过。

## 执行模式

交互模式。每个删除批次保持独立，便于查看 diff 和回退。
