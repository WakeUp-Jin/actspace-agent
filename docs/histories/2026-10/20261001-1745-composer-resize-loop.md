## [2026-10-01 17:45] | Task: 修复缩窄窗口时 Composer 导致白屏

### Execution Context

- Agent: Codex /root
- Runtime: Codex desktop

### 用户诉求

缩窄桌面窗口后整页空白；确认原因后修复。

### 改动与原因

- Composer 原先读取当前布局的控件宽度推算 inline 输入宽度，布局变化反过来改变测量值，可能在 inline / stacked 之间循环。
- 安装版 DevTools 的 React #185 堆栈定位到 measureInput 的状态更新。
- 改为同步临时应用实际 inline 网格测量，并在 finally 恢复。渲染与测量共用布局类，包含 Chat 上下文按钮、gap 和窄屏断点。
- 回归测试模拟当前布局影响测量值，覆盖 Agent、Plan、Chat；显式浏览器 fixture 新增 mode=chat。

### 验证

- 旧代码运行回归用例出现 Maximum update depth exceeded，进程退出码 1；修复后 Composer 60 项测试通过。
- Desktop typecheck、renderer production build、Electron main/preload build 通过。
- A1：浏览器 Agent / Chat 在 480、599、620、760、1000px 之间缩放，输入框保持可见，没有重现白屏。
- A2：浏览器 Chat 长文本保持 stacked，删回短句后内容可见；单测覆盖短文本恢复 inline 和 textarea 节点保持。
- A3：浏览器窄屏 Chat 的模式、模型、上下文占比与发送控件可见。
- 真实 Electron 开发窗口成功恢复已有会话，消息和 Chat 输入框可见；未完成原生窗口拖拽尺寸回归，未替换安装版。
- 浏览器测试期间出现 fixture HMR 重复 createRoot 提示，不是本次更新深度错误。构建保留已有 highlight CSS 和大 chunk 警告。
- 同形扫描：renderer 中 setIsInputMultiline / inlineInputWidth 仅此一处。

### 学习沉淀

命中“可迁移”和“有陷阱”，见 ../../learnings/2026-10/20261001-layout-measurement-feedback.md。

### 文件

- apps/desktop/src/renderer/components/Composer.tsx
- apps/desktop/src/renderer/test/composer.test.tsx
- apps/desktop/src/renderer/test/fixtures/response-annotations-preview.tsx
