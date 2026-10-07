# B03 / B08 / B12 — 执行摘要

- 状态：实施中，尚未宣称修复完成。
- [计划](../../exec-plans/active/20261007-desktop-acceptance-b03-b08-b12.md) · [执行过程](execution-process.md)

## 真实桌面复验点

1. B03：Review保持打开，在应用外修改fixture已跟踪文件，变更自动出现；重新读取不引起持续刷新。
2. B08：同一会话先成功搜索，再断开一个已配置provider并搜索，工具不再使用该provider；恢复配置后再次可用。
3. B12：有HEAD的fixture选择新建工作树并首发，实际新目录/分支被创建、会话cwd指向工作树、UI显示工作树；恢复会话后仍保持。创建失败保留草稿，不在原目录执行。

## 验证记录

- 最终完整Desktop：1680通过、2跳过（208个测试文件，1个文件跳过）。
- shared163、client23、session-journal12、agent-service32通过；新增header兼容/fork1通过；Runtime投影/冷重开19通过。
- Desktop typecheck、依赖构建、Electron构建、renderer构建通过。
- IPC channel、renderer bridge、包边界、文档检查、diff whitespace通过。
- [真实桌面逐项复验](computer-use-results.md)仍在执行；自动测试不等同于真实模型和UI链路已通过。

## 实现边界

工作树的执行目录、分支、持久绑定和状态行已经接线；设计文档中的独立“Created worktree”过程块仍属于后续展示目标，本轮未新增。B13及其它候选不在本次修复范围。
