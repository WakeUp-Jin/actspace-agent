## [2026-09-19 19:37] | Task: 收紧 Thinking 外部间距

### Execution Context

- Agent: Codex / GPT-6，desktop 本地工作区。

### User Query

收紧 Thinking 折叠及展开后与其他工具的间距，保持正文内部换行和段距；用户自行进行界面验收，关闭 Agent 启动的 5173 服务。

### Changes Overview

- 主消息流不为空白 assistant 文本创建正文容器，避免思考与工具之间叠加两侧 14px 正文间距；保留原始消息及 usage 数据。
- 主消息流与子代理 transcript 中，Thinking 展开后不再附加 8px 详情尾部留白，后续工具使用正常的 5px 间距。其他工具详情规则不变。
- 同步消息流排版规范；增加空白正文不打断过程行、思考正文逐字保留的回归用例。

### Evidence and Validation

- 对照截图对应的本地会话记录与 Host projection：仅含 reasoning 和 tool-call 的 assistant 消息仍投影空正文，原 renderer 给空正文分配布局位置。
- 修复前新用例失败：Thinking 下一条布局行实际为 prose，预期为 process。
- 修复后定向回归用例通过（1 passed，6 skipped），`git diff --check` 通过。
- 完整文件测试及 desktop typecheck 受到现有 jest-dom matcher 注册/类型缺失阻塞；不扩展本次范围修复测试环境。
- 按用户要求停止浏览器/Electron 验收，撤回临时样例修改，停止本次启动的 Vite 服务并确认 5173 无监听；视觉效果由用户验收。
- 本次为局部布局修复，未达到学习文档的两项门槛。

### Files Modified

- `apps/desktop/src/renderer/components/ConversationView.tsx`
- `apps/desktop/src/renderer/styles/tool-result.css`
- `apps/desktop/src/renderer/test/tool-activity-group.test.tsx`
- `docs/design-docs/frontend/front-tool-stream-typography.md`
