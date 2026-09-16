# 聊天 Markdown 与工具结果预览

- 聊天最终回复改用与右侧文件预览一致的 `react-markdown`、`remark-gfm`、`rehype-highlight` 管线。
- 复用受控语言注册表，代码块支持语言高亮并随主题 CSS 变化。
- 工具结果规范与现有 `web_search` 展开组件已完成审查；read/grep/glob 的结果字段与右侧文件打开动作需要单独的契约扩展轮次。
- 验证：桌面端 typecheck 通过；`markdown-prose.test.tsx` 定向测试通过。全量测试存在一个既有会话创建断言超时。
- Main preview builder 现在为完成态 read/list/grep/glob 提取最多 8 行 `resultPreview`，renderer 使用 Chevron 展开。
- 验证：shared build、desktop typecheck、Markdown 与工具分组定向测试通过。
