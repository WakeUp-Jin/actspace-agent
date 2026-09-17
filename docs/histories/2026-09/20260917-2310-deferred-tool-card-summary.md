## 2026-09-17 | Task: 保留历史工具摘要与子 Agent 卡片

### Execution Context

- Agent: Codex /root
- Model: GPT-6
- Runtime: Codex desktop

### 用户诉求

历史工具流出现多条“展开完整工具结果”，希望子 Agent 直接展示卡片。只读排查后，用户批准修复。

### 改动与原因

- 大工具详情标记原先在消息类型分发之前替换整个组件，导致 Agent、Explore 和普通工具均丢失可见摘要。
- Agent / Explore 直接使用既有卡片与 child Session 面板入口；普通工具在详情加载前显示已有预览，由原有下拉按钮触发读取，不再显示额外文字按钮；保持消息 renderKey，让加载后结果直接出现在已展开区域。
- 只修改 renderer 消费方式，既有浏览缓存可直接使用，无需改写 Journal 或重建缓存。
- 同步按需加载规范；学习记录命中“可迁移”“有陷阱”“有模式”，补充摘要与详情分离速记。

### 验证

- 新增 6 项回归用例。第一轮 3 项修改前失败；针对反馈再次做 red-green，恢复旧 ToolLogLine 后 2 项失败，恢复修复后通过。
- 定向组件测试 5 文件、45 项通过，覆盖子 Agent 面板、消息区、Bash、Diff 与延迟详情；新增断言检查真实结果内容可见，不再用改变工具路径模拟加载成功。
- Desktop typecheck 与 renderer production build 通过。构建保留既有大 chunk 提示。
- 同类路径检查：唯一通用延迟包装入口位于 ConversationView；IPC 标记与 App 分页合并继续保留详情引用，无需更改。
- Electron 开发版已启动；用户选择自行手动验收，本轮未宣称自动完成真实窗口验收。

### 手动反馈后的补充

首轮只恢复摘要，但通用按钮点击后仍由原组件折叠渲染。已改为原生展开回调，并修正 ResultPreviewBlock 忽略缺省 status 的已存在预览问题；加载期间网页 URL 列表允许尚未提供。具备原生展开入口的 Read/Search/Grep/Glob/Directory、Web、Bash、Diff 均接入相同回调，子 Agent 保留独立面板。

### 关键文件

- `apps/desktop/src/renderer/components/ConversationView.tsx`
- `apps/desktop/src/renderer/test/deferred-tool-message.test.tsx`
- `docs/design-docs/frontend/front-progressive-session-loading.md`
- `docs/learnings/2026-09/20260917-deferred-detail-and-summary.md`
