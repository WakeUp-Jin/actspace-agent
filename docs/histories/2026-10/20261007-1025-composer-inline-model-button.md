## 2026-10-07 10:25 | Task: 单行输入框把模型按钮放回发送按钮旁

### 执行上下文

- Agent：Claude Code 主智能体。
- Base Model：Claude Opus 5.5。
- Runtime：Claude Code CLI，本机仓库，`main` 分支。
- 状态：完成，未提交；Electron 实机待看。

### 用户诉求

> 输入框里的模型选择器不应该放进 `+` 里。单行时应该放在右边，发送按钮旁边。

### 主要改动

- **单行布局**：inline grid 从 `plus (mode) input send` 改成 `plus (mode) input model send`，模型按钮不再在单行时隐藏，贴在发送按钮左边。多行布局不变。
- **`+` 面板**：去掉「模型 ›」入口、模型下钻页、「{模型} 选项」页和主页搜索里的模型分组；搜索框占位改成「搜索 Skills、文件…」。模型和 Thinking / 推理强度只在模型按钮的菜单里选。
- **ModelPicker**：`filterModelGroups`、`modelListEmptyText`、`showModelDetail`、`ModelOptionsBody` 原来为面板共用才导出，现在改回模块内部函数；`ModelOptionsBody` 去掉只给面板用的 `showLabel`。
- **测试与规范**：更新 composer、composer-palette、chat-presentation-recovery 的断言，删掉面板里模型相关的用例；`front-聊天输入框规范.md` 同步。
- **验证**：desktop typecheck 通过；renderer 用例 124 个文件全部通过；`check:frontend-tokens` 通过。

### 设计动机

模型是每轮都要看的执行配置，单行时藏进 `+` 面板要多点两下才看得到当前模型，也和 `+`「添加上下文或工具」的定位不符。放在发送按钮旁边，单行和多行都能直接看到、直接切换。

### 文件

- `apps/desktop/src/renderer/components/composer/ComposerInput.tsx`
- `apps/desktop/src/renderer/components/composer/ComposerToolbar.tsx`
- `apps/desktop/src/renderer/components/composer/ComposerPalette.tsx`
- `apps/desktop/src/renderer/components/composer/ModelPicker.tsx`
- `apps/desktop/src/renderer/components/Composer.tsx`
- `apps/desktop/src/renderer/test/composer.test.tsx`
- `apps/desktop/src/renderer/test/composer-palette.test.tsx`
- `apps/desktop/src/renderer/test/chat-presentation-recovery.test.tsx`
- `docs/design-docs/frontend/front-聊天输入框规范.md`
