# actspace V1 桌面工作台 UI 计划

## 目标

基于已定稿的前端设计文档，实现 `actspace` 首版桌面工作台 UI，使应用能够展示两栏工作台、消息语法、输入区、Context popup，以及按需展开的右侧文件预览与会话级 diff。

## 范围

- 包含：
  - 默认两栏工作台
  - 左侧会话栏
  - 中间消息区
  - Composer
  - Context popup
  - 右侧文件预览与会话级 diff
- 不包含：
  - 设置页完整实现
  - 多标签页高级管理
  - 拖拽重排
  - 复杂动画系统
  - 多窗口 UI 协同

## 背景

- 相关文档：
  - `docs/design-docs/frontend-ui/index.md`
  - `docs/design-docs/frontend-ui/左侧会话栏规范.md`
  - `docs/design-docs/frontend-ui/中间消息区规范.md`
  - `docs/design-docs/frontend-ui/聊天输入框规范.md`
  - `docs/design-docs/frontend-ui/右侧面板与文件渲染规范.md`
  - `docs/exec-plans/active/actspace-v1-foundation.md`
  - `docs/exec-plans/active/actspace-v1-agent-runtime.md`
  - `docs/exec-plans/active/actspace-v1-integration-and-acceptance.md`

## 布局策略

- 默认态：两栏
  - 左侧会话栏
  - 中间主工作区
- 右侧面板按需展开
- 中间区域优先级最高

## 左侧会话栏

首版只做：
- 新建会话
- 会话列表
- 选中态
- 最近更新时间
- 简短标题

不做：
- 复杂筛选
- 标签系统
- 会话分组
- 批量操作

## 中间消息区

消息区遵循已定稿语法，按执行顺序展示：
- `user message`
- `assistant normal reply`
- `thinking`
- `read/search`
- `edit diff`
- `final reply`

### 组件规则

- `user message`
  - 卡片显示
  - 体现用户输入边界
- `assistant normal reply`
  - 正常文本块
  - 不做重边框
- `thinking`
  - 折叠行
  - 点击展开完整思考内容
  - 不使用左侧竖线
- `read/search`
  - 和 `thinking` 同级
  - 纯文本日志风
  - 不使用图标和卡片
- `edit diff`
  - 唯一边框卡片
  - 顶部包含文件图标、文件名、修改统计
  - 主体显示折叠 unified diff 预览
  - 底部以向下标签表示可展开
- `final reply`
  - 作为本轮收束结果
  - 保持最高可读性

## Composer

必须按已定稿实现：
- 多行输入区域
- mode dropdown
- model dropdown
- attachment preview
- Context popup
- send button

### 已锁细节

- `model` 选择为文字化，无边框
- 不显示语音按钮
- 图片附件直接显示图片
- 文件附件只显示文件名
- Context 为圆形入口

## Context popup

点击 Composer 中的 Context 圆形按钮后打开。

展示：
- 总体使用率
- segmented usage bar
- token 总量
- 分类统计：
  - system prompt
  - tools
  - rules
  - skills
  - mcp
  - subagents
  - conversation

## 右侧面板

只支持：
- `Markdown`
- `HTML`
- `Image`
- `Session Diff`

### 点击联动

- 点击消息中的文件引用：
  - 打开对应文件预览 tab
- 点击 diff 相关入口：
  - 打开会话级 diff
- 不将 Context 放在右侧

## 状态管理

- UI 本地状态使用轻量 store
- 会话列表、消息流、turn result、context snapshot 通过 IPC 获取
- renderer 只消费 `shared` 契约，不自己拼装后端事件 shape

## 风险

- 风险：消息区组件太多，语法实现不一致
  - 缓解方式：严格以现有定稿图和规范为准
- 风险：renderer 状态与 session store 不同步
  - 缓解方式：turn result 和 session reload 统一走 shared contracts
- 风险：右侧面板与消息区职责混乱
  - 缓解方式：消息区只负责过程语法，右侧只负责对象浏览与会话级 diff

## 里程碑

1. 渲染默认两栏布局与左侧会话栏。
2. 渲染中间消息语法与 Composer。
3. 接入 Context popup 和右侧面板。
4. 打通真实 turn 数据渲染。

## 验证方式

- 命令：
  - `pnpm dev`
  - `pnpm typecheck`
- 手工检查：
  - 首屏为两栏布局
  - Composer 与 Context popup 符合定稿图
  - Thinking、Read/Search、Edit diff 渲染符合文档
  - 右侧支持 Markdown / HTML / Image / Session Diff
- 观测检查：
  - 点击联动日志
  - 会话切换与恢复日志

## 进度记录

- [x] 落地默认两栏布局。
- [x] 实现左侧会话栏。
- [x] 实现消息区六类组件。
- [x] 实现 Composer 和 Context popup。
- [x] 实现右侧文件预览与 session diff。
- [x] 接入真实 turn 数据。

## 决策记录

- 2026-05-21：右侧面板不承载 Context，Context 固定属于 Composer 弹窗。
- 2026-05-21：中间消息区先定语法，再补视觉，不追求首版加入复杂状态色。
