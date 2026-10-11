# B03 / B08 / B12 — 执行摘要

- 状态：三项修复、真实桌面定向复验及恢复收尾完成。
- [计划](../../exec-plans/completed/20261007-desktop-acceptance-b03-b08-b12.md) · [执行过程](execution-process.md)

## 真实桌面复验点

1. B03：Review保持打开，在应用外修改fixture已跟踪文件，变更自动出现；重新读取不引起持续刷新。
2. B08：同一会话先成功搜索，再断开一个已配置provider并搜索，工具不再使用该provider；恢复配置后再次可用。
3. B12：有HEAD的fixture选择新建工作树并首发，实际新目录/分支被创建、会话cwd指向工作树、UI显示工作树；恢复会话后仍保持。创建失败保留草稿，不在原目录执行。

## 验证记录

- 最终完整Desktop：1680通过、2跳过（208个测试文件，1个文件跳过）。
- shared163、client23、session-journal12、agent-service32通过；新增header兼容/fork1通过；Runtime投影/冷重开19通过。
- Desktop typecheck、依赖构建、Electron构建、renderer构建通过。
- IPC channel、renderer bridge、包边界、文档检查、diff whitespace通过。
- [真实桌面逐项复验](computer-use-results.md)：B03同面板外部追加/移除自动更新；B08同会话不重启断开智谱后真实搜索仅Tavily，原配置恢复；B12实际首发创建工作树、切换返回、正常重启后再次工具pwd/branch均保持同目录。

## 真实运行时辅证

- [脱敏运行时记录](runtime-evidence.json)：B08实际工具seq74为tavily,zhipu，断开后seq381仅tavily且成功；不是模型回复中的provider复述。
- B12会话56149031-44dd-4907-b1fe-90e65e08af6d，首发seq89与重启后seq681的bash均在工作树41969623运行，原fixture仍main。
- 原搜索配置仅恢复zhipu加密单条，其它值未覆盖；Review标记均已移除，原文件85字节及已有变更保留。

- 仅归档三个精确验收会话；新建测试工作树保留作证据。最终真实UI为Light、默认DeepSeek、搜索2/4，应用留在可用空新建页。

## 实现边界

工作树的执行目录、分支、持久绑定和状态行已经接线；设计文档中的独立“Created worktree”过程块仍属于后续展示目标，本轮未新增。B13及其它候选不在本次修复范围。
