import sitemap from "@astrojs/sitemap";
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
    shikiConfig: {
      themes: {
        light: "github-light",
        dark: "github-dark",
      },
      wrap: false,
    },
  },
});
