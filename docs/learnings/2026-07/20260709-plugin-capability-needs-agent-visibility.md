# 插件能力接入要同时完成运行时可用与 Agent 可见

来源：`docs/histories/2026-07/20260709-1739-browser-bridge-agent-context.md`

## 是什么

本机插件“安装成功”和 Agent“会使用这个能力”是两件事。

前者说明二进制、系统权限、外部宿主或浏览器扩展已经可运行；后者说明模型输入里明确出现了能力名称、入口命令、适用场景和失败时的诊断路径。

## 为什么需要

Browser Bridge 已经能安装 `abb`、注册 Native Messaging host，并通过设置页检查连接，但主 Agent 仍会回答“没有浏览器工具”，然后尝试 AppleScript。

根因不是插件不可用，而是 Agent 上下文里没有任何 `abb` 或 Browser Bridge 指令。模型只知道自己有 bash，于是会退回通用 OS 自动化。

## 怎么做

插件能力至少要补两层可见性：

1. **动态 runtime hint**
   - 当能力确实存在时才注入。
   - 内容只放入口路径、适用场景和第一步诊断命令。
   - 不把本机路径硬编码进基础 system prompt。

2. **托管 Skill**
   - 安装成功后生成到 Agent 已扫描的 Skill 目录。
   - 只负责让模型知道“这里有这个能力”。
   - 不复制完整命令手册，命令细节继续从 CLI 的 `help`、`doctor`、`capabilities` 获取。

## 核心要点

- 设置页状态是给人看的，不会自动进入模型上下文。
- Skill 放在插件源码目录里不等于 Agent 能扫描到；必须落到 `.actspace/skills`、`.agents/skills`、userData skills 等已知扫描根。
- CLI-first 不排斥 Skill；关键是 Skill 只能做薄入口，避免和 CLI 命令面形成双重事实来源。
- 动态能力不要写进全局基础 prompt，否则未安装插件的用户会收到不存在的工具指令。

## 常见陷阱

- 只做 IPC / UI / doctor 检查，忘记主 Agent prompt。
- 只写设计文档，没把可执行路径注入当前 turn。
- 把插件源码里的 Skill 当作已安装 Skill。
- 在 Skill 里写满命令细节，后续 CLI 改了但 Skill 没同步。
