# 工具结果交互与后台通知修复 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20260913-tool-result-interaction-fixes.md`
- **执行过程**：`docs/exec-runs/20260913-tool-result-interaction-fixes/execution-process.md`
- **执行模式**：交互
- **执行结果**：代码与自动化验证完成；真实 Electron/Provider/截图门禁待人工验收

## 核心变更清单

- 后台 Bash 通知增加 typed provenance，模型可见、用户消息 selector 隐藏。
- Read/List/Grep/Glob/Directory List 统一 bounded `tool-result-*` disclosure，历史回放保留 `resultPreview`。
- Read 工具仅对 workspace 内安全相对路径提供 Open file 动作，复用既有 workspace IPC 和右侧文件 Tab。
- Explore 与 Agent 统一使用右侧 SubAgent panel，移除 Explore 主消息内联 transcript 路径。
- 图片成功产物继续走 turn Artifacts；失败/warning 改为可点击展开；HTML/非法 JSON provider 响应归一化为稳定错误。

## 人工验证指引

- 运行一轮后台 Bash 完成与 kill，确认主消息不显示 `<task_notification>`，普通用户粘贴同样文本仍可见。
- 分别测试 fresh stream 与 reload 后的 list/glob/read，确认 Chevron 和前 8 行预览一致。
- 点击 Read 的 Open file，确认 markdown/text/html/image/csv 由右侧文件 Tab 呈现；越界路径显示错误而不读盘。
- 点击 Explore 行，确认右侧 SubAgent panel 聚焦 child Session，主消息区不出现内联 transcript。
- 让图片 Provider 返回成功、partial、HTML 200、非法 JSON，确认成功图片从 Artifacts 打开，失败从工具行 disclosure 查看。

## Agent 已完成的验证

- `pnpm --filter @actspace/shared exec vitest run src/test/session-selectors.test.ts`：21 tests passed。
- `pnpm --filter @actspace/core-agent-loop test`：13 tests passed。
- `pnpm --filter @actspace/core-agent test`：11 tests passed。
- `pnpm --filter @actspace/tools-core-tools exec vitest run src/test/node-ports.test.ts`：16 tests passed。
- Desktop focused tests：projection 16、tool preview 27、artifact presentation 19、conversation tooltip 10，合计 72 tests passed。
- `pnpm --filter @actspace/shared build`、core-agent/core-agent-loop build、`pnpm --filter @actspace/desktop typecheck`：通过。
- `pnpm run check:frontend-theme`：通过。
- 按 `docs/learnings/WRITING_GUIDE.md` 生成可迁移学习文档：`docs/learnings/2026-09/typed-tool-provenance-and-targets.md`。

## 已知风险和遗留事项

- 自动化未覆盖真实 Electron 面板、真实 Provider 返回、右侧文件 Tab 在打包应用中的行为和浅/深主题截图验收。
- 完整 desktop suite 保留两个既有 baseline failures，详见 execution-process；本计划相关 focused tests 均通过。
