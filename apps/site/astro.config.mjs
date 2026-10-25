import sitemap from "@astrojs/sitemap";
import { satteri } from "@astrojs/markdown-satteri";
import { docsLinks } from "./src/lib/docs-links.mjs";
import { proseCjkSpacing, proseStructure } from "./src/lib/markdown/prose-plugins.mjs";
import { actspacePaperTheme } from "./src/lib/markdown/shiki-theme.mjs";
import { defineConfig } from "astro/config";

const site = process.env.SITE_URL ?? "https://wakeup-jin.github.io";
const configuredBase = process.env.SITE_BASE ?? "/actspace-agent";
const base = configuredBase === "/"
  ? "/"
  : `/${configuredBase.replace(/^\/+|\/+$/g, "")}`;

export default defineConfig({
  site,
  base,
  output: "static",
  trailingSlash: "always",
  integrations: [sitemap()],
  markdown: {
    processor: satteri({
      mdastPlugins: [docsLinks({ base })],
      hastPlugins: [proseStructure(), proseCjkSpacing()],
    }),
    shikiConfig: {
      theme: actspacePaperTheme,
      wrap: false,
    },
  },
});
