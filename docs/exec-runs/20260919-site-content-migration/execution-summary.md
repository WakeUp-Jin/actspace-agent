# 官网内容迁移执行摘要

2026-09-19 实现完成。未提交、推送或部署；Practical 源文件保留。已有网站视觉修改保持原状。

## 交付

- 博客新增 Bash 实现、Grep/Glob、Write/Edit、工具调度与权限 4 篇，保留原文；网站合计 11 篇。
- 新增 14 张 Practical 图片，核对既有 22 张，补回用户提供的评估图，共 37 张正文配图使用本地资源。
- 功能文档按 7 组整理为 27 页；现有 9 个 slug 保留。
- 22 处截图占位写明操作页面与状态，汇总到 apps/site/SCREENSHOTS.md。
- 页级事实映射见 apps/site/CONTENT_SOURCES.md；博客原文和图片哈希见 apps/site/blog-migration.json。
- 文档构建链接处理兼容欢迎页别名和部署 base，使用 Astro 7 原生 Sätteri 插件。

## 验证结果

- pnpm test:site：23 项通过，涵盖图片语法、资源存在性、内容哈希与三种部署 base 的真实 Markdown 渲染。
- pnpm check:site：0 errors / 0 warnings / 0 hints。
- pnpm build:site：44 页构建成功；37 张正文图片进入 Astro 资源管线。
- 构建产物 1,526 个本地 href/src 检查无缺失；9 篇搬运文章正文摘要一致。
- 27 页中文标点检查通过，仓库文档检查通过。
- 本地预览服务在 8780 持续运行，已重启加载新配置。浏览器确认评估图加载成功、欢迎页链接正确，Grep/Glob 折叠代码存在。

原文代码围栏中 JSON、JavaScript、TypeScript、Plain、Go 等大小写标签触发高亮器回退为纯文本的提示；为遵守保留原文要求，未改写文章标签或代码。构建正常完成。

## 人工补图与验收

1. 按 apps/site/SCREENSHOTS.md 的 22 项说明截取真实桌面页面，保存到 src/assets/docs，再替换对应文档 blockquote 占位。
2. 打开 /actspace-agent/docs/，从欢迎页正文进入快速开始；检查 7 组导航、移动端折叠目录和本页目录。
3. 打开博客列表，检查 11 篇文章、分类多选与排序；进入新增文章，对照原稿查看正文和配图。
4. 在评估文章“三种输入核心”之后确认架构图，检查原文与上下文关系。

本站检查不构成真实 Provider、Chrome Native Host、MiniMax、Electron 打包版或 GitHub Pages 线上验收。截图仍待用户手动补充。
