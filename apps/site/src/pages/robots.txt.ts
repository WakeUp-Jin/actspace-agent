import type { APIRoute } from "astro";
import { sitePath } from "../lib/site-path";

export const prerender = true;

export const GET: APIRoute = ({ site }) => {
  const origin = site ?? new URL("https://wakeup-jin.github.io");
  const sitemap = new URL(sitePath("/sitemap-index.xml"), origin).toString();

  return new Response(`User-agent: *\nAllow: /\n\nSitemap: ${sitemap}\n`, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
};
