# Astro 子路径部署中的 Markdown 图片应该进入源码资产管线

## 核心结论

当 Astro 站点通过 `base` 部署到 GitHub Pages 子路径时，Markdown 中的 `/images/example.png` 是浏览器域名根路径，不会自动变成 `/<base>/images/example.png`。对于随文章版本管理的本地图片，更稳定的做法是把图片放进 `src/assets`，再从 Markdown 以源码相对路径引用，让 Astro 在开发和构建阶段统一生成带 `base` 的 URL。

## 为什么 `/images/...` 会失效

假设站点部署地址是：

```text
https://example.com/actspace-agent/
```

Markdown 写成：

```md
![架构图](/images/blog/architecture.png)
```

浏览器会请求：

```text
https://example.com/images/blog/architecture.png
```

而实际文件位于：

```text
https://example.com/actspace-agent/images/blog/architecture.png
```

`base` 是 Astro 的构建与路由配置，不会重写普通 HTML 中已经以 `/` 开头的 URL。

## 为什么不能只改成详情页相对 URL

在 Astro Content Collections 的 `.md` 文件中，`../../images/...` 不一定被当成浏览器相对 URL。Markdown 处理器会把本地相对图片识别为源码资产导入，并相对于 Markdown 文件所在目录查找。目录不存在时，构建会直接抛出 `ImageNotFound`。

因此应该让路径真的指向源码文件：

```text
packages/site/
├── src/
│   ├── assets/blog/source/architecture.png
│   └── content/blog/article.md
```

```md
![架构图](../../assets/blog/source/architecture.png)
```

构建后 Astro 会输出类似：

```text
/actspace-agent/_astro/architecture.<hash>.png
```

这样同一份源码在根路径部署时也会自然生成 `/_astro/...`，无需在文章里硬编码仓库名。

## Sharp 与 passthrough 的取舍

Astro 本地图片管线默认使用 Sharp。pnpm 等严格依赖布局下，如果项目没有直接安装 Sharp，构建可能在生成图片阶段报 `MissingSharp`。

如果当前目标只是复制原图、补齐尺寸和生成带哈希 URL，而不需要缩放、格式转换或质量压缩，可以配置官方 passthrough service：

```js
import { defineConfig, passthroughImageService } from "astro/config";

export default defineConfig({
  image: {
    service: passthroughImageService(),
  },
});
```

它仍然保留源码资产管线和部署路径处理，但不会引入 Sharp 原生依赖，也不会改变图片字节大小。未来确实需要响应式图片或压缩时，再显式安装 Sharp 并切回默认服务。

## 常见陷阱

- `public/` 适合 favicon、固定下载文件和必须保持原始 URL 的资源；文章内源码图片更适合 `src/assets`。
- 不要把 `/actspace-agent` 写进 Markdown。仓库名、预览路径和正式域名都可能变化。
- 开发服务器在 Astro config 或资产目录迁移后可能仍持有旧内容缓存；构建通过后仍应重启 dev server 再做浏览器验收。
- 懒加载图片在页面刚打开时可能是 `complete: false`、`naturalWidth: 0`；滚动触发加载后再判断是否损坏。
- 只验证“文件存在”不够，还要验证构建 HTML 的最终 `src` 和浏览器中的 `naturalWidth`。

## 自检清单

1. Markdown 图片是否使用指向 `src/assets` 的真实源码相对路径？
2. 构建 HTML 中的图片 URL 是否自动包含当前 `base`？
3. 浏览器触发懒加载后，正文图片是否全部 `complete: true` 且 `naturalWidth > 0`？
4. 如果没有图片变换需求，是否避免了不必要的 Sharp 依赖？

来源变更：[补充 ActSpace Agent 工程博客](../../histories/2026-07/20260728-1858-add-agent-blog-articles.md)
