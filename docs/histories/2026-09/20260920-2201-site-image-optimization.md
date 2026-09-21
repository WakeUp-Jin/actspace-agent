## [2026-09-20 22:01] | Task: 官网图片压缩、响应式加载与缓存

### Execution Context

- Agent ID: `/root`
- Base Model: GPT-6
- Runtime: Codex desktop

### User Query

> 官网图片加载慢；批准图片压缩、多尺寸适配、Logo 瘦身与哈希资源长期缓存方案。

### Changes Overview

- 移除 Astro passthrough 服务，显式依赖 Sharp 0.35.3，构建时处理图片。
- Screenshot 输出 quality 85 WebP、多宽度 srcset 与布局对应 sizes；首图 eager/high，其余 lazy。显式生成完整 PNG 用于按需放大。
- 页头/页脚 Logo 使用 assets 内的品牌源图，生成 50/100/150px WebP，保持显示样式。
- Netlify 仅对 `/_astro/*` 设置一年 immutable 缓存；HTML 与固定名称 public 文件不受影响。
- 同步 DESIGN、CICD，并记录静态响应式图片的学习要点。
- 保留另一轮同时进行的页头与 CSS 修改；本轮未修改 CSS、导航功能或博客封面。

### Design Intent

线上基线测量显示首图约一秒开始响应、下载总耗时约 22 秒，问题主要在传输阶段。减少初次请求字节数，按显示宽度选择图片，重复访问复用哈希缓存；全尺寸 PNG 保留截图文字细节。

### Files

- `apps/site/astro.config.mjs`、`apps/site/package.json`、`pnpm-lock.yaml`
- `apps/site/src/components/Screenshot.astro`、`FeatureShowcase.astro`、`SiteHeader.astro`、`SiteFooter.astro`
- `apps/site/src/pages/index.astro`、`apps/site/src/assets/brand/actspace-logo.png`
- `netlify.toml`、`apps/site/DESIGN.md`、`docs/CICD.md`
- `docs/learnings/2026-09/20260920-static-responsive-images.md`

### Validation

- 原首图 625098 bytes；WebP 800px 为 26146 bytes，1600px 为 74348 bytes，2880px 为 149960 bytes，分别约 25.5/72.6/146.4 KiB；完整宽度减少 76%。
- Logo 原 185720 bytes；100px WebP 为 1178 bytes，减少 99.4%。
- check:site：56 个文件，0 errors/warnings/hints；test:site：23 项通过。
- 根路径独立生产产物：44 个页面构建通过，全部本地 href/src/srcset 目标存在；首页放大 PNG 解码后像素与原素材完全一致。
- 浏览器桌面 1280px 下首图实际选择 1200px WebP，加载成功；点击打开 2880px PNG 预览，加载正常。390px 手机视口选择 480px WebP，图片加载正常且无横向溢出；已检查桌面和手机截图。
- docs 检查、TOML 缓存范围检查、git diff --check 通过。
- 未新增仅镜像实现的单测；使用现有测试、真实产物链接检查和浏览器验证。
- 同类检查：共享 Screenshot 和全站 Logo 已覆盖；Markdown 资产也进入 Sharp 管线。博客列表原生 img 封面与未使用的旧首页组件不在本轮范围。
- 未提交、推送或发布。线上下载时间、Netlify 缓存响应头与真实移动设备仍待发布后验证；本地字节数改善不等同于已完成线上提速验收。
