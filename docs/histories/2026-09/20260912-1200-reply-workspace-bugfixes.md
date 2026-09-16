## 2026-09-12 12:00 | Task: 修复回复结束折叠与工作空间状态

### Execution Context

- Agent: Codex，主代理；未委派子代理。
- Runtime: Codex desktop，本地仓库。

### User Query

修复三项体验问题：模型最终回复全部结束后收起 Think；修复“分离的 HEAD”误显示；选择目录点击打开后能添加新工作空间。用户先确认折叠时机，再批准实施。

### Changes

- `ThinkingBlock` 接收整轮最终回复完成信号，自动折叠一次并保留完成后的手动展开；不因单段 reasoning 结束而提前折叠。
- `ConversationView` 把 turn 完成信号传给平铺和工具过程中的 Thinking。
- `Composer` 只用已知分支或确认的 detached commit 生成标签；锁定会话不再被当成 detached HEAD。
- `fixed-renderer-ipc` 统一目录选择结果为 `workspaceRoot`，在生产者增加共享返回类型约束。
- 补充组件、真实 IPC handler 回归与独立可交互验收样例，更新两份设计规范。

### Verification

- 修复前：新增用例复现 6 个失败（Thinking 1、错误 HEAD 状态 4、目录返回契约 1），55 个既有/正向测试通过。
- 修复后：5 个文件、96 个测试通过，覆盖 Conversation、Composer、App 工作空间添加、IPC picker、Git context service。
- `pnpm --filter @actspace/desktop typecheck`、`pnpm --filter @actspace/desktop build` 通过；构建仍提示既有大 chunk 警告。
- `pnpm check:docs`、`pnpm check:frontend-theme`、`git diff --check` 通过。
- 真实 Electron：独立临时数据目录中，通过原生目录选择器添加用户指定的非 Git 目录，确认侧栏及新会话出现，刷新后仍存在。未改用户安装版的数据或目标目录内容。
- 浏览器独立样例：浅/深主题下确认正文输出期间 Thinking 展开、回复结束折叠；浅色主题确认手动重新展开、普通目录无 HEAD 标签、正常 main 分支、真正 detached HEAD 显示。
- 未使用真实 Provider 发送请求；安装版未替换，本次源码和本地构建验收不等于已更新安装版。

### Sibling Sweep

- 目录选择器的四个消费位置均读取 `workspaceRoot`，统一生产者即可修复；其他独立文件、Skill、更新源码选择对话框使用各自契约，不受影响。
- Composer 两处标签共用同一分支判断。
- 子 Agent transcript 也消费 `ThinkingBlock`，未传入主会话完成信号，保留原有默认折叠行为。

### Learning

IPC 生产者类型约束与边界测试具有可迁移性且容易踩坑，记录为 [IPC 返回契约速记](../../learnings/2026-09/ipc-return-contracts.md)。
