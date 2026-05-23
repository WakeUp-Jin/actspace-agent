# 前端设计目录

这个目录专门放 `actspace` 桌面端前端设计资料。

## 当前阶段

- 先做设计大纲。
- 再按组件逐个细化。
- 先让结构稳定，再继续补交互细节和图片。

## 当前基线图

![两栏总览图](image/overview-two-column.png)

## 当前定稿图

![Composer 定稿图](image/composer-final.png)

![Context 定稿图](image/context-popup-final.png)

![Thinking 定稿图](image/thinking-final.png)

![Read / Search 定稿图](image/read-search-final.png)

![左侧会话栏定稿图](image/sidebar-chat-final.png)

![右侧 Markdown 定稿图](image/right-panel-markdown-final.png)

![右侧 HTML 定稿图](image/right-panel-html-final.png)

![右侧 Image 定稿图](image/right-panel-image-final.png)

![右侧 Diff 定稿图](image/right-panel-diff-final.png)

![设置页定稿图](image/settings-page-final.png)

## 目录结构

- `全局视觉语言规范.md`：全局字体、颜色、间距、圆角、阴影和动效 token，约束整体品牌气质。
- `前端设计文档.md`：总目标、布局原则、消息语法、输入区原则。
- `工作台布局与面板交互规范.md`：自研 SplitView、左右面板 resize、左侧 rail 和未来拖动边界。
- `左侧会话栏规范.md`：左侧轻量列表、分区规则与聊天态定稿图。
- `设置页规范.md`：设置态布局、导航与聊天态切换规则。
- `中间消息区规范.md`：消息语法、类型规则、顺序原则。
- `聊天输入框规范.md`：composer、模式、模型、附件、context 弹窗、发送。
- `右侧面板与文件渲染规范.md`：文件预览、会话级 diff、右侧定稿图。
- `prototype/actspace-deepseek-workbench.html`：基于当前规范整理的单文件桌面端高保真原型。
- `image/`：当前阶段的设计图。

## 设计方式

- 先定全局视觉语言，再进入具体组件打磨。
- 先定大纲，再逐个组件细化。
- 每次只把一个组件打透，不一次性堆所有状态。
- 左侧先轻量，右侧先够用，中间聊天区优先级最高。
- 工作台布局底座先把 resize、collapse 和 restore 做稳，再单独规划 tab 拖动与 dock 区域。
- 设置页单独作为页面态处理，不挂在聊天页右侧做叠加面板。

## 图片约定

- 每张图尽量只表达一个明确状态。
- 图片命名建议按顺序编号，例如 `01-overview.png`、`02-composer.png`。
- 图片旁边最好配一份简短说明，写清楚这张图想验证什么。

## 下一步

1. 聊天输入框。
2. 中间消息区。
3. 左侧会话栏。
4. 右侧文件预览。
5. 设置页。
