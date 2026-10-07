---
name: actspace-plugin-development
description: 用户明确要求新增或修改 Agent 工具时使用。通过 harness_inspect 与 plugin_manager 构建会话局部工具版本。普通任务失败不自动启动自进化。
---

# ActSpace 插件开发

先调用 harness_inspect 查询实际工具、来源 Run、会话选择和支持的开发接口。用户没有明确修改意图时，不进入开发流程。

1. plugin_manager action=create，提供 purpose（原始用户需求）和 toolName；修改时提供 entryId。使用返回的 workspaceId 和真实目录，不编辑运行产物。
2. 用现有文件工具修改 implementation.ts、tool.json。遵守 references/contract.md。首次仅支持 JSON 输入/输出工具；没有源码的插件不能假装可修改。
3. action=build 固定源码并编译。按诊断修复；改完必须重新 build。不要安装 npm 包或编写安装脚本。
4. action=prepare 可能执行初始化，须经过 Host 执行许可。构建或挂载失败不能宣称成功。
5. action=apply 请求正式启用；Host 独立核验具体候选授权。看到 bound 才说明“后续消息可使用”。当前 Run 仍使用旧 Harness，不在当前 Run 调用刚新增的工具。
6. 向用户说明改了什么、检查结果，以及下一条消息可以如何使用。不要自动续跑，不承诺已经通过 V2 独立沙箱评估。

status 可恢复查询；discard 丢弃未启用候选；rollback 需要指定历史 digest 并重新授权。Actor 不在本版实现。
