import sitemap from "@astrojs/sitemap";
import { satteri } from "@astrojs/markdown-satteri";
import { docsLinks } from "./src/lib/docs-links.mjs";
import { defineConfig, passthroughImageService } from "astro/config";

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
  image: {
    service: passthroughImageService(),
  },
  integrations: [sitemap()],
  markdown: {
    processor: satteri({ mdastPlugins: [docsLinks({ base })] }),
    shikiConfig: {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
      wrap: false,
    },
  },
});
