## [2026-09-22 22:30] | Task: 官网图片加载骨架与博客封面优化

### 用户诉求

官网图片加载等待明显，希望首页截图、博客封面和正文图片显示加载骨架，并在不修改原始图片的前提下改善博客列表加载速度。

### 主要改动

- 为首页产品截图、博客列表封面和文档/博客正文图片增加统一加载、完成与失败状态。
- 骨架沿用站点语义颜色，保留图片固有比例；减少动态效果时关闭动画，无 JavaScript 时图片正常显示。
- 博客封面由原始 PNG 构建 480/800/1254px、quality 90 的响应式 WebP；不修改 PNG 母版，也不改变正文图片质量。
- 图片加载失败时停止骨架动画并显示明确提示；缓存图片通过 `complete` 与 `naturalWidth` 直接进入完成状态。

### 受影响文件

- `apps/site/src/components/Screenshot.astro`
- `apps/site/src/components/MediaViewer.astro`
- `apps/site/src/pages/blog/index.astro`
- `apps/site/src/scripts/image-loading.ts`
- `apps/site/src/styles/media.css`
- `apps/site/DESIGN.md`
