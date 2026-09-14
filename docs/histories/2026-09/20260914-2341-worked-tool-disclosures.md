## [2026-09-14 23:41] | Task: 简化工具流与回合结束折叠

### Execution Context

- Agent: Codex / root
- Runtime: Codex desktop

### 用户诉求

去掉 Explored 分组与 Open file 按钮，减少工具箭头。最终回复完成后，整个过程收起为 Worked，再打开时 Thinking 和所有工具详情也必须保持收起。

### 改动

- ConversationView 将 Thinking、工具、过程旁白与子 Agent 入口统一纳入一个 ToolActivityGroup；最终回复保留在组外。
- 删除退役的 ExploredActivityGroup，运行中平铺过程，完成时卸载详情并重置展开状态。失败 Bash 在完成后的重新挂载中也默认收起。
- Read 文件文字打开右侧文件视图，独立箭头展开结果预览，移除 Open file 按钮。
- Thinking 箭头仅在悬浮/键盘聚焦时显示；普通工具详情箭头默认隐藏，悬浮/聚焦或展开时显示。编辑记录保留箭头，子 Agent 右侧视图入口移除箭头。
- 同步两份前端设计规范、状态转换测试和显式浏览器验收 fixture。

### 验证

- 相关组件 54 项测试通过，真实流读取/恢复 2 项回归通过。
- Desktop typecheck、renderer production build、check:frontend-theme、check:docs 和 git diff --check 通过。
- 浏览器浅色样例确认运行时平铺、正文输出时保留详情、回复完成后外层 Worked 收起。
- 全量测试未全绿：Provider 测试 mock 缺少 DeepSeekFileUploader 导出；旧 Write 流测试仍断言已退役的 is-streaming 卡片及不带统计的文字；工作区选择器断言与当前实现不符。这些不属于此次 UI 修改范围。
- 深色与真实 Electron 最终视觉验收待补。

### 学习沉淀

命中可迁移、陷阱和模式：父层隐藏与子组件卸载对展开状态的影响不同，新增学习文档 disclosure-state-lifetime，并标注旧 Explored 分组教程为历史方案。

### 提交前隔离验证

从提交前 HEAD 创建隔离检出，仅整理本次 UI 补丁及必要的 resultPreview 类型、Read 打开链路；未纳入其他 Markdown、Provider、设置及子 Agent 卡片重设计改动。使用隔离源码构建 workspace 依赖后，40 项相关测试、Desktop typecheck、renderer build、主题检查与文档检查通过。
