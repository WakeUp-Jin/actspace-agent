import { fileURLToPath } from "node:url";

/**
 * Resolve docs links at build time; the welcome document also renders at /docs/.
 * @returns {NonNullable<import('@astrojs/markdown-satteri').SatteriProcessorOptions['mdastPlugins']>[number]}
 */
export function docsLinks({ base = "/" } = {}) {
  const prefix = base === "/" ? "" : `/${base.replace(/^\/+|\/+$/g, "")}`;
  /** @type {NonNullable<import('@astrojs/markdown-satteri').SatteriProcessorOptions['mdastPlugins']>[number]} */
  const plugin = {
    name: "site-docs-links",
    link(node, ctx) {
      if (!ctx.fileURL || !/^\.{1,2}\//.test(node.url)) return;
      const path = fileURLToPath(ctx.fileURL).replaceAll("\\", "/");
      const marker = "/src/content/docs/";
      if (!path.includes(marker)) return;
      const slug = path.split(marker)[1].replace(/\.(md|mdx)$/, "");
      const url = new URL(node.url, `https://site.invalid${prefix}/docs/${slug}/`);
      ctx.setProperty(node, "url", `${url.pathname}${url.search}${url.hash}`);
    },
  };
  return plugin;
}
