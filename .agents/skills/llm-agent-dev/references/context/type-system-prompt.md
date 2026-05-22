# 系统提示词上下文

系统提示词是七种上下文类型之一，定义 LLM 的身份、能力边界和行为规范。它是上下文中最早注入、优先级最高的部分。

## 分段架构（PromptSegment）

系统提示词不是一整块文本，而是由多个有序片段（segment）组合而成。每个 segment 独立管理：

- `id`：唯一标识（如 `core`、`skill_catalog`、`tool_descriptions`）
- `content`：提示词文本内容
- `priority`：优先级数值，越高越靠前。核心指令 segment 通常设为最高（如 100）
- `enabled`：启用/禁用开关

组装时按优先级降序排列，只拼接 enabled 为 true 的 segment，最终合并为一段完整的系统提示词文本。

### 核心指令 segment

每个 Agent 都有一个核心指令 segment（priority=100），定义基本身份和行为规范。这个 segment 始终存在、始终启用、始终排在最前面。其他所有 segment 都在它之后注入。

## 动态注册

系统提示词不是静态的——运行时其他模块可以向其中注入内容：

**register_segment(segment)**：注册新片段。如果 id 已存在则替换。典型使用场景：
- Skill 系统扫描发现 Skill 后，将 Skill 目录注入为一个 segment
- 工具管理模块将可用工具描述注入为一个 segment
- Agent 切换模式时注入模式专属的行为规范

**update_segment(id, content)**：更新已有 segment 的内容，不改变优先级和启用状态。

**remove_segment(id)**：移除指定 segment。

**enable_segment(id) / disable_segment(id)**：控制 segment 是否参与组装，而不删除它。适用于需要临时关闭某些指令的场景。

## 设计要点

### 优先级裁剪

当上下文窗口紧张时，低优先级 segment 可以被裁剪以释放 Token 空间。裁剪顺序：

1. 工具描述、Skill 目录等动态内容（priority 较低）先裁剪
2. 行为规范、格式要求等（priority 中等）次之
3. 核心身份指令（priority 最高）永远不裁剪

系统提示词属于不可压缩的上下文——整体不参与 LLM 摘要压缩（见 `mgmt-compression.md`），但内部可以通过优先级裁剪来缩减体积。

### 渠道适配

不同渠道（CLI / Web / API）可以使用不同的核心指令模板。通过在初始化时传入不同的 core_prompt 实现，segment 架构本身不需要改变。

### 输出格式

format() 返回 ContextParts，其中 systemParts 包含一个 SystemPart：
- tag: `system_prompt`
- content: 所有启用的 segment 按优先级拼接的完整文本

这个 SystemPart 在 ContextManager 中与其他模块的 SystemPart（如长期记忆、压缩摘要）一起渲染为 XML 标签，最终合并为一条 system message。

参考代码: `examples/system-prompt.ts`

## 注意事项

- segment 的 id 必须唯一，重复注册会替换已有内容
- 核心指令 segment 不应被 remove，设计上应做保护
- 动态内容（工具描述、Skill 目录）的 priority 应低于静态规范，确保窗口紧张时优先裁剪动态内容
- segment 内容变化后需要重新估算 Token，ContextManager 在组装时会重新计算
