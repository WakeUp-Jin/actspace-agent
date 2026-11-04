# 静态内容站的构建契约：数据、路径、资源、主题

合并自：静态内容站需要显式构建契约（原 HTML，已转 md）、Astro 预渲染读取仓库文件时路径基准属于构建产物、Astro 子路径部署中的 Markdown 图片应进入源码资产管线。

来源：`docs/histories/2026-07/20260727-2300-implement-actspace-site.md`、`docs/histories/2026-07/20260729-1140-public-roadmap-page.md`、[补充 ActSpace Agent 工程博客](../../histories/2026-07/20260728-1858-add-agent-blog-articles.md)

静态生成不代表运行时简单，复杂度只是提前到 build time。站点进入 monorepo、读仓库 Markdown、部署到 project Pages、支持手动主题后，容易出错的不是卡片 CSS，而是四个边界没有显式契约：

| 边界 | 要回答的问题 |
|---|---|
| 数据 | 内容从哪来、怎样验证、失败是否阻止发布 |
| 路径 | 源码位置、构建 cwd、站点 base、最终 URL 如何对应 |
| 资源 | 图片固有尺寸、CSS 响应式尺寸、部署资源路径谁负责 |
| 主题 | 语义 token、第三方代码高亮、system 模式是否用同一状态 |

## 1. 数据：用 AST 把 Markdown 变成可验证数据源

正则不适合承担 GFM 表格、inline code、强调、链接和源码行号。流程：`remark-parse + remark-gfm` → 选 `heading(depth=2, YYYY-MM)` → 选表头精确匹配的 `table` → 校验日期/月份/必填单元格 → sanitize inline Markdown → `ReleaseEntry[]` → 静态页面。解析错误应让构建失败：更新页静默跳过一行，发布仍显示成功，用户看到的是旧数据或缺失数据；内容 schema 是产品契约，违反它与 TypeScript 编译错误无本质区别，且每行要有明确错误位置。静态站也会处理不可信 Markdown：只渲染需要的 inline 节点并 sanitize，比开启 raw HTML 后依赖作者自律可靠。

## 2. 路径：monorepo 有三种“根”

- 仓库根（lockfile、release、workspace scripts）：Action 若从 package 目录运行会丢根 lockfile。
- 站点根（Astro config、src、public、dist）：输出路径相对站点，依赖安装仍在仓库根。
- 部署根（`/repo-name/`）：开发环境 `/` 正常不代表 project Pages 链接正常。

做法：从仓库根安装并执行 workspace 命令；让构建工具显式输出站点目录；内部 URL 经同一个 base-path helper；读跨包文件从 `import.meta.url` 推导而不是 `process.cwd()`。部署 Action 的 `path` 往往同时决定工作目录和 lockfile 探测位置，需看 Action 源码确认 build command 与 artifact path 可独立配置。

**预渲染里 `import.meta.url` 指向构建产物**：Astro 预渲染执行的是 Vite 生成的模块（`apps/site/dist/.prerender/chunks/*.mjs`），不是原始 TypeScript，`path.resolve(dirname, "../../../../docs/roadmap.md")` 源码检查通过、`astro build` 却读错位置。把数据源路径解析放进目录深度明确的独立模块（`apps/site/src/lib/roadmap/source-path.ts`），层级要在源码测试和构建产物两处都能回到仓库根。`astro check` 只验证类型和模板，纯 parser 单测不执行 `readFile`，所以至少要“真实数据源加载测试（`loadRoadmap()` 返回非空）+ production build（`pnpm test:site && pnpm build:site`）”两层。

## 3. 资源：子路径部署时，文章图片进源码资产管线

部署在 `https://example.com/actspace-agent/` 时，Markdown 里 `/images/x.png` 是域名根路径，浏览器请求 `https://example.com/images/x.png`，而文件在 `/actspace-agent/images/...`；`base` 是构建与路由配置，不重写已以 `/` 开头的 URL。也不能只改成详情页相对 URL：Content Collections 的 `.md` 里本地相对图片被当作源码资产导入，相对 Markdown 文件所在目录查找，目录不存在会 `ImageNotFound`。

做法：图片放 `src/assets/blog/source/`，Markdown 写 `![架构图](../../assets/blog/source/architecture.png)`，构建后得 `/actspace-agent/_astro/architecture.<hash>.png`，根路径部署也自然是 `/_astro/...`，文章里不硬编码仓库名。`public/` 留给 favicon、固定下载文件和必须保持原 URL 的资源。

Sharp：严格依赖布局（pnpm）下没直接安装 Sharp 会 `MissingSharp`；只需复制原图、补尺寸、生成哈希 URL 时可配 `image: { service: passthroughImageService() }`（不缩放、不压缩、不引入原生依赖），需要响应式/压缩时再装 Sharp 切回默认（当前 `apps/site/astro.config.mjs` 未启用 passthrough，作为取舍参考）。

图片尺寸：HTML 的 `width/height` 防布局抖动，但响应式 CSS 只改 width 时 height 仍保留固有像素值，全局 `img { height: auto }` 是关键配套。验证：构建 HTML 的最终 `src`、浏览器中 `naturalWidth`；懒加载图片刚打开时 `complete: false, naturalWidth: 0`，滚动触发后再判断；资产目录/配置迁移后重启 dev server 再验收。

## 4. 主题：状态要传播到第三方产物

站点用 `html[data-theme]` 手动切换，而代码高亮器默认只生成 `prefers-color-scheme` CSS，两者各自正确、组合后出现“页面已变暗、代码仍浅色 token”的低对比度：

```css
html[data-theme="dark"] .astro-code span { color: var(--shiki-dark) !important; }
@media (prefers-color-scheme: dark) {
  html[data-theme="system"] .astro-code span { color: var(--shiki-dark) !important; }
}
```

任何有独立主题状态的第三方输出（图表、编辑器、代码高亮、嵌入组件）都要显式接入产品主题。

## 5. 视觉验收

类型检查与静态构建证明不了 Hero 没遮挡：至少在一个桌面、一个移动 viewport 检查真实 production preview，验证滚动宽度、主题和交互状态。

## 自检

1. CI 从任意工作目录启动，内容解析器还能找到唯一事实源吗？预渲染产物里的路径还对吗？
2. 站点从根域迁到 project Pages 后，canonical、图片、robots、内部链接仍一致吗？
3. 手动选 dark 时，所有第三方渲染产物真的切到 dark 吗？
4. 构建 HTML 里的图片 URL 自动带当前 `base` 吗？
