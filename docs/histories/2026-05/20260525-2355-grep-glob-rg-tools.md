# Grep/Glob rg 工具与 UI 改造

## 背景

用户希望新增的 `grep` 和 `glob` 工具不要继续复用 Search 的语义展示，而是作为和 Search 同级的独立工具能力出现。同时，`glob` 的实现需要改为和 `grep` 一样基于 ripgrep，并抽出可复用的受控子进程执行流，为后续 Bash 等工具复用打基础。

## 主要改动

- 新增 `packages/agent-core/src/tools/subprocess/run-process.ts`，统一封装受控子进程生命周期，包括 timeout、stdout/stderr、退出码、启动错误、耗时和输出裁剪。
- 新增 `packages/agent-core/src/tools/subprocess/ripgrep.ts`，作为 ripgrep 专用 adapter，隔离 `rg` 退出码、缺失命令和 stderr 错误语义。
- 将 Grep executor 改为通过 `rg --line-number --no-heading --color never` 执行，并保留 workspace-relative 路径与行号输出。
- 将 Glob executor 改为通过 `rg --files --glob` 执行，修复 `path + pattern` 的相对路径语义，并保留 mtime 排序与结果上限。
- 在 shared session、bridge、desktop renderer 中新增独立 `grep` / `glob` preview kind 与 message block。
- 前端 `ToolLogLine` 增加 `Grep <pattern> in <scope>` 和 `Glob <pattern> in <scope>` 展示，复用现有轻量工具行样式。
- 补充 agent-core、desktop 和 streaming UI 相关测试，覆盖 Grep/Glob 独立预览、rg 子进程封装和 Glob 路径语义。

## 文档同步

- 新增 `docs/design-docs/agent-core/subprocess-runner-guidelines.md`，说明通用 runner 与命令 adapter 的职责边界。
- 更新工具预览设计、agent-core 模块地图、前端中间消息区规范与设计文档索引。
- 新增 `docs/design-docs/llm-agent-fix-plan/04-skill-rg-tools-fix.md`，保留未来修复 `llm-agent-dev` skill 的源码计划，不在本轮执行。

## 验证

- `pnpm --filter @actspace/agent-core test`
- `pnpm --filter @actspace/desktop test`
- `pnpm typecheck`
- 浏览器 mock 页面确认消息区展示独立的 `Grep` 和 `Glob` 工具行，没有退回到旧的 Search 文案。
