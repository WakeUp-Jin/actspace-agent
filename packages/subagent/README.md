# Subagent domain group

这里承载 one-shot Subagent、Agent 和 Explore descriptor。子 Agent 使用独立 child Session 和受限 Scope，不支持续跑。

当前两个内置 Preset 都只允许 read_file、list_directory、grep、glob；默认 300 步（最后一步保留无工具总结）、30 分钟总时限。Bash、编辑和子任务审批暂不开放，workspace guard 不变。
