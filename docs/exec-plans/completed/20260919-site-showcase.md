# 官网展示与截图占位

状态：已完成页面实现、截图占位与验证。真实产品截图待用户提供，接图后复核清晰度与裁切。执行结果见 ../../exec-runs/20260919-site-showcase/execution-summary.md。

## 范围与顺序

1. 依据 apps/site/SHOWCASE_PLAN.md 与 SCREENSHOTS.md，更新 DESIGN.md；首页六组展示消费统一截图容器，首屏及文档不再使用过时产品截图。
2. 新增首页功能数据、响应式展示 CSS 与滚动增强脚本。桌面 1100px 起 sticky 图文联动，窄屏及无 JS 顺序图文；焦点、resize、reduced-motion 可用。
3. 将 35 个文件名在相关文档操作段落中落成独立截图占位，普通引用使用语义浅紫 token；保留已有正文与博客原文。
4. 运行 site check / test / build、check:docs；查看首页、文档、博客在桌面与窄屏的页面，验证滚动切换和无脚本回退。

## 文件边界

apps/site/src/pages/index.astro、components、scripts、styles、lib、content/docs、assets/screenshots，以及 site 设计和截图说明；不改桌面端，不进行产品截图，不替代真实能力演示。

## 接图与回退

按固定 PNG 文件名接图。缺图只呈现说明与文件名，不请求不存在的图片。首页图片优先共用组件；文档占位保留 data-screenshot 文件名，接图时转为对应真实图。回退本任务组件、样式和占位段即可恢复布局，不涉及用户数据或博客正文。

## 验证与边界

验证命令：pnpm check:site、pnpm test:site、pnpm build:site、pnpm check:docs。浏览器检查 1440px、1000px、390px 无横向溢出、活动图切换、键盘焦点、减少动效和无脚本可读。真实产品素材由用户随后提供；发布及真实产品截图不在本轮范围。
