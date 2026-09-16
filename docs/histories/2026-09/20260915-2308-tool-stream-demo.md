## 2026-09-15 23:08 | Task: 消息流排版交互预览

### Execution Context
- Agent: Codex / root
- Model: GPT-6
- Runtime: Codex desktop

### 用户诉求
先通过 demo 看工具行、正文与 Thinking 间距的真实渲染，再决定是否修改产品。

### 改动
- 新增独立、离线可打开的消息流 HTML，从现有 Explore demo 添加入口。
- 内嵌当前主题 token 快照，支持浅色、深色、跟随系统。
- 统一过程行 14px / 22px、5px 行间距，正文边界增加留白。
- 独立工具可展开；动作、目标、状态分层，执行元数据放入详情。
- 调整前仅为截图风格示意，页面明确标注，不冒充产品实时渲染。
- 未修改产品源码。本轮为既有视觉规则的原型应用，不新增独立学习文档。

### 文件
- `docs/design-demos/tool-stream-typography-demo.html`
- `docs/design-demos/tool-experience-explore-demo.html`

### 验证
- 浏览器浅深主题、Thinking 展开检查通过；内嵌脚本通过 `node --check`。此预览不证明 Electron 产品实现。
