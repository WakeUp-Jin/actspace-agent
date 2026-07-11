# 插件能力接入要同时完成运行时可用与 Agent 可见

来源：`docs/histories/2026-07/20260709-1739-browser-bridge-agent-context.md`

## 是什么

本机插件“安装成功”和 Agent“会使用这个能力”是两件事。

前者说明二进制、系统权限、外部宿主或浏览器扩展已经可运行；后者说明模型输入里明确出现了能力名称、入口命令、适用场景和失败时的诊断路径。

## 为什么需要

Browser Bridge 已经能安装 `abb`、注册 Native Messaging host，并通过设置页检查连接，但主 Agent 仍会回答“没有浏览器工具”，然后尝试 AppleScript。

根因不是插件不可用，而是 Agent 上下文里没有任何 `abb` 或 Browser Bridge 指令。模型只知道自己有 bash，于是会退回通用 OS 自动化。

## 怎么做

插件能力至少要补四层闭环：

1. **工具注册**
   - definition 和 executor 只是源码素材，必须进入 ToolManager 才会出现在模型的 tool definitions 中。
   - 外部能力未安装时不注册，避免暴露必然失败的工具。

2. **运行时连接契约**
   - Agent 与插件必须共享同一 socket 路径、协议版本和 session 生命周期。
   - 长连接要求服务端能在同一连接内持续读帧，不能处理一条请求就关闭。

3. **动态 runtime hint**
   - 当能力确实存在时才注入。
   - 内容描述标准工具选择和失败后的诊断路径。
   - 不把本机路径硬编码进基础 system prompt。

4. **托管 Skill**
   - 安装成功后生成到 Agent 已扫描的 Skill 目录。
   - 对 actspace-agent 来说只承担诊断/修复说明，不能与标准工具争夺正常任务入口。
   - 对其他 Agent 仍可保留 CLI onboarding，但必须明确消费方边界。

## 核心要点

- 设置页状态是给人看的，不会自动进入模型上下文。
- Skill 放在插件源码目录里不等于 Agent 能扫描到；必须落到 `.actspace/skills`、`.agents/skills`、userData skills 等已知扫描根。
- Bridge 产品可以保持 CLI-first；特定宿主消费它时可以用标准工具作为模型入口。两者解决的是不同层级的问题。
- 动态能力不要写进全局基础 prompt，否则未安装插件的用户会收到不存在的工具指令。
- “export 了工具”不等于“模型拥有工具”；验收必须查看真实会话 tool definitions 或 tool_call 日志。
- 长连接能力必须用至少三帧回归测试锁定：session.start、业务请求、session.end。

## 常见陷阱

- 只做 IPC / UI / doctor 检查，忘记主 Agent prompt。
- 只导出 definition/executor，忘记加入 ToolManager 注册表。
- TS 客户端与 Native Host 各自发明默认 socket 路径。
- 客户端设计为长连接，服务端却每个连接只读取一条请求。
- 只写设计文档，没把可执行路径注入当前 turn。
- 把插件源码里的 Skill 当作已安装 Skill。
- 在 Skill 里写满命令细节，后续 CLI 改了但 Skill 没同步。
