# Chat Markdown 与工具结果展开

状态：实施中。

目标：让聊天最终回复复用现有 GFM/highlight.js 渲染；让工具结果通过稳定的 typed preview 支持摘要与展开。

本轮范围：先完成聊天 Markdown 渲染链路；工具结果沿用现有 web_search 展开组件，后续为 read/grep/glob 增加 resultPreview 契约与右侧文件动作。验证使用 renderer 单测、typecheck、build，并检查浅深主题。

不做：不改变工具执行语义、权限边界、原始模型输出和持久化事实。
