# Agent Members 持久成员产品设计

> 文档等级：future-product-design。当前 v2 尚未实现本产品形态；本文只保留产品意图和不变量，不作为当前 Runtime、存储或接口规范。
>
> 含旧实现细节的[完整 v1 稿](../../archive/v1/design-docs/agent-members.md)已归档。当前一次性委派见 [Subagent](agent-subagent-runtime.md)。

## 目标与身份

Member 是可跨 Room 复用的持久 Agent 身份，包含名称、描述、persona、模型和能力配置。身份长期存在不等于持续调用模型；停止、空闲或单次运行失败不删除身份。

配置与运行分离：修改配置影响后续运行，历史回复保留实际使用的配置版本。同一个 Member 在不同 Room 共享身份与配置，但原始对话、工具调用和私有运行历史互相隔离，不自动混入其他 Room 的上下文。

## 产品交互

设置中的成员管理提供列表、详情、Profile 和 Activity，帮助用户识别成员、调整角色与能力、追溯它参加了哪些讨论。Room 选择已有 Member，不另复制一套可变 persona 和模型配置。

Member Workspace 与提醒属于后续方向；首版设想中的 Workspace 只读外壳不参与上下文，也不提供自主后台运行。这里不据此要求当前设置页添加占位入口。

## 边界与验收目标

- 用户能辨认稳定身份、当前配置和一次运行所使用的版本。
- 同一 Member 加入多个 Room 后，原始上下文仍隔离。
- 停止或运行失败后身份与历史仍可查阅。
- 不包含 Human Member、邀请、角色权限、私聊或跨 Room 自动长期记忆。

未来实施需单独评审 v2 Journal 事实、配置版本及权限边界；本文不规定持久化文件布局或新 API。

相关产品稿：[Room](agent-form-room.md)、[Team](agent-form-team.md)。
