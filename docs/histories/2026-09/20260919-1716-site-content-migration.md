# 官网博客搬运与功能文档整理

## 用户诉求

将 Practical 中与 ActSpace 相关的博客原文及图片搬入官网；依据仓库 docs 按模块编写功能文档。缺少截图时写明需要截取的页面和状态。用户另行提供评估文章失效配图的原始文件。

## 实施

新增 4 篇工程博客，保留既有 7 篇；36 张 Practical 图片核对哈希，补入评估原图。迁移仅适配 frontmatter、路径、HTML 图片和折叠容器，保留正文内容及来源仓库。

公开文档扩展为 27 页、7 组，添加 22 处截图说明；按当前源码校准设置入口、只读子任务、凭据存储和浏览器前置条件。历史博客不被当作已交付功能说明。

补全文档欢迎别名的 base-aware 链接转换和图片检查。直接声明现有 Sätteri 处理器依赖，使用其原生 mdast 插件，未切换 Markdown 引擎。

## 主要文件

- apps/site/src/content/blog、src/assets/blog/source
- apps/site/src/content/docs、src/content.config.ts、src/lib/docs-navigation.ts
- apps/site/src/lib/docs-links.mjs、astro.config.mjs、src/lib/test
- apps/site/CONTENT_SOURCES.md、SCREENSHOTS.md、blog-migration.json

## 验证与边界

23 项站点测试、Astro check/build 和仓库文档检查通过。构建 44 页；1,526 个本地链接与资源地址检查无缺失。浏览器确认评估图加载和欢迎页链接。预览服务已在 8780 更新；未提交、推送、部署。真实产品截图待用户按清单补充。

本次命中“可迁移”和“有陷阱”，学习文档见 [Markdown 内容迁移](../../learnings/2026-09/20260919-markdown-content-migration.md)。
