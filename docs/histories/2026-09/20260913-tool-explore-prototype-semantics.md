## 2026-09-13 | Task: 修正 Explore 原型归组语义

### Execution Context

- Agent: Codex，主代理；未委派子代理。
- Runtime: Codex desktop，本地仓库。

### User Query

用户指出 Cursor 中的 Thought/Think 不是与 Explored 并列的第三类组件，而是 Explored 活动归组中的一环，要求先调整单文件 HTML 原型确认交互。

### Changes

- `docs/design-demos/tool-experience-explore-demo.html`：将 `Read`、`Searched`、`Thought` 统一放入同一个 `Explored` 展开内容。
- 保留真正 Explore/Agent 的独立状态行；点击状态行打开右侧 child Session 详情。
- 增加组内活动行样式，区分工具活动与 Thought 文本；未修改生产组件。

### Verification

- HTML 内嵌脚本语法检查通过。
- `git diff --check` 通过。
- 检查确认不存在独立的 Thinking disclosure。

### Design Intent

`Explored` 表示基础工具活动的自动归组，Thought 是同一时间线中的活动记录；只有真正拥有独立上下文和生命周期的 Explore/Agent 才提升为 child Session，并在右侧面板展示完整详情。
