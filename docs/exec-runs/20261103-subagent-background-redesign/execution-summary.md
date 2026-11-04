# 子智能体与后台任务改造 — 执行摘要

## 基本信息

- **关联计划**：`docs/exec-plans/completed/20261103-subagent-background-redesign/README.md`（S1–S6）
- **设计**：`docs/design-docs/子智能体和后台任务设计规范/`（01–05）
- **执行过程**：[execution-process.md](execution-process.md)（步骤 0–8，和设计不同的地方都写在各步骤的「决定」里）
- **验收**：[acceptance-handoff.md](acceptance-handoff.md)、[acceptance-results.md](acceptance-results.md)
- **执行模式**：交互
- **执行结果**：完成。Electron 验收 23 点：17 通过、0 失败、6 部分覆盖
- **分支**：`feat/subagent-background-redesign`（已合入 origin/main 的 PR #32）

## 核心变更清单

| 变更 | 影响范围 | 说明 |
|------|----------|------|
| S1 契约与留痕 | shared 契约、session、runtime | 子会话 transcript 路径和 Bash 日志路径交给主智能体，进入 Context「路径」，读取不弹审批 |
| S2 后台 Bash | tool-runtime、background-tasks | 后台输出写会话目录 `bash-log/`；`task_output` 带 `since` 增量读取；完成通知带 `<output_path>`；退出后标 `lost` |
| S3 子智能体核心 | subagent、agent-service、loop | 默认后台、空闲可续派（`send_message`）；预设通用 / 探索；`wait_agent` / `list_agents` / `interrupt_agent` / `list_subagent_models`；并发上限 10；子智能体不弹审批 |
| S4 Fork | subagent、runtime | `agent_fork` 继承父会话前缀，复用提示词缓存 |
| S5 外部子智能体 | 新插件（Codex、Claude Code） | 默认关闭、重启生效；返回 CLI 原生记录路径；不能续聊 |
| S6 界面、设置与文档 | desktop renderer、client、设置 | 统一子智能体卡片、管理工具行、通知行；「子 Agent」面板一个子智能体一行；「后台任务」只放 Bash；设置「子智能体」用途和子 Agent 页 |
| 验收修复（步骤 7） | loop、agent-service、tool-runtime、client、desktop | BUG-01 轮内通知行；BUG-02 空闲续派写锁冲突；BUG-03 子智能体只读使用父会话授权 |
| 合入 #32（步骤 8） | desktop main / renderer | 「#32 外观 + S6 数据」：分组卡列表、一行顶部栏，保留状态、第 N 轮、停止；token 按激活次数缓存 |

## 人工验证指引

### 必须验证

1. **合入 #32 后的子 Agent 面板（Electron）**
   - 验证方式：在 Electron 里派一个后台子智能体并续派一次，打开右侧「子 Agent」。
   - 预期结果：分组卡里这一行右上的 token 在第二轮后继续增长；右下写「空闲 · 第 2 轮 · 耗时」；运行中的行有停止按钮；详情顶部栏一行，标题悬停能看到种类。

### 建议验证

1. **Codex 成功链路（X15、X17 的 Codex 变体）**
   - 验证方式：修好或删掉本机 `/opt/homebrew/bin/codex` 后，开启「Codex 子智能体」并重启，让主 Agent 用 `agent_codex` 做一件小事。
   - 预期结果：返回 `~/.codex/sessions/…/rollout-…jsonl`，读取不弹审批；详情只有结果和记录文件。
2. **其余部分覆盖点**：X2 进行中工具的 `→ running` 标记、X13 老会话里 Explore 和未收尾委派、X14 命令缺失时的插件说明、X23 深色下 Codex 详情。

## Agent 已完成的验证

- `pnpm typecheck`、`pnpm test`（含全部根目录检查）在合入 #32 后的工作区通过。
- 站点 parser 测试、站点构建与 `check:docs` 通过（更新日志补到 2026-11-04）。
- Electron 首轮验收（Playwright / CDP 操作真实 Electron）：12 通过、5 失败、6 部分覆盖；三个缺陷修复后，复验 X1、X4、X6、X8、X21 全部通过。
- 浏览器 mock `?mock=subagent-trajectory` 浅色 / 深色截图：合入后的列表、探索、Fork、Codex 详情。

## 已知风险和遗留事项

- 卡片第二行的最终回复仍原样显示 Markdown 标记（列表已去掉）。
- 应用退出中断（lost）的通知展开后是给模型看的英文摘要。
- 同步子智能体超过 30 分钟转后台只有单测。
- Claude Code 对很长的目录名会截断加哈希，ActSpace 没照做，极长路径的工作区里记录路径可能对不上。
- Host 被强杀时外部 CLI 子进程可能残留，下次启动只补 `lost`，不清理进程。
- Space 工作台里「子 Agent」的说明仍是「一次性助手」。

## 后续建议

- 修好本机 Codex CLI 后补验 Codex 成功链路。
