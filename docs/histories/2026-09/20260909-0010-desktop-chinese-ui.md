## [2026-09-09 00:10] | Task: 统一日常桌面界面中文文案

### Execution Context

- Agent ID：当前主 Agent。
- Base Model：会话未提供可核验的具体模型标识。
- Runtime：Codex Desktop。

### User Query

先统一日常主界面中文，不做语言切换；保留 Chat、Plan、Thinking、Effort、思考档位及工具执行名称。用户批准修订版方案后要求执行。

### Changes Overview

- 桌面 renderer 的侧栏、输入框普通操作、工作区控件、右侧面板和设置残留文案中文化，同步 Tooltip 与无障碍名称。
- 上下文分类和终端默认标题在展示层转换；创建、恢复、重启一致，不修改共享协议或持久化数据。
- 斜杠菜单保留命令与原英文搜索，增加中文搜索；工具执行组件和工具命名保持原样。
- 增加独立浏览器验收样例，更新现有组件测试并补充终端创建/恢复回归。

### Design Intent

日常操作使用统一中文，同时保留开发者熟悉的模式和工具语义。区分应用文案与原始数据，不按英文字符串批量改写用户内容。

### Key Files

- `apps/desktop/src/renderer/components/Composer.tsx`
- `apps/desktop/src/renderer/context-labels.ts`
- `apps/desktop/src/renderer/components/right-panel/terminal-title.ts`
- `docs/design-docs/frontend/front-desktop-chinese-ui.md`

### Verification

类型检查、renderer 构建通过；57 个 renderer 测试文件、432 个用例通过。浅色宽屏、深色窄布局与真实 Electron 主界面/通用设置已观察。完整命令与边界见[执行摘要](../../exec-runs/20260908-desktop-chinese-ui/execution-summary.md)。

### Learning

展示文案与数据身份分离、搜索别名兼容命中可迁移性与陷阱两项，见[学习速记](../../learnings/2026-09/20260909-display-language-and-data-identity.md)。
